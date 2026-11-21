/**
 * Room as Code (RaC) v1.0 - Closed-World Playability Validator (Pure Linter Engine)
 * 크리에이터 또는 AI 에이전트가 생성한 RaC JSON의 도달성·순환 교착(Deadlock)·계약 완결성을 결정론적으로 검증한다.
 */

export function validateRaC(racData) {
  const errors = [];
  const warnings = [];

  if (!racData || !Array.isArray(racData.spaces) || racData.spaces.length === 0) {
    errors.push({ code: "NO_SPACES", message: "최소 1개 이상의 공간(Space)이 필요합니다." });
    return { valid: false, errors, warnings };
  }

  const spaceIds = new Set(racData.spaces.map(s => s.id));
  const passages = Array.isArray(racData.passages) ? racData.passages : [];
  const lg = racData.logicGraph || {};
  const clues = Array.isArray(lg.clues) ? lg.clues : [];
  const gates = Array.isArray(lg.gates) ? lg.gates : [];
  const containers = Array.isArray(lg.containers) ? lg.containers : [];
  const items = Array.isArray(lg.items) ? lg.items : [];

  // 1. 공간 도달성 검증 (BFS from spaces[0])
  const adj = new Map();
  for (const sid of spaceIds) adj.set(sid, []);
  const isTerminalExit = (id) => typeof id === "string" && /exit|escape|outside|exterior/i.test(id);
  for (const p of passages) {
    if (!spaceIds.has(p.fromSpaceId)) {
      errors.push({ code: "INVALID_PASSAGE_SPACE", id: p.id, message: `통로 ${p.id}의 출발 공간(${p.fromSpaceId})이 존재하지 않습니다.` });
      continue;
    }
    if (isTerminalExit(p.toSpaceId)) continue; // 최종 탈출(Terminal Escape) 출구 허용
    if (!spaceIds.has(p.toSpaceId)) {
      errors.push({ code: "INVALID_PASSAGE_SPACE", id: p.id, message: `통로 ${p.id}가 존재하지 않는 공간을 참조합니다.` });
      continue;
    }
    adj.get(p.fromSpaceId).push(p.toSpaceId);
    if (p.directionality !== "OneWay") {
      adj.get(p.toSpaceId).push(p.fromSpaceId);
    }
  }
  const visited = new Set([racData.spaces[0].id]);
  const queue = [racData.spaces[0].id];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nxt of (adj.get(cur) || [])) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  for (const s of racData.spaces) {
    if (!visited.has(s.id)) {
      errors.push({ code: "UNREACHABLE_SPACE", id: s.id, message: `공간 '${s.name}'(${s.id})에 도달할 통로가 없습니다.` });
    }
  }

  // 2. 게이트 타겟·정답 완결성 및 아이템 자기잠금(Self-Deadlock) 검증
  const doorIds = new Set(passages.filter(p => p.door).map(p => p.door.id));
  const containerMap = new Map(containers.map(c => [c.id, c]));
  const itemIds = new Set(items.map(i => i.id));
  const gateMap = new Map(gates.map(g => [g.id, g]));

  for (const g of gates) {
    if (!g.condition || String(g.condition).trim() === "") {
      errors.push({ code: "EMPTY_GATE_CONDITION", id: g.id, message: `게이트 ${g.id}의 정답 조건(condition)이 비어 있습니다.` });
    }
    if (g.unlocks && !doorIds.has(g.unlocks) && !containerMap.has(g.unlocks)) {
      warnings.push({ code: "UNKNOWN_UNLOCK_TARGET", id: g.id, message: `게이트 ${g.id}의 해금 대상(${g.unlocks})이 문/은닉함 목록에 없습니다.` });
    }
    if (g.requiredItemId && !itemIds.has(g.requiredItemId)) {
      errors.push({ code: "UNKNOWN_REQUIRED_ITEM", id: g.id, message: `게이트 ${g.id}가 존재하지 않는 아이템(${g.requiredItemId})을 요구합니다.` });
    }
    // 자기잠금 탐지: 게이트가 여는 은닉함 안에 그 게이트를 여는 필수 아이템이 들어 있는 경우
    const unlockedCont = containerMap.get(g.unlocks);
    if (unlockedCont && g.requiredItemId && unlockedCont.containsItemId === g.requiredItemId) {
      errors.push({
        code: "ITEM_SELF_DEADLOCK",
        id: g.id,
        message: `순환 교착(Deadlock): 게이트 ${g.id}를 열기 위해 '${g.requiredItemId}'가 필요하지만, 그 아이템이 이 게이트가 여는 은닉함(${unlockedCont.id}) 안에 들어 있습니다.`
      });
    }
  }

  // 3. 선행 퍼즐(requiresGateId / requiresSolvedId) 순환 사이클 탐지 (DFS)
  const color = new Map(); // 0=unvisited, 1=visiting, 2=done
  function hasCycle(gid) {
    color.set(gid, 1);
    const g = gateMap.get(gid);
    const dep = g && (g.requiresGateId || g.requiresSolvedId);
    if (dep && gateMap.has(dep)) {
      const c = color.get(dep) || 0;
      if (c === 1) return true;
      if (c === 0 && hasCycle(dep)) return true;
    }
    color.set(gid, 2);
    return false;
  }
  for (const g of gates) {
    if ((color.get(g.id) || 0) === 0 && hasCycle(g.id)) {
      errors.push({ code: "PREREQUISITE_CYCLE", id: g.id, message: `선행 퍼즐 순환 교착(Deadlock)이 감지되었습니다: ${g.id}` });
    }
  }

  // 4. 단서 텍스트 누락 경고
  for (const cl of clues) {
    if (!cl.payload || String(cl.payload).trim() === "") {
      warnings.push({ code: "EMPTY_CLUE_PAYLOAD", id: cl.id, message: `단서 ${cl.id}의 내용이 비어 있습니다.` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
