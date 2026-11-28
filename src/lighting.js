import * as THREE from 'three';

// -------------------------------------------------------------
// Real Physical Light Fixtures System (src/lighting.js)
// Supports: wall-sconce, desk-lamp, pin-spot, fluorescent, ceiling,
//           surgical, emergency, lamp, candle
// Fixed Light Pool: mounts 4 PointLights + 4 SpotLights ONCE to scene
// so NUM_POINT_LIGHTS / NUM_SPOT_LIGHTS never change (0 shader recompiles).
// -------------------------------------------------------------

// Active fixture registry for animation, flicker, and director effects
export const activeFixtures = [];

let fpsLightingMultiplier = 1.0;
let isPlaytestMode = false;

// Three.js r155+ 물리 조명(candela, decay=2) 눈부심 없는 균형 보정 계수
const PHYSICAL_LIGHT_SCALE = 3.2;
const PIN_SPOT_SCALE = 9.5;
const BEAM_BASE_OPACITY = 0.085;

const WALL_SIDE_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

// Fixed Light Pool (4 Point + 4 Spot permanently mounted to scene)
const POINT_POOL_SIZE = 4;
const SPOT_POOL_SIZE = 4;
let _poolScene = null;
const _pointPool = [];
const _spotPool = [];
const _tmpWorldPos = new THREE.Vector3();
const _tmpTargetPos = new THREE.Vector3();

/**
 * Mount a fixed pool of 4 PointLights + 4 SpotLights (+ targets) once onto the scene.
 * Unused slots stay at intensity = 0 (never removed from scene -> 0 shader recompiles).
 */
export function initLightPool(scene) {
  if (!scene || _poolScene === scene) return;
  _poolScene = scene;
  _pointPool.length = 0;
  _spotPool.length = 0;

  for (let i = 0; i < POINT_POOL_SIZE; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 6.0, 2.0);
    pl.castShadow = false;
    pl.name = `lightPool_point_${i}`;
    pl.userData = { isLightPoolSlot: true, poolType: 'point', poolIndex: i };
    scene.add(pl);
    _pointPool.push(pl);
  }

  for (let i = 0; i < SPOT_POOL_SIZE; i++) {
    const sl = new THREE.SpotLight(0xffffff, 0, 6.5, Math.PI / 6.0, 0.45, 1.5);
    sl.castShadow = false;
    sl.name = `lightPool_spot_${i}`;
    sl.userData = { isLightPoolSlot: true, poolType: 'spot', poolIndex: i };
    const tgt = new THREE.Object3D();
    tgt.name = `lightPool_spotTarget_${i}`;
    scene.add(sl);
    scene.add(tgt);
    sl.target = tgt;
    _spotPool.push(sl);
  }
}

function isObjectChainVisible(obj) {
  let cur = obj;
  while (cur) {
    if (cur.visible === false) return false;
    cur = cur.parent;
  }
  return true;
}

/**
 * Bind currently active (isOn === true) fixtures to the fixed Point/Spot light pool slots,
 * prioritizing fixtures in currentRoomIdx and closest to focusPos.
 */
