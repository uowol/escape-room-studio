/**
 * Room as Code (RaC) v1.0 - Ontology Deepening Harness (v2)
 * 검증 대상:
 * 1. Item 자유 정체성 + 닫힌 4원자 효과 (unlock / revealClue / activate / combine) & consumable
 * 2. Mechanism 물리 장치 5종 상태 벡터 판정 (rotary-dial / clock-hands / balance-scale / uv-scan / pressure-valve)
 * 3. Director 극중 인물 페르소나 · 동적 관측(observe) · 쿨다운 · 거래(barter) · LLM 훅 안전 폴백
 */
import assert from "node:assert/strict";
import { LogicRunner } from "../engine/logic.js";
import { DirectorEngine } from "../engine/director.js";

console.log("🧬 [RaC Ontology v2 Harness] Item 4원자 · Mechanism 5종 · Director 페르소나/거래 검증 시작...\n");

// ---------------------------------------------------------------------------
// Suite 1: Item 자유 정체성 + 닫힌 4원자 효과
// ---------------------------------------------------------------------------
const itemSample = {
  version: "1.0",
  theme: { id: "ontology-v2-test", title: "온톨로지 심화 테스트", durationMinutes: 60 },
  spaces: [
    { id: "s1", name: "연구실", layer: 0, wallHeight: 2.6, polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], props: [] },
    { id: "s2", name: "비밀실", layer: 0, wallHeight: 2.6, polygon: [[4, 0], [8, 0], [8, 4], [4, 4]], props: [] }
  ],
  passages: [
    { id: "p1", fromSpaceId: "s1", toSpaceId: "s2", directionality: "TwoWay", door: { id: "door-secret", type: "EMLockDoor", isLocked: true } }
  ],
  logicGraph: {
    clues: [
      { id: "clue-tape", payload: "캠코더 영상 재생: 비밀 금고 코드는 7749" }
    ],
    problems: [
      { id: "prob-1", consumes: ["clue-tape"], rule: "카드키 또는 기믹으로 해금", outputGate: "gate-door" }
    ],
    containers: [
      { id: "cont-drawer", name: "서랍", containsClueId: "clue-tape", containsItemId: "item-battery" }
    ],
    items: [
      { id: "item-cardkey", name: "보안 카드키", tags: ["key"], consumable: false },
      { id: "item-bear-head", name: "곰인형 머리", tags: ["doll", "part"], consumable: true },
      { id: "item-camcorder", name: "낡은 캠코더", tags: ["media"], consumable: false },
      { id: "item-battery", name: "AA 건전지", tags: ["power"], consumable: true },
      { id: "item-uv-empty", name: "방전된 UV 손전등", tags: ["tool"], consumable: true },
      { id: "item-uv-ready", name: "작동하는 UV 손전등", tags: ["tool", "uv"], consumable: false }
    ],
    interactions: [
      { id: "ix-1", itemId: "item-cardkey", targetId: "gate-door", effect: "unlock", message: "카드키가 인식되어 문이 열렸습니다." },
      { id: "ix-2", itemId: "item-bear-head", targetId: "prop-headless-bear", effect: "activate", resultId: "prop-headless-bear", message: "곰인형 머리를 올리자 비밀 스위치가 딸깍 눌렸습니다." },
      { id: "ix-3", itemId: "item-camcorder", targetId: "prop-tv-dock", effect: "revealClue", resultId: "clue-tape", message: "캠코더를 거치대에 올리자 녹화 영상이 재생됩니다." },
      { id: "ix-4", itemId: "item-battery", targetId: "item-uv-empty", effect: "combine", resultId: "item-uv-ready", message: "건전지를 넣어 UV 손전등이 켜졌습니다." }
    ],
    gates: [
      { id: "gate-drawer", interfaceType: "MechanicalLock", condition: "Value == '1234'", unlocks: "cont-drawer" },
      { id: "gate-door", interfaceType: "ItemSocket", condition: "Value == 'BYPASS'", requiredItemId: "item-cardkey", unlocks: "door-secret" },
      // 5대 물리 장치(Mechanism) 선언
      { id: "gate-mech-1", interfaceType: "PhysicalMechanism", condition: "Value == 'URDL'", mechanism: { kind: "rotary-dial", targetState: ["U", "R", "D", "L"] }, unlocks: "cont-drawer" },
      { id: "gate-mech-2", interfaceType: "PhysicalMechanism", condition: "Value == '0300'", mechanism: { kind: "clock-hands", targetState: { hour: 3, minute: 0 } }, unlocks: "cont-drawer" },
      { id: "gate-mech-3", interfaceType: "PhysicalMechanism", condition: "Value == '750'", mechanism: { kind: "balance-scale", targetState: 750, tolerance: 5 }, unlocks: "cont-drawer" },
      { id: "gate-mech-4", interfaceType: "PhysicalMechanism", condition: "Value == 'UV_OK'", mechanism: { kind: "uv-scan", targetState: { revealed: true } }, unlocks: "cont-drawer" },
      { id: "gate-mech-5", interfaceType: "PhysicalMechanism", condition: "Value == '60'", mechanism: { kind: "pressure-valve", targetState: [20, 40], tolerance: 2 }, unlocks: "cont-drawer" }
    ]
  }
};

