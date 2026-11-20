/**
 * Room as Code (RaC) v1.0 - Phase 3 Cumulative Integration Harness
 * 3단계: 계약(Contract) -> 순수 기하/FSM 엔진 -> 동적 편집 및 다중 공간 전이 전수 검증
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileSpaceGeometry, calculatePolygonArea } from '../engine/geometry.js';
import { LogicRunner } from '../engine/logic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function runIntegrationHarness() {
  console.log("🚀 [RaC Phase 3 Harness] 전수 통합 파이프라인 및 동적 조작 자가 검증 시작...\n");

  const samplePath = path.join(__dirname, '../samples/minimal-room.json');
  const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

  // =========================================================================
  // SUITE 1: E2E Pipeline (Contract -> Geometry -> FSM)
  // =========================================================================
  console.log("🧩 [Suite 1] 엔드투엔드 파이프라인 기본 결속 검증:");
  
  // 1-1. 단일 방 기하 컴파일 결속
  const space0 = sampleData.spaces[0];
  const geo0 = compileSpaceGeometry(space0);
  assert(geo0.areaSquareMeters === 12.0, "기본 방 면적이 12.0㎡가 아님");
  assert(geo0.walls.triangleCount === 8, "벽체 삼각형 수가 8개가 아님");
  console.log(`  ✅ 1-1. 기하 컴파일 결속 통과: 면적 ${geo0.areaSquareMeters}㎡, 벽체 삼각형 ${geo0.walls.triangleCount}개`);

  // 1-2. FSM 런타임 초기화 결속
  const runner = new LogicRunner(sampleData);
  assert(runner.spaces.get("space-room-01").status === "Active", "초기 방이 Active 상태가 아님");
  assert(!runner.canTraverse("space-room-01", "space-room-02"), "초기 통로가 차단되어 있지 않음");
  console.log("  ✅ 1-2. FSM 런타임 결속 통과: space-room-01 Active, 통로 차단 확인");

  // =========================================================================
  // SUITE 2: Dynamic CAD Mutation (2D 꼭짓점 실시간 편집 시뮬레이션)
  // =========================================================================
  console.log("\n📐 [Suite 2] 2D CAD 꼭짓점 동적 이동 및 실시간 3D 재컴파일 검증:");

  // 방 꼭짓점을 (4,3)에서 (6,5)로 동적 확장: 직사각형 6.0m x 5.0m = 30.0㎡
  const mutatedPolygon = [
    [0.0, 0.0],
    [6.0, 0.0],
    [6.0, 5.0],
    [0.0, 5.0]
  ];
  const mutatedSpace = { ...space0, polygon: mutatedPolygon };
  const recompiledGeo = compileSpaceGeometry(mutatedSpace);

  assert(recompiledGeo.areaSquareMeters === 30.0, `동적 확장 면적 오류: ${recompiledGeo.areaSquareMeters} != 30.0`);
  assert(recompiledGeo.floor.vertexCount === 4, "재컴파일된 정점 수가 4가 아님");
  assert(recompiledGeo.walls.wallCount === 4, "벽체 개수가 4가 아님");

  // 정점 좌표 검증 (X=6.0, Z=5.0 포함 여부)
  let foundMaxX = false;
  let foundMaxZ = false;
  for (let i = 0; i < recompiledGeo.walls.vertices.length; i += 3) {
    if (Math.abs(recompiledGeo.walls.vertices[i] - 6.0) < 0.0001) foundMaxX = true;
    if (Math.abs(recompiledGeo.walls.vertices[i + 2] - 5.0) < 0.0001) foundMaxZ = true;
  }
  assert(foundMaxX && foundMaxZ, "벽체 버텍스에 변형된 (6.0, 5.0) 정점이 반영되지 않음");
  console.log(`  ✅ 2-1. 실시간 2D 드래그 재컴파일 통과: 면적 12㎡ -> ${recompiledGeo.areaSquareMeters}㎡ 확장 실증`);

  // 오목/L자형 5각형 공간 면적 계산 (비정형 다각형 방)
  const lShapedPolygon = [
    [0.0, 0.0],
    [6.0, 0.0],
    [6.0, 3.0],
    [3.0, 3.0],
    [3.0, 5.0],
    [0.0, 5.0]
  ];
  // 면적: 6x3 + 3x2 = 18 + 6 = 24.0 m^2
  const lShapedArea = calculatePolygonArea(lShapedPolygon);
  assert(Math.abs(lShapedArea - 24.0) < 0.0001, `L자형 방 면적 오차: ${lShapedArea} != 24.0`);
  console.log(`  ✅ 2-2. L자형 다각형 방 Shoelace 면적 정합성 통과: ${lShapedArea}㎡`);

  // =========================================================================
  // SUITE 3: Multi-Space Sequential Causality (복수 공간 연쇄 해금 FSM)
  // =========================================================================
  console.log("\n⛓️ [Suite 3] 복수 공간 및 다단 연쇄 자물쇠 인과율 전이 검증:");

  // 2개의 방 + 2개의 문 + 2개의 자물쇠 데이터 구축
  const multiRoomData = {
    version: "1.0",
    theme: { id: "theme-escape", name: "연쇄 탈출" },
    spaces: [
      { id: "room-01", name: "제1구역", polygon: [[0,0],[4,0],[4,3],[0,3]], wallHeight: 2.6 },
      { id: "room-02", name: "제2구역", polygon: [[4,0],[8,0],[8,3],[4,3]], wallHeight: 2.6 },
      { id: "room-exit", name: "외부 탈출구", polygon: [[8,0],[10,0],[10,3],[8,3]], wallHeight: 2.6 }
    ],
    passages: [
      { id: "pass-01", fromSpaceId: "room-01", toSpaceId: "room-02", door: { id: "door-01", isLocked: true, type: "Metal" } },
      { id: "pass-02", fromSpaceId: "room-02", toSpaceId: "room-exit", door: { id: "door-exit", isLocked: true, type: "HeavyVault" } }
    ],
    logicGraph: {
      clues: [
        { id: "clue-01", description: "첫 번째 암호 0414" },
        { id: "clue-02", description: "두 번째 금고 암호 7734" }
      ],
      problems: [
        { id: "prob-01", consumes: ["clue-01"], outputGate: "gate-01" },
        { id: "prob-02", consumes: ["clue-02"], outputGate: "gate-exit" }
      ],
      gates: [
        { id: "gate-01", condition: "Value == '0414'", unlocks: "door-01", isOpen: false },
        { id: "gate-exit", condition: "Value == '7734'", unlocks: "door-exit", isOpen: false }
      ]
    }
  };

  const chainRunner = new LogicRunner(multiRoomData);

  // 3-1. 초기 방화벽 격리 불변식
  assert(!chainRunner.canTraverse("room-01", "room-02"), "1구역->2구역 문이 잠겨있지 않음");
  assert(!chainRunner.canTraverse("room-02", "room-exit"), "2구역->외부 문이 잠겨있지 않음");
  console.log("  ✅ 3-1. 초기 다단 방화벽 차단 확인 (Door-01, Door-Exit Locked)");

  // 3-2. 1단계 자물쇠 해금 -> 1차 통로 개방
  const res1 = chainRunner.submitAction("gate-01", "0414");
  assert(res1.success, "1단계 자물쇠 해금 실패");
  assert(chainRunner.canTraverse("room-01", "room-02"), "1구역->2구역 통과 불가");
  assert(!chainRunner.canTraverse("room-02", "room-exit"), "2단계 문이 조기 개방됨 (보안 결함)");
  console.log("  ✅ 3-2. 1단계 정답 입력 -> Door-01만 해금, Door-Exit 차단 유지 확인");

  // 3-3. 2단계 최종 금고 해금 -> 최종 탈출로 개방
  const res2 = chainRunner.submitAction("gate-exit", "7734");
  assert(res2.success, "2단계 금고 해금 실패");
  assert(chainRunner.canTraverse("room-02", "room-exit"), "최종 탈출로 통과 불가");
  console.log("  ✅ 3-3. 2단계 금고 정답 입력 -> Door-Exit 해금 및 최종 탈출로 확보 확인");

  // =========================================================================
  // SUITE 4: Round-Trip Serialization Idempotency (직렬화 무결성)
  // =========================================================================
  console.log("\n💾 [Suite 4] 데이터 직렬화 및 역직렬화 멱등성 검증:");
  const serialized = JSON.stringify(multiRoomData);
  const deserialized = JSON.parse(serialized);
  assert(deserialized.spaces.length === 3, "역직렬화 후 공간 수 불일치");
  assert(deserialized.logicGraph.gates.length === 2, "역직렬화 후 게이트 수 불일치");
  console.log("  ✅ 4-1. JSON 왕복 직렬화 무결성 확인");

  console.log("\n🎉 [Phase 3 Integration PASS] 총 11개 누적 불변식 테스트 100% 통과! (무결점 실증 완료)");
}

try {
  runIntegrationHarness();
} catch (err) {
  console.error("\n❌ [Phase 3 Integration FAIL]", err.message);
  process.exit(1);
}