export function syncLightPool(focusPos = null, currentRoomIdx = null) {
  if (!_poolScene) return;

  const pointCandidates = [];
  const spotCandidates = [];

  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    if (!f.isOn || f.currentIntensity <= 0 || !f.group || !f.group.parent) continue;
    if (!isObjectChainVisible(f.group)) continue;

    f.group.updateWorldMatrix(true, false);
    _tmpWorldPos.copy(f.lightOffset).applyMatrix4(f.group.matrixWorld);

    const sameRoom = (currentRoomIdx !== null && currentRoomIdx !== undefined && f.roomIdx === currentRoomIdx) ? 0 : 1;
    const distSq = focusPos ? focusPos.distanceToSquared(_tmpWorldPos) : 0;
    const entry = { f, sameRoom, distSq, wx: _tmpWorldPos.x, wy: _tmpWorldPos.y, wz: _tmpWorldPos.z };

    if (f.lightType === 'spot') {
      spotCandidates.push(entry);
    } else {
      pointCandidates.push(entry);
    }
  }

  const cmp = (a, b) => (a.sameRoom - b.sameRoom) || (a.distSq - b.distSq);
  if (pointCandidates.length > POINT_POOL_SIZE) pointCandidates.sort(cmp);
  if (spotCandidates.length > SPOT_POOL_SIZE) spotCandidates.sort(cmp);

  for (let i = 0; i < _pointPool.length; i++) {
    const slot = _pointPool[i];
    if (i < pointCandidates.length) {
      const c = pointCandidates[i];
      const f = c.f;
      slot.position.set(c.wx, c.wy, c.wz);
      slot.color.setHex(f.baseColor);
      slot.intensity = f.currentIntensity;
      slot.distance = f.distance;
      slot.decay = f.decay;
    } else {
      slot.intensity = 0;
    }
  }

  for (let i = 0; i < _spotPool.length; i++) {
    const slot = _spotPool[i];
    if (i < spotCandidates.length) {
      const c = spotCandidates[i];
      const f = c.f;
      slot.position.set(c.wx, c.wy, c.wz);
      _tmpTargetPos.copy(f.spotTargetOffset).applyMatrix4(f.group.matrixWorld);
      slot.target.position.copy(_tmpTargetPos);
      slot.target.updateMatrixWorld();
      slot.color.setHex(f.baseColor);
      slot.intensity = f.currentIntensity;
      slot.distance = f.distance;
      slot.angle = f.angle;
      slot.penumbra = f.penumbra;
      slot.decay = f.decay;
    } else {
      slot.intensity = 0;
    }
  }
}

// Pooled shared fixture housing Materials & static Geometries (never disposed by disposeObject3D)
let _sharedFixtureAssets = null;
const _beamGeoCache = new Map();
function getSharedBeamGeo(beamH) {
  const qH = Math.round(beamH * 20) / 20;
  let geo = _beamGeoCache.get(qH);
  if (!geo) {
    geo = markShared(new THREE.ConeGeometry(0.72, qH, 20, 1, true));
    _beamGeoCache.set(qH, geo);
  }
  return geo;
}
function markShared(obj) {
  obj.userData = obj.userData || {};
  obj.userData.shared = true;
  return obj;
}
function getSharedFixtureAssets() {
  if (_sharedFixtureAssets) return _sharedFixtureAssets;
  const fluorTubeGeo = markShared(new THREE.CylinderGeometry(0.024, 0.024, 1.1, 12));
  fluorTubeGeo.rotateZ(Math.PI / 2);
  const surgLensGeo = markShared(new THREE.CircleGeometry(0.26, 20));
  surgLensGeo.rotateX(Math.PI / 2);
  const candleFlameGeo = markShared(new THREE.SphereGeometry(0.02, 8, 8));
  candleFlameGeo.scale(0.8, 1.8, 0.8);

  _sharedFixtureAssets = {
    mats: {
      metal: markShared(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 })),
      plate: markShared(new THREE.MeshStandardMaterial({
        color: 0x292524, metalness: 0.8, roughness: 0.35,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      })),
      brass: markShared(new THREE.MeshStandardMaterial({ color: 0x8c6838, metalness: 0.82, roughness: 0.28 })),
      bronze: markShared(new THREE.MeshStandardMaterial({ color: 0x785a32, metalness: 0.82, roughness: 0.28 })),
      deskShade: markShared(new THREE.MeshStandardMaterial({ color: 0x1e3a2f, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide })),
      canister: markShared(new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85, roughness: 0.3 })),
      chrome: markShared(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 })),
      emergBase: markShared(new THREE.MeshStandardMaterial({
        color: 0x1f2937, metalness: 0.7, roughness: 0.5,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      })),
      guard: markShared(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 })),
      lampShade: markShared(new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85, side: THREE.DoubleSide })),
      candle: markShared(new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 }))
    },
    geos: {
      sconceBackplate: markShared(new THREE.BoxGeometry(0.11, 0.22, 0.025)),
      sconceArm: markShared(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 10)),
      sconceCollar: markShared(new THREE.CylinderGeometry(0.032, 0.024, 0.04, 12)),
      sconceShade: markShared(new THREE.CylinderGeometry(0.068, 0.048, 0.13, 16, 1, true)),
      sconceBulb: markShared(new THREE.SphereGeometry(0.032, 12, 12)),
      deskBase: markShared(new THREE.CylinderGeometry(0.075, 0.09, 0.025, 16)),
      deskStem: markShared(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 10)),
      deskShade: markShared(new THREE.ConeGeometry(0.145, 0.13, 18, 1, true)),
      deskBulb: markShared(new THREE.SphereGeometry(0.036, 12, 12)),
      pinMount: markShared(new THREE.CylinderGeometry(0.055, 0.065, 0.04, 14)),
      pinCanister: markShared(new THREE.CylinderGeometry(0.052, 0.064, 0.18, 16)),
      pinLens: markShared(new THREE.CircleGeometry(0.054, 16)),
      ceilFrame: markShared(new THREE.BoxGeometry(0.95, 0.05, 0.55)),
      ceilDiffuser: markShared(new THREE.BoxGeometry(0.86, 0.02, 0.46)),
      fluorTrough: markShared(new THREE.BoxGeometry(1.2, 0.08, 0.28)),
      fluorTube: fluorTubeGeo,
      surgArm: markShared(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8)),
      surgDome: markShared(new THREE.CylinderGeometry(0.42, 0.28, 0.14, 24)),
      surgLens: surgLensGeo,
      emergBase: markShared(new THREE.BoxGeometry(0.24, 0.16, 0.10)),
      emergLens: markShared(new THREE.BoxGeometry(0.18, 0.10, 0.08)),
      emergGuard: markShared(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6)),
      lampCord: markShared(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 8)),
      lampShade: markShared(new THREE.ConeGeometry(0.20, 0.18, 16, 1, true)),
      lampBulb: markShared(new THREE.SphereGeometry(0.045, 12, 12)),
      candleBody: markShared(new THREE.CylinderGeometry(0.025, 0.028, 0.12, 12)),
      candleFlame: candleFlameGeo
    }
  };
  return _sharedFixtureAssets;
}

