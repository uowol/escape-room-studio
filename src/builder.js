import * as THREE from 'three';
import { disposeObject3D } from './pbr.js';

/**
 * Subnautica-style 1st-Person Craft Builder Mode Controller
 * Exclusively active during Studio Mode === 'author'
 *
 * - Hotbar: 5 customizable slots (1~5), assigned from the Tab catalog (persisted in localStorage)
 * - Short left click  : place hotbar item at hologram
 * - Long press (hold) : pick up the aimed object / ontology prop, then click to drop (RMB / ESC cancels)
 * - Doors snap to the nearest wall; walls are carved by rebuild3DRoom() from the door objects' positions
 */

const HOTBAR_KEY = 'rac_craft_hotbar_v1';
const CLICK_MS = 300;   // < 300ms : short click -> place
const HOLD_MS = 340;    // >= 320ms : long press -> pick up
const RING_START_MS = 80;
const RING_CIRC = 2 * Math.PI * 18;

const P = (id, category, label, type, w, d, h, color) =>
  ({ id: `preset:${id}`, kind: 'preset', category, label, modelPreset: id, type, w, d, h, color });

// 23 MODEL_PRESET_MAP presets + ceiling light + PROP_ONTOLOGY mini-props
export const CRAFT_CATALOG = [
  P('desk-terminal', '책상', '접수 단말 책상', 'desk', 1.0, 0.7, 0.8, '#3b82f6'),
  P('desk-chess', '책상', '체스 책상', 'desk', 1.1, 0.8, 0.8, '#3b82f6'),
  P('desk-autopsy', '책상', '부검 철제 테이블', 'desk', 1.8, 0.8, 0.8, '#94a3b8'),
  P('desk-plain', '책상', '일반 책상', 'desk', 1.2, 0.7, 0.8, '#3b82f6'),
  P('cabinet', '캐비닛·금고', '철제 캐비닛', 'cabinet', 0.9, 0.5, 1.6, '#64748b'),
  P('locker', '캐비닛·금고', '사물함', 'locker', 0.7, 0.5, 1.8, '#64748b'),
  P('pipe-manifold', '캐비닛·금고', '파이프 매니폴드', 'locker', 0.8, 0.5, 1.4, '#64748b'),
  P('safe', '캐비닛·금고', '철제 금고', 'safe', 0.6, 0.6, 0.8, '#64748b'),
  P('generator', '캐비닛·금고', '비상 발전기', 'safe', 1.0, 0.8, 1.0, '#64748b'),
  P('scale', '캐비닛·금고', '저울', 'safe', 0.6, 0.6, 0.8, '#64748b'),
  P('phone', '전자·장치', '전화기', 'console', 0.4, 0.4, 0.4, '#0284c7'),
  P('reel-recorder', '전자·장치', '릴 녹음기', 'console', 0.6, 0.5, 0.5, '#0284c7'),
  P('xray-lightbox', '전자·장치', 'X-Ray 라이트박스', 'console', 0.8, 0.3, 0.8, '#0284c7'),
  P('console', '전자·장치', '물리 콘솔', 'console', 0.8, 0.6, 0.9, '#0284c7'),
  P('clock', '소품·유물', '괘종시계', 'artifact', 0.5, 0.4, 1.6, '#78350f'),
  P('hospital-bed', '소품·유물', '구속 침대', 'artifact', 0.9, 1.8, 0.6, '#64748b'),
  P('specimen-shelf', '소품·유물', '표본 진열장', 'artifact', 0.8, 0.4, 1.4, '#64748b'),
  P('portrait', '소품·유물', '초상화 액자', 'artifact', 1.0, 0.2, 1.2, '#926829'),
  P('ladder', '소품·유물', '수직 사다리', 'ladder', 0.8, 0.8, 2.6, '#64748b'),
  P('door-standard', '문·출입구', '철제 출입문', 'door', 0.2, 1.24, 2.1, '#ef4444'),
  P('door-hatch', '문·출입구', '바닥 해치', 'door', 0.9, 0.9, 0.1, '#ef4444'),
  P('door-lift', '문·출입구', '화물 승강기', 'door', 1.2, 1.2, 2.2, '#ef4444'),
  P('door-bookshelf', '문·출입구', '비밀 책장 문', 'door', 0.35, 1.24, 2.1, '#ef4444'),
  { id: 'light', kind: 'light', category: '조명', label: '천장 조명', w: 0.4, d: 0.4, h: 0.15 },
  { id: 'onto:clock', kind: 'onto', category: '미니 소품', label: '벽걸이 시계', ontoType: 'clock', mode: 'wall', w: 0.7, d: 0.06, h: 0.7, y: 1.85 },
  { id: 'onto:portrait', kind: 'onto', category: '미니 소품', label: '벽걸이 초상화', ontoType: 'portrait', mode: 'wall', w: 1.0, d: 0.06, h: 1.2, y: 1.7 },
  { id: 'onto:cup', kind: 'onto', category: '미니 소품', label: '커피 머그잔 세트', ontoType: 'cup', mode: 'table', w: 0.3, d: 0.3, h: 0.1 },
  { id: 'onto:document', kind: 'onto', category: '미니 소품', label: '차트 클립보드', ontoType: 'document', mode: 'table', w: 0.24, d: 0.32, h: 0.03 }
];
const CATALOG_BY_ID = Object.fromEntries(CRAFT_CATALOG.map(e => [e.id, e]));
const DEFAULT_SLOTS = ['preset:desk-terminal', 'preset:safe', 'preset:clock', 'preset:console', 'light'];

