/**
 * Room as Code (RaC) v1.0 - Logic & State Machine Engine (Extended for Containers, OneWay & Director)
 * 자물쇠(Gate), 은닉함(Container), 일방통행(OneWay), 가상 연출자(Director)를 관장하는 순수 FSM 상태 머신
 */

export class LogicRunner {
  constructor(racData) {
    this.theme = racData.theme;
    this.spaces = new Map();
    this.lights = new Map();
    this.doors = new Map();
    this.gates = new Map();
    this.containers = new Map();
    this.problems = new Map();
    this.clues = new Map();
    this.items = new Map();
    this.interactions = [];
    this.activatedTargets = new Set();
    this.player = {
      inventory: new Set(),
      currentSpaceId: (racData.spaces && racData.spaces[0]) ? racData.spaces[0].id : null
    };
    this.passages = [];
    this.director = {
      timeLimitMinutes: (racData.director && racData.director.timeLimitMinutes) || 60,
      tensionLevel: (racData.director && racData.director.tensionLevel) || 1,
      panicThresholdFailures: (racData.director && racData.director.panicThresholdFailures) || 2,
      totalFailures: 0
    };

    this._initialize(racData);
  }

  _initialize(data) {
    // 1. Spaces & Lights 등록
    for (const space of data.spaces) {
      this.spaces.set(space.id, { ...space, status: "Unvisited" });
      if (Array.isArray(space.lights)) {
        for (const light of space.lights) {
          this.lights.set(light.id, {
            ...light,
            spaceId: space.id,
            isOn: light.initiallyOn !== false
          });
        }
      }
    }
    if (data.spaces.length > 0) {
      this.spaces.get(data.spaces[0].id).status = "Active";
    }

    // 2. Passages & Doors 등록
    for (const pass of data.passages) {
      this.passages.push(pass);
      if (pass.door) {
        this.doors.set(pass.door.id, {
          id: pass.door.id,
          passageId: pass.id,
          isLocked: pass.door.isLocked !== undefined ? pass.door.isLocked : true,
          type: pass.door.type
        });
      }
    }

    // 3. Clues 등록
    for (const clue of data.logicGraph.clues) {
      this.clues.set(clue.id, { ...clue, visibility: "Hidden" });
    }
    // 첫 번째 단서는 시작 시 공개(Revealed)
    if (data.logicGraph.clues.length > 0) {
      this.clues.get(data.logicGraph.clues[0].id).visibility = "Revealed";
    }

    // 4. Problems 등록
    for (const prob of data.logicGraph.problems) {
      this.problems.set(prob.id, { ...prob, state: "Discovered" });
    }

    // 5. Containers (은닉함/금고) 등록
    if (data.logicGraph.containers) {
      for (const cont of data.logicGraph.containers) {
        this.containers.set(cont.id, {
          ...cont,
          isOpen: cont.isOpen || false
        });
      }
    }

    // 6. Gates 등록
    for (const gate of data.logicGraph.gates) {
      this.gates.set(gate.id, {
        ...gate,
        isOpen: gate.isOpen || false,
        failureCount: 0
      });
    }

    // 7. Items & Interactions 등록 (자유로운 정체성 + 닫힌 4원자 효과)
    if (data.logicGraph.items) {
      for (const item of data.logicGraph.items) {
        this.items.set(item.id, {
          consumable: true,
          tags: [],
          ...item
        });
      }
    }
    if (data.logicGraph.interactions) {
      this.interactions = data.logicGraph.interactions.map(ix => ({ ...ix, executed: false }));
    }
  }

  // ==================== Player Inventory & Item Interactions ====================

  collectItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) throw new Error(`존재하지 않는 아이템 ID입니다: ${itemId}`);
    this.player.inventory.add(itemId);
    return item;
  }

  hasItem(itemId) {
    return this.player.inventory.has(itemId);
  }

  getInventory() {
    return Array.from(this.player.inventory).map(id => this.items.get(id)).filter(Boolean);
  }

  isActivated(targetId) {
    return this.activatedTargets.has(targetId);
  }

  /**
   * 아이템을 대상(Gate/Door/Prop/Container/다른 Item)에 적용하여 닫힌 4원자 상태 전이를 실행한다.
   * effect: "unlock" | "revealClue" | "activate" | "combine"
   */
  applyItem(itemId, targetId) {
    if (!this.hasItem(itemId)) {
      return { success: false, message: `인벤토리에 해당 아이템(${itemId})이 없습니다.` };
    }
    const item = this.items.get(itemId);
    const ix = this.interactions.find(
      r => r.itemId === itemId && r.targetId === targetId
    ) || this.interactions.find(
      // combine은 순서 무관하게 (A + B == B + A) 매칭 허용
      r => r.effect === "combine" && r.itemId === targetId && r.targetId === itemId
    );

    if (!ix) {
      return { success: false, message: `${item.name}을(를) 여기에는 사용할 수 없습니다.` };
    }
    if (ix.executed && item.consumable) {
      return { success: true, alreadyExecuted: true, message: ix.message || "이미 적용된 상호작용입니다." };
    }

    let result = { success: true, effect: ix.effect, message: ix.message || `${item.name} 적용 완료.` };

    if (ix.effect === "unlock") {
      const targetGate = this.gates.get(ix.resultId || targetId);
      if (targetGate) {
        targetGate.isOpen = true;
        result.unlockedGateId = targetGate.id;
        this._openTarget(targetGate.unlocks, result);
        const triggeredEffects = this._executeUnlockEffects(targetGate);
        if (triggeredEffects.length > 0) result.triggeredEffects = triggeredEffects;
      } else {
        this._openTarget(ix.resultId || targetId, result);
      }
    } else if (ix.effect === "revealClue") {
      const clue = this.clues.get(ix.resultId);
      if (clue) {
        clue.visibility = "Revealed";
        result.revealedClue = clue;
      }
    } else if (ix.effect === "activate") {
      const actId = ix.resultId || targetId;
      this.activatedTargets.add(actId);
      result.activatedTargetId = actId;
    } else if (ix.effect === "combine") {
      if (!this.hasItem(targetId)) {
        return { success: false, message: `조합 대상 아이템(${targetId})을 소지하고 있지 않습니다.` };
      }
      const other = this.items.get(targetId);
      if (other && other.consumable) this.player.inventory.delete(targetId);
      if (ix.resultId && this.items.has(ix.resultId)) {
        this.player.inventory.add(ix.resultId);
        result.createdItem = this.items.get(ix.resultId);
      }
    }

    ix.executed = true;
    if (item.consumable) {
      this.player.inventory.delete(itemId);
    }
    return result;
  }

  /**
   * 물리 장치(Mechanism) 상태 벡터 판정기
   */
  evaluateMechanism(mechanism, submittedState) {
    const target = mechanism.targetState;
    const tol = typeof mechanism.tolerance === "number" ? mechanism.tolerance : 0;

    if (typeof target === "number" && typeof submittedState === "number") {
      return Math.abs(submittedState - target) <= tol;
    }
    if (Array.isArray(target) && Array.isArray(submittedState)) {
      if (target.length !== submittedState.length) return false;
      return target.every((v, i) =>
        typeof v === "number" && typeof submittedState[i] === "number"
          ? Math.abs(submittedState[i] - v) <= tol
          : String(submittedState[i]) === String(v)
      );
    }
    if (target && typeof target === "object" && submittedState && typeof submittedState === "object") {
      return Object.keys(target).every(k => {
        const tv = target[k];
        const sv = submittedState[k];
        if (typeof tv === "number" && typeof sv === "number") return Math.abs(sv - tv) <= tol;
        return String(sv) === String(tv);
      });
    }
    return String(submittedState).trim() === String(target).trim();
  }

  _openTarget(targetId, out = {}) {
    const targetDoor = this.doors.get(targetId);
    if (targetDoor) {
      targetDoor.isLocked = false;
      out.unlockedDoorId = targetId;
      const passage = this.passages.find(p => p.id === targetDoor.passageId);
      if (passage && this.spaces.has(passage.toSpaceId)) {
        const nextSpace = this.spaces.get(passage.toSpaceId);
        nextSpace.status = "Active";
        if (nextSpace.props && nextSpace.props.length > 0) {
          const firstPropId = nextSpace.props[0].id;
          for (const clue of this.clues.values()) {
            if (clue.propRef === firstPropId && clue.visibility === "Hidden") {
              clue.visibility = "Revealed";
              out.revealedClue = clue;
              break;
            }
          }
        }
      }
      return out;
    }
    const targetContainer = this.containers.get(targetId);
    if (targetContainer) {
      targetContainer.isOpen = true;
      out.unlockedContainerId = targetId;
      if (targetContainer.containsClueId) {
        const clue = this.clues.get(targetContainer.containsClueId);
        if (clue) {
          clue.visibility = "Revealed";
          out.revealedClue = clue;
        }
      }
      if (targetContainer.containsItemId && this.items.has(targetContainer.containsItemId)) {
        this.player.inventory.add(targetContainer.containsItemId);
        out.acquiredItem = this.items.get(targetContainer.containsItemId);
      }
    }
    return out;
  }

  getGate(gateId) {
    return this.gates.get(gateId);
  }

  getDoor(doorId) {
    return this.doors.get(doorId);
  }

  getContainer(containerId) {
    return this.containers.get(containerId);
  }

  getClue(clueId) {
    return this.clues.get(clueId);
  }

  isLightOn(lightId) {
    const light = this.lights.get(lightId);
    return light ? light.isOn : false;
  }

  _executeUnlockEffects(gate) {
    const triggered = [];
    if (!Array.isArray(gate.onUnlockEffects)) return triggered;
    for (const eff of gate.onUnlockEffects) {
      if (eff.kind === "lightOn") {
        const light = this.lights.get(eff.targetId);
        if (light) light.isOn = true;
        triggered.push({ ...eff });
      } else if (eff.kind === "lightOff") {
        const light = this.lights.get(eff.targetId);
        if (light) light.isOn = false;
        triggered.push({ ...eff });
      } else if (eff.kind === "lightFlicker") {
        triggered.push({ ...eff });
      } else if (eff.kind === "revealClue") {
        const clue = this.clues.get(eff.targetId);
        if (clue) clue.visibility = "Revealed";
        triggered.push({ ...eff });
      }
    }
    return triggered;
  }

  /**
   * 플레이어가 자물쇠(Gate)에 값을 입력하여 해금을 시도함
   * @param {string} gateId - 대상 자물쇠 ID
   * @param {string} inputValue - 플레이어가 제출한 값 (예: "0414" 또는 "KeyMatched")
   */
  submitAction(gateId, inputValue) {
    const gate = this.gates.get(gateId);
    if (!gate) {
      throw new Error(`존재하지 않는 게이트 ID입니다: ${gateId}`);
    }

    if (gate.isOpen) {
      return { success: true, message: "이미 해제된 자물쇠입니다." };
    }

    // 0. 필수 아이템 소지 검증 (requiredItemId가 선언된 게이트)
    if (gate.requiredItemId && !this.hasItem(gate.requiredItemId)) {
      const reqItem = this.items.get(gate.requiredItemId);
      return {
        success: false,
        missingItemId: gate.requiredItemId,
        message: `이 장치를 작동하려면 [${reqItem ? reqItem.name : gate.requiredItemId}] 아이템이 필요합니다.`
      };
    }

    // 정답 조건 평가: 물리 장치(mechanism) 상태 벡터 우선, 없으면 기존 문자열 조건식 평가
    let isMatched = false;
    if (gate.mechanism && inputValue !== null && typeof inputValue === "object") {
      isMatched = this.evaluateMechanism(gate.mechanism, inputValue);
    } else {
      const expectedMatch = gate.condition.match(/Value\s*==\s*['"]?([^'"]+)['"]?/);
      const expectedValue = expectedMatch ? expectedMatch[1] : gate.condition;
      isMatched = String(inputValue).trim() === expectedValue
        || (gate.mechanism ? this.evaluateMechanism(gate.mechanism, inputValue) : false);
    }

    if (isMatched) {
      // 정답 일치: Gate 개방 및 필요 시 소모성 아이템 차감
      gate.isOpen = true;
      if (gate.requiredItemId) {
        const reqItem = this.items.get(gate.requiredItemId);
        if (reqItem && reqItem.consumable) this.player.inventory.delete(gate.requiredItemId);
      }

      const opened = this._openTarget(gate.unlocks, {});
      const triggeredEffects = this._executeUnlockEffects(gate);
      if (opened.unlockedDoorId) {
        return {
          success: true,
          message: `정답 일치! 자물쇠 ${gateId} 해제 완료. 문 ${opened.unlockedDoorId}이(가) 열렸습니다.`,
          ...opened,
          triggeredEffects
        };
      }
      if (opened.unlockedContainerId) {
        const itemNote = opened.acquiredItem ? ` + 아이템 [${opened.acquiredItem.name}] 획득!` : "";
        return {
          success: true,
          message: `금고 ${opened.unlockedContainerId} 개방 성공! 내부에서 단서 [${opened.revealedClue ? opened.revealedClue.id : 'None'}] 획득.${itemNote}`,
          ...opened,
          triggeredEffects
        };
      }
      return { success: true, message: `자물쇠 ${gateId} 해제 성공.`, triggeredEffects };
    } else {
      // 오답: 실패 횟수 증가 및 Director 긴장감 에스컬레이션
      gate.failureCount += 1;
      this.director.totalFailures += 1;

      let directorEvent = null;
      if (gate.failureCount >= this.director.panicThresholdFailures) {
        this.director.tensionLevel = Math.min(5, this.director.tensionLevel + 1);
        directorEvent = {
          action: "Blackout",
          tensionLevel: this.director.tensionLevel,
          message: "오답 누적으로 Director가 조명을 암전시키고 불길한 사운드를 증폭합니다."
        };
      }

      return {
        success: false,
        message: `오답입니다. (시도 실패 누적: ${gate.failureCount}회)`,
        directorEvent
      };
    }
  }

  /**
   * 플레이어가 Space A에서 Space B로 이동할 수 있는지 판정 (OneWay 퇴로 차단 검증)
   */
  canTraverse(fromSpaceId, toSpaceId) {
    // 1. 순방향 통로 검색 (from -> to)
    const directPassage = this.passages.find(
      p => p.fromSpaceId === fromSpaceId && p.toSpaceId === toSpaceId
    );

    if (directPassage) {
      if (!directPassage.door) return true; // 문 없는 통로
      const door = this.doors.get(directPassage.door.id);
      return door ? !door.isLocked : true;
    }

    // 2. 역방향 통로 검색 (to -> from)
    const reversePassage = this.passages.find(
      p => p.fromSpaceId === toSpaceId && p.toSpaceId === fromSpaceId
    );

    if (reversePassage) {
      // 일방통행(OneWay)인 경우 역방향 이동 절대 불가 (퇴로 차단)
      if (reversePassage.directionality === "OneWay") {
        return false;
      }
      if (!reversePassage.door) return true;
      const door = this.doors.get(reversePassage.door.id);
      return door ? !door.isLocked : true;
    }

    return false; // 통로 부재
  }
}
