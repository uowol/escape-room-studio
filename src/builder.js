import * as THREE from 'three';

/**
 * Subnautica-style 1st-Person Craft Builder Mode Controller
 * Exclusively active during Studio Mode === 'author'
 */
export class CraftBuilder {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.activeSlot = 1; // 1 ~ 6
    this.ghostRotation = 0; // increments of Math.PI / 4 (45 deg)
    this.ghostGroup = null;
    this.pickedUpProp = null;
    this.originalPropState = null;
    this.isValidPlacement = true;
    this.currentPosition = new THREE.Vector3();
    this.currentLocal = { x: 0, z: 0 };
    this.aimedProp = null;
    this.raycaster = new THREE.Raycaster();
    this.centerScreen = new THREE.Vector2(0, 0);

    // 1~6 Hotbar Presets
    this.presets = {
      1: { id: 'desk-terminal', slot: 1, label: '단서 책상', type: 'desk', modelPreset: 'desk-terminal', name: '단서 단말 책상', w: 1.0, h: 0.75, d: 0.7, color: '#3b82f6' },
      2: { id: 'safe', slot: 2, label: '철제 금고', type: 'safe', modelPreset: 'safe', name: '철제 금고', w: 0.6, h: 0.8, d: 0.6, color: '#64748b' },
      3: { id: 'clock', slot: 3, label: '괘종시계', type: 'artifact', modelPreset: 'clock', name: '엔틱 괘종시계', w: 0.5, h: 1.6, d: 0.4, color: '#78350f' },
      4: { id: 'console', slot: 4, label: '물리 콘솔', type: 'console', modelPreset: 'console', name: '물리 장치 콘솔', w: 0.8, h: 0.9, d: 0.6, color: '#0284c7' },
      5: { id: 'light', slot: 5, label: '천장 조명', type: 'light', modelPreset: 'light', name: '천장 물리 광원', w: 0.4, h: 0.15, d: 0.4, color: '#ffffff' },
      6: { id: 'pickup', slot: 6, label: '기물 집기', type: 'pickup', name: '기물 집기/이동' }
    };
  }

  isActive() {
    return this.active;
  }

  toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    if (this.ctx.getStudioMode() !== 'author') return false;
    this.active = true;

    // Switch camera to 1st person FPS
    this.ctx.setCameraMode('fps');

    // Author FPS Lighting: Bright & clear, NO horror darkness or fog!
    if (this.ctx.scene) {
      this.ctx.scene.fog = null;
      this.ctx.scene.environmentIntensity = 0.25;
    }
    if (this.ctx.ambientLight) this.ctx.ambientLight.intensity = 0.25;
    if (this.ctx.hemiLight) this.ctx.hemiLight.intensity = 0.25;
    if (this.ctx.setFpsLightingMultiplier) this.ctx.setFpsLightingMultiplier(1.0);
    if (this.ctx.flashlight) {
      this.ctx.flashlight.intensity = 1.0;
      this.ctx.flashlight.castShadow = false;
    }

    // Show Craft Hotbar
    const hotbar = document.getElementById('craft-builder-hotbar');
    if (hotbar) hotbar.classList.remove('hidden');

    // Switch view to 3D Viewport
    this.ctx.setViewLayout('3d-only');

    // Update Top Button style
    const btn = document.getElementById('btn-craft-builder');
    if (btn) {
      btn.className = "bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 font-semibold px-2.5 py-1.5 rounded-md text-xs border border-cyan-500/50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.35)]";
    }

    this.selectSlot(this.activeSlot || 1);
    this.updateGhostMesh();

    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper('[크래프트 빌더] 1인칭 제작 모드 활성화. [1~6] 프리셋 · [R/휠] 회전 · [좌클릭] 배치 · [우클릭/X] 집기 · [Del] 삭제 · [B] 종료');
    }
    return true;
  }

  deactivate() {
    this.active = false;
    if (document.pointerLockElement) document.exitPointerLock();

    // Cancel any active prop pickup
    if (this.pickedUpProp && this.originalPropState) {
      this.pickedUpProp.x = this.originalPropState.x;
      this.pickedUpProp.z = this.originalPropState.z;
      this.pickedUpProp.rotY = this.originalPropState.rotY;
      this.pickedUpProp.roomIdx = this.originalPropState.roomIdx;
      this.ctx.rebuild3DRoom();
    }
    this.pickedUpProp = null;
    this.originalPropState = null;

    // Remove ghost group
    if (this.ghostGroup && this.ghostGroup.parent) {
      this.ghostGroup.parent.remove(this.ghostGroup);
    }
    this.ghostGroup = null;

    // Hide Craft Hotbar
    const hotbar = document.getElementById('craft-builder-hotbar');
    if (hotbar) hotbar.classList.add('hidden');

    // Update Top Button style back to normal
    const btn = document.getElementById('btn-craft-builder');
    if (btn) {
      btn.className = "bg-zinc-900 hover:bg-zinc-800 text-cyan-400 font-medium px-2.5 py-1.5 rounded-md text-xs border border-cyan-500/30 flex items-center gap-1.5 transition-colors cursor-pointer";
    }

    // Switch back to Orbit Mode & Split Layout in Author mode
    this.ctx.setCameraMode('orbit');
    this.ctx.setViewLayout('split');

    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper('[크래프트 빌더] 1인칭 제작 모드가 종료되었습니다.');
    }
  }

  selectSlot(slotNum) {
    if (slotNum < 1 || slotNum > 6) return;
    this.activeSlot = slotNum;

    // If leaving pickup slot without dropping, cancel pickup
    if (slotNum !== 6 && this.pickedUpProp) {
      if (this.originalPropState) {
        this.pickedUpProp.x = this.originalPropState.x;
        this.pickedUpProp.z = this.originalPropState.z;
        this.pickedUpProp.rotY = this.originalPropState.rotY;
        this.pickedUpProp.roomIdx = this.originalPropState.roomIdx;
        this.ctx.rebuild3DRoom();
      }
      this.pickedUpProp = null;
      this.originalPropState = null;
    }

    this.updateHotbarUI();
    this.updateGhostMesh();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
  }

  updateHotbarUI() {
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`craft-slot-${i}`);
      if (!el) continue;
      if (i === this.activeSlot) {
        el.className = "craft-slot px-2.5 py-1.5 rounded-lg border flex flex-col items-center gap-0.5 transition-all text-xs border-cyan-400 bg-cyan-950/70 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.4)]";
      } else {
        el.className = "craft-slot px-2.5 py-1.5 rounded-lg border flex flex-col items-center gap-0.5 transition-all text-xs border-white/10 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200";
      }
    }
    const info = document.getElementById('craft-hotbar-instructions');
    if (info) {
      if (this.activeSlot === 6 && this.pickedUpProp) {
        info.textContent = `[기물 이동 중: ${this.pickedUpProp.name}] [좌클릭] 재배치 · [우클릭] 취소 · [R/휠] 회전`;
      } else if (this.activeSlot === 6) {
        info.textContent = `[기물 집기 모드] 기물을 조준하고 [좌클릭/우클릭]으로 집기`;
      } else {
        info.textContent = `[${this.presets[this.activeSlot]?.label}] [R/휠] 회전 · [좌클릭] 배치 · [우클릭/X] 집기 · [Del] 삭제 · [B] 종료`;
      }
    }
  }

  rotateGhost(dir = 1) {
    this.ghostRotation = (this.ghostRotation + (Math.PI / 4) * dir) % (Math.PI * 2);
    if (this.ghostRotation < 0) this.ghostRotation += Math.PI * 2;
    if (this.ghostGroup) {
      this.ghostGroup.rotation.y = this.ghostRotation;
    }
    if (this.ctx.playSfx) this.ctx.playSfx('click');
  }

  updateGhostMesh() {
    if (!this.active || !this.ctx.scene) {
      if (this.ghostGroup && this.ghostGroup.parent) {
        this.ghostGroup.parent.remove(this.ghostGroup);
      }
      this.ghostGroup = null;
      return;
    }

    if (this.ghostGroup && this.ghostGroup.parent) {
      this.ghostGroup.parent.remove(this.ghostGroup);
    }
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = "craftBuilderGhostGroup";

    const preset = (this.activeSlot === 6 && this.pickedUpProp)
      ? { ...this.presets[6], w: this.pickedUpProp.w || 0.8, d: this.pickedUpProp.d || 0.8, h: 0.8 }
      : this.presets[this.activeSlot];

    // If slot 6 and no prop picked up, show subtle reticle or empty
    if (this.activeSlot === 6 && !this.pickedUpProp) {
      const ringGeo = new THREE.RingGeometry(0.15, 0.22, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.05;
      this.ghostGroup.add(ring);
      this.ghostGroup.traverse(c => { c.raycast = () => {}; });
      this.ctx.scene.add(this.ghostGroup);
      return;
    }

    const isLight = (preset.id === 'light');
    const w = preset.w || 0.8;
    const h = preset.h || 0.8;
    const d = preset.d || 0.8;

    const cyanColor = 0x22d3ee;
    const cyanWire = 0x67e8f9;

    if (isLight) {
      // Ceiling Light Fixture Ghost
      const mountGeo = new THREE.BoxGeometry(w, 0.08, d);
      const mountMat = new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.45 });
      const mount = new THREE.Mesh(mountGeo, mountMat);
      mount.position.y = 0.04;

      const bulbGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.y = -0.06;

      const coneGeo = new THREE.ConeGeometry(0.9, 2.2, 16, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({ color: cyanWire, wireframe: true, transparent: true, opacity: 0.4 });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = -1.1;

      this.ghostGroup.add(mount, bulb, cone);
    } else {
      // Standard Furniture / Prop Ghost
      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const boxMat = new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.38, depthWrite: false });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.y = h / 2;

      const edgeGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: cyanWire, transparent: true, opacity: 0.9 });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.position.y = h / 2;

      // Ground Projection Ring
      const groundRadius = Math.max(w, d) * 0.65;
      const ringGeo = new THREE.RingGeometry(0.1, groundRadius, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.02;

      // Facing Direction Arrow
      const arrowGeo = new THREE.ConeGeometry(0.12, 0.28, 12);
      arrowGeo.rotateX(Math.PI / 2);
      const arrowMat = new THREE.MeshBasicMaterial({ color: cyanWire, transparent: true, opacity: 0.9 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(0, 0.04, -d / 2 - 0.2);

      this.ghostGroup.add(box, edges, ring, arrow);
    }

    // Ghost mesh MUST NEVER intercept raycasts!
    this.ghostGroup.traverse(c => {
      c.raycast = () => {};
    });

    this.ctx.scene.add(this.ghostGroup);
    this.ghostGroup.rotation.y = this.ghostRotation;
  }

  setGhostValidity(valid) {
    if (!this.ghostGroup || this.isValidPlacement === valid) return;
    this.isValidPlacement = valid;

    const mainColor = valid ? 0x22d3ee : 0xf43f5e;
    const wireColor = valid ? 0x67e8f9 : 0xfb7185;

    this.ghostGroup.traverse(c => {
      if (c.isMesh && c.material) {
        if (c.material.wireframe) {
          c.material.color.setHex(wireColor);
        } else {
          c.material.color.setHex(mainColor);
        }
      } else if (c.isLineSegments && c.material) {
        c.material.color.setHex(wireColor);
      }
    });
  }

  update(dt) {
    if (!this.active) return;
    const camera = this.ctx.camera;
    const rc = this.ctx.getCurrentRoomConfig();
    if (!camera || !rc) return;

    const preset = (this.activeSlot === 6 && this.pickedUpProp)
      ? { ...this.presets[6], w: this.pickedUpProp.w || 0.8, d: this.pickedUpProp.d || 0.8, h: 0.8 }
      : this.presets[this.activeSlot];

    const isLight = (preset.id === 'light');
    const targetY = isLight ? (rc.floorHeight + 2.35) : rc.floorHeight;

    // Raycast from camera center forward
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    let hitPos = new THREE.Vector3();
    let hitFound = false;

    if (isLight) {
      if (forward.y > 0.02) {
        const t = (targetY - camera.position.y) / forward.y;
        if (t > 0 && t < 15) {
          hitPos.copy(camera.position).addScaledVector(forward, t);
          hitFound = true;
        }
      }
    } else {
      if (forward.y < -0.02) {
        const t = (targetY - camera.position.y) / forward.y;
        if (t > 0 && t < 15) {
          hitPos.copy(camera.position).addScaledVector(forward, t);
          hitFound = true;
        }
      }
    }

    if (!hitFound) {
      hitPos.x = camera.position.x + forward.x * 2.8;
      hitPos.z = camera.position.z + forward.z * 2.8;
      hitPos.y = targetY;
    }

    // Grid snapping to 0.25m
    const snapGrid = 0.25;
    const localX = Math.round((hitPos.x - rc.worldX) / snapGrid) * snapGrid;
    const localZ = Math.round((hitPos.z - rc.worldZ) / snapGrid) * snapGrid;

    this.currentLocal = { x: localX, z: localZ };
    this.currentPosition.x = rc.worldX + localX;
    this.currentPosition.y = targetY;
    this.currentPosition.z = rc.worldZ + localZ;

    if (this.ghostGroup) {
      this.ghostGroup.position.copy(this.currentPosition);
    }

    // Bounds check
    const propW = preset.w || 0.8;
    const propD = preset.d || 0.8;
    const inBounds = (localX - propW / 2 >= 0.05) &&
                     (localX + propW / 2 <= rc.w - 0.05) &&
                     (localZ - propD / 2 >= 0.05) &&
                     (localZ + propD / 2 <= rc.h - 0.05);

    // Collision check
    let hasCollision = false;
    if (!isLight) {
      const objs = this.ctx.getStudioObjects();
      for (const obj of objs) {
        if (obj.roomIdx !== rc.idx) continue;
        if (this.pickedUpProp && obj.id === this.pickedUpProp.id) continue;
        const ow = obj.w || 0.8;
        const od = obj.d || 0.8;
        const xOverlap = Math.abs(localX - obj.x) < ((propW + ow) / 2 - 0.06);
        const zOverlap = Math.abs(localZ - obj.z) < ((propD + od) / 2 - 0.06);
        if (xOverlap && zOverlap) {
          hasCollision = true;
          break;
        }
      }
    }

    const valid = inBounds && !hasCollision;
    this.setGhostValidity(valid);

    // Check prop aim for pickup/delete
    this.raycaster.setFromCamera(this.centerScreen, camera);
    const hitables = Array.from(this.ctx.meshMap.values());
    const hits = this.raycaster.intersectObjects(hitables, true);
    this.aimedProp = null;
    if (hits && hits.length > 0 && hits[0].distance < 4.5) {
      const hitId = this.ctx.getHitObjectId(hits);
      if (hitId) {
        this.aimedProp = this.ctx.getStudioObjects().find(o => o.id === hitId) || null;
      }
    }
  }

  onLeftClick() {
    if (!this.active) return;

    // Check pointer lock
    if (document.pointerLockElement !== this.ctx.renderer.domElement) {
      try {
        const p = this.ctx.renderer.domElement.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
      return;
    }

    const rc = this.ctx.getCurrentRoomConfig();
    const localX = this.currentLocal.x;
    const localZ = this.currentLocal.z;

    // Slot 6: Dropping Picked Up Prop
    if (this.activeSlot === 6 && this.pickedUpProp) {
      if (!this.isValidPlacement) {
        if (this.ctx.playSfx) this.ctx.playSfx('spark');
        if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper('[배치 불가] 방 경계를 벗어났거나 다른 기물과 충돌합니다.');
        return;
      }
      this.pickedUpProp.x = localX;
      this.pickedUpProp.z = localZ;
      this.pickedUpProp.rotY = this.ghostRotation;
      this.pickedUpProp.roomIdx = rc.idx;
      const propId = this.pickedUpProp.id;
      const propName = this.pickedUpProp.name;
      this.pickedUpProp = null;
      this.originalPropState = null;

      this.ctx.rebuild3DRoom();
      this.ctx.render2DCadObjects();
      this.ctx.renderRoomSidebarAndProgress();
      this.ctx.updateCodeView();
      this.ctx.scheduleStudioAutosave();
      if (this.ctx.playSfx) this.ctx.playSfx('click');
      this.ctx.selectObject(propId);
      if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper(`[기물 재배치] '${propName}' 위치가 변경되었습니다.`);
      this.updateGhostMesh();
      this.updateHotbarUI();
      return;
    }

    // Slot 6: Click to pickup aimed prop
    if (this.activeSlot === 6 && !this.pickedUpProp) {
      if (this.aimedProp) {
        this.pickupProp(this.aimedProp);
      }
      return;
    }

    // Slot 1~5: Placement
    if (!this.isValidPlacement) {
      if (this.ctx.playSfx) this.ctx.playSfx('spark');
      if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper('[배치 불가] 방 경계를 벗어났거나 다른 기물과 충돌합니다.');
      return;
    }

    if (this.activeSlot === 5) {
      // Ceiling Light Placement
      if (!rc.lights) rc.lights = [];
      const lightId = `light-craft-${Date.now().toString(36)}`;
      rc.lights.push({
        id: lightId,
        kind: 'fluorescent',
        pos: [localX, 2.35, localZ],
        color: '#ffffff',
        intensity: 2.8,
        distance: 4.5,
        flicker: false
      });
      this.ctx.rebuild3DRoom();
      this.ctx.render2DCadObjects();
      this.ctx.updateCodeView();
      this.ctx.scheduleStudioAutosave();
      if (this.ctx.playSfx) this.ctx.playSfx('click');
      if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper(`[천장 조명] 새로운 물리 광원이 추가되었습니다.`);
      return;
    }

    // Slot 1~4: Add New Prop
    const preset = this.presets[this.activeSlot];
    const studioObjects = this.ctx.getStudioObjects();
    const nextQ = studioObjects.reduce((m, o) => Math.max(m, o.qNum || 0), 0) + 1;
    const newObj = {
      qNum: nextQ,
      id: `prop-craft-${Date.now().toString(36)}`,
      roomIdx: rc.idx,
      type: preset.type,
      modelPreset: preset.modelPreset,
      name: `${preset.name} #${nextQ}`,
      x: localX,
      z: localZ,
      w: preset.w,
      d: preset.d,
      color: preset.color || "#3b82f6",
      rotY: this.ghostRotation,
      clueId: `clue-craft-${nextQ}`, carrierType: "Text",
      cluePayload: `크래프트 빌더로 배치된 ${preset.name}입니다.`,
      probId: `prob-craft-${nextQ}`, probRule: "관찰 및 상호작용",
      gateId: `gate-craft-${nextQ}`, interfaceType: "MechanicalLock", passcode: "1234",
      unlocksId: `cont-craft-${nextQ}`, unlocksName: "해금 보상",
      isBossDoor: false, solved: false,
      requiresSolvedId: null,
      storyBeat: `[크래프트] ${preset.name} #${nextQ} 조사가 완료되었습니다.`,
      visualSpec: { template: "document", title: `${preset.name} #${nextQ}`, lines: ["단서 메모를 확인하세요."] }
    };

    studioObjects.push(newObj);
    this.ctx.rebuild3DRoom();
    this.ctx.render2DCadObjects();
    this.ctx.renderRoomSidebarAndProgress();
    this.ctx.updateCodeView();
    this.ctx.scheduleStudioAutosave();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
    this.ctx.selectObject(newObj.id);
    if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper(`[배치 완료] ${newObj.name}이(가) 배치되었습니다.`);
  }

  onRightClick() {
    if (!this.active) return;
    if (this.pickedUpProp) {
      // Cancel pickup, restore original position
      if (this.originalPropState) {
        this.pickedUpProp.x = this.originalPropState.x;
        this.pickedUpProp.z = this.originalPropState.z;
        this.pickedUpProp.rotY = this.originalPropState.rotY;
        this.pickedUpProp.roomIdx = this.originalPropState.roomIdx;
      }
      const name = this.pickedUpProp.name;
      this.pickedUpProp = null;
      this.originalPropState = null;
      this.ctx.rebuild3DRoom();
      if (this.ctx.playSfx) this.ctx.playSfx('click');
      if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper(`[집기 취소] '${name}' 위치가 복귀되었습니다.`);
      this.updateGhostMesh();
      this.updateHotbarUI();
      return;
    }

    if (this.aimedProp) {
      this.pickupProp(this.aimedProp);
    }
  }

  pickupProp(prop) {
    if (!prop) return;
    this.pickedUpProp = prop;
    this.originalPropState = { x: prop.x, z: prop.z, rotY: prop.rotY || 0, roomIdx: prop.roomIdx };
    this.ghostRotation = prop.rotY || 0;
    this.activeSlot = 6;
    this.updateHotbarUI();

    // Hide original prop 3D mesh
    const mesh = this.ctx.meshMap.get(prop.id);
    if (mesh) mesh.visible = false;

    if (this.ctx.playSfx) this.ctx.playSfx('click');
    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper(`[기물 집기] '${prop.name}'을 집었습니다. [좌클릭] 재배치 · [우클릭] 취소.`);
    }
    this.updateGhostMesh();
  }

  onDelete() {
    if (!this.active) return;
    if (this.pickedUpProp) {
      const propId = this.pickedUpProp.id;
      const propName = this.pickedUpProp.name;
      this.pickedUpProp = null;
      this.originalPropState = null;
      this.ctx.deleteObjectById(propId);
      this.updateGhostMesh();
      this.updateHotbarUI();
      return;
    }

    if (this.aimedProp) {
      this.ctx.deleteObjectById(this.aimedProp.id);
      this.aimedProp = null;
    } else if (this.ctx.selectedObjectId) {
      this.ctx.deleteSelectedObject();
    }
  }
}
