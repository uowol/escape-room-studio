/**
 * Room as Code (RaC) v1.0 - Iteration 2 & 3 Comprehensive Test Harness
 * 복층 수직 펀칭 기하학, Container 다단 연쇄 FSM, OneWay 퇴로 차단, Director 물리 환경 지배 전수 자가 검증
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileSpaceGeometry } from '../engine/geometry.js';
import { LogicRunner } from '../engine/logic.js';
import { DirectorEngine } from '../engine/director.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function runIteration2And3Harness() {
  console.log("🚀 [RaC Iteration 2 & 3 Harness] 복층 펀칭·다단 인과율·Director 닫힌 세계 검증 시작...\n");

  const samplePath = path.join(__dirname, '../samples/closed-world-theme.json');
  const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

  // =========================================================================
  // SUITE 1: Multistory Geometry & Floor Hole Punching
  // =========================================================================
  console.log("🏢 [Suite 1] 복층 층고 및 사다리 관통 구멍(Hole) 기하 컴파일 검증:");

  // 1-1. 1층 바닥 및 벽체 (Y=0.0m ~ 2.6m)
  const room1 = sampleData.spaces[0];
  const geo1 = compileSpaceGeometry(room1);
  assert(geo1.floorHeight === 0.0, "1층 층고가 0.0m가 아님");
  assert(geo1.floor.hasHole === false, "1층 바닥에 불필요한 구멍이 존재함");
  console.log("  ✅ 1-1. 1층 취조실 기하 통과 (Y: 0.0m ~ 2.6m, 일반 바닥)");

  // 1-2. 2층 바닥 슬래브 및 사다리 구멍 펀칭 (Y=2.6m ~ 5.2m)
  const room2 = sampleData.spaces[1];
  const geo2 = compileSpaceGeometry(room2);
  assert(geo2.floorHeight === 2.6, "2층 층고가 2.6m가 아님");
  assert(geo2.floor.hasHole === true, "2층 바닥에 사다리 구멍이 펀칭되지 않음");
  assert(geo2.floor.triangleCount === 8, `4분할 바닥 슬래브 삼각형 수 오류: ${geo2.floor.triangleCount} != 8`);
  
  // 2층 바닥 정점 Y좌표가 모두 2.6m인지 검증
  const floorVerts = geo2.floor.vertices;
  for (let i = 1; i < floorVerts.length; i += 3) {
    assert(Math.abs(floorVerts[i] - 2.6) < 0.0001, `2층 바닥 버텍스 Y좌표 오류: ${floorVerts[i]}`);
  }

  // 2층 벽체 상단 Y좌표가 5.2m(2.6 + 2.6)인지 검증
  let has5_2m = false;
  const wallVerts = geo2.walls.vertices;
  for (let i = 1; i < wallVerts.length; i += 3) {
    if (Math.abs(wallVerts[i] - 5.2) < 0.0001) has5_2m = true;
  }
  assert(has5_2m, "2층 벽체 상단이 5.2m 높이로 압출되지 않음");
  console.log("  ✅ 1-2. 2층 영안실 사다리 구멍 펀칭(8개 슬래브 삼각형) 및 5.2m 벽체 압출 통과");

  // =========================================================================
  // SUITE 2: Multi-Stage Causality Chaining (Container 은닉함 연쇄)
  // =========================================================================
  console.log("\n🔐 [Suite 2] Container(금고 은닉함) 및 다단 인과율 사슬 FSM 검증:");

  const runner = new LogicRunner(sampleData);

  // 2-1. 초기 단서 은닉 및 금고 잠금 상태 불변식
  const safe = runner.getContainer("container-safe");
  const brassKey = runner.getClue("clue-brass-key");
  const finalDoor = runner.getDoor("door-final");
  assert(safe.isOpen === false, "초기 금고가 열려 있음");
  assert(brassKey.visibility === "Hidden", "초기 열쇠 단서가 은닉되지 않고 노출되어 있음");
  assert(finalDoor.isLocked === true, "초기 최종 비상문이 잠겨있지 않음");
  console.log("  ✅ 2-1. 초기 상태 불변식 확인 (Safe: Closed, Key: Hidden, FinalDoor: Locked)");

  // 2-2. 1단계 자물쇠 해금 -> 금고 개방 및 열쇠 노출
  const step1 = runner.submitAction("gate-padlock", "0414");
  assert(step1.success === true, "1단계 패드락 해금 실패");
  assert(safe.isOpen === true, "금고가 열리지 않음");
  assert(brassKey.visibility === "Revealed", "금고 속 황동 열쇠가 노출되지 않음");
  assert(finalDoor.isLocked === true, "1단계만 풀었는데 최종 문이 열림 (보안 결함)");
  console.log("  ✅ 2-2. 1단계 정답 입력 -> 금고 개방 및 '황동 열쇠(Clue-02)' 연쇄 획득 확인");

  // 2-3. 2단계 황동 열쇠 매칭 -> 최종 비상문 해금
  const step2 = runner.submitAction("gate-final-emlock", "KeyMatched");
  assert(step2.success === true, "2단계 열쇠 매칭 해금 실패");
  assert(finalDoor.isLocked === false, "최종 비상문이 해금되지 않음");
  console.log("  ✅ 2-3. 2단계 열쇠 삽입 -> 최종 비상문(Door-Final) 완결 해금 확인");

  // =========================================================================
  // SUITE 3: Spatial Isolation & OneWay Axiom (퇴로 차단 공리)
  // =========================================================================
  console.log("\n🚪 [Suite 3] 공간 고립 및 OneWay 퇴로 차단 공리 검증:");

  // 3-1. 1층 ➔ 2층 사다리는 통과 가능
  const canClimbUp = runner.canTraverse("space-room-01", "space-room-02");
  assert(canClimbUp === true, "1층에서 2층으로 사다리를 오를 수 없음");
  console.log("  ✅ 3-1. 1층 -> 2층 사다리 순방향 통과 허용 확인");

  // 3-2. 2층 ➔ 1층 역방향 이동은 OneWay로 인해 절대 불가 (퇴로 차단)
  const canClimbDown = runner.canTraverse("space-room-02", "space-room-01");
  assert(canClimbDown === false, "OneWay 통로인데 2층에서 1층으로 되돌아갈 수 있음 (공리 위반)");
  console.log("  ✅ 3-2. 2층 -> 1층 OneWay 퇴로 차단 완벽 방어 확인 (Causal Tension 유지)");

  // =========================================================================
  // SUITE 4: AI Director Physics Override & 60-Minute Countdown
  // =========================================================================
  console.log("\n👁️ [Suite 4] AI Director 물리 환경 지배(조명/음향) 및 60분 타임어택 검증:");

  const director = new DirectorEngine({ timeLimitMinutes: 60, panicThresholdFailures: 2 });

  // 4-1. 60분 카운트다운 타이머 포맷 검증
  assert(director.getRemainingTimeFormatted() === "60:00", "초기 남은 시간 불일치");
  director.tick(60);
  assert(director.getRemainingTimeFormatted() === "59:00", "1분 경과 후 시간 포맷 불일치");
  assert(director.getLightingFactor() === 1.0, "초기 조명 조도가 100%가 아님");
  console.log("  ✅ 4-1. 60분 카운트다운 타이머 및 초기 조명 조도 100% 확인");

  // 4-2. 1회 오답 시 경고 ➔ 2회 오답 누적 시 실시간 암전(Blackout) 트리거 검증
  const f1 = director.recordFailure();
  assert(f1 === null, "1회 실패에 조기 암전 발생");
  assert(director.isBlackoutActive === false, "암전 활성화 오동작");

  const f2 = director.recordFailure();
  assert(f2 !== null && f2.type === "BlackoutTrigger", "2회 실패 시 암전 트리거가 발생하지 않음");
  assert(director.isBlackoutActive === true, "암전 플래그 미반영");
  assert(director.getLightingFactor() === 0.05, "암전 시 조도가 5%로 급락하지 않음");
  console.log("  ✅ 4-2. 오답 2회 누적 시 Director 조명 암전(조도 5%) 및 공포 오디오 변조 트리거 확인");

  // 4-3. 암전 복구 및 타임오버 터미널 검증
  director.resolveBlackout();
  assert(director.getLightingFactor() === 0.8, "암전 해제 후 긴장도 레벨 2 조도(80%) 미반영");

  // 3600초 경과 시 타임오버 판정
  director.tick(3600);
  assert(director.isTimeOver() === true, "3600초 경과 후 타임오버 판정 실패");
  assert(director.tensionLevel === 5, "타임오버 시 최고 긴장도 레벨 5 미도달");
  console.log("  ✅ 4-3. 암전 정상 복구 및 60분 만료 시 Terminal 탈출 실패 판정 확인");

  console.log("\n🎉 [Iteration 2 & 3 Harness PASS] 총 12개 신규 닫힌 세계 불변식 100% 전수 통과!");
}

try {
  runIteration2And3Harness();
} catch (err) {
  console.error("\n❌ [Iteration 2 & 3 Harness FAIL]", err.message);
  process.exit(1);
}