const runner = new LogicRunner(itemSample);

// 1-1. Container 개방 시 containsItemId 자동 획득
const drawerRes = runner.submitAction("gate-drawer", "1234");
assert.equal(drawerRes.success, true);
assert.equal(runner.hasItem("item-battery"), true, "은닉함 개방 시 건전지 아이템 자동 획득 실패");

// 1-2. combine (건전지 + 방전 UV 손전등 -> 작동 UV 손전등, 소모성 소비 확인)
runner.collectItem("item-uv-empty");
const combineRes = runner.applyItem("item-battery", "item-uv-empty");
assert.equal(combineRes.success, true);
assert.equal(combineRes.effect, "combine");
assert.equal(runner.hasItem("item-uv-ready"), true, "조합 결과 아이템 생성 실패");
assert.equal(runner.hasItem("item-battery"), false, "소모성 건전지 차감 실패");
assert.equal(runner.hasItem("item-uv-empty"), false, "소모성 방전 손전등 차감 실패");

// 1-3. activate (곰인형 머리 -> 머리 없는 곰인형 장착, 소모성 소비)
runner.collectItem("item-bear-head");
const actRes = runner.applyItem("item-bear-head", "prop-headless-bear");
assert.equal(actRes.success, true);
assert.equal(runner.isActivated("prop-headless-bear"), true, "곰인형 활성화 실패");
assert.equal(runner.hasItem("item-bear-head"), false, "장착된 곰인형 머리 소모 실패");

// 1-4. revealClue (캠코더 -> 거치대 올려 영상 단서 노출, 비소모성 유지)
runner.collectItem("item-camcorder");
const clueRes = runner.applyItem("item-camcorder", "prop-tv-dock");
assert.equal(clueRes.success, true);
assert.equal(runner.getClue("clue-tape").visibility, "Revealed");
assert.equal(runner.hasItem("item-camcorder"), true, "비소모성 캠코더 유지 실패");

// 1-5. requiredItemId 미보유 거부 & unlock (카드키 -> 문 개방, 비소모성 유지)
const deniedDoor = runner.submitAction("gate-door", "BYPASS");
assert.equal(deniedDoor.success, false, "필수 아이템 없이 게이트 통과 차단 실패");
assert.equal(deniedDoor.missingItemId, "item-cardkey");

runner.collectItem("item-cardkey");
const unlockRes = runner.applyItem("item-cardkey", "gate-door");
assert.equal(unlockRes.success, true);
assert.equal(runner.canTraverse("s1", "s2"), true, "카드키 unlock 후 공간 전이 실패");
assert.equal(runner.hasItem("item-cardkey"), true, "비소모성 카드키 유지 실패");
console.log("  ✅ Suite 1 통과: Item 4원자 효과(unlock/revealClue/activate/combine) & consumable 무결성");

