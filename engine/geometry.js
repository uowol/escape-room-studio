/**
 * Room as Code (RaC) v1.0 - Geometry Compiler Engine (Extended for Multistory & Hole Punching)
 * 2D 폴리곤, 층고(Elevation), 사다리/계단 관통 구멍(Hole) 데이터를 3D 정점 및 인덱스로 절차적 컴파일하는 순수 기하 함수
 */

export function triangulateConvexPolygon(polygon, yOffset = 0.0) {
  // polygon: [[x, z], [x, z], ...] (최소 3개 꼭짓점)
  const n = polygon.length;
  if (n < 3) throw new Error("폴리곤 꼭짓점은 최소 3개 이상이어야 합니다.");

  const vertices = [];
  const indices = [];

  // Y=yOffset 바닥 정점 추가
  for (let i = 0; i < n; i++) {
    vertices.push(polygon[i][0], yOffset, polygon[i][1]);
  }

  // Fan 삼각분할 (0번 정점 기준)
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
  }

  return { vertices, indices };
}

/**
 * 직사각형 공간에서 사다리/계단 관통 구멍(Hole)을 제외한 4분할 바닥 슬래브 삼각분할
 * @param {Array<Array<number>>} polygon - 직사각형 바닥 꼭짓점 4개
 * @param {{ pos: [number, number], size: [number, number] }} hole - 관통 구멍 [cx, cz], [w, d]
 * @param {number} yOffset - 층고 (2층의 경우 2.6m)
 */
export function triangulateFloorWithHole(polygon, hole, yOffset = 0.0) {
  // 직사각형 바닥 바운딩 박스
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }

  // 구멍 영역 계산
  const hW = hole.size[0] / 2;
  const hD = hole.size[1] / 2;
  const hx1 = Math.max(minX, hole.pos[0] - hW);
  const hx2 = Math.min(maxX, hole.pos[0] + hW);
  const hz1 = Math.max(minZ, hole.pos[1] - hD);
  const hz2 = Math.min(maxZ, hole.pos[1] + hD);

  const vertices = [];
  const indices = [];

  // 보조 함수: 사각형 쿼드(Quad) 1개 추가 (2개 삼각형)
  function addQuad(x1, z1, x2, z2) {
    if (x2 <= x1 || z2 <= z1) return;
    const base = vertices.length / 3;
    vertices.push(x1, yOffset, z1); // 0: Top-Left
    vertices.push(x2, yOffset, z1); // 1: Top-Right
    vertices.push(x2, yOffset, z2); // 2: Bottom-Right
    vertices.push(x1, yOffset, z2); // 3: Bottom-Left

    indices.push(base, base + 1, base + 2);
    indices.push(base, base + 2, base + 3);
  }

  // 4개 분할 슬래브 생성 (구멍 중심을 둘러싼 N, S, W, E 분할)
  // 1. North Slab (z: minZ ~ hz1)
  addQuad(minX, minZ, maxX, hz1);
  // 2. South Slab (z: hz2 ~ maxZ)
  addQuad(minX, hz2, maxX, maxZ);
  // 3. West Slab (x: minX ~ hx1, z: hz1 ~ hz2)
  addQuad(minX, hz1, hx1, hz2);
  // 4. East Slab (x: hx2 ~ maxX, z: hz1 ~ hz2)
  addQuad(hx2, hz1, maxX, hz2);

  return {
    vertices,
    indices,
    holeBounds: { minX: hx1, maxX: hx2, minZ: hz1, maxZ: hz2 }
  };
}

export function calculatePolygonArea(polygon) {
  // Shoelace 공식으로 2D 바닥 면적(m^2) 계산
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area / 2.0);
}

export function compileWalls(polygon, wallHeight = 2.6, yOffset = 0.0) {
  const n = polygon.length;
  const vertices = [];
  const indices = [];

  // 각 변(Edge)마다 수직 쿼드(Quad) 벽체 생성 (2개 삼각형 = 6개 인덱스)
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    const baseIndex = vertices.length / 3;

    // 4개 정점 (Bottom-Left, Bottom-Right, Top-Right, Top-Left)
    vertices.push(p1[0], yOffset, p1[1]);                           // 0: p1 하단
    vertices.push(p2[0], yOffset, p2[1]);                           // 1: p2 하단
    vertices.push(p2[0], yOffset + wallHeight, p2[1]);             // 2: p2 상단
    vertices.push(p1[0], yOffset + wallHeight, p1[1]);             // 3: p1 상단

    // 2개 삼각형 (0-1-2, 0-2-3)
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

  return { vertices, indices, wallCount: n };
}

export function compileSpaceGeometry(spaceData) {
  const poly = spaceData.polygon;
  const height = spaceData.wallHeight || 2.6;
  const yOffset = spaceData.floorHeight || 0.0;

  // 바닥 펀칭(사다리 구멍) 존재 여부에 따른 분기
  let floor;
  if (spaceData.floorHole) {
    floor = triangulateFloorWithHole(poly, spaceData.floorHole, yOffset);
  } else {
    floor = triangulateConvexPolygon(poly, yOffset);
  }

  const walls = compileWalls(poly, height, yOffset);
  const area = calculatePolygonArea(poly);

  return {
    spaceId: spaceData.id,
    layer: spaceData.layer || 0,
    floorHeight: yOffset,
    areaSquareMeters: area,
    floor: {
      vertexCount: floor.vertices.length / 3,
      triangleCount: floor.indices.length / 3,
      vertices: floor.vertices,
      indices: floor.indices,
      hasHole: !!spaceData.floorHole
    },
    walls: {
      wallCount: walls.wallCount,
      vertexCount: walls.vertices.length / 3,
      triangleCount: walls.indices.length / 3,
      vertices: walls.vertices,
      indices: walls.indices
    }
  };
}