// Ontology prop footprint (mode: wall-hung | table-top)
const PROP_DIM = {
  clock: { mode: 'wall', w: 0.7, d: 0.06, h: 0.7, y: 1.85 },
  portrait: { mode: 'wall', w: 1.0, d: 0.06, h: 1.2, y: 1.7 },
  bookshelf: { mode: 'wall', w: 1.0, d: 0.1, h: 1.2, y: 1.3 },
  cup: { mode: 'table', w: 0.3, d: 0.3, h: 0.1 },
  document: { mode: 'table', w: 0.24, d: 0.32, h: 0.03 }
};

const ONTO_GIMMICK = {
  clock: { kind: 'clock-angle', data: { timeString: '03:00', hourAngle: 90, minuteAngle: 0 } },
  portrait: { kind: 'portrait-pointer', data: { pointingVector: 'SOUTH', targetName: '' } },
  cup: { kind: 'cup-handle', data: { handleDirections: ['U', 'R', 'D', 'L'], angles: [0, Math.PI / 2, Math.PI, -Math.PI / 2], labels: ['북(U)', '동(R)', '남(D)', '서(L)'] } },
  document: { kind: 'blood-marking', data: { markedText: '', codeNumbers: '' } }
};

const PROP_RESTORE_KEYS = ['x', 'y', 'z', 'roomIdx', 'tableSnapped', 'targetParentId', 'relX', 'relZ', 'wallSnapped', 'wallSide'];
const WALL_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

