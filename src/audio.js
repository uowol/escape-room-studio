// Web Audio API horror sound synthesizer
    export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let heartbeatLoopTimer = null;

    export function playSfx(type) {
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        if (type === 'click') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(820, now);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
          osc.start(); osc.stop(now + 0.04);
        } else if (type === 'unlock') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(330, now);
          osc.frequency.exponentialRampToValueAtTime(920, now + 0.25);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          osc.start(); osc.stop(now + 0.35);
        } else if (type === 'drone') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(52, now);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 2.2);
          osc.start(); osc.stop(now + 2.2);
        } else if (type === 'spark') {
          // 형광등 고전압 방전 / 찌지직 스파크 노이즈 합성
          const bufferSize = Math.floor(audioCtx.sampleRate * 0.12);
          const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
          const output = noiseBuffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
          }
          const whiteNoise = audioCtx.createBufferSource();
          whiteNoise.buffer = noiseBuffer;

          const bqFilter = audioCtx.createBiquadFilter();
          bqFilter.type = 'bandpass';
          bqFilter.frequency.setValueAtTime(3200, now);
          bqFilter.Q.setValueAtTime(3.8, now);

          const sparkGain = audioCtx.createGain();
          sparkGain.gain.setValueAtTime(0.28, now);
          sparkGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

          whiteNoise.connect(bqFilter);
          bqFilter.connect(sparkGain);
          sparkGain.connect(audioCtx.destination);
          whiteNoise.start(now);
          whiteNoise.stop(now + 0.12);
        } else if (type === 'heartbeat') {
          // 초저주파 심장박동 더블 쿵...쿵... (Systole + Diastole)
          // 1st Beat (쿵)
          const osc1 = audioCtx.createOscillator();
          const gain1 = audioCtx.createGain();
          osc1.connect(gain1); gain1.connect(audioCtx.destination);
          osc1.frequency.setValueAtTime(58, now);
          osc1.frequency.exponentialRampToValueAtTime(36, now + 0.13);
          gain1.gain.setValueAtTime(0.35, now);
          gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.13);
          osc1.start(now); osc1.stop(now + 0.13);

          // 2nd Beat (쿵) - 0.15초 후
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.connect(gain2); gain2.connect(audioCtx.destination);
          osc2.frequency.setValueAtTime(50, now + 0.15);
          osc2.frequency.exponentialRampToValueAtTime(32, now + 0.28);
          gain2.gain.setValueAtTime(0.24, now + 0.15);
          gain2.gain.exponentialRampToValueAtTime(0.005, now + 0.28);
          osc2.start(now + 0.15); osc2.stop(now + 0.28);
        } else if (type === 'scare') {
          // 점프스케어 디스토션 불협화음 + 비명형 고주파 스윕
          const osc1 = audioCtx.createOscillator();
          const osc2 = audioCtx.createOscillator();
          const screamOsc = audioCtx.createOscillator();
          const scareGain = audioCtx.createGain();

          osc1.type = 'sawtooth';
          osc2.type = 'sawtooth';
          screamOsc.type = 'triangle';

          osc1.frequency.setValueAtTime(140, now);
          osc1.frequency.exponentialRampToValueAtTime(55, now + 0.7);
          osc2.frequency.setValueAtTime(148, now);
          osc2.frequency.exponentialRampToValueAtTime(51, now + 0.7);

          screamOsc.frequency.setValueAtTime(1180, now);
          screamOsc.frequency.exponentialRampToValueAtTime(380, now + 0.6);

          osc1.connect(scareGain);
          osc2.connect(scareGain);
          screamOsc.connect(scareGain);
          scareGain.connect(audioCtx.destination);

          scareGain.gain.setValueAtTime(0.38, now);
          scareGain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);

          osc1.start(now); osc1.stop(now + 0.85);
          osc2.start(now); osc2.stop(now + 0.85);
          screamOsc.start(now); screamOsc.stop(now + 0.85);
        } else if (type === 'step') {
          // 1인칭 이동 시 마룻바닥 발걸음 탭음
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(260 + Math.random() * 40, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.05);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(); osc.stop(now + 0.05);
        }
      } catch (e) {}
    }

    export function startHeartbeatLoop(bpm = 124) {
      if (heartbeatLoopTimer) clearInterval(heartbeatLoopTimer);
      playSfx('heartbeat');
      const intervalMs = Math.round((60 / bpm) * 1000);
      heartbeatLoopTimer = setInterval(() => {
        playSfx('heartbeat');
      }, intervalMs);
    }

    export function stopHeartbeatLoop() {
      if (heartbeatLoopTimer) {
        clearInterval(heartbeatLoopTimer);
        heartbeatLoopTimer = null;
      }
    }