function setEmissiveIntensity(emissiveMesh, val) {
  if (!emissiveMesh) return;
  if (emissiveMesh.material) {
    emissiveMesh.material.emissiveIntensity = val;
  } else if (emissiveMesh.children) {
    for (let j = 0; j < emissiveMesh.children.length; j++) {
      const c = emissiveMesh.children[j];
      if (c.material) c.material.emissiveIntensity = val;
    }
  }
}

export function getLightTargetPropIds(lightDef) {
  if (!lightDef) return [];
  const out = [];
  if (typeof lightDef.targetPropId === 'string' && lightDef.targetPropId) {
    out.push(lightDef.targetPropId);
  }
  if (Array.isArray(lightDef.targetPropIds)) {
    for (let i = 0; i < lightDef.targetPropIds.length; i++) {
      const id = lightDef.targetPropIds[i];
      if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/**
 * Set FPS mode physical lighting dim multiplier (dim fixtures so flashlight cone dominates)
 */
export function setFpsLightingMultiplier(mult) {
  fpsLightingMultiplier = (typeof mult === 'number') ? mult : 1.0;
}

/**
 * Count currently active (lit) pooled lights
 */
export function getMountedLightCount() {
  let count = 0;
  for (let i = 0; i < _pointPool.length; i++) {
    if (_pointPool[i].intensity > 0) count++;
  }
  for (let i = 0; i < _spotPool.length; i++) {
    if (_spotPool[i].intensity > 0) count++;
  }
  return count;
}

/**
 * Check if any fixture has a transient ignition spark animation currently running.
 * Used by Orbit On-Demand renderer so static idle frames skip redundant renders.
 */
export function hasActiveLightingAnimation(nowMs = performance.now()) {
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    if (f.isOn && f.igniteUntil > nowMs) return true;
  }
  return false;
}

/**
 * 3D Fixture Mesh Factory
 * Builds physical housing + emissive bulb/tube/shade bound dynamically to the Fixed Light Pool
 */
export function createLightFixtureMesh(lightDef, roomIdx = null) {
  const group = new THREE.Group();
  group.name = `fixture_${lightDef.id}`;
  group.position.set(lightDef.pos[0], lightDef.pos[1], lightDef.pos[2]);

  const colorHex = (typeof lightDef.color === 'string' && lightDef.color.startsWith('#'))
    ? parseInt(lightDef.color.slice(1), 16)
    : (typeof lightDef.color === 'number' ? lightDef.color : 0xffffff);

  const rawKind = lightDef.fixtureType || lightDef.kind || 'fluorescent';
  // Legacy 'lamp' placed at desk height automatically renders as 'desk-lamp'
  const fixtureType = (rawKind === 'lamp' && lightDef.pos[1] < 1.65) ? 'desk-lamp' : rawKind;
  const intensity = typeof lightDef.intensity === 'number' ? lightDef.intensity : 1.2;
  const distance = typeof lightDef.distance === 'number' ? lightDef.distance : 6.0;

  let housingMesh = null;
  let emissiveMesh = null;
  let beamMesh = null;

  // Pool descriptor parameters (no per-fixture Three.js Light mounted to scene!)
  let lightType = 'point';
  const lightOffset = new THREE.Vector3(0, -0.08, 0);
  const spotTargetOffset = new THREE.Vector3(0, -2.0, 0);
  let lightDistance = distance;
  let lightDecay = 2.0;
  let lightAngle = Math.PI / 6.0;
  let lightPenumbra = 0.45;

  const { mats: sharedMats, geos: sharedGeos } = getSharedFixtureAssets();
  const metalMat = sharedMats.metal;

  if (fixtureType === 'wall-sconce') {
    const rotY = WALL_SIDE_ROT[lightDef.wallSide] || 0;
    group.rotation.y = rotY;

    const backplate = new THREE.Mesh(sharedGeos.sconceBackplate, sharedMats.plate);
    backplate.position.set(0, 0, 0.015);

    const arm = new THREE.Mesh(sharedGeos.sconceArm, sharedMats.brass);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0.01, 0.095);

    const collar = new THREE.Mesh(sharedGeos.sconceCollar, sharedMats.brass);
    collar.position.set(0, 0.03, 0.17);

    const shade = new THREE.Mesh(
      sharedGeos.sconceShade,
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: colorHex,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide
      })
    );
    shade.position.set(0, 0.105, 0.17);

    const bulb = new THREE.Mesh(
      sharedGeos.sconceBulb,
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 1.8,
        roughness: 0.15
      })
    );
    bulb.position.set(0, 0.095, 0.17);

    housingMesh = new THREE.Group();
    housingMesh.add(backplate, arm, collar);
    emissiveMesh = new THREE.Group();
    emissiveMesh.add(shade, bulb);
    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDistance = Math.max(distance, 4.5);
    lightDecay = 2.0;
    lightOffset.set(0, 0.08, 0.26);

  } else if (fixtureType === 'desk-lamp') {
    const base = new THREE.Mesh(sharedGeos.deskBase, sharedMats.bronze);
    base.position.y = 0.0125;

    const stem = new THREE.Mesh(sharedGeos.deskStem, sharedMats.bronze);
    stem.position.set(0, 0.18, -0.02);
    stem.rotation.x = 0.16;

    const shade = new THREE.Mesh(sharedGeos.deskShade, sharedMats.deskShade);
    shade.position.set(0, 0.34, 0.03);

    const bulb = new THREE.Mesh(
      sharedGeos.deskBulb,
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 1.9,
        roughness: 0.15
      })
    );
    bulb.position.set(0, 0.31, 0.03);

    housingMesh = new THREE.Group();
    housingMesh.add(base, stem, shade);
    emissiveMesh = bulb;
    group.add(housingMesh, emissiveMesh);

    lightType = 'spot';
    lightDistance = Math.max(distance, 3.8);
    lightAngle = Math.PI / 3.4;
    lightPenumbra = 0.58;
    lightDecay = 1.8;
    lightOffset.set(0, 0.31, 0.03);
    spotTargetOffset.set(0, -0.55, 0.10);

  } else if (fixtureType === 'pin-spot') {
    const mount = new THREE.Mesh(sharedGeos.pinMount, metalMat);
    mount.position.y = 0.02;

    const targetVec = new THREE.Vector3(0, -2.0, 0);
    if (Array.isArray(lightDef.targetPos) && lightDef.targetPos.length === 3) {
      targetVec.set(
        lightDef.targetPos[0] - lightDef.pos[0],
        lightDef.targetPos[1] - lightDef.pos[1],
        lightDef.targetPos[2] - lightDef.pos[2]
      );
    }
    const aimLen = Math.max(1.2, Math.min(3.2, targetVec.length()));
    const aimDir = targetVec.clone().normalize();
    const downAxis = new THREE.Vector3(0, -1, 0);
    const aimQuat = new THREE.Quaternion().setFromUnitVectors(downAxis, aimDir);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, -0.05, 0);
    headGroup.quaternion.copy(aimQuat);

    const canister = new THREE.Mesh(sharedGeos.pinCanister, sharedMats.canister);
    canister.position.y = -0.04;
    const lens = new THREE.Mesh(
      sharedGeos.pinLens,
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 2.0,
        roughness: 0.1
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.132;
    headGroup.add(canister, lens);

    housingMesh = new THREE.Group();
    housingMesh.add(mount, canister);
    emissiveMesh = lens;
    group.add(mount, headGroup);

    lightType = 'spot';
    lightDistance = Math.max(distance, 6.5);
    lightAngle = Math.PI / 6.8;
    lightPenumbra = 0.40;
    lightDecay = 1.5;
    lightOffset.set(0, -0.06, 0);
    spotTargetOffset.copy(targetVec);

    // Subtle volumetric cone aligned along aimDir
    const beamH = Math.min(2.35, aimLen * 0.92);
    const beamGeo = getSharedBeamGeo(beamH);
    const beamMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: BEAM_BASE_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.name = `volumetricBeam_${lightDef.id}`;
    beamMesh.position.copy(aimDir.clone().multiplyScalar(beamH * 0.5 + 0.08));
    beamMesh.quaternion.copy(aimQuat);
    beamMesh.raycast = () => {}; // Never block prop click raycasting
    group.add(beamMesh);

  } else if (fixtureType === 'ceiling') {
    const frame = new THREE.Mesh(sharedGeos.ceilFrame, metalMat);
    frame.position.y = 0.025;
    const diffuser = new THREE.Mesh(
      sharedGeos.ceilDiffuser,
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 1.5,
        roughness: 0.25
      })
    );
    diffuser.position.y = -0.005;
    housingMesh = frame;
    emissiveMesh = diffuser;
    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.0;
    lightOffset.set(0, -0.08, 0);

  } else if (fixtureType === 'fluorescent') {
    housingMesh = new THREE.Mesh(sharedGeos.fluorTrough, metalMat);
    housingMesh.position.y = 0.04;

    const tubeMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.6,
      roughness: 0.2
    });

    const tube1 = new THREE.Mesh(sharedGeos.fluorTube, tubeMat);
    tube1.position.set(0, -0.01, -0.07);
    const tube2 = new THREE.Mesh(sharedGeos.fluorTube, tubeMat);
    tube2.position.set(0, -0.01, 0.07);

    emissiveMesh = new THREE.Group();
    emissiveMesh.add(tube1, tube2);
    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.2;
    lightOffset.set(0, -0.08, 0);

  } else if (fixtureType === 'surgical') {
    const arm = new THREE.Mesh(sharedGeos.surgArm, metalMat);
    arm.position.y = 0.175;

    const dome = new THREE.Mesh(sharedGeos.surgDome, sharedMats.chrome);
    dome.position.y = 0.0;

    housingMesh = new THREE.Group();
    housingMesh.add(arm, dome);

    const lensMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 2.2,
      roughness: 0.1
    });
    emissiveMesh = new THREE.Mesh(sharedGeos.surgLens, lensMat);
    emissiveMesh.position.y = -0.071;

    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.2;
    lightOffset.set(0, -0.12, 0);

  } else if (fixtureType === 'emergency') {
    if (lightDef.wallSide && WALL_SIDE_ROT[lightDef.wallSide] !== undefined) {
      group.rotation.y = WALL_SIDE_ROT[lightDef.wallSide];
    }
    housingMesh = new THREE.Mesh(sharedGeos.emergBase, sharedMats.emergBase);
    housingMesh.position.z = 0.05;

    const emMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.5,
      roughness: 0.25
    });
    emissiveMesh = new THREE.Mesh(sharedGeos.emergLens, emMat);
    emissiveMesh.position.z = 0.10;

    for (let gx = -0.06; gx <= 0.06; gx += 0.04) {
      const bar = new THREE.Mesh(sharedGeos.emergGuard, sharedMats.guard);
      bar.position.set(gx, 0, 0.145);
      group.add(bar);
    }

    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.0;
    lightOffset.set(0, 0, 0.20);

  } else if (fixtureType === 'lamp') {
    const cord = new THREE.Mesh(sharedGeos.lampCord, metalMat);
    cord.position.y = 0.13;

    housingMesh = new THREE.Mesh(sharedGeos.lampShade, sharedMats.lampShade);
    housingMesh.position.y = -0.02;

    const bulbMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });
    emissiveMesh = new THREE.Mesh(sharedGeos.lampBulb, bulbMat);
    emissiveMesh.position.y = -0.07;

    group.add(cord, housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.2;
    lightOffset.set(0, -0.14, 0);

  } else {
    housingMesh = new THREE.Mesh(sharedGeos.candleBody, sharedMats.candle);
    housingMesh.position.y = 0.06;

    const flameMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 2.5
    });
    emissiveMesh = new THREE.Mesh(sharedGeos.candleFlame, flameMat);
    emissiveMesh.position.y = 0.14;

    group.add(housingMesh, emissiveMesh);

    lightType = 'point';
    lightDecay = 2.2;
    lightOffset.set(0, 0.16, 0);
  }

  const isOn = (lightDef.initiallyOn !== false);
  const spotScaleFactor = (fixtureType === 'desk-lamp') ? 0.55 : 1.0;

  const fixtureEntry = {
    id: lightDef.id,
    kind: fixtureType,
    fixtureType,
    lightDef,
    roomIdx,
    group,
    lightType,
    lightOffset,
    spotTargetOffset,
    distance: lightDistance,
    decay: lightDecay,
    angle: lightAngle,
    penumbra: lightPenumbra,
    currentIntensity: 0,
    beamMesh,
    isPinSpot: fixtureType === 'pin-spot',
    spotScaleFactor,
    emissiveMesh,
    baseIntensity: intensity,
    baseColor: colorHex,
    flicker: !!lightDef.flicker,
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: 7.0 + Math.random() * 8.0,
    directorDimMultiplier: 1.0,
    isOn,
    igniteUntil: 0
  };

  if (!isOn) {
    fixtureEntry.currentIntensity = 0;
    if (beamMesh) beamMesh.visible = false;
    setEmissiveIntensity(emissiveMesh, isPlaytestMode ? 0.04 : 0.18);
  } else {
    const mult = fixtureEntry.directorDimMultiplier * fpsLightingMultiplier;
    fixtureEntry.currentIntensity = lightType === 'spot'
      ? Math.max(0.01, intensity * PIN_SPOT_SCALE * spotScaleFactor * mult)
      : Math.max(0.01, intensity * PHYSICAL_LIGHT_SCALE * mult);
    if (beamMesh) beamMesh.visible = true;
  }

  activeFixtures.push(fixtureEntry);
  return group;
}

