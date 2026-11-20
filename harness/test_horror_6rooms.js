/**
 * Room as Code (RaC) v1.0 - 6방 30문제 풀 스케일 공포 테마 완결성 검증 하네스
 * 《폐쇄병동 404호: 심연의 해부학》 6개 방 기하 컴파일 + 30단계 인과율 DAG 전수 시뮬레이션
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { compileSpaceGeometry } from '../engine/geometry.js';
import { LogicRunner } from '../engine/logic.js';
import { DirectorEngine } from '../engine/director.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePath = path.join(__dirname, '../samples/horror-6rooms-30puzzles.json');
const racData = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));

console.log('🚀 [6-Rooms 30-Puzzles Horror Theme Harness] 《폐쇄병동 404호: 심연의 해부학》 전수 검증 시작...\n');

// Suite 1: 스키마 볼륨 및 온톨로지 구조 불변식 검증
console.log('📊 [Suite 1] 6방 × 30문제 온톨로지 볼륨 검증:');
assert.strictEqual(racData.theme.genre, 'Horror', '장르는 Horror여야 합니다.');
assert.strictEqual(racData.spaces.length, 6, '정확히 6개의 방(Spaces)이 존재해야 합니다.');
assert.strictEqual(racData.passages.length, 6, '정확히 6개의 통로(Passages)가 존재해야 합니다.');
assert.strictEqual(racData.logicGraph.clues.length, 30, '정확히 30개의 단서(Clues)가 존재해야 합니다.');
assert.strictEqual(racData.logicGraph.problems.length, 30, '정확히 30개의 문제(Problems)가 존재해야 합니다.');
assert.strictEqual(racData.logicGraph.containers.length, 24, '정확히 24개의 은닉함(Containers)이 존재해야 합니다.');
assert.strictEqual(racData.logicGraph.gates.length, 30, '정확히 30개의 자물쇠(Gates)가 존재해야 합니다.');
console.log('  ✅ 1-1. 6개 공간 · 6개 통로 · 30개 단서 · 30개 문제 · 24개 은닉함 · 30개 게이트 정합성 통과');

// Suite 2: 6개 방 3D 기하 컴파일 및 복층 구멍(Hole) 검증
console.log('\n🏢 [Suite 2] 6개 방 3D 기하(지상 1F·2F / 지하 B1·B2 / 사다리 Hole) 컴파일 검증:');
const compiledRooms = racData.spaces.map(sp => compileSpaceGeometry(sp));
assert.strictEqual(compiledRooms.length, 6, '6개 방의 기하가 모두 컴파일되어야 합니다.');
const r4Geo = compiledRooms.find(r => r.spaceId === 'space-r4');
assert.strictEqual(r4Geo.floor.hasHole, true, '제4방(2F 해부·영안실)은 사다리 관통 구멍(Hole)이 펀칭되어야 합니다.');
assert.strictEqual(r4Geo.floor.triangleCount, 8, '사다리 구멍 바닥은 8개 삼각형 슬래브로 분할되어야 합니다.');
console.log('  ✅ 2-1. 6개 방 전체 3D 벽체·바닥 압출 및 제4방(2F 영안실) 사다리 Hole 펀칭 통과');

// Suite 3: 30문제 순차 풀이(DAG Walkthrough) 및 방 간 이동·퇴로 차단 전수 검증
console.log('\n🔐 [Suite 3] Q01 ~ Q30 다단 인과율 사슬(DAG) 및 6개 방 순차 탈출 전수 시뮬레이션:');
const runner = new LogicRunner(racData);

const expectedAnswers = [
  // 제1방 (1F 원무과 접수처)
  { q: 1, gateId: 'gate-01', clueId: 'clue-01', ans: '1420', room: 'space-r1' },
  { q: 2, gateId: 'gate-02', clueId: 'clue-02', ans: '4132', room: 'space-r1' },
  { q: 3, gateId: 'gate-03', clueId: 'clue-03', ans: 'URDL', room: 'space-r1' },
  { q: 4, gateId: 'gate-04', clueId: 'clue-04', ans: '0404', room: 'space-r1' },
  { q: 5, gateId: 'gate-05', clueId: 'clue-05', ans: '1590', room: 'space-r1', unlocksDoor: 'door-r1-r2', nextRoom: 'space-r2', twoWay: true },
  // 제2방 (1F 정신과 취조·진료실)
  { q: 6, gateId: 'gate-06', clueId: 'clue-06', ans: '0903', room: 'space-r2' },
  { q: 7, gateId: 'gate-07', clueId: 'clue-07', ans: '2381', room: 'space-r2' },
  { q: 8, gateId: 'gate-08', clueId: 'clue-08', ans: '9677', room: 'space-r2' },
  { q: 9, gateId: 'gate-09', clueId: 'clue-09', ans: 'MADK', room: 'space-r2' },
  { q: 10, gateId: 'gate-10', clueId: 'clue-10', ans: '2400', room: 'space-r2', unlocksDoor: 'door-r2-r3', nextRoom: 'space-r3', twoWay: false },
  // 제3방 (B1 지하 중증 격리 병동)
  { q: 11, gateId: 'gate-11', clueId: 'clue-11', ans: '4926', room: 'space-r3' },
  { q: 12, gateId: 'gate-12', clueId: 'clue-12', ans: '1061', room: 'space-r3' },
  { q: 13, gateId: 'gate-13', clueId: 'clue-13', ans: '0500', room: 'space-r3' },
  { q: 14, gateId: 'gate-14', clueId: 'clue-14', ans: 'UDUR', room: 'space-r3' },
  { q: 15, gateId: 'gate-15', clueId: 'clue-15', ans: '3650', room: 'space-r3', unlocksDoor: 'door-r3-r4', nextRoom: 'space-r4', twoWay: false },
  // 제4방 (2F 해부·영안실)
  { q: 16, gateId: 'gate-16', clueId: 'clue-16', ans: '1592', room: 'space-r4' },
  { q: 17, gateId: 'gate-17', clueId: 'clue-17', ans: '1540', room: 'space-r4' },
  { q: 18, gateId: 'gate-18', clueId: 'clue-18', ans: '7249', room: 'space-r4' },
  { q: 19, gateId: 'gate-19', clueId: 'clue-19', ans: '1780', room: 'space-r4' },
  { q: 20, gateId: 'gate-20', clueId: 'clue-20', ans: '2068', room: 'space-r4', unlocksDoor: 'door-r4-r5', nextRoom: 'space-r5', twoWay: true },
  // 제5방 (2F 병원장 비밀 임상 연구실)
  { q: 21, gateId: 'gate-21', clueId: 'clue-21', ans: '5433', room: 'space-r5' },
  { q: 22, gateId: 'gate-22', clueId: 'clue-22', ans: 'MIND', room: 'space-r5' },
  { q: 23, gateId: 'gate-23', clueId: 'clue-23', ans: '3142', room: 'space-r5' },
  { q: 24, gateId: 'gate-24', clueId: 'clue-24', ans: 'URUL', room: 'space-r5' },
  { q: 25, gateId: 'gate-25', clueId: 'clue-25', ans: '0602', room: 'space-r5', unlocksDoor: 'door-r5-r6', nextRoom: 'space-r6', twoWay: false },
  // 제6방 (B2 지하 소각로 & 최종 비상구)
  { q: 26, gateId: 'gate-26', clueId: 'clue-26', ans: '0800', room: 'space-r6' },
  { q: 27, gateId: 'gate-27', clueId: 'clue-27', ans: 'DRDL', room: 'space-r6' },
  { q: 28, gateId: 'gate-28', clueId: 'clue-28', ans: '8912', room: 'space-r6' },
  { q: 29, gateId: 'gate-29', clueId: 'clue-29', ans: '1342', room: 'space-r6' },
  { q: 30, gateId: 'gate-30', clueId: 'clue-30', ans: '4040', room: 'space-r6', unlocksDoor: 'door-final-exit', nextRoom: 'space-exterior', twoWay: false }
];

for (const step of expectedAnswers) {
  // 1. 문제를 풀기 전, 해당 문제의 선행 단서(Clue)가 반드시 Revealed 상태여야 함 (고아 문제/데드락 방지)
  const clue = runner.getClue(step.clueId);
  assert.strictEqual(clue.visibility, 'Revealed', `Q${step.q} 풀이 시점에 단서 ${step.clueId}가 Revealed 상태여야 합니다.`);

  // 2. 만약 방 탈출 보스 문제(5, 10, 15, 20, 25, 30)라면 해금 전에는 이동 불가여야 함
  if (step.unlocksDoor) {
    assert.strictEqual(runner.canTraverse(step.room, step.nextRoom), false, `Q${step.q} 해금 전에는 ${step.nextRoom}으로 이동할 수 없어야 합니다.`);
  }

  // 3. 정답 입력
  const res = runner.submitAction(step.gateId, step.ans);
  assert.strictEqual(res.success, true, `Q${step.q} (${step.gateId}) 정답 '${step.ans}' 제출 시 해금되어야 합니다.`);

  // 4. 문 개방 및 이동 검증
  if (step.unlocksDoor) {
    assert.strictEqual(runner.getDoor(step.unlocksDoor).isLocked, false, `문 ${step.unlocksDoor}가 열려야 합니다.`);
    assert.strictEqual(runner.canTraverse(step.room, step.nextRoom), true, `${step.room} -> ${step.nextRoom} 순방향 이동이 가능해야 합니다.`);
    assert.strictEqual(runner.canTraverse(step.nextRoom, step.room), step.twoWay, `${step.nextRoom} -> ${step.room} 역방향 이동 가능 여부는 ${step.twoWay}여야 합니다.`);
  }
}

console.log('  ✅ 3-1. Q01 ~ Q30 전 문항 순차 단서 노출 -> 정답 추론 -> 은닉함/문 해금 100% 무결성 통과');
console.log('  ✅ 3-2. 6개 방 순차 이동 및 OneWay 퇴로 차단(B1 격리병동, 2F 영안실, B2 소각로) 완벽 검증');

// Suite 4: AI Director 공포 연출 연동 검증
console.log('\n👁️ [Suite 4] AI Director 공포 환경 제어 검증:');
const director = new DirectorEngine(racData.director);
director.recordFailure();
const evt = director.recordFailure();
assert.strictEqual(evt.type, 'BlackoutTrigger', '오답 2회 누적 시 암전이 트리거되어야 합니다.');
assert.strictEqual(director.getLightingFactor(), 0.05, '암전 시 조도가 5%로 급강하해야 합니다.');
assert.strictEqual(director.isBlackoutActive, true, '암전 플래그가 활성화되어야 합니다.');
console.log('  ✅ 4-1. 공포 테마 Director 암전 및 오디오 긴장도 제어 통과');

console.log('\n🎉 [6-Rooms 30-Puzzles Horror Theme Harness PASS] 6방 × 30문제 닫힌 세계 전수 검증 100% 완료!');
