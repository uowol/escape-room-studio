/**
 * Room as Code (RaC) v1.0 - Phase 2 Engine & Logic Cumulative Harness
 * 2단계: 순수 기하 컴파일러 및 인과율 FSM 엔진의 자가 검증 하네스 (무화면 자동 테스트)
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

function runEngineHarness() {
  console.log("🚀 [RaC Phase 2 Harness] 순수 엔진(기하 + FSM 로직) 자가 검증 시작...\n");

  const samplePath = path.join(__dirname, '../samples/minimal-room.json');
  const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

  // =========================================================================
  // TEST SUITE 1: Geometry Compiler Engine (기하학 무결성 검증)
  // =========================================================================
  console.log("📦 [Test Suite 1] Geometry Compiler Engine 검증:");

  const space = sampleData.spaces[0];
  const compiled = compileSpaceGeometry(space);

  // 1-1. 면적 계산 정합성
  const expectedArea = 4.0 * 3.0; // 12.0 m^2
  assert(compiled.areaSquareMeters === expectedArea, `면적 오차 발생: 기대치 ${expectedArea}, 실제 ${compiled.areaSquareMeters}`);
  console.log(`  ✅ 1-1. 2D 바닥 면적 계산 통과: ${compiled.areaSquareMeters} ㎡`);

  // 1-2. 바닥 삼각분할 정합성
  assert(compiled.floor.vertexCount === 4, `바닥 정점 수 불일치: ${compiled.floor.vertexCount}`);
  assert(compiled.floor.triangleCount === 2, `바닥 삼각형 수 불일치: ${compiled.floor.triangleCount}`);
  console.log(`  ✅ 1-2. 바닥 삼각분할 통과: 정점 ${compiled.floor.vertexCount}개, 삼각형 ${compiled.floor.triangleCount}개`);

  // 1-3. 벽체 수직 압출 정합성 (4면 벽, 높이 2.6m)
  assert(compiled.walls.wallCount === 4, `벽체 개수 불일치: ${compiled.walls.wallCount}`);
  assert(compiled.walls.vertexCount === 16, `벽체 정점 수 불일치: ${compiled.walls.vertexCount}`);
  assert(compiled.walls.triangleCount === 8, `벽체 삼각형 수 불일치: ${compiled.walls.triangleCount}`);
  
  // Y축 높이 검증 (상단 버텍스가 정확히 2.6m인지)
  const wallVertices = compiled.walls.vertices;
  let hasTopHeight = false;
  for (let i = 1; i < wallVertices.length; i += 3) {
    if (Math.abs(wallVertices[i] - 2.6) < 0.0001) hasTopHeight = true;
  }
  assert(hasTopHeight, "벽체 상단 높이가 2.6m로 압출되지 않음");
  console.log(`  ✅ 1-3. 3D 벽체 수직 압출 통과: 4개 벽체, 높이 2.6m, 삼각형 8개 생성`);

  // =========================================================================
  // TEST SUITE 2: Logic & FSM State Machine (인과율 무결성 검증)
  // =========================================================================
  console.log("\n🔒 [Test Suite 2] Logic & FSM Engine 검증:");

  const runner = new LogicRunner(sampleData);

  // 2-1. 초기 상태 불변식 검증
  const initialGate = runner.getGate("gate-padlock");
  const initialDoor = runner.getDoor("door-01");
  assert(initialGate.isOpen === false, "초기 자물쇠가 열려 있음");
  assert(initialDoor.isLocked === true, "초기 문이 잠겨있지 않음");
  assert(runner.canTraverse("space-room-01", "space-room-02") === false, "초기에 잠긴 문을 통과할 수 있음");
  console.log("  ✅ 2-1. 초기 잠금 및 통로 차단 불변식 확인 (Gate: Closed, Door: Locked, Traverse: False)");

  // 2-2. 오답 입력 시 상태 방어 검증
  const wrongAttempt = runner.submitAction("gate-padlock", "0000");
  assert(wrongAttempt.success === false, "틀린 번호인데 성공 판정됨");
  assert(runner.getGate("gate-padlock").failureCount === 1, "실패 횟수가 누적되지 않음");
  assert(runner.getDoor("door-01").isLocked === true, "오답인데 문이 열림");
  console.log("  ✅ 2-2. 오답 입력 방어 및 실패 누적 확인 (오답 '0000' -> failureCount: 1, Door: Still Locked)");

  // 2-3. 올바른 정답 입력 시 인과율 연쇄 해금 검증
  const correctAttempt = runner.submitAction("gate-padlock", "0414");
  assert(correctAttempt.success === true, "올바른 번호인데 실패 판정됨");
  assert(runner.getGate("gate-padlock").isOpen === true, "자물쇠가 isOpen=true로 전이되지 않음");
  assert(runner.getDoor("door-01").isLocked === false, "결속된 문이 isLocked=false로 해금되지 않음");
  console.log("  ✅ 2-3. 정답 입력 연쇄 해금 확인 (정답 '0414' -> Gate.isOpen: True, Door-01.isLocked: False)");

  // 2-4. 최종 통로 전이 허용 검증
  const canPassNow = runner.canTraverse("space-room-01", "space-room-02");
  assert(canPassNow === true, "문이 열렸는데도 통로를 통과할 수 없음");
  console.log("  ✅ 2-4. 최종 공간 전이 허용 확인 (canTraverse -> True)");

  console.log("\n🎉 [Phase 2 Harness PASS] 7개 단위 불변식 테스트 100% 전수 통과! (회귀 결함 0개)");
}

try {
  runEngineHarness();
} catch (err) {
  console.error("\n❌ [Phase 2 Harness FAIL]", err.message);
  process.exit(1);
}