/**
 * Clear all active fixtures before scene rebuild (resets pool intensities without removing lights)
 */
export function clearActiveFixtures() {
  activeFixtures.length = 0;
  for (let i = 0; i < _pointPool.length; i++) _pointPool[i].intensity = 0;
  for (let i = 0; i < _spotPool.length; i++) _spotPool[i].intensity = 0;
}

/**
 * Setup Real Physical Fixtures inside Room Group
 */
export function setupRoomLightFixtures(roomGroup, rc) {
  if (!rc.lights || !Array.isArray(rc.lights)) return;
  rc.lights.forEach(lt => {
    const fixtureGroup = createLightFixtureMesh(lt, rc.idx);
    roomGroup.add(fixtureGroup);
  });
}

/**
 * Setup Corridor and Stairwell Physical Light Fixtures
 */
export function setupCorridorLightFixtures(cGroup1f, cGroup2f, stairGroup) {
  if (cGroup1f) {
    const fl1 = createLightFixtureMesh({
      id: 'light-corr-1f-01',
      kind: 'fluorescent',
      pos: [1.5, 2.52, 2.5],
      color: '#38bdf8',
      intensity: 0.95,
      distance: 6.0,
      flicker: true,
      initiallyOn: true
    }, null);
    cGroup1f.add(fl1);
  }

  if (cGroup2f) {
    const fl2 = createLightFixtureMesh({
      id: 'light-corr-2f-01',
      kind: 'emergency',
      pos: [1.5, 2.48, 0.08],
      wallSide: 'N',
      color: '#ef4444',
      intensity: 0.85,
      distance: 5.5,
      flicker: true,
      initiallyOn: false
    }, null);
    cGroup2f.add(fl2);
  }

  if (stairGroup) {
    const stLight = createLightFixtureMesh({
      id: 'light-stair-01',
      kind: 'fluorescent',
      pos: [1.25, 3.8, 2.5],
      color: '#e2e8f0',
      intensity: 1.1,
      distance: 7.0,
      flicker: true,
      initiallyOn: false
    }, null);
    stairGroup.add(stLight);
  }
}

