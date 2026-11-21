/**
 * Room as Code (RaC) v1.0 - Closed-World Playability Validator Harness
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRaC } from "../engine/validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log("🔎 [RaC Validator Harness] 닫힌 세계 무결성 검증기(도달성·교착 탐지) 테스트 시작...\n");

// 1. 《폐쇄병동 404호》 6방 30문제 원본 샘플은 0 errors로 통과해야 함 (오탐 0)
const horrorJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../samples/horror-6rooms-30puzzles.json"), "utf-8"));
const r1 = validateRaC(horrorJson);
assert.equal(r1.valid, true, `원본 6방 30문제 샘플 오탐 발생: ${JSON.stringify(r1.errors)}`);
console.log("  ✅ 1. 《폐쇄병동 404호》 6방 30문제 샘플 무결성 통과 (errors: 0)");

// 2. 고립된 방(UNREACHABLE_SPACE) 탐지
const unreachableSample = {
  spaces: [
    { id: "s1", name: "시작방", layer: 0, wallHeight: 2.6, polygon: [[0,0],[4,0],[4,4],[0,4]] },
    { id: "s2", name: "고립된 밀실", layer: 0, wallHeight: 2.6, polygon: [[5,0],[9,0],[9,4],[5,4]] }
  ],
  passages: [],
  logicGraph: { clues: [], problems: [], gates: [] }
};
const r2 = validateRaC(unreachableSample);
assert.equal(r2.valid, false);
assert.equal(r2.errors.some(e => e.code === "UNREACHABLE_SPACE"), true, "고립된 방 탐지 실패");
console.log("  ✅ 2. 고립된 방(UNREACHABLE_SPACE) 정확 탐지");

// 3. 아이템 자기잠금(ITEM_SELF_DEADLOCK) 탐지
const deadlockSample = {
  spaces: [{ id: "s1", name: "방1", layer: 0, wallHeight: 2.6, polygon: [[0,0],[4,0],[4,4],[0,4]] }],
  passages: [],
  logicGraph: {
    clues: [{ id: "c1", payload: "테스트" }],
    items: [{ id: "key-1", name: "열쇠" }],
    containers: [{ id: "box-1", name: "금고", containsItemId: "key-1" }],
    gates: [{ id: "g1", condition: "Value == '1234'", requiredItemId: "key-1", unlocks: "box-1" }]
  }
};
const r3 = validateRaC(deadlockSample);
assert.equal(r3.valid, false);
assert.equal(r3.errors.some(e => e.code === "ITEM_SELF_DEADLOCK"), true, "아이템 자기잠금 탐지 실패");
console.log("  ✅ 3. 아이템 자기잠금(ITEM_SELF_DEADLOCK) 정확 탐지");

// 4. 선행 퍼즐 순환 교착(PREREQUISITE_CYCLE) 탐지
const cycleSample = {
  spaces: [{ id: "s1", name: "방1", layer: 0, wallHeight: 2.6, polygon: [[0,0],[4,0],[4,4],[0,4]] }],
  passages: [],
  logicGraph: {
    clues: [],
    gates: [
      { id: "g1", condition: "Value == '1111'", requiresGateId: "g2", unlocks: "d1" },
      { id: "g2", condition: "Value == '2222'", requiresGateId: "g1", unlocks: "d2" }
    ]
  }
};
const r4 = validateRaC(cycleSample);
assert.equal(r4.valid, false);
assert.equal(r4.errors.some(e => e.code === "PREREQUISITE_CYCLE"), true, "선행 퍼즐 순환 사이클 탐지 실패");
console.log("  ✅ 4. 선행 퍼즐 순환 교착(PREREQUISITE_CYCLE) 정확 탐지");

console.log("\n🎉 [RaC Validator Harness PASS] 4대 닫힌 세계 검증 불변식 100% 통과!");