// ---------------------------------------------------------------------------
// Suite 2: Mechanism 5대 물리 장치 상태 벡터 판정
// ---------------------------------------------------------------------------
assert.equal(runner.submitAction("gate-mech-1", ["U", "R", "D", "U"]).success, false);
assert.equal(runner.submitAction("gate-mech-1", ["U", "R", "D", "L"]).success, true);

assert.equal(runner.submitAction("gate-mech-2", { hour: 6, minute: 30 }).success, false);
assert.equal(runner.submitAction("gate-mech-2", { hour: 3, minute: 0 }).success, true);

assert.equal(runner.submitAction("gate-mech-3", 700).success, false);
assert.equal(runner.submitAction("gate-mech-3", 753).success, true); // tolerance 5 이내

assert.equal(runner.submitAction("gate-mech-4", { revealed: false }).success, false);
assert.equal(runner.submitAction("gate-mech-4", { revealed: true }).success, true);

assert.equal(runner.submitAction("gate-mech-5", [10, 40]).success, false);
assert.equal(runner.submitAction("gate-mech-5", [21, 39]).success, true); // tolerance 2 이내
console.log("  ✅ Suite 2 통과: Mechanism 5대 물리 장치 상태 벡터·허용 오차 판정 무결성");

// ---------------------------------------------------------------------------
// Suite 3: Director 동적 관측 · 쿨다운 · 극중 인물 페르소나 · 거래(barter) · LLM 폴백
// ---------------------------------------------------------------------------
const director = new DirectorEngine({
  persona: { name: "야간 당직 간호사", role: "404호 감시자", tone: "장난스럽고 서늘함" },
  rules: [
    {
      id: "rule-stall",
      trigger: { kind: "stallSeconds", threshold: 90 },
      action: "whisper",
      cooldownSeconds: 60,
      payload: { text: "한참 헤매고 계시네요... 접수대 위 머그잔 손잡이를 돌려보셨나요?" }
    },
    {
      id: "rule-barter",
      trigger: { kind: "helpRequested" },
      action: "barter",
      cooldownSeconds: 10,
      payload: { challenge: "힌트를 원하시면 인터폰 버튼을 3초 안에 5번 두드려 보세요!", rewardHint: "정답의 첫 자리는 4입니다." }
    }
  ],
  llmAdapter: async () => { throw new Error("offline"); } // 오프라인 예외 시 안전 폴백 검증
});

// 체류 50초 -> 미발동, 95초 -> 발동, 직후 재요청 -> 쿨다운 차단
assert.equal(director.observe({ type: "stallSeconds", value: 50 }), null);
const d1 = director.observe({ type: "stallSeconds", value: 95 });
assert.equal(d1.action, "whisper");
assert.equal(d1.persona.name, "야간 당직 간호사");
assert.equal(director.observe({ type: "stallSeconds", value: 100 }), null, "쿨다운 차단 실패");

// 65초 경과 후 쿨다운 해제
director.tick(65);
assert.notEqual(director.observe({ type: "stallSeconds", value: 160 }), null);

// 도움 요청 -> 거래(barter) 발동 + LLM 예외 시 결정론적 폴백
const barter = director.observe({ type: "helpRequested" });
assert.equal(barter.action, "barter");
const resolved = await director.resolveDirective(barter, { room: "s1" });
assert.equal(resolved.payload.challenge.includes("5번"), true, "LLM 장애 시 안전 폴백 실패");
console.log("  ✅ Suite 3 통과: Director 동적 관측 · 쿨다운 · 페르소나 거래(barter) · LLM 안전 폴백 무결성");

console.log("\n🎉 [RaC Ontology v2 Harness PASS] 3대 온톨로지 심화 불변식 100% 통과!");
