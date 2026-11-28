import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Procedural 256x256 4-Map PBR Texture Pack, Geometry Interning & Material Caches
export const textureCache = new Map();
export const pbrPackCache = new Map();
const geometryCache = new Map();

function markSharedGeo(geo) {
  geo.userData = geo.userData || {};
  geo.userData.shared = true;
  return geo;
}

export function getBoxGeo(w, h, d) {
  const key = `box_${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = markSharedGeo(new THREE.BoxGeometry(w, h, d));
    geometryCache.set(key, geo);
  }
  return geo;
}

export function getCylGeo(rt, rb, h, seg = 12, openEnded = false) {
  const key = `cyl_${rt.toFixed(3)}_${rb.toFixed(3)}_${h.toFixed(3)}_${seg}_${openEnded ? 1 : 0}`;
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = markSharedGeo(new THREE.CylinderGeometry(rt, rb, h, seg, 1, openEnded));
    geometryCache.set(key, geo);
  }
  return geo;
}

export function getPlaneGeo(w, h) {
  const key = `plane_${w.toFixed(3)}_${h.toFixed(3)}`;
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = markSharedGeo(new THREE.PlaneGeometry(w, h));
    geometryCache.set(key, geo);
  }
  return geo;
}

/**
 * Convert a 2D HTMLCanvasElement into a lightweight THREE.DataTexture and immediately
 * release the 2D canvas backing store (width = height = 0) so it can be GC'd.
 */
function canvasToDataTexture(canvas, {
  isSRGB = false,
  wrapRepeat = false,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 1
} = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = new Uint8Array(imgData.data.buffer.slice(0));
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.flipY = true; // Preserve CanvasTexture vertical orientation
  if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
  if (wrapRepeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  if (repeatX !== 1 || repeatY !== 1) tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (anisotropy > 1) tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  // Release 2D canvas backing store immediately
  canvas.width = 0;
  canvas.height = 0;
  return tex;
}

/**
 * Safely dispose non-shared geometries and materials under a Three.js Object3D subtree.
 * Never disposes shared singletons (userData.shared === true) or cached PBR/canvas textures.
 */
export function disposeObject3D(root) {
  if (!root) return;
  const disposedGeos = new Set();
  const disposedMats = new Set();
  root.traverse((obj) => {
    const geo = obj.geometry;
    if (geo && (!geo.userData || geo.userData.shared !== true) && !disposedGeos.has(geo)) {
      geo.dispose();
      disposedGeos.add(geo);
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (m && (!m.userData || m.userData.shared !== true) && !disposedMats.has(m)) {
          m.dispose();
          disposedMats.add(m);
        }
      }
    }
  });
}

// Cached GLTF/GLB Loader for custom modelUrl props
const gltfLoader = new GLTFLoader();
const gltfModelCache = new Map();

export function loadGlbCached(url) {
  if (!gltfModelCache.has(url)) {
    const p = new Promise((resolve, reject) => {
      gltfLoader.load(url, (gltf) => {
        gltf.scene.traverse((c) => {
          if (c.geometry) {
            c.geometry.userData = c.geometry.userData || {};
            c.geometry.userData.shared = true;
          }
          if (c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            for (let i = 0; i < mats.length; i++) {
              if (mats[i]) {
                mats[i].userData = mats[i].userData || {};
                mats[i].userData.shared = true;
              }
            }
          }
        });
        resolve(gltf.scene);
      }, undefined, (err) => {
        gltfModelCache.delete(url);
        reject(err);
      });
    });
    gltfModelCache.set(url, p);
  }
  return gltfModelCache.get(url);
}


    function heightCanvasToNormalCanvas(heightCanvas, strength = 2.4) {
      const size = heightCanvas.width;
      const src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const octx = outCanvas.getContext('2d');
      const outImg = octx.createImageData(size, size);
      const dst = outImg.data;
      const sample = (x, y) => {
        const wx = (x + size) % size;
        const wy = (y + size) % size;
        return src[(wy * size + wx) * 4] / 255;
      };
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
          const l  = sample(x - 1, y),                           r  = sample(x + 1, y);
          const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
          const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
          const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
          let nx = -dx * strength;
          let ny = -dy * strength;
          let nz = 1.0;
          const invLen = 1 / Math.hypot(nx, ny, nz);
          nx *= invLen; ny *= invLen; nz *= invLen;
          const idx = (y * size + x) * 4;
          dst[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
          dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          dst[idx + 3] = 255;
        }
      }
      octx.putImageData(outImg, 0, 0);
      return outCanvas;
    }

    function deriveRoughnessAndAoCanvases(heightCanvas, kind) {
      const size = heightCanvas.width;
      const src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
      const cRough = document.createElement('canvas'); cRough.width = size; cRough.height = size;
      const cAo = document.createElement('canvas');    cAo.width = size;    cAo.height = size;
      const rctx = cRough.getContext('2d');
      const actx = cAo.getContext('2d');
      const rImg = rctx.createImageData(size, size);
      const aImg = actx.createImageData(size, size);
      const rd = rImg.data, ad = aImg.data;

      // Material-specific roughness base/range and AO crevice depth
      const cfg = kind === 'surgicalSteel'
        ? { rMin: 0.20, rMax: 0.44, aoMin: 0.78 }
        : kind === 'rustedMetal'
          ? { rMin: 0.36, rMax: 0.82, aoMin: 0.62 }
          : kind === 'wood'
            ? { rMin: 0.55, rMax: 0.88, aoMin: 0.58 }
            : { rMin: 0.74, rMax: 0.96, aoMin: 0.64 };

      for (let i = 0; i < src.length; i += 4) {
        const h = src[i] / 255; // 0 = crevice/groove, 1 = raised smooth ridge
        const roughVal = Math.round((cfg.rMin + (1 - h) * (cfg.rMax - cfg.rMin)) * 255);
        const aoVal = Math.round((cfg.aoMin + h * (1 - cfg.aoMin)) * 255);
        rd[i] = rd[i + 1] = rd[i + 2] = roughVal; rd[i + 3] = 255;
        ad[i] = ad[i + 1] = ad[i + 2] = aoVal;    ad[i + 3] = 255;
      }
      rctx.putImageData(rImg, 0, 0);
      actx.putImageData(aImg, 0, 0);
      return { cRough, cAo };
    }

    export function getPbrTexturePack(kind) {
      if (pbrPackCache.has(kind)) return pbrPackCache.get(kind);

      const size = 256;
      const cAlbedo = document.createElement('canvas'); cAlbedo.width = size; cAlbedo.height = size;
      const cBump = document.createElement('canvas');   cBump.width = size;   cBump.height = size;
      const ctx = cAlbedo.getContext('2d');
      const bctx = cBump.getContext('2d');

      if (kind === 'wood') {
        // Aged Dark Asylum Wood Grain + Scratches (256px)
        ctx.fillStyle = '#5c3419';
        ctx.fillRect(0, 0, size, size);
        bctx.fillStyle = '#808080';
        bctx.fillRect(0, 0, size, size);
        for (let y = 0; y < size; y += 2) {
          const wave = Math.sin(y * 0.1) * 14 + Math.sin(y * 0.34) * 5 + (Math.random() - 0.5) * 10;
          const v = Math.max(20, Math.min(125, 68 + wave));
          ctx.fillStyle = `rgb(${Math.round(v * 1.15)}, ${Math.round(v * 0.65)}, ${Math.round(v * 0.35)})`;
          ctx.fillRect(0, y, size, 2);
          const bv = Math.max(25, Math.min(235, Math.round(128 + wave * 1.6)));
          bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
          bctx.fillRect(0, y, size, 2);
        }
        // Plank seams & grime
        ctx.fillStyle = 'rgba(15, 8, 4, 0.58)';
        bctx.fillStyle = '#181818';
        for (let py = 64; py < size; py += 64) {
          ctx.fillRect(0, py, size, 2);
          bctx.fillRect(0, py, size, 2);
        }
        for (let i = 0; i < 140; i++) {
          const sx = Math.random() * size, sy = Math.random() * size, sw = 24 + Math.random() * 72;
          ctx.fillStyle = 'rgba(20,10,5,0.18)';
          ctx.fillRect(sx, sy, sw, 1.5);
          bctx.fillStyle = 'rgba(60,60,60,0.45)';
          bctx.fillRect(sx, sy, sw, 1.5);
        }
      } else if (kind === 'rustedMetal') {
        // Matte Powder-Coated Hospital Steel with Subtle Wear & Soft Edge Oxidation (512px)
        ctx.fillStyle = '#47525e';
        ctx.fillRect(0, 0, size, size);
        bctx.fillStyle = '#909090';
        bctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 1200; i++) {
          const x = Math.random() * size, y = Math.random() * size, r = 1 + Math.random() * 2.5;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(x, y, r, r);
          bctx.fillStyle = Math.random() > 0.5 ? 'rgba(165,165,165,0.18)' : 'rgba(105,105,105,0.18)';
          bctx.fillRect(x, y, r, r);
        }
        for (let i = 0; i < 28; i++) {
          const rx = Math.random() * size, ry = Math.random() * size, rr = 34 + Math.random() * 78;
          const grad = ctx.createRadialGradient(rx, ry, 4, rx, ry, rr);
          grad.addColorStop(0, 'rgba(68, 42, 28, 0.24)');
          grad.addColorStop(0.6, 'rgba(40, 32, 28, 0.11)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();

          const bgrad = bctx.createRadialGradient(rx, ry, 4, rx, ry, rr);
          bgrad.addColorStop(0, 'rgba(72,72,72,0.55)');
          bgrad.addColorStop(1, 'rgba(144,144,144,0)');
          bctx.fillStyle = bgrad;
          bctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); bctx.fill();
        }
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.07)';
        ctx.lineWidth = 1;
        bctx.strokeStyle = 'rgba(200, 200, 200, 0.35)';
        bctx.lineWidth = 1;
        for (let i = 0; i < 32; i++) {
          const sx = Math.random() * size, sy = Math.random() * size;
          const ex = sx + (Math.random() - 0.5) * 76, ey = sy + (Math.random() - 0.5) * 24;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          bctx.beginPath(); bctx.moveTo(sx, sy); bctx.lineTo(ex, ey); bctx.stroke();
        }
      } else if (kind === 'surgicalSteel') {
        // Brushed Medical Stainless Steel + Subtle Blood & Scratches (512px)
        ctx.fillStyle = '#9aa5b1';
        ctx.fillRect(0, 0, size, size);
        bctx.fillStyle = '#a8a8a8';
        bctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 720; i++) {
          const y = Math.random() * size;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
          ctx.fillRect(0, y, size, 1);
          bctx.fillStyle = Math.random() > 0.5 ? 'rgba(190,190,190,0.22)' : 'rgba(130,130,130,0.22)';
          bctx.fillRect(0, y, size, 1);
        }
        for (let i = 0; i < 10; i++) {
          const bx = Math.random() * size, by = Math.random() * size, br = 10 + Math.random() * 28;
          const g = ctx.createRadialGradient(bx, by, 2, bx, by, br);
          g.addColorStop(0, 'rgba(127, 29, 29, 0.35)');
          g.addColorStop(1, 'rgba(127, 29, 29, 0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          const bg = bctx.createRadialGradient(bx, by, 2, bx, by, br);
          bg.addColorStop(0, 'rgba(70,70,70,0.5)');
          bg.addColorStop(1, 'rgba(168,168,168,0)');
          bctx.fillStyle = bg;
          bctx.beginPath(); bctx.arc(bx, by, br, 0, Math.PI * 2); bctx.fill();
        }
      } else {
        // Smooth Weathered Hospital Plaster / Concrete (512px, NO sponge dots!)
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(0, 0, size, size);
        bctx.fillStyle = '#808080';
        bctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 36; i++) {
          const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 90;
          const g = ctx.createRadialGradient(x, y, 4, x, y, r);
          const dark = Math.random() > 0.45;
          g.addColorStop(0, dark ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.06)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

          const bg = bctx.createRadialGradient(x, y, 4, x, y, r);
          bg.addColorStop(0, dark ? 'rgba(102,102,102,0.55)' : 'rgba(154,154,154,0.55)');
          bg.addColorStop(1, 'rgba(128,128,128,0)');
          bctx.fillStyle = bg;
          bctx.beginPath(); bctx.arc(x, y, r, 0, Math.PI * 2); bctx.fill();
        }
        for (let i = 0; i < 48; i++) {
          const sx = Math.random() * size, sw = 1 + Math.random() * 2.5;
          ctx.fillStyle = 'rgba(15,23,42,0.05)';
          ctx.fillRect(sx, 0, sw, size);
          bctx.fillStyle = 'rgba(98,98,98,0.18)';
          bctx.fillRect(sx, 0, sw, size);
        }
      }

      const normalStrength = kind === 'wood' ? 2.6 : kind === 'surgicalSteel' ? 1.4 : 2.2;
      const cNormal = heightCanvasToNormalCanvas(cBump, normalStrength);
      const { cRough, cAo } = deriveRoughnessAndAoCanvases(cBump, kind);
      // Release intermediate height canvas backing store immediately
      cBump.width = 0;
      cBump.height = 0;

      const maxAniso = 4;
      const map = canvasToDataTexture(cAlbedo, { isSRGB: true, wrapRepeat: true, anisotropy: maxAniso });
      const normalMap = canvasToDataTexture(cNormal, { wrapRepeat: true, anisotropy: maxAniso });
      const roughnessMap = canvasToDataTexture(cRough, { wrapRepeat: true, anisotropy: maxAniso });
      const aoMap = canvasToDataTexture(cAo, { wrapRepeat: true, anisotropy: maxAniso });
      aoMap.channel = 0; // Use primary UV so standard geometries get AO without UV2 duplication

      const pack = { map, normalMap, roughnessMap, aoMap, bumpMap: null };
      pbrPackCache.set(kind, pack);
      return pack;
    }

    // Specialized Prop PBR Canvas Textures (Clock Face, CRT Screen, Document Chart, Oil Portrait)
    export function getPropDetailTexture(kind) {
      const key = 'propDetail_' + kind;
      if (textureCache.has(key)) return textureCache.get(key);

      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');

      if (kind === 'clockFace') {
        const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
        g.addColorStop(0, '#eee6d0');
        g.addColorStop(0.82, '#cfc19e');
        g.addColorStop(1, '#9a8962');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#3b2d1f';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(128, 128, 118, 0, Math.PI * 2); ctx.stroke();
        // 12 hour ticks
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.strokeStyle = '#1c1917';
          ctx.lineWidth = (i % 3 === 0) ? 5 : 2.5;
          ctx.beginPath();
          ctx.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
          ctx.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112);
          ctx.stroke();
        }
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('XII', 128, 46);
        ctx.fillText('III', 208, 128);
        ctx.fillText('VI', 128, 210);
        ctx.fillText('IX', 48, 128);
      } else if (kind === 'crtScreen') {
        ctx.fillStyle = '#041418';
        ctx.fillRect(0, 0, 256, 256);
        // Subtle phosphor glow
        const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 140);
        g.addColorStop(0, 'rgba(14, 116, 144, 0.35)');
        g.addColorStop(1, 'rgba(4, 20, 24, 0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        // Terminal UI lines
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('ASYLUM-404 OS v1.4', 18, 34);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(18, 44, 220, 2);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '12px monospace';
        ctx.fillText('> WARD LOG: 1994-04', 18, 72);
        ctx.fillText('> STATUS: LOCKDOWN', 18, 96);
        ctx.fillText('> MON 14: DIR. KIM', 18, 126);
        ctx.fillText('> THU 17: DR. PARK', 18, 150);
        ctx.fillStyle = '#f87171';
        ctx.fillText('> SUN ??: NURSE CHOI', 18, 174);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('> ENTER CODE: ____', 18, 214);
        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1.5);
      } else if (kind === 'document') {
        ctx.fillStyle = '#dfd5bc';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#78716c';
        ctx.lineWidth = 2;
        ctx.strokeRect(14, 14, 228, 228);
        ctx.fillStyle = '#292524';
        ctx.fillRect(26, 30, 140, 8);
        ctx.fillStyle = '#57534e';
        for (let y = 56; y <= 200; y += 22) {
          ctx.fillRect(26, y, 204, 2);
          ctx.fillRect(26, y + 6, 120 + (y % 60), 4);
        }
        // Blood highlight mark
        ctx.fillStyle = 'rgba(153, 27, 27, 0.72)';
        ctx.fillRect(24, 118, 180, 14);
      } else if (kind === 'contactAo') {
        const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 124);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        g.addColorStop(0.65, 'rgba(0, 0, 0, 0.35)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      } else if (kind === 'portrait') {
        const g = ctx.createRadialGradient(128, 100, 15, 128, 128, 150);
        g.addColorStop(0, '#2e2440');
        g.addColorStop(1, '#09070d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#14101c';
        ctx.beginPath(); ctx.ellipse(128, 92, 42, 54, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 256); ctx.quadraticCurveTo(128, 140, 214, 256); ctx.fill();
        ctx.fillStyle = '#d4af37';
        ctx.strokeStyle = '#785a32';
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, 236, 236);
      }

      const tex = canvasToDataTexture(c, { isSRGB: kind !== 'contactAo' });
      textureCache.set(key, tex);
      return tex;
    }

    export function getProceduralTileTexture(colorHex, isCorridor = false) {
      const key = `tile_${colorHex}_${isCorridor}`;
      if (textureCache.has(key)) return textureCache.get(key);

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d');

      const col = '#' + colorHex.toString(16).padStart(6, '0');
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 256, 256);

      // Tile grid lines & grout
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 4;
      const tileSize = isCorridor ? 32 : 64;
      for (let x = 0; x <= 256; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
      }
      for (let y = 0; y <= 256; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      }

      // Subtle noise & grunge
      for (let i = 0; i < 350; i++) {
        const nx = Math.random() * 256;
        const ny = Math.random() * 256;
        const radius = Math.random() * 2.2 + 0.5;
        ctx.fillStyle = (Math.random() > 0.5) ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
        ctx.beginPath(); ctx.arc(nx, ny, radius, 0, Math.PI * 2); ctx.fill();
      }

      const rep = isCorridor ? 4 : 3;
      const tex = canvasToDataTexture(canvas, { isSRGB: true, wrapRepeat: true, repeatX: rep, repeatY: rep });
      textureCache.set(key, tex);
      return tex;
    }

    export function getProceduralWallTexture(colorHex) {
      const key = `wall_${colorHex}`;
      if (textureCache.has(key)) return textureCache.get(key);

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d');

      const col = '#' + colorHex.toString(16).padStart(6, '0');
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 256, 256);

      // Lower wall (wainscot band): slightly darker & cooler tone
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 160, 256, 96);

      // Wainscot dividing molding line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, 158, 256, 3);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 161, 256, 2);

      // Plaster noise
      for (let i = 0; i < 450; i++) {
        const nx = Math.random() * 256;
        const ny = Math.random() * 256;
        ctx.fillStyle = (Math.random() > 0.5) ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
        ctx.fillRect(nx, ny, 1.5, 1.5);
      }

      const tex = canvasToDataTexture(canvas, { isSRGB: true, wrapRepeat: true, repeatX: 4, repeatY: 1 });
      textureCache.set(key, tex);
      return tex;
    }