export class CraftBuilder {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.activeSlot = 1; // 1 ~ 5
    this.ghostRotation = 0; // increments of Math.PI / 4 (45 deg)
    this.ghostGroup = null;
    this.ghostKey = '';
    this.ghostValid = true;
    this.carried = null; // { kind: 'obj' | 'prop', ref, original }
    this.isValidPlacement = true;
    this.placement = null;
    this.currentPosition = new THREE.Vector3();
    this.currentLocal = { x: 0, z: 0 };
    this.aimedTarget = null; // { kind: 'obj' | 'prop', ref }
    this.aimedProp = null;
    this.deskHit = null;
    this.press = null;
    this.raycaster = new THREE.Raycaster();
    this.centerScreen = new THREE.Vector2(0, 0);
    this.slots = this.loadSlots();
  }

  // ---------------------------------------------------------------
  // Hotbar slots (1~5) persisted in localStorage
  // ---------------------------------------------------------------
  loadSlots() {
    try {
      const a = JSON.parse(localStorage.getItem(HOTBAR_KEY));
      if (Array.isArray(a) && a.length === 5 && a.every(id => CATALOG_BY_ID[id])) return a;
    } catch (_) {}
    return DEFAULT_SLOTS.slice();
  }

  saveSlots() {
    try { localStorage.setItem(HOTBAR_KEY, JSON.stringify(this.slots)); } catch (_) {}
  }

  getEntry(slot = this.activeSlot) {
    return CATALOG_BY_ID[this.slots[slot - 1]] || CATALOG_BY_ID[DEFAULT_SLOTS[slot - 1]];
  }

  isActive() { return this.active; }
  isCarrying() { return !!this.carried; }

  toggle() {
    if (this.active) this.deactivate();
    else this.activate();
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

    const hotbar = document.getElementById('craft-builder-hotbar');
    if (hotbar) hotbar.classList.remove('hidden');

    this.ctx.setViewLayout('3d-only');

    const btn = document.getElementById('btn-craft-builder');
    if (btn) {
      btn.className = "bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 font-semibold px-2.5 py-1.5 rounded-md text-xs border border-cyan-500/50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.35)]";
    }

    this.selectSlot(this.activeSlot || 1);

    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper('[크래프트 빌더] [1~5] 슬롯 · [Tab] 카탈로그 · [클릭] 배치 · [길게 클릭] 집기 · [R/휠] 회전 · [Del] 삭제 · [B] 종료');
    }
    return true;
  }

  deactivate() {
    this.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.press = null;
    this.setRing(0, false);
    this.closeCatalog(true);

    // Cancel any active pickup
    this.cancelPickup(true);

    if (this.ghostGroup) {
      if (this.ghostGroup.parent) this.ghostGroup.parent.remove(this.ghostGroup);
      disposeObject3D(this.ghostGroup);
    }
    this.ghostGroup = null;
    this.ghostKey = '';

    const hotbar = document.getElementById('craft-builder-hotbar');
    if (hotbar) hotbar.classList.add('hidden');

    const btn = document.getElementById('btn-craft-builder');
    if (btn) {
      btn.className = "bg-zinc-900 hover:bg-zinc-800 text-cyan-400 font-medium px-2.5 py-1.5 rounded-md text-xs border border-cyan-500/30 flex items-center gap-1.5 transition-colors cursor-pointer";
    }

    this.ctx.setCameraMode('orbit');
    this.ctx.setViewLayout('split');

    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper('[크래프트 빌더] 1인칭 제작 모드가 종료되었습니다.');
    }
  }

  selectSlot(slotNum) {
    if (slotNum < 1 || slotNum > 5) return;
    this.activeSlot = slotNum;
    // Switching slot while carrying cancels the carry (returns item to original position)
    if (this.carried) this.cancelPickup(true);
    this.updateHotbarUI();
    this.updateGhostMesh();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
  }

  updateHotbarUI() {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`craft-slot-${i}`);
      if (!el) continue;
      const on = i === this.activeSlot;
      el.className = on
        ? "craft-slot px-2.5 py-1.5 rounded-lg border flex flex-col items-center gap-0.5 transition-all text-xs border-cyan-400 bg-cyan-950/70 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
        : "craft-slot px-2.5 py-1.5 rounded-lg border flex flex-col items-center gap-0.5 transition-all text-xs border-white/10 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200";
      const entry = this.getEntry(i);
      el.innerHTML = `<span class="text-[9px] font-mono ${on ? 'text-cyan-400' : 'text-zinc-500'} font-bold">[${i}]</span><span class="font-medium text-[11px]">${entry.label}</span>`;
    }
    const info = document.getElementById('craft-hotbar-instructions');
    if (info) {
      if (this.carried) {
        info.textContent = `[이동 중: ${this.carried.ref.name}] [좌클릭] 놓기 · [우클릭/ESC] 취소 · [R/휠] 회전 · [Del] 삭제`;
      } else {
        info.textContent = `[${this.getEntry().label}] [클릭] 배치 · [길게 클릭] 집기 · [R/휠] 회전 · [Tab] 카탈로그 · [Del] 삭제 · [B] 종료`;
      }
    }
  }

  rotateGhost(dir = 1) {
    this.ghostRotation = (this.ghostRotation + (Math.PI / 4) * dir) % (Math.PI * 2);
    if (this.ghostRotation < 0) this.ghostRotation += Math.PI * 2;
    if (this.ctx.playSfx) this.ctx.playSfx('click');
  }

  // ---------------------------------------------------------------
  // Catalog modal (Tab)
  // ---------------------------------------------------------------
  isCatalogOpen() {
    const m = document.getElementById('craft-catalog-modal');
    return !!m && !m.classList.contains('hidden');
  }

  toggleCatalog() {
    if (this.isCatalogOpen()) this.closeCatalog();
    else this.openCatalog();
  }

  openCatalog() {
    const m = document.getElementById('craft-catalog-modal');
    if (!m) return;
    this.press = null;
    this.setRing(0, false);
    if (document.pointerLockElement) document.exitPointerLock();
    m.classList.remove('hidden');
    this.renderCatalog();
  }

  closeCatalog(silent = false) {
    const m = document.getElementById('craft-catalog-modal');
    if (!m || m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    if (!silent && this.active) {
      try {
        const p = this.ctx.renderer.domElement.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }
  }

  assignSlot(slot, entryId) {
    if (slot < 1 || slot > 5 || !CATALOG_BY_ID[entryId]) return;
    this.slots[slot - 1] = entryId;
    this.saveSlots();
    this.updateHotbarUI();
    if (slot === this.activeSlot) this.updateGhostMesh();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
    if (this.ctx.showDirectorWhisper) {
      this.ctx.showDirectorWhisper(`[핫바] 슬롯 ${slot} ← ${CATALOG_BY_ID[entryId].label}`);
    }
    if (this.isCatalogOpen()) this.renderCatalog();
  }

  renderCatalog() {
    const body = document.getElementById('craft-catalog-body');
    if (!body) return;
    const label = document.getElementById('craft-catalog-active-slot');
    if (label) label.textContent = `현재 슬롯 [${this.activeSlot}]`;
    const cats = [];
    CRAFT_CATALOG.forEach(e => { if (!cats.includes(e.category)) cats.push(e.category); });
    body.innerHTML = '';
    cats.forEach(cat => {
      const sec = document.createElement('section');
      const items = CRAFT_CATALOG.filter(e => e.category === cat);
      sec.innerHTML = `<h3 class="text-[11px] font-semibold text-zinc-400 mb-2 pb-1 border-b border-white/10">${cat} <span class="font-mono text-zinc-600">${items.length}</span></h3>`;
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-2 md:grid-cols-4 gap-2';
      items.forEach(e => {
        const bound = this.slots.map((id, i) => (id === e.id ? i + 1 : 0)).filter(Boolean);
        const card = document.createElement('div');
        card.className = 'craft-catalog-card cursor-pointer rounded-lg border border-white/10 bg-zinc-900/80 hover:border-cyan-500/50 hover:bg-zinc-800/80 p-2.5 flex flex-col gap-1.5 transition-colors';
        card.dataset.entry = e.id;
        const meta = e.kind === 'preset' ? e.modelPreset : (e.kind === 'light' ? 'ceiling fixture' : `ontology · ${e.ontoType}`);
        card.innerHTML = `<div class="text-[12px] font-medium text-zinc-100">${e.label}</div>` +
          `<div class="text-[10px] font-mono text-zinc-500">${meta}</div>` +
          `<div class="flex items-center gap-1 mt-0.5"></div>`;
        const row = card.lastElementChild;
        for (let s = 1; s <= 5; s++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.slot = String(s);
          b.textContent = `[${s}]`;
          b.className = 'px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ' +
            (bound.includes(s) ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200' : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:border-white/30');
          b.addEventListener('click', ev => {
            ev.stopPropagation();
            this.activeSlot = s;
            this.assignSlot(s, e.id);
          });
          row.appendChild(b);
        }
        card.addEventListener('click', () => {
          this.assignSlot(this.activeSlot, e.id);
          this.closeCatalog();
        });
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      body.appendChild(sec);
    });
  }

  // ---------------------------------------------------------------
  // Placement spec (what the hologram currently represents)
  // ---------------------------------------------------------------
  getSpec() {
    const c = this.carried;
    if (c) {
      if (c.kind === 'obj') {
        const o = c.ref;
        if (this.ctx.isWallDoorObj(o)) return { mode: 'door', w: 0.3, d: 1.24, h: 2.1, label: o.name };
        return { mode: 'floor', w: o.w || 0.8, d: o.d || 0.8, h: 0.8, label: o.name };
      }
      const dim = PROP_DIM[c.ref.type] || { mode: 'floor', w: 0.3, d: 0.3, h: 0.3 };
      return { ...dim, y: c.ref.y || dim.y, label: c.ref.name };
    }
    const e = this.getEntry();
    if (e.kind === 'light') return { mode: 'light', w: e.w, d: e.d, h: e.h, label: e.label };
    if (e.kind === 'onto') return { mode: e.mode, w: e.w, d: e.d, h: e.h, y: e.y, label: e.label };
    if (e.type === 'door' && e.modelPreset !== 'door-hatch' && e.modelPreset !== 'door-lift') {
      return { mode: 'door', w: 0.3, d: 1.24, h: 2.1, label: e.label };
    }
    return { mode: 'floor', w: e.w, d: e.d, h: Math.min(e.h || 0.8, 2.2), label: e.label };
  }

  // ---------------------------------------------------------------
  // Hologram ghost
  // ---------------------------------------------------------------
  updateGhostMesh() {
    if (!this.active || !this.ctx.scene) {
      if (this.ghostGroup) {
        if (this.ghostGroup.parent) this.ghostGroup.parent.remove(this.ghostGroup);
        disposeObject3D(this.ghostGroup);
      }
      this.ghostGroup = null;
      this.ghostKey = '';
      return;
    }
    if (this.ghostGroup) {
      if (this.ghostGroup.parent) this.ghostGroup.parent.remove(this.ghostGroup);
      disposeObject3D(this.ghostGroup);
    }
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = "craftBuilderGhostGroup";
    this.ghostValid = true;

    const spec = this.getSpec();
    const { w, h, d, mode } = spec;
    this.ghostKey = this.specKey(spec);

    const cyanColor = 0x22d3ee;
    const cyanWire = 0x67e8f9;

    if (mode === 'light') {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.45 }));
      mount.position.y = 0.04;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      bulb.position.y = -0.06;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: cyanWire, wireframe: true, transparent: true, opacity: 0.4 }));
      cone.position.y = -1.1;
      this.ghostGroup.add(mount, bulb, cone);
    } else {
      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const box = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.38, depthWrite: false }));
      box.position.y = h / 2;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: cyanWire, transparent: true, opacity: 0.9 }));
      edges.position.y = h / 2;
      this.ghostGroup.add(box, edges);

      if (mode === 'floor') {
        const ringGeo = new THREE.RingGeometry(0.1, Math.max(w, d) * 0.65, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        ring.position.y = 0.02;
        const arrowGeo = new THREE.ConeGeometry(0.12, 0.28, 12);
        arrowGeo.rotateX(Math.PI / 2);
        const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: cyanWire, transparent: true, opacity: 0.9 }));
        arrow.position.set(0, 0.04, -d / 2 - 0.2);
        this.ghostGroup.add(ring, arrow);
      }
    }

    // Ghost mesh MUST NEVER intercept raycasts!
    this.ghostGroup.traverse(c => { c.raycast = () => {}; });
    this.ctx.scene.add(this.ghostGroup);
    this.ghostGroup.rotation.y = this.ghostRotation;
  }

  specKey(spec) {
    return `${spec.mode}|${spec.w}|${spec.d}|${spec.h}|${spec.label}`;
  }

  setGhostValidity(valid) {
    if (!this.ghostGroup || this.ghostValid === valid) return;
    this.ghostValid = valid;
    const mainColor = valid ? 0x22d3ee : 0xf43f5e;
    const wireColor = valid ? 0x67e8f9 : 0xfb7185;
    this.ghostGroup.traverse(c => {
      if (c.isMesh && c.material) {
        c.material.color.setHex(c.material.wireframe ? wireColor : mainColor);
      } else if (c.isLineSegments && c.material) {
        c.material.color.setHex(wireColor);
      }
    });
  }

  // ---------------------------------------------------------------
  // Aim: what is under the crosshair (object or ontology prop)
  // ---------------------------------------------------------------
  findPropId(object) {
    let cur = object;
    while (cur) {
      if (cur.userData && cur.userData.propId) return cur.userData.propId;
      cur = cur.parent;
    }
    return null;
  }

  updateAimedTarget(camera) {
    this.raycaster.setFromCamera(this.centerScreen, camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.ctx.meshMap.values()), true);
    this.aimedTarget = null;
    this.aimedProp = null;
    this.deskHit = null;
    if (!hits.length || hits[0].distance > 4.5) return;

    // Invisible interaction proxy colliders must not hide the real meshes behind them
    const isProxy = h => h.object.material && h.object.material.transparent && h.object.material.opacity === 0;
    const real = hits.filter(h => !isProxy(h));
    const first = hits[0];
    const objs = this.ctx.getStudioObjects();

    const realFirst = real[0];
    if (realFirst && realFirst.distance <= first.distance + 1.5) {
      const propId = this.findPropId(realFirst.object);
      const prop = propId && this.ctx.getPropOntology().find(p => p.id === propId);
      if (prop) this.aimedTarget = { kind: 'prop', ref: prop };
    }
    for (const h of real) {
      const id = h.object.userData && h.object.userData.objId;
      const o = id && objs.find(x => x.id === id);
      if (o && o.type === 'desk' && !this.findPropId(h.object)) { this.deskHit = { obj: o, point: h.point }; break; }
      if (o) break;
    }
    if (!this.aimedTarget) {
      const hitId = this.ctx.getHitObjectId(hits);
      const o = hitId && objs.find(x => x.id === hitId);
      if (o) this.aimedTarget = { kind: 'obj', ref: o };
    }
    if (this.aimedTarget) this.aimedProp = this.aimedTarget.ref;
  }

  // ---------------------------------------------------------------
  // Wall aim helpers (doors & wall-hung props)
  // ---------------------------------------------------------------
  aimWall(rc, camera, forward, fallbackLocal) {
    const cx = camera.position.x - rc.worldX;
    const cz = camera.position.z - rc.worldZ;
    const cy = camera.position.y - rc.floorHeight;
    const wh = rc.wallHeight || 2.6;
    const defs = [
      ['N', 'z', 0, rc.w], ['S', 'z', rc.h, rc.w], ['W', 'x', 0, rc.h], ['E', 'x', rc.w, rc.h]
    ];
    let best = null;
    for (const [wall, axis, val, len] of defs) {
      const dir = axis === 'z' ? forward.z : forward.x;
      const origin = axis === 'z' ? cz : cx;
      if (Math.abs(dir) < 1e-4) continue;
      const t = (val - origin) / dir;
      if (t <= 0 || t > 25) continue;
      const px = cx + forward.x * t, pz = cz + forward.z * t, py = cy + forward.y * t;
      const c = axis === 'z' ? px : pz;
      if (c < 0 || c > len || py < 0 || py > wh) continue;
      if (!best || t < best.t) best = { wall, c, t };
    }
    if (!best) {
      const { x, z } = fallbackLocal;
      const dists = { N: z, S: rc.h - z, W: x, E: rc.w - x };
      const wall = Object.keys(dists).sort((a, b) => dists[a] - dists[b])[0];
      best = { wall, c: (wall === 'N' || wall === 'S') ? x : z };
    }
    return best;
  }

  // ---------------------------------------------------------------
  // Compute hologram placement for current spec
  // ---------------------------------------------------------------
  computePlacement(spec, rc, camera, forward) {
    const snap = 0.25;
    const mode = spec.mode;
    const carriedId = this.carried ? this.carried.ref.id : null;
    const isLight = mode === 'light';
    const targetY = isLight ? (rc.floorHeight + 2.35) : rc.floorHeight;

    // Floor / ceiling intersection point
    const hitPos = new THREE.Vector3();
    let hitFound = false;
    if (isLight ? forward.y > 0.02 : forward.y < -0.02) {
      const t = (targetY - camera.position.y) / forward.y;
      if (t > 0 && t < 15) { hitPos.copy(camera.position).addScaledVector(forward, t); hitFound = true; }
    }
    if (!hitFound) {
      hitPos.x = camera.position.x + forward.x * 2.8;
      hitPos.z = camera.position.z + forward.z * 2.8;
    }
    const lx = Math.round((hitPos.x - rc.worldX) / snap) * snap;
    const lz = Math.round((hitPos.z - rc.worldZ) / snap) * snap;

    // --- Wall-bound: doors & wall-hung props -------------------------------
    if (mode === 'door' || mode === 'wall') {
      const aim = this.aimWall(rc, camera, forward, { x: hitPos.x - rc.worldX, z: hitPos.z - rc.worldZ });
      const len = (aim.wall === 'N' || aim.wall === 'S') ? rc.w : rc.h;
      const margin = mode === 'door' ? 0.8 : 0.5;
      const c = Math.min(Math.max(Math.round(aim.c / 0.05) * 0.05, margin), len - margin);
      const inset = mode === 'door' ? 0 : 0.05;
      const local = {
        N: { x: c, z: inset }, S: { x: c, z: rc.h - inset },
        W: { x: inset, z: c }, E: { x: rc.w - inset, z: c }
      }[aim.wall];
      let valid = true;
      let rotY;
      if (mode === 'door') {
        rotY = (aim.wall === 'N' || aim.wall === 'S') ? Math.PI / 2 : 0;
        for (const o of this.ctx.getStudioObjects()) {
          if (o.roomIdx !== rc.idx || o.id === carriedId) continue;
          const info = this.ctx.getWallDoorInfo(o, rc);
          if (info && info.wall === aim.wall && Math.abs(info.c - c) < 1.3) { valid = false; break; }
        }
      } else {
        rotY = WALL_ROT[aim.wall];
      }
      const worldY = mode === 'door' ? rc.floorHeight : rc.floorHeight + spec.y - spec.h / 2;
      return { valid, local, worldY, rotY, wall: aim.wall, c, mode };
    }

    // --- Table-top props (cups, clipboard): attach to aimed desk ------------
    if (mode === 'table') {
      const dh = this.deskHit;
      if (dh && dh.obj.id !== carriedId) {
        const parent = dh.obj;
        const prc = this.ctx.getRoomConfigs()[parent.roomIdx] || rc;
        const rot = this.ctx.getObjectRotation(parent);
        const dx = dh.point.x - prc.worldX - parent.x;
        const dz = dh.point.z - prc.worldZ - parent.z;
        const rx0 = dx * Math.cos(rot) - dz * Math.sin(rot);
        const rz0 = dx * Math.sin(rot) + dz * Math.cos(rot);
        const lim = (v, half) => Math.min(Math.max(Math.round(v / 0.05) * 0.05, -half), half);
        const relX = lim(rx0, Math.max((parent.w || 1) / 2 - 0.1, 0.05));
        const relZ = lim(rz0, Math.max((parent.d || 0.7) / 2 - 0.1, 0.05));
        const wx = parent.x + relX * Math.cos(rot) + relZ * Math.sin(rot);
        const wz = parent.z - relX * Math.sin(rot) + relZ * Math.cos(rot);
        return {
          valid: true, local: { x: wx, z: wz }, worldY: prc.floorHeight + 0.76, rotY: rot, mode,
          attach: { parent, relX, relZ }
        };
      }
      const inB = lx >= 0.05 && lx <= rc.w - 0.05 && lz >= 0.05 && lz <= rc.h - 0.05;
      return { valid: inB, local: { x: lx, z: lz }, worldY: rc.floorHeight, rotY: this.ghostRotation, mode, free: true };
    }

    // --- Floor furniture & ceiling lights ---------------------------------------
    const propW = spec.w || 0.8;
    const propD = spec.d || 0.8;
    const inBounds = (lx - propW / 2 >= 0.05) && (lx + propW / 2 <= rc.w - 0.05) &&
                     (lz - propD / 2 >= 0.05) && (lz + propD / 2 <= rc.h - 0.05);
    let hasCollision = false;
    if (!isLight) {
      for (const obj of this.ctx.getStudioObjects()) {
        if (obj.roomIdx !== rc.idx || obj.id === carriedId) continue;
        if (this.ctx.isWallDoorObj(obj)) continue; // wall-mounted doors never block the floor
        const ow = obj.w || 0.8, od = obj.d || 0.8;
        if (Math.abs(lx - obj.x) < ((propW + ow) / 2 - 0.06) && Math.abs(lz - obj.z) < ((propD + od) / 2 - 0.06)) {
          hasCollision = true;
          break;
        }
      }
    }
    return { valid: inBounds && !hasCollision, local: { x: lx, z: lz }, worldY: targetY, rotY: this.ghostRotation, mode };
  }

  update(dt) {
    if (!this.active) return;
    const camera = this.ctx.camera;
    const rc = this.ctx.getCurrentRoomConfig();
    if (!camera || !rc) return;

    this.updateAimedTarget(camera);
    this.updatePress();

    const spec = this.getSpec();
    if (this.ghostKey !== this.specKey(spec)) this.updateGhostMesh();

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const pl = this.computePlacement(spec, rc, camera, forward);
    this.placement = pl;
    this.isValidPlacement = pl.valid;
    this.currentLocal = { x: pl.local.x, z: pl.local.z };
    this.currentPosition.set(rc.worldX + pl.local.x, pl.worldY, rc.worldZ + pl.local.z);

    if (this.ghostGroup) {
      this.ghostGroup.position.copy(this.currentPosition);
      this.ghostGroup.rotation.y = pl.rotY;
    }
    this.setGhostValidity(pl.valid);
  }

  // ---------------------------------------------------------------
  // Long-press (hold-to-pickup) pointer handling
  // ---------------------------------------------------------------
  setRing(progress, visible) {
    const ring = document.getElementById('craft-hold-ring');
    if (!ring) return;
    ring.classList.toggle('hidden', !visible);
    const arc = document.getElementById('craft-hold-ring-arc');
    if (arc) arc.style.strokeDashoffset = String(RING_CIRC * (1 - Math.min(Math.max(progress, 0), 1)));
  }

  updatePress() {
    const p = this.press;
    if (!p || p.mode !== 'press' || p.consumed) return;
    const tid = this.aimedTarget ? this.aimedTarget.ref.id : null;
    const now = performance.now();
    if (tid !== p.targetId) { p.targetId = tid; p.t0 = now; }
    if (!tid) { this.setRing(0, false); return; }
    const held = now - p.t0;
    if (held >= HOLD_MS) {
      p.consumed = true;
      this.setRing(1, false);
      this.pickup(this.aimedTarget);
    } else if (held >= RING_START_MS) {
      this.setRing((held - RING_START_MS) / (HOLD_MS - RING_START_MS), true);
    }
  }

  onPointerDown() {
    if (!this.active || this.isCatalogOpen()) return;
    if (document.pointerLockElement !== this.ctx.renderer.domElement) {
      try {
        const p = this.ctx.renderer.domElement.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
      this.press = null;
      return;
    }
    this.press = {
      t0: performance.now(),
      mode: this.carried ? 'drop' : 'press',
      consumed: false,
      targetId: this.aimedTarget ? this.aimedTarget.ref.id : null
    };
  }

  onPointerUp() {
    const p = this.press;
    this.press = null;
    this.setRing(0, false);
    if (!p || !this.active) return;
    if (p.mode === 'drop') { this.dropCarried(); return; }
    if (p.consumed) return;
    if (performance.now() - p.t0 >= CLICK_MS) return; // mid-hold release does not accidentally place
    this.placeFromSlot();
  }

  // ---------------------------------------------------------------
  // Place new item from the active hotbar slot
  // ---------------------------------------------------------------
  refresh(extra) {
    this.ctx.rebuild3DRoom();
    this.ctx.render2DCadObjects();
    this.ctx.renderRoomSidebarAndProgress();
    this.ctx.updateCodeView();
    this.ctx.scheduleStudioAutosave();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
    if (extra) extra();
  }

  invalidFeedback() {
    if (this.ctx.playSfx) this.ctx.playSfx('spark');
    if (this.ctx.showDirectorWhisper) this.ctx.showDirectorWhisper('[배치 불가] 방 경계를 벗어났거나 다른 기물과 충돌합니다.');
  }

  placeFromSlot() {
    if (this.carried) return;
    const rc = this.ctx.getCurrentRoomConfig();
    const pl = this.placement;
    if (!rc || !pl) return;
    if (!pl.valid) { this.invalidFeedback(); return; }
    const e = this.getEntry();
    const lx = pl.local.x, lz = pl.local.z;

    if (e.kind === 'light') {
      if (!rc.lights) rc.lights = [];
      rc.lights.push({
        id: `light-craft-${Date.now().toString(36)}`,
        kind: 'fluorescent', pos: [lx, 2.35, lz], color: '#ffffff', intensity: 2.8, distance: 4.5, flicker: false
      });
      this.refresh(() => this.ctx.showDirectorWhisper?.('[천장 조명] 새로운 물리 광원이 추가되었습니다.'));
      return;
    }

    if (e.kind === 'onto') {
      const props = this.ctx.getPropOntology();
      const g = ONTO_GIMMICK[e.ontoType];
      const prop = {
        id: `prop-craft-onto-${Date.now().toString(36)}`,
        roomIdx: rc.idx, type: e.ontoType, name: e.label,
        gimmick: { kind: g.kind, data: JSON.parse(JSON.stringify(g.data)), description: `크래프트 빌더로 배치된 ${e.label}입니다.` }
      };
      this.applyPropPlacement(prop, pl, e.y, rc);
      props.push(prop);
      this.refresh(() => this.ctx.showDirectorWhisper?.(`[배치 완료] ${e.label}이(가) 배치되었습니다.`));
      return;
    }

    const studioObjects = this.ctx.getStudioObjects();
    const nextQ = studioObjects.reduce((m, o) => Math.max(m, o.qNum || 0), 0) + 1;
    const newObj = {
      qNum: nextQ,
      id: `prop-craft-${Date.now().toString(36)}`,
      roomIdx: rc.idx,
      type: e.type,
      modelPreset: e.modelPreset,
      name: `${e.label} #${nextQ}`,
      x: lx, z: lz, w: e.w, d: e.d,
      color: e.color || "#3b82f6",
      rotY: pl.rotY,
      clueId: `clue-craft-${nextQ}`, carrierType: "Text",
      cluePayload: `크래프트 빌더로 배치된 ${e.label}입니다.`,
      probId: `prob-craft-${nextQ}`, probRule: "관찰 및 상호작용",
      gateId: `gate-craft-${nextQ}`, interfaceType: "MechanicalLock", passcode: "1234",
      unlocksId: `cont-craft-${nextQ}`, unlocksName: "해금 보상",
      isBossDoor: false, solved: false,
      requiresSolvedId: null,
      storyBeat: `[크래프트] ${e.label} #${nextQ} 조사가 완료되었습니다.`,
      visualSpec: { template: "document", title: `${e.label} #${nextQ}`, lines: ["단서 메모를 확인하세요."] }
    };
    if (pl.mode === 'door') newObj.customPlaced = true;
    studioObjects.push(newObj);
    this.refresh(() => {
      this.ctx.selectObject(newObj.id);
      this.ctx.showDirectorWhisper?.(`[배치 완료] ${newObj.name}이(가) 배치되었습니다.`);
    });
  }

  // Write placement result (wall / table-attach / free) into an ontology prop
  applyPropPlacement(prop, pl, defaultY, rc) {
    if (pl.mode === 'wall') {
      prop.wallSnapped = true;
      prop.wallSide = pl.wall;
      prop.x = pl.local.x;
      prop.z = pl.local.z;
      prop.y = defaultY;
      prop.roomIdx = rc.idx;
      delete prop.tableSnapped; delete prop.targetParentId; delete prop.relX; delete prop.relZ;
    } else if (pl.attach) {
      prop.tableSnapped = true;
      prop.targetParentId = pl.attach.parent.id;
      prop.relX = pl.attach.relX;
      prop.relZ = pl.attach.relZ;
      prop.roomIdx = pl.attach.parent.roomIdx;
      delete prop.wallSnapped; delete prop.wallSide;
    } else {
      // Dragged away from any table: detach and sit on the floor
      prop.tableSnapped = false;
      delete prop.targetParentId; delete prop.relX; delete prop.relZ;
      delete prop.wallSnapped; delete prop.wallSide;
      prop.x = pl.local.x;
      prop.z = pl.local.z;
      prop.y = 0;
      prop.roomIdx = rc.idx;
    }
  }

  // ---------------------------------------------------------------
  // Pickup / drop / cancel (objects & ontology props)
  // ---------------------------------------------------------------
  pickup(target) {
    if (!target || this.carried) return;
    const ref = target.ref;
    let original;
    if (target.kind === 'obj') {
      original = { x: ref.x, z: ref.z, rotY: ref.rotY, roomIdx: ref.roomIdx, customPlaced: ref.customPlaced };
      this.ghostRotation = ref.rotY || 0;
    } else {
      original = {};
      PROP_RESTORE_KEYS.forEach(k => { original[k] = ref[k]; });
      this.ghostRotation = 0;
    }
    this.carried = { kind: target.kind, ref, original };
    this.ctx.carriedIds.add(ref.id);
    this.ctx.rebuild3DRoom(); // hides it (and attached props) and re-fills the wall behind a carried door
    this.updateHotbarUI();
    this.updateGhostMesh();
    if (this.ctx.playSfx) this.ctx.playSfx('click');
    this.ctx.showDirectorWhisper?.(`[집기] '${ref.name}'을 집었습니다. [좌클릭] 놓기 · [우클릭/ESC] 취소 · [Del] 삭제.`);
  }

  dropCarried() {
    const c = this.carried;
    const rc = this.ctx.getCurrentRoomConfig();
    const pl = this.placement;
    if (!c || !rc || !pl) return;
    if (!pl.valid) { this.invalidFeedback(); return; }
    const ref = c.ref;

    if (c.kind === 'obj') {
      if (this.ctx.isWallDoorObj(ref)) {
        // Detach the doorway it used to manage (natural passage flag), then re-anchor on the new wall
        const oldRc = this.ctx.getRoomConfigs()[c.original.roomIdx] || rc;
        const oldInfo = this.ctx.getWallDoorInfo(ref, oldRc);
        const moved = !oldInfo || oldRc.idx !== rc.idx || oldInfo.wall !== pl.wall || Math.abs(oldInfo.c - pl.c) > 0.05;
        if (moved && oldInfo) this.ctx.releaseNaturalOpening(oldRc, oldInfo);
        ref.customPlaced = true;
      }
      ref.x = pl.local.x;
      ref.z = pl.local.z;
      ref.rotY = pl.rotY;
      ref.roomIdx = rc.idx;
    } else {
      this.applyPropPlacement(ref, pl, ref.y || (PROP_DIM[ref.type] || {}).y, rc);
    }

    const id = ref.id, name = ref.name, kind = c.kind;
    this.carried = null;
    this.ctx.carriedIds.delete(id);
    this.refresh(() => {
      if (kind === 'obj') this.ctx.selectObject(id);
      this.ctx.showDirectorWhisper?.(`[재배치] '${name}' 위치가 변경되었습니다.`);
    });
    this.updateGhostMesh();
    this.updateHotbarUI();
  }

  cancelPickup(silent = false) {
    const c = this.carried;
    if (!c) return;
    const ref = c.ref;
    if (c.kind === 'obj') {
      Object.assign(ref, { x: c.original.x, z: c.original.z, rotY: c.original.rotY, roomIdx: c.original.roomIdx });
      if (c.original.customPlaced === undefined) delete ref.customPlaced;
      else ref.customPlaced = c.original.customPlaced;
    } else {
      PROP_RESTORE_KEYS.forEach(k => {
        if (c.original[k] === undefined) delete ref[k];
        else ref[k] = c.original[k];
      });
    }
    this.carried = null;
    this.ctx.carriedIds.delete(ref.id);
    this.ctx.rebuild3DRoom();
    if (!silent) {
      if (this.ctx.playSfx) this.ctx.playSfx('click');
      this.ctx.showDirectorWhisper?.(`[집기 취소] '${ref.name}' 위치가 복귀되었습니다.`);
    }
    this.updateGhostMesh();
    this.updateHotbarUI();
  }

  onRightClick() {
    if (!this.active) return;
    if (this.carried) this.cancelPickup();
  }

  onDelete() {
    if (!this.active) return;
    if (this.carried) {
      const c = this.carried;
      this.carried = null;
      this.ctx.carriedIds.delete(c.ref.id);
      if (c.kind === 'obj') this.ctx.deleteObjectById(c.ref.id);
      else this.ctx.deletePropById(c.ref.id);
      this.updateGhostMesh();
      this.updateHotbarUI();
      return;
    }
    const t = this.aimedTarget;
    if (t) {
      if (t.kind === 'obj') this.ctx.deleteObjectById(t.ref.id);
      else this.ctx.deletePropById(t.ref.id);
      this.aimedTarget = null;
      this.aimedProp = null;
    } else if (this.ctx.selectedObjectId) {
      this.ctx.deleteSelectedObject();
    }
  }
}