/**
 * Turn a physical light fixture ON or OFF, with optional fluorescent spark flicker-in (~450ms)
 * Updates pool binding immediately without adding/removing lights from the scene.
 */
export function setLightFixtureOn(lightId, isOn, withSpark = false) {
  const nextOn = !!isOn;
  let matched = false;
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    if (f.id !== lightId) continue;
    matched = true;
    f.isOn = nextOn;
    if (nextOn) {
      f.igniteUntil = withSpark ? (performance.now() + 450) : 0;
      const mult = f.directorDimMultiplier * fpsLightingMultiplier;
      f.currentIntensity = f.lightType === 'spot'
        ? Math.max(0.01, f.baseIntensity * PIN_SPOT_SCALE * f.spotScaleFactor * mult)
        : Math.max(0.01, f.baseIntensity * PHYSICAL_LIGHT_SCALE * mult);
      if (f.beamMesh) {
        f.beamMesh.visible = true;
        if (f.beamMesh.material) f.beamMesh.material.opacity = BEAM_BASE_OPACITY;
      }
      setEmissiveIntensity(f.emissiveMesh, Math.max(0.05, 0.95 * mult));
    } else {
      f.igniteUntil = 0;
      f.currentIntensity = 0;
      if (f.beamMesh) f.beamMesh.visible = false;
      setEmissiveIntensity(f.emissiveMesh, isPlaytestMode ? 0.04 : 0.18);
    }
  }
  if (matched) syncLightPool();
  return matched;
}

