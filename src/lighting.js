import * as THREE from 'three';

// -------------------------------------------------------------
// Real Physical Light Fixtures System (src/lighting.js)
// -------------------------------------------------------------

// Active fixture registry for animation, flicker, and director effects
export const activeFixtures = [];

let fpsLightingMultiplier = 1.0;

/**
 * Set FPS mode physical lighting dim multiplier (dim fixtures so flashlight cone dominates)
 */
export function setFpsLightingMultiplier(mult) {
  fpsLightingMultiplier = (typeof mult === 'number') ? mult : 1.0;
}

/**
 * 3D Fixture Mesh Factory
 * Builds physical housing + emissive bulb/tube/shade paired with THREE.PointLight
 */
export function createLightFixtureMesh(lightDef, roomIdx = null) {
  const group = new THREE.Group();
  group.name = `fixture_${lightDef.id}`;
  group.position.set(lightDef.pos[0], lightDef.pos[1], lightDef.pos[2]);

  const colorHex = (typeof lightDef.color === 'string' && lightDef.color.startsWith('#'))
    ? parseInt(lightDef.color.slice(1), 16)
    : (typeof lightDef.color === 'number' ? lightDef.color : 0xffffff);

  const kind = lightDef.kind || 'fluorescent';
  const intensity = typeof lightDef.intensity === 'number' ? lightDef.intensity : 1.2;
  const distance = typeof lightDef.distance === 'number' ? lightDef.distance : 6.0;

  let housingMesh = null;
  let emissiveMesh = null;
  let pointLight = null;

  // Physically-attenuated PointLight (decay = 2 for inverse-square physical falloff)
  pointLight = new THREE.PointLight(colorHex, intensity, distance, 2.0);
  pointLight.castShadow = false; // Horror soft fill; FPS flashlight owns real-time shadow casting
  pointLight.name = `pointLight_${lightDef.id}`;

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.85,
    roughness: 0.35
  });

  if (kind === 'fluorescent') {
    // Ceiling industrial fluorescent trough + dual emissive tubes
    const troughGeo = new THREE.BoxGeometry(1.2, 0.08, 0.28);
    housingMesh = new THREE.Mesh(troughGeo, metalMat);
    housingMesh.position.y = 0.04;

    const tubeMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.6,
      roughness: 0.2
    });

    const tubeGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.1, 12);
    tubeGeo.rotateZ(Math.PI / 2);
    const tube1 = new THREE.Mesh(tubeGeo, tubeMat);
    tube1.position.set(0, -0.01, -0.07);
    const tube2 = new THREE.Mesh(tubeGeo, tubeMat);
    tube2.position.set(0, -0.01, 0.07);

    emissiveMesh = new THREE.Group();
    emissiveMesh.add(tube1, tube2);
    group.add(housingMesh, emissiveMesh);
    pointLight.position.set(0, -0.08, 0);

  } else if (kind === 'surgical') {
    // Medical Surgical Overhead Scialytic Dome + articulated arm + high-intensity bulb
    const armGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.y = 0.175;

    const domeGeo = new THREE.CylinderGeometry(0.42, 0.28, 0.14, 24);
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 });
    const dome = new THREE.Mesh(domeGeo, chromeMat);
    dome.position.y = 0.0;

    housingMesh = new THREE.Group();
    housingMesh.add(arm, dome);

    const lensGeo = new THREE.CircleGeometry(0.26, 20);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 2.2,
      roughness: 0.1
    });
    emissiveMesh = new THREE.Mesh(lensGeo, lensMat);
    emissiveMesh.position.y = -0.071;

    group.add(housingMesh, emissiveMesh);
    pointLight.position.set(0, -0.12, 0);

  } else if (kind === 'emergency') {
    // Wall/Ceiling Bulkhead emergency cage with deep crimson/amber beacon lens
    const baseGeo = new THREE.BoxGeometry(0.24, 0.16, 0.12);
    housingMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.5 }));

    const lensGeo = new THREE.BoxGeometry(0.18, 0.10, 0.08);
    const emMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.5,
      roughness: 0.25
    });
    emissiveMesh = new THREE.Mesh(lensGeo, emMat);
    emissiveMesh.position.z = 0.05;

    // Protective wire guard bars
    const guardGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    for (let gx = -0.06; gx <= 0.06; gx += 0.04) {
      const bar = new THREE.Mesh(guardGeo, guardMat);
      bar.position.set(gx, 0, 0.095);
      group.add(bar);
    }

    group.add(housingMesh, emissiveMesh);
    pointLight.position.set(0, 0, 0.12);

  } else if (kind === 'lamp') {
    // Desk or Bedside Shaded Lamp / Sconce
    const standGeo = new THREE.CylinderGeometry(0.015, 0.03, 0.32, 10);
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x785a32, metalness: 0.8, roughness: 0.3 });
    const stand = new THREE.Mesh(standGeo, bronzeMat);
    stand.position.y = 0.16;

    const shadeGeo = new THREE.ConeGeometry(0.18, 0.18, 16, 1, true);
    shadeGeo.rotateX(Math.PI);
    housingMesh = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.85,
      side: THREE.DoubleSide
    }));
    housingMesh.position.y = 0.32;

    const bulbGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });
    emissiveMesh = new THREE.Mesh(bulbGeo, bulbMat);
    emissiveMesh.position.y = 0.28;

    group.add(stand, housingMesh, emissiveMesh);
    pointLight.position.set(0, 0.26, 0);

  } else {
    // candle or subtle flickering flame
    const candleGeo = new THREE.CylinderGeometry(0.025, 0.028, 0.12, 12);
    housingMesh = new THREE.Mesh(candleGeo, new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 }));
    housingMesh.position.y = 0.06;

    const flameGeo = new THREE.SphereGeometry(0.02, 8, 8);
    flameGeo.scale(0.8, 1.8, 0.8);
    const flameMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 2.5
    });
    emissiveMesh = new THREE.Mesh(flameGeo, flameMat);
    emissiveMesh.position.y = 0.14;

    group.add(housingMesh, emissiveMesh);
    pointLight.position.set(0, 0.16, 0);
  }

  group.add(pointLight);

  const fixtureEntry = {
    id: lightDef.id,
    kind,
    lightDef,
    roomIdx,
    group,
    pointLight,
    emissiveMesh,
    baseIntensity: intensity,
    baseColor: colorHex,
    flicker: !!lightDef.flicker,
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: 7.0 + Math.random() * 8.0,
    directorDimMultiplier: 1.0
  };

  activeFixtures.push(fixtureEntry);
  return group;
}

