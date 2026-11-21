/**
 * Room as Code (RaC) v1.0 - AI Director Runtime Engine
 * 60분 타임어택 카운트다운, 플레이어 패닉/체류 시간 관측 및 물리 환경(조명, 사운드, 문) 지배 순수 로직
 */

export class DirectorEngine {
  constructor(config = {}) {
    this.timeLimitMinutes = config.timeLimitMinutes || 60;
    this.timeLimitSeconds = this.timeLimitMinutes * 60;
    this.elapsedSeconds = 0;
    this.tensionLevel = config.tensionLevel || 1; // 1(Normal) ~ 5(Terminal)
    this.panicThresholdFailures = config.panicThresholdFailures || 2;
    this.failureCount = 0;
    this.isBlackoutActive = false;

    // 극중 인물 페르소나 & 규칙 기반 동적 관측·개입 계약
    this.persona = config.persona || {
      name: "404호 야간 당직 간호사",
      role: "폐쇄병동 감시자이자 가끔 장난기 어린 조력자",
      tone: "차분하지만 묘하게 장난스럽고 서늘한 경어체"
    };
    this.rules = Array.isArray(config.rules) ? config.rules.map(r => ({ cooldownSeconds: 30, ...r })) : [];
    this.lastTriggeredAt = new Map(); // ruleId -> elapsedSeconds
    this.llmAdapter = typeof config.llmAdapter === "function" ? config.llmAdapter : null;
  }

  /**
   * 플레이어 행동 이벤트를 관측해 매칭되는 룰 기반 개입(Directive)을 반환한다.
   * @param {{ type: 'stallSeconds'|'consecutiveFailures'|'roomEntered'|'helpRequested', value?: number, spaceId?: string }} event
   */
  observe(event) {
    if (!event || !event.type) return null;
    for (const rule of this.rules) {
      if (!rule.trigger || rule.trigger.kind !== event.type) continue;
      if (rule.trigger.spaceId && rule.trigger.spaceId !== event.spaceId) continue;
      if (typeof rule.trigger.threshold === "number" && (event.value || 0) < rule.trigger.threshold) continue;

      const last = this.lastTriggeredAt.get(rule.id);
      if (last !== undefined && (this.elapsedSeconds - last) < rule.cooldownSeconds) continue;

      this.lastTriggeredAt.set(rule.id, this.elapsedSeconds);
      if (rule.action === "blackout") {
        this.isBlackoutActive = true;
        this.tensionLevel = Math.min(5, this.tensionLevel + 1);
      }
      return {
        ruleId: rule.id,
        action: rule.action,
        persona: this.persona,
        payload: rule.payload || {},
        tensionLevel: this.tensionLevel
      };
    }
    return null;
  }

  /**
   * 선택적 LLM 어댑터 훅: 연결돼 있으면 대사/거래 내용을 동적 생성하고,
   * 미연결 또는 예외 시 결정론적 기본 payload로 100% 안전 폴백한다.
   */
  async resolveDirective(directive, context = {}) {
    if (!directive) return null;
    if (!this.llmAdapter) return directive;
    try {
      const enriched = await this.llmAdapter({ directive, persona: this.persona, context });
      return enriched ? { ...directive, payload: { ...directive.payload, ...enriched } } : directive;
    } catch (_) {
      return directive;
    }
  }

  tick(deltaSeconds = 1) {
    this.elapsedSeconds += deltaSeconds;
    if (this.isTimeOver()) {
      this.tensionLevel = 5;
      return {
        type: "TimeOver",
        message: "제한 시간이 초과되었습니다. 닫힌 세계 탈출에 실패했습니다."
      };
    }

    // 45분 경과 시 긴장감 자동 상승 (남은 시간 15분)
    if (this.elapsedSeconds >= this.timeLimitSeconds * 0.75 && this.tensionLevel < 3) {
      this.tensionLevel = 3;
      return {
        type: "TimeWarning",
        tensionLevel: this.tensionLevel,
        message: "시간이 15분밖에 남지 않았습니다... 주변의 공기가 차가워집니다."
      };
    }

    return null;
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.panicThresholdFailures) {
      this.tensionLevel = Math.min(5, this.tensionLevel + 1);
      this.isBlackoutActive = true;
      return {
        type: "BlackoutTrigger",
        tensionLevel: this.tensionLevel,
        flickerDurationMs: 1500,
        audioPitch: 0.85, // 저주파 불길한 사운드 피치 저하
        message: "Director가 개입하여 조명을 강제 암전시키고 긴장감을 증폭합니다."
      };
    }
    return null;
  }

  resolveBlackout() {
    this.isBlackoutActive = false;
  }

  isTimeOver() {
    return this.elapsedSeconds >= this.timeLimitSeconds;
  }

  getRemainingTimeFormatted() {
    const remaining = Math.max(0, this.timeLimitSeconds - this.elapsedSeconds);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Three.js 조명 조도 계수 계산 (0.0 ~ 1.0)
   */
  getLightingFactor() {
    if (this.isBlackoutActive) return 0.05; // 칠흑 같은 암전
    switch (this.tensionLevel) {
      case 1: return 1.0;
      case 2: return 0.8;
      case 3: return 0.6;
      case 4: return 0.35;
      case 5: return 0.1;
      default: return 1.0;
    }
  }
}