export const setFixtureLightState = setLightFixtureOn;

/**
 * 문제 유도 의의에 충실: 대상 퍼즐(targetPropId / targetPropIds)이 해금되면 해당 유도 조명을 자동 소등한다.
 * 단, 같은 조명을 공유하는 미해결 문제가 남아 있으면(solvedIds 기준) 소등하지 않고 유지한다.
 */
export function extinguishGuidanceLightsForProp(propId, solvedIds = null) {
  if (!propId) return 0;
  let count = 0;
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    if (!f.isOn || !f.lightDef) continue;
    const targets = getLightTargetPropIds(f.lightDef);
    if (!targets.includes(propId)) continue;
    if (solvedIds && targets.length > 1) {
      const hasRemainingUnsolved = targets.some(tid => tid !== propId && !solvedIds.has(tid));
      if (hasRemainingUnsolved) continue;
    }
    setLightFixtureOn(f.id, false, false);
    count++;
  }
  return count;
}

/**
 * Reset all physical light fixtures when switching between Author and Playtest modes
 */
export function resetAllLightsForMode(isPlaytest) {
  isPlaytestMode = !!isPlaytest;
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    f.isOn = (f.lightDef.initiallyOn !== false);
    f.igniteUntil = 0;
    if (!f.isOn) {
      f.currentIntensity = 0;
      if (f.beamMesh) f.beamMesh.visible = false;
      setEmissiveIntensity(f.emissiveMesh, isPlaytestMode ? 0.04 : 0.18);
    } else {
      const mult = f.directorDimMultiplier * fpsLightingMultiplier;
      f.currentIntensity = f.lightType === 'spot'
        ? Math.max(0.01, f.baseIntensity * PIN_SPOT_SCALE * f.spotScaleFactor * mult)
        : Math.max(0.01, f.baseIntensity * PHYSICAL_LIGHT_SCALE * mult);
      if (f.beamMesh) {
        f.beamMesh.visible = true;
        if (f.beamMesh.material) f.beamMesh.material.opacity = BEAM_BASE_OPACITY;
      }
      setEmissiveIntensity(f.emissiveMesh, Math.max(0.05, 1.05 * mult));
    }
  }
  syncLightPool();
}

