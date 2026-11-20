/**
 * Room as Code (RaC) v1.0 - Logic & State Machine Engine (Extended for Containers, OneWay & Director)
 * 자물쇠(Gate), 은닉함(Container), 일방통행(OneWay), 가상 연출자(Director)를 관장하는 순수 FSM 상태 머신
 */

export class LogicRunner {
  constructor(racData) {
    this.theme = racData.theme;
    this.spaces = new Map();
    this.doors = new Map();
    this.gates = new Map();
    this.containers = new Map();
    this.problems = new Map();
    this.clues = new Map();
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
    // 1. Spaces 등록
    for (const space of data.spaces) {
      this.spaces.set(space.id, { ...space, status: "Unvisited" });
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

    // 정답 조건식 평가 (Value == '0414' 형식 파싱)
    const expectedMatch = gate.condition.match(/Value\s*==\s*['"]?([^'"]+)['"]?/);
    const expectedValue = expectedMatch ? expectedMatch[1] : gate.condition;

    if (String(inputValue).trim() === expectedValue) {
      // 정답 일치: Gate 개방
      gate.isOpen = true;
      const targetId = gate.unlocks;

      // 1. 대상이 문(Door)인 경우 -> 다음 방 활성화 및 해당 방의 첫 진입 단서 노출
      const targetDoor = this.doors.get(targetId);
      if (targetDoor) {
        targetDoor.isLocked = false;
        let newlyRevealedClue = null;
        const passage = this.passages.find(p => p.id === targetDoor.passageId);
        if (passage && this.spaces.has(passage.toSpaceId)) {
          const nextSpace = this.spaces.get(passage.toSpaceId);
          nextSpace.status = "Active";
          if (nextSpace.props && nextSpace.props.length > 0) {
            const firstPropId = nextSpace.props[0].id;
            for (const clue of this.clues.values()) {
              if (clue.propRef === firstPropId && clue.visibility === "Hidden") {
                clue.visibility = "Revealed";
                newlyRevealedClue = clue;
                break;
              }
            }
          }
        }
        return {
          success: true,
          message: `정답 일치! 자물쇠 ${gateId} 해제 완료. 문 ${targetId}이(가) 열렸습니다.`,
          unlockedDoorId: targetId,
          revealedClue: newlyRevealedClue
        };
      }

      // 2. 대상이 은닉함(Container/금고)인 경우 ➔ 새 Clue 노출
      const targetContainer = this.containers.get(targetId);
      if (targetContainer) {
        targetContainer.isOpen = true;
        let revealedClue = null;
        if (targetContainer.containsClueId) {
          revealedClue = this.clues.get(targetContainer.containsClueId);
          if (revealedClue) {
            revealedClue.visibility = "Revealed";
          }
        }
        return {
          success: true,
          message: `금고 ${targetId} 개방 성공! 내부에서 단서 [${revealedClue ? revealedClue.id : 'None'}] 획득.`,
          unlockedContainerId: targetId,
          revealedClue: revealedClue
        };
      }

      return { success: true, message: `자물쇠 ${gateId} 해제 성공.` };
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