/**
 * Clear all active fixtures before scene rebuild
 */
export function clearActiveFixtures() {
  activeFixtures.length = 0;
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
      flicker: true
    }, null);
    cGroup1f.add(fl1);
  }

  if (cGroup2f) {
    const fl2 = createLightFixtureMesh({
      id: 'light-corr-2f-01',
      kind: 'emergency',
      pos: [1.5, 2.52, 2.5],
      color: '#ef4444',
      intensity: 0.85,
      distance: 5.5,
      flicker: true
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
      flicker: true
    }, null);
    stairGroup.add(stLight);
  }
}

/**
 * Animate subtle realistic flicker on every frame
 */
export function updateLightFixtures(timeSec) {
  for (let i = 0; i < activeFixtures.length; i++) {
    const f = activeFixtures[i];
    let flickerMod = 1.0;

    if (f.flicker) {
      // Realistic electrical oscillation + occasional micro-drop
      const wave = Math.sin(timeSec * f.flickerSpeed + f.flickerPhase);
      const wave2 = Math.cos(timeSec * (f.flickerSpeed * 2.3) + f.flickerPhase);
      flickerMod = 0.88 + 0.12 * wave;
      if (Math.sin(timeSec * 3.7 + f.flickerPhase * 1.7) > 0.94) {
        // Micro flicker drop
        flickerMod *= (0.25 + 0.3 * Math.random());
      } else if (wave2 > 0.92) {
        flickerMod *= 1.25; // Slight surge
      }
    }

    const currentIntensity = f.baseIntensity * flickerMod * f.directorDimMultiplier * fpsLightingMultiplier;
    f.pointLight.intensity = Math.max(0.01, currentIntensity);

    // Sync emissive intensity with flicker, blackout, and FPS mode
    const emIntensity = Math.max(0.05, 1.5 * flickerMod * f.directorDimMultiplier * fpsLightingMultiplier);
    if (f.emissiveMesh) {
      if (f.emissiveMesh.material) {
        f.emissiveMesh.material.emissiveIntensity = emIntensity;
      } else if (f.emissiveMesh.children) {
        f.emissiveMesh.children.forEach(c => {
          if (c.material) c.material.emissiveIntensity = emIntensity;
        });
      }
    }
  }
}

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