/**
 * Animate subtle realistic flicker and spark ignition, then sync Fixed Light Pool.
 */
export function updateLightFixtures(timeSec, focusPos = null, currentRoomIdx = null, allowFlicker = true) {
  const nowMs = performance.now();
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];

    if (!f.isOn) {
      f.currentIntensity = 0;
      if (f.beamMesh) f.beamMesh.visible = false;
      setEmissiveIntensity(f.emissiveMesh, isPlaytestMode ? 0.04 : 0.18);
      continue;
    }

    if (f.igniteUntil > 0) {
      if (nowMs < f.igniteUntil) {
        const progress = 1.0 - (f.igniteUntil - nowMs) / 450.0;
        const sparkOn = (Math.sin(nowMs * 0.095 + f.flickerPhase) > -0.15) || (progress > 0.78);
        const burst = sparkOn ? (0.45 + 0.95 * progress) : 0.04;
        const mult = f.directorDimMultiplier * fpsLightingMultiplier;
        f.currentIntensity = f.lightType === 'spot'
          ? Math.max(0, f.baseIntensity * PIN_SPOT_SCALE * f.spotScaleFactor * burst * mult)
          : Math.max(0, f.baseIntensity * PHYSICAL_LIGHT_SCALE * burst * mult);
        if (f.beamMesh) {
          f.beamMesh.visible = sparkOn;
          if (f.beamMesh.material) f.beamMesh.material.opacity = Math.min(0.12, BEAM_BASE_OPACITY * burst);
        }
        setEmissiveIntensity(f.emissiveMesh, Math.max(0.06, 1.15 * burst * mult));
        continue;
      } else {
        f.igniteUntil = 0;
      }
    }

    let flickerMod = 1.0;

    if (allowFlicker && f.flicker) {
      const wave = Math.sin(timeSec * f.flickerSpeed + f.flickerPhase);
      const wave2 = Math.cos(timeSec * (f.flickerSpeed * 2.3) + f.flickerPhase);
      flickerMod = 0.88 + 0.12 * wave;
      if (Math.sin(timeSec * 3.7 + f.flickerPhase * 1.7) > 0.94) {
        flickerMod *= (0.25 + 0.3 * Math.random());
      } else if (wave2 > 0.92) {
        flickerMod *= 1.25;
      }
    }

    const mult = flickerMod * f.directorDimMultiplier * fpsLightingMultiplier;
    f.currentIntensity = f.lightType === 'spot'
      ? Math.max(0.01, f.baseIntensity * PIN_SPOT_SCALE * f.spotScaleFactor * mult)
      : Math.max(0.01, f.baseIntensity * PHYSICAL_LIGHT_SCALE * mult);
    if (f.beamMesh) {
      f.beamMesh.visible = true;
      if (f.beamMesh.material) {
        f.beamMesh.material.opacity = Math.max(0.03, Math.min(0.11, BEAM_BASE_OPACITY * flickerMod * f.directorDimMultiplier));
      }
    }

    const emIntensity = Math.max(0.05, 1.5 * mult);
    setEmissiveIntensity(f.emissiveMesh, emIntensity);
  }

  syncLightPool(focusPos, currentRoomIdx);
}

export const tickLightingAnimations = updateLightFixtures;

/**
 * Set Director Blackout / Poltergeist intensity multiplier across all physical fixtures
 * mult: 0.0 (near blackout) ~ 1.0 (normal)
 */
export function setDirectorLightMultiplier(mult) {
  const safeMult = Math.max(0.0, Math.min(2.0, mult));
  for (let i = 0; i < activeFixtures.length; i++) {
    activeFixtures[i].directorDimMultiplier = safeMult;
  }
}
