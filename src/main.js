
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  getPbrTexturePack,
  getPropDetailTexture,
  getProceduralTileTexture,
  getProceduralWallTexture,
  getBoxGeo,
  getCylGeo,
  getPlaneGeo,
  loadGlbCached,
  disposeObject3D
} from './pbr.js';
import {
  playSfx,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  audioCtx
} from './audio.js';
import {
  initLightPool,
  syncLightPool,
  hasActiveLightingAnimation,
  setupRoomLightFixtures,
  setupCorridorLightFixtures,
  clearActiveFixtures,
  updateLightFixtures,
  setDirectorLightMultiplier,
  setFpsLightingMultiplier,
  setLightFixtureOn,
  extinguishGuidanceLightsForProp,
  resetAllLightsForMode,
  getMountedLightCount,
  getLightTargetPropIds,
  activeFixtures
} from './lighting.js';
import { validateRaC } from '../engine/validator.js';
import { CraftBuilder } from './builder.js';
    // -------------------------------------------------------------
    // 0. ARCHITECTURAL BUILDING & FLOORS CONFIG (Unified Spine)
    // -------------------------------------------------------------
    const FLOOR_CONFIGS = {
      "1f": {
        id: "1f", name: "1F 지상 병동층", height: 0.0,
        rooms: [0, 1, 2],
        corridorId: "corridor-1f",
        corridorName: "1F 중앙 폐쇄 복도",
        totalW: 25.0, totalH: 5.5,
        corridor: {
          x: 6.0, z: 0.0, w: 3.0, h: 5.0,
          wallColor: 0x334155, floorColor: 0x0f172a, lightColor: 0x38bdf8,
          atmosphere: "희미한 비상구 유도등 & 버려진 휠체어",
          props: [
            { type: "wheelchair", name: "버려진 휠체어", x: 7.5, z: 2.2, w: 0.8, d: 0.8, color: "#64748b" },
            { type: "exit-sign", name: "초록 비상구 유도등", x: 7.5, z: 0.1, w: 0.6, d: 0.15, color: "#22c55e" },
            { type: "iv-stand", name: "녹슨 링거 거치대", x: 8.2, z: 3.8, w: 0.4, d: 0.4, color: "#94a3b8" }
          ]
        }
      },
      "2f": {
        id: "2f", name: "2F 상층 연구동", height: 2.6,
        rooms: [3, 4, 5],
        corridorId: "corridor-2f",
        corridorName: "2F 비밀 연구 복도",
        totalW: 25.0, totalH: 5.5,
        corridor: {
          x: 12.5, z: 0.0, w: 3.0, h: 5.0,
          wallColor: 0x334155, floorColor: 0x1a2024, lightColor: 0x94a3b8,
          atmosphere: "차가운 표본 선반 & 비상등",
          props: [
            { type: "sample-shelf", name: "장기 표본 진열장", x: 14.0, z: 1.5, w: 0.6, d: 1.4, color: "#64748b" },
            { type: "uv-lamp", name: "천장 비상등", x: 14.0, z: 3.5, w: 0.8, d: 0.2, color: "#94a3b8" }
          ]
        }
      }
    };
    const DEFAULT_FLOOR_CONFIGS = JSON.parse(JSON.stringify(FLOOR_CONFIGS));

    // -------------------------------------------------------------
    // 1. 6 ROOMS & 30 PUZZLES MASTER DATA (Single Contract Spine)
    // -------------------------------------------------------------
    const ROOM_CONFIGS = [
      {
        idx: 0, id: "space-r1", floorId: "1f", shortName: "제1방: 1F 접수처", fullName: "제1방: 1F 원무과 접수처",
        layerLabel: "1F 지상", floorHeight: 0.0, wallHeight: 2.6, w: 6.0, h: 5.0,
        worldX: 0.0, worldZ: 0.0, hasWestDoor: false, hasEastDoor: true,
        materials: { wall: "plaster", floor: "tile" },
        passageInfo: "TwoWay ➔ 제2방 진료실 (1F 중앙 복도 경유)",
        floorColor: 0x1e293b, wallColor: 0x475569, lightColor: 0xe0f2fe, atmosphere: "차가운 청백색 형광등",
        doorId: "door-r1-r2",
        lights: [
          { id: "light-r1-fl1", kind: "fluorescent", pos: [3.0, 2.42, 2.5], color: "#c8dcff", intensity: 1.4, distance: 5.5, flicker: true, initiallyOn: true },
          { id: "light-r1-q02", kind: "pin-spot", pos: [4.1, 2.42, 0.95], targetPos: [4.5, 0.95, 0.45], color: "#ffe4b5", intensity: 2.2, distance: 5.5, flicker: false, initiallyOn: false, targetPropId: "prop-r1-02" }
        ]
      },
      {
        idx: 1, id: "space-r2", floorId: "1f", shortName: "제2방: 1F 진료실", fullName: "제2방: 1F 정신과 취조·진료실",
        layerLabel: "1F 지상", floorHeight: 0.0, wallHeight: 2.6, w: 6.5, h: 5.0,
        worldX: 9.0, worldZ: 0.0, hasWestDoor: true, hasEastDoor: true,
        materials: { wall: "plaster", floor: "wood" },
        passageInfo: "TwoWay ➔ 제3방 1F 격리병동 직결",
        floorColor: 0x261f1a, wallColor: 0x574c43, lightColor: 0xfef3c7, atmosphere: "어두운 호박색 최면등",
        doorId: "door-r2-r3",
        lights: [
          { id: "light-r2-lamp1", kind: "ceiling", pos: [3.2, 2.44, 2.5], color: "#ffcf8a", intensity: 1.4, distance: 5.5, flicker: false, initiallyOn: false }
        ]
      },
      {
        idx: 2, id: "space-r3", floorId: "1f", shortName: "제3방: 1F 격리병동", fullName: "제3방: 1F 중증 격리 병동 (계단실 연결)",
        layerLabel: "1F 지상", floorHeight: 0.0, wallHeight: 2.6, w: 7.0, h: 5.0,
        worldX: 15.5, worldZ: 0.0, hasWestDoor: true, hasEastDoor: true,
        materials: { wall: "concrete", floor: "concrete" },
        passageInfo: "동쪽 실물 계단실 ➔ 2F 영안실 상승",
        floorColor: 0x1c1c20, wallColor: 0x383436, lightColor: 0xe2e8f0, atmosphere: "차가운 격리 비상등",
        doorId: "door-r3-r4",
        lights: [
          { id: "light-r3-em1", kind: "emergency", pos: [3.5, 2.42, 0.08], wallSide: "N", color: "#ff4433", intensity: 1.5, distance: 5.5, flicker: true, initiallyOn: false }
        ]
      },
      {
        idx: 3, id: "space-r4", floorId: "2f", shortName: "제4방: 2F 영안실", fullName: "제4방: 2F 해부·영안실 (계단실 도착)",
        layerLabel: "2F 상층 (+2.6m)", floorHeight: 2.6, wallHeight: 2.6, w: 7.0, h: 5.0,
        worldX: 15.5, worldZ: 0.0, hasWestDoor: true, hasEastDoor: true,
        materials: { wall: "tile", floor: "tile" },
        passageInfo: "2F 비밀 복도 ➔ 제5방 원장밀실",
        hasHole: false,
        floorColor: 0x1a2024, wallColor: 0x343f45, lightColor: 0xdbeafe, atmosphere: "차가운 영안실 수술등",
        doorId: "door-r4-r5",
        lights: [
          { id: "light-r4-surg1", kind: "surgical", pos: [3.5, 2.42, 2.5], color: "#d6f0ff", intensity: 2.0, distance: 5.5, flicker: false, initiallyOn: false }
        ]
      },
      {
        idx: 4, id: "space-r5", floorId: "2f", shortName: "제5방: 2F 원장밀실", fullName: "제5방: 2F 병원장 비밀 임상 연구실",
        layerLabel: "2F 상층 (+2.6m)", floorHeight: 2.6, wallHeight: 2.6, w: 6.5, h: 5.0,
        worldX: 6.0, worldZ: 0.0, hasWestDoor: true, hasEastDoor: true,
        materials: { wall: "wood", floor: "wood" },
        passageInfo: "서쪽 보안문 ➔ 제6방 2F 특수 소각로",
        floorColor: 0x1f1b18, wallColor: 0x3c342e, lightColor: 0xfef3c7, atmosphere: "어두운 연구실 스탠드등",
        doorId: "door-r5-r6",
        lights: [
          { id: "light-r5-lamp1", kind: "ceiling", pos: [3.2, 2.44, 2.5], color: "#ffdfa0", intensity: 1.5, distance: 5.5, flicker: false, initiallyOn: false }
        ]
      },
      {
        idx: 5, id: "space-r6", floorId: "2f", shortName: "제6방: 2F 소각로", fullName: "제6방: 2F 특수 소각로 & 최종 비상탈출구",
        layerLabel: "2F 상층 (+2.6m)", floorHeight: 2.6, wallHeight: 2.6, w: 6.0, h: 5.0,
        worldX: 0.0, worldZ: 0.0, hasWestDoor: false, hasEastDoor: true,
        materials: { wall: "concrete", floor: "rustedMetal" },
        passageInfo: "최종 비상탈출구 (Victory)",
        floorColor: 0x1a1817, wallColor: 0x36302c, lightColor: 0xffedd5, atmosphere: "소각로 비상등",
        doorId: "door-final-exit",
        lights: [
          { id: "light-r6-em1", kind: "emergency", pos: [3.0, 2.42, 0.08], wallSide: "N", color: "#ff4d1a", intensity: 1.8, distance: 5.5, flicker: true, initiallyOn: false }
        ]
      }
    ];

    // -------------------------------------------------------------
    // 2. PROP ONTOLOGY & FAMOUS GIMMICKS (Single Contract Carrier)
    // -------------------------------------------------------------
    const PROP_ONTOLOGY = [
      {
        id: "prop-clock-r1", targetObjId: "prop-r1-01", roomIdx: 0,
        type: "clock", name: "원무과 벽걸이 아날로그 시계",
        wallSnapped: true, wallSide: "N", x: 1.5, z: 0.05, y: 1.85,
        gimmick: {
          kind: "clock-angle",
          data: { timeString: "14:20 (02:20)", hourAngle: 70, minuteAngle: 120 },
          description: "원무과 북쪽 벽에 걸린 낡은 벽걸이 시계. 시침과 분침이 [오후 2시 20분 (14:20)]에 멈춰 있다. 바로 아래 원무과 접수 데스크(Q01)의 당직표 정답(1420)과 일치한다."
        }
      },
      {
        id: "prop-cup-r1", targetObjId: "prop-r1-03", roomIdx: 0,
        type: "cup", name: "접수대 위 4개 머그잔",
        tableSnapped: true, targetParentId: "prop-r1-01",
        gimmick: {
          kind: "cup-handle",
          data: {
            handleDirections: ["U", "R", "D", "L"],
            angles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
            labels: ["북(U)", "동(R)", "남(D)", "서(L)"]
          },
          description: "접수대 위에 놓인 4개의 커피잔. 손잡이들이 각각 [북(U) ➔ 동(R) ➔ 남(D) ➔ 서(L)]을 가리켜 방향 자물쇠의 정답(URDL)을 암시한다."
        }
      },
      {
        id: "prop-doc-r1", targetObjId: "prop-r1-02", roomIdx: 0,
        type: "document", name: "차트 클립보드 서류",
        tableSnapped: true, targetParentId: "prop-r1-01",
        gimmick: {
          kind: "blood-marking",
          data: { markedText: "D동 ➔ A동 ➔ C동 ➔ B동", codeNumbers: "4132" },
          description: "차트 위에 붉은색 혈흔으로 'D동(4) - A동(1) - C동(3) - B동(2)'가 강조 마킹되어 있다."
        }
      },
      {
        id: "prop-clock-r2", targetObjId: "prop-r2-06", roomIdx: 1,
        type: "clock", name: "취조실 괘종시계",
        wallSnapped: true, wallSide: "W", x: 0.45, z: 1.2, y: 1.5,
        skipOwnMesh: true, // prop-r2-06 3D 괘종시계 본체와 통합 렌더링 (중복 메쉬 방지)
        gimmick: {
          kind: "clock-angle",
          data: { timeString: "03:00", hourAngle: 90, minuteAngle: 0, degrees: 90 },
          description: "3시 정각에 멈춘 괘종시계. 시침과 분침이 정확히 90도 직각을 이루며 3시를 가리킨다 (0903)."
        }
      },
      {
        id: "prop-portrait-r2", targetObjId: "prop-r2-07", roomIdx: 1,
        type: "portrait", name: "병원장 설립자 초상화 액자",
        wallSnapped: true, wallSide: "N", x: 4.8, z: 0.05, y: 1.7,
        gimmick: {
          kind: "portrait-pointer",
          data: { pointingVector: "SOUTH-WEST", targetName: "서쪽 사물함" },
          description: "유화 액자 속 병원장의 검지 손가락이 남서쪽 사물함을 뚜렷하게 가리키고 있다."
        }
      },
      {
        id: "prop-bookshelf-r5", targetObjId: "prop-r5-21", roomIdx: 4,
        type: "bookshelf", name: "비밀 연구 서고 양장본 책장",
        wallSnapped: true, wallSide: "N", x: 2.0, z: 0.45, y: 1.3,
        gimmick: {
          kind: "book-spine",
          data: { bookHeights: [5, 4, 3, 3], pattern: "5433" },
          description: "책장에 꽂힌 비밀 연구 일지들의 금박 띠 높이가 [5 - 4 - 3 - 3] 계단형으로 배열되어 있다."
        }
      }
    ];

    const DEFAULT_PROP_ONTOLOGY = JSON.parse(JSON.stringify(PROP_ONTOLOGY));
    const carriedIds = new Set(); // objects/props currently picked up by CraftBuilder (hidden, excluded from wall carving)

    // -------------------------------------------------------------
    // 3. INTERIOR PARTITION WALLS (Atmospheric Concept Dividers)
    // -------------------------------------------------------------
    const ROOM_PARTITIONS = [
      { roomIdx: 0, type: "glass-counter", x1: 2.8, z1: 0.0, x2: 2.8, z2: 3.0, h: 2.3, name: "원무과 접수 유리창구 가벽" },
      { roomIdx: 1, type: "curtain", x1: 3.2, z1: 0.0, x2: 3.2, z2: 3.0, h: 2.4, name: "진료실 프라이버시 커튼 레일" },
      { roomIdx: 2, type: "iron-grate", x1: 3.6, z1: 0.0, x2: 3.6, z2: 3.6, h: 2.6, name: "중증 환자 격리 철창 격벽" },
      { roomIdx: 3, type: "tile-wall", x1: 3.5, z1: 1.8, x2: 3.5, z2: 5.5, h: 2.4, name: "부검·사체보관 차폐 타일 가벽" },
      { roomIdx: 4, type: "bookshelf-wall", x1: 3.5, z1: 1.5, x2: 3.5, z2: 5.5, h: 2.5, name: "원장실 서재 분할 양면 책장 가벽" },
      { roomIdx: 5, type: "wire-mesh", x1: 3.2, z1: 0.0, x2: 3.2, z2: 3.2, h: 2.8, name: "소각로 고열 방호 철망 파티션" }
    ];
    const DEFAULT_ROOM_PARTITIONS = JSON.parse(JSON.stringify(ROOM_PARTITIONS));

    // -------------------------------------------------------------
    // 4. 30 INTERACTIVE PUZZLE OBJECTS (Wall-Snapped & Smart-Oriented)
    // -------------------------------------------------------------
    let studioObjects = [
      // ==================== 제1방: 1F 원무과 접수처 (Q01 ~ Q05) ====================
      {
        qNum: 1, id: "prop-r1-01", roomIdx: 0, type: "desk", name: "원무과 접수 데스크",
        x: 1.5, z: 0.85, w: 1.4, d: 0.75, color: "#3b82f6", rotY: 0,
        clueId: "clue-01", carrierType: "Text",
        cluePayload: "1994년 4월 당직표: [월요일: 14일 김원장] [목요일: 17일 박과장] [일요일: ??일 최간호사] — 메모: '김원장 당직일(2자리)과 최간호사 당직일(2자리)을 이어 적어라. (검산: 북쪽 벽에 멈춘 시계의 24시간제 시각과 일치한다)'",
        probId: "prob-01", probRule: "월=14일, 목=17일이면 일요일은 20일 ➔ 김원장(14) + 최간호사(20) = 1420",
        gateId: "gate-01", interfaceType: "MechanicalLock", passcode: "1420",
        unlocksId: "cont-01", unlocksName: "접수대 하단 서랍 (Q02 단서 해금)", isBossDoor: false, solved: false,
        onUnlockEffects: [{ kind: "lightOn", targetId: "light-r1-q02", sfx: "spark" }]
      },
      {
        qNum: 2, id: "prop-r1-02", roomIdx: 0, type: "cabinet", name: "차트 분류 캐비닛",
        x: 4.5, z: 0.45, w: 0.9, d: 0.5, color: "#0284c7", rotY: 0,
        clueId: "clue-02", carrierType: "Text",
        cluePayload: "병동 분류 코드표: [A동=1, B동=2, C동=3, D동=4] / 특별 격리 환자 '실험체-0'의 비밀 이송 경로: D동 ➔ A동 ➔ C동 ➔ B동",
        probId: "prob-02", probRule: "알파벳 병동 코드를 숫자로 치환: D(4) - A(1) - C(3) - B(2) = 4132",
        gateId: "gate-02", interfaceType: "ElectronicKeypad", passcode: "4132",
        unlocksId: "cont-02", unlocksName: "차트 철제 캐비닛 (Q03 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 3, id: "prop-r1-03", roomIdx: 0, type: "locker", name: "간호사 철제 사물함",
        x: 0.45, z: 3.8, w: 0.8, d: 0.6, color: "#6366f1", rotY: 1.5708,
        clueId: "clue-03", carrierType: "PhysicalState",
        cluePayload: "순찰 일지 화살표 기록: '로비 북쪽(U) 창문을 점검한 뒤, 동쪽(R) 복도를 지나, 남쪽(D) 계단에서 서쪽(L) 사물함으로 이동함.'",
        probId: "prob-03", probRule: "방위를 방향키 약어(U/D/L/R)로 변환: 북(U) ➔ 동(R) ➔ 남(D) ➔ 서(L) = URDL",
        gateId: "gate-03", interfaceType: "DirectionalLock", passcode: "URDL",
        unlocksId: "cont-03", unlocksName: "간호사 사물함 (Q04 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 4, id: "prop-r1-04", roomIdx: 0, type: "console", name: "비상 내선 다이얼전화",
        x: 4.5, z: 4.55, w: 0.7, d: 0.5, color: "#f59e0b", rotY: 3.1416,
        clueId: "clue-04", carrierType: "Text",
        cluePayload: "내선 번호 안내판: [원무과: 100] [약제실: 250] [취조진료실: 원무과 + 약제실 + 보정치 54]. 맨 앞에 지역코드 0을 붙여 4자리를 다이얼하라.",
        probId: "prob-04", probRule: "100 + 250 + 54 = 404 ➔ 앞자리 0을 붙이면 0404",
        gateId: "gate-04", interfaceType: "MechanicalLock", passcode: "0404",
        unlocksId: "cont-04", unlocksName: "전화기 비밀 단자함 (Q05 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 5, id: "prop-r1-05", roomIdx: 0, type: "door", name: "진료실 철제 미닫이문",
        x: 6.0, z: 2.5, w: 0.3, d: 1.24, color: "#ef4444", rotY: 0,
        clueId: "clue-05", carrierType: "Text",
        cluePayload: "진료실 도어락 마스터 코드: '병원 폐쇄 연도(1994)에서 진료실 내선번호(0404)를 뺀 4자리 숫자를 입력하라.'",
        probId: "prob-05", probRule: "1994 - 404 = 1590 (해금 시 제2방 진료실 진입 통로 개방!)",
        gateId: "gate-05", interfaceType: "ElectronicKeypad", passcode: "1590",
        unlocksId: "door-r1-r2", unlocksName: "🚪 제2방(1F 정신과 진료실) 철문 개방!", isBossDoor: true, nextRoomIdx: 1, solved: false
      },

      // ==================== 제2방: 1F 정신과 취조·진료실 (Q06 ~ Q10) ====================
      {
        qNum: 6, id: "prop-r2-06", roomIdx: 1, type: "clue", name: "피 묻은 괘종시계",
        x: 0.45, z: 1.2, w: 0.6, d: 0.55, color: "#38bdf8", rotY: 1.5708,
        clueId: "clue-06", carrierType: "PhysicalState",
        cluePayload: "괘종시계가 정확히 [3시 정각]에 멈춰 있다. 혈서 메모: '시침과 분침이 이루는 각도(3자리, 예: 045) 뒤에 시침이 가리키는 숫자를 이어 붙여라.'",
        probId: "prob-06", probRule: "3시 정각 직각(090도) + 시침 숫자(3) = 0903",
        gateId: "gate-06", interfaceType: "MechanicalLock", passcode: "0903",
        unlocksId: "cont-05", unlocksName: "시계 추 은닉함 (Q07 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 7, id: "prop-r2-07", roomIdx: 1, type: "desk", name: "로르샤흐 심리검사 책상",
        x: 4.2, z: 0.85, w: 1.4, d: 0.8, color: "#3b82f6", rotY: 0,
        clueId: "clue-07", carrierType: "Trace",
        cluePayload: "로르샤흐 데칼코마니 대칭 카드: 좌측 잉크 반점에 적힌 숫자가 [1 - 8 - 3 - 2]일 때, 거울 대칭이 의미하는 역순(오른쪽➔왼쪽)으로 숫자를 배열하라.",
        probId: "prob-07", probRule: "[1, 8, 3, 2]의 거울 대칭 역순 배열 = 2381",
        gateId: "gate-07", interfaceType: "MechanicalLock", passcode: "2381",
        unlocksId: "cont-06", unlocksName: "진료 책상 비밀 서랍 (Q08 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 8, id: "prop-r2-08", roomIdx: 1, type: "console", name: "최면 릴 테이프 녹음기",
        x: 5.6, z: 0.45, w: 0.7, d: 0.6, color: "#a855f7", rotY: 0,
        clueId: "clue-08", carrierType: "AudioVisual",
        cluePayload: "상담 녹음 테이프 라벨: '피험자 7번은 매시간 15분마다(시간당 4회) 하루 24시간 동안 비명을 질렀다.' 총 비명 횟수(2자리) 뒤에 피험자 번호를 두 번(77) 적어라.",
        probId: "prob-08", probRule: "시간당 4회 × 24시간 = 96회 ➔ 뒤에 77을 붙이면 9677",
        gateId: "gate-08", interfaceType: "ElectronicKeypad", passcode: "9677",
        unlocksId: "cont-07", unlocksName: "릴 테이프 수납함 (Q09 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 9, id: "prop-r2-09", roomIdx: 1, type: "cabinet", name: "향정신성 약품 진열장",
        x: 1.8, z: 4.55, w: 0.9, d: 0.6, color: "#14b8a6", rotY: 3.1416,
        clueId: "clue-09", carrierType: "Text",
        cluePayload: "약병 선반 라벨의 첫 알파벳 대문자를 순서대로 조합하라: [Morphine] - [Atropine] - [Diazepam] - [Ketamine]",
        probId: "prob-09", probRule: "각 약품의 첫 글자 두문자어: M - A - D - K = MADK",
        gateId: "gate-09", interfaceType: "MechanicalLock", passcode: "MADK",
        unlocksId: "cont-08", unlocksName: "향정신성 약품 금고 (Q10 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 10, id: "prop-r2-10", roomIdx: 1, type: "door", name: "바닥 지하 격리실 해치",
        x: 5.2, z: 3.8, w: 0.9, d: 0.9, color: "#ef4444", rotY: 0,
        clueId: "clue-10", carrierType: "Text",
        cluePayload: "지하 격리동 해치 개폐기: '진료실의 4개 투약 주사기 용량(10ml, 20ml, 30ml, 40ml)을 모두 곱한 값의 앞 4자리 숫자를 입력하라.'",
        probId: "prob-10", probRule: "240,000의 앞 4자리 = 2400 (해금 시 제3방 지하 격리병동 해치 개방!)",
        gateId: "gate-10", interfaceType: "ElectronicKeypad", passcode: "2400",
        unlocksId: "door-r2-r3", unlocksName: "🚪 제3방(B1 지하 중증 격리병동) 해치 개방!", isBossDoor: true, nextRoomIdx: 2, solved: false
      },

      // ==================== 제3방: B1 지하 중증 격리 병동 (Q11 ~ Q15) ====================
      {
        qNum: 11, id: "prop-r3-11", roomIdx: 2, type: "desk", name: "구속복 철제 침대",
        x: 4.8, z: 4.1, w: 1.1, d: 2.1, color: "#e11d48", rotY: 0,
        clueId: "clue-11", carrierType: "PhysicalState",
        cluePayload: "구속복에 묶인 마네킹의 가죽 벨트 버클 4개에 적힌 로마 숫자 각인: [IV] - [IX] - [II] - [VI]",
        probId: "prob-11", probRule: "로마 숫자를 아라비아 숫자로 변환: IV(4) - IX(9) - II(2) - VI(6) = 4926",
        gateId: "gate-11", interfaceType: "MechanicalLock", passcode: "4926",
        unlocksId: "cont-09", unlocksName: "구속 침대 하단 철제함 (Q12 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 12, id: "prop-r3-12", roomIdx: 2, type: "clue", name: "혈흔 각인 콘크리트 벽",
        x: 4.8, z: 0.35, w: 1.2, d: 0.4, color: "#f43f5e", rotY: 0,
        clueId: "clue-12", carrierType: "Trace",
        cluePayload: "벽면에 손톱 피로 그어진 바른 정(正)자 획수: 1열 [正正], 2열 [正一], 3열 [正正丅]. 세 열의 획수를 순서대로 이어 적은 수의 앞 4자리는?",
        probId: "prob-12", probRule: "10, 6, 12를 나열한 10612의 앞 4자리 = 1061",
        gateId: "gate-12", interfaceType: "MechanicalLock", passcode: "1061",
        unlocksId: "cont-10", unlocksName: "벽면 비밀 벽돌함 (Q13 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 13, id: "prop-r3-13", roomIdx: 2, type: "cabinet", name: "치사량 투약 트레이",
        x: 2.2, z: 0.45, w: 0.8, d: 0.5, color: "#3b82f6", rotY: 0,
        clueId: "clue-13", carrierType: "Text",
        cluePayload: "투약 일지 등차수열: '1차 125mg ➔ 2차 250mg ➔ 3차 375mg ➔ 4차 ???mg'. 4차 투여량(3자리) 앞에 0을 붙여 4자리로 입력하라.",
        probId: "prob-13", probRule: "공차 125mg 등차수열: 375 + 125 = 500mg ➔ 0500",
        gateId: "gate-13", interfaceType: "ElectronicKeypad", passcode: "0500",
        unlocksId: "cont-11", unlocksName: "투약 트레이 잠금함 (Q14 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 14, id: "prop-r3-14", roomIdx: 2, type: "console", name: "구형 심전도(ECG) 모니터",
        x: 2.2, z: 4.55, w: 0.8, d: 0.6, color: "#10b981", rotY: 3.1416,
        clueId: "clue-14", carrierType: "AudioVisual",
        cluePayload: "심전도 오실로스코프 피크 파형 궤적: 기준선에서 위로 급상승(U) ➔ 아래로 급하강(D) ➔ 다시 위로 상승(U) ➔ 우측 수평 정지(R).",
        probId: "prob-14", probRule: "파형 방향 벡터 조합: 상승(U) - 하강(D) - 상승(U) - 우측(R) = UDUR",
        gateId: "gate-14", interfaceType: "DirectionalLock", passcode: "UDUR",
        unlocksId: "cont-12", unlocksName: "심전도 모니터 배터리함 (Q15 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 15, id: "prop-r3-15", roomIdx: 2, type: "ladder", name: "수직 환기 갱도 사다리",
        x: 6.4, z: 0.9, w: 0.8, d: 0.8, color: "#64748b", rotY: -1.5708,
        clueId: "clue-15", carrierType: "Text",
        cluePayload: "2층 영안실 직통 사다리 윈치: '인체 정상 체온(36.5℃)의 숫자 뒤에 심장 박동 정지 코드(0)를 소수점 없이 조합한 4자리를 입력하라.'",
        probId: "prob-15", probRule: "36.5 + 0 = 3650 (해금 시 2층 영안실 바닥 구멍으로 사다리 연결!)",
        gateId: "gate-15", interfaceType: "ElectronicKeypad", passcode: "3650",
        unlocksId: "door-r3-r4", unlocksName: "🪜 제4방(2F 해부·영안실) 수직 사다리 해금!", isBossDoor: true, nextRoomIdx: 3, solved: false
      },

      // ==================== 제4방: 2F 해부·영안실 (Q16 ~ Q20) ====================
      {
        qNum: 16, id: "prop-r4-16", roomIdx: 3, type: "cabinet", name: "스테인리스 시신 냉동고",
        x: 5.2, z: 0.5, w: 1.6, d: 0.7, color: "#06b6d4", rotY: 0,
        clueId: "clue-16", carrierType: "PhysicalState",
        cluePayload: "3×3 시신 안치실 격자 배열도: 좌상단부터 우하단으로 이어지는 대각선 칸 번호 3개(1번 ➔ 5번 ➔ 9번) 뒤에 영안실 층수(2)를 붙여라.",
        probId: "prob-16", probRule: "대각선 번호(1, 5, 9) + 2층(2) = 1592",
        gateId: "gate-16", interfaceType: "MechanicalLock", passcode: "1592",
        unlocksId: "cont-13", unlocksName: "5번 시신 냉동고 트레이 (Q17 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 17, id: "prop-r4-17", roomIdx: 3, type: "desk", name: "스테인리스 부검 집도대",
        x: 2.1, z: 2.2, w: 1.3, d: 2.2, color: "#0ea5e9", rotY: 0,
        clueId: "clue-17", carrierType: "Text",
        cluePayload: "부검 소견서: '발견 시각 23시 40분. 시신 온도는 29.0℃로 정상 체온(37.0℃)에서 시간당 1.0℃씩 8시간 동안 냉각됨.' 사망 추정 시각(HHMM)은?",
        probId: "prob-17", probRule: "23시 40분에서 8시간 전 = 15시 40분 ➔ 1540",
        gateId: "gate-17", interfaceType: "ElectronicKeypad", passcode: "1540",
        unlocksId: "cont-14", unlocksName: "부검 메스 보관함 (Q18 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 18, id: "prop-r4-18", roomIdx: 3, type: "console", name: "흉부 X-Ray 라이트박스",
        x: 0.45, z: 4.3, w: 0.5, d: 1.0, color: "#38bdf8", rotY: 1.5708,
        clueId: "clue-18", carrierType: "AudioVisual",
        cluePayload: "투명 X-Ray 필름 2장: 필름 A에는 갈비뼈 사이에 [7, _, 4, _]가, 필름 B에는 [_, 2, _, 9]가 찍혀 있다. 두 필름을 겹쳤을 때 완성되는 4자리는?",
        probId: "prob-18", probRule: "[7, _, 4, _] + [_, 2, _, 9] 레이어 중첩 = 7249",
        gateId: "gate-18", interfaceType: "MechanicalLock", passcode: "7249",
        unlocksId: "cont-15", unlocksName: "X-Ray 필름 케이스 (Q19 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 19, id: "prop-r4-19", roomIdx: 3, type: "safe", name: "장기 표본 정밀 저울",
        x: 4.8, z: 5.0, w: 0.8, d: 0.7, color: "#f59e0b", rotY: 3.1416,
        clueId: "clue-19", carrierType: "PhysicalState",
        cluePayload: "포르말린 표본병 무게 라벨: [뇌 표본: 1400g] + [심장 표본: 350g] + [안구 표본: 30g]. 세 표본을 모두 저울에 올렸을 때의 총 중량(g) 4자리는?",
        probId: "prob-19", probRule: "1400 + 350 + 30 = 1780g",
        gateId: "gate-19", interfaceType: "SensorSwitch", passcode: "1780",
        unlocksId: "cont-16", unlocksName: "표본 진열장 하단 금고 (Q20 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 20, id: "prop-r4-20", roomIdx: 3, type: "door", name: "해부학 도감 슬라이딩 책장",
        x: 7.0, z: 2.75, w: 0.35, d: 1.24, color: "#ef4444", rotY: 0,
        clueId: "clue-20", carrierType: "Text",
        cluePayload: "비밀 책장 개폐 코드: '인간 성인의 총 뼈 개수(3자리) 뒤에 해부학 전집 총 권수(8권)를 이어 붙여 4자리 코드를 완성하라.'",
        probId: "prob-20", probRule: "성인 골격 수(206) + 도감 권수(8) = 2068 (해금 시 병원장 비밀 연구실 개방!)",
        gateId: "gate-20", interfaceType: "ElectronicKeypad", passcode: "2068",
        unlocksId: "door-r4-r5", unlocksName: "🚪 제5방(2F 병원장 비밀 연구실) 책장 개방!", isBossDoor: true, nextRoomIdx: 4, solved: false
      },

      // ==================== 제5방: 2F 병원장 비밀 임상 연구실 (Q21 ~ Q25) ====================
      {
        qNum: 21, id: "prop-r5-21", roomIdx: 4, type: "safe", name: "병원장 이중 강철 금고",
        x: 2.0, z: 0.45, w: 1.6, d: 0.6, color: "#f59e0b", rotY: 0,
        clueId: "clue-21", carrierType: "Text",
        cluePayload: "병원장 비망록: '내 금고 비밀번호는 생명 [LIFE]라는 단어를 전화기 키패드 숫자(L=5, I=4, F=3, E=3)로 치환한 4자리이다.'",
        probId: "prob-21", probRule: "L(5) - I(4) - F(3) - E(3) = 5433",
        gateId: "gate-21", interfaceType: "ElectronicKeypad", passcode: "5433",
        unlocksId: "cont-17", unlocksName: "병원장 금고 내부 (UV 손전등 & Q22 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 22, id: "prop-r5-22", roomIdx: 4, type: "clue", name: "UV 형광 병원장 초상화",
        x: 5.0, z: 0.35, w: 1.2, d: 0.3, color: "#a855f7", rotY: 0,
        clueId: "clue-22", carrierType: "Trace",
        cluePayload: "금고에서 꺼낸 UV 자외선 손전등으로 병원장 초상화의 눈동자를 비추자, 보랏빛 형광 혈흔으로 영문 4글자 [M - I - N - D]가 떠올랐다.",
        probId: "prob-22", probRule: "UV 형광 영문 코드 판독 = MIND",
        gateId: "gate-22", interfaceType: "MechanicalLock", passcode: "MIND",
        unlocksId: "cont-18", unlocksName: "초상화 후면 비밀 벽감 (Q23 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 23, id: "prop-r5-23", roomIdx: 4, type: "console", name: "혈청 원심분리기",
        x: 0.45, z: 1.0, w: 0.6, d: 0.7, color: "#ec4899", rotY: 1.5708,
        clueId: "clue-23", carrierType: "Text",
        cluePayload: "혈청 배합 실험 노트: 'A형 혈청 3방울, B형 혈청 1방울, AB형 혈청 4방울, O형 혈청 2방울을 순서대로 투입할 때의 배합비 4자리는?'",
        probId: "prob-23", probRule: "A(3) : B(1) : AB(4) : O(2) = 3142",
        gateId: "gate-23", interfaceType: "ElectronicKeypad", passcode: "3142",
        unlocksId: "cont-19", unlocksName: "혈청 냉장 보관함 (Q24 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 24, id: "prop-r5-24", roomIdx: 4, type: "desk", name: "상아 해부학 체스 테이블",
        x: 2.0, z: 5.0, w: 0.8, d: 0.6, color: "#8b5cf6", rotY: 3.1416,
        clueId: "clue-24", carrierType: "PhysicalState",
        cluePayload: "체스판 위의 흑색 나이트(Knight)가 핏자국을 남기며 이동한 4단계 화살표 기보: 위(U) ➔ 오른쪽(R) ➔ 위(U) ➔ 왼쪽(L).",
        probId: "prob-24", probRule: "나이트 이동 방향 시퀀스: U ➔ R ➔ U ➔ L = URUL",
        gateId: "gate-24", interfaceType: "DirectionalLock", passcode: "URUL",
        unlocksId: "cont-20", unlocksName: "체스판 하단 비밀 공간 (Q25 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 25, id: "prop-r5-25", roomIdx: 4, type: "door", name: "지하 소각로 화물 승강기",
        x: 5.8, z: 4.2, w: 1.2, d: 1.2, color: "#ef4444", rotY: 0,
        clueId: "clue-25", carrierType: "Text",
        cluePayload: "승강기 전력 복구반: '1층 전압(220V)과 2층 전압(380V)을 더한 뒤 10으로 나눈 값(2자리) 앞에 0을, 맨 뒤에 지하 2층을 뜻하는 숫자(2)를 붙여 4자리를 입력하라.'",
        probId: "prob-25", probRule: "(220 + 380) / 10 = 60 ➔ 앞 0 + 60 + 뒤 2 = 0602 (해금 시 제6방 지하 소각로 리프트 가동!)",
        gateId: "gate-25", interfaceType: "ElectronicKeypad", passcode: "0602",
        unlocksId: "door-r5-r6", unlocksName: "🚪 제6방(B2 지하 소각로) 화물 리프트 개방!", isBossDoor: true, nextRoomIdx: 5, solved: false
      },

      // ==================== 제6방: B2 지하 소각로 & 최종 비상구 (Q26 ~ Q30) ====================
      {
        qNum: 26, id: "prop-r6-26", roomIdx: 5, type: "console", name: "소각로 고압 증기 밸브",
        x: 5.2, z: 0.9, w: 2.2, d: 1.4, color: "#f97316", rotY: 0,
        clueId: "clue-26", carrierType: "PhysicalState",
        cluePayload: "보일러 과열 경고판: '현재 증기 압력 1250 PSI에서 위험 초과분 450 PSI를 감압한 안전 목표 압력을 4자리(앞자리 0 포함)로 입력하라.'",
        probId: "prob-26", probRule: "1250 - 450 = 800 PSI ➔ 4자리 표기 0800",
        gateId: "gate-26", interfaceType: "ElectronicKeypad", passcode: "0800",
        unlocksId: "cont-21", unlocksName: "증기 밸브 제어함 (Q27 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 27, id: "prop-r6-27", roomIdx: 5, type: "locker", name: "냉각수 파이프 매니폴드",
        x: 0.45, z: 2.8, w: 0.6, d: 0.6, color: "#0284c7", rotY: 1.5708,
        clueId: "clue-27", carrierType: "PhysicalState",
        cluePayload: "배관 우회 도면: 냉각수가 흘러가는 밸브 개방 화살표가 [아래(D) ➔ 오른쪽(R) ➔ 아래(D) ➔ 왼쪽(L)] 순서로 각인되어 있다.",
        probId: "prob-27", probRule: "냉각수 유체 방향 벡터: D - R - D - L = DRDL",
        gateId: "gate-27", interfaceType: "DirectionalLock", passcode: "DRDL",
        unlocksId: "cont-22", unlocksName: "냉각수 보조 탱크함 (Q28 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 28, id: "prop-r6-28", roomIdx: 5, type: "desk", name: "마스터키 보안 터미널",
        x: 2.2, z: 4.95, w: 1.2, d: 0.8, color: "#3b82f6", rotY: 3.1416,
        clueId: "clue-28", carrierType: "Trace",
        cluePayload: "반으로 쪼개진 마스터 보안 카드 두 조각: 좌측 카드 파편에는 [89], 우측 카드 파편에는 [12]가 적혀 있다. 결합한 4자리 코드는?",
        probId: "prob-28", probRule: "좌측 파편(89) + 우측 파편(12) = 8912",
        gateId: "gate-28", interfaceType: "ElectronicKeypad", passcode: "8912",
        unlocksId: "cont-23", unlocksName: "보안 터미널 코어함 (Q29 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 29, id: "prop-r6-29", roomIdx: 5, type: "safe", name: "디젤 비상 발전기",
        x: 6.0, z: 4.95, w: 1.0, d: 0.6, color: "#eab308", rotY: 3.1416,
        clueId: "clue-29", carrierType: "Text",
        cluePayload: "비상 발전기 매뉴얼: '4기통 디젤 실린더의 점화 플러그 폭발 순서 [1번 ➔ 3번 ➔ 4번 ➔ 2번] 순서대로 이그니션 코드를 입력하라.'",
        probId: "prob-29", probRule: "실린더 점화 순서: 1 - 3 - 4 - 2 = 1342",
        gateId: "gate-29", interfaceType: "MechanicalLock", passcode: "1342",
        unlocksId: "cont-24", unlocksName: "발전기 마스터 릴레이함 (최종 Q30 단서 해금)", isBossDoor: false, solved: false
      },
      {
        qNum: 30, id: "prop-r6-30", roomIdx: 5, type: "door", name: "최종 지상 방폭 비상탈출문",
        x: 8.0, z: 2.75, w: 0.35, d: 1.4, color: "#10b981", rotY: 0,
        clueId: "clue-30", carrierType: "AudioVisual",
        cluePayload: "최종 방폭문 EM-Lock 패널: '폐쇄병동 호실 번호(3자리) 뒤에 최종 탈출 승인 코드(0)를 이어 붙여 4자리를 입력하라.'",
        probId: "prob-30", probRule: "병동 호실(404) + 탈출 승인(0) = 4040 (해금 시 6방 30문제 최종 클리어!)",
        gateId: "gate-30", interfaceType: "ElectronicKeypad", passcode: "4040",
        unlocksId: "door-final-exit", unlocksName: "🏆 지상 방폭 비상문 개방 & 전체 테마 완전 탈출!", isBossDoor: true, nextRoomIdx: -1, solved: false
      }
    ];

    let currentRoomIdx = 0; // 0(R1) ~ 5(R6)
    let selectedObjectId = "prop-r1-01";
    let failureCount = 0;
    let timerElapsedSeconds = 0;
    let timeLimitSeconds = 60 * 60;
    let activeThemeId = "asylum-404";
    let activeThemeTitle = "폐쇄병동 404호: 심연의 해부학 (6방 30문제 풀 스케일)";
    let activeThemeGenre = "Horror"; // 'Horror' | 'Mystery' | 'Adventure'

    const DEFAULT_ROOM_CONFIGS = JSON.parse(JSON.stringify(ROOM_CONFIGS));
    const DEFAULT_PASSAGES = [
      { id: "pass-r1-r2", fromSpaceId: "space-r1", toSpaceId: "space-r2", directionality: "TwoWay", traverseCost: "Walk", door: { id: "door-r1-r2", type: "StandardDoor", isLocked: true } },
      { id: "pass-r2-r3", fromSpaceId: "space-r2", toSpaceId: "space-r3", directionality: "OneWay", traverseCost: "Climb", door: { id: "door-r2-r3", type: "FloorHatch", isLocked: true } },
      { id: "pass-r3-r4", fromSpaceId: "space-r3", toSpaceId: "space-r4", directionality: "OneWay", traverseCost: "Climb", door: { id: "door-r3-r4", type: "FloorHatch", isLocked: true } },
      { id: "pass-r4-r5", fromSpaceId: "space-r4", toSpaceId: "space-r5", directionality: "TwoWay", traverseCost: "Walk", door: { id: "door-r4-r5", type: "SecretBookcase", isLocked: true } },
      { id: "pass-r5-r6", fromSpaceId: "space-r5", toSpaceId: "space-r6", directionality: "OneWay", traverseCost: "Slide", door: { id: "door-r5-r6", type: "EMLockDoor", isLocked: true } },
      { id: "pass-r6-exit", fromSpaceId: "space-r6", toSpaceId: "space-exterior", directionality: "OneWay", traverseCost: "Walk", door: { id: "door-final-exit", type: "EMLockDoor", isLocked: true } }
    ];
    let studioPassages = JSON.parse(JSON.stringify(DEFAULT_PASSAGES));

    const DEFAULT_DIRECTOR_PERSONA = {
      name: "404호 야간 당직 간호사",
      role: "폐쇄병동 인터폰 안내자",
      tone: "차갑고 의미심장한 속삭임",
      barterPrompt: "힌트가 필요하신가요? 그냥은 재미없죠. 3초 안에 인터폰 버튼을 5번 두드려 보이시면 힌트를 드릴게요."
    };
    let directorPersona = { ...DEFAULT_DIRECTOR_PERSONA };

    // Build synchronized RaC JSON structure (Full RaC v2 Contract)
    function buildRacJsonSnapshot() {
      return {
        version: "1.0",
        theme: {
          id: activeThemeId === "asylum-404" ? "asylum-404-abyssal-anatomy" : activeThemeId,
          title: activeThemeTitle,
          genre: activeThemeGenre,
          durationMinutes: Math.max(1, Math.round(timeLimitSeconds / 60))
        },
        spaces: ROOM_CONFIGS.map(rc => {
          const roomObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
          const roomPropsOnto = PROP_ONTOLOGY.filter(p => p.roomIdx === rc.idx);

          // 1. Interactive Furniture & Puzzle Objects
          const mappedObjs = roomObjs.map(o => {
            const attachedProp = roomPropsOnto.find(p => p.targetObjId === o.id);
            const propItem = {
              id: o.id,
              qNum: o.qNum,
              name: o.name,
              model: o.type,
              type: o.type,
              targetClueId: o.clueId,
              wallSnapped: !!o.wallSnapped,
              transform: { pos: [o.x, rc.floorHeight + 0.5, o.z], rot: [0, o.rotY || 0, 0] }
            };
            if (attachedProp) propItem.gimmick = attachedProp.gimmick;
            if (o.modelPreset) propItem.modelPreset = o.modelPreset;
            if (o.modelUrl) propItem.modelUrl = o.modelUrl;
            if (o.material) propItem.material = o.material;
            return propItem;
          });

          // 2. Extra Atmospheric & Gimmick Props (Clocks, Portraits, Wall-decal, Cups)
          const extraProps = roomPropsOnto.filter(p => !roomObjs.some(o => o.id === p.id)).map(p => ({
            id: p.id,
            name: p.name,
            model: p.type,
            type: p.type,
            targetObjId: p.targetObjId || p.targetParentId,
            wallSnapped: !!p.wallSnapped,
            wallSide: p.wallSide,
            gimmick: p.gimmick,
            transform: { pos: [p.x || 1.0, (rc.floorHeight || 0) + (p.y || 1.5), p.z || 1.0], rot: [0, 0, 0] }
          }));

          const sp = {
            id: rc.id,
            name: rc.fullName,
            layer: rc.idx,
            floorHeight: rc.floorHeight,
            wallHeight: rc.wallHeight,
            polygon: [[0, 0], [rc.w, 0], [rc.w, rc.h], [0, rc.h]],
            materials: {
              wall: (rc.materials && rc.materials.wall) || "plaster",
              floor: (rc.materials && rc.materials.floor) || "tile",
              wallTint: "#" + (rc.wallColor || 0x475569).toString(16).padStart(6, "0")
            },
            lights: Array.isArray(rc.lights) ? rc.lights : [],
            props: [...mappedObjs, ...extraProps]
          };
          if (rc.hasHole) sp.floorHole = { pos: rc.holePos, size: rc.holeSize };
          return sp;
        }),
        passages: studioPassages.map(p => {
          const gateObj = p.door ? studioObjects.find(o => o.unlocksId === p.door.id) : null;
          return {
            id: p.id,
            fromSpaceId: p.fromSpaceId,
            toSpaceId: p.toSpaceId,
            directionality: p.directionality || "TwoWay",
            traverseCost: p.traverseCost || "Walk",
            door: {
              id: p.door ? p.door.id : `door-${p.id}`,
              type: (p.door && p.door.type) || "StandardDoor",
              isLocked: gateObj ? !gateObj.solved : (p.door ? p.door.isLocked !== false : true)
            }
          };
        }),
        logicGraph: {
          totalPuzzles: studioObjects.length,
          solvedPuzzles: studioObjects.filter(o => o.solved).length,
          clues: studioObjects.map(o => {
            const c = {
              id: o.clueId,
              propRef: o.id,
              carrierType: o.carrierType || "Text",
              payload: o.cluePayload
            };
            if (o.visualSpec) c.visualSpec = o.visualSpec;
            return c;
          }),
          problems: studioObjects.map(o => ({
            id: o.probId,
            consumes: [o.clueId],
            rule: o.probRule,
            outputGate: o.gateId
          })),
          gates: studioObjects.map(o => {
            const g = {
              qNum: o.qNum,
              id: o.gateId,
              interfaceType: o.interfaceType,
              condition: `Value == '${o.passcode}'`,
              unlocks: o.unlocksId,
              isOpen: o.solved
            };
            if (o.mechanism) g.mechanism = o.mechanism;
            if (o.requiresSolvedId !== undefined && o.requiresSolvedId !== null) g.requiresSolvedId = o.requiresSolvedId;
            if (o.storyBeat) g.storyBeat = o.storyBeat;
            if (o.requiredItemId) g.requiredItemId = o.requiredItemId;
            if (Array.isArray(o.onUnlockEffects) && o.onUnlockEffects.length > 0) g.onUnlockEffects = o.onUnlockEffects;
            return g;
          }),
          containers: studioObjects.filter(o => o.unlocksId && o.unlocksId.startsWith("cont-")).map(o => {
            const rewardItem = Object.values(ITEM_CATALOG).find(it => it.rewardOnQNum === o.qNum);
            const cont = {
              id: o.unlocksId,
              name: o.unlocksName,
              isOpen: o.solved,
              containsClueId: `clue-${String(o.qNum + 1).padStart(2, '0')}`
            };
            if (rewardItem) cont.containsItemId = rewardItem.id;
            return cont;
          }),
          items: Object.values(ITEM_CATALOG).map(it => ({
            id: it.id,
            name: it.name,
            consumable: !!it.consumable,
            ...(it.rewardOnQNum ? { rewardOnQNum: it.rewardOnQNum } : {})
          })),
          interactions: ITEM_INTERACTIONS.map(ix => {
            const targetObj = ix.targetQNum ? studioObjects.find(o => o.qNum === ix.targetQNum) : null;
            const out = {
              id: ix.id,
              itemId: ix.itemId,
              targetId: ix.targetItemId || (targetObj ? targetObj.gateId : `gate-${String(ix.targetQNum || 1).padStart(2, '0')}`),
              effect: ix.effect,
              message: ix.message || ""
            };
            if (ix.targetQNum) out.targetQNum = ix.targetQNum;
            if (ix.targetItemId) out.targetItemId = ix.targetItemId;
            if (ix.resultId) out.resultId = ix.resultId;
            return out;
          })
        },
        director: {
          timeLimitMinutes: 60,
          tensionLevel: Math.min(5, 1 + Math.floor(failureCount / 2)),
          panicThresholdFailures: 2,
          persona: { ...directorPersona }
        }
      };
    }

    // -------------------------------------------------------------
    // 2. SIDEBAR COLLAPSE & AUDIO SYNTHESIZER
    // -------------------------------------------------------------
    let isLeftCollapsed = false;
    let isRightCollapsed = false;

    function toggleLeftSidebar() {
      isLeftCollapsed = !isLeftCollapsed;
      const bar = document.getElementById('sidebar-left');
      const icon = document.getElementById('icon-toggle-left');
      if (isLeftCollapsed) {
        bar.style.width = '0px'; bar.style.margin = '0px'; bar.style.padding = '0px'; bar.style.border = 'none'; bar.style.overflow = 'hidden';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>';
      } else {
        bar.style.width = ''; bar.style.margin = ''; bar.style.padding = ''; bar.style.border = ''; bar.style.overflow = '';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>';
      }
      setTimeout(onResizeThree, 220);
      playSfx('click');
    }

    function toggleRightSidebar() {
      isRightCollapsed = !isRightCollapsed;
      const bar = document.getElementById('sidebar-right');
      const icon = document.getElementById('icon-toggle-right');
      if (isRightCollapsed) {
        bar.style.width = '0px'; bar.style.margin = '0px'; bar.style.padding = '0px'; bar.style.border = 'none'; bar.style.overflow = 'hidden';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>';
      } else {
        bar.style.width = ''; bar.style.margin = ''; bar.style.padding = ''; bar.style.border = ''; bar.style.overflow = '';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>';
      }
      setTimeout(onResizeThree, 220);
      playSfx('click');
    }

    function autoAdjustSidebars() {
      if (window.innerWidth < 1100 && !isLeftCollapsed) toggleLeftSidebar();
      if (window.innerWidth < 900 && !isRightCollapsed) toggleRightSidebar();
    }

// (Web Audio synthesizer extracted to src/audio.js)

    // 60-Minute Director Timer
    setInterval(() => {
      timerElapsedSeconds++;
      const remain = Math.max(0, timeLimitSeconds - timerElapsedSeconds);
      const m = Math.floor(remain / 60);
      const s = remain % 60;
      document.getElementById('director-timer-hud').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);

    // -------------------------------------------------------------
    // 3. 6-ROOMS SWITCHER & PROGRESS RENDERING
    // -------------------------------------------------------------
    function renderRoomSidebarAndProgress() {
      const totalSolved = studioObjects.filter(o => o.solved).length;
      const totalCount = studioObjects.length;
      document.getElementById('hud-puzzle-progress').textContent = `${totalSolved} / ${totalCount}`;
      document.getElementById('insp-total-prog').textContent = `${totalSolved} / ${totalCount} 완료`;

      // Render 6 Rooms List in Left Sidebar
      const roomListEl = document.getElementById('room-switcher-list');
      roomListEl.innerHTML = '';

      ROOM_CONFIGS.forEach(rc => {
        const roomObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
        const solvedInRoom = roomObjs.filter(o => o.solved).length;
        const isCurrent = rc.idx === currentRoomIdx;
        const isCleared = solvedInRoom === roomObjs.length && roomObjs.length > 0;

        const btn = document.createElement('button');
        btn.onclick = () => switchRoom(rc.idx);
        btn.className = `w-full h-8 text-left px-2 rounded-md text-xs flex items-center justify-between transition-colors border ${
          isCurrent
            ? 'bg-zinc-800/90 text-zinc-100 font-medium border-white/15'
            : isCleared
              ? 'bg-transparent text-zinc-300 border-transparent hover:bg-zinc-900'
              : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-900 hover:text-zinc-200'
        }`;

        const statusDot = isCleared
          ? 'bg-emerald-400'
          : isCurrent
            ? 'bg-zinc-100'
            : 'bg-zinc-600';

        btn.innerHTML = `
          <span class="truncate flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}"></span>
            <span class="truncate">${rc.shortName}</span>
          </span>
          <span class="text-[11px] font-mono tabular-nums shrink-0 ${
            isCleared ? 'text-emerald-400' : isCurrent ? 'text-zinc-300' : 'text-zinc-600'
          }">${solvedInRoom}/${roomObjs.length}</span>
        `;
        roomListEl.appendChild(btn);
      });

      // Render Current Room's Puzzles in Left Sidebar
      const curRoomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);
      const curRoomSolved = curRoomObjs.filter(o => o.solved).length;
      document.getElementById('insp-room-prog').textContent = `${curRoomSolved} / ${curRoomObjs.length} 완료`;
      const qNums = curRoomObjs.map(o => o.qNum).filter(n => typeof n === 'number' && !Number.isNaN(n));
      const qRangeEl = document.getElementById('left-room-q-range');
      if (qRangeEl) {
        if (qNums.length > 0) {
          const qStart = Math.min(...qNums);
          const qEnd = Math.max(...qNums);
          qRangeEl.textContent = qStart === qEnd
            ? `Q${String(qStart).padStart(2, '0')}`
            : `Q${String(qStart).padStart(2, '0')}~Q${String(qEnd).padStart(2, '0')}`;
        } else {
          qRangeEl.textContent = '-';
        }
      }
      const solveRoomBtn = document.getElementById('btn-solve-room-all');
      if (solveRoomBtn) solveRoomBtn.textContent = `현재 방 ${curRoomObjs.length}문제 해금`;

      const puzzleListEl = document.getElementById('room-puzzle-list');
      puzzleListEl.innerHTML = '';

      curRoomObjs.forEach(obj => {
        const isSel = obj.id === selectedObjectId;
        const item = document.createElement('div');
        item.className = `h-8 px-2 rounded-md border text-xs flex items-center justify-between cursor-pointer transition-colors ${
          isSel
            ? 'bg-zinc-800/90 border-white/15 text-zinc-100'
            : obj.solved
              ? 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-900'
              : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
        }`;
        item.onclick = () => {
          selectObject(obj.id);
        };
        item.ondblclick = () => {
          selectObject(obj.id);
          openLockModalForObject(obj.id);
        };

        const qCode = obj.qNum ? `Q${String(obj.qNum).padStart(2, '0')}` : 'ADD';
        item.innerHTML = `
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[11px] font-mono w-7 shrink-0 ${
              obj.solved ? 'text-emerald-400' : isSel ? 'text-zinc-200' : 'text-zinc-500'
            }">${qCode}</span>
            <span class="truncate ${isSel ? 'font-medium text-zinc-100' : ''}">${obj.name}</span>
          </div>
          <button onclick="event.stopPropagation(); selectObject('${obj.id}'); openLockModalForObject('${obj.id}');" class="px-2 py-0.5 rounded text-[11px] font-medium shrink-0 border transition-colors ${
            obj.solved
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-zinc-900 text-zinc-300 border-white/10 hover:bg-zinc-100 hover:text-zinc-950'
          }">
            ${obj.solved ? '완료' : '열기'}
          </button>
        `;
        puzzleListEl.appendChild(item);
      });

      render30DagBoard();
    }

    // Interactive SVG Ontology DAG Graph (Pane 3)
    let ontologyGraphFilter = 0; // -1: 6개 공간 전체 흐름, 0~5: 해당 방 5문항 상세 온톨로지 DAG

    function setOntologyGraphFilter(idx) {
      ontologyGraphFilter = idx;
      render30DagBoard();
    }

    function escapeXml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function truncText(str, maxLen) {
      const s = String(str || '');
      return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
    }

    function hasCausalLink(fromObj, toObj, roomConfig) {
      if (!fromObj || !toObj || fromObj.id === toObj.id) return false;
      if (toObj.requiresSolvedId && toObj.requiresSolvedId === fromObj.id) return true;
      if (Array.isArray(fromObj.onUnlockEffects) && fromObj.onUnlockEffects.length > 0) {
        const lights = (roomConfig && Array.isArray(roomConfig.lights)) ? roomConfig.lights : [];
        return fromObj.onUnlockEffects.some(ef => {
          if (!ef || !ef.targetId) return false;
          if (ef.targetId === toObj.id) return true;
          const lt = lights.find(l => l && l.id === ef.targetId);
          return !!(lt && lt.targetPropId === toObj.id);
        });
      }
      return false;
    }

    function render30DagBoard() {
      const board = document.getElementById('dag-30-board');
      const filterBar = document.getElementById('ontology-room-filter');
      if (!board) return;

      // 1. Render Room Filter Pills
      if (filterBar) {
        let pills = `
          <button onclick="setOntologyGraphFilter(-1)" class="px-2.5 py-1 rounded-md text-xs font-medium border transition-colors shrink-0 ${
            ontologyGraphFilter === -1
              ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
              : 'bg-zinc-900 text-zinc-400 border-white/10 hover:text-zinc-200'
          }">전체 ${ROOM_CONFIGS.length}방 공간 흐름</button>
        `;
        ROOM_CONFIGS.forEach(rc => {
          const rObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
          const rSolved = rObjs.filter(o => o.solved).length;
          const active = (ontologyGraphFilter === rc.idx);
          pills += `
            <button onclick="setOntologyGraphFilter(${rc.idx})" class="px-2.5 py-1 rounded-md text-xs font-medium border transition-colors shrink-0 font-mono ${
              active
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                : 'bg-zinc-900 text-zinc-400 border-white/10 hover:text-zinc-200'
            }">${rc.shortName} (${rSolved}/${rObjs.length})</button>
          `;
        });
        filterBar.innerHTML = pills;
      }

      // 2. Render SVG Ontology Graph
      if (ontologyGraphFilter === -1) {
        // 6-Room Macro Architecture & Passage Ontology Graph (Generous 160px edge gap, zero label clipping)
        const svgW = 1000, svgH = 440;
        const boxW = 210, boxH = 124;
        const coords = [
          { x: 20,  y: 45 },  // R1 (1F)
          { x: 390, y: 45 },  // R2 (1F)
          { x: 760, y: 45 },  // R3 (B1)
          { x: 760, y: 245 }, // R4 (2F)
          { x: 390, y: 245 }, // R5 (2F)
          { x: 20,  y: 245 }  // R6 (B2)
        ];
        const edges = [
          { from: 0, to: 1, label: '1F 중앙 복도 (TwoWay)' },
          { from: 1, to: 2, label: '지하 해치 (OneWay)' },
          { from: 2, to: 3, label: '수직 사다리 (Hole)' },
          { from: 3, to: 4, label: '2F 비밀 통로 (TwoWay)' },
          { from: 4, to: 5, label: '화물 리프트 (OneWay)' }
        ];

        let svgContent = `
          <defs>
            <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
            </marker>
            <marker id="dag-arrow-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
          </defs>
        `;

        // 1) Draw Space Nodes FIRST
        ROOM_CONFIGS.forEach((rc, i) => {
          const p = coords[i] || { x: 20 + (i % 3) * 370, y: 45 + Math.floor(i / 3) * 200 };
          const rObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
          const solved = rObjs.filter(o => o.solved).length;
          const propsCount = PROP_ONTOLOGY.filter(pr => pr.roomIdx === rc.idx).length;
          const isAllSolved = rObjs.length > 0 && solved === rObjs.length;
          const borderCol = isAllSolved ? '#10b981' : (rc.idx === currentRoomIdx ? '#e4e4e7' : '#3f3f46');

          svgContent += `
            <g class="cursor-pointer" onclick="setOntologyGraphFilter(${rc.idx})">
              <rect x="${p.x}" y="${p.y}" width="${boxW}" height="${boxH}" rx="8" fill="#16161a" stroke="${borderCol}" stroke-width="1.5" />
              <text x="${p.x + 12}" y="${p.y + 22}" fill="#71717a" font-size="10" font-family="monospace">${escapeXml(rc.layerLabel)} · ${rc.w}×${rc.h}m</text>
              <text x="${p.x + 12}" y="${p.y + 42}" fill="#f4f4f5" font-size="12" font-weight="600">${escapeXml(rc.shortName)}</text>
              <text x="${p.x + 12}" y="${p.y + 62}" fill="#a1a1aa" font-size="10" font-family="monospace">Clues/Gates: ${solved} / ${rObjs.length} 해금</text>
              <text x="${p.x + 12}" y="${p.y + 80}" fill="#a1a1aa" font-size="10" font-family="monospace">물리 소품(Props): ${propsCount}종</text>
              <rect x="${p.x + 12}" y="${p.y + 92}" width="186" height="20" rx="4" fill="#09090b" stroke="#27272a" />
              <text x="${p.x + 105}" y="${p.y + 105}" text-anchor="middle" fill="#d4d4d8" font-size="10">클릭하여 상세 온톨로지 그래프 보기 →</text>
            </g>
          `;
        });

        // 2) Draw Passage Edges & Labels ON TOP (Never clipped or hidden behind space boxes)
        const activeEdges = activeThemeId === 'asylum-404'
          ? edges
          : studioPassages.map(p => ({
              from: ROOM_CONFIGS.findIndex(r => r.id === p.fromSpaceId),
              to: ROOM_CONFIGS.findIndex(r => r.id === p.toSpaceId),
              label: `${p.directionality || 'TwoWay'} (${p.traverseCost || 'Walk'})`
            })).filter(e => e.from >= 0 && e.to >= 0);

        activeEdges.forEach(e => {
          if (e.from >= ROOM_CONFIGS.length || e.to >= ROOM_CONFIGS.length) return;
          const a = coords[e.from] || { x: 20 + (e.from % 3) * 370, y: 45 + Math.floor(e.from / 3) * 200 };
          const b = coords[e.to] || { x: 20 + (e.to % 3) * 370, y: 45 + Math.floor(e.to / 3) * 200 };
          const doorObj = studioObjects.find(o => o.roomIdx === e.from && o.isBossDoor);
          const isOpen = doorObj ? !!doorObj.solved : true;
          const stroke = isOpen ? '#10b981' : '#52525b';
          const marker = isOpen ? 'url(#dag-arrow-open)' : 'url(#dag-arrow)';
          let d = '', lx = 0, ly = 0;
          if (a.y === b.y) {
            const x1 = a.x < b.x ? a.x + boxW : a.x;
            const x2 = a.x < b.x ? b.x - 6 : b.x + boxW + 6;
            d = `M ${x1} ${a.y + 68} L ${x2} ${b.y + 68}`;
            lx = (x1 + x2) / 2; ly = a.y + 46;
          } else {
            d = `M ${a.x + boxW / 2} ${a.y + boxH} L ${b.x + boxW / 2} ${b.y - 6}`;
            lx = a.x + boxW / 2; ly = (a.y + boxH + b.y) / 2;
          }
          svgContent += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="${isOpen ? '' : '4 3'}" marker-end="${marker}" />`;
          svgContent += `<rect x="${lx - 72}" y="${ly - 11}" width="144" height="22" rx="4" fill="#09090b" stroke="${stroke}" stroke-width="1" />`;
          svgContent += `<text x="${lx}" y="${ly + 3}" text-anchor="middle" fill="${isOpen ? '#34d399' : '#d4d4d8'}" font-size="9.5" font-family="monospace">${escapeXml(e.label)}</text>`;
        });

        board.innerHTML = `
          <div class="flex items-center justify-between mb-2 px-1">
            <span class="text-xs font-medium text-zinc-300">전체 ${ROOM_CONFIGS.length}방 건축·통로 온톨로지 그래프 (Space → Passage)</span>
            <span class="text-[11px] font-mono text-zinc-500">방을 클릭하면 상세 DAG로 드릴다운</span>
          </div>
          <svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-auto min-w-[760px] bg-[#09090b] rounded-md border border-white/10">
            ${svgContent}
          </svg>
        `;
        return;
      }

      // 3. Single Room Detailed Ontology DAG Graph (Prop/Clue -> Problem -> Gate -> Container/Door)
      const rc = ROOM_CONFIGS[ontologyGraphFilter] || ROOM_CONFIGS[0];
      const roomObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
      const colX = [16, 250, 484, 718];
      const nodeW = 206, nodeH = 96, rowStep = 122, startY = 46;
      const svgW = 940;
      const svgH = startY + roomObjs.length * rowStep + 14;

      let svg = `
        <defs>
          <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#52525b" />
          </marker>
          <marker id="arrow-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
          </marker>
          <marker id="arrow-chain" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
          </marker>
        </defs>
      `;

      // Column Headers
      const headers = [
        { x: colX[0], title: '1. Prop / Clue (물리 단서)', color: '#38bdf8' },
        { x: colX[1], title: '2. Problem (추론 규칙)', color: '#818cf8' },
        { x: colX[2], title: '3. Gate (자물쇠 제약)', color: '#fbbf24' },
        { x: colX[3], title: '4. Unlocks (은닉함 · 문)', color: '#34d399' }
      ];
      headers.forEach(h => {
        svg += `<text x="${h.x}" y="22" fill="${h.color}" font-size="11" font-weight="600" font-family="monospace">${h.title}</text>`;
        svg += `<line x1="${h.x}" y1="30" x2="${h.x + nodeW}" y2="30" stroke="#27272a" stroke-width="1" />`;
      });

      roomObjs.forEach((obj, idx) => {
        const y = startY + idx * rowStep;
        const midY = y + nodeH / 2;
        const qCode = obj.qNum ? `Q${String(obj.qNum).padStart(2, '0')}` : 'NEW';
        const linkedProp = PROP_ONTOLOGY.find(p => p.targetObjId === obj.id);
        const solved = !!obj.solved;
        const edgeStroke = solved ? '#10b981' : '#52525b';
        const edgeMarker = solved ? 'url(#arrow-open)' : 'url(#arrow-muted)';

        // Horizontal Ontology Edges (Clue -> Problem -> Gate -> Unlocks)
        for (let c = 0; c < 3; c++) {
          const x1 = colX[c] + nodeW;
          const x2 = colX[c + 1] - 4;
          svg += `<line x1="${x1}" y1="${midY}" x2="${x2}" y2="${midY}" stroke="${edgeStroke}" stroke-width="1.5" marker-end="${edgeMarker}" />`;
        }

        // Causal Chain Edge to Next Puzzle (only when actual requiresSolvedId or onUnlockEffects link exists)
        if (idx < roomObjs.length - 1 && hasCausalLink(obj, roomObjs[idx + 1], rc)) {
          const nextY = startY + (idx + 1) * rowStep;
          const sx = colX[3] + nodeW / 2;
          const sy = y + nodeH;
          const ex = colX[0] + nodeW / 2;
          const ey = nextY - 4;
          const midBridgeY = sy + 13;
          svg += `<path class="dag-causal-chain" d="M ${sx} ${sy} L ${sx} ${midBridgeY} L ${ex} ${midBridgeY} L ${ex} ${ey}" fill="none" stroke="${solved ? '#10b981' : '#f59e0b'}" stroke-width="1.25" stroke-dasharray="4 3" opacity="0.7" marker-end="${solved ? 'url(#arrow-open)' : 'url(#arrow-chain)'}" />`;
        }

        const clickAction = `selectObjectFromOntologyGraph(${rc.idx}, '${obj.id}');`;
        const dblClickAction = `switchRoom(${rc.idx}); selectObject('${obj.id}'); setViewLayout('split'); openLockModalForObject('${obj.id}');`;
        const isBoss = !!obj.isBossDoor;
        const isSelNode = (obj.id === selectedObjectId);
        const prereqObj = obj.requiresSolvedId ? studioObjects.find(o => o.id === obj.requiresSolvedId) : null;
        const prereqBadge = prereqObj ? `선행: Q${String(prereqObj.qNum).padStart(2, '0')}` : '';
        const lightEf = Array.isArray(obj.onUnlockEffects) ? obj.onUnlockEffects.find(ef => ef && ef.kind === 'lightOn') : null;
        const lightBadge = lightEf ? `💡 점등: ${lightEf.targetId}` : '';

        // Node 1: Prop / Clue (foreignObject auto-wrap, zero text clipping)
        svg += `
          <foreignObject x="${colX[0]}" y="${y}" width="${nodeW}" height="${nodeH}">
            <div xmlns="http://www.w3.org/1999/xhtml" onclick="${clickAction}" ondblclick="${dblClickAction}" title="${escapeXml(obj.name + (linkedProp ? ' — ' + linkedProp.name : ''))}"
                 class="w-full h-full rounded-md bg-[#16161a] border ${isSelNode ? 'border-sky-400 ring-1 ring-sky-400/50' : (linkedProp ? 'border-sky-500/50' : 'border-white/10')} hover:border-white/30 p-2 flex flex-col justify-between cursor-pointer box-border overflow-hidden">
              <div class="flex items-center justify-between gap-1">
                <span class="text-[9.5px] font-mono text-sky-400 leading-none truncate">${escapeXml(qCode)} · ${escapeXml(obj.carrierType || 'Clue')}</span>
                ${prereqBadge ? `<span class="text-[8.5px] font-mono px-1 py-0.5 rounded bg-indigo-950/80 border border-indigo-400/40 text-indigo-200 leading-none shrink-0">${escapeXml(prereqBadge)}</span>` : ''}
              </div>
              <div class="text-[11.5px] font-semibold text-zinc-100 leading-tight break-keep">${escapeXml(obj.name)}</div>
              <div class="text-[9.5px] font-mono leading-tight break-keep truncate ${linkedProp ? 'text-amber-400' : 'text-zinc-500'}">
                ${escapeXml(linkedProp ? '소품: ' + linkedProp.name : obj.clueId)}
              </div>
            </div>
          </foreignObject>
        `;

        // Node 2: Problem (Full rule visible with 3-line wrap)
        svg += `
          <foreignObject x="${colX[1]}" y="${y}" width="${nodeW}" height="${nodeH}">
            <div xmlns="http://www.w3.org/1999/xhtml" onclick="${clickAction}" ondblclick="${dblClickAction}" title="${escapeXml(obj.probRule || '')}"
                 class="w-full h-full rounded-md bg-[#16161a] border ${isSelNode ? 'border-sky-400' : 'border-white/10'} hover:border-white/30 p-2 flex flex-col justify-between cursor-pointer box-border overflow-hidden">
              <div class="text-[9.5px] font-mono text-indigo-400 leading-none">${escapeXml(obj.probId || 'prob')}</div>
              <div class="text-[10.5px] text-zinc-200 leading-snug break-keep line-clamp-3">${escapeXml(obj.probRule || '')}</div>
              <div class="text-[9px] font-mono text-zinc-500 leading-none">클릭: 우측 인스펙터 편집</div>
            </div>
          </foreignObject>
        `;

        // Node 3: Gate
        svg += `
          <foreignObject x="${colX[2]}" y="${y}" width="${nodeW}" height="${nodeH}">
            <div xmlns="http://www.w3.org/1999/xhtml" onclick="${clickAction}" ondblclick="${dblClickAction}"
                 class="w-full h-full rounded-md ${solved ? 'bg-emerald-950/50 border-emerald-500/50' : 'bg-[#16161a] border-amber-500/40'} border ${isSelNode ? 'ring-1 ring-sky-400/50' : ''} hover:border-white/40 p-2 flex flex-col justify-between cursor-pointer box-border overflow-hidden">
              <div class="text-[9.5px] font-mono ${solved ? 'text-emerald-400' : 'text-amber-400'} leading-none">${escapeXml(obj.gateId || 'gate')} · ${solved ? 'UNLOCKED' : 'LOCKED'}</div>
              <div class="text-[11.5px] font-semibold text-zinc-100 leading-tight break-all">${escapeXml(obj.interfaceType || 'Lock')}</div>
              <div class="text-[9.5px] font-mono text-zinc-400 leading-tight">${solved ? '해금 완료 (' + escapeXml(obj.passcode) + ')' : '잠금 (더블클릭: 해제)'}</div>
            </div>
          </foreignObject>
        `;

        // Node 4: Container / Boss Door
        svg += `
          <foreignObject x="${colX[3]}" y="${y}" width="${nodeW}" height="${nodeH}">
            <div xmlns="http://www.w3.org/1999/xhtml" onclick="${clickAction}" ondblclick="${dblClickAction}" title="${escapeXml(obj.unlocksName || obj.unlocksId || '')}"
                 class="w-full h-full rounded-md bg-[#16161a] border ${isSelNode ? 'border-sky-400' : (isBoss ? 'border-rose-500/50' : (solved ? 'border-emerald-500/50' : 'border-white/10'))} hover:border-white/30 p-2 flex flex-col justify-between cursor-pointer box-border overflow-hidden">
              <div class="text-[9.5px] font-mono ${isBoss ? 'text-rose-400' : 'text-emerald-400'} leading-none">${isBoss ? 'BOSS DOOR · 공간 전이' : 'CONTAINER · 다음 단서'}</div>
              <div class="text-[11px] font-semibold text-zinc-100 leading-snug break-keep line-clamp-2">${escapeXml(obj.unlocksName || obj.unlocksId)}</div>
              ${lightBadge
                ? `<div class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-400/40 text-amber-300 leading-none truncate">${escapeXml(lightBadge)}</div>`
                : `<div class="text-[9px] font-mono text-zinc-500 leading-none truncate">ID: ${escapeXml(obj.unlocksId || '')}</div>`
              }
            </div>
          </foreignObject>
        `;
      });

      board.innerHTML = `
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-semibold text-zinc-100 shrink-0">${escapeXml(rc.fullName)}</span>
            <span class="text-[11px] font-mono text-zinc-500 truncate">${rc.w}×${rc.h}m · ${escapeXml(rc.passageInfo)}</span>
          </div>
          <button onclick="switchRoom(${rc.idx}); setViewLayout('split');" class="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium border border-white/10 shrink-0">이 방으로 이동</button>
        </div>
        <svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-auto min-w-[820px] bg-[#09090b] rounded-md border border-white/10">
          ${svg}
        </svg>
      `;
    }

    // -------------------------------------------------------------
    // 4. VIEW LAYOUT SWITCHER
    // -------------------------------------------------------------
    let currentViewLayout = 'split';
    function setViewLayout(mode) {
      currentViewLayout = mode;
      const pane2D = document.getElementById('pane-2d');
      const pane3D = document.getElementById('pane-3d');
      const paneLogic = document.getElementById('pane-logic');

      ['split', '2d', '3d', 'logic'].forEach(m => {
        const btn = document.getElementById('layout-btn-' + m);
        if (btn) btn.className = "px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors text-zinc-400 hover:text-zinc-200";
      });

      const activeBtnClass = "px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors bg-zinc-800 text-zinc-100";

      if (mode === 'split') {
        pane2D.classList.remove('hidden'); pane2D.style.flex = '1';
        pane3D.classList.remove('hidden'); pane3D.style.flex = '1';
        paneLogic.classList.add('hidden');
        document.getElementById('layout-btn-split').className = activeBtnClass;
        onResizeThree();
      } else if (mode === '2d-only') {
        pane2D.classList.remove('hidden'); pane2D.style.flex = '1';
        pane3D.classList.add('hidden');
        paneLogic.classList.add('hidden');
        document.getElementById('layout-btn-2d').className = activeBtnClass;
      } else if (mode === '3d-only') {
        pane2D.classList.add('hidden');
        pane3D.classList.remove('hidden'); pane3D.style.flex = '1';
        paneLogic.classList.add('hidden');
        document.getElementById('layout-btn-3d').className = activeBtnClass;
        onResizeThree();
      } else if (mode === 'logic') {
        pane2D.classList.add('hidden');
        pane3D.classList.add('hidden');
        paneLogic.classList.remove('hidden');
        document.getElementById('layout-btn-logic').className = activeBtnClass;
        if (ontologyGraphFilter !== -1) ontologyGraphFilter = currentRoomIdx;
        updateCodeView();
        render30DagBoard();
      }
      playSfx('click');
    }

    function updateCodeView() {
      const paneLogic = document.getElementById('pane-logic');
      if (paneLogic && !paneLogic.classList.contains('hidden')) {
        const snap = buildRacJsonSnapshot();
        const el = document.getElementById('rac-code-display');
        if (el) el.textContent = JSON.stringify(snap, null, 2);
      }
      if (typeof scheduleStudioAutosave === 'function') scheduleStudioAutosave();
    }

    // -------------------------------------------------------------
    // 5. 2D CAD DYNAMIC AUTO-FITTING VIEWBOX & UNIFIED FLOOR ENGINE
    // -------------------------------------------------------------
    let roomW = 4.0, roomH = 3.0;
    const baseScale = 85;
    const margin = 55;
    let cadViewMode = 'room'; // 'room' (단일 방 정밀) vs 'floor' (층별 통합 건축 도면)

    function setCadViewMode(mode) {
      cadViewMode = mode;
      const btnRoom = document.getElementById('btn-cad-mode-room');
      const btnFloor = document.getElementById('btn-cad-mode-floor');
      const tipText = document.getElementById('cad-tip-text');

      if (mode === 'floor') {
        if (btnFloor) btnFloor.className = "px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-100";
        if (btnRoom) btnRoom.className = "px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200";
        if (tipText) tipText.textContent = "층별 통합 도면: 방을 클릭하면 해당 공간으로 이동합니다";
      } else {
        if (btnRoom) btnRoom.className = "px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-100";
        if (btnFloor) btnFloor.className = "px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200";
        if (tipText) tipText.textContent = "기물 드래그 이동 · 클릭 시 퍼즐 조사";
      }

      updateCadViewBox();
      playSfx('click');
    }

    function meterToSvg(mX, mZ) {
      return { x: margin + mX * baseScale, y: margin + mZ * baseScale };
    }
    function svgToMeter(sX, sY) {
      return {
        x: Math.max(0.2, (sX - margin) / baseScale),
        z: Math.max(0.2, (sY - margin) / baseScale)
      };
    }

    function updateCadGeometryOnly(w, h) {
      const roomPxW = w * baseScale;
      const roomPxH = h * baseScale;
      const x1 = margin, y1 = margin;
      const x2 = margin + roomPxW, y2 = margin + roomPxH;

      const roomPoly = document.getElementById('room-poly');
      if (roomPoly) roomPoly.setAttribute('points', `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`);

      const dimW = document.getElementById('dim-w');
      const dimH = document.getElementById('dim-h');
      const cadRoomTitle = document.getElementById('cad-room-title');

      if (dimW) {
        dimW.textContent = `${w.toFixed(2)} m`;
        dimW.setAttribute('x', (x1 + x2) / 2);
        dimW.setAttribute('y', y1 - 14);
      }

      if (dimH) {
        dimH.textContent = `${h.toFixed(2)} m`;
        dimH.setAttribute('x', x1 - 14);
        dimH.setAttribute('y', (y1 + y2) / 2);
        dimH.setAttribute('transform', `rotate(-90 ${x1 - 14},${(y1 + y2) / 2})`);
      }

      if (cadRoomTitle) {
        const rc = ROOM_CONFIGS[currentRoomIdx];
        const qS = currentRoomIdx * 5 + 1;
        const qE = currentRoomIdx * 5 + 5;
        cadRoomTitle.textContent = `${rc.fullName} (Q${String(qS).padStart(2,'0')}~Q${String(qE).padStart(2,'0')})`;
        cadRoomTitle.setAttribute('x', (x1 + x2) / 2);
        cadRoomTitle.setAttribute('y', y1 + 26);
      }

      const cornerBR = document.getElementById('corner-br');
      const cornerTxt = document.getElementById('corner-handle-txt');
      if (cornerBR) {
        cornerBR.setAttribute('cx', x2);
        cornerBR.setAttribute('cy', y2);
      }
      if (cornerTxt) {
        cornerTxt.setAttribute('x', x2);
        cornerTxt.setAttribute('y', y2 + 22);
      }

      const measureInfo = document.getElementById('cad-measure-info');
      if (measureInfo) {
        measureInfo.textContent = `${w.toFixed(1)}×${h.toFixed(1)}m (${(w * h).toFixed(1)}㎡)`;
      }

      // Update Corridor Gateway Door in Room Mode
      const gateway = document.getElementById('cad-corridor-gateway');
      if (gateway) {
        gateway.setAttribute('transform', `translate(${x2}, ${y1 + roomPxH / 2})`);
      }
    }

    function updateCadViewBox() {
      const svg = document.getElementById('cad-svg');
      const rc = ROOM_CONFIGS[currentRoomIdx];
      const floor = FLOOR_CONFIGS[rc.floorId] || FLOOR_CONFIGS["1f"];

      const roomLayer = document.getElementById('cad-room-layer');
      const floorLayer = document.getElementById('cad-floor-layer');

      if (cadViewMode === 'floor') {
        if (roomLayer) roomLayer.style.display = 'none';
        if (floorLayer) floorLayer.style.display = 'inline';

        const floorScale = 52;
        const fPxW = floor.totalW * floorScale;
        const fPxH = floor.totalH * floorScale;
        const totalW = fPxW + margin * 2 + 40;
        const totalH = fPxH + margin * 2 + 50;
        svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

        renderFloorCadView(floor, floorScale);
      } else {
        if (roomLayer) roomLayer.style.display = 'inline';
        if (floorLayer) floorLayer.style.display = 'none';

        const roomPxW = roomW * baseScale;
        const roomPxH = roomH * baseScale;
        const totalW = Math.max(roomPxW + margin * 2 + 60, 520);
        const totalH = Math.max(roomPxH + margin * 2 + 50, 390);

        svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
        updateCadGeometryOnly(roomW, roomH);

        // Floor Hole Update (Shown in Room 4: 2F 해부·영안실)
        const holeEl = document.getElementById('cad-2f-hole');
        if (holeEl) {
          if (rc.hasHole) {
            holeEl.classList.remove('hidden');
            const holeRect = holeEl.querySelector('rect');
            const holeText = holeEl.querySelector('text');
            const hPxX = margin + (rc.holePos[0] - rc.holeSize[0] / 2) * baseScale;
            const hPxY = margin + (rc.holePos[1] - rc.holeSize[1] / 2) * baseScale;
            const hW = rc.holeSize[0] * baseScale;
            const hH = rc.holeSize[1] * baseScale;
            if (holeRect) {
              holeRect.setAttribute('x', hPxX);
              holeRect.setAttribute('y', hPxY);
              holeRect.setAttribute('width', hW);
              holeRect.setAttribute('height', hH);
            }
            if (holeText) {
              holeText.setAttribute('x', hPxX + hW / 2);
              holeText.setAttribute('y', hPxY + hH / 2 + 4);
            }
          } else {
            holeEl.classList.add('hidden');
          }
        }
      }
    }

    function renderFloorCadView(floor, scale) {
      const g = document.getElementById('cad-floor-layer');
      if (!g) return;
      g.innerHTML = '';

      const m = margin;

      // Floor Title Header
      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute('x', m);
      title.setAttribute('y', m - 20);
      title.setAttribute('fill', '#e2e8f0');
      title.setAttribute('font-size', '14');
      title.setAttribute('font-weight', 'bold');
      title.textContent = `🏢 ${floor.name} 건축 통합 평면도 (총 폭 ${floor.totalW}m × ${floor.totalH}m)`;
      g.appendChild(title);

      // Render Corridor (only when this floor actually defines a corridor)
      const c = floor.corridor;
      if (c) {
        const cX = m + c.x * scale;
        const cY = m + c.z * scale;
        const cW = c.w * scale;
        const cH = c.h * scale;

        const corridorRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        corridorRect.setAttribute('x', cX);
        corridorRect.setAttribute('y', cY);
        corridorRect.setAttribute('width', cW);
        corridorRect.setAttribute('height', cH);
        corridorRect.setAttribute('fill', '#0f172a');
        corridorRect.setAttribute('stroke', '#38bdf8');
        corridorRect.setAttribute('stroke-width', '2');
        corridorRect.setAttribute('stroke-dasharray', '4 3');
        g.appendChild(corridorRect);

        const cText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        cText.setAttribute('x', cX + cW / 2);
        cText.setAttribute('y', cY + 22);
        cText.setAttribute('fill', '#38bdf8');
        cText.setAttribute('font-size', '10');
        cText.setAttribute('font-weight', 'bold');
        cText.setAttribute('text-anchor', 'middle');
        cText.textContent = `🚪 ${floor.corridorName}`;
        g.appendChild(cText);

        // Corridor Props Symbols
        (c.props || []).forEach(p => {
          const pX = m + (c.x + (p.x - c.x)) * scale;
          const pY = m + (c.z + (p.z - c.z)) * scale;
          const pGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          pGroup.setAttribute('transform', `translate(${pX}, ${pY})`);

          const pRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          pRect.setAttribute('x', -14);
          pRect.setAttribute('y', -10);
          pRect.setAttribute('width', 28);
          pRect.setAttribute('height', 20);
          pRect.setAttribute('rx', 4);
          pRect.setAttribute('fill', '#1e293b');
          pRect.setAttribute('stroke', p.color || '#64748b');
          pRect.setAttribute('stroke-width', '1.5');

          const pTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          pTxt.setAttribute('x', 0);
          pTxt.setAttribute('y', 4);
          pTxt.setAttribute('fill', p.color || '#cbd5e1');
          pTxt.setAttribute('font-size', '8');
          pTxt.setAttribute('text-anchor', 'middle');
          pTxt.textContent = p.type === 'wheelchair' ? '♿ 휠체어' : (p.type === 'exit-sign' ? '🟩 유도등' : '소품');

          pGroup.appendChild(pRect);
          pGroup.appendChild(pTxt);
          g.appendChild(pGroup);
        });
      }

      // Render Each Room in this Floor (Dynamic filter so newly added rooms & 1F 3-rooms all appear & can be dragged)
      const floorRooms = ROOM_CONFIGS.filter(r => r.floorId === floor.id);
      floorRooms.forEach(r => {
        const rIdx = r.idx;
        const rX = m + r.worldX * scale;
        const rY = m + r.worldZ * scale;
        const rW = r.w * scale;
        const rH = r.h * scale;
        const isCurrent = (rIdx === currentRoomIdx);

        const rGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        rGroup.setAttribute('class', 'cursor-grab active:cursor-grabbing hover:opacity-95');

        // Pointer drag (0.5m grid snap) with 4px threshold separating click vs drag
        rGroup.onpointerdown = (ev) => {
          ev.stopPropagation();
          const svg = document.getElementById('cad-svg');
          if (!svg) return;
          const startClientX = ev.clientX;
          const startClientY = ev.clientY;
          const origWX = r.worldX;
          const origWZ = r.worldZ;
          let moved = false;

          const getSvgPt = (cx, cy) => {
            const pt = svg.createSVGPoint();
            pt.x = cx; pt.y = cy;
            const ctm = svg.getScreenCTM();
            return ctm ? pt.matrixTransform(ctm.inverse()) : { x: cx, y: cy };
          };
          const startPt = getSvgPt(startClientX, startClientY);

          const onMove = (me) => {
            if (!moved && Math.hypot(me.clientX - startClientX, me.clientY - startClientY) < 4) return;
            moved = true;
            const curPt = getSvgPt(me.clientX, me.clientY);
            const dxM = (curPt.x - startPt.x) / scale;
            const dzM = (curPt.y - startPt.y) / scale;
            const snapX = Math.max(-5, Math.round((origWX + dxM) * 2) / 2);
            const snapZ = Math.max(-5, Math.round((origWZ + dzM) * 2) / 2);
            if (r.worldX !== snapX || r.worldZ !== snapZ) {
              r.worldX = snapX;
              r.worldZ = snapZ;
              if (rIdx === currentRoomIdx) {
                const swx = document.getElementById('space-wx'); if (swx) swx.value = r.worldX;
                const swz = document.getElementById('space-wz'); if (swz) swz.value = r.worldZ;
              }
              renderFloorCadView(floor, scale);
              rebuild3DRoom();
              updateCodeView();
            }
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (!moved) switchRoom(rIdx);
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        };

        const rRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rRect.setAttribute('x', rX);
        rRect.setAttribute('y', rY);
        rRect.setAttribute('width', rW);
        rRect.setAttribute('height', rH);
        rRect.setAttribute('rx', 6);
        rRect.setAttribute('fill', isCurrent ? 'rgba(99, 102, 241, 0.18)' : 'rgba(15, 23, 42, 0.6)');
        rRect.setAttribute('stroke', isCurrent ? '#6366f1' : '#475569');
        rRect.setAttribute('stroke-width', isCurrent ? '3' : '1.5');
        rGroup.appendChild(rRect);

        // Doorway opening markers on West / East walls
        if (r.hasWestDoor) {
          const wDoor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          wDoor.setAttribute('x', rX - 3);
          wDoor.setAttribute('y', rY + rH / 2 - 10);
          wDoor.setAttribute('width', 6);
          wDoor.setAttribute('height', 20);
          wDoor.setAttribute('rx', 2);
          wDoor.setAttribute('fill', '#10b981');
          rGroup.appendChild(wDoor);
        }
        if (r.hasEastDoor !== false) {
          const eDoor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          eDoor.setAttribute('x', rX + rW - 3);
          eDoor.setAttribute('y', rY + rH / 2 - 10);
          eDoor.setAttribute('width', 6);
          eDoor.setAttribute('height', 20);
          eDoor.setAttribute('rx', 2);
          eDoor.setAttribute('fill', '#10b981');
          rGroup.appendChild(eDoor);
        }

        // Room Name & Status
        const rTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        rTitle.setAttribute('x', rX + rW / 2);
        rTitle.setAttribute('y', rY + 24);
        rTitle.setAttribute('fill', isCurrent ? '#818cf8' : '#94a3b8');
        rTitle.setAttribute('font-size', '11');
        rTitle.setAttribute('font-weight', 'bold');
        rTitle.setAttribute('text-anchor', 'middle');
        rTitle.textContent = `${isCurrent ? '📍 현재방: ' : ''}${r.shortName}`;
        rGroup.appendChild(rTitle);

        const rSize = document.createElementNS("http://www.w3.org/2000/svg", "text");
        rSize.setAttribute('x', rX + rW / 2);
        rSize.setAttribute('y', rY + 42);
        rSize.setAttribute('fill', '#64748b');
        rSize.setAttribute('font-size', '9');
        rSize.setAttribute('font-family', 'monospace');
        rSize.setAttribute('text-anchor', 'middle');
        rSize.textContent = `${r.w}×${r.h}m (${r.worldX}, ${r.worldZ}) · 드래그 이동`;
        rGroup.appendChild(rSize);

        // Render Room Objects (Puzzles) Mini Icons
        const rObjs = studioObjects.filter(o => o.roomIdx === rIdx);
        rObjs.forEach(obj => {
          const oX = rX + (obj.x / r.w) * rW;
          const oY = rY + (obj.z / r.h) * rH;
          const oDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          oDot.setAttribute('cx', oX);
          oDot.setAttribute('cy', oY);
          oDot.setAttribute('r', isCurrent ? '7' : '5');
          oDot.setAttribute('fill', obj.solved ? '#10b981' : (obj.color || '#3b82f6'));
          oDot.setAttribute('stroke', obj.solved ? '#34d399' : '#ffffff');
          oDot.setAttribute('stroke-width', '1.5');
          rGroup.appendChild(oDot);

          const oCode = document.createElementNS("http://www.w3.org/2000/svg", "text");
          oCode.setAttribute('x', oX);
          oCode.setAttribute('y', oY + 3);
          oCode.setAttribute('fill', '#ffffff');
          oCode.setAttribute('font-size', '7');
          oCode.setAttribute('font-weight', 'bold');
          oCode.setAttribute('text-anchor', 'middle');
          oCode.textContent = obj.qNum ? `Q${obj.qNum}` : '';
          rGroup.appendChild(oCode);
        });

        // Connecting Door Marker between Room and Corridor
        if (floor.corridor) {
          const doorMarker = document.createElementNS("http://www.w3.org/2000/svg", "g");
          const doorX = (r.worldX === 0) ? (rX + rW) : rX;
          const doorY = rY + rH / 2;
          const dSolved = rObjs.some(o => o.isBossDoor && o.solved);

          const dRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          dRect.setAttribute('x', doorX - 4);
          dRect.setAttribute('y', doorY - 14);
          dRect.setAttribute('width', 8);
          dRect.setAttribute('height', 28);
          dRect.setAttribute('rx', 2);
          dRect.setAttribute('fill', dSolved ? '#10b981' : '#ef4444');
          doorMarker.appendChild(dRect);

          rGroup.appendChild(doorMarker);
        }
        g.appendChild(rGroup);
      });
    }

    // W3C 표준 CTM 역변환
    function getSvgMousePos(e) {
      const svg = document.getElementById('cad-svg');
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const svgP = pt.matrixTransform(ctm.inverse());
      return { x: svgP.x, y: svgP.y };
    }

    function render2DCadObjects() {
      const g = document.getElementById('cad-objects-layer');
      const linesG = document.getElementById('cad-causal-lines-layer');
      g.innerHTML = '';
      if (linesG) linesG.innerHTML = '';

      const roomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);

      // Draw Room Partitions on 2D CAD
      const currentParts = ROOM_PARTITIONS.filter(p => p.roomIdx === currentRoomIdx);
      currentParts.forEach(part => {
        const p1 = meterToSvg(part.x1, part.z1);
        const p2 = meterToSvg(part.x2, part.z2);
        const partLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        partLine.setAttribute('x1', p1.x);
        partLine.setAttribute('y1', p1.y);
        partLine.setAttribute('x2', p2.x);
        partLine.setAttribute('y2', p2.y);
        partLine.setAttribute('stroke', '#a855f7');
        partLine.setAttribute('stroke-width', '4');
        partLine.setAttribute('stroke-linecap', 'round');
        g.appendChild(partLine);

        const partLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        partLabel.setAttribute('x', (p1.x + p2.x) / 2);
        partLabel.setAttribute('y', (p1.y + p2.y) / 2 - 6);
        partLabel.setAttribute('fill', '#c084fc');
        partLabel.setAttribute('font-size', '9');
        partLabel.setAttribute('font-weight', 'bold');
        partLabel.setAttribute('text-anchor', 'middle');
        partLabel.textContent = `🧱 ${part.name}`;
        g.appendChild(partLabel);
      });

      // Draw subtle causal flow dashed lines only for real requiresSolvedId / onUnlockEffects links
      const curRc = ROOM_CONFIGS[currentRoomIdx];
      if (linesG && roomObjs.length > 1) {
        roomObjs.forEach(fromObj => {
          roomObjs.forEach(toObj => {
            if (!hasCausalLink(fromObj, toObj, curRc)) return;
            const p1 = meterToSvg(fromObj.x, fromObj.z);
            const p2 = meterToSvg(toObj.x, toObj.z);
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.setAttribute('stroke', fromObj.solved ? '#10b981' : '#334155');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('stroke-dasharray', '4 4');
            linesG.appendChild(line);
          });
        });
      }

      roomObjs.forEach(obj => {
        const pos = meterToSvg(obj.x, obj.z);
        const wPx = Math.max(54, (obj.w || 0.7) * baseScale);
        const hPx = Math.max(42, (obj.d || 0.6) * baseScale);

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute('id', 'cad-el-' + obj.id);
        group.setAttribute('class', `cad-obj ${obj.id === selectedObjectId ? 'selected' : ''}`);
        const rotDeg = Math.round(((obj.rotY !== undefined ? obj.rotY : getNaturalObjectRotation(obj, roomW, roomH)) * 180 / Math.PI)) || 0;
        const normRot = ((rotDeg % 360) + 540) % 360 - 180;
        group.setAttribute('transform', `translate(${pos.x}, ${pos.y}) rotate(${rotDeg}) translate(${-wPx/2}, ${-hPx/2})`);

        // Main Box
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute('class', 'obj-main-box');
        rect.setAttribute('width', wPx);
        rect.setAttribute('height', hPx);
        rect.setAttribute('rx', 6);
        rect.setAttribute('fill', obj.solved ? '#065f46' : (obj.color || '#475569'));
        rect.setAttribute('stroke', obj.solved ? '#34d399' : '#ffffff');
        rect.setAttribute('stroke-width', obj.id === selectedObjectId ? 3 : 1.5);
        rect.setAttribute('fill-opacity', 0.92);

        // Question Badge & Object Name (counter-rotate 180° for south-facing props so text stays upright)
        const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        labelGroup.setAttribute('class', 'cad-label-group');
        if (Math.abs(normRot) > 90) {
          labelGroup.setAttribute('transform', `rotate(180 ${wPx / 2} ${hPx / 2})`);
        }

        const qCode = obj.qNum ? `Q${String(obj.qNum).padStart(2, '0')}` : 'NEW';
        const badgeTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badgeTxt.setAttribute('x', wPx / 2);
        badgeTxt.setAttribute('y', hPx / 2 - 4);
        badgeTxt.setAttribute('fill', obj.solved ? '#6ee7b7' : '#fde047');
        badgeTxt.setAttribute('font-size', '9');
        badgeTxt.setAttribute('font-family', 'monospace');
        badgeTxt.setAttribute('font-weight', 'bold');
        badgeTxt.setAttribute('text-anchor', 'middle');
        badgeTxt.textContent = `${obj.solved ? '✅' : '🔒'} [${qCode}] ${obj.passcode || ''}`;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute('x', wPx / 2);
        text.setAttribute('y', hPx / 2 + 10);
        text.setAttribute('fill', '#ffffff');
        text.setAttribute('font-size', '9.5');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = obj.name;

        labelGroup.appendChild(badgeTxt);
        labelGroup.appendChild(text);

        group.appendChild(rect);
        group.appendChild(labelGroup);

        group.addEventListener('mousedown', (e) => startDragCadObject(e, obj.id));
        group.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          selectObject(obj.id);
          openLockModalForObject(obj.id);
        });
        g.appendChild(group);
      });
    }

    let isDraggingObject = false;
    let draggedObjId = null;
    let dragOffset = { x: 0, y: 0 };

    function startDragCadObject(e, id) {
      isDraggingObject = true;
      draggedObjId = id;
      selectObject(id);

      const obj = studioObjects.find(o => o.id === id);
      const mouseSvg = getSvgMousePos(e);
      const objSvg = meterToSvg(obj.x, obj.z);

      dragOffset.x = mouseSvg.x - objSvg.x;
      dragOffset.y = mouseSvg.y - objSvg.y;
      e.stopPropagation();
      e.preventDefault();
    }

    let pendingRoomW = roomW;
    let pendingRoomH = roomH;

    window.addEventListener('mousemove', (e) => {
      if (isDraggingObject && draggedObjId) {
        const mouseSvg = getSvgMousePos(e);
        const targetSvgX = mouseSvg.x - dragOffset.x;
        const targetSvgY = mouseSvg.y - dragOffset.y;

        const meterPos = svgToMeter(targetSvgX, targetSvgY);
        meterPos.x = Math.max(0.3, Math.min(roomW - 0.3, meterPos.x));
        meterPos.z = Math.max(0.3, Math.min(roomH - 0.3, meterPos.z));

        const obj = studioObjects.find(o => o.id === draggedObjId);
        if (obj) {
          obj.x = parseFloat(meterPos.x.toFixed(2));
          obj.z = parseFloat(meterPos.z.toFixed(2));
          render2DCadObjects();
          syncObjectTo3D(obj);
          updateInspectorValues(obj);
        }
      }

      if (isDraggingRoomHandle) {
        const mouseSvg = getSvgMousePos(e);
        const rawW = (mouseSvg.x - margin) / baseScale;
        const rawH = (mouseSvg.y - margin) / baseScale;
        pendingRoomW = parseFloat(Math.max(2.5, Math.min(15.0, rawW)).toFixed(2));
        pendingRoomH = parseFloat(Math.max(2.0, Math.min(12.0, rawH)).toFixed(2));

        // 드래그 중에는 viewBox 고정 -> 보라색 원이 마우스 커서 바로 밑에 100% 밀착!
        updateCadGeometryOnly(pendingRoomW, pendingRoomH);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingRoomHandle) {
        isDraggingRoomHandle = false;
        cornerBR.setAttribute('r', '14');
        setRoomDimensions(pendingRoomW, pendingRoomH);
      }
      isDraggingObject = false;
      draggedObjId = null;
    });

    const cornerBR = document.getElementById('corner-br');
    let isDraggingRoomHandle = false;

    cornerBR.addEventListener('mouseenter', () => cornerBR.setAttribute('r', '17'));
    cornerBR.addEventListener('mouseleave', () => { if (!isDraggingRoomHandle) cornerBR.setAttribute('r', '14'); });

    cornerBR.addEventListener('mousedown', (e) => {
      isDraggingRoomHandle = true;
      pendingRoomW = roomW;
      pendingRoomH = roomH;
      cornerBR.setAttribute('r', '17');
      e.stopPropagation();
      e.preventDefault();
    });

    function setRoomDimensions(w, h) {
      roomW = w; roomH = h;
      ROOM_CONFIGS[currentRoomIdx].w = w;
      ROOM_CONFIGS[currentRoomIdx].h = h;
      updateCadViewBox();

      studioObjects.filter(o => o.roomIdx === currentRoomIdx).forEach(obj => {
        if (obj.x > roomW - 0.3) obj.x = parseFloat((roomW - 0.4).toFixed(2));
        if (obj.z > roomH - 0.3) obj.z = parseFloat((roomH - 0.4).toFixed(2));
        syncObjectTo3D(obj);
      });

      render2DCadObjects();
      rebuild3DRoom();
      updateCodeView();
    }

    // Palette: Add New Custom Object
    function addNewObject(type) {
      const nextQ = studioObjects.length + 1;
      const newId = `prop-custom-${Date.now().toString().slice(-3)}`;
      const newObj = {
        qNum: nextQ,
        id: newId,
        roomIdx: currentRoomIdx,
        type: type,
        name: type === 'desk' ? '추가 실험 책상' : type === 'safe' ? '추가 비밀 금고' : type === 'cabinet' ? '추가 철제 캐비닛' : '추가 제어 장치',
        x: parseFloat((roomW / 2).toFixed(2)),
        z: parseFloat((roomH / 2).toFixed(2)),
        w: 0.9, d: 0.65,
        color: type === 'safe' ? '#f59e0b' : '#3b82f6',
        clueId: `clue-${nextQ}`,
        carrierType: "Text",
        cluePayload: `[커스텀 단서 Q${nextQ}] 실험실 기록지에 적힌 비상 코드 1234`,
        probId: `prob-${nextQ}`,
        probRule: "단서 숫자 직접 입력 -> 1234",
        gateId: `gate-${nextQ}`,
        interfaceType: "ElectronicKeypad",
        passcode: "1234",
        unlocksId: `cont-${nextQ}`,
        unlocksName: "커스텀 보관함 해금",
        isBossDoor: false,
        solved: false
      };

      studioObjects.push(newObj);
      renderRoomSidebarAndProgress();
      render2DCadObjects();
      rebuild3DObjectsForCurrentRoom();
      selectObject(newId);
      updateCodeView();
      playSfx('click');
    }

    // -------------------------------------------------------------
    // 6. SELECTION & INSPECTOR
    // -------------------------------------------------------------
    function selectObject(id) {
      selectedObjectId = id;
      const obj = studioObjects.find(o => o.id === id);
      if (obj && obj.roomIdx !== undefined && obj.roomIdx !== currentRoomIdx && obj.roomIdx >= 0 && obj.roomIdx < ROOM_CONFIGS.length) {
        currentRoomIdx = obj.roomIdx;
        const rc = ROOM_CONFIGS[currentRoomIdx];
        if (rc) {
          roomW = rc.w;
          roomH = rc.h;
          const layerTxt = document.getElementById('cad-current-layer-txt');
          if (layerTxt) layerTxt.textContent = `${rc.shortName} (${rc.layerLabel})`;
          const badge = document.getElementById('cad-passage-badge');
          if (badge) badge.textContent = rc.passageInfo;
          if (spotLight) spotLight.color.setHex(rc.lightColor);
          const atm = document.getElementById('hud-3d-atmosphere');
          if (atm) atm.textContent = `조명: ${rc.atmosphere}`;
        }
      }
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      updateInspectorValues(obj);
    }

    function updateInspectorValues(obj) {
      if (!obj) return;
      const qCode = obj.qNum ? `Q${String(obj.qNum).padStart(2, '0')}` : 'NEW';
      document.getElementById('insp-header-title').textContent = obj.name;
      document.getElementById('insp-q-badge').textContent = qCode;
      document.getElementById('btn-open-puzzle-txt').textContent = `${obj.solved ? '해금 완료 · 다시 보기' : '이 퍼즐 조사 및 풀기'} (${qCode})`;

      const prereqObj = obj.requiresSolvedId ? studioObjects.find(o => o.id === obj.requiresSolvedId) : null;
      const clueRevealed = (studioMode !== 'playtest') || !prereqObj || prereqObj.solved || obj.solved;

      // 결속된 물리 소품(Prop Ontology) 표시 (단서 해금 전에는 스포일러 차단)
      const linkedProp = PROP_ONTOLOGY.find(p => p.targetObjId === obj.id);
      const propBox = document.getElementById('insp-prop-link-box');
      const propTxt = document.getElementById('insp-prop-link');
      if (propBox && propTxt) {
        if (linkedProp && clueRevealed) {
          propBox.classList.remove('hidden');
          propTxt.textContent = `${linkedProp.name} — ${linkedProp.gimmick.description}`;
        } else {
          propBox.classList.add('hidden');
        }
      }

      const visBadge = document.getElementById('insp-clue-vis');
      if (visBadge) {
        visBadge.textContent = clueRevealed ? 'Revealed' : 'Hidden';
        visBadge.className = clueRevealed ? 'font-mono text-[10px] text-emerald-400' : 'font-mono text-[10px] text-zinc-500';
      }
      document.getElementById('insp-clue-txt').textContent = clueRevealed
        ? (obj.cluePayload || '')
        : `[단서 미발견] 선행 퍼즐(Q${String(prereqObj.qNum).padStart(2,'0')} ${prereqObj.name})을 해결하면 단서가 드러납니다.`;
      document.getElementById('insp-rule-txt').textContent = obj.probRule || '';
      document.getElementById('insp-gate-type').textContent = obj.interfaceType || 'MechanicalLock';
      document.getElementById('insp-unlock-target').textContent = obj.unlocksName || obj.unlocksId || '';

      document.getElementById('prop-name').value = obj.name;
      document.getElementById('prop-x').value = obj.x;
      document.getElementById('prop-z').value = obj.z;
      document.getElementById('prop-passcode').value = obj.passcode || '1234';

      const clueEditEl = document.getElementById('prop-clue-edit');
      if (clueEditEl) clueEditEl.value = obj.cluePayload || '';

      const reqSel = document.getElementById('prop-requires');
      if (reqSel) {
        const roomPeers = studioObjects.filter(o => o.roomIdx === obj.roomIdx && o.id !== obj.id);
        reqSel.innerHTML = '<option value="">없음 (자유 진입)</option>' + roomPeers.map(p =>
          `<option value="${p.id}" ${obj.requiresSolvedId === p.id ? 'selected' : ''}>Q${String(p.qNum).padStart(2,'0')} ${p.name}</option>`
        ).join('');
      }

      const mechSel = document.getElementById('prop-mechanism');
      if (mechSel) mechSel.value = obj.mechanism ? obj.mechanism.kind : '';

      const unlockLightSel = document.getElementById('prop-unlock-light');
      if (unlockLightSel) {
        const curLightEf = Array.isArray(obj.onUnlockEffects)
          ? obj.onUnlockEffects.find(ef => ef && ef.kind === 'lightOn')
          : null;
        const selectedLightId = curLightEf ? curLightEf.targetId : '';
        const lightOpts = ['<option value="">없음</option>'];
        ROOM_CONFIGS.forEach(rc => {
          const rLights = Array.isArray(rc.lights) ? rc.lights : [];
          rLights.forEach(lt => {
            const selAttr = lt.id === selectedLightId ? 'selected' : '';
            const initTag = lt.initiallyOn === false ? ' [초기OFF]' : '';
            lightOpts.push(`<option value="${escapeXml(lt.id)}" ${selAttr}>${escapeXml(rc.shortName)} · ${escapeXml(lt.id)}${initTag}</option>`);
          });
        });
        unlockLightSel.innerHTML = lightOpts.join('');
      }

      const visSel = document.getElementById('prop-visual-tpl');
      if (visSel) visSel.value = (obj.visualSpec && obj.visualSpec.template) ? obj.visualSpec.template : '';

      const storyEl = document.getElementById('prop-story-beat');
      if (storyEl) storyEl.value = obj.storyBeat || '';

      const matSel = document.getElementById('prop-material');
      if (matSel) matSel.value = (obj.material && obj.material.preset) ? obj.material.preset : '';

      const modelSel = document.getElementById('prop-model-preset');
      if (modelSel) modelSel.value = obj.modelPreset || '';

      const modelUrlEl = document.getElementById('prop-model-url');
      if (modelUrlEl) modelUrlEl.value = obj.modelUrl || '';

      // 현재 방(Space) 구조·재질 편집 패널 동기화
      syncSpaceEditorUI();

      const solvedBadge = document.getElementById('insp-solved-badge');
      if (obj.solved) {
        solvedBadge.textContent = "UNLOCKED";
        solvedBadge.className = "text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20";
      } else {
        solvedBadge.textContent = "LOCKED";
        solvedBadge.className = "text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono border border-rose-500/20";
      }
    }

    function selectObjectFromOntologyGraph(roomIdx, objId) {
      if (typeof roomIdx === 'number' && roomIdx >= 0 && roomIdx < ROOM_CONFIGS.length && currentRoomIdx !== roomIdx) {
        currentRoomIdx = roomIdx;
      }
      selectObject(objId);
      const sbRight = document.getElementById('sidebar-right');
      if (sbRight) {
        if (sbRight.classList.contains('hidden')) sbRight.classList.remove('hidden');
        if (sbRight.style.width === '0px' && typeof toggleRightSidebar === 'function') {
          toggleRightSidebar();
        }
      }
      const authorDetails = document.getElementById('insp-obj-form')?.closest('details');
      if (authorDetails) authorDetails.open = true;
    }

    function updateSelectedObjectProps() {
      if (!selectedObjectId) return;
      const obj = studioObjects.find(o => o.id === selectedObjectId);
      if (!obj) return;

      obj.name = document.getElementById('prop-name').value;
      obj.x = parseFloat(document.getElementById('prop-x').value) || obj.x;
      obj.z = parseFloat(document.getElementById('prop-z').value) || obj.z;
      obj.passcode = document.getElementById('prop-passcode').value.trim().toUpperCase();

      const clueEditEl = document.getElementById('prop-clue-edit');
      const prevCluePayload = obj.cluePayload || '';
      const clueEdited = !!(clueEditEl && clueEditEl.value !== prevCluePayload);
      if (clueEditEl) obj.cluePayload = clueEditEl.value;
      const reqSel = document.getElementById('prop-requires');
      if (reqSel) obj.requiresSolvedId = reqSel.value || null;
      const mechSel = document.getElementById('prop-mechanism');
      if (mechSel) {
        const mk = mechSel.value;
        obj.mechanism = mk ? { kind: mk, targetState: obj.passcode } : null;
      }
      const unlockLightSel = document.getElementById('prop-unlock-light');
      if (unlockLightSel) {
        const lightId = unlockLightSel.value;
        if (lightId) {
          obj.onUnlockEffects = [{ kind: 'lightOn', targetId: lightId, sfx: 'spark' }];
          for (const rc of ROOM_CONFIGS) {
            const targetLt = Array.isArray(rc.lights) ? rc.lights.find(l => l.id === lightId) : null;
            if (targetLt) {
              targetLt.initiallyOn = false;
              break;
            }
          }
        } else {
          delete obj.onUnlockEffects;
        }
      }
      const clueLines = (obj.cluePayload || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const safeLines = clueLines.length > 0 ? clueLines : ['단서 내용을 입력하세요.'];
      const visSel = document.getElementById('prop-visual-tpl');
      if (visSel) {
        const tpl = visSel.value;
        if (tpl) {
          obj.visualSpec = { ...(obj.visualSpec || {}), template: tpl, title: obj.name, lines: safeLines };
        } else if (clueEdited) {
          obj.visualSpec = { template: 'document', title: obj.name, lines: safeLines };
        } else {
          obj.visualSpec = null;
        }
      } else if (obj.visualSpec) {
        obj.visualSpec = { ...obj.visualSpec, title: obj.name, lines: safeLines };
      } else if (clueEdited) {
        obj.visualSpec = { template: 'document', title: obj.name, lines: safeLines };
      }
      const storyEl = document.getElementById('prop-story-beat');
      if (storyEl) obj.storyBeat = storyEl.value.trim();
      const matSel = document.getElementById('prop-material');
      if (matSel) {
        obj.material = matSel.value ? { preset: matSel.value } : null;
      }
      const modelSel = document.getElementById('prop-model-preset');
      if (modelSel) {
        obj.modelPreset = modelSel.value || null;
      }
      const modelUrlEl = document.getElementById('prop-model-url');
      if (modelUrlEl) {
        obj.modelUrl = modelUrlEl.value.trim() || null;
      }

      renderRoomSidebarAndProgress();
      render2DCadObjects();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      updateInspectorValues(obj);
      updateCodeView();
    }

    function updateCurrentSpaceProps() {
      const rc = ROOM_CONFIGS[currentRoomIdx];
      if (!rc) return;
      const w = parseFloat(document.getElementById('space-w')?.value);
      const h = parseFloat(document.getElementById('space-h')?.value);
      const wx = parseFloat(document.getElementById('space-wx')?.value);
      const wz = parseFloat(document.getElementById('space-wz')?.value);
      const fh = parseFloat(document.getElementById('space-floor')?.value);
      const wallMat = document.getElementById('space-wall-mat')?.value;
      const floorMat = document.getElementById('space-floor-mat')?.value;
      const wallTint = document.getElementById('space-wall-tint')?.value;

      if (!isNaN(w) && w >= 3) { rc.w = w; roomW = w; }
      if (!isNaN(h) && h >= 3) { rc.h = h; roomH = h; }
      if (!isNaN(wx)) rc.worldX = wx;
      if (!isNaN(wz)) rc.worldZ = wz;
      if (!isNaN(fh)) {
        rc.floorHeight = fh;
        rc.floorId = fh >= 2 ? '2f' : '1f';
        rc.layerLabel = fh >= 2 ? '2F 상층 (+2.6m)' : '1F 지상';
      }
      rc.materials = { wall: wallMat || 'plaster', floor: floorMat || 'tile' };
      if (wallTint && /^#[0-9a-fA-F]{6}$/.test(wallTint)) {
        rc.wallColor = parseInt(wallTint.slice(1), 16);
      }
      const dw = document.getElementById('space-door-west');
      const de = document.getElementById('space-door-east');
      if (dw) rc.hasWestDoor = dw.checked;
      if (de) rc.hasEastDoor = de.checked;

      // Update Room Lighting Props
      const lKind = document.getElementById('space-light-kind')?.value || 'fluorescent';
      const lColor = document.getElementById('space-light-color')?.value || '#c8dcff';
      const lInt = parseFloat(document.getElementById('space-light-intensity')?.value || '1.2');
      const lFlick = document.getElementById('space-light-flicker')?.checked ?? true;
      const lInitOn = document.getElementById('space-light-init-on')?.checked ?? true;

      if (!Array.isArray(rc.lights) || rc.lights.length === 0) {
        rc.lights = [{
          id: `light-${rc.id}-main`,
          kind: lKind,
          pos: [rc.w / 2, (rc.wallHeight || 2.6) - 0.2, rc.h / 2],
          color: lColor,
          intensity: !isNaN(lInt) ? lInt : 1.2,
          distance: 6.5,
          flicker: lFlick,
          initiallyOn: lInitOn
        }];
      } else {
        rc.lights[0].kind = lKind;
        rc.lights[0].color = lColor;
        rc.lights[0].intensity = !isNaN(lInt) ? lInt : 1.2;
        rc.lights[0].flicker = lFlick;
        rc.lights[0].initiallyOn = lInitOn;
        rc.lights[0].pos = [rc.w / 2, (rc.wallHeight || 2.6) - 0.2, rc.h / 2];
      }

      const pill = document.getElementById('space-layer-pill');
      if (pill) pill.textContent = rc.floorHeight >= 2 ? '2F' : '1F';
      updateCadGeometryOnly(rc.w, rc.h);
      render2DCadObjects();
      if (cadViewMode === 'floor') updateCadViewBox();
      renderRoomSidebarAndProgress();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      updateCodeView();
    }

    function syncSpaceEditorUI() {
      const rc = ROOM_CONFIGS[currentRoomIdx];
      if (!rc) return;
      const sw = document.getElementById('space-w'); if (sw) sw.value = rc.w;
      const sh = document.getElementById('space-h'); if (sh) sh.value = rc.h;
      const swx = document.getElementById('space-wx'); if (swx) swx.value = rc.worldX;
      const swz = document.getElementById('space-wz'); if (swz) swz.value = rc.worldZ;
      const sfl = document.getElementById('space-floor'); if (sfl) sfl.value = String(rc.floorHeight);
      const swm = document.getElementById('space-wall-mat'); if (swm) swm.value = (rc.materials && rc.materials.wall) || 'plaster';
      const sfm = document.getElementById('space-floor-mat'); if (sfm) sfm.value = (rc.materials && rc.materials.floor) || 'tile';
      const swt = document.getElementById('space-wall-tint'); if (swt) swt.value = '#' + (rc.wallColor || 0x475569).toString(16).padStart(6, '0');
      const pill = document.getElementById('space-layer-pill'); if (pill) pill.textContent = rc.floorHeight >= 2 ? '2F' : '1F';
      const dw = document.getElementById('space-door-west'); if (dw) dw.checked = !!rc.hasWestDoor;
      const de = document.getElementById('space-door-east'); if (de) de.checked = rc.hasEastDoor !== false;

      // Sync Room Lighting Controls
      const curLight = (rc.lights && rc.lights[0]) || { kind: 'fluorescent', color: '#c8dcff', intensity: 1.2, flicker: true, initiallyOn: true };
      const slKind = document.getElementById('space-light-kind'); if (slKind) slKind.value = curLight.kind || 'fluorescent';
      const slColor = document.getElementById('space-light-color'); if (slColor) slColor.value = curLight.color || '#c8dcff';
      const slInt = document.getElementById('space-light-intensity'); if (slInt) slInt.value = curLight.intensity !== undefined ? curLight.intensity : 1.2;
      const slFlick = document.getElementById('space-light-flicker'); if (slFlick) slFlick.checked = !!curLight.flicker;
      const slInitOn = document.getElementById('space-light-init-on'); if (slInitOn) slInitOn.checked = (curLight.initiallyOn !== false);

      renderSpacePassagesEditor();
    }

    function renderSpacePassagesEditor() {
      const rc = ROOM_CONFIGS[currentRoomIdx];
      const listEl = document.getElementById('space-passages-list');
      const targetSel = document.getElementById('passage-target-select');
      if (!rc || !listEl || !targetSel) return;

      const nameOf = (sid) => {
        if (/exit|escape|outside|exterior/i.test(sid)) return '최종 탈출구';
        const r = ROOM_CONFIGS.find(x => x.id === sid);
        return r ? r.shortName : sid;
      };

      const linked = studioPassages.filter(p => p.fromSpaceId === rc.id || p.toSpaceId === rc.id);
      if (linked.length === 0) {
        listEl.innerHTML = '<div class="text-[10px] text-zinc-600 font-mono">연결된 통로 없음 (고립 위험)</div>';
      } else {
        listEl.innerHTML = linked.map(p => {
          const arrow = p.directionality === 'OneWay' ? '→' : '↔';
          const label = p.fromSpaceId === rc.id
            ? `${arrow} ${nameOf(p.toSpaceId)}`
            : `${nameOf(p.fromSpaceId)} ${arrow}`;
          return `
            <div class="flex items-center justify-between gap-1 bg-[#111114] border border-white/10 rounded px-1.5 py-1 text-[10px] font-mono">
              <span class="truncate text-zinc-300" title="${p.id}">${label}</span>
              <button onclick="deletePassage('${p.id}')" title="통로 삭제" class="text-zinc-500 hover:text-rose-400 px-1 shrink-0">✕</button>
            </div>
          `;
        }).join('');
      }

      const opts = ROOM_CONFIGS.filter(r => r.id !== rc.id)
        .map(r => `<option value="${r.id}">${r.shortName}</option>`)
        .join('') + `<option value="space-exterior">최종 탈출구 (space-exterior)</option>`;
      targetSel.innerHTML = opts;
    }

    function addPassageFromCurrentSpace() {
      const rc = ROOM_CONFIGS[currentRoomIdx];
      const targetId = document.getElementById('passage-target-select')?.value;
      const dir = document.getElementById('passage-dir-select')?.value || 'TwoWay';
      if (!rc || !targetId) return;
      const exists = studioPassages.some(p =>
        (p.fromSpaceId === rc.id && p.toSpaceId === targetId) ||
        (p.directionality !== 'OneWay' && p.fromSpaceId === targetId && p.toSpaceId === rc.id)
      );
      if (exists) {
        showDirectorWhisper('이미 해당 공간과 연결된 통로가 존재합니다.');
        return;
      }
      const targetRc = ROOM_CONFIGS.find(r => r.id === targetId);
      const pid = `pass-${rc.id.replace('space-', '')}-${targetId.replace('space-', '')}-${Date.now().toString(36).slice(-3)}`;
      studioPassages.push({
        id: pid,
        fromSpaceId: rc.id,
        toSpaceId: targetId,
        directionality: dir,
        traverseCost: (targetRc && targetRc.floorId !== rc.floorId) ? 'Climb' : 'Walk',
        door: { id: `door-${pid}`, type: targetId === 'space-exterior' ? 'EMLockDoor' : 'StandardDoor', isLocked: true }
      });
      renderSpacePassagesEditor();
      updateCodeView();
      playSfx('click');
    }

    function deletePassage(passageId) {
      const idx = studioPassages.findIndex(p => p.id === passageId);
      if (idx < 0) return;
      studioPassages.splice(idx, 1);
      renderSpacePassagesEditor();
      updateCodeView();
      playSfx('click');
    }

    function addNewSpace() {
      const curRc = ROOM_CONFIGS[currentRoomIdx] || ROOM_CONFIGS[0];
      const floorId = curRc.floorId || '1f';
      const floorHeight = floorId === '2f' ? 2.6 : 0.0;
      const newIdx = ROOM_CONFIGS.length;
      const sameFloor = ROOM_CONFIGS.filter(r => r.floorId === floorId);
      const maxX = sameFloor.reduce((m, r) => Math.max(m, r.worldX + r.w), 0);
      const uniqueNum = newIdx + 1;
      let newId = `space-r${uniqueNum}`;
      while (ROOM_CONFIGS.some(r => r.id === newId)) newId = `space-r${uniqueNum}-${Date.now().toString(36).slice(-3)}`;
      const newRoom = {
        idx: newIdx,
        id: newId,
        floorId,
        shortName: `제${uniqueNum}방: ${floorId.toUpperCase()} 새 공간`,
        fullName: `제${uniqueNum}방: ${floorId.toUpperCase()} 사용자 정의 방`,
        layerLabel: floorId === '2f' ? '2F 상층 (+2.6m)' : '1F 지상',
        floorHeight,
        wallHeight: 2.6,
        w: 6.0, h: 5.0,
        worldX: Math.min(maxX, 24.0), worldZ: 6.0,
        hasWestDoor: true, hasEastDoor: false,
        materials: { wall: 'plaster', floor: 'tile' },
        passageInfo: `TwoWay ➔ ${curRc.shortName}`,
        floorColor: 0x1e293b, wallColor: 0x475569, lightColor: 0xe0f2fe,
        atmosphere: '기본 실내 조명',
        doorId: `door-${newId}`
      };
      ROOM_CONFIGS.push(newRoom);
      studioPassages.push({
        id: `pass-${curRc.id.replace('space-', '')}-${newId.replace('space-', '')}`,
        fromSpaceId: curRc.id,
        toSpaceId: newId,
        directionality: 'TwoWay',
        traverseCost: curRc.floorId === newRoom.floorId ? 'Walk' : 'Climb',
        door: { id: newRoom.doorId, type: 'StandardDoor', isLocked: true }
      });
      if (FLOOR_CONFIGS[floorId]) {
        FLOOR_CONFIGS[floorId].totalW = Math.max(FLOOR_CONFIGS[floorId].totalW, newRoom.worldX + newRoom.w + 2);
        FLOOR_CONFIGS[floorId].totalH = Math.max(FLOOR_CONFIGS[floorId].totalH, newRoom.worldZ + newRoom.h + 2);
      }
      switchRoom(newIdx);
      setCadViewMode('floor');
      rebuild3DRoom();
      renderRoomSidebarAndProgress();
      syncSpaceEditorUI();
      updateCodeView();
      showDirectorWhisper(`새 방 '${newRoom.shortName}'을 추가하고 ${curRc.shortName}과 통로로 연결했습니다.`);
    }

    function deleteCurrentSpace() {
      if (ROOM_CONFIGS.length <= 1) {
        showDirectorWhisper('최소 1개 이상의 공간(Space)은 유지해야 합니다.');
        return;
      }
      const delIdx = currentRoomIdx;
      const removed = ROOM_CONFIGS.splice(delIdx, 1)[0];
      ROOM_CONFIGS.forEach((r, i) => { r.idx = i; });

      // Remove objects in deleted room & shift higher roomIdx down cleanly
      const removedObjIds = new Set();
      for (let i = studioObjects.length - 1; i >= 0; i--) {
        if (studioObjects[i].roomIdx === delIdx) {
          removedObjIds.add(studioObjects[i].id);
          studioObjects.splice(i, 1);
        } else if (studioObjects[i].roomIdx > delIdx) {
          studioObjects[i].roomIdx -= 1;
        }
      }
      studioObjects.forEach(o => {
        if (o.requiresSolvedId && removedObjIds.has(o.requiresSolvedId)) o.requiresSolvedId = null;
        if (typeof o.nextRoomIdx === 'number') {
          if (o.nextRoomIdx === delIdx) o.nextRoomIdx = -1;
          else if (o.nextRoomIdx > delIdx) o.nextRoomIdx -= 1;
        }
      });

      // Remove passages referencing deleted space
      for (let i = studioPassages.length - 1; i >= 0; i--) {
        if (studioPassages[i].fromSpaceId === removed.id || studioPassages[i].toSpaceId === removed.id) {
          studioPassages.splice(i, 1);
        }
      }

      const nextIdx = Math.min(delIdx, ROOM_CONFIGS.length - 1);
      currentRoomIdx = -1; // force switchRoom refresh
      switchRoom(nextIdx, true);
      rebuild3DRoom();
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      syncSpaceEditorUI();
      if (typeof renderAuthorItemsAndDirectorUI === 'function') renderAuthorItemsAndDirectorUI();
      updateCodeView();
      showDirectorWhisper(`[방 삭제 완료] '${removed.shortName}'과 소속 기물(${removedObjIds.size}개)·연결 통로를 정리했습니다.`);
    }

    // -------------------------------------------------------------
    // 7. THREE.JS 3D ENGINE (ROOM-ISOLATED HIGH-DETAIL RENDERING)
    // -------------------------------------------------------------
    let scene, camera, renderer, orbitControls, spotLight, ambientLight, hemiLight, flashlight, gridHelper;
    let craftBuilder = null;
    let currentFloorMesh, currentWallGroup;
    const meshMap = new Map();
    let cameraMode = 'orbit';

    // Realistic Human Walking Camera Motion State (Head bobbing + footstep sync)
    let walkBobPhase = 0;
    let currentBobY = 0;
    let currentSwayX = 0;
    let currentTiltZ = 0;

    const SAFE_ROOM_SPAWNS = [
      { x: 3.0, y: 1.5, z: 2.5 },   // Room 0 (1F 접수처 중앙)
      { x: 12.25, y: 1.5, z: 2.5 }, // Room 1 (1F 진료실 중앙)
      { x: 19.0, y: 1.5, z: 2.5 },  // Room 2 (1F 격리병동 중앙)
      { x: 19.0, y: 4.1, z: 2.5 },  // Room 3 (2F 영안실 중앙)
      { x: 9.25, y: 4.1, z: 2.5 },  // Room 4 (2F 원장실 중앙)
      { x: 3.0, y: 4.1, z: 2.5 }    // Room 5 (2F 소각로 중앙)
    ];

    const fpsState = {
      pos: new THREE.Vector3(1.8, 1.5, 2.2),
      yaw: 0,
      pitch: -0.1,
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      speed: 3.5
    };
    let fpsFootstepDistance = 0;
    let scareSilhouetteGroup = null;

    function buildScareSilhouetteMesh() {
      const group = new THREE.Group();
      group.name = "scareSilhouetteGroup";

      // 1. Shadow Humanoid Torso (Ultra-dark silhouette)
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x020204, depthWrite: true });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.15, 0.22), bodyMat);
      torso.position.y = 1.05;

      // 2. Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), bodyMat);
      head.position.y = 1.78;

      // 3. Piercing Blood-Red Glowing Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      leftEye.position.set(-0.065, 1.80, 0.16);
      const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      rightEye.position.set(0.065, 1.80, 0.16);

      // 4. Elongated Horror Limbs (Asymmetrical Creepy Reach)
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.09), bodyMat);
      leftArm.position.set(-0.34, 0.90, 0.06);
      leftArm.rotation.z = 0.15;
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.09), bodyMat);
      rightArm.position.set(0.34, 0.90, 0.06);
      rightArm.rotation.z = -0.15;

      // 5. Shadow Legs
      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.14), bodyMat);
      leftLeg.position.set(-0.14, 0.39, 0);
      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.14), bodyMat);
      rightLeg.position.set(0.14, 0.39, 0);

      group.add(torso, head, leftEye, rightEye, leftArm, rightArm, leftLeg, rightLeg);
      group.visible = false;
      return group;
    }

    function triggerJumpScare() {
      if (!scareSilhouetteGroup || !camera) return;

      // 1인칭 및 3D 시점 카메라 정면 2.4m 앞에 실루엣 순간 워프
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();

      const spawnPos = camera.position.clone().add(forward.clone().multiplyScalar(2.4));
      const rc = ROOM_CONFIGS[currentRoomIdx];
      spawnPos.y = (cameraMode === 'fps') ? (camera.position.y - 1.55) : (rc ? (rc.floorHeight || 0) : 0);

      scareSilhouetteGroup.position.copy(spawnPos);
      scareSilhouetteGroup.lookAt(camera.position.x, spawnPos.y + 1.2, camera.position.z);
      scareSilhouetteGroup.visible = true;

      playSfx('scare');
      triggerBloodVignette();

      // 0.85초 후 실루엣 소멸
      setTimeout(() => {
        if (scareSilhouetteGroup) scareSilhouetteGroup.visible = false;
      }, 850);
    }

    function triggerBloodVignette() {
      const v = document.getElementById('blood-vignette');
      if (!v) return;
      v.classList.remove('blood-pulsing');
      void v.offsetWidth; // Reflow trigger
      v.classList.add('blood-pulsing');
    }

    let sceneDirty = true;
    function markSceneDirty() {
      sceneDirty = true;
    }

    function syncShadowMapAutoUpdate() {
      if (!renderer) return;
      const needsShadows = !!(flashlight && flashlight.intensity > 0 && flashlight.castShadow);
      renderer.shadowMap.autoUpdate = needsShadows;
      if (needsShadows) renderer.shadowMap.needsUpdate = true;
    }

    function updateRoomVisibilityCulling() {
      if (!unifiedBuildingGroup) return;
      const isFps = (cameraMode === 'fps');
      const rcCurrent = ROOM_CONFIGS[currentRoomIdx] || ROOM_CONFIGS[0];

      if (!isFps) {
        for (let i = 0; i < ROOM_CONFIGS.length; i++) {
          const rc = ROOM_CONFIGS[i];
          const rg = unifiedBuildingGroup.getObjectByName(`roomGroup_${rc.idx}`);
          if (rg) {
            rg.visible = !(!showAllFloorsInOrbit && rcCurrent && rc.floorHeight > rcCurrent.floorHeight + 0.1);
          }
        }
        const c1 = unifiedBuildingGroup.getObjectByName('corridorGroup_1f');
        if (c1) c1.visible = true;
        const c2 = unifiedBuildingGroup.getObjectByName('corridorGroup_2f');
        if (c2) c2.visible = !(!showAllFloorsInOrbit && rcCurrent && rcCurrent.floorHeight < 2.0);
        const st = unifiedBuildingGroup.getObjectByName('realStairwell_1f_2f');
        if (st) st.visible = true;
        markSceneDirty();
        return;
      }

      // FPS Portal/Adjacency Culling: keep current room + directly connected passages + adjacent index (|idx - cur| <= 1)
      const visibleSet = new Set([currentRoomIdx]);
      if (currentRoomIdx - 1 >= 0) visibleSet.add(currentRoomIdx - 1);
      if (currentRoomIdx + 1 < ROOM_CONFIGS.length) visibleSet.add(currentRoomIdx + 1);

      const spaceIdToIdx = new Map();
      for (let i = 0; i < ROOM_CONFIGS.length; i++) {
        spaceIdToIdx.set(ROOM_CONFIGS[i].id, ROOM_CONFIGS[i].idx);
      }
      const curSpaceId = rcCurrent ? rcCurrent.id : null;
      if (curSpaceId && Array.isArray(studioPassages)) {
        for (let i = 0; i < studioPassages.length; i++) {
          const p = studioPassages[i];
          if (p.fromSpaceId === curSpaceId && spaceIdToIdx.has(p.toSpaceId)) {
            visibleSet.add(spaceIdToIdx.get(p.toSpaceId));
          } else if (p.toSpaceId === curSpaceId && spaceIdToIdx.has(p.fromSpaceId)) {
            visibleSet.add(spaceIdToIdx.get(p.fromSpaceId));
          }
        }
      }

      for (let i = 0; i < ROOM_CONFIGS.length; i++) {
        const rc = ROOM_CONFIGS[i];
        const rg = unifiedBuildingGroup.getObjectByName(`roomGroup_${rc.idx}`);
        if (rg) rg.visible = visibleSet.has(rc.idx);
      }
      const c1 = unifiedBuildingGroup.getObjectByName('corridorGroup_1f');
      if (c1) c1.visible = visibleSet.has(0) || visibleSet.has(1);
      const c2 = unifiedBuildingGroup.getObjectByName('corridorGroup_2f');
      if (c2) c2.visible = visibleSet.has(3) || visibleSet.has(4);
      const st = unifiedBuildingGroup.getObjectByName('realStairwell_1f_2f');
      if (st) st.visible = visibleSet.has(2) || visibleSet.has(3);
      markSceneDirty();
    }

    function initThree() {
      const container = document.getElementById('three-container');
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 300;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x090d16);

      camera = new THREE.PerspectiveCamera(50, w / h, 0.15, 100);
      camera.position.set(roomW / 2, 6.2, 7.2);

      renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      container.appendChild(renderer.domElement);

      // Subtle IBL Environment Reflection (RoomEnvironment via PMREMGenerator)
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      scene.environmentIntensity = 0.18;
      pmremGenerator.dispose();

      orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.enableRotate = true;  // ★ 마우스 드래그로 3D 공간 시점(회전) 변경 활성화
      orbitControls.rotateSpeed = 0.85;
      orbitControls.enablePan = false;    // 화면 이동은 키보드 WASD로 전담
      orbitControls.enableZoom = true;    // 휠 줌 허용
      orbitControls.maxPolarAngle = Math.PI / 2 + 0.05;
      orbitControls.target.set(roomW / 2, 1.2, roomH / 2);
      orbitControls.addEventListener('change', markSceneDirty);

      // Minimized global ambient wash (True horror atmosphere; fixtures illuminate rooms)
      ambientLight = new THREE.AmbientLight(0xdbeafe, 0.14);
      scene.add(ambientLight);

      // Subtle low-intensity hemisphere fill
      hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.14);
      scene.add(hemiLight);

      // Flat global spotLight removed in favor of real physical fixtures!
      spotLight = null;

      // Fixed Light Pool (4 Point + 4 Spot permanently mounted -> 0 shader recompiles)
      initLightPool(scene);

      // Flashlight aims straight ahead of camera (Real-time horror shadows ONLY on FPS flashlight)
      flashlight = new THREE.SpotLight(0xfff4e0, 22, 22, Math.PI / 5.8, 0.48, 1.4);
      flashlight.castShadow = false;
      flashlight.shadow.mapSize.set(1024, 1024);
      flashlight.shadow.bias = -0.0005;
      flashlight.shadow.normalBias = 0.02;
      flashlight.shadow.camera.near = 0.2;
      flashlight.shadow.camera.far = 16;
      const flashlightTarget = new THREE.Object3D();
      flashlightTarget.position.set(0, 0, -5);
      camera.add(flashlight);
      camera.add(flashlightTarget);
      flashlight.position.set(0, 0, 0);
      flashlight.target = flashlightTarget;
      scene.add(camera);
      syncShadowMapAutoUpdate();

      // Horror Jump Scare Shadow Silhouette
      scareSilhouetteGroup = buildScareSilhouetteMesh();
      scene.add(scareSilhouetteGroup);

      // GridHelper removed to completely eliminate Z-fighting against ground floor slab
      rebuild3DRoom();
      rebuild3DObjectsForCurrentRoom();

      const resizeObserver = new ResizeObserver(() => onResizeThree());
      resizeObserver.observe(container);

      // 3D Raycast Click -> Select & Open Puzzle Modal
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let isDraggingOrbit = false;
      let mouseDownPos = { x: 0, y: 0 };
      let isMouseDown = false;
      let lastMouseX = 0, lastMouseY = 0;

      renderer.domElement.addEventListener('mousedown', (e) => {
        if (isAnyModalOpen()) return;
        markSceneDirty();
        isMouseDown = true;
        mouseDownPos = { x: e.clientX, y: e.clientY };
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        isDraggingOrbit = false;
      });

      window.addEventListener('mouseup', () => { isMouseDown = false; });

      // Robust Helper: extract objId from raycast hits (checking descendants & ancestors)
      function getHitObjectId(hits) {
        if (!hits || hits.length === 0) return null;
        for (const hit of hits) {
          let cur = hit.object;
          while (cur && cur !== scene) {
            if (cur.userData && cur.userData.objId) return cur.userData.objId;
            cur = cur.parent;
          }
        }
        return null;
      }

      // Initialize CraftBuilder Controller
      craftBuilder = new CraftBuilder({
        scene,
        camera,
        renderer,
        getRoomConfigs: () => ROOM_CONFIGS,
        getCurrentRoomConfig: () => ROOM_CONFIGS[currentRoomIdx],
        getCurrentRoomIdx: () => currentRoomIdx,
        getStudioObjects: () => studioObjects,
        getStudioMode: () => studioMode,
        meshMap,
        getHitObjectId,
        getPropOntology: () => PROP_ONTOLOGY,
        carriedIds,
        deletePropById,
        isWallDoorObj,
        getWallDoorInfo,
        releaseNaturalOpening,
        getObjectRotation: (o) => { const r = ROOM_CONFIGS[o.roomIdx] || ROOM_CONFIGS[0]; return getNaturalObjectRotation(o, r.w, r.h); },
        selectObject,
        get selectedObjectId() { return selectedObjectId; },
        deleteSelectedObject,
        deleteObjectById,
        rebuild3DRoom,
        render2DCadObjects,
        renderRoomSidebarAndProgress,
        updateInspectorValues,
        updateCodeView,
        scheduleStudioAutosave,
        playSfx,
        showDirectorWhisper,
        setCameraMode,
        setViewLayout,
        ambientLight,
        hemiLight,
        flashlight,
        setFpsLightingMultiplier
      });
      window.craftBuilder = craftBuilder;

      renderer.domElement.addEventListener('contextmenu', (e) => {
        if (studioMode === 'author' && craftBuilder && craftBuilder.isActive()) {
          e.preventDefault();
          craftBuilder.onRightClick();
        }
      });

      renderer.domElement.addEventListener('wheel', (e) => {
        markSceneDirty();
        if (studioMode === 'author' && craftBuilder && craftBuilder.isActive()) {
          craftBuilder.rotateGhost(e.deltaY > 0 ? 1 : -1);
          e.preventDefault();
        }
      }, { passive: false });

      // Craft Builder: short click = place, long press (hold) = pick up aimed object
      renderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || isAnyModalOpen()) return;
        if (studioMode === 'author' && craftBuilder && craftBuilder.isActive()) craftBuilder.onPointerDown();
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        if (craftBuilder && craftBuilder.isActive()) craftBuilder.onPointerUp();
      });

      // PointerLock & Raycast Click Binding (With Drag Detection to Prevent Accidental Clicks)
      renderer.domElement.addEventListener('click', (e) => {
        // If any puzzle or victory modal is open, completely ignore canvas clicks
        if (isAnyModalOpen()) return;

        // If Craft Builder mode is active, forward click to craft builder!
        if (studioMode === 'author' && craftBuilder && craftBuilder.isActive()) return; // handled by mousedown/mouseup (click vs long-press)

        // If mouse moved significantly between mousedown and click, consider it an intentional camera rotation drag
        const moveDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (moveDist > 16) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (cameraMode === 'fps') {
          // If not pointer locked, this click is strictly for engaging 1st-person control (NEVER trigger puzzle modal!)
          if (document.pointerLockElement !== renderer.domElement) {
            try {
              const p = renderer.domElement.requestPointerLock?.();
              if (p && p.catch) p.catch(() => {});
            } catch (e) {}
            return; // ★ 퍼즐 모달 오작동 방지: 즉시 리턴
          }

          // If already pointer locked, interact strictly through the center crosshair aim
          handleFpsInteraction();
          return;
        }

        // Orbit Mode: Raycast at mouse position
        raycaster.setFromCamera(mouse, camera);
        const hitables = Array.from(meshMap.values());
        const hits = raycaster.intersectObjects(hitables, true);
        const hitId = getHitObjectId(hits);
        if (hitId) {
          selectObject(hitId);
          openLockModalForObject(hitId);
        }
      });

      // Pointer Lock Change Status (Syncs cursor visibility and crosshair to prevent cursor misalignment)
      document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement && craftBuilder && craftBuilder.isActive() && craftBuilder.isCarrying() && !craftBuilder.isCatalogOpen()) {
          craftBuilder.cancelPickup(); // ESC while carrying returns the item to its original position
        }
        const hud = document.getElementById('pointerlock-hud');
        const crosshair = document.getElementById('fps-crosshair');

        if (document.pointerLockElement === renderer.domElement) {
          if (cameraMode === 'fps' && crosshair) crosshair.classList.remove('hidden');
          renderer.domElement.style.cursor = 'none';
          if (hud) {
            hud.className = "absolute top-10 right-3 bg-slate-950/90 border border-emerald-500/60 text-emerald-300 px-2.5 py-1 rounded text-[10px] font-mono z-20 flex items-center gap-1.5 pointer-events-none";
            hud.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span>🔒 FPS 시점 고정 활성 (ESC로 커서 해제)</span>';
            hud.classList.remove('hidden');
          }
        } else {
          // When pointer lock is released, hide center crosshair so only actual system mouse cursor is visible!
          if (crosshair) crosshair.classList.add('hidden');
          renderer.domElement.style.cursor = 'grab';
          if (hud && cameraMode === 'fps') {
            hud.className = "absolute top-10 right-3 bg-slate-950/90 border border-amber-500/60 text-amber-300 px-2.5 py-1 rounded text-[10px] font-mono z-20 flex items-center gap-1.5 pointer-events-none";
            hud.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>👆 화면 클릭: 1인칭 락 | 드래그: 시점 회전</span>';
            hud.classList.remove('hidden');
          } else if (hud) {
            hud.classList.add('hidden');
          }
        }
      });

      // Grounded FPS Mouse Look (Only rotates when pointer locked; drag rotation disabled to preserve fixed viewpoint)
      renderer.domElement.addEventListener('mousemove', (e) => {
        // FREEZE 3D camera completely when solving puzzles in modal!
        if (isAnyModalOpen()) return;

        if (Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y) > 4) {
          isDraggingOrbit = true;
        }

        if (cameraMode === 'fps') {
          if (document.pointerLockElement === renderer.domElement) {
            fpsState.yaw -= e.movementX * 0.0028;
            fpsState.pitch -= e.movementY * 0.0028;
            fpsState.pitch = Math.max(-1.4, Math.min(1.4, fpsState.pitch));
          } else if (isMouseDown) {
            // Drag rotation fallback when pointer lock is released
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            fpsState.yaw -= dx * 0.0035;
            fpsState.pitch = Math.max(-1.4, Math.min(1.4, fpsState.pitch - dy * 0.0035));
          }
        }
      });

      renderer.domElement.addEventListener('mouseleave', () => {
        isMouseDown = false;
      });

      // WASD Walk & ESC Modal Close (FROZEN when modal is open)
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.code === 'Escape') {
          const lockModal = document.getElementById('lock-modal');
          const victoryModal = document.getElementById('victory-modal');
          const importModal = document.getElementById('import-modal');
          let handled = false;
          if (lockModal && !lockModal.classList.contains('hidden')) {
            closeLockModal();
            handled = true;
          }
          if (victoryModal && !victoryModal.classList.contains('hidden')) {
            victoryModal.classList.add('hidden');
            handled = true;
          }
          if (importModal && !importModal.classList.contains('hidden')) {
            importModal.classList.add('hidden');
            handled = true;
          }
          if (craftBuilder && craftBuilder.isCatalogOpen()) {
            craftBuilder.closeCatalog();
            handled = true;
          } else if (craftBuilder && craftBuilder.isActive() && craftBuilder.isCarrying()) {
            craftBuilder.cancelPickup();
            handled = true;
          }
          if (handled) {
            e.preventDefault();
            return;
          }
        }

        // Tab: Craft Catalog modal (Creator / Craft mode)
        if ((e.code === 'Tab' || e.key === 'Tab') && studioMode === 'author' && craftBuilder) {
          const tn = e.target && e.target.tagName;
          const typing = tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA';
          const ae = document.activeElement;
          const free = !ae || ae === document.body || ae === renderer.domElement;
          const otherModal = isAnyModalOpen() && !craftBuilder.isCatalogOpen();
          if (!typing && !otherModal && (craftBuilder.isActive() || craftBuilder.isCatalogOpen() || free)) {
            craftBuilder.toggleCatalog();
            e.preventDefault();
            return;
          }
        }

        // When solving puzzle in modal, completely block 3D walk movement
        if (isAnyModalOpen()) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        const code = e.code;
        const key = e.key ? e.key.toLowerCase() : '';

        // Craft Builder Key Controls (Exclusive to Author Mode)
        if (studioMode === 'author') {
          if (code === 'KeyB' || key === 'b' || key === 'ㅠ') {
            if (craftBuilder) {
              craftBuilder.toggle();
              e.preventDefault();
              return;
            }
          }
          if (craftBuilder && craftBuilder.isActive()) {
            if (code === 'Digit1' || key === '1') { craftBuilder.selectSlot(1); e.preventDefault(); return; }
            if (code === 'Digit2' || key === '2') { craftBuilder.selectSlot(2); e.preventDefault(); return; }
            if (code === 'Digit3' || key === '3') { craftBuilder.selectSlot(3); e.preventDefault(); return; }
            if (code === 'Digit4' || key === '4') { craftBuilder.selectSlot(4); e.preventDefault(); return; }
            if (code === 'Digit5' || key === '5') { craftBuilder.selectSlot(5); e.preventDefault(); return; }
            if (code === 'KeyR' || key === 'r' || key === 'ㄱ') { craftBuilder.rotateGhost(1); e.preventDefault(); return; }
            if (code === 'KeyX' || key === 'x' || key === 'ㅌ') { craftBuilder.onRightClick(); e.preventDefault(); return; }
            if (code === 'Delete' || key === 'delete') { craftBuilder.onDelete(); e.preventDefault(); return; }
          }
        }

        if (code === 'KeyW' || key === 'w' || key === 'ㅈ' || key === 'arrowup') { fpsState.moveForward = true; e.preventDefault(); }
        if (code === 'KeyS' || key === 's' || key === 'ㄴ' || key === 'arrowdown') { fpsState.moveBackward = true; e.preventDefault(); }
        if (code === 'KeyA' || key === 'a' || key === 'ㅁ' || key === 'arrowleft') { fpsState.moveLeft = true; e.preventDefault(); }
        if (code === 'KeyD' || key === 'd' || key === 'ㅇ' || key === 'arrowright') { fpsState.moveRight = true; e.preventDefault(); }
        if (code === 'KeyE' || key === 'e' || key === 'ㄷ') handleFpsInteraction();
      });

      window.addEventListener('keyup', (e) => {
        if (isAnyModalOpen()) {
          fpsState.moveForward = false;
          fpsState.moveBackward = false;
          fpsState.moveLeft = false;
          fpsState.moveRight = false;
          return;
        }
        const code = e.code;
        const key = e.key ? e.key.toLowerCase() : '';

        if (code === 'KeyW' || key === 'w' || key === 'ㅈ' || key === 'arrowup') fpsState.moveForward = false;
        if (code === 'KeyS' || key === 's' || key === 'ㄴ' || key === 'arrowdown') fpsState.moveBackward = false;
        if (code === 'KeyA' || key === 'a' || key === 'ㅁ' || key === 'arrowleft') fpsState.moveLeft = false;
        if (code === 'KeyD' || key === 'd' || key === 'ㅇ' || key === 'arrowright') fpsState.moveRight = false;
      });

      // Keyboard WASD Pan Navigation for 3D Viewport (Zero Mouse Distortion)
      function updateOrbitPanMovement(dt) {
        if (!orbitControls || isAnyModalOpen()) return;
        if (!fpsState.moveForward && !fpsState.moveBackward && !fpsState.moveLeft && !fpsState.moveRight) return;

        const panSpeed = 9.0 * dt;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
        else forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const delta = new THREE.Vector3();
        if (fpsState.moveForward) delta.add(forward);
        if (fpsState.moveBackward) delta.sub(forward);
        if (fpsState.moveLeft) delta.sub(right);
        if (fpsState.moveRight) delta.add(right);

        if (delta.lengthSq() > 0.0001) {
          delta.normalize().multiplyScalar(panSpeed);
          camera.position.add(delta);
          orbitControls.target.add(delta);
          updateCurrentRoomFromWorldPos(orbitControls.target.x, orbitControls.target.z, orbitControls.target.y);
          markSceneDirty();
        }
      }

      let lastTime = performance.now();
      let renderCallCount = 0;
      window.__getRenderCallCount = () => renderCallCount;
      function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const pane3D = document.getElementById('pane-3d');
        if (document.hidden || currentViewLayout === '2d-only' || currentViewLayout === 'logic' || (pane3D && pane3D.classList.contains('hidden'))) {
          lastTime = now;
          return;
        }
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        const builderActive = !!(craftBuilder && craftBuilder.isActive());

        if (cameraMode === 'orbit') {
          updateOrbitPanMovement(dt);
          orbitControls.update();
          if (builderActive) craftBuilder.update(dt);
          const hasLightAnim = hasActiveLightingAnimation(now);
          if (!sceneDirty && !isCinematicTransitioning && !hasLightAnim && !builderActive) {
            return;
          }
          updateLightFixtures(now / 1000, orbitControls.target, currentRoomIdx, false);
          sceneDirty = false;
          renderCallCount++;
          renderer.render(scene, camera);
        } else {
          updateFpsMovement(dt);
          if (builderActive) craftBuilder.update(dt);
          updateLightFixtures(now / 1000, camera.position, currentRoomIdx, true);
          sceneDirty = false;
          renderCallCount++;
          renderer.render(scene, camera);
        }
      }
      animate();
    }

    function onResizeThree() {
      const container = document.getElementById('three-container');
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      markSceneDirty();
    }

    window.addEventListener('resize', () => {
      onResizeThree();
      autoAdjustSidebars();
    });

    // -------------------------------------------------------------
    // 7. THREE.JS 3D UNIFIED ARCHITECTURE & CINEMATIC TRANSITIONS
    // -------------------------------------------------------------
    let isCinematicTransitioning = false;

    // Procedural 512x512 4-Map PBR Texture Pack Generators (Albedo + Sobel NormalMap + RoughnessMap + AOMap, Cached)
// (PBR procedural generators extracted to src/pbr.js)
    let unifiedBuildingGroup = null;

    function createCorridorPropMesh(p) {
      const pGroup = new THREE.Group();
      const rustPbr = getPbrTexturePack('rustedMetal');
      const steelPbr = getPbrTexturePack('surgicalSteel');
      const frameM = new THREE.MeshStandardMaterial({ color: 0x475569, map: rustPbr.map, bumpMap: rustPbr.bumpMap, bumpScale: 0.005, metalness: 0.6, roughness: 0.5 });
      const chromeM = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, map: steelPbr.map, metalness: 0.85, roughness: 0.25 });

      if (p.type === 'wheelchair') {
        const seat = new THREE.Mesh(getBoxGeo(0.55, 0.08, 0.5), frameM);
        seat.position.y = 0.45;
        const back = new THREE.Mesh(getBoxGeo(0.55, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
        back.position.set(0, 0.7, -0.22);
        const wGeo = getCylGeo(0.28, 0.28, 0.04, 20);
        const wL = new THREE.Mesh(wGeo, chromeM); wL.rotation.z = Math.PI / 2; wL.position.set(-0.3, 0.3, 0);
        const wR = new THREE.Mesh(wGeo, chromeM); wR.rotation.z = Math.PI / 2; wR.position.set(0.3, 0.3, 0);
        pGroup.add(seat, back, wL, wR);
      } else if (p.type === 'exit-sign') {
        const casing = new THREE.Mesh(getBoxGeo(0.54, 0.26, 0.08), frameM);
        casing.position.y = 2.3;
        const signMesh = new THREE.Mesh(
          getBoxGeo(0.48, 0.20, 0.09),
          new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 1.0 })
        );
        signMesh.position.y = 2.3;
        pGroup.add(casing, signMesh);
      } else if (p.type === 'iv-stand') {
        const base = new THREE.Mesh(getCylGeo(0.22, 0.24, 0.04, 12), chromeM);
        base.position.y = 0.02;
        const pole = new THREE.Mesh(getCylGeo(0.018, 0.018, 1.7, 10), chromeM);
        pole.position.y = 0.85;
        const pack = new THREE.Mesh(getBoxGeo(0.14, 0.22, 0.08), new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.75, roughness: 0.2 }));
        pack.position.set(0.12, 1.5, 0);
        pGroup.add(base, pole, pack);
      } else if (p.type === 'sample-shelf') {
        // Realistic Steel Lab Specimen Rack (Replaces purple block!)
        [[-0.24, -0.36], [0.24, -0.36], [-0.24, 0.36], [0.24, 0.36]].forEach(([px, pz]) => {
          const post = new THREE.Mesh(getBoxGeo(0.035, 1.45, 0.035), frameM);
          post.position.set(px, 0.725, pz);
          pGroup.add(post);
        });
        [0.15, 0.60, 1.05, 1.42].forEach(sy => {
          const tray = new THREE.Mesh(getBoxGeo(0.50, 0.03, 0.74), frameM);
          tray.position.y = sy;
          pGroup.add(tray);
        });
        const jarMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x047857, emissiveIntensity: 0.4, transparent: true, opacity: 0.78, roughness: 0.15 });
        [-0.20, 0, 0.20].forEach(jz => {
          const jar = new THREE.Mesh(getCylGeo(0.06, 0.06, 0.24, 14), jarMat);
          jar.position.set(0, 1.19, jz);
          pGroup.add(jar);
        });
      } else {
        // Grounded Red Fire Extinguisher (Replaces floating orange cylinder!)
        const tank = new THREE.Mesh(
          getCylGeo(0.085, 0.085, 0.52, 18),
          new THREE.MeshStandardMaterial({ color: 0x991b1b, map: rustPbr.map, metalness: 0.45, roughness: 0.38 })
        );
        tank.position.y = 0.26;
        const neck = new THREE.Mesh(getCylGeo(0.025, 0.04, 0.08, 12), chromeM);
        neck.position.y = 0.56;
        const nozzle = new THREE.Mesh(getBoxGeo(0.12, 0.025, 0.025), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 }));
        nozzle.position.set(0.05, 0.58, 0);
        pGroup.add(tank, neck, nozzle);
      }
      const _tmpSz = new THREE.Vector3();
      pGroup.traverse(c => {
        if (c.isMesh) {
          c.receiveShadow = true;
          if (c.geometry) {
            if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
            c.geometry.boundingBox.getSize(_tmpSz);
            c.castShadow = Math.max(_tmpSz.x, _tmpSz.y, _tmpSz.z) >= 0.28;
          }
        }
      });
      return pGroup;
    }

    let showAllFloorsInOrbit = true;
    function toggleOrbitAllFloors() {
      showAllFloorsInOrbit = !showAllFloorsInOrbit;
      const btn = document.getElementById('btn-orbit-floor-cutaway');
      if (btn) {
        btn.textContent = showAllFloorsInOrbit ? '전체 층 보기' : '현재 층만 보기';
        btn.className = showAllFloorsInOrbit
          ? 'px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-[11px] font-medium text-zinc-200 transition-colors'
          : 'px-2 py-0.5 rounded bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 text-[11px] font-medium text-amber-200 transition-colors';
      }
      rebuild3DRoom();
    }

    function markSharedResource(res) {
      res.userData = res.userData || {};
      res.userData.shared = true;
      return res;
    }

    let _sharedArchMats = null;
    function getSharedArchMats() {
      if (_sharedArchMats) return _sharedArchMats;
      _sharedArchMats = {
        ceilMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x0f172a, roughness: 0.95, metalness: 0.1, side: THREE.DoubleSide
        })),
        baseboardMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x0f172a, roughness: 0.8,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        })),
        corniceMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x1e293b, roughness: 0.9,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        })),
        frameMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x0f172a, roughness: 0.85, metalness: 0.4,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        }))
      };
      return _sharedArchMats;
    }

    const LINTEL_WALL_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

    function rebuild3DRoom() {
      if (!scene) return;
      // Preserve live relay ON/OFF state across mid-play rebuilds (e.g. boss door open)
      const prevLightStates = new Map();
      for (let i = 0; i < activeFixtures.length; i++) {
        prevLightStates.set(activeFixtures[i].id, activeFixtures[i].isOn);
      }
      // Dispose detached meshMap entries first, then remove & dispose unifiedBuildingGroup
      for (const m of meshMap.values()) {
        let inUnified = false;
        let p = m.parent;
        while (p) { if (p === unifiedBuildingGroup) { inUnified = true; break; } p = p.parent; }
        if (!inUnified) {
          if (m.parent) m.parent.remove(m);
          else scene.remove(m);
          disposeObject3D(m);
        }
      }
      meshMap.clear();
      if (unifiedBuildingGroup) {
        scene.remove(unifiedBuildingGroup);
        disposeObject3D(unifiedBuildingGroup);
      }
      clearActiveFixtures();

      const { ceilMat, baseboardMat, corniceMat, frameMat } = getSharedArchMats();

      // Inward wall inset (0.02m per room -> 0.04m physical gap between adjacent rooms, zero coplanar Z-fighting)
      const WALL_INSET = 0.02;

      unifiedBuildingGroup = new THREE.Group();
      unifiedBuildingGroup.name = "unifiedBuildingGroup";
      const isFps = (cameraMode === 'fps');
      const wallAlpha = isFps ? 1.0 : 0.45;

      const rcCurrent = ROOM_CONFIGS[currentRoomIdx];
      if (spotLight) spotLight.color.setHex(rcCurrent.lightColor);
      document.getElementById('hud-3d-atmosphere').textContent = `조명: ${rcCurrent.atmosphere}`;

      // 1. Build all 6 Rooms in their World Positions
      ROOM_CONFIGS.forEach(rc => {
        const rGroup = new THREE.Group();
        rGroup.name = `roomGroup_${rc.idx}`;
        rGroup.position.set(rc.worldX, rc.floorHeight, rc.worldZ);
        rGroup.userData = { roomIdx: rc.idx };
        const wh = rc.wallHeight || 2.6;
        const rw = rc.w;
        const rh = rc.h;

        const doorObj = studioObjects.find(o => o.roomIdx === rc.idx && o.isBossDoor);
        const isDoorOpen = doorObj ? doorObj.solved : false;

        // 1-1. Room Floor (Space.materials.floor PBR Ontology)
        const fGeo = getPlaneGeo(rw, rh);
        const concretePbr = getPbrTexturePack('concrete');
        const floorPreset = (rc.materials && rc.materials.floor) || 'tile';
        const floorPbr = floorPreset === 'tile'
          ? { map: getProceduralTileTexture(rc.floorColor, false), normalMap: concretePbr.normalMap, roughnessMap: concretePbr.roughnessMap, aoMap: concretePbr.aoMap }
          : getPbrTexturePack(floorPreset === 'wood' ? 'wood' : floorPreset === 'rustedMetal' ? 'rustedMetal' : 'concrete');
        const fMesh = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({
          color: rc.floorColor, map: floorPbr.map, normalMap: floorPbr.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
          roughnessMap: floorPbr.roughnessMap, aoMap: floorPbr.aoMap, aoMapIntensity: 0.65,
          roughness: floorPreset === 'rustedMetal' ? 0.65 : 0.85, metalness: floorPreset === 'rustedMetal' ? 0.45 : 0.12
        }));
        fMesh.rotation.x = -Math.PI / 2;
        fMesh.position.set(rw / 2, 0.002, rh / 2);
        fMesh.receiveShadow = true;
        rGroup.add(fMesh);

        // 1-1-2. Room Ceiling (Offset slightly below floor above; active in FPS mode only to eliminate Z-fighting)
        const ceilMesh = new THREE.Mesh(fGeo, ceilMat);
        ceilMesh.rotation.x = Math.PI / 2;
        ceilMesh.position.set(rw / 2, wh - 0.04, rh / 2);
        ceilMesh.name = `ceiling_${rc.idx}`;
        ceilMesh.visible = isFps; // Active in 1st-person FPS mode, hidden in top-down orbit to prevent slab collision
        rGroup.add(ceilMesh);

        // 1-2. Moldings (Baseboards & Crown Cornices) with physical normal offset + polygonOffset (zero Z-fighting)
        function addTrim(x1, z1, x2, z2) {
          const len = Math.hypot(x2 - x1, z2 - z1);
          if (len <= 0.04) return;
          const b = new THREE.Mesh(getBoxGeo(len, 0.10, 0.03), baseboardMat);
          b.position.set((x1 + x2) / 2, 0.055, (z1 + z2) / 2);
          b.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
          const c = new THREE.Mesh(getBoxGeo(len, 0.07, 0.045), corniceMat);
          c.position.set((x1 + x2) / 2, wh - 0.085, (z1 + z2) / 2);
          c.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
          rGroup.add(b, c);
        }
        const doorZStart = Math.max(1.0, (rh - 1.2) / 2);
        const doorZMid = doorZStart + 0.6;
        // Wall openings are 100% driven by door objects (+ natural passages not managed by a door object)
        const openings = collectWallOpenings(rc);
        const wallLen = { N: rw, S: rw, W: rh, E: rh };
        function wallSegments(wall) {
          const segs = [];
          let cur = 0;
          openings[wall].slice().sort((p, q) => p.c - q.c).forEach(op => {
            const st = op.c - 0.6;
            if (st > cur + 0.01) segs.push([cur, st]);
            cur = Math.max(cur, op.c + 0.6);
          });
          if (wallLen[wall] > cur + 0.01) segs.push([cur, wallLen[wall]]);
          return segs;
        }
        const TRIM_OFF = WALL_INSET + 0.028; // >= 0.013m clearance from inset wall surface
        const TRIM_CORNER = WALL_INSET + 0.03;
        const clampSeg = (p, q, maxL, pad) => [Math.max(pad, p), Math.min(maxL - pad, q)];
        const segTrim = {
          N: (p, q) => { const [a, b] = clampSeg(p, q, rw, TRIM_CORNER); addTrim(a, TRIM_OFF, b, TRIM_OFF); },
          S: (p, q) => { const [a, b] = clampSeg(p, q, rw, TRIM_CORNER); addTrim(b, rh - TRIM_OFF, a, rh - TRIM_OFF); },
          W: (p, q) => { const [a, b] = clampSeg(p, q, rh, TRIM_CORNER); addTrim(TRIM_OFF, b, TRIM_OFF, a); },
          E: (p, q) => { const [a, b] = clampSeg(p, q, rh, TRIM_CORNER); addTrim(rw - TRIM_OFF, a, rw - TRIM_OFF, b); }
        };
        ['N', 'S', 'W', 'E'].forEach(w => wallSegments(w).forEach(([p, q]) => segTrim[w](p, q)));

        // 1-3. Walls (Space.materials.wall PBR Ontology) — inset inward by WALL_INSET to eliminate adjacent-room Z-fighting
        const wallPreset = (rc.materials && rc.materials.wall) || 'plaster';
        const wallPbrPack = (wallPreset === 'wood' || wallPreset === 'surgicalSteel' || wallPreset === 'concrete')
          ? getPbrTexturePack(wallPreset)
          : concretePbr;
        const wallMap = wallPreset === 'plaster'
          ? getProceduralWallTexture(rc.wallColor)
          : wallPreset === 'tile'
            ? getProceduralTileTexture(rc.wallColor, true)
            : wallPbrPack.map;
        const wMat = new THREE.MeshStandardMaterial({
          color: rc.wallColor, map: wallMap, normalMap: wallPbrPack.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
          roughnessMap: wallPbrPack.roughnessMap, aoMap: wallPbrPack.aoMap, aoMapIntensity: 0.55,
          side: THREE.DoubleSide, roughness: wallPreset === 'surgicalSteel' ? 0.55 : 0.92,
          metalness: wallPreset === 'surgicalSteel' ? 0.35 : 0.05,
          transparent: !isFps, opacity: wallAlpha, depthWrite: isFps
        });

        const segWall = {
          N: (p, q) => { const [a, b] = clampSeg(p, q, rw, WALL_INSET); if (b > a + 0.01) createWallMesh(rGroup, a, WALL_INSET, b, WALL_INSET, wh, 0, wMat); },
          S: (p, q) => { const [a, b] = clampSeg(p, q, rw, WALL_INSET); if (b > a + 0.01) createWallMesh(rGroup, b, rh - WALL_INSET, a, rh - WALL_INSET, wh, 0, wMat); },
          W: (p, q) => { const [a, b] = clampSeg(p, q, rh, WALL_INSET); if (b > a + 0.01) createWallMesh(rGroup, WALL_INSET, b, WALL_INSET, a, wh, 0, wMat); },
          E: (p, q) => { const [a, b] = clampSeg(p, q, rh, WALL_INSET); if (b > a + 0.01) createWallMesh(rGroup, rw - WALL_INSET, a, rw - WALL_INSET, b, wh, 0, wMat); }
        };
        ['N', 'S', 'W', 'E'].forEach(w => wallSegments(w).forEach(([p, q]) => segWall[w](p, q)));

        // Doorway lintel + dark steel architrave for every opening; inset inside room to prevent cross-room coplanar overlap
        let lampPlaced = false;
        ['N', 'S', 'W', 'E'].forEach(w => openings[w].forEach(op => {
          const alongX = (w === 'N' || w === 'S');
          const px = alongX ? op.c : (w === 'W' ? WALL_INSET : rw - WALL_INSET);
          const pz = alongX ? (w === 'N' ? WALL_INSET : rh - WALL_INSET) : op.c;
          const fx = alongX ? op.c : (w === 'W' ? WALL_INSET + 0.024 : rw - WALL_INSET - 0.024);
          const fz = alongX ? (w === 'N' ? WALL_INSET + 0.024 : rh - WALL_INSET - 0.024) : op.c;
          const lo = op.c - 0.6, hi = op.c + 0.6;
          const parts = [];
          if (wh > 2.12) {
            const lintel = new THREE.Mesh(getPlaneGeo(1.2, wh - 2.1), wMat);
            lintel.position.set(px, 2.1 + (wh - 2.1) / 2, pz);
            lintel.rotation.y = LINTEL_WALL_ROT[w];
            lintel.userData.isWallSurface = true;
            lintel.userData.isLintel = true;
            lintel.userData.wallSide = w;
            parts.push(lintel);
          }
          const postGeo = alongX ? getBoxGeo(0.10, 2.14, 0.036) : getBoxGeo(0.036, 2.14, 0.10);
          const postA = new THREE.Mesh(postGeo, frameMat);
          const postB = new THREE.Mesh(postGeo, frameMat);
          const header = new THREE.Mesh(alongX ? getBoxGeo(1.32, 0.10, 0.036) : getBoxGeo(0.036, 0.10, 1.32), frameMat);
          postA.userData.isDoorFrame = true; postA.userData.wallSide = w;
          postB.userData.isDoorFrame = true; postB.userData.wallSide = w;
          header.userData.isDoorFrame = true; header.userData.wallSide = w;
          if (alongX) { postA.position.set(lo, 1.07, fz); postB.position.set(hi, 1.07, fz); }
          else { postA.position.set(fx, 1.07, lo); postB.position.set(fx, 1.07, hi); }
          header.position.set(fx, 2.15, fz);
          parts.push(postA, postB, header);
          if (w === 'E') {
            const lampMat = new THREE.MeshStandardMaterial({
              color: isDoorOpen ? 0x10b981 : 0xef4444,
              emissive: isDoorOpen ? 0x10b981 : 0xef4444,
              emissiveIntensity: 0.8
            });
            const doorLamp = new THREE.Mesh(getBoxGeo(0.08, 0.08, 0.30), lampMat);
            if (!lampPlaced) { doorLamp.name = `doorLamp_${rc.idx}`; lampPlaced = true; }
            doorLamp.position.set(rw - 0.08, 2.26, op.c);
            parts.push(doorLamp);
          }
          rGroup.add(...parts);
        }));

        if (activeThemeId === 'asylum-404' && rc.idx === 2 && openings.E.some(op => Math.abs(op.c - doorZMid) < 0.05)) {
          const q15 = studioObjects.find(o => o.qNum === 15 || o.id === 'prop-r3-15');
          const isQ15Solved = !!(q15 && q15.solved);
          const gateGroup = new THREE.Group();
          gateGroup.name = "security_gate_r2_stairwell";

          const gateFrameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 });
          const ironBarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.3 });

          // Vertical iron bars
          const gateBarGeo = getCylGeo(0.015, 0.015, 2.05, 8);
          for (let b = -0.52; b <= 0.52; b += 0.13) {
            const bar = new THREE.Mesh(gateBarGeo, ironBarMat);
            bar.position.set(0, 1.05, b);
            gateGroup.add(bar);
          }
          // Horizontal steel reinforcing cross-bars
          const hBarLevels = [0.2, 1.05, 1.9];
          const hBarGeo = getBoxGeo(0.05, 0.05, 1.18);
          for (const hy of hBarLevels) {
            const hb = new THREE.Mesh(hBarGeo, gateFrameMat);
            hb.position.set(0, hy, 0);
            gateGroup.add(hb);
          }
          // Electronic magnetic security lock housing + status LED
          const lockBox = new THREE.Mesh(
            getBoxGeo(0.12, 0.28, 0.18),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.4 })
          );
          lockBox.position.set(0, 1.05, 0.25);
          const ledMat = new THREE.MeshStandardMaterial({
            color: isQ15Solved ? 0x10b981 : 0xef4444,
            emissive: isQ15Solved ? 0x10b981 : 0xef4444,
            emissiveIntensity: 1.5
          });
          const led = new THREE.Mesh(getBoxGeo(0.13, 0.04, 0.06), ledMat);
          led.position.set(0, 1.12, 0.25);
          gateGroup.add(lockBox, led);

          // Gate opens / slides aside when Q15 solved, blocks doorway when locked
          if (isQ15Solved) {
            gateGroup.position.set(rw, 0, doorZMid + 1.15);
          } else {
            gateGroup.position.set(rw, 0, doorZMid);
          }
          rGroup.add(gateGroup);
        }


        // Door leaf is rendered exclusively by create3DMeshForObject(doorObj) to prevent double-door overlap & perpendicular clipping

        // 1-4. Interior Concept Partitions for each room
        const roomParts = ROOM_PARTITIONS.filter(p => p.roomIdx === rc.idx);
        roomParts.forEach(part => {
          const pGroup = new THREE.Group();
          const pLen = Math.hypot(part.x2 - part.x1, part.z2 - part.z1);
          const pAng = -Math.atan2(part.z2 - part.z1, part.x2 - part.x1);
          const pMidX = (part.x1 + part.x2) / 2;
          const pMidZ = (part.z1 + part.z2) / 2;

          const partWood = getPbrTexturePack('wood');
          const partRust = getPbrTexturePack('rustedMetal');

          if (part.type === "glass-counter") {
            // Reception glass window partition (Realistic aged wood base + subtle smoked tempered glass, no mint slab!)
            const baseH = 0.90;
            const glassH = part.h - baseH;
            const counterBase = new THREE.Mesh(
              getBoxGeo(pLen, baseH, 0.16),
              new THREE.MeshStandardMaterial({ color: 0x6b4428, map: partWood.map, bumpMap: partWood.bumpMap, bumpScale: 0.015, roughness: 0.72 })
            );
            counterBase.position.y = baseH / 2;
            const glass = new THREE.Mesh(
              getBoxGeo(pLen, glassH, 0.03),
              new THREE.MeshStandardMaterial({ color: 0x475569, transparent: true, opacity: 0.22, roughness: 0.12, metalness: 0.45 })
            );
            glass.position.y = baseH + glassH / 2;
            const postL = new THREE.Mesh(getBoxGeo(0.06, part.h, 0.18), frameMat); postL.position.set(-pLen/2, part.h/2, 0);
            const postR = new THREE.Mesh(getBoxGeo(0.06, part.h, 0.18), frameMat); postR.position.set(pLen/2, part.h/2, 0);
            const topBar = new THREE.Mesh(getBoxGeo(pLen, 0.08, 0.18), frameMat); topBar.position.set(0, part.h - 0.04, 0);
            pGroup.add(counterBase, glass, postL, postR, topBar);
          } else if (part.type === "curtain") {
            // Privacy curtain track
            const rail = new THREE.Mesh(getBoxGeo(pLen, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 }));
            rail.position.y = part.h;
            const fabric = new THREE.Mesh(
              getBoxGeo(pLen, part.h - 0.1, 0.06),
              new THREE.MeshStandardMaterial({ color: 0x9ca3af, map: concretePbr.map, roughness: 0.95, side: THREE.DoubleSide })
            );
            fabric.position.y = (part.h - 0.1) / 2;
            pGroup.add(rail, fabric);
          } else if (part.type === "iron-grate") {
            // High security iron bars
            const railGeo = getBoxGeo(pLen, 0.08, 0.08);
            const topRail = new THREE.Mesh(railGeo, frameMat); topRail.position.y = part.h;
            const btmRail = new THREE.Mesh(railGeo, frameMat); btmRail.position.y = 0.04;
            pGroup.add(topRail, btmRail);
            const barCount = Math.floor(pLen / 0.25);
            const grateBarGeo = getCylGeo(0.02, 0.02, part.h, 8);
            const grateBarMat = new THREE.MeshStandardMaterial({ color: 0x475569, map: partRust.map, metalness: 0.7, roughness: 0.45 });
            for (let b = 0; b <= barCount; b++) {
              const bar = new THREE.Mesh(grateBarGeo, grateBarMat);
              bar.position.set(-pLen / 2 + b * (pLen / barCount), part.h / 2, 0);
              pGroup.add(bar);
            }
          } else if (part.type === "tile-wall") {
            // Morgue ceramic tile divider (Dark weathered hospital tile, no bright mint!)
            const tileWallTex = getProceduralTileTexture(0x2d3a3e, true);
            const tileWall = new THREE.Mesh(
              getBoxGeo(pLen, part.h, 0.20),
              new THREE.MeshStandardMaterial({ color: 0x3b4a4f, map: tileWallTex, bumpMap: concretePbr.bumpMap, bumpScale: 0.008, roughness: 0.45, metalness: 0.15 })
            );
            tileWall.position.y = part.h / 2;
            pGroup.add(tileWall);
          } else if (part.type === "bookshelf-wall") {
            // Archival double-sided wood bookshelf divider (No purple block!)
            const bookWall = new THREE.Mesh(
              getBoxGeo(pLen, part.h, 0.45),
              new THREE.MeshStandardMaterial({ color: 0x5c3a21, map: partWood.map, bumpMap: partWood.bumpMap, bumpScale: 0.015, roughness: 0.78 })
            );
            bookWall.position.y = part.h / 2;
            pGroup.add(bookWall);
          } else {
            // Protective dark steel wire mesh partition (No bright orange slab!)
            const meshFrame = new THREE.Mesh(
              getBoxGeo(pLen, part.h, 0.08),
              new THREE.MeshStandardMaterial({ color: 0x3f4650, map: partRust.map, metalness: 0.7, roughness: 0.55 })
            );
            meshFrame.position.y = part.h / 2;
            pGroup.add(meshFrame);
          }

          pGroup.position.set(pMidX, 0, pMidZ);
          pGroup.rotation.y = pAng;
          rGroup.add(pGroup);
        });

        // 1-5. Prop Ontology Physical Gimmick Carriers (High-Detail PBR & Zero Overlap)
        const propWoodPbr = getPbrTexturePack('wood');
        const roomProps = PROP_ONTOLOGY.filter(p => p.roomIdx === rc.idx);
        roomProps.forEach(prop => {
          if (prop.skipOwnMesh) return;
          if (carriedIds.has(prop.id) || (prop.targetParentId && carriedIds.has(prop.targetParentId))) return; // 집은 기물/그 위의 소품은 숨김 // 괘종시계 본체 등 studioObjects에 이미 전용 3D 메쉬가 있는 경우 중복 생성 방지
          const propMeshGroup = new THREE.Group();
          if (prop.type === "clock") {
            const cFrame = new THREE.Mesh(
              getCylGeo(0.34, 0.34, 0.05, 32),
              new THREE.MeshStandardMaterial({ color: 0x7c4a24, map: propWoodPbr.map, bumpMap: propWoodPbr.bumpMap, bumpScale: 0.02, roughness: 0.6 })
            );
            cFrame.rotation.x = Math.PI / 2;
            const clockFaceTex = getPropDetailTexture('clockFace');
            const cFace = new THREE.Mesh(
              new THREE.CircleGeometry(0.29, 32),
              new THREE.MeshStandardMaterial({ map: clockFaceTex, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
            );
            cFace.position.z = 0.028;
            const hAngle = (prop.gimmick.data.hourAngle || 70) * Math.PI / 180;
            const hourHand = new THREE.Mesh(getBoxGeo(0.018, 0.14, 0.008), frameMat);
            hourHand.position.set(Math.sin(hAngle) * 0.07, Math.cos(hAngle) * 0.07, 0.036);
            hourHand.rotation.z = -hAngle;
            const mAngle = (prop.gimmick.data.minuteAngle || 120) * Math.PI / 180;
            const minHand = new THREE.Mesh(getBoxGeo(0.012, 0.20, 0.008), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4 }));
            minHand.position.set(Math.sin(mAngle) * 0.10, Math.cos(mAngle) * 0.10, 0.042);
            minHand.rotation.z = -mAngle;
            const centerPin = new THREE.Mesh(getCylGeo(0.016, 0.016, 0.014, 12), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 }));
            centerPin.rotation.x = Math.PI / 2;
            centerPin.position.z = 0.044;
            propMeshGroup.add(cFrame, cFace, hourHand, minHand, centerPin);
            const clockZ = (prop.wallSide === 'N') ? Math.max(prop.z || 0.065, WALL_INSET + 0.045) : (prop.z || 0.065);
            propMeshGroup.position.set(prop.x !== undefined ? prop.x : 1.5, prop.y || 1.85, clockZ);
            propMeshGroup.rotation.y = WALL_SIDE_ROT[prop.wallSide] || 0;
          } else if (prop.type === "cup") {
            // Ceramic Coffee Mugs placed cleanly on right front edge of desk (Zero overlap with CRT monitor)
            const angles = prop.gimmick.data.angles || [0, Math.PI / 2, Math.PI, -Math.PI / 2];
            const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.18, metalness: 0.05 });
            const handleMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.22, metalness: 0.08 });
            const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x261207, roughness: 0.12 });
            const mugGeo = getCylGeo(0.038, 0.034, 0.085, 20);
            const coffeeGeo = new THREE.CircleGeometry(0.033, 16);
            const handleGeo = new THREE.TorusGeometry(0.020, 0.006, 8, 16);
            angles.forEach((ang, i) => {
              const mugGroup = new THREE.Group();
              const mug = new THREE.Mesh(mugGeo, ceramicMat);
              mug.position.y = 0.0425;
              const coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
              coffee.rotation.x = -Math.PI / 2;
              coffee.position.y = 0.086;
              const handle = new THREE.Mesh(handleGeo, handleMat);
              handle.position.set(0.040, 0.044, 0);
              mugGroup.add(mug, coffee, handle);
              mugGroup.rotation.y = ang;
              mugGroup.position.set((i % 2) * 0.14, 0, Math.floor(i / 2) * 0.16);
              propMeshGroup.add(mugGroup);
            });
            placeTableProp(propMeshGroup, prop, 0.76);
          } else if (prop.type === "document") {
            // Realistic Medical Chart Clipboard placed cleanly at front center-right of desk
            const clip = new THREE.Mesh(
              getBoxGeo(0.24, 0.012, 0.32),
              new THREE.MeshStandardMaterial({ color: 0x3b2414, map: propWoodPbr.map, roughness: 0.7 })
            );
            const metalClip = new THREE.Mesh(
              getBoxGeo(0.10, 0.018, 0.03),
              new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 })
            );
            metalClip.position.set(0, 0.012, -0.13);
            const docTex = getPropDetailTexture('document');
            const paper = new THREE.Mesh(
              getPlaneGeo(0.20, 0.28),
              new THREE.MeshStandardMaterial({ map: docTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
            );
            paper.rotation.x = -Math.PI / 2;
            paper.position.y = 0.012;
            propMeshGroup.add(clip, metalClip, paper);
            placeTableProp(propMeshGroup, prop, 0.765, 0.01);
          } else if (prop.type === "portrait") {
            const pFrame = new THREE.Mesh(
              getBoxGeo(1.0, 1.2, 0.06),
              new THREE.MeshStandardMaterial({ color: 0x926829, map: propWoodPbr.map, metalness: 0.55, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
            );
            const portTex = getPropDetailTexture('portrait');
            const canvas = new THREE.Mesh(
              getPlaneGeo(0.86, 1.06),
              new THREE.MeshStandardMaterial({ map: portTex, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
            );
            canvas.position.z = 0.034;
            propMeshGroup.add(pFrame, canvas);
            const portZ = (prop.wallSide === 'N') ? Math.max(prop.z || 0.07, WALL_INSET + 0.048) : (prop.z || 0.07);
            propMeshGroup.position.set(prop.x || 4.8, prop.y || 1.7, portZ);
            propMeshGroup.rotation.y = WALL_SIDE_ROT[prop.wallSide] || 0;
          }
          // 소품을 클릭/조사 시 결속된 퍼즐(targetObjId)로 즉시 연결
          if (propMeshGroup.children.length > 0) {
            const ud = { propId: prop.id };
            if (prop.targetObjId) ud.objId = prop.targetObjId;
            propMeshGroup.userData = { ...ud, isOntologyProp: true };
            propMeshGroup.traverse(child => {
              child.userData = { ...child.userData, ...ud };
            });
            meshMap.set(prop.id, propMeshGroup);
          }
          rGroup.add(propMeshGroup);
        });

        // 1-6. 5 Puzzle Objects for this room
        const roomObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
        roomObjs.forEach(obj => {
          if (carriedIds.has(obj.id)) return;
          create3DMeshForObject(obj, rGroup);
        });

        // 1-7. Floor Hole (Room 4: 2F 영안실)
        if (rc.hasHole) {
          const holeGeo = getBoxGeo(rc.holeSize[0], 0.08, rc.holeSize[1]);
          const holeMat = new THREE.MeshStandardMaterial({ color: 0x05070c, emissive: 0x7f1d1d, emissiveIntensity: 0.4 });
          const holeMesh = new THREE.Mesh(holeGeo, holeMat);
          holeMesh.position.set(rc.holePos[0], 0.02, rc.holePos[1]);
          rGroup.add(holeMesh);
        }

        // Real Physical Light Fixtures inside room
        setupRoomLightFixtures(rGroup, rc);

        // '현재 층만 보기' 컷어웨이 모드일 때만 위층 숨김 (기본 '전체 층 보기'에서는 1F+2F 모두 표시)
        if (!isFps && !showAllFloorsInOrbit && rc.floorHeight > rcCurrent.floorHeight + 0.1) {
          rGroup.visible = false;
        }
        unifiedBuildingGroup.add(rGroup);
      });

      // 2~4. Asylum 404-specific Unified Corridors & 2-Story Stairwell
      if (activeThemeId === 'asylum-404') {
      const c1f = FLOOR_CONFIGS["1f"].corridor;
      const corrPbr = getPbrTexturePack('concrete');
      const cGroup1f = new THREE.Group();
      cGroup1f.name = "corridorGroup_1f";
      cGroup1f.position.set(c1f.x, 0, c1f.z);
      const c1PlaneGeo = getPlaneGeo(c1f.w, c1f.h);
      const c1FloorTex = getProceduralTileTexture(0x1f2630, true);
      const c1FloorMesh = new THREE.Mesh(c1PlaneGeo, new THREE.MeshStandardMaterial({
        color: 0x262f3d, map: c1FloorTex, bumpMap: corrPbr.bumpMap, bumpScale: 0.008, roughness: 0.62, metalness: 0.1
      }));
      c1FloorMesh.rotation.x = -Math.PI / 2;
      c1FloorMesh.position.set(c1f.w / 2, 0.002, c1f.h / 2);
      c1FloorMesh.receiveShadow = true;
      cGroup1f.add(c1FloorMesh);
      const c1CeilMesh = new THREE.Mesh(c1PlaneGeo, ceilMat);
      c1CeilMesh.rotation.x = Math.PI / 2;
      c1CeilMesh.position.set(c1f.w / 2, 2.6 - 0.04, c1f.h / 2);
      c1CeilMesh.visible = isFps;
      cGroup1f.add(c1CeilMesh);
      const c1WallTex = getProceduralWallTexture(0x3a4352);
      const cWMat = new THREE.MeshStandardMaterial({
        color: 0x475569, map: c1WallTex, bumpMap: corrPbr.bumpMap, bumpScale: 0.004,
        side: THREE.DoubleSide, roughness: 0.85,
        transparent: !isFps, opacity: wallAlpha, depthWrite: isFps
      });
      createWallMesh(cGroup1f, WALL_INSET, WALL_INSET, c1f.w - WALL_INSET, WALL_INSET, 2.6, 0, cWMat);
      createWallMesh(cGroup1f, c1f.w - WALL_INSET, c1f.h - WALL_INSET, WALL_INSET, c1f.h - WALL_INSET, 2.6, 0, cWMat);
      c1f.props.forEach(p => {
        const cp = createCorridorPropMesh(p);
        cp.position.set(p.x - c1f.x, 0, p.z - c1f.z);
        cGroup1f.add(cp);
      });
      unifiedBuildingGroup.add(cGroup1f);

      // 3. Build 2F Unified Corridor (Hospital Tile Floor + Weathered Plaster Wall PBR)
      const c2f = FLOOR_CONFIGS["2f"].corridor;
      const cGroup2f = new THREE.Group();
      cGroup2f.name = "corridorGroup_2f";
      cGroup2f.position.set(c2f.x, 2.6, c2f.z);
      const c2PlaneGeo = getPlaneGeo(c2f.w, c2f.h);
      const c2FloorTex = getProceduralTileTexture(0x1f2933, true);
      const c2FloorMesh = new THREE.Mesh(c2PlaneGeo, new THREE.MeshStandardMaterial({
        color: 0x26313d, map: c2FloorTex, bumpMap: corrPbr.bumpMap, bumpScale: 0.008, roughness: 0.62, metalness: 0.1
      }));
      c2FloorMesh.rotation.x = -Math.PI / 2;
      c2FloorMesh.position.set(c2f.w / 2, 0.002, c2f.h / 2);
      c2FloorMesh.receiveShadow = true;
      cGroup2f.add(c2FloorMesh);
      const c2CeilMesh = new THREE.Mesh(c2PlaneGeo, ceilMat);
      c2CeilMesh.rotation.x = Math.PI / 2;
      c2CeilMesh.position.set(c2f.w / 2, 2.6 - 0.04, c2f.h / 2);
      c2CeilMesh.visible = isFps;
      cGroup2f.add(c2CeilMesh);
      const c2WallTex = getProceduralWallTexture(0x3a4352);
      const c2WMat = new THREE.MeshStandardMaterial({
        color: 0x475569, map: c2WallTex, bumpMap: corrPbr.bumpMap, bumpScale: 0.004,
        side: THREE.DoubleSide, roughness: 0.85,
        transparent: !isFps, opacity: wallAlpha, depthWrite: isFps
      });
      createWallMesh(cGroup2f, WALL_INSET, WALL_INSET, c2f.w - WALL_INSET, WALL_INSET, 2.6, 0, c2WMat);
      createWallMesh(cGroup2f, c2f.w - WALL_INSET, c2f.h - WALL_INSET, WALL_INSET, c2f.h - WALL_INSET, 2.6, 0, c2WMat);
      c2f.props.forEach(p => {
        const cp = createCorridorPropMesh(p);
        cp.position.set(p.x - c2f.x, 0, p.z - c2f.z);
        cGroup2f.add(cp);
      });
      if (!isFps && !showAllFloorsInOrbit && rcCurrent.floorHeight < 2.0) {
        cGroup2f.visible = false;
      }
      unifiedBuildingGroup.add(cGroup2f);

      // 4. Real 2-Story Enclosed Stairwell (x: 22.5 ~ 25.0, z: 0 ~ 5.0, y: 0.0 -> 2.6m connecting 1F Room 2 & 2F Room 3)
      const stairGroup = new THREE.Group();
      stairGroup.name = "realStairwell_1f_2f";
      stairGroup.position.set(22.5, 0, 0);
      const stW = 2.5, stD = 5.0, stH = 5.2;
      const stFloorMat = new THREE.MeshStandardMaterial({ color: 0x262f3d, map: corrPbr.map, roughness: 0.72 });
      const stWallMat = new THREE.MeshStandardMaterial({
        color: 0x3b4454, map: c1WallTex, bumpMap: corrPbr.bumpMap, bumpScale: 0.004,
        side: THREE.DoubleSide, roughness: 0.85,
        transparent: !isFps, opacity: wallAlpha, depthWrite: isFps
      });
      const stBase = new THREE.Mesh(getBoxGeo(stW, 0.08, stD), stFloorMat);
      stBase.position.set(stW / 2, 0.04, stD / 2);
      stairGroup.add(stBase);
      // Enclosed outer walls (North, South, East) inset inward by WALL_INSET
      createWallMesh(stairGroup, WALL_INSET, WALL_INSET, stW - WALL_INSET, WALL_INSET, stH, 0, stWallMat);
      createWallMesh(stairGroup, stW - WALL_INSET, stD - WALL_INSET, WALL_INSET, stD - WALL_INSET, stH, 0, stWallMat);
      createWallMesh(stairGroup, stW - WALL_INSET, WALL_INSET, stW - WALL_INSET, stD - WALL_INSET, stH, 0, stWallMat);
      // 12 Concrete Steps rising from z=3.9 (y=0.0) to z=1.1 (y=2.6) + 2F Landing
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x475569, map: corrPbr.map, roughness: 0.65 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.35 });
      const numSteps = 12;
      const stepGeo = getBoxGeo(1.5, 0.16, 0.24);
      for (let i = 0; i < numSteps; i++) {
        const sy = (i + 1) * (2.6 / numSteps);
        const sz = 3.85 - i * (2.6 / numSteps);
        const step = new THREE.Mesh(stepGeo, stepMat);
        step.position.set(1.35, sy - 0.08, sz);
        stairGroup.add(step);
      }
      // 2F Landing platform connecting directly to 2F Room 3 East doorway
      const landing2f = new THREE.Mesh(getBoxGeo(stW, 0.12, 1.4), stFloorMat);
      landing2f.position.set(stW / 2, 2.54, 0.7);
      const landingBridge = new THREE.Mesh(getBoxGeo(0.9, 0.12, 2.4), stFloorMat);
      landingBridge.position.set(0.45, 2.54, 2.5);
      // Handrail along stairs
      const handrail = new THREE.Mesh(getBoxGeo(0.05, 0.05, 3.6), railMat);
      handrail.position.set(0.65, 2.05, 2.55);
      handrail.rotation.x = Math.atan2(2.6, 2.6);
      stairGroup.add(landing2f, landingBridge, handrail);
      unifiedBuildingGroup.add(stairGroup);

      // Real Physical Light Fixtures in Corridors & Stairwell
      setupCorridorLightFixtures(cGroup1f, cGroup2f, stairGroup);
      }

      scene.add(unifiedBuildingGroup);

      // Restore live light ON/OFF states if rebuilding mid-play (e.g. boss door unlock)
      if (prevLightStates.size > 0) {
        for (let i = 0; i < activeFixtures.length; i++) {
          const f = activeFixtures[i];
          if (prevLightStates.has(f.id)) {
            setLightFixtureOn(f.id, prevLightStates.get(f.id), false);
          }
        }
      }

      updateRoomVisibilityCulling();
      syncLightPool(cameraMode === 'fps' ? (camera ? camera.position : null) : (orbitControls ? orbitControls.target : null), currentRoomIdx);
      markSceneDirty();
    }

    const WALL_SIDE_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
    const TABLE_PROP_DEFAULT_REL = { cup: [0.26, -0.11], document: [0.02, 0.15] };
    const TABLE_PROP_DEFAULT_ABS = { cup: [1.76, 0.74], document: [1.52, 1.0] };

    // Wall-mounted door objects (not floor hatches / cargo lifts) carve doorways into walls
    function isWallDoorObj(obj) {
      if (!obj) return false;
      const isDoor = obj.type === 'door' || (obj.modelPreset && obj.modelPreset.startsWith('door-'));
      if (!isDoor) return false;
      if (obj.modelPreset === 'door-hatch' || obj.modelPreset === 'door-lift') return false;
      const nm = obj.name || '';
      if (!obj.modelPreset && (nm.includes('해치') || nm.includes('승강기') || nm.includes('리프트'))) return false;
      return true;
    }

    // Un-moved boss doors sit in the middle of their room's East wall (legacy layout)
    function applyDefaultBossDoorSnap(obj) {
      if (!obj.isBossDoor || obj.customPlaced || !isWallDoorObj(obj)) return;
      const own = ROOM_CONFIGS[obj.roomIdx] || ROOM_CONFIGS[0];
      obj.x = own.w;
      obj.z = Math.max(1.0, (own.h - 1.2) / 2) + 0.6;
      obj.rotY = 0;
    }

    // Which wall (N: z<=0.35, S: z>=h-0.35, W: x<=0.35, E: x>=w-0.35) a door object sits on, and where along it
    function getWallDoorInfo(obj, rc) {
      if (!isWallDoorObj(obj)) return null;
      applyDefaultBossDoorSnap(obj);
      const T = 0.35;
      if (obj.z <= T) return { wall: 'N', c: obj.x };
      if (obj.z >= rc.h - T) return { wall: 'S', c: obj.x };
      if (obj.x <= T) return { wall: 'W', c: obj.z };
      if (obj.x >= rc.w - T) return { wall: 'E', c: obj.z };
      return null;
    }

    function collectWallOpenings(rc) {
      const ops = { N: [], S: [], W: [], E: [] };
      const zMid = Math.max(1.0, (rc.h - 1.2) / 2) + 0.6;
      const lenOf = w => (w === 'N' || w === 'S') ? rc.w : rc.h;
      let natW = !!rc.hasWestDoor;
      let natE = rc.hasEastDoor !== false;
      studioObjects.forEach(obj => {
        if (obj.roomIdx !== rc.idx) return;
        const info = getWallDoorInfo(obj, rc);
        if (!info) return;
        if (carriedIds.has(obj.id)) {
          // a carried door takes its natural passage with it: the wall fills back in while carrying
          if (info.wall === 'W' && Math.abs(info.c - zMid) < 0.05) natW = false;
          if (info.wall === 'E' && Math.abs(info.c - zMid) < 0.05) natE = false;
          return;
        }
        ops[info.wall].push({ c: Math.min(Math.max(info.c, 0.6), lenOf(info.wall) - 0.6), obj });
      });
      if (natW && !ops.W.some(o => Math.abs(o.c - zMid) < 1.2)) ops.W.push({ c: zMid, natural: true });
      if (natE && !ops.E.some(o => Math.abs(o.c - zMid) < 1.2)) ops.E.push({ c: zMid, natural: true });
      return ops;
    }

    // A door that leaves its natural passage position (moved/deleted) takes that passage with it
    function releaseNaturalOpening(rc, info) {
      const zMid = Math.max(1.0, (rc.h - 1.2) / 2) + 0.6;
      if (Math.abs(info.c - zMid) >= 0.05) return;
      if (info.wall === 'E') rc.hasEastDoor = false;
      if (info.wall === 'W') rc.hasWestDoor = false;
    }

    // Table-top props follow their parent object's (x, z, rotY); detached ones sit on the floor
    function placeTableProp(g, prop, surfaceY, lift = 0) {
      const parent = prop.tableSnapped && prop.targetParentId ? studioObjects.find(o => o.id === prop.targetParentId) : null;
      const defRel = TABLE_PROP_DEFAULT_REL[prop.type] || [0, 0];
      const defAbs = TABLE_PROP_DEFAULT_ABS[prop.type] || [1, 1];
      if (parent) {
        const prc = ROOM_CONFIGS[parent.roomIdx] || ROOM_CONFIGS[0];
        const rot = getNaturalObjectRotation(parent, prc.w, prc.h);
        const rx = prop.relX !== undefined ? prop.relX : defRel[0];
        const rz = prop.relZ !== undefined ? prop.relZ : defRel[1];
        g.position.set(parent.x + rx * Math.cos(rot) + rz * Math.sin(rot), surfaceY, parent.z - rx * Math.sin(rot) + rz * Math.cos(rot));
        g.rotation.y = rot;
      } else if (prop.tableSnapped) {
        g.position.set(prop.x !== undefined ? prop.x : defAbs[0], surfaceY, prop.z !== undefined ? prop.z : defAbs[1]);
      } else {
        g.position.set(prop.x !== undefined ? prop.x : defAbs[0], (prop.y || 0) + lift, prop.z !== undefined ? prop.z : defAbs[1]);
        g.rotation.y = prop.rotY || 0;
      }
    }

    // When a table is deleted its props drop to the floor where they were
    function detachDependentProps(parent) {
      const prc = ROOM_CONFIGS[parent.roomIdx] || ROOM_CONFIGS[0];
      const rot = getNaturalObjectRotation(parent, prc.w, prc.h);
      PROP_ONTOLOGY.forEach(p => {
        if (!(p.tableSnapped && p.targetParentId === parent.id)) return;
        const rel = TABLE_PROP_DEFAULT_REL[p.type] || [0, 0];
        const rx = p.relX !== undefined ? p.relX : rel[0];
        const rz = p.relZ !== undefined ? p.relZ : rel[1];
        p.x = parent.x + rx * Math.cos(rot) + rz * Math.sin(rot);
        p.z = parent.z - rx * Math.sin(rot) + rz * Math.cos(rot);
        p.y = 0;
        p.roomIdx = parent.roomIdx;
        p.tableSnapped = false;
        delete p.targetParentId; delete p.relX; delete p.relZ;
      });
    }

    function deletePropById(id) {
      const i = PROP_ONTOLOGY.findIndex(p => p.id === id);
      if (i < 0) return;
      const removed = PROP_ONTOLOGY.splice(i, 1)[0];
      carriedIds.delete(id);
      rebuild3DRoom();
      render2DCadObjects();
      updateCodeView();
      scheduleStudioAutosave();
      playSfx('click');
      showDirectorWhisper(`[삭제 완료] '${removed.name}' 소품을 제거했습니다.`);
    }

    function createWallMesh(group, x1, z1, x2, z2, h, yOff, mat) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const geo = getPlaneGeo(len, h);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((x1 + x2) / 2, yOff + h / 2, (z1 + z2) / 2);
      mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      mesh.receiveShadow = true;
      mesh.userData.isWallSurface = true;
      group.add(mesh);
    }

    function rebuild3DObjectsForCurrentRoom() {
      // Compatibility stub: objects are now permanently instantiated inside rebuild3DRoom()
      if (!unifiedBuildingGroup) rebuild3DRoom();
    }

    // Smart Inward-Facing Object Orientation (Ensures props back against walls and face the center of the room)
    function getNaturalObjectRotation(obj, rW, rH) {
      if (obj.rotY !== undefined) return obj.rotY;
      if (obj.isBossDoor) return 0; // Boss doors align directly with east doorway frame
      if (obj.type === 'door' && (obj.name.includes('해치') || obj.name.includes('승강기'))) return 0;

      // Distances to four boundary walls
      const dNorth = obj.z;
      const dSouth = rH - obj.z;
      const dWest = obj.x;
      const dEast = rW - obj.x;

      const minD = Math.min(dNorth, dSouth, dWest, dEast);

      if (minD === dSouth) {
        return Math.PI; // Back against South Wall -> Face North (-Z into room)
      } else if (minD === dWest) {
        return Math.PI / 2; // Back against West Wall -> Face East (+X into room)
      } else if (minD === dEast) {
        return -Math.PI / 2; // Back against East Wall -> Face West (-X into room)
      } else {
        return 0; // Back against North Wall -> Face South (+Z into room)
      }
    }

    const MODEL_PRESET_MAP = {
      'desk-terminal':  { type: 'desk',     hint: '접수' },
      'desk-chess':     { type: 'desk',     hint: '체스' },
      'desk-autopsy':   { type: 'desk',     hint: '부검' },
      'desk-plain':     { type: 'desk',     hint: '' },
      'cabinet':        { type: 'cabinet',  hint: '' },
      'locker':         { type: 'locker',   hint: '' },
      'pipe-manifold':  { type: 'locker',   hint: '파이프' },
      'phone':          { type: 'console',  hint: '전화' },
      'reel-recorder':  { type: 'console',  hint: '녹음기' },
      'xray-lightbox':  { type: 'console',  hint: 'X-Ray' },
      'console':        { type: 'console',  hint: '' },
      'safe':           { type: 'safe',     hint: '' },
      'generator':      { type: 'safe',     hint: '발전기' },
      'scale':          { type: 'safe',     hint: '저울' },
      'clock':          { type: 'artifact', hint: '시계' },
      'hospital-bed':   { type: 'artifact', hint: '침대' },
      'specimen-shelf': { type: 'artifact', hint: '표본' },
      'portrait':       { type: 'artifact', hint: '초상화' },
      'ladder':         { type: 'ladder',   hint: '' },
      'door-standard':  { type: 'door',     hint: '' },
      'door-hatch':     { type: 'door',     hint: '해치' },
      'door-lift':      { type: 'door',     hint: '리프트' },
      'door-bookshelf': { type: 'door',     hint: '책장' }
    };

// (GLTF loader cached in src/pbr.js)

    const _sharedPropMatPools = new Map();
    let _sharedPropGeos = null;

    function getSharedPropGeos() {
      if (_sharedPropGeos) return _sharedPropGeos;
      _sharedPropGeos = {
        beacon: markSharedResource(new THREE.OctahedronGeometry(0.13, 0)),
        rivet: markSharedResource(new THREE.SphereGeometry(0.018, 6, 6)),
        deskLeg: markSharedResource(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8)),
        monitorStand: markSharedResource(new THREE.CylinderGeometry(0.07, 0.09, 0.04, 14)),
        monitorBody: markSharedResource(new THREE.BoxGeometry(0.32, 0.26, 0.24)),
        crtScreen: markSharedResource(new THREE.PlaneGeometry(0.27, 0.21)),
        kb: markSharedResource(new THREE.BoxGeometry(0.28, 0.016, 0.11)),
        chessBoard: markSharedResource(new THREE.BoxGeometry(0.38, 0.02, 0.38)),
        chessPiece: markSharedResource(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 8)),
        docBinder: markSharedResource(new THREE.BoxGeometry(0.24, 0.018, 0.32)),
        lampBase: markSharedResource(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12)),
        lampArm: markSharedResource(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6)),
        lampShade: markSharedResource(new THREE.ConeGeometry(0.07, 0.08, 14)),
        cabPlate: markSharedResource(new THREE.BoxGeometry(0.12, 0.055, 0.012)),
        branchPipe: markSharedResource(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 12)),
        valve: markSharedResource(new THREE.TorusGeometry(0.09, 0.02, 8, 16)),
        gauge: markSharedResource(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16)),
        lockerBadge: markSharedResource(new THREE.BoxGeometry(0.08, 0.04, 0.015)),
        lockerLatch: markSharedResource(new THREE.BoxGeometry(0.03, 0.09, 0.03)),
        phoneBase: markSharedResource(new THREE.BoxGeometry(0.28, 0.08, 0.28)),
        dialWheel: markSharedResource(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16)),
        handset: markSharedResource(new THREE.BoxGeometry(0.24, 0.045, 0.06)),
        reel: markSharedResource(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24)),
        vu: markSharedResource(new THREE.BoxGeometry(0.14, 0.07, 0.02)),
        genPipe: markSharedResource(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 12)),
        scalePan: markSharedResource(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16)),
        safeWheelHub: markSharedResource(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16)),
        safeSpoke: markSharedResource(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 8)),
        safeDial: markSharedResource(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20)),
        dRing: markSharedResource(new THREE.TorusGeometry(0.06, 0.015, 8, 16)),
        liftPost: markSharedResource(new THREE.BoxGeometry(0.06, 2.2, 0.06)),
        statusLamp: markSharedResource(new THREE.BoxGeometry(0.18, 0.08, 0.08)),
        doorHandle: markSharedResource(new THREE.BoxGeometry(0.04, 0.025, 0.18)),
        ladderPost: markSharedResource(new THREE.CylinderGeometry(0.035, 0.035, 2.6)),
        ladderRung: markSharedResource(new THREE.CylinderGeometry(0.02, 0.02, 0.5)),
        ladderHoop: markSharedResource(new THREE.TorusGeometry(0.38, 0.02, 8, 16, Math.PI)),
        gfBody: markSharedResource(new THREE.BoxGeometry(0.45, 1.85, 0.35)),
        gfFace: markSharedResource(new THREE.CircleGeometry(0.14, 24)),
        gfMinHand: markSharedResource(new THREE.BoxGeometry(0.012, 0.10, 0.008)),
        gfHourHand: markSharedResource(new THREE.BoxGeometry(0.075, 0.014, 0.008)),
        gfWin: markSharedResource(new THREE.BoxGeometry(0.22, 0.65, 0.02)),
        gfPendulum: markSharedResource(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16)),
        bedFrame: markSharedResource(new THREE.BoxGeometry(0.9, 0.45, 1.8)),
        bedMattress: markSharedResource(new THREE.BoxGeometry(0.84, 0.14, 1.74)),
        bedStrap: markSharedResource(new THREE.BoxGeometry(0.86, 0.02, 0.06)),
        jar: markSharedResource(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 12))
      };
      return _sharedPropGeos;
    }

    function getSharedPropMats(ovPreset) {
      const key = ovPreset || '__default__';
      if (_sharedPropMatPools.has(key)) return _sharedPropMatPools.get(key);
      const pbrWood = getPbrTexturePack(ovPreset || 'wood');
      const pbrRust = getPbrTexturePack(ovPreset || 'rustedMetal');
      const pbrSteel = getPbrTexturePack(ovPreset || 'surgicalSteel');
      const crtTex = getPropDetailTexture('crtScreen');
      const docTex = getPropDetailTexture('document');
      const clockTex = getPropDetailTexture('clockFace');
      const portraitTex = getPropDetailTexture('portrait');
      const aoTex = getPropDetailTexture('contactAo');
      const concretePbr = getPbrTexturePack('concrete');

      const pool = {
        metalMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x64748b, map: pbrRust.map, normalMap: pbrRust.normalMap, normalScale: new THREE.Vector2(0.85, 0.85),
          roughnessMap: pbrRust.roughnessMap, aoMap: pbrRust.aoMap, aoMapIntensity: 0.65,
          metalness: 0.78, roughness: 0.75
        })),
        chromeMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0xcbd5e1, map: pbrSteel.map, normalMap: pbrSteel.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
          roughnessMap: pbrSteel.roughnessMap, aoMap: pbrSteel.aoMap, aoMapIntensity: 0.5,
          metalness: 0.88, roughness: 0.45
        })),
        darkMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x1e293b, map: pbrRust.map, normalMap: pbrRust.normalMap, normalScale: new THREE.Vector2(0.75, 0.75),
          roughnessMap: pbrRust.roughnessMap, aoMap: pbrRust.aoMap, aoMapIntensity: 0.7,
          metalness: 0.65, roughness: 0.85
        })),
        woodMat: markSharedResource(new THREE.MeshStandardMaterial({
          color: 0x9a653a, map: pbrWood.map, normalMap: pbrWood.normalMap, normalScale: new THREE.Vector2(0.85, 0.85),
          roughnessMap: pbrWood.roughnessMap, aoMap: pbrWood.aoMap, aoMapIntensity: 0.7,
          roughness: 0.9, metalness: 0.05
        })),
        glowSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.65 })),
        glowUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65 })),
        beaconSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.8 })),
        beaconUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.8 })),
        proxyMat: markSharedResource(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })),
        aoMat: markSharedResource(new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, opacity: 0.55, depthWrite: false })),
        deskTopSteel: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, map: pbrSteel.map, metalness: 0.85, roughness: 0.28 })),
        deskTopWoodSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, map: pbrWood.map, roughness: 0.65 })),
        deskTopWood: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x8a5a36, map: pbrWood.map, roughness: 0.65 })),
        crtMat: markSharedResource(new THREE.MeshStandardMaterial({ map: crtTex, emissive: 0x0ea5e9, emissiveMap: crtTex, emissiveIntensity: 0.75, roughness: 0.2 })),
        labCrtMat: markSharedResource(new THREE.MeshStandardMaterial({ map: crtTex, emissive: 0x0ea5e9, emissiveMap: crtTex, emissiveIntensity: 0.65, roughness: 0.2 })),
        docBinderMat: markSharedResource(new THREE.MeshStandardMaterial({ map: docTex, roughness: 0.85 })),
        lampShadeGreen: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x1f3a2e, map: pbrRust.map, metalness: 0.55, roughness: 0.38 })),
        cabSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, map: pbrRust.map, metalness: 0.55, roughness: 0.52 })),
        cabUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x525d6b, map: pbrRust.map, metalness: 0.55, roughness: 0.52 })),
        valveRed: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8 })),
        lockerSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, map: pbrRust.map, metalness: 0.70, roughness: 0.48 })),
        lockerUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x4b5563, map: pbrRust.map, metalness: 0.70, roughness: 0.48 })),
        deckMat: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })),
        vuMat: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.7 })),
        xrayScreen: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0xbae6fd, emissiveIntensity: 0.85 })),
        ribDecal: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })),
        genBody: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.3 })),
        glassCase: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.35, roughness: 0.1 })),
        safeSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, map: pbrRust.map, metalness: 0.72, roughness: 0.42 })),
        safeUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x3b424d, map: pbrRust.map, metalness: 0.72, roughness: 0.42 })),
        brassDial: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x9a7b3c, metalness: 0.85, roughness: 0.28 })),
        hatchPlate: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.4 })),
        liftFloor: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.4 })),
        liftPost: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85 })),
        statusSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.9 })),
        statusUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.9 })),
        bookBlock: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })),
        doorSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.3, depthWrite: true })),
        doorUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x450a0a, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3, depthWrite: true })),
        doorPanelSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.85, metalness: 0.8 })),
        doorPanelUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.85, metalness: 0.8 })),
        clockFace: markSharedResource(new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 })),
        handDark: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x0f172a })),
        handRed: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x991b1b })),
        clockWin: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.25, roughness: 0.15 })),
        bedMattress: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x64748b, map: concretePbr.map, roughness: 0.92 })),
        jarLiquid: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x047857, emissiveIntensity: 0.45, transparent: true, opacity: 0.75 })),
        portraitMat: markSharedResource(new THREE.MeshStandardMaterial({ map: portraitTex, roughness: 0.75 })),
        clueSolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x10b981, map: pbrRust.map, metalness: 0.55, roughness: 0.5 })),
        clueUnsolved: markSharedResource(new THREE.MeshStandardMaterial({ color: 0x47525e, map: pbrRust.map, metalness: 0.55, roughness: 0.5 }))
      };
      _sharedPropMatPools.set(key, pool);
      return pool;
    }

    function create3DMeshForObject(obj, targetParent) {
      if (meshMap.has(obj.id)) {
        const oldGroup = meshMap.get(obj.id);
        if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
        else scene.remove(oldGroup);
        disposeObject3D(oldGroup);
        meshMap.delete(obj.id);
      }

      const group = new THREE.Group();
      const ovPreset = obj.material && obj.material.preset ? obj.material.preset : null;
      const pm = getSharedPropMats(ovPreset);
      const pg = getSharedPropGeos();
      const { metalMat, chromeMat, darkMat, woodMat } = pm;
      const glowMat = obj.solved ? pm.glowSolved : pm.glowUnsolved;

      const w = obj.w || 0.8;
      const d = obj.d || 0.6;
      const presetSpec = obj.modelPreset ? MODEL_PRESET_MAP[obj.modelPreset] : null;
      const renderType = presetSpec ? presetSpec.type : obj.type;
      const name = presetSpec ? presetSpec.hint : (obj.name || "");

      if (renderType === 'desk') {
        // Medical / Office Desk with aged wood PBR surface, drawers, legs, monitor & clutter
        const topH = 0.72;
        const topMat = name.includes("부검")
          ? pm.deskTopSteel
          : (obj.solved ? pm.deskTopWoodSolved : pm.deskTopWood);
        const topMesh = new THREE.Mesh(getBoxGeo(w, 0.08, d), topMat);
        topMesh.position.y = topH;
        group.add(topMesh);

        // 4 Metal Legs
        const legOffsets = [
          [-w/2 + 0.08, -d/2 + 0.08],
          [w/2 - 0.08, -d/2 + 0.08],
          [-w/2 + 0.08, d/2 - 0.08],
          [w/2 - 0.08, d/2 - 0.08]
        ];
        legOffsets.forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(pg.deskLeg, metalMat);
          leg.position.set(lx, topH / 2, lz);
          group.add(leg);
        });

        // 3-Drawer Cabinet on Right Side
        const drawerW = Math.min(w * 0.36, 0.45);
        const drawerH = topH - 0.08;
        const drawerD = d * 0.85;
        const drawerBox = new THREE.Mesh(getBoxGeo(drawerW, drawerH, drawerD), darkMat);
        drawerBox.position.set(w/2 - drawerW/2 - 0.04, drawerH / 2, 0);
        group.add(drawerBox);

        // Drawer Handles
        const handleGeo = getBoxGeo(drawerW * 0.4, 0.02, 0.03);
        for (let i = 0; i < 3; i++) {
          const handle = new THREE.Mesh(handleGeo, chromeMat);
          handle.position.set(w/2 - drawerW/2 - 0.04, 0.15 + i * 0.20, drawerD/2 + 0.015);
          group.add(handle);
        }

        // Desk Props depending on theme (Computer CRT / Documents / Chess / Terminal)
        if (name.includes("접수") || name.includes("터미널") || name.includes("모니터")) {
          // Retro CRT Terminal Monitor with Scanline Screen Texture (Positioned cleanly on Left side of desk)
          const mx = -w * 0.24, mz = -d * 0.14;
          const monitorStand = new THREE.Mesh(pg.monitorStand, darkMat);
          monitorStand.position.set(mx, topH + 0.06, mz);
          const monitorBody = new THREE.Mesh(pg.monitorBody, darkMat);
          monitorBody.position.set(mx, topH + 0.21, mz);
          const screen = new THREE.Mesh(pg.crtScreen, pm.crtMat);
          screen.position.set(mx, topH + 0.21, mz + 0.122);
          // Keyboard
          const kb = new THREE.Mesh(pg.kb, darkMat);
          kb.position.set(mx, topH + 0.048, mz + 0.22);
          group.add(monitorStand, monitorBody, screen, kb);
        } else if (name.includes("체스")) {
          // Chess Table (Inlaid board & pieces)
          const board = new THREE.Mesh(pg.chessBoard, darkMat);
          board.position.set(0, topH + 0.05, 0);
          group.add(board);
          for (let p = -0.12; p <= 0.12; p += 0.08) {
            const piece = new THREE.Mesh(pg.chessPiece, chromeMat);
            piece.position.set(p, topH + 0.08, 0);
            group.add(piece);
          }
        } else {
          // Medical Chart Document & Classic Brass Desk Lamp (No bright blue binder / neon green shade!)
          const binder = new THREE.Mesh(pg.docBinder, pm.docBinderMat);
          binder.position.set(-w * 0.15, topH + 0.05, 0);
          binder.rotation.y = 0.2;
          const lampBase = new THREE.Mesh(pg.lampBase, chromeMat);
          lampBase.position.set(w * 0.25, topH + 0.05, -d * 0.2);
          const lampArm = new THREE.Mesh(pg.lampArm, chromeMat);
          lampArm.position.set(w * 0.25, topH + 0.17, -d * 0.2);
          lampArm.rotation.z = -0.3;
          const lampShade = new THREE.Mesh(pg.lampShade, pm.lampShadeGreen);
          lampShade.position.set(w * 0.20, topH + 0.28, -d * 0.2);
          group.add(binder, lampBase, lampArm, lampShade);
        }

      } else if (renderType === 'cabinet') {
        // Multi-Drawer Filing Cabinet / Drug Shelf (Precise drawer seam bounds, zero floating bar)
        const cabH = 1.65;
        const body = new THREE.Mesh(getBoxGeo(w, cabH, d), obj.solved ? pm.cabSolved : pm.cabUnsolved);
        body.position.y = cabH / 2;
        group.add(body);

        // 4 Drawer Divisions (strictly inside [0, cabH])
        const numDrawers = 4;
        const dH = cabH / numDrawers;
        const grooveGeo = getBoxGeo(w * 0.94, 0.012, 0.01);
        const cabHandleGeo = getBoxGeo(w * 0.34, 0.022, 0.025);
        for (let i = 0; i < numDrawers; i++) {
          const dy = (i + 0.5) * dH;
          if (i > 0) {
            const groove = new THREE.Mesh(grooveGeo, darkMat);
            groove.position.set(0, i * dH, d / 2 + 0.004);
            group.add(groove);
          }
          // Label Plate
          const plate = new THREE.Mesh(pg.cabPlate, chromeMat);
          plate.position.set(0, dy + 0.07, d / 2 + 0.006);
          // Handle
          const handle = new THREE.Mesh(cabHandleGeo, chromeMat);
          handle.position.set(0, dy - 0.03, d / 2 + 0.014);
          group.add(plate, handle);
        }

      } else if (renderType === 'locker') {
        // Hospital Steel Locker / Pipe Manifold
        if (name.includes("매니폴드") || name.includes("파이프")) {
          // Heavy Industrial Coolant Pipe Manifold
          const mainPipe = new THREE.Mesh(getCylGeo(0.12, 0.12, w, 16), metalMat);
          mainPipe.rotation.z = Math.PI / 2;
          mainPipe.position.set(0, 0.85, 0);
          group.add(mainPipe);

          // 3 Branch Pipes
          [-w * 0.28, 0, w * 0.28].forEach(bx => {
            const bPipe = new THREE.Mesh(pg.branchPipe, metalMat);
            bPipe.position.set(bx, 0.85 + 0.32, 0);
            // Valve Wheel
            const valve = new THREE.Mesh(pg.valve, pm.valveRed);
            valve.rotation.x = Math.PI / 2;
            valve.position.set(bx, 0.85 + 0.65, 0);
            group.add(bPipe, valve);
          });

          // Pressure Gauge
          const gauge = new THREE.Mesh(pg.gauge, chromeMat);
          gauge.rotation.x = Math.PI / 2;
          gauge.position.set(0, 0.85, d / 2 + 0.02);
          group.add(gauge);
        } else {
          // 3-Door Locker with Slits and Padlock
          const lockerH = 1.70;
          const body = new THREE.Mesh(getBoxGeo(w, lockerH, d), obj.solved ? pm.lockerSolved : pm.lockerUnsolved);
          body.position.y = lockerH / 2;
          group.add(body);

          const colW = w / 3;
          const doorBorderGeo = getBoxGeo(colW * 0.90, lockerH * 0.92, 0.01);
          const ventGeo = getBoxGeo(colW * 0.55, 0.015, 0.015);
          [-colW, 0, colW].forEach((cx) => {
            // Door outline border
            const doorBorder = new THREE.Mesh(doorBorderGeo, darkMat);
            doorBorder.position.set(cx, lockerH / 2, d / 2 + 0.005);
            // Vents (3 horizontal slits)
            for (let v = 0; v < 3; v++) {
              const vent = new THREE.Mesh(ventGeo, darkMat);
              vent.position.set(cx, lockerH * 0.85 - v * 0.04, d / 2 + 0.012);
              group.add(vent);
            }
            // Locker Number Badge
            const badge = new THREE.Mesh(pg.lockerBadge, chromeMat);
            badge.position.set(cx, lockerH * 0.70, d / 2 + 0.012);
            // Handle / Padlock Latch
            const latch = new THREE.Mesh(pg.lockerLatch, chromeMat);
            latch.position.set(cx + colW * 0.30, lockerH * 0.50, d / 2 + 0.02);
            group.add(doorBorder, badge, latch);
          });
        }

      } else if (renderType === 'console') {
        // High-Tech / Medical Electronic Console
        if (name.includes("전화") || name.includes("다이얼")) {
          // Retro Dial Telephone on Stand
          const stand = new THREE.Mesh(getBoxGeo(w, 0.85, d), darkMat);
          stand.position.y = 0.425;
          // Phone Base (sloped)
          const phoneBase = new THREE.Mesh(pg.phoneBase, metalMat);
          phoneBase.position.set(0, 0.89, 0);
          phoneBase.rotation.x = 0.15;
          // Dial Wheel
          const dial = new THREE.Mesh(pg.dialWheel, chromeMat);
          dial.position.set(0, 0.94, 0.04);
          dial.rotation.x = 0.15;
          // Handset
          const handset = new THREE.Mesh(pg.handset, darkMat);
          handset.position.set(0, 0.98, -0.06);
          group.add(stand, phoneBase, dial, handset);
        } else if (name.includes("릴") || name.includes("녹음기")) {
          // Reel-to-Reel Tape Recorder Console
          const stand = new THREE.Mesh(getBoxGeo(w, 0.90, d), darkMat);
          stand.position.y = 0.45;
          // Top Deck
          const deck = new THREE.Mesh(getBoxGeo(w * 0.9, 0.35, d * 0.85), pm.deckMat);
          deck.position.set(0, 1.05, 0);
          // Two Tape Reels
          [-w * 0.22, w * 0.22].forEach(rx => {
            const reel = new THREE.Mesh(pg.reel, chromeMat);
            reel.rotation.x = Math.PI / 2;
            reel.position.set(rx, 1.15, d * 0.43);
            group.add(reel);
          });
          // VU Meter (Glowing Amber)
          const vu = new THREE.Mesh(pg.vu, pm.vuMat);
          vu.position.set(0, 0.96, d * 0.43);
          group.add(stand, deck, vu);
        } else if (name.includes("X-Ray") || name.includes("라이트박스")) {
          // Medical X-Ray Lightbox Panel
          const boxFrame = new THREE.Mesh(getBoxGeo(w, 0.85, 0.10), darkMat);
          boxFrame.position.y = 1.35;
          const lightScreen = new THREE.Mesh(getBoxGeo(w * 0.88, 0.72, 0.02), pm.xrayScreen);
          lightScreen.position.set(0, 1.35, 0.05);
          // Dark Rib Decal Box simulating X-Ray
          const ribDecal = new THREE.Mesh(getBoxGeo(w * 0.5, 0.45, 0.01), pm.ribDecal);
          ribDecal.position.set(0, 1.35, 0.065);
          group.add(boxFrame, lightScreen, ribDecal);
        } else {
          // Standard Lab Console with CRT & Switch Panels
          const stand = new THREE.Mesh(getBoxGeo(w, 0.95, d), darkMat);
          stand.position.y = 0.475;
          const panel = new THREE.Mesh(getBoxGeo(w * 0.9, 0.45, 0.25), metalMat);
          panel.position.set(0, 1.15, 0);
          const screen = new THREE.Mesh(getPlaneGeo(w * 0.65, 0.30), pm.labCrtMat);
          screen.position.set(0, 1.15, 0.132);
          group.add(stand, panel, screen);
        }

      } else if (renderType === 'safe') {
        // Heavy Armored Steel Safe / Precision Instrument / Generator
        if (name.includes("발전기")) {
          // Industrial Diesel Generator
          const genBody = new THREE.Mesh(getBoxGeo(w, 1.10, d), pm.genBody);
          genBody.position.y = 0.55;
          // Cooling Radiator Grill
          const grill = new THREE.Mesh(getBoxGeo(w * 0.7, 0.45, 0.03), darkMat);
          grill.position.set(0, 0.60, d/2 + 0.015);
          // Top Exhaust Muffler Pipe
          const pipe = new THREE.Mesh(pg.genPipe, metalMat);
          pipe.position.set(w * 0.25, 1.25, -d * 0.15);
          group.add(genBody, grill, pipe);
        } else if (name.includes("저울")) {
          // Precision Analytical Balance with Glass Case
          const base = new THREE.Mesh(getBoxGeo(w, 0.12, d), chromeMat);
          base.position.y = 0.06;
          const glassCase = new THREE.Mesh(getBoxGeo(w * 0.85, 0.45, d * 0.85), pm.glassCase);
          glassCase.position.y = 0.34;
          const pan = new THREE.Mesh(pg.scalePan, chromeMat);
          pan.position.y = 0.14;
          group.add(base, glassCase, pan);
        } else {
          // Armored Bank Vault Safe with 3-Spoke Wheel (PBR Steel, no flat toy color!)
          const safeH = 0.95;
          const safeBox = new THREE.Mesh(getBoxGeo(w, safeH, d), obj.solved ? pm.safeSolved : pm.safeUnsolved);
          safeBox.position.y = safeH / 2;
          // Door Inset Frame
          const doorInset = new THREE.Mesh(getBoxGeo(w * 0.85, safeH * 0.85, 0.02), darkMat);
          doorInset.position.set(0, safeH / 2, d / 2 + 0.005);
          // 3-Spoke Handwheel
          const wheelHub = new THREE.Mesh(pg.safeWheelHub, chromeMat);
          wheelHub.rotation.x = Math.PI / 2;
          wheelHub.position.set(0, safeH / 2, d / 2 + 0.04);
          group.add(safeBox, doorInset, wheelHub);
          for (let s = 0; s < 3; s++) {
            const spoke = new THREE.Mesh(pg.safeSpoke, chromeMat);
            spoke.rotation.z = s * (Math.PI / 3);
            spoke.position.set(0, safeH / 2, d / 2 + 0.04);
            group.add(spoke);
          }
          // Combination Number Dial (Brushed Brass, no neon yellow)
          const dial = new THREE.Mesh(pg.safeDial, pm.brassDial);
          dial.rotation.x = Math.PI / 2;
          dial.position.set(-w * 0.22, safeH / 2 + 0.15, d / 2 + 0.03);
          group.add(dial);
        }

      } else if (renderType === 'door') {
        const isBoss = obj.isBossDoor;
        const doorPivot = new THREE.Group();
        const doorW = isBoss ? 0.18 : (obj.w || 0.2);
        const doorH = 2.12;
        const doorD = isBoss ? 1.24 : (obj.d || 1.1);

        if (name.includes("해치")) {
          // Floor Flush Hatch
          const hatchPlate = new THREE.Mesh(getBoxGeo(w, 0.06, d), pm.hatchPlate);
          hatchPlate.position.y = 0.03;
          const dRing = new THREE.Mesh(pg.dRing, chromeMat);
          dRing.rotation.x = Math.PI / 2;
          dRing.position.set(0, 0.065, 0);
          group.add(hatchPlate, dRing);
        } else if (name.includes("승강기") || name.includes("리프트")) {
          // Industrial Cargo Lift Cage (No perpendicular door sticking out)
          const liftFloor = new THREE.Mesh(getBoxGeo(w, 0.08, d), pm.liftFloor);
          liftFloor.position.y = 0.04;
          const liftTop = new THREE.Mesh(getBoxGeo(w, 0.08, d), darkMat);
          liftTop.position.y = 2.2;
          group.add(liftFloor, liftTop);
          [[-w/2+0.04, -d/2+0.04], [w/2-0.04, -d/2+0.04], [-w/2+0.04, d/2-0.04], [w/2-0.04, d/2-0.04]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(pg.liftPost, pm.liftPost);
            post.position.set(px, 1.1, pz);
            group.add(post);
          });
          const statusLamp = new THREE.Mesh(pg.statusLamp, obj.solved ? pm.statusSolved : pm.statusUnsolved);
          statusLamp.position.set(0, 2.26, -d/2 + 0.05);
          group.add(statusLamp);
        } else if (name.includes("책장")) {
          // Secret Sliding Bookshelf Door
          const shelfBody = new THREE.Mesh(getBoxGeo(doorW, doorH, doorD), woodMat);
          shelfBody.position.set(0, doorH / 2, doorD / 2);
          doorPivot.add(shelfBody);
          // Books on shelves
          const bookGeo = getBoxGeo(doorW * 0.75, 0.25, doorD * 0.8);
          for (let row = 0; row < 3; row++) {
            const rowY = 0.45 + row * 0.60;
            const bookBlock = new THREE.Mesh(bookGeo, pm.bookBlock);
            bookBlock.position.set(0, rowY, doorD / 2);
            doorPivot.add(bookBlock);
          }
          if (obj.solved) doorPivot.rotation.y = -Math.PI * 0.48;
          doorPivot.position.set(0, 0, -doorD / 2);
          group.add(doorPivot);
        } else {
          // Heavy Security Blast Door Leaf Mesh with Rivets & Lever Handle
          const doorMesh = new THREE.Mesh(
            getBoxGeo(doorW, doorH, doorD),
            obj.solved ? pm.doorSolved : pm.doorUnsolved
          );
          doorMesh.position.set(0, doorH / 2, doorD / 2);
          doorPivot.add(doorMesh);

          // Rivet Studs along Door Perimeter
          [-doorD * 0.42, 0, doorD * 0.42].forEach(rz => {
            [0.2, 1.0, 1.9].forEach(ry => {
              const rMesh = new THREE.Mesh(pg.rivet, chromeMat);
              rMesh.position.set(doorW/2 + 0.005, ry, doorD/2 + rz);
              doorPivot.add(rMesh);
            });
          });

          // Chrome Door Lever Handle
          const handleBar = new THREE.Mesh(pg.doorHandle, chromeMat);
          handleBar.position.set(doorW/2 + 0.04, 1.02, doorD * 0.85);
          doorPivot.add(handleBar);

          // Security Lock Status Keypad / Indicator Panel on Door Leaf
          const panelMesh = new THREE.Mesh(
            getBoxGeo(doorW + 0.04, 0.32, 0.20),
            obj.solved ? pm.doorPanelSolved : pm.doorPanelUnsolved
          );
          panelMesh.position.set(0, 1.15, doorD * 0.65);
          doorPivot.add(panelMesh);

          // Hydraulic Door Closer Arm on top
          const closerBody = new THREE.Mesh(getBoxGeo(doorW + 0.02, 0.06, 0.25), darkMat);
          closerBody.position.set(0, doorH - 0.05, doorD * 0.5);
          doorPivot.add(closerBody);

          if (obj.solved) doorPivot.rotation.y = -Math.PI * 0.48;
          doorPivot.position.set(0, 0, -doorD / 2);
          group.add(doorPivot);
        }

        // Only East-Wall Boss Doors (Q05, Q20, Q30) snap to their OWN room's East wall (never use global roomW/roomH!)
        applyDefaultBossDoorSnap(obj); // customPlaced doors keep the position the creator chose

      } else if (renderType === 'ladder') {
        // Vertical Shaft Safety Ladder with Hoop Cage (Weathered Steel PBR)
        const p1 = new THREE.Mesh(pg.ladderPost, metalMat); p1.position.set(-0.25, 1.3, 0);
        const p2 = new THREE.Mesh(pg.ladderPost, metalMat); p2.position.set(0.25, 1.3, 0);
        group.add(p1, p2);
        for (let y = 0.3; y <= 2.4; y += 0.35) {
          const rung = new THREE.Mesh(pg.ladderRung, metalMat);
          rung.rotation.z = Math.PI / 2;
          rung.position.set(0, y, 0);
          group.add(rung);
        }
        // Safety Hoop Cage Rings on upper section
        for (let hy = 1.4; hy <= 2.4; hy += 0.5) {
          const hoop = new THREE.Mesh(pg.ladderHoop, metalMat);
          hoop.rotation.x = Math.PI / 2;
          hoop.position.set(0, hy, 0.32);
          group.add(hoop);
        }

      } else {
        // Clue Artifacts (Grandfather Clock / Hospital Bed / Specimen Jar / Restraint)
        if (name.includes("시계") || name.includes("괘종")) {
          // Antique Grandfather Clock with Pendulum & Exact 3:00 (90°) Hands
          const clockBody = new THREE.Mesh(pg.gfBody, woodMat);
          clockBody.position.y = 0.925;
          // Clock Face (Detailed Roman Numeral Texture)
          const face = new THREE.Mesh(pg.gfFace, pm.clockFace);
          face.position.set(0, 1.48, 0.188);
          // 3:00 Hands (Minute pointing 12, Hour pointing 3 -> 90° right angle)
          const minHand = new THREE.Mesh(pg.gfMinHand, pm.handRed);
          minHand.position.set(0, 1.53, 0.196);
          const hourHand = new THREE.Mesh(pg.gfHourHand, pm.handDark);
          hourHand.position.set(0.037, 1.48, 0.196);
          // Glass Pendulum Window
          const win = new THREE.Mesh(pg.gfWin, pm.clockWin);
          win.position.set(0, 0.75, 0.18);
          // Brass Pendulum
          const pendulum = new THREE.Mesh(pg.gfPendulum, chromeMat);
          pendulum.rotation.x = Math.PI / 2;
          pendulum.position.set(0, 0.65, 0.15);
          group.add(clockBody, face, minHand, hourHand, win, pendulum);
        } else if (name.includes("침대") || name.includes("구속")) {
          // Medical Restraint Hospital Gurney Bed
          const bedFrame = new THREE.Mesh(pg.bedFrame, metalMat);
          bedFrame.position.y = 0.225;
          const mattress = new THREE.Mesh(pg.bedMattress, pm.bedMattress);
          mattress.position.y = 0.52;
          // Leather Restraint Straps
          [-0.4, 0.1, 0.6].forEach(sz => {
            const strap = new THREE.Mesh(pg.bedStrap, woodMat);
            strap.position.set(0, 0.60, sz);
            group.add(strap);
          });
          group.add(bedFrame, mattress);
        } else if (name.includes("표본") || name.includes("진열")) {
          // Specimen Display Jars with Glowing Liquid
          const shelf = new THREE.Mesh(getBoxGeo(w, 1.40, d), darkMat);
          shelf.position.y = 0.70;
          group.add(shelf);
          [-w * 0.25, 0, w * 0.25].forEach(jx => {
            const jar = new THREE.Mesh(pg.jar, pm.jarLiquid);
            jar.position.set(jx, 0.95, d * 0.2);
            group.add(jar);
          });
        } else if (name.includes("초상화")) {
          // UV Director Portrait on Wall (Replaces purple/pink box!)
          const pFrame = new THREE.Mesh(getBoxGeo(w, 1.2, 0.06), woodMat);
          pFrame.position.y = 1.65;
          const pCanvas = new THREE.Mesh(getPlaneGeo(w * 0.86, 1.06), pm.portraitMat);
          pCanvas.position.set(0, 1.65, 0.034);
          group.add(pFrame, pCanvas);
        } else {
          // Weathered Steel Medical Evidence Case (Replaces pink/purple glowing toy box!)
          const clueMesh = new THREE.Mesh(
            getBoxGeo(w, 0.65, d),
            obj.solved ? pm.clueSolved : pm.clueUnsolved
          );
          clueMesh.position.y = 0.325;
          group.add(clueMesh);
        }
      }

      // Wrap procedural preset meshes in modelSlot so optional .glb modelUrl can swap in cleanly (with built-in preset fallback)
      const modelSlot = new THREE.Group();
      modelSlot.name = 'modelSlot';
      while (group.children.length > 0) {
        modelSlot.add(group.children[0]);
      }
      // Shadow diet: only primary structural bodies (maxDim >= 0.28, non-flat) cast shadows; handles/rivets/decals skip castShadow
      const _meshSize = new THREE.Vector3();
      modelSlot.traverse(c => {
        if (c.isMesh) {
          c.receiveShadow = true;
          const g = c.geometry;
          if (!g || g.type === 'PlaneGeometry' || g.type === 'CircleGeometry' || g.type === 'TorusGeometry') {
            c.castShadow = false;
          } else {
            if (!g.boundingBox) g.computeBoundingBox();
            g.boundingBox.getSize(_meshSize);
            c.castShadow = Math.max(_meshSize.x, _meshSize.y, _meshSize.z) >= 0.28;
          }
        }
      });
      group.add(modelSlot);

      // Optional external .glb modelUrl loader with bounding-box auto-normalization onto y=0
      if (obj.modelUrl && typeof obj.modelUrl === 'string' && obj.modelUrl.trim()) {
        const glbUrl = obj.modelUrl.trim();
        loadGlbCached(glbUrl).then(templateScene => {
          if (meshMap.get(obj.id) !== group) return; // Stale load after rebuild
          const model = templateScene.clone(true);
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const targetSize = Math.max(w, d, 0.8);
          model.scale.setScalar(targetSize / maxDim);
          model.updateMatrixWorld(true);
          const normBox = new THREE.Box3().setFromObject(model);
          const normCenter = normBox.getCenter(new THREE.Vector3());
          model.position.x -= normCenter.x;
          model.position.z -= normCenter.z;
          model.position.y -= normBox.min.y;
          model.traverse(c => {
            c.userData = c.userData || {};
            c.userData.objId = obj.id;
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          while (modelSlot.children.length > 0) {
            const oldChild = modelSlot.children[0];
            modelSlot.remove(oldChild);
            disposeObject3D(oldChild);
          }
          modelSlot.add(model);
          markSceneDirty();
        }).catch(err => {
          console.warn('[GLB modelUrl fallback to built-in preset]', glbUrl, err);
        });
      }

      // Status Floating Beacon Sphere above every puzzle object
      const beacon = new THREE.Mesh(pg.beacon, obj.solved ? pm.beaconSolved : pm.beaconUnsolved);
      beacon.position.y = 2.25;
      if (obj.isBossDoor && obj.type === 'door') {
        beacon.position.z = 0.62;
      }
      group.add(beacon);

      // Generous Invisible Interaction Proxy Collider (Ensures 100% click hit in both Orbit & FPS mode)
      const proxyH = Math.max(1.8, (obj.type === 'ladder' ? 2.6 : 1.7));
      const proxyGeo = getBoxGeo(w + 0.40, proxyH, d + 0.40);
      const proxyMesh = new THREE.Mesh(proxyGeo, pm.proxyMat);
      proxyMesh.position.y = proxyH / 2;
      proxyMesh.userData = { objId: obj.id };
      group.add(proxyMesh);

      const rc = ROOM_CONFIGS[obj.roomIdx] || ROOM_CONFIGS[0];
      group.position.set(obj.x, 0, obj.z);
      group.rotation.y = getNaturalObjectRotation(obj, rc.w, rc.h);
      group.userData = { objId: obj.id };
      // Grounded Soft Contact AO Shadow under grounded furniture (No cross-floor shadow bleeding!)
      if (obj.type !== 'door' && !name.includes("초상화") && !name.includes("X-Ray") && !name.includes("해치")) {
        const aoPlane = new THREE.Mesh(getPlaneGeo(w + 0.35, d + 0.35), pm.aoMat);
        aoPlane.rotation.x = -Math.PI / 2;
        aoPlane.position.y = 0.006;
        group.add(aoPlane);
      }

      // Propagate objId to all physical child meshes
      group.traverse(child => {
        child.userData = child.userData || {};
        child.userData.objId = obj.id;
      });

      if (targetParent) {
        targetParent.add(group);
      } else {
        const roomGroup = unifiedBuildingGroup?.getObjectByName(`roomGroup_${obj.roomIdx}`);
        if (roomGroup) {
          roomGroup.add(group);
        } else {
          scene.add(group);
        }
      }
      meshMap.set(obj.id, group);
    }

    function syncObjectTo3D(obj) {
      create3DMeshForObject(obj);
      if (obj.isBossDoor) {
        const roomGroup = unifiedBuildingGroup?.getObjectByName(`roomGroup_${obj.roomIdx}`);
        if (roomGroup) {
          const doorLeaf = roomGroup.getObjectByName(`doorLeaf_${obj.roomIdx}`);
          if (doorLeaf) doorLeaf.rotation.y = obj.solved ? Math.PI / 2 : 0;
          const doorLamp = roomGroup.getObjectByName(`doorLamp_${obj.roomIdx}`);
          if (doorLamp && doorLamp.material) {
            const lampColor = obj.solved ? 0x10b981 : 0xef4444;
            doorLamp.material.color.setHex(lampColor);
            doorLamp.material.emissive.setHex(lampColor);
          }
        }
      }
      markSceneDirty();
    }

    // -------------------------------------------------------------
    // 8. ROOM SWITCHING & CINEMATIC CAMERA GLIDE ENGINE
    // -------------------------------------------------------------
    function updateCurrentRoomFromWorldPos(overrideX, overrideZ, overrideY) {
      const px = overrideX !== undefined ? overrideX : fpsState.pos.x;
      const pz = overrideZ !== undefined ? overrideZ : fpsState.pos.z;
      const py = overrideY !== undefined ? overrideY : fpsState.pos.y;

      for (let i = 0; i < ROOM_CONFIGS.length; i++) {
        const rc = ROOM_CONFIGS[i];
        const fH = rc.floorHeight;
        // Allow wider height tolerance for orbit mode target
        const hTolerance = (overrideY !== undefined) ? 3.5 : 1.3;
        if (Math.abs(py - (fH + 1.5)) < hTolerance) {
          if (px >= rc.worldX - 0.3 && px <= rc.worldX + rc.w + 0.3 &&
              pz >= rc.worldZ - 0.3 && pz <= rc.worldZ + rc.h + 0.3) {
            if (currentRoomIdx !== i) {
              onSeamlessRoomChange(i);
            }
            return;
          }
        }
      }
    }

    function onSeamlessRoomChange(newIdx) {
      if (newIdx < 0 || newIdx >= ROOM_CONFIGS.length) return;
      currentRoomIdx = newIdx;
      const rc = ROOM_CONFIGS[currentRoomIdx];
      roomW = rc.w;
      roomH = rc.h;

      document.getElementById('cad-current-layer-txt').textContent = `${rc.shortName} (${rc.layerLabel})`;
      document.getElementById('cad-passage-badge').textContent = rc.passageInfo;

      if (spotLight) spotLight.color.setHex(rc.lightColor);
      document.getElementById('hud-3d-atmosphere').textContent = `조명: ${rc.atmosphere}`;

      const banner = document.getElementById('cinematic-banner');
      const bannerTxt = document.getElementById('cinematic-banner-txt');
      const bannerIcon = document.getElementById('cinematic-banner-icon');
      if (banner) {
        banner.classList.remove('hidden');
        bannerIcon.textContent = "🚪";
        bannerTxt.textContent = `[${rc.fullName}] 진입 완료!`;
        setTimeout(() => { if (banner) banner.classList.add('hidden'); }, 1800);
      }

      renderRoomSidebarAndProgress();
      render2DCadObjects();
      const roomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);
      const firstUnsolved = roomObjs.find(o => !o.solved) || roomObjs[0];
      if (firstUnsolved) selectObject(firstUnsolved.id);
      updateCodeView();
      updateRoomVisibilityCulling();
      playSfx('unlock');
    }

    function switchRoom(roomIdx, isInitial = false) {
      if (roomIdx < 0 || roomIdx >= ROOM_CONFIGS.length) return;
      const prevRoomIdx = currentRoomIdx;
      if (!isInitial && prevRoomIdx === roomIdx) return;

      currentRoomIdx = roomIdx;
      const prevRc = ROOM_CONFIGS[prevRoomIdx >= 0 ? prevRoomIdx : 0];
      const rc = ROOM_CONFIGS[currentRoomIdx];
      roomW = rc.w;
      roomH = rc.h;

      document.getElementById('cad-current-layer-txt').textContent = `${rc.shortName} (${rc.layerLabel})`;
      document.getElementById('cad-passage-badge').textContent = rc.passageInfo;

      if (spotLight) spotLight.color.setHex(rc.lightColor);
      document.getElementById('hud-3d-atmosphere').textContent = `조명: ${rc.atmosphere}`;

      updateCadViewBox();

      const roomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);
      const firstUnsolved = roomObjs.find(o => !o.solved) || roomObjs[0];
      if (firstUnsolved) {
        selectObject(firstUnsolved.id);
      } else {
        renderRoomSidebarAndProgress();
        render2DCadObjects();
        syncSpaceEditorUI();
      }

      updateCodeView();
      playSfx('click');

      if (!isInitial && prevRoomIdx !== roomIdx && prevRoomIdx >= 0) {
        glideCameraTransition(prevRc, rc);
      } else {
        if (cameraMode === 'orbit' && orbitControls && camera) {
          orbitControls.target.set(rc.worldX + roomW / 2, rc.floorHeight + 1.2, rc.worldZ + roomH / 2);
          camera.position.set(rc.worldX + roomW / 2, rc.floorHeight + 6.2, rc.worldZ + roomH + 4.2);
        } else if (cameraMode === 'fps') {
          fpsState.pos.copy(getSafeFpsSpawnPos(currentRoomIdx));
        }
      }
      updateRoomVisibilityCulling();
      markSceneDirty();
    }

    function glideCameraTransition(prevRc, targetRc) {
      if (isCinematicTransitioning) return;
      isCinematicTransitioning = true;

      const banner = document.getElementById('cinematic-banner');
      const bannerTxt = document.getElementById('cinematic-banner-txt');
      const bannerIcon = document.getElementById('cinematic-banner-icon');

      const isSameFloor = (prevRc.floorId === targetRc.floorId);
      const floor = FLOOR_CONFIGS[prevRc.floorId] || FLOOR_CONFIGS["1f"];

      if (banner) {
        banner.classList.remove('hidden');
        if (isSameFloor) {
          bannerIcon.textContent = "🚪";
          bannerTxt.textContent = `[${floor.corridorName}] 복도를 지나 [${targetRc.shortName}](으)로 진입 중...`;
        } else {
          bannerIcon.textContent = "🕳️";
          bannerTxt.textContent = `[수직 갱도 통로] 층간 이동하여 [${targetRc.shortName}](으)로 진입 중...`;
        }
      }

      const startPos = camera.position.clone();
      const startTarget = orbitControls ? orbitControls.target.clone() : new THREE.Vector3(prevRc.worldX + prevRc.w / 2, prevRc.floorHeight + 1.2, prevRc.worldZ + prevRc.h / 2);

      let endPos, endTarget;
      if (cameraMode === 'orbit') {
        endTarget = new THREE.Vector3(targetRc.worldX + targetRc.w / 2, targetRc.floorHeight + 1.2, targetRc.worldZ + targetRc.h / 2);
        endPos = new THREE.Vector3(targetRc.worldX + targetRc.w / 2, targetRc.floorHeight + 6.2, targetRc.worldZ + targetRc.h + 4.2);
      } else {
        fpsState.pos.copy(getSafeFpsSpawnPos(targetRc.idx));
        endPos = fpsState.pos.clone();
        endTarget = new THREE.Vector3(targetRc.worldX + targetRc.w / 2, targetRc.floorHeight + 1.5, targetRc.worldZ);
      }

      const duration = 1200;
      const startTime = performance.now();

      function glideStep(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        const t = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(startPos, endPos, t);
        if (orbitControls) {
          orbitControls.target.lerpVectors(startTarget, endTarget, t);
          orbitControls.update();
        }

        if (progress < 1.0) {
          requestAnimationFrame(glideStep);
        } else {
          isCinematicTransitioning = false;
          if (banner) banner.classList.add('hidden');
          playSfx('unlock');
        }
      }
      requestAnimationFrame(glideStep);
    }

    // -------------------------------------------------------------
    // 9. 1ST PERSON (FPS) SAFE SPAWN & SEAMLESS CONTINUOUS TRAVERSAL
    // -------------------------------------------------------------
    function getSafeFpsSpawnPos(roomIdx) {
      const idx = (roomIdx !== undefined) ? roomIdx : currentRoomIdx;
      const sp = SAFE_ROOM_SPAWNS[idx];
      if (sp) return new THREE.Vector3(sp.x, sp.y, sp.z);
      const rc = ROOM_CONFIGS[idx] || ROOM_CONFIGS[0];
      return new THREE.Vector3(rc.worldX + rc.w * 0.5, rc.floorHeight + 1.5, rc.worldZ + rc.h * 0.5);
    }

    function updateFpsMovement(dt) {
      if (isCinematicTransitioning) return;

      const forward = new THREE.Vector3(-Math.sin(fpsState.yaw), 0, -Math.cos(fpsState.yaw));
      const right = new THREE.Vector3(Math.cos(fpsState.yaw), 0, -Math.sin(fpsState.yaw));

      const moveDir = new THREE.Vector3(0, 0, 0);
      if (fpsState.moveForward) moveDir.add(forward);
      if (fpsState.moveBackward) moveDir.sub(forward);
      if (fpsState.moveRight) moveDir.add(right);
      if (fpsState.moveLeft) moveDir.sub(right);

      const isMoving = moveDir.lengthSq() > 0;
      if (isMoving) {
        moveDir.normalize();
        applyFpsMovementWithSliding(moveDir, dt);

        const bobSpeed = 7.2;
        const prevPhase = walkBobPhase;
        walkBobPhase += dt * bobSpeed;

        // Clean footstep sync with bottom of each stride cycle (sin(walkBobPhase * 2) minimums)
        if (Math.floor((walkBobPhase + Math.PI * 0.25) / Math.PI) > Math.floor((prevPhase + Math.PI * 0.25) / Math.PI)) {
          playSfx('step');
        }
      } else {
        updateCurrentRoomFromWorldPos();
      }

      // Smooth realistic human stride camera motion (vertical bob, lateral sway, gentle roll tilt)
      const targetBobY = isMoving ? Math.sin(walkBobPhase * 2) * 0.042 : 0.0;
      const targetSwayX = isMoving ? Math.cos(walkBobPhase) * 0.018 : 0.0;
      const targetTiltZ = isMoving ? Math.cos(walkBobPhase) * 0.007 : 0.0;

      const lerpSpeed = Math.min(1.0, dt * 10.0);
      currentBobY += (targetBobY - currentBobY) * lerpSpeed;
      currentSwayX += (targetSwayX - currentSwayX) * lerpSpeed;
      currentTiltZ += (targetTiltZ - currentTiltZ) * lerpSpeed;

      camera.position.copy(fpsState.pos);
      camera.position.addScaledVector(right, currentSwayX);
      camera.position.y += currentBobY;

      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.x = fpsState.pitch;
      euler.y = fpsState.yaw;
      euler.z = currentTiltZ;
      camera.quaternion.setFromEuler(euler);

      checkFpsProximity();
    }

    function applyFpsMovementWithSliding(moveDir, dt) {
      const speed = fpsState.speed || 3.5;
      const stepX = moveDir.x * speed * dt;
      const stepZ = moveDir.z * speed * dt;
      const pR = 0.18;

      function isBlockedAtWorld(wx, wz, wy) {
        // Gate Lock: Room 2 (1F 격리병동) East doorway into stairwell
        // In isBlockedAtWorld(), BLOCK crossing x >= 22.15 from Room 2 into the stairwell if Q15 is NOT solved!
        if (wx >= 22.15 && wz >= 1.75 && wz <= 3.25 && wy < 2.5) {
          const q15 = studioObjects.find(o => o.qNum === 15 || o.id === "prop-r3-15");
          if (!q15 || !q15.solved) {
            return true;
          }
        }

        let inWalkableZone = false;

        // 1. Dynamic Check for All Rooms in ROOM_CONFIGS
        for (let r = 0; r < ROOM_CONFIGS.length; r++) {
          const rc = ROOM_CONFIGS[r];
          const fH = rc.floorHeight || 0.0;
          if (Math.abs(wy - (fH + 1.5)) < 1.0) {
            // Main room floor interior
            if (wx >= rc.worldX + 0.15 && wx <= rc.worldX + rc.w - 0.15 &&
                wz >= rc.worldZ + 0.15 && wz <= rc.worldZ + rc.h - 0.15) {
              inWalkableZone = true;
              break;
            }

            // Doorways: West door & East door clearances
            const doorZStart = Math.max(1.0, (rc.h - 1.2) / 2);
            const doorZEnd = doorZStart + 1.2;
            const inDoorZ = (wz >= doorZStart - 0.15 && wz <= doorZEnd + 0.15);

            const objOps = collectWallOpenings(rc);
            let doorPass = false;
            for (const op of objOps.W.concat(objOps.E)) {
              if (!op.obj || (op.obj.isBossDoor && !op.obj.solved)) continue;
              const wallX = rc.worldX + (objOps.W.includes(op) ? 0 : rc.w);
              if (Math.abs(wx - wallX) <= 0.6 && Math.abs(wz - (rc.worldZ + op.c)) <= 0.75) { doorPass = true; break; }
            }
            if (doorPass) {
              inWalkableZone = true;
              break;
            }

            if (inDoorZ) {
              if (rc.hasWestDoor && wx >= rc.worldX - 0.6 && wx <= rc.worldX + 0.6) {
                inWalkableZone = true;
                break;
              }
              if (rc.hasEastDoor !== false && wx >= rc.worldX + rc.w - 0.6 && wx <= rc.worldX + rc.w + 0.6) {
                if (rc.idx === 3) {
                  // Room 3 (2F 영안실) East doorway connects directly to 2F stairwell landing/bridge (always open)
                  inWalkableZone = true;
                  break;
                }
                const bossDoor = studioObjects.find(o => o.roomIdx === rc.idx && o.isBossDoor);
                if (!bossDoor || bossDoor.solved) {
                  inWalkableZone = true;
                  // If final exit door in last room is cleared and player walks through
                  if (rc.idx === ROOM_CONFIGS.length - 1 && wx >= rc.worldX + rc.w - 0.1) {
                    showVictoryModal();
                  }
                  break;
                }
              }
            }
          }
        }

        // 2~5. Asylum 404-specific corridors, stairwell & vertical teleports
        if (activeThemeId === 'asylum-404') {
        // 2. 1F Unified Corridor
        const c1f = FLOOR_CONFIGS["1f"]?.corridor;
        if (!inWalkableZone && c1f && Math.abs(wy - 1.5) < 1.0) {
          if (wx >= c1f.x - 0.1 && wx <= c1f.x + c1f.w + 0.1 &&
              wz >= c1f.z + 0.15 && wz <= c1f.z + c1f.h - 0.15) {
            inWalkableZone = true;
          }
        }

        // 3. 2F Unified Corridor
        const c2f = FLOOR_CONFIGS["2f"]?.corridor;
        if (!inWalkableZone && c2f && Math.abs(wy - 4.1) < 1.0) {
          if (wx >= c2f.x - 0.1 && wx <= c2f.x + c2f.w + 0.1 &&
              wz >= c2f.z + 0.15 && wz <= c2f.z + c2f.h - 0.15) {
            inWalkableZone = true;
          }
        }

        // 4. Real 2-Story Stairwell (Connecting 1F Room 2 at x=22.5 to 2F Room 3 at x=22.5)
        if (!inWalkableZone && wx >= 22.4 && wx <= 24.85 && wz >= 0.25 && wz <= 4.75) {
          const q15 = studioObjects.find(o => o.qNum === 15 || o.id === "prop-r3-15");
          if (!q15 || q15.solved) {
            let isStairWalkable = false;
            if (wx >= 23.05) {
              // Walking north (decreasing z from 3.85 to 1.1) along the stairs (x >= 23.1)
              isStairWalkable = true;
              if (wz >= 3.85) {
                fpsState.pos.y = 1.5;
              } else if (wz <= 1.1) {
                fpsState.pos.y = 4.1;
              } else {
                const progress = Math.max(0, Math.min(1, (3.85 - wz) / (3.85 - 1.1)));
                fpsState.pos.y = 1.5 + progress * 2.6;
              }
            } else if (wy >= 3.5 || (wz <= 1.3 && fpsState.pos.y >= 3.5)) {
              // 2F landing (z <= 1.3) or bridge (x: 22.5..23.3, z: 0.3..3.2) when y >= 3.6
              if (wz <= 3.25) {
                isStairWalkable = true;
                fpsState.pos.y = 4.1;
              }
            } else if (wy < 2.5) {
              // 1F ground in stairwell (x < 23.05)
              isStairWalkable = true;
              fpsState.pos.y = 1.5;
            }

            if (isStairWalkable) {
              inWalkableZone = true;
            }
          }
        }

        // 5. Alternate vertical teleports (Ladder/Hatch/Lift) for shortcut/fallback
        if (Math.abs(wy - 1.5) < 0.8) {
          const q10 = studioObjects.find(o => o.qNum === 10);
          if (q10 && q10.solved && wx >= 13.8 && wx <= 14.8 && wz >= 3.3 && wz <= 4.3) {
            fpsState.pos.y = 1.5;
            fpsState.pos.x = 17.5;
            fpsState.pos.z = 2.5;
            onSeamlessRoomChange(2);
            return false;
          }
        } else if (Math.abs(wy - 4.1) < 0.8) {
          const q25 = studioObjects.find(o => o.qNum === 25);
          if (q25 && q25.solved && wx >= 15.8 && wx <= 16.8 && wz >= 3.4 && wz <= 4.6) {
            fpsState.pos.y = 4.1;
            fpsState.pos.x = 4.5;
            fpsState.pos.z = 2.5;
            onSeamlessRoomChange(5);
            return false;
          }
        }
        }

        if (!inWalkableZone) return true;

        // 6. Check Interior Partitions in current room (Penetration Defense with Anti-Stuck Escape)
        const rc = ROOM_CONFIGS[currentRoomIdx];
        if (rc) {
          const roomParts = ROOM_PARTITIONS.filter(p => p.roomIdx === rc.idx);
          for (const part of roomParts) {
            const px1 = rc.worldX + part.x1;
            const pz1 = rc.worldZ + part.z1;
            const px2 = rc.worldX + part.x2;
            const pz2 = rc.worldZ + part.z2;
            const curDist = distToSegment(fpsState.pos.x, fpsState.pos.z, px1, pz1, px2, pz2);
            const newDist = distToSegment(wx, wz, px1, pz1, px2, pz2);
            if (newDist < pR + 0.05 && newDist <= curDist) {
              return true;
            }
          }
        }

        // 7. Check Furniture AABB in all rooms (Penetration Defense with Anti-Stuck Escape)
        for (const obj of studioObjects) {
          if (obj.type === 'door' || obj.type === 'ladder') continue;
          const oRc = ROOM_CONFIGS[obj.roomIdx];
          if (!oRc) continue;
          if (Math.abs(wy - (oRc.floorHeight + 1.5)) > 0.8) continue;

          const owx = oRc.worldX + obj.x;
          const owz = oRc.worldZ + obj.z;
          const rotY = getNaturalObjectRotation(obj, oRc.w, oRc.h);
          const isQuarter = Math.abs(Math.sin(rotY)) > 0.7;
          const effW = isQuarter ? (obj.d || 0.6) : (obj.w || 0.8);
          const effD = isQuarter ? (obj.w || 0.8) : (obj.d || 0.6);
          const halfW = effW * 0.45 + pR;
          const halfD = effD * 0.45 + pR;

          const curDx = Math.abs(fpsState.pos.x - owx);
          const curDz = Math.abs(fpsState.pos.z - owz);
          const newDx = Math.abs(wx - owx);
          const newDz = Math.abs(wz - owz);

          if (newDx < halfW && newDz < halfD && (newDx <= curDx || newDz <= curDz)) {
            return true;
          }
        }

        return false;
      }

      function distToSegment(px, pz, x1, z1, x2, z2) {
        const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1);
        if (l2 === 0) return Math.hypot(px - x1, pz - z1);
        let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), pz - (z1 + t * (z2 - z1)));
      }

      // 1. Independent X-Axis Movement (Permits Wall & Partition Sliding)
      const testX = fpsState.pos.x + stepX;
      if (!isBlockedAtWorld(testX, fpsState.pos.z, fpsState.pos.y)) {
        fpsState.pos.x = testX;
      }

      // 2. Independent Z-Axis Movement (Permits Wall & Partition Sliding)
      const testZ = fpsState.pos.z + stepZ;
      if (!isBlockedAtWorld(fpsState.pos.x, testZ, fpsState.pos.y)) {
        fpsState.pos.z = testZ;
      }

      // 3. Live Room Tracking based on player world position
      updateCurrentRoomFromWorldPos();
    }

    let nearestInteractable = null;
    const _fpsRaycaster = new THREE.Raycaster();
    const _fpsCenterNdc = new THREE.Vector2(0, 0);
    const _fpsObjWorldPos = new THREE.Vector3();
    const _fpsCamForward = new THREE.Vector3();
    const _fpsToObj = new THREE.Vector3();

    function checkFpsProximity() {
      const promptEl = document.getElementById('fps-prompt');
      const promptTxt = document.getElementById('fps-prompt-txt');
      nearestInteractable = null;

      if (cameraMode !== 'fps' || !camera) {
        if (promptEl) promptEl.classList.add('hidden');
        return;
      }

      // 1인칭 화면 정중앙(크로스헤어) 기준 정밀 레이캐스팅 (Aim-Line Grounding)
      _fpsRaycaster.setFromCamera(_fpsCenterNdc, camera);
      _fpsRaycaster.far = 3.5; // 최대 인터랙션 사거리 3.5m

      const hitables = Array.from(meshMap.values());
      const hits = _fpsRaycaster.intersectObjects(hitables, true);

      if (hits.length > 0) {
        let matchedObjId = null;
        for (const hit of hits) {
          let cur = hit.object;
          while (cur && cur !== scene) {
            if (cur.userData && cur.userData.objId) {
              matchedObjId = cur.userData.objId;
              break;
            }
            cur = cur.parent;
          }
          if (matchedObjId) break;
        }

        if (matchedObjId) {
          const obj = studioObjects.find(o => o.id === matchedObjId);
          if (obj) {
            const rc = ROOM_CONFIGS[obj.roomIdx];
            if (rc) {
              _fpsObjWorldPos.set(rc.worldX + obj.x, rc.floorHeight + (obj.y !== undefined ? obj.y : 1.2), rc.worldZ + obj.z);
            } else {
              _fpsObjWorldPos.set(obj.x, 1.2, obj.z);
            }
            const dist = camera.position.distanceTo(_fpsObjWorldPos);
            if (dist <= 3.8) {
              nearestInteractable = obj;
            }
          }
        }
      }

      // Fallback: If direct crosshair ray did not hit mesh directly (e.g. small prop / slight aim offset),
      // check if player is close to and facing an interactable object within 2.6m
      if (!nearestInteractable) {
        camera.getWorldDirection(_fpsCamForward);
        let closestDist = 2.6;
        for (const obj of studioObjects) {
          const rc = ROOM_CONFIGS[obj.roomIdx];
          if (!rc) continue;
          _fpsObjWorldPos.set(
            rc.worldX + obj.x,
            rc.floorHeight + (obj.y !== undefined ? obj.y : 1.2),
            rc.worldZ + obj.z
          );
          _fpsToObj.copy(_fpsObjWorldPos).sub(camera.position);
          const dist = _fpsToObj.length();
          if (dist < closestDist) {
            _fpsToObj.normalize();
            const dot = _fpsCamForward.dot(_fpsToObj);
            if (dot > 0.72) {
              closestDist = dist;
              nearestInteractable = obj;
            }
          }
        }
      }

      if (nearestInteractable) {
        if (promptEl) promptEl.classList.remove('hidden');
        if (promptTxt) {
          const qCode = `Q${String(nearestInteractable.qNum).padStart(2, '0')}`;
          promptTxt.textContent = `[E 키 / 클릭] [${qCode}] ${nearestInteractable.name} 퍼즐 풀기`;
        }
      } else {
        if (promptEl) promptEl.classList.add('hidden');
      }
    }

    function handleFpsInteraction() {
      if (nearestInteractable) {
        if (currentRoomIdx !== nearestInteractable.roomIdx && nearestInteractable.roomIdx >= 0 && nearestInteractable.roomIdx < ROOM_CONFIGS.length) {
          onSeamlessRoomChange(nearestInteractable.roomIdx);
        }
        selectObject(nearestInteractable.id);
        openLockModalForObject(nearestInteractable.id);
      }
    }

    function applyGenreAtmosphere(mode = cameraMode) {
      const isFps = (mode === 'fps');
      const genre = activeThemeGenre || 'Horror';

      if (genre === 'Adventure') {
        // Bright game-show studio (Quiz Room): high ambient/hemi, no fog, flashlight OFF
        if (ambientLight) ambientLight.intensity = 0.55;
        if (hemiLight) hemiLight.intensity = 0.65;
        if (scene) {
          scene.environmentIntensity = 0.45;
          scene.fog = null;
          scene.background = new THREE.Color(0x162033);
        }
        setFpsLightingMultiplier(1.0);
        if (flashlight) {
          flashlight.intensity = 0;
          flashlight.castShadow = false;
        }
      } else if (genre === 'Mystery') {
        // Noir detective mood (Crime Scene): subtle noir haze + inspection torch
        if (ambientLight) ambientLight.intensity = isFps ? 0.14 : 0.22;
        if (hemiLight) hemiLight.intensity = isFps ? 0.16 : 0.24;
        if (scene) {
          scene.environmentIntensity = isFps ? 0.18 : 0.24;
          scene.fog = isFps ? new THREE.FogExp2(0x090b10, 0.045) : null;
          scene.background = new THREE.Color(0x090b10);
        }
        setFpsLightingMultiplier(isFps ? 0.85 : 1.0);
        if (flashlight) {
          flashlight.intensity = 38;
          flashlight.distance = 22;
          flashlight.angle = Math.PI / 5.4;
          flashlight.penumbra = 0.48;
          flashlight.castShadow = isFps;
        }
      } else {
        // Horror (Asylum 404): deep dark FPS + heavy FogExp2 + high-power 42 flashlight
        if (ambientLight) ambientLight.intensity = isFps ? 0.04 : 0.14;
        if (hemiLight) hemiLight.intensity = isFps ? 0.04 : 0.14;
        if (scene) {
          scene.environmentIntensity = isFps ? 0.06 : 0.18;
          scene.fog = isFps ? new THREE.FogExp2(0x030508, 0.13) : null;
          scene.background = new THREE.Color(isFps ? 0x030508 : 0x090d16);
        }
        setFpsLightingMultiplier(isFps ? 0.62 : 1.0);
        if (flashlight) {
          flashlight.intensity = 42;
          flashlight.distance = 24;
          flashlight.angle = Math.PI / 5.8;
          flashlight.penumbra = 0.42;
          flashlight.castShadow = isFps;
        }
      }
      syncShadowMapAutoUpdate();
      markSceneDirty();
    }

    function setCameraMode(mode) {
      cameraMode = mode;
      const btnOrbit = document.getElementById('cam-mode-orbit');
      const btnFps = document.getElementById('cam-mode-fps');
      const crosshair = document.getElementById('fps-crosshair');
      const helpOrbit = document.getElementById('help-orbit-txt');
      const helpFps = document.getElementById('help-fps-txt');
      const hud = document.getElementById('pointerlock-hud');

      if (mode === 'orbit') {
        const promptEl = document.getElementById('fps-prompt');
        if (promptEl) promptEl.classList.add('hidden');
        if (hud) hud.classList.add('hidden');
        nearestInteractable = null;
        orbitControls.enabled = true;
        camera.fov = 50; camera.updateProjectionMatrix();
        btnOrbit.className = "px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-100";
        btnFps.className = "px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200";
        crosshair.classList.add('hidden');
        helpOrbit.classList.remove('hidden');
        helpFps.classList.add('hidden');
        const rc = ROOM_CONFIGS[currentRoomIdx] || ROOM_CONFIGS[0];
        const wx = rc ? (rc.worldX || 0) : 0;
        const wz = rc ? (rc.worldZ || 0) : 0;
        const fh = rc ? (rc.floorHeight || 0) : 0;
        camera.position.set(wx + roomW / 2, fh + 7.8, wz + roomH + 5.5);
        camera.rotation.set(0, 0, 0);
        orbitControls.target.set(wx + roomW / 2, fh + 1.2, wz + roomH / 2);
        renderer.domElement.style.cursor = 'default';

        // Reset walking bobbing & tilt
        walkBobPhase = 0;
        currentBobY = 0;
        currentSwayX = 0;
        currentTiltZ = 0;

        applyGenreAtmosphere('orbit');
      } else {
        orbitControls.enabled = false;
        camera.fov = 75; camera.updateProjectionMatrix();
        btnFps.className = "px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-100";
        btnOrbit.className = "px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200";

        applyGenreAtmosphere('fps');

        // Immediately engage pointer lock on user click gesture (Zero extra click required)
        try {
          renderer.domElement.focus?.();
          const p = renderer.domElement.requestPointerLock?.();
          if (p && p.catch) p.catch(() => {});
        } catch (e) {}

        if (document.pointerLockElement === renderer.domElement) {
          crosshair.classList.remove('hidden');
          renderer.domElement.style.cursor = 'none';
        } else {
          crosshair.classList.add('hidden');
          renderer.domElement.style.cursor = 'grab';
        }
        helpOrbit.classList.add('hidden');
        helpFps.classList.remove('hidden');
        if (hud) {
          hud.className = "absolute top-10 right-3 bg-slate-950/90 border border-amber-500/60 text-amber-300 px-2.5 py-1 rounded text-[10px] font-mono z-20 flex items-center gap-1.5 pointer-events-none";
          hud.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>👆 화면 클릭: 1인칭 락 | 드래그: 시점 회전</span>';
          hud.classList.remove('hidden');
        }
        fpsState.pos.copy(getSafeFpsSpawnPos(currentRoomIdx));
        fpsState.yaw = 0; fpsState.pitch = -0.1;
      }
      rebuild3DRoom();
      playSfx('click');
    }

    function enterFpsMode() {
      setViewLayout('split');
      setCameraMode('fps');
    }

    // -------------------------------------------------------------
    // 9. UNIVERSAL 30-PUZZLES INTERACTIVE MODAL ENGINE
    // -------------------------------------------------------------
    let activeModalObjId = null;
    const dialChars = ['0', '0', '0', '0'];
    let dirInputCursor = 0;

    function isAnyModalOpen() {
      const lockModal = document.getElementById('lock-modal');
      const vicModal = document.getElementById('victory-modal');
      const impModal = document.getElementById('import-modal');
      const catModal = document.getElementById('craft-catalog-modal');
      return (catModal && !catModal.classList.contains('hidden')) ||
             (lockModal && !lockModal.classList.contains('hidden')) ||
             (vicModal && !vicModal.classList.contains('hidden')) ||
             (impModal && !impModal.classList.contains('hidden'));
    }

    function openPuzzleModalForSelected() {
      if (!selectedObjectId) return;
      openLockModalForObject(selectedObjectId);
    }

    let modalHintStage = 0;

    function getStage1Hint(obj) {
      if (obj && obj.customHint && obj.customHint.trim()) return obj.customHint.trim();
      if (activeThemeId !== 'asylum-404') {
        if (obj && obj.visualSpec && obj.visualSpec.highlight) {
          return `핵심 포인트: ${obj.visualSpec.highlight}`;
        }
        return "단서 문구와 연결된 물리 소품의 숫자·방향·기호를 순서대로 조합해 보세요.";
      }
      const q = obj.qNum;
      const customHints = {
        1: "월요일(14일)에서 목요일(17일)까지 3일이 지났습니다. 목요일에서 일요일까지 며칠이 더 지나야 할까요? 북쪽 벽시계의 오후 시각과 비교해 보세요.",
        2: "병동 알파벳(A~D)을 1~4 숫자로 1:1 치환한 뒤, 이송 경로 순서대로 나열하세요.",
        3: "순찰 방향(북·동·남·서)을 영문 방향키 약어(U·R·D·L)로 바꾸세요. 접수대 위 머그잔 손잡이 방향과도 같습니다.",
        4: "원무과(100) + 약제실(250) + 보정치(54)를 모두 더한 3자리 숫자 맨 앞에 지역코드 0을 붙이세요.",
        5: "병원 폐쇄 연도(1994)에서 방금 알아낸 진료실 내선번호(404)를 뺄셈하세요.",
        6: "3시 정각일 때 12시를 향한 분침과 3시를 향한 시침이 이루는 각도는 몇 도일까요? 3자리(앞 0 포함) 뒤에 시침 숫자를 붙이세요.",
        7: "좌측 반점의 숫자 4개를 거울에 비춘 것처럼 오른쪽에서 왼쪽(역순)으로 읽으세요.",
        8: "1시간에 4회씩 24시간 동안 총 몇 번 비명을 질렀는지 곱한 뒤, 뒤에 피험자 번호를 두 번 이어 붙이세요.",
        9: "진열장 4개 약품명의 맨 앞 영문 대문자 4글자를 순서대로 조합하세요.",
        10: "10 × 20 × 30 × 40을 먼저 계산한 뒤, 결과 숫자의 맨 앞 4자리만 입력합니다.",
        11: "로마 숫자 IV(4), IX(9), II(2), VI(6)의 표기 규칙을 떠올려 아라비아 숫자로 바꾸세요.",
        12: "바른 정(正)자 한 글자는 5획입니다. 각 열의 총 획수를 세어 숫자를 이어 적은 뒤 앞 4자리를 취하세요.",
        13: "매 회차마다 일정한 양(125mg)이 증가하는 등차수열입니다. 3차(375)에 공차를 더한 뒤 앞자리 0을 붙여 4자리로 만드세요.",
        14: "파형의 움직임(상승·하강·상승·우측)을 방향키 약어(U/D/L/R)로 순서대로 옮기세요.",
        15: "정상 체온 숫자 3개에서 소수점을 빼고, 맨 뒤에 심장 박동 정지 코드 1자리를 붙이세요.",
        16: "3×3 격자(1~9)의 주대각선(좌상단→중앙→우하단) 숫자 3개 뒤에 층수(2)를 이어 붙이세요.",
        17: "발견 시각(23시 40분)에서 시신이 냉각된 시간(8시간)만큼 거꾸로 빼면 사망 시각(HHMM)이 나옵니다.",
        18: "필름 A와 필름 B의 빈칸(_)을 서로 겹쳐 메우면 4자리 숫자가 완성됩니다.",
        19: "뇌(1400) + 심장(350) + 안구(30) 세 표본의 무게를 모두 더하세요.",
        20: "성인 인간의 총 뼈 개수는 206개입니다. 뒤에 도감 권수(8)를 이어 붙이세요.",
        21: "영단어 LIFE의 각 알파벳을 안내된 전화기 키패드 숫자로 1:1 치환하세요.",
        22: "초상화 눈동자에 UV 빛을 비췄을 때 떠오른 영문 4글자를 그대로 입력하세요.",
        23: "A형 → B형 → AB형 → O형 순서대로 적힌 방울 수를 4자리로 나열하세요.",
        24: "체스판 위 나이트가 남긴 4단계 핏자국 화살표 방향을 U/D/L/R로 순서대로 입력하세요.",
        25: "220과 380을 더한 값(600)을 10으로 나눈 2자리 숫자 앞뒤에 각각 0과 지하층수(2)를 붙이세요.",
        26: "현재 압력(1250)에서 초과분(450)을 뺀 3자리 숫자 앞에 0을 붙여 4자리로 입력하세요.",
        27: "배관 도면에 각인된 4개의 화살표 방향을 U/D/L/R로 순서대로 입력하세요.",
        28: "좌측 카드 파편의 2자리와 우측 카드 파편의 2자리를 순서대로 이어 붙이세요.",
        29: "매뉴얼에 적힌 4기통 실린더의 점화 폭발 순서를 그대로 4자리로 입력하세요.",
        30: "이 폐쇄병동의 호실 번호(3자리) 뒤에 최종 탈출 승인 코드(0)를 이어 붙이세요."
      };
      return customHints[q] || "단서 문구와 연결된 물리 소품의 숫자·방향·기호를 순서대로 조합해 보세요.";
    }

    function advanceModalHint() {
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return;
      const s1 = document.getElementById('modal-hint-stage1');
      const s2 = document.getElementById('modal-hint-stage2');
      const btn = document.getElementById('btn-modal-hint');

      if (modalHintStage === 0) {
        modalHintStage = 1;
        if (s1) {
          s1.textContent = `1차 힌트: ${getStage1Hint(obj)}`;
          s1.classList.remove('hidden');
        }
        if (btn) btn.textContent = '정답 공개 (2/2)';
      } else if (modalHintStage === 1) {
        modalHintStage = 2;
        if (s2) {
          document.getElementById('modal-prob-rule').textContent = `풀이: ${obj.probRule}  |  정답 코드: ${obj.passcode}`;
          s2.classList.remove('hidden');
        }
        if (btn) {
          btn.textContent = '정답 공개됨';
          btn.disabled = true;
          btn.className = 'px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-zinc-500 text-[11px] font-medium cursor-not-allowed';
        }
      }
      playSfx('click');
    }

    // -------------------------------------------------------------
    // PHYSICAL MECHANISM DEVICES (Interactive Hardware Gimmicks)
    // -------------------------------------------------------------
    let deviceState = {
      q03Cups: [1, 2, 3, 0],           // 0:U, 1:R, 2:D, 3:L -> Target: [0, 1, 2, 3]
      q06Hour: 10, q06Min: 30,         // Target: 3:00
      q19Weights: [],                  // Selected specimen IDs -> Target sum: 1780g
      q26Psi: 1250, q26WheelDeg: 0     // Target: 800 PSI
    };

    function completePhysicalDevice(objId) {
      const obj = studioObjects.find(o => o.id === objId);
      if (!obj || obj.solved) return;
      const pass = (obj.passcode || '0000').toUpperCase();
      for (let i = 0; i < 4; i++) {
        dialChars[i] = pass[i] || '0';
        const el = document.getElementById('d' + i);
        if (el) el.textContent = dialChars[i];
      }
      checkLockSolution();
    }

    function rotateCupDevice(idx) {
      deviceState.q03Cups[idx] = (deviceState.q03Cups[idx] + 1) % 4;
      playSfx('click');
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (obj) renderRightDeviceControls(obj);
      if (deviceState.q03Cups.join(',') === '0,1,2,3') {
        completePhysicalDevice(obj.id);
      }
    }

    function adjustClockDevice(dh, dm) {
      deviceState.q06Hour = ((deviceState.q06Hour - 1 + dh + 12) % 12) + 1;
      deviceState.q06Min = (deviceState.q06Min + dm + 60) % 60;
      playSfx('click');
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (obj) renderRightDeviceControls(obj);
      const tgt = (obj && obj.mechanism && obj.mechanism.targetState) || { hour: 3, minute: 0 };
      const tgtH = ((Number(tgt.hour || 3) - 1) % 12) + 1;
      const tgtM = Number(tgt.minute || 0);
      if (deviceState.q06Hour === tgtH && deviceState.q06Min === tgtM) {
        completePhysicalDevice(obj.id);
      }
    }

    function toggleSpecimenWeight(specId, grams) {
      const idx = deviceState.q19Weights.findIndex(w => w.id === specId);
      if (idx >= 0) deviceState.q19Weights.splice(idx, 1);
      else deviceState.q19Weights.push({ id: specId, grams });
      playSfx('click');
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (obj) renderRightDeviceControls(obj);
      const sum = deviceState.q19Weights.reduce((acc, w) => acc + w.grams, 0);
      if (sum === 1780) {
        completePhysicalDevice(obj.id);
      }
    }

    function turnSteamValve(deltaPsi) {
      deviceState.q26Psi = Math.max(400, Math.min(1500, deviceState.q26Psi + deltaPsi));
      deviceState.q26WheelDeg += (deltaPsi < 0 ? -45 : 45);
      playSfx('click');
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (obj) renderRightDeviceControls(obj);
      if (deviceState.q26Psi === 800) {
        completePhysicalDevice(obj.id);
      }
    }

    // -------------------------------------------------------------
    // ONTOLOGY V2: ITEM INVENTORY (4-ATOM EFFECTS) + MECHANISM CONTRACT + DIRECTOR PERSONA
    // -------------------------------------------------------------
    const ITEM_CATALOG = {
      "item-cardkey":   { id: "item-cardkey",   name: "원무과 보안 카드키", consumable: false, rewardOnQNum: 1 },
      "item-battery":   { id: "item-battery",   name: "AA 건전지",         consumable: true,  rewardOnQNum: 4 },
      "item-bear-head": { id: "item-bear-head", name: "곰인형 머리",       consumable: true,  rewardOnQNum: 8 },
      "item-uv-empty":  { id: "item-uv-empty",  name: "방전된 UV 손전등",  consumable: true,  rewardOnQNum: 17 },
      "item-uv-ready":  { id: "item-uv-ready",  name: "작동 UV 손전등",    consumable: false }
    };
    const DEFAULT_ITEM_CATALOG = JSON.parse(JSON.stringify(ITEM_CATALOG));

    const ITEM_INTERACTIONS = [
      { id: "ix-cardkey-r1", itemId: "item-cardkey",   targetQNum: 5,  effect: "unlock",     message: "보안 카드키를 리더기에 대자 1F 중앙 복도 철문이 열렸습니다!" },
      { id: "ix-bear-r2",    itemId: "item-bear-head", targetQNum: 10, effect: "activate",   message: "곰인형 머리를 해치 옆 받침대에 올리자 잠금 해제 신호가 울립니다!" },
      { id: "ix-combine-uv", itemId: "item-battery",   targetItemId: "item-uv-empty", effect: "combine", resultId: "item-uv-ready", message: "건전지를 장착해 [작동 UV 손전등]을 완성했습니다!" },
      { id: "ix-uv-r4",      itemId: "item-uv-ready",  targetQNum: 22, effect: "revealClue", message: "작동 UV 손전등으로 초상화를 비추자 숨겨진 코드가 선명히 드러납니다!" }
    ];
    const DEFAULT_ITEM_INTERACTIONS = JSON.parse(JSON.stringify(ITEM_INTERACTIONS));

    // 5대 물리 장치(Mechanism) 스키마를 대상 퍼즐에 선언적으로 결속
    const MECHANISM_REGISTRY = {
      3:  { kind: "rotary-dial",    targetState: [0, 1, 2, 3] },
      6:  { kind: "clock-hands",    targetState: { hour: 3, minute: 0 } },
      19: { kind: "balance-scale",  targetState: 1780, tolerance: 0 },
      22: { kind: "uv-scan",        targetState: { revealed: true } },
      26: { kind: "pressure-valve", targetState: 800, tolerance: 0 }
    };
    const DEFAULT_ASYLUM_SNAPSHOT = JSON.parse(JSON.stringify(studioObjects));

    /**
     * 기물 성격·위치에 맞는 다양한 물리 조명(desk-lamp · wall-sconce · pin-spot · emergency · ceiling)을
     * 자동 배치하고, 시작 문제(Q01)만 초기 점등 + 순차 해금 릴레이(onUnlockEffects)를 연결한다.
     * - jamsil-quiz-room(밝은 100문제 카페)에는 불필요한 개별 핀스포트를 추가하지 않는다.
     */
    function ensureContextualRoomLights() {
      if (activeThemeId === 'jamsil-quiz-room' || activeThemeGenre === 'Adventure') return;
      if (!Array.isArray(ROOM_CONFIGS) || ROOM_CONFIGS.length === 0 || !Array.isArray(studioObjects) || studioObjects.length === 0) return;

      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const nearestWall = (x, z, rw, rh) => {
        const cands = [
          { side: 'N', dist: z },
          { side: 'S', dist: rh - z },
          { side: 'W', dist: x },
          { side: 'E', dist: rw - x }
        ];
        cands.sort((a, b) => a.dist - b.dist);
        return cands[0];
      };

      const baseAmbientByRoom = new Map();
      ROOM_CONFIGS.forEach(rc => {
        if (!Array.isArray(rc.lights)) rc.lights = [];
        const base = rc.lights.find(lt => getLightTargetPropIds(lt).length === 0);
        if (base) baseAmbientByRoom.set(rc.idx, base.id);
      });

      const ordered = studioObjects.slice().sort((a, b) => (a.qNum || 0) - (b.qNum || 0));
      const lightByPropId = new Map();

      ordered.forEach((obj, idx) => {
        const rc = ROOM_CONFIGS[obj.roomIdx];
        if (!rc) return;
        const rw = rc.w || 6.0;
        const rh = rc.h || 5.0;
        const wh = rc.wallHeight || 2.6;
        const nm = obj.name || '';
        const nw = nearestWall(obj.x, obj.z, rw, rh);

        let fixtureType = 'pin-spot';
        if (obj.type === 'door' || obj.isBossDoor) {
          fixtureType = 'emergency';
        } else if (obj.type === 'desk' && !/침대|부검/.test(nm)) {
          fixtureType = 'desk-lamp';
        } else if (
          obj.type === 'clue' ||
          obj.type === 'artifact' ||
          obj.wallSnapped ||
          /시계|초상화|벽|X-Ray|라이트박스|게시판|월패드|전화|배전반/.test(nm)
        ) {
          fixtureType = 'wall-sconce';
        }

        let pos;
        let targetPos = null;
        let wallSide = null;
        let color = '#ffe4b5';
        let intensity = 2.0;
        let distance = 5.5;
        let flicker = false;

        if (fixtureType === 'desk-lamp') {
          const rot = obj.rotY || 0;
          const localDx = -Math.min(0.36, (obj.w || 1.0) * 0.28);
          const localDz = -Math.min(0.18, (obj.d || 0.7) * 0.22);
          const lx = clamp(obj.x + localDx * Math.cos(rot) - localDz * Math.sin(rot), 0.28, rw - 0.28);
          const lz = clamp(obj.z + localDx * Math.sin(rot) + localDz * Math.cos(rot), 0.28, rh - 0.28);
          pos = [Number(lx.toFixed(2)), 0.78, Number(lz.toFixed(2))];
          color = '#ffdfa0';
          intensity = 2.1;
          distance = 4.2;
        } else if (fixtureType === 'wall-sconce') {
          wallSide = nw.side;
          const sy = Number(Math.min(wh - 0.45, 2.02).toFixed(2));
          if (wallSide === 'N') pos = [Number(clamp(obj.x, 0.35, rw - 0.35).toFixed(2)), sy, 0.04];
          else if (wallSide === 'S') pos = [Number(clamp(obj.x, 0.35, rw - 0.35).toFixed(2)), sy, Number((rh - 0.04).toFixed(2))];
          else if (wallSide === 'W') pos = [0.04, sy, Number(clamp(obj.z, 0.35, rh - 0.35).toFixed(2))];
          else pos = [Number((rw - 0.04).toFixed(2)), sy, Number(clamp(obj.z, 0.35, rh - 0.35).toFixed(2))];
          color = '#ffe6bc';
          intensity = 1.9;
          distance = 5.2;
        } else if (fixtureType === 'emergency') {
          const ey = Number(Math.min(wh - 0.22, 2.34).toFixed(2));
          if (nw.dist <= 0.9) {
            wallSide = nw.side;
            if (wallSide === 'N') pos = [Number(clamp(obj.x, 0.35, rw - 0.35).toFixed(2)), ey, 0.04];
            else if (wallSide === 'S') pos = [Number(clamp(obj.x, 0.35, rw - 0.35).toFixed(2)), ey, Number((rh - 0.04).toFixed(2))];
            else if (wallSide === 'W') pos = [0.04, ey, Number(clamp(obj.z, 0.35, rh - 0.35).toFixed(2))];
            else pos = [Number((rw - 0.04).toFixed(2)), ey, Number(clamp(obj.z, 0.35, rh - 0.35).toFixed(2))];
          } else {
            pos = [Number(clamp(obj.x, 0.4, rw - 0.4).toFixed(2)), Number((wh - 0.16).toFixed(2)), Number(clamp(obj.z, 0.4, rh - 0.4).toFixed(2))];
          }
          color = '#ff4d2e';
          intensity = 1.85;
          distance = 5.2;
          flicker = true;
        } else {
          // pin-spot: ceiling spotlight offset slightly toward room center, aimed obliquely at prop
          const vx = (rw / 2) - obj.x;
          const vz = (rh / 2) - obj.z;
          const vlen = Math.hypot(vx, vz) || 1;
          const off = Math.min(0.50, vlen * 0.35);
          const px = clamp(obj.x + (vx / vlen) * off, 0.35, rw - 0.35);
          const pz = clamp(obj.z + (vz / vlen) * off, 0.35, rh - 0.35);
          pos = [Number(px.toFixed(2)), Number((wh - 0.16).toFixed(2)), Number(pz.toFixed(2))];
          targetPos = [Number(obj.x.toFixed(2)), 0.9, Number(obj.z.toFixed(2))];
          color = activeThemeGenre === 'Mystery' ? '#dceeff' : '#ffe8c2';
          intensity = 2.15;
          distance = 6.2;
        }

        let existing = rc.lights.find(lt => getLightTargetPropIds(lt).includes(obj.id));
        if (existing) {
          existing.kind = fixtureType;
          existing.fixtureType = fixtureType;
          existing.pos = pos;
          if (targetPos) existing.targetPos = targetPos; else delete existing.targetPos;
          if (wallSide) existing.wallSide = wallSide; else delete existing.wallSide;
          existing.initiallyOn = (idx === 0);
          lightByPropId.set(obj.id, existing.id);
        } else {
          const lightId = `light-q${String(obj.qNum || idx + 1).padStart(2, '0')}-${fixtureType}`;
          const entry = {
            id: lightId,
            kind: fixtureType,
            fixtureType,
            pos,
            color,
            intensity,
            distance,
            flicker,
            initiallyOn: (idx === 0),
            targetPropId: obj.id
          };
          if (targetPos) entry.targetPos = targetPos;
          if (wallSide) entry.wallSide = wallSide;
          rc.lights.push(entry);
          lightByPropId.set(obj.id, lightId);
        }
      });

      // Wire sequential relay onUnlockEffects (Q(i) unlock -> Q(i+1) light ON; room transition -> next room ambient ON & prev ambient OFF)
      for (let i = 0; i < ordered.length - 1; i++) {
        const cur = ordered[i];
        const nxt = ordered[i + 1];
        const nextLightId = lightByPropId.get(nxt.id);
        if (!nextLightId) continue;
        if (!Array.isArray(cur.onUnlockEffects)) cur.onUnlockEffects = [];
        if (!cur.onUnlockEffects.some(ef => ef && ef.kind === 'lightOn' && ef.targetId === nextLightId)) {
          cur.onUnlockEffects.push({ kind: 'lightOn', targetId: nextLightId, sfx: 'spark' });
        }
        if (nxt.roomIdx !== cur.roomIdx) {
          const nextAmb = baseAmbientByRoom.get(nxt.roomIdx);
          if (nextAmb && !cur.onUnlockEffects.some(ef => ef && ef.kind === 'lightOn' && ef.targetId === nextAmb)) {
            cur.onUnlockEffects.push({ kind: 'lightOn', targetId: nextAmb, sfx: 'spark' });
          }
          const prevAmb = baseAmbientByRoom.get(cur.roomIdx);
          if (prevAmb && prevAmb !== nextAmb && !cur.onUnlockEffects.some(ef => ef && ef.kind === 'lightOff' && ef.targetId === prevAmb)) {
            cur.onUnlockEffects.push({ kind: 'lightOff', targetId: prevAmb });
          }
        }
      }
    }

    function initProgressiveNarrativeDefaults() {
      // 방 내 순차 스토리 체인(requiresSolvedId), 기본 storyBeat 및 visualSpec 자동 결속
      for (let r = 0; r < ROOM_CONFIGS.length; r++) {
        const list = studioObjects.filter(o => o.roomIdx === r).sort((a, b) => a.qNum - b.qNum);
        for (let i = 0; i < list.length; i++) {
          const obj = list[i];
          if (MECHANISM_REGISTRY[obj.qNum] && !obj.mechanism) obj.mechanism = MECHANISM_REGISTRY[obj.qNum];
          if (i > 0 && obj.requiresSolvedId === undefined) obj.requiresSolvedId = list[i - 1].id;
          if (!obj.storyBeat) {
            obj.storyBeat = i < list.length - 1
              ? `[단서 연결] ${obj.name}에서 실마리를 찾았다. 이제 '${list[i + 1].name}' 쪽을 살펴보자.`
              : `[공간 돌파] ${obj.name}의 봉인이 풀렸다. 다음 구역으로 나아갈 수 있다.`;
          }
          if (!obj.visualSpec) {
            const tpl = (obj.carrierType === 'AudioVisual' || obj.type === 'console') ? 'crt'
              : (obj.carrierType === 'Trace' || obj.carrierType === 'PhysicalState') ? 'blueprint'
              : (obj.qNum % 3 === 0) ? 'photo'
              : 'document';
            obj.visualSpec = {
              template: tpl,
              title: `${obj.name} [Q${String(obj.qNum).padStart(2, '0')}]`,
              lines: [obj.cluePayload || '단서 내용을 관측하십시오.']
            };
          }
        }
      }
      ensureContextualRoomLights();
    }
    initProgressiveNarrativeDefaults();

    // -------------------------------------------------------------
    // ITERATION 8 SLICE 1: AUTHOR <-> PLAYTEST SNAPSHOT & PUZZLE CRUD
    // -------------------------------------------------------------
    let studioMode = 'author'; // 'author' | 'playtest'
    let authorSnapshot = null;

    function toggleStudioMode() {
      const btn = document.getElementById('btn-studio-mode');
      const dot = document.getElementById('studio-mode-dot');
      const label = document.getElementById('studio-mode-label');
      const leftActions = document.getElementById('author-left-actions');
      const sbLeft = document.getElementById('sidebar-left');
      const sbRight = document.getElementById('sidebar-right');

      const viewTabs = document.getElementById('view-layout-tabs');
      const btnCraft = document.getElementById('btn-craft-builder');
      const btnRacJson = document.getElementById('btn-rac-json');
      const btnToggleL = document.getElementById('btn-toggle-left');
      const btnToggleR = document.getElementById('btn-toggle-right');
      const craftHotbar = document.getElementById('craft-builder-hotbar');
      const playtestHud = document.getElementById('playtest-hud');

      if (studioMode === 'author') {
        // Author -> Playtest: 스냅샷 보존 + 진행 초기화 + 1인칭 3D 전면 진입 + 사이드바 접힘
        if (craftBuilder && craftBuilder.isActive()) {
          craftBuilder.deactivate();
        }

        authorSnapshot = {
          objects: JSON.parse(JSON.stringify(studioObjects)),
          inventory: Array.from(playerInventory),
          roomIdx: currentRoomIdx
        };
        studioMode = 'playtest';
        studioObjects.forEach(o => { o.solved = false; });
        playerInventory.clear();
        failureCount = 0;
        if (btn) btn.className = "bg-amber-950/80 hover:bg-amber-900 text-amber-200 font-semibold px-3 py-1.5 rounded-md text-xs border border-amber-500/40 flex items-center gap-1.5 transition-colors cursor-pointer";
        if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse";
        if (label) label.textContent = "제작으로 복귀";
        if (leftActions) leftActions.classList.add('hidden');
        if (sbLeft) sbLeft.classList.add('hidden');
        if (sbRight) sbRight.classList.add('hidden');

        // Play mode UI isolation: Hide all authoring tools
        if (viewTabs) viewTabs.classList.add('hidden');
        if (btnCraft) btnCraft.classList.add('hidden');
        if (btnRacJson) btnRacJson.classList.add('hidden');
        if (btnToggleL) btnToggleL.classList.add('hidden');
        if (btnToggleR) btnToggleR.classList.add('hidden');
        if (craftHotbar) craftHotbar.classList.add('hidden');
        if (playtestHud) playtestHud.classList.remove('hidden');
        setModalAuthorEditOpen(false);
        const modalEditBtn = document.getElementById('btn-modal-author-edit');
        if (modalEditBtn) modalEditBtn.classList.add('hidden');

        setViewLayout('3d-only');
        setCameraMode('fps');
        showDirectorWhisper("플레이테스트 시작: 1인칭 시점으로 전환되었습니다. 선행 단서를 풀어야 뒷 단계 단서가 열립니다.");
      } else {
        // Playtest -> Author: 보존된 편집 스냅샷 원복 + 2D/3D 분할 제작 화면 복귀
        if (document.pointerLockElement) document.exitPointerLock();
        if (authorSnapshot) {
          studioObjects.length = 0;
          authorSnapshot.objects.forEach(o => studioObjects.push(o));
          playerInventory.clear();
          authorSnapshot.inventory.forEach(id => playerInventory.add(id));
          currentRoomIdx = authorSnapshot.roomIdx;
        }
        studioMode = 'author';
        if (btn) btn.className = "bg-zinc-100 hover:bg-white text-zinc-950 font-semibold px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors cursor-pointer";
        if (dot) dot.className = "w-1.5 h-1.5 rounded-full bg-emerald-600";
        if (label) label.textContent = "플레이테스트";
        if (leftActions) leftActions.classList.remove('hidden');
        if (sbLeft) sbLeft.classList.remove('hidden');
        if (sbRight) sbRight.classList.remove('hidden');

        // Restore Creator Author UI
        if (viewTabs) viewTabs.classList.remove('hidden');
        if (btnCraft) btnCraft.classList.remove('hidden');
        if (btnRacJson) btnRacJson.classList.remove('hidden');
        if (btnToggleL) btnToggleL.classList.remove('hidden');
        if (btnToggleR) btnToggleR.classList.remove('hidden');
        if (craftHotbar) craftHotbar.classList.add('hidden');
        if (playtestHud) playtestHud.classList.add('hidden');

        setCameraMode('orbit');
        setViewLayout('split');
        showDirectorWhisper("제작 모드로 복귀했습니다. 편집 스냅샷이 원복되었습니다.");
      }
      renderInventoryHud();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      const first = studioObjects.find(o => o.roomIdx === currentRoomIdx);
      if (first) selectObject(first.id);
      updateCodeView();
    }

    function addNewPuzzleObject() {
      const roomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);
      const nextQ = studioObjects.reduce((m, o) => Math.max(m, o.qNum || 0), 0) + 1;
      const rc = ROOM_CONFIGS[currentRoomIdx] || ROOM_CONFIGS[0];
      const prevObj = roomObjs.length > 0 ? roomObjs[roomObjs.length - 1] : null;
      const newObj = {
        qNum: nextQ,
        id: `prop-custom-${Date.now().toString(36)}`,
        roomIdx: currentRoomIdx,
        type: "desk",
        name: `새 단서 기물 #${nextQ}`,
        x: Math.min(rc.w - 0.8, 1.2 + (roomObjs.length % 4) * 1.1),
        z: Math.min(rc.h - 0.8, 1.4 + Math.floor(roomObjs.length / 4) * 1.1),
        w: 0.9, d: 0.7, color: "#64748b", rotY: 0,
        clueId: `clue-c-${nextQ}`, carrierType: "Text",
        cluePayload: "여기에 플레이어가 관측할 단서 내용을 작성하세요.",
        probId: `prob-c-${nextQ}`, probRule: "사용자 정의 풀이 규칙",
        gateId: `gate-c-${nextQ}`, interfaceType: "MechanicalLock", passcode: "1234",
        unlocksId: `cont-c-${nextQ}`, unlocksName: "다음 단서 해금",
        isBossDoor: false, solved: false,
        requiresSolvedId: prevObj ? prevObj.id : null,
        storyBeat: `[새 스토리] 새 단서 기물 #${nextQ}의 비밀이 풀렸다.`,
        visualSpec: { template: "document", title: `단서 문서 #${nextQ}`, lines: ["여기에 플레이어가 관측할 단서 내용을 작성하세요."] }
      };
      studioObjects.push(newObj);
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      selectObject(newObj.id);
      updateCodeView();
      playSfx('click');
    }

    function deleteSelectedObject() {
      if (!selectedObjectId) return;
      deleteObjectById(selectedObjectId);
    }

    function deleteObjectById(id) {
      if (!id) return;
      const idx = studioObjects.findIndex(o => o.id === id);
      if (idx < 0) return;
      const delObj = studioObjects[idx];
      const delRc = ROOM_CONFIGS[delObj.roomIdx];
      const delInfo = delRc && getWallDoorInfo(delObj, delRc);
      if (delInfo) releaseNaturalOpening(delRc, delInfo); // deleted door: its wall opening seals shut
      detachDependentProps(delObj);
      carriedIds.delete(id);
      const removed = studioObjects.splice(idx, 1)[0];
      // 삭제된 오브젝트를 선행 조건으로 참조하던 항목 정리
      studioObjects.forEach(o => { if (o.requiresSolvedId === removed.id) o.requiresSolvedId = null; });
      if (selectedObjectId === id) {
        const next = studioObjects.find(o => o.roomIdx === currentRoomIdx) || studioObjects[0] || null;
        selectedObjectId = next ? next.id : null;
        if (next) updateInspectorValues(next);
      }
      rebuild3DRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      updateCodeView();
      scheduleStudioAutosave();
      playSfx('click');
      showDirectorWhisper(`[삭제 완료] '${removed.name}' 기물을 제거했습니다.`);
    }

    function startBlankTheme() {
      studioObjects.length = 0;
      playerInventory.clear();
      currentRoomIdx = 0;
      const starter = {
        qNum: 1, id: "prop-blank-01", roomIdx: 0, type: "desk", name: "첫 번째 단서 책상",
        x: 2.2, z: 2.0, w: 1.2, d: 0.7, color: "#64748b", rotY: 0,
        clueId: "clue-b1", carrierType: "Text",
        cluePayload: "빈 테마의 첫 번째 단서입니다. 우측 '제작자 편집'에서 단서와 정답, 스토리 파편을 자유롭게 바꿔보세요.",
        probId: "prob-b1", probRule: "기본 비밀번호 0404 입력",
        gateId: "gate-b1", interfaceType: "MechanicalLock", passcode: "0404",
        unlocksId: "door-blank-exit", unlocksName: "첫 번째 탈출구 해금",
        isBossDoor: true, solved: false, requiresSolvedId: null,
        storyBeat: "[스토리 시작] 첫 번째 자물쇠가 열리며 숨겨진 진실이 드러나기 시작했다.",
        visualSpec: { template: "document", title: "크리에이터 첫 번째 메모", lines: ["빈 테마의 첫 번째 단서입니다.", "정답 코드: 0404 (우측 패널에서 수정 가능)"] }
      };
      studioObjects.push(starter);
      renderInventoryHud();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      selectObject(starter.id);
      updateCodeView();
      showDirectorWhisper("새 빈 테마로 전환했습니다. 좌측 '+ 현재 방에 퍼즐/소품 추가'로 방탈출을 설계해 보세요.");
    }

    function restoreAsylumPreset() {
      try { localStorage.removeItem(STUDIO_AUTOSAVE_KEY); } catch (_) {}
      activeThemeId = 'asylum-404';
      activeThemeTitle = '폐쇄병동 404호: 심연의 해부학 (6방 30문제 풀 스케일)';
      activeThemeGenre = 'Horror';
      timeLimitSeconds = 60 * 60;
      timerElapsedSeconds = 0;
      failureCount = 0;
      ROOM_CONFIGS.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_ROOM_CONFIGS)).forEach(r => ROOM_CONFIGS.push(r));
      Object.keys(FLOOR_CONFIGS).forEach(k => delete FLOOR_CONFIGS[k]);
      Object.assign(FLOOR_CONFIGS, JSON.parse(JSON.stringify(DEFAULT_FLOOR_CONFIGS)));
      ROOM_PARTITIONS.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_ROOM_PARTITIONS)).forEach(p => ROOM_PARTITIONS.push(p));
      studioPassages.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_PASSAGES)).forEach(p => studioPassages.push(p));
      Object.keys(ITEM_CATALOG).forEach(k => delete ITEM_CATALOG[k]);
      Object.assign(ITEM_CATALOG, JSON.parse(JSON.stringify(DEFAULT_ITEM_CATALOG)));
      ITEM_INTERACTIONS.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_ITEM_INTERACTIONS)).forEach(ix => ITEM_INTERACTIONS.push(ix));
      directorPersona = { ...DEFAULT_DIRECTOR_PERSONA };
      PROP_ONTOLOGY.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_PROP_ONTOLOGY)).forEach(p => PROP_ONTOLOGY.push(p));
      studioObjects.length = 0;
      JSON.parse(JSON.stringify(DEFAULT_ASYLUM_SNAPSHOT)).forEach(o => studioObjects.push(o));
      initProgressiveNarrativeDefaults();
      playerInventory.clear();
      currentRoomIdx = 0;
      syncThemeHeaderUi();
      applyGenreAtmosphere(cameraMode);
      renderInventoryHud();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      switchRoom(0, true);
      syncSpaceEditorUI();
      renderAuthorItemsAndDirectorUI();
      if (studioObjects[0]) selectObject(studioObjects[0].id);
      updateCodeView();
      showDirectorWhisper("《폐쇄병동 404호》 6방 30문제 기본 프리셋을 복원했습니다.");
    }

    const playerInventory = new Set();

    function renderInventoryHud() {
      const listEl = document.getElementById('inv-slot-list');
      const cntEl = document.getElementById('inv-count-badge');
      const combBtn = document.getElementById('btn-inv-combine');

      const ptListEl = document.getElementById('playtest-inv-slots');
      const ptCntEl = document.getElementById('playtest-inv-count-badge');
      const ptCombBtn = document.getElementById('btn-playtest-inv-combine');

      const items = Array.from(playerInventory).map(id => ITEM_CATALOG[id]).filter(Boolean);
      if (cntEl) cntEl.textContent = `${items.length}개`;
      if (ptCntEl) ptCntEl.textContent = `${items.length}개`;

      const emptyHtml = '<span class="text-[10px] text-zinc-600">획득한 아이템 없음</span>';
      const itemsHtml = items.map(it => `
        <span class="px-2 py-0.5 rounded bg-zinc-900 border border-amber-500/30 text-amber-200 font-mono text-[10px]">
          ${it.name}${it.consumable ? '' : ' · 영구'}
        </span>
      `).join('');

      if (listEl) listEl.innerHTML = items.length === 0 ? emptyHtml : itemsHtml;
      if (ptListEl) ptListEl.innerHTML = items.length === 0 ? emptyHtml : itemsHtml;

      const canCombine = ITEM_INTERACTIONS.some(
        ix => ix.effect === 'combine' && playerInventory.has(ix.itemId) && playerInventory.has(ix.targetItemId)
      );
      if (combBtn) combBtn.classList.toggle('hidden', !canCombine);
      if (ptCombBtn) ptCombBtn.classList.toggle('hidden', !canCombine);
    }

    function grantRewardItemForPuzzle(obj) {
      const reward = Object.values(ITEM_CATALOG).find(it => it.rewardOnQNum === obj.qNum);
      if (!reward || playerInventory.has(reward.id)) return null;
      playerInventory.add(reward.id);
      renderInventoryHud();
      showDirectorWhisper(`[소지품 획득] ${reward.name}을(를) 챙겼습니다. 필요한 장치에서 적용해 보세요.`);
      return reward;
    }

    function combineEligibleInventoryItems() {
      const ix = ITEM_INTERACTIONS.find(
        r => r.effect === 'combine' && playerInventory.has(r.itemId) && playerInventory.has(r.targetItemId)
      );
      if (!ix) return;
      if (ITEM_CATALOG[ix.itemId]?.consumable) playerInventory.delete(ix.itemId);
      if (ITEM_CATALOG[ix.targetItemId]?.consumable) playerInventory.delete(ix.targetItemId);
      if (ix.resultId && ITEM_CATALOG[ix.resultId]) playerInventory.add(ix.resultId);
      playSfx('unlock');
      renderInventoryHud();
      showDirectorWhisper(ix.message);
    }

    function renderModalItemApplyBox(obj) {
      const box = document.getElementById('modal-item-apply-box');
      const list = document.getElementById('modal-item-apply-list');
      if (!box || !list) return;
      const eligible = ITEM_INTERACTIONS.filter(
        ix => ix.targetQNum === obj.qNum && playerInventory.has(ix.itemId) && !obj.solved
      );
      if (eligible.length === 0) {
        box.classList.add('hidden');
        list.innerHTML = '';
        return;
      }
      box.classList.remove('hidden');
      list.innerHTML = eligible.map(ix => {
        const it = ITEM_CATALOG[ix.itemId];
        return `<button onclick="applyInventoryItemToActiveModal('${ix.id}')" class="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-[11px] transition-colors">${it.name} 적용 (${ix.effect})</button>`;
      }).join('');
    }

    function applyInventoryItemToActiveModal(ixId) {
      const ix = ITEM_INTERACTIONS.find(r => r.id === ixId);
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!ix || !obj || !playerInventory.has(ix.itemId)) return;
      if (ITEM_CATALOG[ix.itemId]?.consumable) playerInventory.delete(ix.itemId);
      renderInventoryHud();
      showDirectorWhisper(ix.message);
      completePhysicalDevice(obj.id);
      renderModalItemApplyBox(obj);
    }

    // Director Persona (극중 인물: 404호 야간 당직 간호사) & 룰 기반 거래(Barter)
    let directorBarterState = { active: false, taps: 0, timerId: null };

    function showDirectorWhisper(text, showBarter = false) {
      const banner = document.getElementById('director-whisper-banner');
      const txtEl = document.getElementById('director-whisper-text');
      const barterBox = document.getElementById('director-barter-box');
      if (!banner || !txtEl) return;
      txtEl.textContent = text;
      if (barterBox) barterBox.classList.toggle('hidden', !showBarter);
      banner.classList.remove('hidden');
      if (!showBarter) {
        clearTimeout(banner._hideTimer);
        banner._hideTimer = setTimeout(() => banner.classList.add('hidden'), 5500);
      }
    }

    function dismissDirectorBanner() {
      const banner = document.getElementById('director-whisper-banner');
      if (banner) banner.classList.add('hidden');
      directorBarterState.active = false;
      clearTimeout(directorBarterState.timerId);
    }

    function openDirectorIntercomBarter() {
      const unsolved = studioObjects.find(o => o.roomIdx === currentRoomIdx && !o.solved);
      if (!unsolved) {
        showDirectorWhisper("이 방의 퍼즐은 이미 모두 푸셨네요. 어서 다음 방으로 이동하세요.");
        return;
      }
      directorBarterState = { active: true, taps: 0, targetObj: unsolved, timerId: null };
      document.getElementById('director-barter-status').textContent = "0 / 5회 (제한 3초)";
      showDirectorWhisper(directorPersona.barterPrompt || DEFAULT_DIRECTOR_PERSONA.barterPrompt, true);
      playSfx('click');
    }

    // -------------------------------------------------------------
    // ITEM 4-ATOM & DIRECTOR PERSONA GUI AUTHORING
    // -------------------------------------------------------------
    function renderAuthorItemsAndDirectorUI() {
      const items = Object.values(ITEM_CATALOG);
      const pill = document.getElementById('author-item-count-pill');
      if (pill) pill.textContent = String(items.length);

      const listEl = document.getElementById('author-items-list');
      if (listEl) {
        listEl.innerHTML = items.length === 0
          ? '<div class="text-[10px] text-zinc-600 font-mono">등록된 아이템 없음</div>'
          : items.map(it => `
            <div class="flex items-center justify-between gap-1 bg-[#111114] border border-white/10 rounded px-1.5 py-1 text-[10px] font-mono">
              <span class="truncate text-zinc-200" title="${it.id}">${it.name}${it.rewardOnQNum ? ` (Q${String(it.rewardOnQNum).padStart(2,'0')})` : ''}${it.consumable ? '' : ' · 영구'}</span>
              <button onclick="deleteCustomItem('${it.id}')" title="아이템 삭제" class="text-zinc-500 hover:text-rose-400 px-1 shrink-0">✕</button>
            </div>
          `).join('');
      }

      const ixItemSel = document.getElementById('author-ix-item');
      const ixResSel = document.getElementById('author-ix-result');
      const itemOpts = items.map(it => `<option value="${it.id}">${it.name}</option>`).join('');
      if (ixItemSel) ixItemSel.innerHTML = itemOpts || '<option value="">아이템 없음</option>';
      if (ixResSel) ixResSel.innerHTML = '<option value="">결과 아이템 선택...</option>' + itemOpts;

      onAuthorIxEffectChange();

      const ixListEl = document.getElementById('author-interactions-list');
      if (ixListEl) {
        ixListEl.innerHTML = ITEM_INTERACTIONS.length === 0
          ? '<div class="text-[10px] text-zinc-600 font-mono">등록된 상호작용 없음</div>'
          : ITEM_INTERACTIONS.map(ix => {
            const srcName = ITEM_CATALOG[ix.itemId]?.name || ix.itemId;
            const tgtLabel = ix.effect === 'combine'
              ? (ITEM_CATALOG[ix.targetItemId]?.name || ix.targetItemId || '?')
              : `Q${String(ix.targetQNum || 0).padStart(2, '0')}`;
            return `
              <div class="flex items-center justify-between gap-1 bg-[#111114] border border-white/10 rounded px-1.5 py-1 text-[10px] font-mono">
                <span class="truncate text-zinc-300" title="${ix.message || ''}">${srcName} → ${tgtLabel} <span class="text-amber-400">[${ix.effect}]</span></span>
                <button onclick="deleteItemInteraction('${ix.id}')" title="상호작용 삭제" class="text-zinc-500 hover:text-rose-400 px-1 shrink-0">✕</button>
              </div>
            `;
          }).join('');
      }

      // Director Persona inputs & HUD sync
      const nEl = document.getElementById('director-edit-name');
      const rEl = document.getElementById('director-edit-role');
      const bEl = document.getElementById('director-edit-barter');
      if (nEl && document.activeElement !== nEl) nEl.value = directorPersona.name || '';
      if (rEl && document.activeElement !== rEl) rEl.value = directorPersona.role || '';
      if (bEl && document.activeElement !== bEl) bEl.value = directorPersona.barterPrompt || '';

      const pName = document.getElementById('director-persona-name');
      if (pName) pName.textContent = directorPersona.name || DEFAULT_DIRECTOR_PERSONA.name;
      const intercomLbl = document.getElementById('btn-intercom-label');
      if (intercomLbl) intercomLbl.textContent = `인터폰 호출 (${directorPersona.name || '연출자'})`;
    }

    function onAuthorIxEffectChange() {
      const eff = document.getElementById('author-ix-effect')?.value || 'unlock';
      const tgtSel = document.getElementById('author-ix-target');
      const resSel = document.getElementById('author-ix-result');
      if (!tgtSel) return;
      if (eff === 'combine') {
        const items = Object.values(ITEM_CATALOG);
        tgtSel.innerHTML = items.map(it => `<option value="item:${it.id}">조합 대상: ${it.name}</option>`).join('') || '<option value="">아이템 없음</option>';
        if (resSel) resSel.classList.remove('hidden');
      } else {
        const sorted = [...studioObjects].sort((a, b) => (a.qNum || 0) - (b.qNum || 0));
        tgtSel.innerHTML = sorted.map(o => `<option value="q:${o.qNum}">Q${String(o.qNum).padStart(2,'0')} · ${o.name}</option>`).join('') || '<option value="">퍼즐 없음</option>';
        if (resSel) resSel.classList.add('hidden');
      }
    }

    function addCustomItem() {
      const nameEl = document.getElementById('author-item-name');
      const rewardEl = document.getElementById('author-item-reward-q');
      const consEl = document.getElementById('author-item-consumable');
      const name = (nameEl?.value || '').trim();
      if (!name) {
        showDirectorWhisper('추가할 아이템 이름을 입력하세요.');
        return;
      }
      const id = `item-custom-${Date.now().toString(36).slice(-5)}`;
      const rewardQ = parseInt(rewardEl?.value, 10);
      ITEM_CATALOG[id] = {
        id,
        name,
        consumable: consEl ? consEl.checked : true,
        ...(Number.isFinite(rewardQ) && rewardQ > 0 ? { rewardOnQNum: rewardQ } : {})
      };
      if (nameEl) nameEl.value = '';
      if (rewardEl) rewardEl.value = '';
      renderAuthorItemsAndDirectorUI();
      renderInventoryHud();
      updateCodeView();
      playSfx('click');
    }

    function deleteCustomItem(itemId) {
      if (!ITEM_CATALOG[itemId]) return;
      delete ITEM_CATALOG[itemId];
      playerInventory.delete(itemId);
      for (let i = ITEM_INTERACTIONS.length - 1; i >= 0; i--) {
        const ix = ITEM_INTERACTIONS[i];
        if (ix.itemId === itemId || ix.targetItemId === itemId || ix.resultId === itemId) {
          ITEM_INTERACTIONS.splice(i, 1);
        }
      }
      renderAuthorItemsAndDirectorUI();
      renderInventoryHud();
      updateCodeView();
      playSfx('click');
    }

    function addItemInteraction() {
      const itemId = document.getElementById('author-ix-item')?.value;
      const effect = document.getElementById('author-ix-effect')?.value || 'unlock';
      const targetVal = document.getElementById('author-ix-target')?.value || '';
      const resultId = document.getElementById('author-ix-result')?.value || '';
      const msgEl = document.getElementById('author-ix-msg');
      const message = (msgEl?.value || '').trim() || `${ITEM_CATALOG[itemId]?.name || '아이템'}을(를) 적용했습니다!`;

      if (!itemId || !targetVal) {
        showDirectorWhisper('아이템과 대상을 모두 선택하세요.');
        return;
      }
      const ix = { id: `ix-custom-${Date.now().toString(36).slice(-5)}`, itemId, effect, message };
      if (effect === 'combine') {
        ix.targetItemId = targetVal.replace(/^item:/, '');
        if (resultId) ix.resultId = resultId;
      } else {
        ix.targetQNum = parseInt(targetVal.replace(/^q:/, ''), 10);
      }
      ITEM_INTERACTIONS.push(ix);
      if (msgEl) msgEl.value = '';
      renderAuthorItemsAndDirectorUI();
      renderInventoryHud();
      updateCodeView();
      playSfx('click');
    }

    function deleteItemInteraction(ixId) {
      const idx = ITEM_INTERACTIONS.findIndex(r => r.id === ixId);
      if (idx < 0) return;
      ITEM_INTERACTIONS.splice(idx, 1);
      renderAuthorItemsAndDirectorUI();
      renderInventoryHud();
      updateCodeView();
      playSfx('click');
    }

    function updateDirectorPersonaProps() {
      const name = (document.getElementById('director-edit-name')?.value || '').trim();
      const role = (document.getElementById('director-edit-role')?.value || '').trim();
      const barter = (document.getElementById('director-edit-barter')?.value || '').trim();
      directorPersona.name = name || DEFAULT_DIRECTOR_PERSONA.name;
      directorPersona.role = role || DEFAULT_DIRECTOR_PERSONA.role;
      directorPersona.barterPrompt = barter || DEFAULT_DIRECTOR_PERSONA.barterPrompt;

      const pName = document.getElementById('director-persona-name');
      if (pName) pName.textContent = directorPersona.name;
      const intercomLbl = document.getElementById('btn-intercom-label');
      if (intercomLbl) intercomLbl.textContent = `인터폰 호출 (${directorPersona.name})`;
      updateCodeView();
    }

    function tapDirectorBarterButton() {
      if (!directorBarterState.active) return;
      playSfx('click');
      if (directorBarterState.taps === 0) {
        directorBarterState.timerId = setTimeout(() => {
          if (directorBarterState.active && directorBarterState.taps < 5) {
            directorBarterState.active = false;
            showDirectorWhisper("아쉽네요, 시간이 지났어요. 다시 도전해 보실래요?");
          }
        }, 3000);
      }
      directorBarterState.taps++;
      document.getElementById('director-barter-status').textContent = `${directorBarterState.taps} / 5회`;
      if (directorBarterState.taps >= 5) {
        directorBarterState.active = false;
        clearTimeout(directorBarterState.timerId);
        const target = directorBarterState.targetObj;
        showDirectorWhisper(`[거래 성사 · Q${String(target.qNum).padStart(2, '0')}] ${getStage1Hint(target)}`);
      }
    }

    // 우측 컬럼: 물리 장치(obj.mechanism.kind 선언 기반) vs 일반 자물쇠 다이얼 분기
    function renderRightDeviceControls(obj) {
      const devBox = document.getElementById('modal-device-controls');
      const dialSec = document.getElementById('modal-dial-section');
      if (!devBox || !dialSec) return;

      const mechKind = obj.mechanism ? obj.mechanism.kind : null;
      if (!['rotary-dial', 'clock-hands', 'balance-scale', 'pressure-valve'].includes(mechKind)) {
        devBox.classList.add('hidden');
        devBox.innerHTML = '';
        dialSec.classList.remove('hidden');
        return;
      }

      // 물리 장치 문항: 우측에 물리 조작 장치만 표시하고 불필요한 4자리 숫자 다이얼 숨김
      dialSec.classList.add('hidden');
      devBox.classList.remove('hidden');

      if (mechKind === 'rotary-dial') {
        const dirLabels = ['북(U)', '동(R)', '남(D)', '서(L)'];
        const dirAngles = [0, 90, 180, 270];
        const current = obj.solved ? [0, 1, 2, 3] : deviceState.q03Cups;
        const cupsSvg = current.map((dirIdx, i) => {
          const cx = 42 + i * 72;
          return `
            <g transform="translate(${cx},48)" class="cursor-pointer" onclick="rotateCupDevice(${i})">
              <g transform="rotate(${dirAngles[dirIdx]})">
                <rect x="-4" y="-30" width="8" height="12" rx="3" fill="#38bdf8"/>
                <circle r="18" fill="#e4e4e7" stroke="#52525b" stroke-width="2.5"/>
                <circle r="12" fill="#3b2414"/>
              </g>
              <text y="43" text-anchor="middle" fill="#d4d4d8" font-size="10" font-family="monospace">${i+1}. ${dirLabels[dirIdx]}</text>
            </g>
          `;
        }).join('');
        devBox.innerHTML = `
          <div class="p-3.5 bg-[#09090b] rounded-lg border border-white/10">
            <div class="text-[11px] font-mono text-zinc-400 mb-2">물리 장치 · 머그잔을 클릭해 손잡이를 회전 정렬</div>
            <svg viewBox="0 0 300 106" class="w-full h-28 select-none">${cupsSvg}</svg>
          </div>
        `;
      } else if (mechKind === 'clock-hands') {
        const tgt = (obj.mechanism && obj.mechanism.targetState) || { hour: 3, minute: 0 };
        const tgtH = ((Number(tgt.hour || 3) - 1) % 12) + 1;
        const tgtM = Number(tgt.minute || 0);
        const h = obj.solved ? tgtH : deviceState.q06Hour;
        const m = obj.solved ? tgtM : deviceState.q06Min;
        const isAligned = (h === tgtH && m === tgtM);
        const minStep = (tgtM % 15 === 0) ? 15 : 5;
        devBox.innerHTML = `
          <div class="p-3.5 bg-[#09090b] rounded-lg border border-white/10 text-center">
            <div class="text-[11px] font-mono text-zinc-400 mb-2">물리 장치 · 시계 시침/분침 기어 조작</div>
            <div class="text-2xl font-mono font-semibold ${isAligned ? 'text-emerald-400' : 'text-zinc-100'} mb-3">
              ${String(h).padStart(2,'0')} : ${String(m).padStart(2,'0')}
            </div>
            <div class="flex justify-center gap-2">
              <button onclick="adjustClockDevice(1, 0)" class="px-3.5 py-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-mono text-zinc-200">시침 +1h</button>
              <button onclick="adjustClockDevice(0, ${minStep})" class="px-3.5 py-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-mono text-zinc-200">분침 +${minStep}m</button>
            </div>
          </div>
        `;
      } else if (mechKind === 'balance-scale') {
        const specimens = [
          { id: 'brain', label: '뇌 표본', g: 1400 },
          { id: 'liver', label: '간 표본', g: 900 },
          { id: 'heart', label: '심장 표본', g: 350 },
          { id: 'lung',  label: '폐 표본', g: 450 },
          { id: 'eye',   label: '안구 표본', g: 30 }
        ];
        const sum = obj.solved ? 1780 : deviceState.q19Weights.reduce((a, b) => a + b.grams, 0);
        const isMatch = (sum === 1780);
        const btns = specimens.map(sp => {
          const active = obj.solved ? ['brain','heart','eye'].includes(sp.id) : deviceState.q19Weights.some(w => w.id === sp.id);
          return `
            <button onclick="toggleSpecimenWeight('${sp.id}', ${sp.g})"
                    class="px-2 py-2 rounded-md border text-xs font-mono transition-colors ${
                      active ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300' : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                    }">
              <div class="font-semibold">${sp.label}</div>
              <div class="text-[10px] text-zinc-400">${sp.g}g ${active ? '· 올림' : ''}</div>
            </button>
          `;
        }).join('');
        devBox.innerHTML = `
          <div class="p-3.5 bg-[#09090b] rounded-lg border border-white/10">
            <div class="flex justify-between items-center mb-2">
              <span class="text-[11px] font-mono text-zinc-400">물리 장치 · 정밀 저울 계량</span>
              <span class="text-lg font-mono font-semibold ${isMatch ? 'text-emerald-400' : 'text-zinc-100'}">${String(sum).padStart(4, '0')} g</span>
            </div>
            <div class="grid grid-cols-3 gap-1.5">${btns}</div>
          </div>
        `;
      } else if (mechKind === 'pressure-valve') {
        const psi = obj.solved ? 800 : deviceState.q26Psi;
        const isSafe = (psi === 800);
        const needleDeg = -110 + ((psi - 400) / 1100) * 220;
        devBox.innerHTML = `
          <div class="p-3.5 bg-[#09090b] rounded-lg border border-white/10 flex flex-col items-center">
            <div class="text-[11px] font-mono text-zinc-400 mb-1">물리 장치 · 고압 증기 밸브 감압</div>
            <svg viewBox="0 0 220 118" class="w-48 h-24 mb-1">
              <path d="M 30 102 A 80 80 0 0 1 190 102" fill="none" stroke="#27272a" stroke-width="12" stroke-linecap="round"/>
              <path d="M 70 34 A 80 80 0 0 1 118 22" fill="none" stroke="#10b981" stroke-width="12"/>
              <path d="M 145 30 A 80 80 0 0 1 190 102" fill="none" stroke="#be123c" stroke-width="12"/>
              <g transform="rotate(${needleDeg} 110 102)">
                <line x1="110" y1="102" x2="110" y2="36" stroke="#f4f4f5" stroke-width="2.5" stroke-linecap="round"/>
              </g>
              <circle cx="110" cy="102" r="7" fill="#52525b"/>
              <text x="110" y="88" text-anchor="middle" fill="${isSafe ? '#34d399' : '#fb7185'}" font-family="monospace" font-size="13" font-weight="bold">${psi} PSI</text>
            </svg>
            <div class="flex items-center gap-3">
              <button onclick="turnSteamValve(-50)" class="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-mono text-zinc-200">감압 (-50)</button>
              <svg viewBox="0 0 44 44" class="w-9 h-9 transition-transform duration-150" style="transform: rotate(${deviceState.q26WheelDeg}deg)">
                <circle cx="22" cy="22" r="18" fill="none" stroke="#dc2626" stroke-width="4"/>
                <line x1="22" y1="4" x2="22" y2="40" stroke="#dc2626" stroke-width="3"/>
                <line x1="4" y1="22" x2="40" y2="22" stroke="#dc2626" stroke-width="3"/>
              </svg>
              <button onclick="turnSteamValve(50)" class="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-xs font-mono text-zinc-200">가압 (+50)</button>
            </div>
          </div>
        `;
      }
    }

    function moveUvFlashlight(e) {
      const container = e.currentTarget;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const overlay = document.getElementById('uv-reveal-layer');
      if (overlay) {
        overlay.style.clipPath = `circle(52px at ${x}% ${y}%)`;
        overlay.style.opacity = '1';
      }
    }

    function renderPropVisualArtwork(obj, prop) {
      const stage = document.getElementById('modal-visual-stage');
      const caption = document.getElementById('modal-visual-caption');
      if (!stage) return;

      const q = obj.qNum;
      const name = obj.name || '';
      if (caption) caption.textContent = `${prop ? prop.name : obj.name} · ${obj.carrierType || 'Physical Inspection'}`;

      // Playtest 모드에서만 선행 퍼즐 미해결 시 뒷 단계 단서 시각화 숨김 (Author 모드에서는 즉시 미리보기)
      const prereqObj = obj.requiresSolvedId ? studioObjects.find(o => o.id === obj.requiresSolvedId) : null;
      if (studioMode === 'playtest' && prereqObj && !prereqObj.solved && !obj.solved) {
        stage.innerHTML = `
          <div class="w-80 p-6 rounded-lg bg-[#0d0d11] border border-white/10 text-center space-y-3 shadow-2xl">
            <div class="w-10 h-10 mx-auto rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <div class="text-xs font-mono text-zinc-500 tracking-wider">CLUE HIDDEN</div>
            <div class="text-sm font-semibold text-zinc-200">아직 단서를 발견하지 못했습니다</div>
            <p class="text-xs text-zinc-400 leading-relaxed break-keep">
              먼저 <span class="text-amber-300 font-medium">Q${String(prereqObj.qNum).padStart(2,'0')} ${prereqObj.name}</span>을(를) 해결하면 이 기물의 단서가 드러납니다.
            </p>
          </div>`;
        return;
      }

      // 0. 선언적 visualSpec 템플릿 렌더러 (AI 에이전트/크리에이터 커스텀 테마 RaC JSON 자동 시각화)
      if (obj.visualSpec && obj.visualSpec.template) {
        const vs = obj.visualSpec;
        const lines = Array.isArray(vs.lines) && vs.lines.length > 0 ? vs.lines : [obj.cluePayload || ''];
        const title = escapeXml(vs.title || obj.name);
        const badge = escapeXml(vs.badge || '');
        const highlight = escapeXml(vs.highlight || '');
        if (vs.template === 'document') {
          stage.innerHTML = `
            <div class="w-80 bg-[#dfd5bc] text-stone-900 rounded-sm p-5 border border-stone-600/70 -rotate-1 font-serif shadow-2xl space-y-2.5">
              <div class="flex justify-between items-center border-b border-stone-700/40 pb-1.5 gap-2">
                <span class="font-bold text-sm tracking-tight">${title}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 bg-stone-800/15 rounded shrink-0">${badge || 'EVIDENCE'}</span>
              </div>
              <div class="text-xs leading-relaxed space-y-1.5">${lines.map(l => `<p>${escapeXml(l)}</p>`).join('')}</div>
              ${highlight ? `<div class="mt-2 pt-2 border-t border-red-900/30 text-xs font-bold text-red-900">${highlight}</div>` : ''}
            </div>`;
          return;
        }
        if (vs.template === 'blueprint') {
          stage.innerHTML = `
            <div class="w-80 bg-[#0b1f3a] text-sky-100 rounded p-4 border-2 border-sky-400/40 font-mono shadow-2xl space-y-2" style="background-image: linear-gradient(rgba(56,189,248,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.08) 1px, transparent 1px); background-size: 16px 16px;">
              <div class="flex justify-between text-[11px] text-sky-300 border-b border-sky-400/30 pb-1 gap-2">
                <span class="truncate">BLUEPRINT // ${title}</span>
                <span class="shrink-0">${badge || 'SPEC'}</span>
              </div>
              <div class="text-xs leading-relaxed text-sky-100/90 space-y-1">${lines.map(l => `<div>&gt; ${escapeXml(l)}</div>`).join('')}</div>
              ${highlight ? `<div class="mt-2 pt-1.5 border-t border-sky-400/30 text-[11px] font-semibold text-amber-300">${highlight}</div>` : ''}
            </div>`;
          return;
        }
        if (vs.template === 'crt') {
          stage.innerHTML = `
            <div class="w-80 bg-[#06120a] text-emerald-400 rounded-lg p-4 border-4 border-zinc-700 font-mono shadow-2xl space-y-2">
              <div class="text-[10px] text-emerald-500/80 border-b border-emerald-500/20 pb-1 flex justify-between gap-2">
                <span class="truncate">CRT-TERMINAL :: ${title}</span><span class="shrink-0">${badge || 'ONLINE'}</span>
              </div>
              <div class="text-xs leading-relaxed space-y-1">${lines.map(l => `<div>$ ${escapeXml(l)}</div>`).join('')}</div>
              ${highlight ? `<div class="mt-2 pt-1.5 border-t border-emerald-500/25 text-[11px] font-semibold text-amber-300">[!] ${highlight}</div>` : ''}
            </div>`;
          return;
        }
        if (vs.template === 'photo') {
          stage.innerHTML = `
            <div class="w-72 bg-zinc-200 p-3 pb-5 rounded-sm shadow-2xl rotate-1 text-zinc-900">
              <div class="min-h-[160px] bg-zinc-900 rounded-sm flex flex-col items-center justify-center p-4 text-center text-zinc-300 text-xs font-serif border border-zinc-700 gap-2">
                <div>${lines.map(l => escapeXml(l)).join('<br/>')}</div>
                ${highlight ? `<div class="text-[11px] font-mono text-amber-300 border-t border-white/10 pt-1.5 w-full">${highlight}</div>` : ''}
              </div>
              <div class="mt-2.5 text-center font-serif text-xs font-semibold text-zinc-800">${title}</div>
            </div>`;
          return;
        }
      }

      // 1. 괘종시계 + 붉은 혈서 메모 단서 시각화 (Q06)
      if (q === 6 || name.includes('시계')) {
        stage.innerHTML = `
          <div class="flex flex-col items-center gap-3">
            <div class="relative w-52 h-52 flex items-center justify-center">
              <svg viewBox="0 0 260 260" class="w-full h-full drop-shadow-2xl">
                <defs>
                  <radialGradient id="clockFace" cx="50%" cy="45%" r="55%">
                    <stop offset="0%" stop-color="#e7dec6"/>
                    <stop offset="80%" stop-color="#c4b592"/>
                    <stop offset="100%" stop-color="#8c7a56"/>
                  </radialGradient>
                </defs>
                <circle cx="130" cy="130" r="116" fill="#291d14" stroke="#785a32" stroke-width="8"/>
                <circle cx="130" cy="130" r="102" fill="url(#clockFace)" stroke="#3f2d1d" stroke-width="3"/>
                <path d="M 155 70 Q 180 95 168 125 Q 192 140 175 162 Q 150 148 148 115 Z" fill="#7f1d1d" opacity="0.42"/>
                <text x="130" y="54" text-anchor="middle" fill="#1c1917" font-family="serif" font-size="18" font-weight="bold">XII</text>
                <text x="208" y="136" text-anchor="middle" fill="#1c1917" font-family="serif" font-size="18" font-weight="bold">III</text>
                <text x="130" y="214" text-anchor="middle" fill="#1c1917" font-family="serif" font-size="18" font-weight="bold">VI</text>
                <text x="52" y="136" text-anchor="middle" fill="#1c1917" font-family="serif" font-size="18" font-weight="bold">IX</text>
                <path d="M 130 105 L 155 105 L 155 130" fill="none" stroke="#991b1b" stroke-width="1.5" stroke-dasharray="3 2"/>
                <line x1="130" y1="130" x2="130" y2="62" stroke="#991b1b" stroke-width="4" stroke-linecap="round"/>
                <line x1="130" y1="130" x2="188" y2="130" stroke="#18181b" stroke-width="6" stroke-linecap="round"/>
                <circle cx="130" cy="130" r="6" fill="#18181b" stroke="#d4af37" stroke-width="2"/>
              </svg>
            </div>
            <div class="w-80 bg-[#d6ccb2] text-stone-900 rounded-sm p-3.5 border border-stone-600/70 -rotate-1 font-serif shadow-xl text-xs leading-relaxed">
              <div class="text-[10px] font-mono text-rose-900 font-bold mb-1">혈서 메모 (BLOOD NOTE)</div>
              "괘종시계를 정확히 <b>3시 정각</b>으로 맞춰 시침과 분침이 직각(90°)을 이루게 하라."
            </div>
          </div>
        `;
        return;
      }

      // 2. 원무과 당직표 문서 + 북쪽 벽시계 (Q01 - Resident Evil Library Card Style)
      if (q === 1) {
        stage.innerHTML = `
          <div class="w-[330px] bg-[#d6ccb2] text-stone-900 rounded-sm shadow-2xl p-5 border border-stone-500/70 -rotate-2 font-serif relative"
               style="box-shadow: 0 24px 60px rgba(0,0,0,0.85), inset 0 0 40px rgba(92,72,42,0.35);">
            <div class="flex justify-between items-start border-b-2 border-stone-800 pb-2 mb-3">
              <div>
                <div class="text-[10px] tracking-widest uppercase text-stone-600 font-sans font-semibold">ASYLUM 404 · WARD LOG</div>
                <div class="text-base font-bold tracking-tight text-stone-900 mt-0.5">1994년 4월 원무과 당직표</div>
              </div>
              <div class="w-11 h-11 rounded-full border-2 border-stone-800 bg-[#e6ddc5] flex items-center justify-center relative shrink-0" title="북쪽 벽시계 02:20 (14:20)">
                <svg viewBox="0 0 40 40" class="w-10 h-10">
                  <line x1="20" y1="20" x2="29" y2="16" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/>
                  <line x1="20" y1="20" x2="31" y2="26" stroke="#991b1b" stroke-width="1.6" stroke-linecap="round"/>
                  <circle cx="20" cy="20" r="1.8" fill="#1c1917"/>
                </svg>
              </div>
            </div>
            <table class="w-full text-xs border-collapse border border-stone-700/80 mb-3">
              <thead>
                <tr class="bg-stone-800/10 border-b border-stone-700">
                  <th class="border-r border-stone-700/70 py-1.5 px-2 text-left">요일 / 날짜</th>
                  <th class="py-1.5 px-2 text-left">담당 당직자</th>
                </tr>
              </thead>
              <tbody class="font-mono text-[11px]">
                <tr class="border-b border-stone-700/50">
                  <td class="border-r border-stone-700/70 py-1.5 px-2">월요일 · <b>14일</b></td>
                  <td class="py-1.5 px-2 italic">김원장 (Director)</td>
                </tr>
                <tr class="border-b border-stone-700/50">
                  <td class="border-r border-stone-700/70 py-1.5 px-2">목요일 · 17일</td>
                  <td class="py-1.5 px-2 italic">박과장</td>
                </tr>
                <tr class="bg-rose-900/10">
                  <td class="border-r border-stone-700/70 py-1.5 px-2 font-bold text-rose-900">일요일 · ??일</td>
                  <td class="py-1.5 px-2 italic font-bold text-rose-900">최간호사</td>
                </tr>
              </tbody>
            </table>
            <div class="text-[11px] leading-snug text-stone-800 italic border-t border-stone-700/40 pt-2">
              "김원장 당직일(2자리)과 최간호사 당직일(2자리)을 이어 적어라. 북쪽 벽시계의 24시간제 시각과 일치한다."
            </div>
          </div>
        `;
        return;
      }

      // 3. 간호사 야간 순찰 일지 단서 시각화 (Q03)
      if (q === 3) {
        stage.innerHTML = `
          <div class="w-[330px] bg-[#d6ccb2] text-stone-900 rounded-sm shadow-2xl p-5 border border-stone-500/70 -rotate-2 font-serif"
               style="box-shadow: 0 24px 60px rgba(0,0,0,0.85), inset 0 0 40px rgba(92,72,42,0.35);">
            <div class="border-b-2 border-stone-800 pb-2 mb-3 flex justify-between items-center">
              <div>
                <div class="text-[10px] tracking-widest uppercase text-stone-600 font-sans font-semibold">NIGHT PATROL LOG</div>
                <div class="text-base font-bold text-stone-900 mt-0.5">간호사 야간 순찰 일지</div>
              </div>
              <span class="text-xs font-mono border border-stone-700 px-1.5 py-0.5">1F</span>
            </div>
            <ol class="text-xs space-y-2 font-mono text-stone-800 mb-3">
              <li class="flex justify-between border-b border-stone-700/30 pb-1"><span>1. 로비 창문 점검</span><b class="text-rose-900">북쪽 (↑)</b></li>
              <li class="flex justify-between border-b border-stone-700/30 pb-1"><span>2. 중앙 복도 통과</span><b class="text-rose-900">동쪽 (→)</b></li>
              <li class="flex justify-between border-b border-stone-700/30 pb-1"><span>3. 비상 계단 확인</span><b class="text-rose-900">남쪽 (↓)</b></li>
              <li class="flex justify-between"><span>4. 사물함 복귀</span><b class="text-rose-900">서쪽 (←)</b></li>
            </ol>
            <div class="text-[11px] italic text-stone-700 border-t border-stone-700/40 pt-2">
              "접수대 머그잔 4개의 손잡이를 순찰 순서대로 정렬하라."
            </div>
          </div>
        `;
        return;
      }

      // 4. 로르샤흐 데칼코마니 카드 (Q07)
      if (q === 7) {
        stage.innerHTML = `
          <div class="w-80 bg-[#ddd6c5] text-stone-900 rounded-sm p-4 shadow-2xl border border-stone-500 rotate-1">
            <div class="text-[10px] font-mono text-stone-600 text-center mb-2">RORSCHACH INKBLOT PLATE IV</div>
            <svg viewBox="0 0 260 150" class="w-full h-36 bg-[#ece6d8] border border-stone-400">
              <line x1="130" y1="8" x2="130" y2="142" stroke="#a8a29e" stroke-dasharray="3 3"/>
              <!-- Left & Right Symmetric Inkblots -->
              <path d="M 128 30 C 90 18 55 45 42 75 C 32 100 68 128 98 115 C 115 108 122 122 128 110 Z" fill="#1c1917"/>
              <path d="M 132 30 C 170 18 205 45 218 75 C 228 100 192 128 162 115 C 145 108 138 122 132 110 Z" fill="#1c1917"/>
              <text x="54" y="80" fill="#e7e5e4" font-family="monospace" font-size="13" font-weight="bold">1 - 8 - 3 - 2</text>
              <text x="164" y="80" fill="#a8a29e" font-family="monospace" font-size="12">? - ? - ? - ?</text>
            </svg>
          </div>
        `;
        return;
      }

      // 5. 심전도(ECG) 오실로스코프 (Q14)
      if (q === 14) {
        stage.innerHTML = `
          <div class="w-80 bg-[#07120c] border-2 border-zinc-700 rounded-lg p-4 shadow-2xl">
            <div class="flex justify-between text-[10px] font-mono text-emerald-500 mb-2">
              <span>ECG-404 MONITOR</span><span>HR: 0 BPM</span>
            </div>
            <svg viewBox="0 0 280 120" class="w-full h-32 bg-[#040d08] border border-emerald-900/60">
              <path d="M 10 65 L 65 65 L 95 20 L 135 102 L 175 26 L 200 65 L 270 65" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round"/>
              <text x="95" y="14" text-anchor="middle" fill="#34d399" font-size="9" font-family="monospace">UP</text>
              <text x="135" y="114" text-anchor="middle" fill="#34d399" font-size="9" font-family="monospace">DOWN</text>
              <text x="175" y="18" text-anchor="middle" fill="#34d399" font-size="9" font-family="monospace">UP</text>
              <text x="242" y="56" text-anchor="middle" fill="#34d399" font-size="9" font-family="monospace">RIGHT →</text>
            </svg>
          </div>
        `;
        return;
      }

      // 6. 흉부 X-Ray 라이트박스 (Q18)
      if (q === 18) {
        stage.innerHTML = `
          <div class="w-80 bg-[#081b24] border-2 border-cyan-900/70 rounded-lg p-4 shadow-2xl">
            <div class="text-[10px] font-mono text-cyan-400 mb-2 flex justify-between">
              <span>X-RAY FILM OVERLAY</span><span>FILM A + B</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center font-mono">
              <div class="bg-[#051218] border border-cyan-500/30 rounded p-3">
                <div class="text-[10px] text-cyan-500 mb-1">FILM A</div>
                <div class="text-lg tracking-widest text-cyan-200 font-semibold">7 _ 4 _</div>
              </div>
              <div class="bg-[#051218] border border-cyan-500/30 rounded p-3">
                <div class="text-[10px] text-cyan-500 mb-1">FILM B</div>
                <div class="text-lg tracking-widest text-cyan-200 font-semibold">_ 2 _ 9</div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // 6-2. 포르말린 표본병 무게 라벨 단서 시각화 (Q19)
      if (q === 19) {
        stage.innerHTML = `
          <div class="w-[330px] bg-[#d6ccb2] text-stone-900 rounded-sm shadow-2xl p-5 border border-stone-500/70 rotate-1 font-serif"
               style="box-shadow: 0 24px 60px rgba(0,0,0,0.85), inset 0 0 40px rgba(92,72,42,0.35);">
            <div class="border-b-2 border-stone-800 pb-2 mb-3 flex justify-between items-center">
              <div>
                <div class="text-[10px] tracking-widest uppercase text-stone-600 font-sans font-semibold">MORGUE SPECIMEN TAG</div>
                <div class="text-base font-bold text-stone-900 mt-0.5">포르말린 표본 계량 지시서</div>
              </div>
              <span class="text-[10px] font-mono border border-rose-900 text-rose-900 px-1.5 py-0.5 font-bold">2F 영안실</span>
            </div>
            <div class="space-y-2 font-mono text-xs mb-3">
              <div class="flex justify-between p-2 bg-stone-900/10 border border-stone-700/40"><span>1. 뇌 표본 (Brain)</span><b>1400 g</b></div>
              <div class="flex justify-between p-2 bg-stone-900/10 border border-stone-700/40"><span>2. 심장 표본 (Heart)</span><b>350 g</b></div>
              <div class="flex justify-between p-2 bg-stone-900/10 border border-stone-700/40"><span>3. 안구 표본 (Eye)</span><b>30 g</b></div>
            </div>
            <div class="text-[11px] italic text-stone-800 border-t border-stone-700/40 pt-2">
              "위 세 표본병만 정확히 저울 접시에 올려 총 중량을 맞춰라."
            </div>
          </div>
        `;
        return;
      }

      // 7. [물리 장치 #4] UV 형광 병원장 초상화 마우스 스캔 장치 (Q22)
      if (q === 22) {
        stage.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="text-[11px] font-mono text-purple-300 mb-2">[광학 장치] 초상화 위로 마우스(UV 손전등)를 비춰보세요</div>
            <div onmousemove="moveUvFlashlight(event)" class="w-64 h-80 bg-[#120e18] border-[8px] border-[#6b4c1e] rounded shadow-2xl relative overflow-hidden cursor-crosshair select-none"
                 style="box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
              <!-- Base Dark Oil Painting -->
              <svg viewBox="0 0 180 220" class="w-full h-full absolute inset-0">
                <ellipse cx="90" cy="78" rx="34" ry="44" fill="#09070d"/>
                <path d="M 30 215 Q 45 140 90 138 Q 135 140 150 215 Z" fill="#09070d"/>
                <circle cx="76" cy="74" r="3" fill="#27272a"/>
                <circle cx="104" cy="74" r="3" fill="#27272a"/>
              </svg>
              <!-- Hidden UV Fluorescent Layer (Revealed by mouse flashlight) -->
              <div id="uv-reveal-layer" class="absolute inset-0 pointer-events-none transition-opacity duration-150"
                   style="clip-path: circle(52px at 50% 40%); opacity: ${obj.solved ? '1' : '0.25'}; background: radial-gradient(circle, rgba(168,85,247,0.35), rgba(88,28,135,0.2));">
                <svg viewBox="0 0 180 220" class="w-full h-full">
                  <circle cx="76" cy="74" r="4.5" fill="#d8b4fe"/>
                  <circle cx="104" cy="74" r="4.5" fill="#d8b4fe"/>
                  <text x="90" y="108" text-anchor="middle" fill="#f3e8ff" font-family="monospace" font-size="16" font-weight="bold" letter-spacing="5">M I N D</text>
                </svg>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // 8-2. 보일러 과열 경고판 단서 시각화 (Q26)
      if (q === 26) {
        stage.innerHTML = `
          <div class="w-[330px] bg-[#2a1612] text-amber-100 rounded border-4 border-amber-700/80 p-5 shadow-2xl -rotate-1 font-mono"
               style="box-shadow: 0 24px 60px rgba(0,0,0,0.85), inset 0 0 36px rgba(0,0,0,0.6);">
            <div class="bg-amber-600/90 text-stone-950 font-bold text-xs px-2.5 py-1 text-center tracking-widest mb-3">
              WARNING · HIGH PRESSURE BOILER
            </div>
            <div class="text-sm font-bold text-amber-200 mb-3 text-center">소각로 과열 감압 경고판</div>
            <div class="space-y-2 text-xs bg-black/40 p-3 border border-amber-700/40 mb-3">
              <div class="flex justify-between"><span class="text-zinc-400">현재 증기 압력</span><b class="text-rose-400">1250 PSI</b></div>
              <div class="flex justify-between"><span class="text-zinc-400">위험 초과분 (감압 필요)</span><b class="text-amber-300">- 450 PSI</b></div>
            </div>
            <div class="text-[11px] text-amber-200/85 leading-relaxed text-center">
              우측 증기 밸브 휠을 돌려 안전 목표 압력까지 감압하라.
            </div>
          </div>
        `;
        return;
      }

      // 8. 상아 해부학 체스 테이블 (Q24)
      if (q === 24) {
        let cells = '';
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const dark = (r + c) % 2 === 1;
            cells += `<rect x="${c * 45}" y="${r * 45}" width="45" height="45" fill="${dark ? '#27272a' : '#d6d3d1'}"/>`;
          }
        }
        stage.innerHTML = `
          <div class="w-60 bg-[#18181b] border-4 border-[#57422a] rounded p-3 shadow-2xl">
            <svg viewBox="0 0 180 180" class="w-full h-auto">
              ${cells}
              <path d="M 67 157 L 67 112 L 112 112 L 112 67 L 67 67" fill="none" stroke="#dc2626" stroke-width="4" stroke-dasharray="5 3" stroke-linecap="round"/>
              <circle cx="67" cy="157" r="8" fill="#18181b" stroke="#dc2626" stroke-width="2"/>
              <circle cx="67" cy="67" r="9" fill="#dc2626"/>
            </svg>
            <div class="text-[10px] font-mono text-zinc-400 text-center mt-2">흑색 나이트 핏자국 기보 (U → R → U → L)</div>
          </div>
        `;
        return;
      }

      // 9. 강철 금고 / 방폭문 + 부착된 단서 메모 시각화 (safe, door)
      if (obj.type === 'safe' || obj.type === 'door') {
        stage.innerHTML = `
          <div class="flex flex-col items-center gap-3">
            <div class="w-36 h-36 bg-[#16161a] border-2 border-zinc-700 rounded-lg p-3 shadow-xl flex flex-col items-center justify-center">
              <svg viewBox="0 0 180 180" class="w-24 h-24">
                <circle cx="90" cy="90" r="76" fill="#09090b" stroke="#52525b" stroke-width="8"/>
                <circle cx="90" cy="90" r="56" fill="#18181b" stroke="#3f3f46" stroke-width="2" stroke-dasharray="6 4"/>
                <line x1="90" y1="22" x2="90" y2="158" stroke="#71717a" stroke-width="4"/>
                <line x1="22" y1="90" x2="158" y2="90" stroke="#71717a" stroke-width="4"/>
                <circle cx="90" cy="90" r="18" fill="#27272a" stroke="${obj.solved ? '#10b981' : '#be123c'}" stroke-width="4"/>
              </svg>
            </div>
            <div class="w-[330px] bg-[#d6ccb2] text-stone-900 rounded-sm shadow-2xl p-4 border border-stone-500/70 -rotate-1 font-serif"
                 style="box-shadow: 0 18px 40px rgba(0,0,0,0.8), inset 0 0 32px rgba(92,72,42,0.35);">
              <div class="text-[10px] font-mono text-stone-600 font-bold border-b border-stone-700/40 pb-1 mb-2">${escapeXml(obj.name)} · 부착 메모</div>
              <div class="text-xs leading-relaxed text-stone-800 font-mono break-keep">${escapeXml(obj.cluePayload || '')}</div>
            </div>
          </div>
        `;
        return;
      }

      // 10. 기본 빈티지 병동 기록 카드 / 차트 문서 (Resident Evil Document Card Aesthetic)
      stage.innerHTML = `
        <div class="w-[330px] bg-[#d6ccb2] text-stone-900 rounded-sm shadow-2xl p-5 border border-stone-500/70 -rotate-1 font-serif relative"
             style="box-shadow: 0 24px 60px rgba(0,0,0,0.85), inset 0 0 42px rgba(92,72,42,0.35);">
          <div class="flex justify-between items-center border-b-2 border-stone-800 pb-2 mb-3">
            <div class="text-[10px] tracking-widest uppercase text-stone-600 font-sans font-semibold">ASYLUM 404 · EVIDENCE #${String(q).padStart(2, '0')}</div>
            <div class="text-[10px] font-mono px-1.5 py-0.5 border border-rose-900/50 text-rose-900 font-bold">CONFIDENTIAL</div>
          </div>
          <div class="text-sm font-bold text-stone-900 mb-3">${escapeXml(obj.name)}</div>
          <div class="text-xs leading-relaxed text-stone-800 font-mono bg-stone-900/5 p-3 border border-stone-700/30 break-keep">
            ${escapeXml(obj.cluePayload || '')}
          </div>
          <div class="mt-3 pt-2 border-t border-stone-700/30 flex justify-between text-[10px] text-stone-600 font-mono">
            <span>Carrier: ${escapeXml(obj.carrierType || 'Document')}</span>
            <span>Room ${obj.roomIdx + 1}</span>
          </div>
        </div>
      `;
    }

    let prevClientX = null, prevClientY = null;

    function openLockModalForObject(objId) {
      // Release pointer lock and freeze movement immediately when modal opens
      try {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } catch (e) {}
      fpsState.moveForward = false;
      fpsState.moveBackward = false;
      fpsState.moveLeft = false;
      fpsState.moveRight = false;
      prevClientX = null;
      prevClientY = null;

      const obj = studioObjects.find(o => o.id === objId);
      if (!obj) return;
      activeModalObjId = obj.id;

      const rc = ROOM_CONFIGS[obj.roomIdx];
      const qCode = `Q${String(obj.qNum).padStart(2, '0')} / ${studioObjects.length}`;

      document.getElementById('modal-q-badge').textContent = qCode;
      document.getElementById('modal-room-badge').textContent = rc.fullName;
      document.getElementById('modal-obj-title').textContent = obj.name;
      document.getElementById('modal-carrier-badge').textContent = obj.carrierType || 'Text';
      document.getElementById('modal-clue-payload').textContent = obj.cluePayload || '';
      document.getElementById('modal-unlock-desc').textContent = obj.unlocksName || obj.unlocksId;

      // Reset 2-stage progressive hint state (No answer spoiler on open!)
      modalHintStage = 0;
      const s1 = document.getElementById('modal-hint-stage1');
      const s2 = document.getElementById('modal-hint-stage2');
      const hintBtn = document.getElementById('btn-modal-hint');
      if (s1) { s1.classList.add('hidden'); s1.textContent = ''; }
      if (s2) { s2.classList.add('hidden'); }
      const prereqObj = obj.requiresSolvedId ? studioObjects.find(o => o.id === obj.requiresSolvedId) : null;
      const clueHidden = (studioMode === 'playtest') && !!(prereqObj && !prereqObj.solved && !obj.solved);
      if (hintBtn) {
        if (clueHidden) {
          hintBtn.disabled = true;
          hintBtn.textContent = '선행 단서 필요';
          hintBtn.className = 'px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-zinc-500 text-[11px] font-medium cursor-not-allowed';
        } else {
          hintBtn.disabled = false;
          hintBtn.textContent = '힌트 보기 (1/2)';
          hintBtn.className = 'px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-200 text-[11px] font-medium transition-colors';
        }
      }

      // Check Prop Ontology for physical gimmick carrier
      const propBox = document.getElementById('modal-prop-gimmick-box');
      const propKindBadge = document.getElementById('modal-prop-kind-badge');
      const propDesc = document.getElementById('modal-prop-desc');
      const prop = PROP_ONTOLOGY.find(p => p.targetObjId === obj.id || p.targetParentId === obj.id);
      if (prop && propBox) {
        propBox.classList.remove('hidden');
        propKindBadge.textContent = (prop.gimmick.kind || 'Gimmick').toUpperCase();
        // 소품 설명에서 괄호 속 정답 숫자 스포일러가 없도록 정제 표시
        propDesc.textContent = `[${prop.name}] ${prop.gimmick.description.replace(/\([0-9A-Z]{4}\)/g, '').replace(/정답[^.]*\./g, '단서와 결속되어 있다.')}`;
      } else if (propBox) {
        propBox.classList.add('hidden');
      }

      // Render Left Column Close-Up Clue Visual Artwork & Right Column Mechanism/Item/Dial Controls
      renderPropVisualArtwork(obj, prop);
      renderRightDeviceControls(obj);
      renderModalItemApplyBox(obj);

      // Creator Mode Inline Editor Toggle Visibility (Strictly hidden in playtest)
      setModalAuthorEditOpen(false);
      const modalEditBtn = document.getElementById('btn-modal-author-edit');
      if (modalEditBtn) {
        if (studioMode === 'author') {
          modalEditBtn.classList.remove('hidden');
          syncModalAuthorEditor(obj);
        } else {
          modalEditBtn.classList.add('hidden');
        }
      }

      // Show Directional Pad if DirectionalLock
      const dirPad = document.getElementById('modal-dir-pad');
      if (obj.interfaceType === 'DirectionalLock') {
        dirPad.classList.remove('hidden');
      } else {
        dirPad.classList.add('hidden');
      }

      // Initialize 4 slots
      const pass = (obj.passcode || '0000').toUpperCase();
      const isAlpha = /^[A-Z]+$/.test(pass);
      for (let i = 0; i < 4; i++) {
        dialChars[i] = obj.solved ? (pass[i] || '0') : (isAlpha ? 'A' : '0');
        document.getElementById('d' + i).textContent = dialChars[i];
      }
      dirInputCursor = 0;

      const fb = document.getElementById('lock-feedback');
      const nextBtn = document.getElementById('modal-next-action-btn');

      if (obj.solved) {
        fb.className = "text-xs font-medium py-2 px-3 rounded-md text-emerald-300 bg-emerald-950/50 border border-emerald-500/40 text-center";
        fb.textContent = `이미 해금된 퍼즐입니다 (해금 코드: ${obj.passcode})`;
        configureNextButton(obj, nextBtn);
      } else {
        fb.className = "text-xs py-2 px-3 rounded-md text-zinc-400 bg-[#09090b] border border-white/10 text-center";
        fb.textContent = "단서를 해독해 4자리 코드를 입력한 뒤 해금을 누르세요.";
        nextBtn.classList.add('hidden');
      }

      document.getElementById('lock-modal').classList.remove('hidden');
      playSfx('click');
    }

    function closeLockModal() {
      setModalAuthorEditOpen(false);
      document.getElementById('lock-modal').classList.add('hidden');
      prevClientX = null;
      prevClientY = null;
      // Seamlessly refocus Three.js container so WASD and mouse look resume without extra click
      const container = document.getElementById('three-container');
      if (container) container.focus();
    }

    // -------------------------------------------------------------
    // WYSIWYG LIVE INLINE EDITOR INSIDE #lock-modal (Author Mode Only)
    // -------------------------------------------------------------
    let isModalAuthorEditOpen = false;

    function setModalAuthorEditOpen(open) {
      isModalAuthorEditOpen = !!(open && studioMode === 'author');
      const editorEl = document.getElementById('modal-author-editor');
      const playEl = document.getElementById('modal-play-controls');
      const btn = document.getElementById('btn-modal-author-edit');
      if (editorEl) editorEl.classList.toggle('hidden', !isModalAuthorEditOpen);
      if (playEl) playEl.classList.toggle('hidden', isModalAuthorEditOpen);
      if (btn) {
        btn.textContent = isModalAuthorEditOpen ? '편집 닫기' : '✎ 바로 편집';
        btn.className = isModalAuthorEditOpen
          ? 'px-2.5 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/60 text-sky-200 text-xs font-semibold shrink-0 transition-colors cursor-pointer'
          : 'px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-sky-500/40 text-sky-300 text-xs font-medium shrink-0 transition-colors cursor-pointer';
        if (studioMode !== 'author') btn.classList.add('hidden');
      }
    }

    function syncModalAuthorEditor(obj) {
      if (!obj) return;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('me-name', obj.name || '');
      setVal('me-tpl', (obj.visualSpec && obj.visualSpec.template) ? obj.visualSpec.template : 'document');
      setVal('me-highlight', (obj.visualSpec && obj.visualSpec.highlight) ? obj.visualSpec.highlight : '');
      setVal('me-clue', obj.cluePayload || '');
      const hintEl = document.getElementById('me-hint1');
      if (hintEl) {
        hintEl.value = obj.customHint || '';
        hintEl.placeholder = getStage1Hint({ ...obj, customHint: '' });
      }
      setVal('me-rule', obj.probRule || '');
      setVal('me-passcode', obj.passcode || '');
      setVal('me-mechanism', obj.mechanism ? obj.mechanism.kind : '');
      setVal('me-story', obj.storyBeat || '');

      const reqSel = document.getElementById('me-requires');
      if (reqSel) {
        const roomPeers = studioObjects.filter(o => o.roomIdx === obj.roomIdx && o.id !== obj.id);
        reqSel.innerHTML = '<option value="">없음 (자유 진입)</option>' + roomPeers.map(p =>
          `<option value="${escapeXml(p.id)}" ${obj.requiresSolvedId === p.id ? 'selected' : ''}>Q${String(p.qNum).padStart(2,'0')} ${escapeXml(p.name)}</option>`
        ).join('');
      }

      const lightSel = document.getElementById('me-unlock-light');
      if (lightSel) {
        const curLightEf = Array.isArray(obj.onUnlockEffects)
          ? obj.onUnlockEffects.find(ef => ef && ef.kind === 'lightOn')
          : null;
        const selectedLightId = curLightEf ? curLightEf.targetId : '';
        const lightOpts = ['<option value="">없음</option>'];
        ROOM_CONFIGS.forEach(rc => {
          const rLights = Array.isArray(rc.lights) ? rc.lights : [];
          rLights.forEach(lt => {
            const selAttr = lt.id === selectedLightId ? 'selected' : '';
            const initTag = lt.initiallyOn === false ? ' [초기OFF]' : '';
            lightOpts.push(`<option value="${escapeXml(lt.id)}" ${selAttr}>${escapeXml(rc.shortName)} · ${escapeXml(lt.id)}${initTag}</option>`);
          });
        });
        lightSel.innerHTML = lightOpts.join('');
      }
    }

    function toggleModalAuthorEdit() {
      if (studioMode !== 'author') return;
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return;
      const nextOpen = !isModalAuthorEditOpen;
      if (nextOpen) syncModalAuthorEditor(obj);
      setModalAuthorEditOpen(nextOpen);
      playSfx('click');
    }

    function applyModalAuthorEdit() {
      if (studioMode !== 'author' || !activeModalObjId) return;
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return;

      const nameVal = document.getElementById('me-name')?.value ?? obj.name;
      const tplVal = document.getElementById('me-tpl')?.value || 'document';
      const highlightVal = document.getElementById('me-highlight')?.value ?? '';
      const clueVal = document.getElementById('me-clue')?.value ?? '';
      const hint1Val = document.getElementById('me-hint1')?.value ?? '';
      const ruleVal = document.getElementById('me-rule')?.value ?? '';
      const passVal = (document.getElementById('me-passcode')?.value ?? '').trim().toUpperCase();
      const mechVal = document.getElementById('me-mechanism')?.value ?? '';
      const reqVal = document.getElementById('me-requires')?.value ?? '';
      const lightVal = document.getElementById('me-unlock-light')?.value ?? '';
      const storyVal = (document.getElementById('me-story')?.value ?? '').trim();

      obj.name = nameVal;
      obj.cluePayload = clueVal;
      obj.customHint = hint1Val.trim();
      obj.probRule = ruleVal;
      obj.passcode = passVal;
      obj.mechanism = mechVal ? { kind: mechVal, targetState: obj.passcode } : null;
      obj.requiresSolvedId = reqVal || null;
      obj.storyBeat = storyVal;

      if (lightVal) {
        obj.onUnlockEffects = [{ kind: 'lightOn', targetId: lightVal, sfx: 'spark' }];
        for (const rc of ROOM_CONFIGS) {
          const targetLt = Array.isArray(rc.lights) ? rc.lights.find(l => l.id === lightVal) : null;
          if (targetLt) {
            targetLt.initiallyOn = false;
            break;
          }
        }
      } else {
        delete obj.onUnlockEffects;
      }

      const clueLines = clueVal.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const safeLines = clueLines.length > 0 ? clueLines : ['단서 내용을 입력하세요.'];
      obj.visualSpec = {
        ...(obj.visualSpec || {}),
        template: tplVal,
        title: obj.name,
        lines: safeLines,
        highlight: highlightVal.trim()
      };

      // Live-update Modal DOM (Title, Left Artwork, Right Mechanism Controls, Active Hints)
      const titleEl = document.getElementById('modal-obj-title');
      if (titleEl) titleEl.textContent = obj.name;
      const clueEl = document.getElementById('modal-clue-payload');
      if (clueEl) clueEl.textContent = obj.cluePayload;
      if (modalHintStage >= 1) {
        const s1 = document.getElementById('modal-hint-stage1');
        if (s1) s1.textContent = `1차 힌트: ${getStage1Hint(obj)}`;
      }
      if (modalHintStage >= 2) {
        const ruleEl = document.getElementById('modal-prob-rule');
        if (ruleEl) ruleEl.textContent = `풀이: ${obj.probRule}  |  정답 코드: ${obj.passcode}`;
      }

      const prop = PROP_ONTOLOGY.find(p => p.targetObjId === obj.id || p.targetParentId === obj.id);
      renderPropVisualArtwork(obj, prop);
      renderRightDeviceControls(obj);

      // Live-sync Studio Inspector, 2D CAD, 3D Room, Sidebar/DAG, RaC JSON & localStorage autosave
      updateInspectorValues(obj);
      renderRoomSidebarAndProgress();
      render2DCadObjects();
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      updateCodeView();
    }

    function getCharsetForActiveObj() {
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return "0123456789";
      if (obj.interfaceType === 'DirectionalLock') return "UDLR";
      if (/^[A-Z]+$/.test(obj.passcode || '')) return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      return "0123456789";
    }

    function turnDial(idx, delta) {
      const charset = getCharsetForActiveObj();
      const curIdx = Math.max(0, charset.indexOf(dialChars[idx]));
      const nextIdx = (curIdx + delta + charset.length) % charset.length;
      dialChars[idx] = charset[nextIdx];
      document.getElementById('d' + idx).textContent = dialChars[idx];
      playSfx('click');
    }

    function pushDirKey(k) {
      dialChars[dirInputCursor] = k;
      document.getElementById('d' + dirInputCursor).textContent = k;
      dirInputCursor = (dirInputCursor + 1) % 4;
      playSfx('click');
    }

    function clearDirKeys() {
      for (let i = 0; i < 4; i++) {
        dialChars[i] = 'U';
        document.getElementById('d' + i).textContent = 'U';
      }
      dirInputCursor = 0;
      playSfx('click');
    }

    function autoFillDial() {
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      const pass = (obj ? obj.passcode || "0000" : "0000").toUpperCase();
      for (let i = 0; i < 4; i++) {
        dialChars[i] = pass[i] || '0';
        document.getElementById('d' + i).textContent = dialChars[i];
      }
      playSfx('click');
    }

    function isVictoryConditionMet(obj) {
      const total = studioObjects.length;
      if (total === 0) return false;
      const solvedCount = studioObjects.filter(o => o.solved).length;
      if (solvedCount >= total) return true;
      const isSequentialTheme = studioObjects.some(o => !!o.requiresSolvedId);
      if (isSequentialTheme && obj) {
        if ((obj.qNum === total && !!obj.requiresSolvedId) || obj.unlocksId === 'door-final-exit') {
          return true;
        }
      }
      return false;
    }

    function configureNextButton(obj, nextBtn) {
      if (isVictoryConditionMet(obj)) {
        nextBtn.textContent = "🏆 최종 탈출 완료! (결과 보기)";
        nextBtn.classList.remove('hidden');
      } else if (obj.isBossDoor && obj.nextRoomIdx >= 0) {
        const nextRc = ROOM_CONFIGS[obj.nextRoomIdx];
        nextBtn.textContent = `🚪 해금된 통로를 지나 [${nextRc.shortName}](으)로 진입하기 ➔`;
        nextBtn.classList.remove('hidden');
      } else {
        const nextObj = studioObjects.find(o => o.qNum === obj.qNum + 1);
        if (nextObj) {
          nextBtn.textContent = `🔍 획득한 단서로 다음 퍼즐 [Q${String(nextObj.qNum).padStart(2,'0')} ${nextObj.name}] 풀기 ➔`;
          nextBtn.classList.remove('hidden');
        } else {
          nextBtn.classList.add('hidden');
        }
      }
    }

    function triggerNextPuzzleOrRoom() {
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return;

      if (isVictoryConditionMet(obj)) {
        closeLockModal();
        showVictoryModal();
        return;
      }

      if (obj.isBossDoor && obj.nextRoomIdx >= 0) {
        closeLockModal();
        switchRoom(obj.nextRoomIdx);
        return;
      }

      const nextObj = studioObjects.find(o => o.qNum === obj.qNum + 1);
      if (nextObj) {
        if (nextObj.roomIdx !== currentRoomIdx) switchRoom(nextObj.roomIdx);
        selectObject(nextObj.id);
        openLockModalForObject(nextObj.id);
      }
    }

    function executeUnlockEffects(obj) {
      if (!obj) return [];
      // 문제 유도 의의에 충실: 이 퍼즐을 단독으로 가리키던 유도 조명은 해금 완료와 동시에 자동 소등
      // (같은 조명을 공유하는 미해결 문제가 남아 있으면 유지)
      const solvedIds = new Set(studioObjects.filter(o => o.solved).map(o => o.id));
      solvedIds.add(obj.id);
      extinguishGuidanceLightsForProp(obj.id, solvedIds);
      if (!Array.isArray(obj.onUnlockEffects) || obj.onUnlockEffects.length === 0) return [];
      const ignited = [];
      obj.onUnlockEffects.forEach(ef => {
        if (!ef || !ef.targetId) return;
        if (ef.kind === 'lightOn') {
          setLightFixtureOn(ef.targetId, true, true);
          playSfx(ef.sfx || 'spark');
          ignited.push(ef.targetId);
        } else if (ef.kind === 'lightOff') {
          setLightFixtureOn(ef.targetId, false, false);
          if (ef.sfx) playSfx(ef.sfx);
        }
      });
      markSceneDirty();
      return ignited;
    }

    function checkLockSolution() {
      const obj = studioObjects.find(o => o.id === activeModalObjId);
      if (!obj) return;

      const code = dialChars.join('').toUpperCase();
      const correctCode = (obj.passcode || '0000').toUpperCase();
      const fb = document.getElementById('lock-feedback');
      const nextBtn = document.getElementById('modal-next-action-btn');

      if (code === correctCode) {
        obj.solved = true;
        playSfx('unlock');
        const rewardItem = grantRewardItemForPuzzle(obj);
        renderModalItemApplyBox(obj);
        const ignitedLights = executeUnlockEffects(obj);
        if (ignitedLights.length > 0) {
          showDirectorWhisper(`찌지직— 다음 단서 구역의 조명(${ignitedLights.join(', ')})이 켜졌습니다.`);
        } else if (!rewardItem && obj.storyBeat) {
          showDirectorWhisper(obj.storyBeat);
        }

        fb.className = "text-xs font-bold py-2 px-3 rounded text-emerald-300 bg-emerald-950 border border-emerald-500 shadow text-center";
        fb.textContent = `철컥! [${code}] 정답 일치! ${obj.unlocksName} 성공!${rewardItem ? ` (+ ${rewardItem.name} 획득)` : ''}${ignitedLights.length > 0 ? ` (💡 점등: ${ignitedLights.join(', ')})` : ''}`;

        syncObjectTo3D(obj);
        if (obj.isBossDoor) {
          rebuild3DRoom();
        }
        render2DCadObjects();
        renderRoomSidebarAndProgress();
        updateInspectorValues(obj);
        updateCodeView();

        configureNextButton(obj, nextBtn);

        if (isVictoryConditionMet(obj)) {
          setTimeout(() => {
            closeLockModal();
            showVictoryModal();
          }, 900);
        }
      } else {
        failureCount++;
        playSfx('click');
        const failEl = document.getElementById('insp-failures');
        if (failEl) {
          const suffix = activeThemeGenre === 'Adventure' ? '부저 경고' : activeThemeGenre === 'Mystery' ? '수사 경고' : '2회 시 암전';
          failEl.textContent = `${failureCount}회 (${suffix})`;
        }

        if (activeThemeGenre === 'Adventure') {
          const mcName = directorPersona.name || 'MC 제이';
          if (failureCount % 2 === 0) {
            showDirectorWhisper(`삐빅—! ${mcName}: "아쉽지만 땡! 단서 카드의 강조된 한 줄을 다시 확인해 보세요!"`);
          }
          fb.className = "text-xs font-bold py-2 px-3 rounded text-amber-200 bg-amber-950 border border-amber-500 text-center";
          fb.textContent = `삐빅! [${code}] 오답 부저! ${mcName}의 힌트 찬스나 단서 카드를 다시 확인해 보세요.`;
        } else if (activeThemeGenre === 'Mystery') {
          const detName = directorPersona.name || '강력계 한 반장';
          if (failureCount % 2 === 0) {
            triggerDirectorBlackout();
            showDirectorWhisper(`[${detName}] 성급한 오판은 진범에게 도주 시간만 벌어줄 뿐이야. 침착하게 물증과 타임스탬프를 교차검증하게.`);
          }
          fb.className = "text-xs font-bold py-2 px-3 rounded text-amber-200 bg-zinc-900 border border-amber-500/60 text-center";
          fb.textContent = `[${code}] 단서 불일치! 증거 기록과 용의자 타임라인을 다시 대조해 보십시오.`;
        } else if (failureCount % 2 === 0) {
          triggerDirectorBlackout();
          showDirectorWhisper("틀리셨네요... 너무 서두르시면 불이 꺼져 버린답니다. 힌트가 필요하면 인터폰을 눌러 보세요.");
          fb.className = "text-xs font-bold py-2 px-3 rounded text-rose-200 bg-rose-950 border border-rose-500 animate-pulse text-center";
          fb.textContent = `[Director 경고] 오답 누적! 병동 조명이 강제 암전됩니다. 힌트 버튼이나 인터폰을 활용해 보세요.`;
        } else {
          fb.className = "text-xs font-bold py-2 px-3 rounded text-rose-300 bg-rose-950 border border-rose-500 text-center";
          fb.textContent = `[${code}] 불일치! 좌측 단서를 다시 확인하거나 힌트를 열어보세요.`;
        }
      }
    }

    function solveCurrentRoomAll() {
      const roomObjs = studioObjects.filter(o => o.roomIdx === currentRoomIdx);
      roomObjs.forEach(o => { o.solved = true; });
      playSfx('unlock');
      rebuild3DRoom();
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      const selObj = studioObjects.find(o => o.id === selectedObjectId);
      if (selObj) updateInspectorValues(selObj);
      updateCodeView();
    }

    function solveAll30Puzzles() {
      studioObjects.forEach(o => { o.solved = true; });
      playSfx('unlock');
      rebuild3DRoom();
      rebuild3DObjectsForCurrentRoom();
      render2DCadObjects();
      renderRoomSidebarAndProgress();
      const selObj = studioObjects.find(o => o.id === selectedObjectId);
      if (selObj) updateInspectorValues(selObj);
      updateCodeView();
      showVictoryModal();
    }

    function resetAll30Puzzles() {
      studioObjects.forEach(o => { o.solved = false; });
      failureCount = 0;
      document.getElementById('insp-failures').textContent = `0회 (2회 시 암전)`;
      playSfx('click');
      switchRoom(0);
    }

    function showVictoryModal() {
      const elapsedM = Math.floor(timerElapsedSeconds / 60);
      const elapsedS = timerElapsedSeconds % 60;
      const total = studioObjects.length;
      const solvedCnt = studioObjects.filter(o => o.solved).length;
      const pct = total > 0 ? Math.round((solvedCnt / total) * 100) : 100;
      const roomCnt = ROOM_CONFIGS.length;
      const firstRoom = ROOM_CONFIGS[0]?.shortName || '시작 구역';
      const lastRoom = ROOM_CONFIGS[roomCnt - 1]?.shortName || '최종 구역';

      const subEl = document.getElementById('vic-subtitle');
      if (subEl) subEl.textContent = `${roomCnt} Rooms · ${total} Puzzles Conquered`;
      const titleEl = document.getElementById('vic-title');
      if (titleEl) titleEl.textContent = `${activeThemeTitle} 완전 클리어!`;
      const descEl = document.getElementById('vic-desc');
      if (descEl) {
        descEl.innerHTML = `축하합니다! <b>${escapeXml(firstRoom)}</b>부터 <b>${escapeXml(lastRoom)}</b>까지 ${roomCnt}개 공간과 <b>${total}개의 닫힌 세계 인과율(FSM)</b>을 완벽히 격파하셨습니다!`;
      }
      const routeEl = document.getElementById('vic-route');
      if (routeEl) routeEl.textContent = ROOM_CONFIGS.map(r => r.shortName).join(' ➔ ');
      const tlTitleEl = document.getElementById('vic-timeline-title');
      if (tlTitleEl) tlTitleEl.textContent = `${roomCnt}개 공간 클리어 타임라인`;
      const mapBtn = document.getElementById('vic-map-btn');
      if (mapBtn) mapBtn.textContent = `${total}문제 맵 보기`;

      const roomGridEl = document.getElementById('vic-room-grid');
      if (roomGridEl) {
        const cols = Math.max(1, Math.min(roomCnt, 6));
        roomGridEl.className = `grid gap-1 text-center font-mono text-[9px]`;
        roomGridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        roomGridEl.innerHTML = ROOM_CONFIGS.map((rc, i) => {
          const rObjs = studioObjects.filter(o => o.roomIdx === rc.idx);
          const qNums = rObjs.map(o => o.qNum).filter(n => typeof n === 'number');
          const rangeTxt = qNums.length > 0
            ? `Q${String(Math.min(...qNums)).padStart(2, '0')}~${String(Math.max(...qNums)).padStart(2, '0')}`
            : '-';
          const rSolved = rObjs.filter(o => o.solved).length;
          return `
            <div class="bg-slate-900 border border-emerald-500/50 p-1 rounded">
              <div class="text-emerald-400 font-bold truncate">${escapeXml(rc.shortName)}</div>
              <div class="text-slate-400">${rangeTxt}</div>
              <div class="text-white font-bold mt-0.5">${i === roomCnt - 1 ? '클리어!' : `${rSolved}/${rObjs.length}`}</div>
            </div>
          `;
        }).join('');
      }

      document.getElementById('vic-elapsed-time').textContent = `${elapsedM}분 ${elapsedS}초`;
      document.getElementById('vic-solved-count').textContent = `${solvedCnt} / ${total} 문항 (${pct}%)`;

      const failEl = document.getElementById('vic-failures-count');
      if (failEl) failEl.textContent = `${failureCount}회`;

      const rankEl = document.getElementById('vic-director-rank');
      if (rankEl) {
        if (failureCount === 0) rankEl.textContent = "S+ (노미스 완벽 클리어)";
        else if (failureCount <= 2) rankEl.textContent = "S (냉철한 해결사)";
        else if (failureCount <= 5) rankEl.textContent = "A+ (신중한 생환자)";
        else rankEl.textContent = "B (끝까지 완주한 도전자)";
      }

      document.getElementById('victory-modal').classList.remove('hidden');
      playSfx('unlock');
    }

    function copyEscapeCertificate() {
      const elapsedM = Math.floor(timerElapsedSeconds / 60);
      const elapsedS = timerElapsedSeconds % 60;
      const total = studioObjects.length;
      const solvedCnt = studioObjects.filter(o => o.solved).length;
      const routeStr = ROOM_CONFIGS.map(r => r.shortName).join(' ➔ ');
      const cert = `=========================================
🏆 [${activeThemeTitle}] 클리어 인증서
=========================================
• 탈출 일시: ${new Date().toISOString().slice(0, 10)}
• 탈출 소요 시간: ${elapsedM}분 ${elapsedS}초
• 관통 건축 동선: ${routeStr}
• 해금 퍼즐 볼륨: ${solvedCnt} / ${total} 문항 (${total > 0 ? Math.round((solvedCnt / total) * 100) : 100}% All Clear)
• 누적 오답 횟수: ${failureCount}회
• Director 최종 평가: ${failureCount === 0 ? 'S+ (노미스 완벽 클리어)' : 'S (냉철한 해결사)'}
• 방 탈출 엔진: Room as Code (RaC) v1.0 Universal Spine
=========================================`;

      navigator.clipboard.writeText(cert).then(() => {
        alert(`📋 《${activeThemeTitle}》 클리어 인증서가 클립보드에 복사되었습니다!`);
      });
    }

    function triggerDirectorBlackout() {
      // Genre-aware director reaction: Adventure = playful MC buzzer (no blackout), Mystery = noir detective whisper (no jumpscare)
      if (activeThemeGenre === 'Adventure') {
        playSfx('click');
        const mcName = directorPersona.name || 'MC 제이';
        showDirectorWhisper(`삐빅—! [${mcName}] "스튜디오 퀴즈 부저 발동! 암전 대신 밝은 조명 아래서 차분히 다음 시그널을 풀어보세요!"`);
        return;
      }
      if (activeThemeGenre === 'Mystery') {
        playSfx('drone');
        const detName = directorPersona.name || '강력계 한 반장';
        showDirectorWhisper(`[${detName}] "현장 조명이 잠시 흔들렸군... 당황하지 말고 확보한 물증부터 다시 짚어보게."`);
        setDirectorLightMultiplier(0.45);
        setTimeout(() => {
          setDirectorLightMultiplier(1.0);
          applyGenreAtmosphere(cameraMode);
        }, 1200);
        return;
      }

      // 1. 초기 고전압 스파크 사운드 및 폴터가이스트 조명 지글거림 시작
      playSfx('spark');

      const toast = document.getElementById('director-toast');
      const toastMsg = document.getElementById('director-toast-msg');
      if (toast && toastMsg) {
        toast.classList.remove('hidden');
        toastMsg.textContent = "⚠️ [폴터가이스트 전압 이상] 지지직... 병동 형광등이 지글거리며 꺼집니다!";
      }

      const hudLight = document.getElementById('hud-lighting-val');
      if (hudLight) {
        hudLight.textContent = "전압 불안정 (Flicker)";
        hudLight.className = "text-amber-400 font-bold animate-pulse";
      }

      // 2. 조명 전압 급강하 & 지글거림 400ms 시퀀스 (물리 조명 Fixtures 직접 지글거림 연동)
      const flickerSteps = [
        { t: 0, s: 0.1, a: 0.08, mult: 0.15, sfx: 'spark' },
        { t: 60, s: 1.6, a: 0.35, mult: 1.4, sfx: null },
        { t: 130, s: 0.05, a: 0.04, mult: 0.08, sfx: 'spark' },
        { t: 200, s: 1.3, a: 0.30, mult: 1.2, sfx: null },
        { t: 270, s: 0.02, a: 0.02, mult: 0.03, sfx: 'spark' },
        { t: 330, s: 0.8, a: 0.20, mult: 0.7, sfx: null },
        { t: 400, s: 0.03, a: 0.02, mult: 0.02, sfx: 'drone' }
      ];

      flickerSteps.forEach(step => {
        setTimeout(() => {
          if (ambientLight) ambientLight.intensity = step.a;
          setDirectorLightMultiplier(step.mult);
          if (step.sfx) playSfx(step.sfx);
        }, step.t);
      });

      // 3. 420ms 시점: 완전 암전(5%) 돌입 + 심장박동 루프 시작 + 점프스케어 실루엣 출현!
      setTimeout(() => {
        setDirectorLightMultiplier(0.04);
        if (ambientLight) ambientLight.intensity = 0.02;
        if (hudLight) {
          hudLight.textContent = "5% (Blackout)";
          hudLight.className = "text-rose-500 font-bold";
        }
        const inspLight = document.getElementById('insp-light-stat');
        if (inspLight) {
          inspLight.textContent = "암전 (5%)";
          inspLight.className = "text-rose-400 font-bold";
        }
        if (toastMsg) {
          toastMsg.textContent = "⚠️ [Director 암전 & 심연] 어둠 속에서 거친 숨소리와 붉은 눈의 그림자가 번뜩입니다...";
        }

        // 공포 극대화: 심장박동 루프 시작 & 점프스케어 실루엣 출현
        startHeartbeatLoop(128);
        triggerJumpScare();
      }, 420);

      // 4. 2.6초 후: 비상 전력 가동 및 조명 복구
      setTimeout(() => {
        playSfx('spark');
        stopHeartbeatLoop();

        // 켜질 때 1회 스파크 후 비상등 안착
        setDirectorLightMultiplier(0.35);
        setTimeout(() => {
          setDirectorLightMultiplier(1.0);
          if (ambientLight) ambientLight.intensity = (cameraMode === 'fps') ? 0.04 : 0.14;
        }, 110);

        if (toastMsg) toastMsg.textContent = "🚨 [비상 전력 복구] 병동 비상 발전기가 가동되어 조명이 복구되었습니다.";
        if (hudLight) {
          hudLight.textContent = "85% (Emergency)";
          hudLight.className = "text-amber-400 font-bold";
        }
        const inspLight = document.getElementById('insp-light-stat');
        if (inspLight) {
          inspLight.textContent = "비상등 (85%)";
        }

        setTimeout(() => {
          if (toast) toast.classList.add('hidden');
        }, 3000);
      }, 2600);
    }

    // -------------------------------------------------------------
    // 10. THEME SHARING & IMPORT/EXPORT PIPELINE (URL Hash & JSON)
    // -------------------------------------------------------------
    function shareThemeUrl() {
      const state = studioObjects.map(o => ({ id: o.id, solved: o.solved, code: o.passcode, x: o.x, z: o.z }));
      const jsonStr = JSON.stringify(state);
      const b64 = btoa(encodeURIComponent(jsonStr));
      const url = window.location.origin + window.location.pathname + '#theme=' + b64;

      navigator.clipboard.writeText(url).then(() => {
        alert("📤 테마 상태가 포함된 원클릭 공유 URL이 클립보드에 복사되었습니다!\n" + url);
      });
    }

    function copyAiAgentRacPrompt() {
      const promptText = [
        "당신은 Room as Code (RaC v2) 방탈출 설계자입니다. 아래 JSON 형식으로 새로운 방탈출 테마를 작성해 주세요.",
        "- 각 퍼즐은 requiresSolvedId로 앞 퍼즐과 연결하여 플레이어가 스토리를 순차적으로 알아가게 설계하세요.",
        "- 단서 시각화는 visualSpec.template ('document' | 'blueprint' | 'crt' | 'photo')으로 지정하세요.",
        "- 물리 장치는 mechanism.kind ('rotary-dial' | 'clock-hands' | 'balance-scale' | 'uv-scan' | 'pressure-valve')로 지정하세요.",
        "- 아이템은 자유롭게 이름 짓되 interactions[].effect는 'unlock' | 'revealClue' | 'activate' | 'combine' 4원자 중 하나를 사용하세요.",
        "",
        "출력 JSON 스키마 예시:",
        JSON.stringify({
          themeTitle: "테마 제목",
          directorPersona: { name: "극중 인물 이름", role: "역할" },
          objects: [
            {
              qNum: 1, id: "prop-1", roomIdx: 0, type: "desk", name: "기물 이름",
              x: 2.0, z: 1.5, w: 1.0, d: 0.7, passcode: "0414",
              cluePayload: "단서 내용", probRule: "풀이 규칙", unlocksName: "해금 대상",
              requiresSolvedId: null, storyBeat: "해금 시 드러나는 스토리 파편",
              visualSpec: { template: "document", title: "문서 제목", lines: ["첫 줄", "둘째 줄"], highlight: "핵심 힌트" }
            }
          ]
        }, null, 2)
      ].join("\n");
      navigator.clipboard.writeText(promptText).then(() => {
        showDirectorWhisper("AI 에이전트용 RaC v2 프롬프트가 클립보드에 복사되었습니다. 개인 에이전트에 붙여넣어 보세요.");
      }).catch(() => {
        const ta = document.getElementById('import-json-textarea');
        if (ta) ta.value = promptText;
      });
    }

    function runStudioIntegrityValidation() {
      const box = document.getElementById('validation-result-box');
      if (!box) return;

      // 0. Pure Engine Single-Source-of-Truth Validation
      const snapshot = buildRacJsonSnapshot();
      const engineRes = validateRaC(snapshot);

      const errors = [];
      const warnings = [];

      if (engineRes && Array.isArray(engineRes.errors)) {
        engineRes.errors.forEach(e => {
          errors.push(`[${e.code}] ${e.message}`);
        });
      }
      if (engineRes && Array.isArray(engineRes.warnings)) {
        engineRes.warnings.forEach(w => {
          warnings.push(`[${w.code}] ${w.message}`);
        });
      }

      const objMap = new Map(studioObjects.map(o => [o.id, o]));

      // 1. 정답 누락 및 빈 단서 검사
      studioObjects.forEach(o => {
        if (!o.passcode || !String(o.passcode).trim()) {
          errors.push(`[EMPTY_GATE_CONDITION] Q${String(o.qNum).padStart(2,'0')} ${o.name} 정답 누락`);
        }
        if (!o.cluePayload || !String(o.cluePayload).trim()) {
          warnings.push(`[EMPTY_CLUE_PAYLOAD] Q${String(o.qNum).padStart(2,'0')} ${o.name} 단서 비어있음`);
        }
      });

      // 2. 공간 도달성 검증 (BFS from ROOM_CONFIGS[0] over studioPassages, matching engine/validator.js)
      if (ROOM_CONFIGS.length > 0) {
        const spaceIds = new Set(ROOM_CONFIGS.map(r => r.id));
        const adj = new Map();
        spaceIds.forEach(sid => adj.set(sid, []));
        const isTerminalExit = (id) => typeof id === 'string' && /exit|escape|outside|exterior/i.test(id);
        studioPassages.forEach(p => {
          if (!spaceIds.has(p.fromSpaceId)) {
            errors.push(`[INVALID_PASSAGE_SPACE] 통로 ${p.id}의 출발 공간(${p.fromSpaceId})이 존재하지 않습니다.`);
            return;
          }
          if (isTerminalExit(p.toSpaceId)) return;
          if (!spaceIds.has(p.toSpaceId)) {
            errors.push(`[INVALID_PASSAGE_SPACE] 통로 ${p.id}의 도착 공간(${p.toSpaceId})이 존재하지 않습니다.`);
            return;
          }
          adj.get(p.fromSpaceId).push(p.toSpaceId);
          if (p.directionality !== 'OneWay') adj.get(p.toSpaceId).push(p.fromSpaceId);
        });
        const visited = new Set([ROOM_CONFIGS[0].id]);
        const queue = [ROOM_CONFIGS[0].id];
        while (queue.length > 0) {
          const cur = queue.shift();
          for (const nxt of (adj.get(cur) || [])) {
            if (!visited.has(nxt)) {
              visited.add(nxt);
              queue.push(nxt);
            }
          }
        }
        ROOM_CONFIGS.forEach(r => {
          if (!visited.has(r.id)) {
            errors.push(`[UNREACHABLE_SPACE] 공간 '${r.shortName}'(${r.id})에 도달할 통로가 없습니다.`);
          }
        });
      }

      // 3. 아이템 자기잠금(ITEM_SELF_DEADLOCK) 및 미등록 아이템 검증
      studioObjects.forEach(o => {
        if (o.requiredItemId) {
          const reqItem = ITEM_CATALOG[o.requiredItemId];
          if (!reqItem) {
            errors.push(`[UNKNOWN_REQUIRED_ITEM] Q${String(o.qNum).padStart(2,'0')} ${o.name}가 없는 아이템(${o.requiredItemId})을 요구합니다.`);
          } else if (reqItem.rewardOnQNum === o.qNum) {
            errors.push(`[ITEM_SELF_DEADLOCK] Q${String(o.qNum).padStart(2,'0')} ${o.name}을 여는 아이템 '${reqItem.name}'이 같은 퍼즐의 보상으로 묶여 있습니다.`);
          }
        }
      });
      ITEM_INTERACTIONS.forEach(ix => {
        const it = ITEM_CATALOG[ix.itemId];
        if (!it) {
          errors.push(`[UNKNOWN_REQUIRED_ITEM] 상호작용 ${ix.id}가 존재하지 않는 아이템(${ix.itemId})을 참조합니다.`);
          return;
        }
        if (ix.effect !== 'combine' && ix.targetQNum && it.rewardOnQNum === ix.targetQNum) {
          errors.push(`[ITEM_SELF_DEADLOCK] Q${String(ix.targetQNum).padStart(2,'0')} 퍼즐을 여는 아이템 '${it.name}'이 같은 Q${String(ix.targetQNum).padStart(2,'0')}의 보상입니다.`);
        }
      });

      // 4. 선행 퍼즐(requiresSolvedId) 순환 교착(Deadlock) DFS 탐지
      const color = new Map();
      function hasCycle(id) {
        color.set(id, 1);
        const o = objMap.get(id);
        if (o && o.requiresSolvedId && objMap.has(o.requiresSolvedId)) {
          const c = color.get(o.requiresSolvedId) || 0;
          if (c === 1 || (c === 0 && hasCycle(o.requiresSolvedId))) return true;
        }
        color.set(id, 2);
        return false;
      }
      studioObjects.forEach(o => {
        if ((color.get(o.id) || 0) === 0 && hasCycle(o.id)) {
          errors.push(`[PREREQUISITE_CYCLE] Q${String(o.qNum).padStart(2,'0')} ${o.name}의 선행 조건이 순환합니다.`);
        }
      });

      box.classList.remove('hidden');
      if (errors.length === 0) {
        box.className = "p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono leading-relaxed";
        box.innerHTML = `PASS · 닫힌 세계 무결성 검증 통과 (공간 ${ROOM_CONFIGS.length}개 · 통로 ${studioPassages.length}개 · 퍼즐 ${studioObjects.length}개, 오류 0건, 경고 ${warnings.length}건)`
          + (warnings.length ? `<div class="mt-1 text-amber-300">${warnings.join('<br/>')}</div>` : '');
      } else {
        box.className = "p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-[11px] font-mono leading-relaxed";
        box.innerHTML = `FAIL · 오류 ${errors.length}건 감지:<br/>${errors.join('<br/>')}`;
      }
    }

    function openImportModal() {
      const modal = document.getElementById('import-modal');
      const textarea = document.getElementById('import-json-textarea');
      const vBox = document.getElementById('validation-result-box');
      if (vBox) vBox.classList.add('hidden');
      if (modal && textarea) {
        textarea.value = JSON.stringify({
          ...buildRacJsonSnapshot(),
          objects: studioObjects
        }, null, 2);
        modal.classList.remove('hidden');
      }
    }

    function parsePasscodeFromCondition(cond) {
      if (!cond) return '1234';
      const m = String(cond).match(/'([^']+)'/);
      return (m ? m[1] : String(cond)).trim().toUpperCase();
    }

    function syncThemeHeaderUi() {
      const badge = document.getElementById('header-theme-badge');
      const sel = document.getElementById('theme-preset-selector');
      const sub = document.getElementById('header-theme-subtitle');
      const blackoutBtn = document.getElementById('btn-director-blackout');
      const timerEl = document.getElementById('director-timer-hud');

      if (sel && Array.from(sel.options).some(o => o.value === activeThemeId)) {
        sel.value = activeThemeId;
      }
      if (sub) {
        sub.textContent = `${ROOM_CONFIGS.length} Spaces · ${studioObjects.length} Puzzles`;
      }
      if (badge) {
        badge.textContent = `Q${studioObjects.length}`;
        if (activeThemeGenre === 'Adventure') {
          badge.className = 'min-w-[2.25rem] px-1.5 h-6 bg-sky-950 border border-sky-400/50 rounded flex items-center justify-center font-mono font-semibold text-sky-300 text-[11px]';
        } else if (activeThemeGenre === 'Mystery') {
          badge.className = 'min-w-[2.25rem] px-1.5 h-6 bg-amber-950 border border-amber-500/50 rounded flex items-center justify-center font-mono font-semibold text-amber-300 text-[11px]';
        } else {
          badge.className = 'min-w-[2.25rem] px-1.5 h-6 bg-zinc-900 border border-rose-500/40 rounded flex items-center justify-center font-mono font-semibold text-rose-400 text-[11px]';
        }
      }
      const solveAllBtn = document.getElementById('btn-solve-all-puzzles');
      if (solveAllBtn) solveAllBtn.textContent = `${studioObjects.length}문제 전수 해금`;
      if (blackoutBtn) {
        if (activeThemeGenre === 'Adventure') {
          blackoutBtn.textContent = 'MC 부저';
          blackoutBtn.className = 'px-2 py-0.5 bg-sky-950/80 hover:bg-sky-900 border border-sky-500/30 rounded text-sky-300 font-medium transition-colors';
        } else if (activeThemeGenre === 'Mystery') {
          blackoutBtn.textContent = '현장 무전';
          blackoutBtn.className = 'px-2 py-0.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/30 rounded text-amber-300 font-medium transition-colors';
        } else {
          blackoutBtn.textContent = '공포 암전';
          blackoutBtn.className = 'px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 rounded text-rose-300 font-medium transition-colors';
        }
      }
      if (timerEl) {
        const remain = Math.max(0, timeLimitSeconds - timerElapsedSeconds);
        const m = Math.floor(remain / 60);
        const s = remain % 60;
        timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      document.title = `Room as Code Studio - ${activeThemeTitle}`;
    }

    function applySpacesAndPassagesFromRac(data, options = {}) {
      const chainRooms = !!options.chainRooms;
      const genre = (data.theme && data.theme.genre) || activeThemeGenre || 'Horror';
      const rawPassages = Array.isArray(data.passages) ? data.passages : [];

      if (Array.isArray(data.spaces) && data.spaces.length > 0) {
        ROOM_CONFIGS.length = 0;
        let nextX = 0;
        data.spaces.forEach((sp, idx) => {
          const poly = Array.isArray(sp.polygon) && sp.polygon.length >= 3 ? sp.polygon : [[0,0],[6,0],[6,5],[0,5]];
          const xs = poly.map(pt => pt[0]);
          const zs = poly.map(pt => pt[1]);
          const w = Math.max(3, Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10 || 6.0);
          const h = Math.max(3, Math.round((Math.max(...zs) - Math.min(...zs)) * 10) / 10 || 5.0);
          const fh = typeof sp.floorHeight === 'number' ? sp.floorHeight : 0.0;
          const floorId = fh >= 2 ? '2f' : '1f';
          const wallTint = sp.materials && sp.materials.wallTint;
          const floorTint = sp.materials && sp.materials.floorTint;
          const wallColor = (wallTint && /^#[0-9a-fA-F]{6}$/.test(wallTint)) ? parseInt(wallTint.slice(1), 16) : (genre === 'Adventure' ? 0xdbeafe : 0x475569);
          const floorColor = (floorTint && /^#[0-9a-fA-F]{6}$/.test(floorTint)) ? parseInt(floorTint.slice(1), 16) : (genre === 'Adventure' ? 0xcbd5e1 : 0x1e293b);
          const base = chainRooms ? null : DEFAULT_ROOM_CONFIGS[idx];
          const spId = sp.id || `space-r${idx + 1}`;
          const outPass = rawPassages.find(p => p.fromSpaceId === spId);
          const inPass = rawPassages.find(p => p.toSpaceId === spId);
          const hasWestDoor = rawPassages.length > 0 ? !!inPass : (idx > 0);
          const hasEastDoor = rawPassages.length > 0 ? !!outPass : (idx < data.spaces.length - 1);
          const defaultAtmo = genre === 'Adventure' ? '밝은 게임쇼 스튜디오 조명' : genre === 'Mystery' ? '누아르 사건 현장 감식등' : '실내 조명';
          const nextSpace = outPass ? data.spaces.find(s => s.id === outPass.toSpaceId) : null;
          const passageInfo = outPass
            ? `${outPass.directionality || 'TwoWay'} ➔ ${nextSpace ? nextSpace.name : '최종 탈출구'}`
            : (base ? base.passageInfo : 'RaC 통로 연결');
          ROOM_CONFIGS.push({
            idx,
            id: spId,
            floorId,
            shortName: (sp.name || `제${idx + 1}방`).slice(0, 22),
            fullName: sp.name || `제${idx + 1}방`,
            layerLabel: fh >= 2 ? '2F 상층 (+2.6m)' : '1F 지상',
            floorHeight: fh,
            wallHeight: sp.wallHeight || 2.6,
            w, h,
            worldX: base ? base.worldX : nextX,
            worldZ: base ? base.worldZ : 0.0,
            hasWestDoor,
            hasEastDoor,
            materials: {
              wall: (sp.materials && sp.materials.wall) || 'plaster',
              floor: (sp.materials && sp.materials.floor) || 'tile'
            },
            lights: Array.isArray(sp.lights) ? JSON.parse(JSON.stringify(sp.lights)) : (base ? JSON.parse(JSON.stringify(base.lights)) : []),
            passageInfo,
            floorColor,
            wallColor,
            lightColor: (Array.isArray(sp.lights) && sp.lights[0] && typeof sp.lights[0].color === 'string' && sp.lights[0].color.startsWith('#'))
              ? parseInt(sp.lights[0].color.slice(1), 16)
              : (base ? base.lightColor : 0xe0f2fe),
            atmosphere: base ? base.atmosphere : defaultAtmo,
            doorId: (outPass && outPass.door && outPass.door.id) || `door-${spId}`
          });
          nextX += chainRooms ? w : (w + 3.0);
        });
      }
      if (Array.isArray(data.passages)) {
        studioPassages.length = 0;
        data.passages.forEach((p, idx) => {
          studioPassages.push({
            id: p.id || `pass-${idx + 1}`,
            fromSpaceId: p.fromSpaceId,
            toSpaceId: p.toSpaceId,
            directionality: p.directionality || 'TwoWay',
            traverseCost: p.traverseCost || 'Walk',
            door: {
              id: (p.door && p.door.id) || `door-p-${idx + 1}`,
              type: (p.door && p.door.type) || 'StandardDoor',
              isLocked: p.door ? p.door.isLocked !== false : true
            }
          });
        });
      }
    }

    function loadThemeFromSampleJson(jsonData) {
      if (!jsonData || !Array.isArray(jsonData.spaces) || !jsonData.logicGraph) {
        throw new Error('유효한 RaC v2 테마 JSON(spaces + logicGraph)이 아닙니다.');
      }
      const themeMeta = jsonData.theme || {};
      const nextThemeId = themeMeta.id || 'custom-theme';
      const isAsylum = nextThemeId === 'asylum-404' || nextThemeId === 'asylum-404-abyssal-anatomy';

      activeThemeId = isAsylum ? 'asylum-404' : nextThemeId;
      activeThemeTitle = themeMeta.title || nextThemeId;
      activeThemeGenre = themeMeta.genre || 'Horror';
      timeLimitSeconds = Math.max(1, Number(themeMeta.durationMinutes || (jsonData.director && jsonData.director.timeLimitMinutes) || 60)) * 60;
      timerElapsedSeconds = 0;
      failureCount = 0;
      playerInventory.clear();

      // Clear 404-specific props & partitions for non-404 themes
      PROP_ONTOLOGY.length = 0;
      ROOM_PARTITIONS.length = 0;
      if (isAsylum) {
        JSON.parse(JSON.stringify(DEFAULT_PROP_ONTOLOGY)).forEach(p => PROP_ONTOLOGY.push(p));
        JSON.parse(JSON.stringify(DEFAULT_ROOM_PARTITIONS)).forEach(p => ROOM_PARTITIONS.push(p));
      }

      applySpacesAndPassagesFromRac(jsonData, { chainRooms: !isAsylum });

      const lg = jsonData.logicGraph;
      const clues = Array.isArray(lg.clues) ? lg.clues : [];
      const problems = Array.isArray(lg.problems) ? lg.problems : [];
      const gates = Array.isArray(lg.gates) ? lg.gates : [];
      const containers = Array.isArray(lg.containers) ? lg.containers : [];

      const clueById = new Map(clues.map(c => [c.id, c]));
      const probByClue = new Map();
      problems.forEach(pr => (pr.consumes || []).forEach(cid => probByClue.set(cid, pr)));
      const gateById = new Map(gates.map(g => [g.id, g]));
      const contById = new Map(containers.map(c => [c.id, c]));

      const built = [];
      let qCounter = 1;
      jsonData.spaces.forEach((sp, rIdx) => {
        const props = Array.isArray(sp.props) ? sp.props : [];
        props.forEach(p => {
          const cl = clueById.get(p.targetClueId) || clues.find(c => c.propRef === p.id);
          if (!cl && !p.qNum) return; // skip decorative-only props without clues
          const pr = cl ? probByClue.get(cl.id) : null;
          const gt = (pr && gateById.get(pr.outputGate)) || gates[built.length];
          const cont = gt ? contById.get(gt.unlocks) : null;
          const pos = (p.transform && Array.isArray(p.transform.pos)) ? p.transform.pos : [1.5, 0.5, 1.5];
          const rot = (p.transform && Array.isArray(p.transform.rot)) ? p.transform.rot : [0, 0, 0];
          const isDoorUnlock = !!(gt && gt.unlocks && gt.unlocks.startsWith('door-'));
          const propType = (p.type === 'door' || p.model === 'Door' || p.model === 'FinalBlastDoor' || p.model === 'FinalDoor') ? 'door' : (p.type || p.model || 'desk');
          const colorTint = (p.material && typeof p.material === 'object' && p.material.tint) ? p.material.tint : (isDoorUnlock ? '#ef4444' : '#64748b');
          const matPreset = (p.material && typeof p.material === 'object') ? p.material.preset : (typeof p.material === 'string' ? p.material : null);

          built.push({
            qNum: (gt && gt.qNum) || p.qNum || qCounter++,
            id: p.id || `prop-rac-${built.length + 1}`,
            roomIdx: rIdx,
            type: propType,
            name: p.name || `기물 #${built.length + 1}`,
            x: typeof pos[0] === 'number' ? pos[0] : 1.5,
            z: typeof pos[2] === 'number' ? pos[2] : 1.5,
            w: propType === 'door' ? 0.35 : 1.0,
            d: propType === 'door' ? 1.24 : 0.7,
            color: colorTint,
            rotY: rot[1] || 0,
            wallSnapped: !!p.wallSnapped,
            clueId: (cl && cl.id) || p.targetClueId || `clue-rac-${built.length + 1}`,
            carrierType: (cl && cl.carrierType) || 'Text',
            cluePayload: (cl && cl.payload) || '',
            probId: (pr && pr.id) || `prob-rac-${built.length + 1}`,
            probRule: (pr && pr.rule) || '',
            gateId: (gt && gt.id) || `gate-rac-${built.length + 1}`,
            interfaceType: (gt && gt.interfaceType) || 'MechanicalLock',
            passcode: parsePasscodeFromCondition(gt && (gt.passcode || gt.condition)),
            unlocksId: (gt && gt.unlocks) || `cont-rac-${built.length + 1}`,
            unlocksName: (cont && cont.name) || (isDoorUnlock ? '다음 구역 통로 개방' : '다음 단서 해금'),
            isBossDoor: isDoorUnlock,
            nextRoomIdx: isDoorUnlock ? (rIdx < jsonData.spaces.length - 1 ? rIdx + 1 : -1) : undefined,
            solved: !!(gt && gt.isOpen),
            requiresSolvedId: (gt && gt.requiresSolvedId) || null,
            requiredItemId: (gt && gt.requiredItemId) || null,
            storyBeat: (gt && gt.storyBeat) || '',
            mechanism: (gt && gt.mechanism) ? JSON.parse(JSON.stringify(gt.mechanism)) : null,
            visualSpec: (cl && cl.visualSpec) ? JSON.parse(JSON.stringify(cl.visualSpec)) : null,
            onUnlockEffects: (gt && Array.isArray(gt.onUnlockEffects)) ? JSON.parse(JSON.stringify(gt.onUnlockEffects)) : null,
            modelPreset: p.modelPreset || null,
            modelUrl: p.modelUrl || null,
            material: matPreset || null
          });
        });
      });

      // Normalize requiresSolvedId: map gateId references (e.g. "gate-01") to studioObject.id
      const objIdByGateId = new Map(built.map(o => [o.gateId, o.id]));
      built.forEach(o => {
        if (o.requiresSolvedId && objIdByGateId.has(o.requiresSolvedId)) {
          o.requiresSolvedId = objIdByGateId.get(o.requiresSolvedId);
        }
      });

      studioObjects.length = 0;
      built.forEach(o => studioObjects.push(o));
      ensureContextualRoomLights();

      applyItemsAndDirectorFromRac(jsonData);
      currentRoomIdx = 0;

      // Update FLOOR_CONFIGS cleanly for 2D Floor CAD view (prevent asylum-404 corridor/title leak)
      Object.keys(FLOOR_CONFIGS).forEach(k => delete FLOOR_CONFIGS[k]);
      if (isAsylum) {
        Object.assign(FLOOR_CONFIGS, JSON.parse(JSON.stringify(DEFAULT_FLOOR_CONFIGS)));
      } else {
        const floorIds = [...new Set(ROOM_CONFIGS.map(r => r.floorId || '1f'))];
        floorIds.forEach(fid => {
          const fRooms = ROOM_CONFIGS.filter(r => (r.floorId || '1f') === fid);
          const maxEndX = fRooms.reduce((acc, r) => Math.max(acc, r.worldX + r.w), 12);
          const maxEndZ = fRooms.reduce((acc, r) => Math.max(acc, r.worldZ + r.h), 6);
          FLOOR_CONFIGS[fid] = {
            id: fid,
            name: `${fid.toUpperCase()} ${activeThemeTitle}`,
            height: fRooms[0]?.floorHeight || 0.0,
            rooms: fRooms.map(r => r.idx),
            corridorId: null,
            corridorName: '',
            totalW: maxEndX + 2,
            totalH: maxEndZ + 1,
            corridor: null
          };
        });
      }

      syncThemeHeaderUi();
      applyGenreAtmosphere(cameraMode);
      rebuild3DRoom();
      resetAllLightsForMode(studioMode === 'playtest');
      renderInventoryHud();
      switchRoom(0, true);
      syncSpaceEditorUI();
      renderAuthorItemsAndDirectorUI();
      if (studioObjects[0]) selectObject(studioObjects[0].id);
      updateCodeView();
      showDirectorWhisper(`《${activeThemeTitle}》 로드 완료! (${ROOM_CONFIGS.length}개 공간 · ${studioObjects.length}개 퍼즐 · ${activeThemeGenre})`);
    }

    async function switchThemePreset(themeId) {
      if (themeId === 'asylum-404') {
        restoreAsylumPreset();
        return;
      }
      const sampleMap = {
        'jamsil-quiz-room': './samples/jamsil-quiz-room.json',
        'crimescene-penthouse': './samples/crimescene-penthouse.json'
      };
      const url = sampleMap[themeId];
      if (!url) return;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        loadThemeFromSampleJson(data);
      } catch (err) {
        console.error('Failed to switch theme preset:', themeId, err);
        showDirectorWhisper(`테마 로드 실패 (${themeId}): ${err.message}`);
      }
    }

    function applyItemsAndDirectorFromRac(data) {
      const lg = data.logicGraph || {};
      if (Array.isArray(lg.items)) {
        const conts = Array.isArray(lg.containers) ? lg.containers : [];
        Object.keys(ITEM_CATALOG).forEach(k => delete ITEM_CATALOG[k]);
        lg.items.forEach(it => {
          if (!it || !it.id) return;
          let rewardQ = it.rewardOnQNum;
          if (!rewardQ) {
            const ownerCont = conts.find(c => c.containsItemId === it.id);
            if (ownerCont) {
              const ownerObj = studioObjects.find(o => o.unlocksId === ownerCont.id);
              if (ownerObj) rewardQ = ownerObj.qNum;
            }
          }
          ITEM_CATALOG[it.id] = {
            id: it.id,
            name: it.name || it.id,
            consumable: it.consumable !== false,
            ...(rewardQ ? { rewardOnQNum: rewardQ } : {})
          };
        });
      }
      if (Array.isArray(lg.interactions)) {
        ITEM_INTERACTIONS.length = 0;
        lg.interactions.forEach((ix, idx) => {
          if (!ix || !ix.itemId) return;
          const entry = {
            id: ix.id || `ix-imp-${idx + 1}`,
            itemId: ix.itemId,
            effect: ix.effect || 'unlock',
            message: ix.message || ''
          };
          if (ix.effect === 'combine') {
            entry.targetItemId = ix.targetItemId || ix.targetId;
            if (ix.resultId) entry.resultId = ix.resultId;
          } else {
            let tq = ix.targetQNum;
            if (!tq && ix.targetId) {
              const found = studioObjects.find(o => o.gateId === ix.targetId || o.id === ix.targetId || o.unlocksId === ix.targetId);
              if (found) tq = found.qNum;
            }
            if (tq) entry.targetQNum = tq;
          }
          ITEM_INTERACTIONS.push(entry);
        });
      }
      const persona = (data.director && data.director.persona) || data.directorPersona;
      if (persona && typeof persona === 'object') {
        directorPersona = {
          name: persona.name || DEFAULT_DIRECTOR_PERSONA.name,
          role: persona.role || DEFAULT_DIRECTOR_PERSONA.role,
          tone: persona.tone || DEFAULT_DIRECTOR_PERSONA.tone,
          barterPrompt: persona.barterPrompt || DEFAULT_DIRECTOR_PERSONA.barterPrompt
        };
      }
    }

    function importThemeFromJsonText() {
      const textarea = document.getElementById('import-json-textarea');
      if (!textarea || !textarea.value.trim()) return;

      try {
        const data = JSON.parse(textarea.value.trim());
        if (Array.isArray(data.objects) && data.objects.length > 0) {
          // Format A: Flattened { objects: [...] } (+ optional spaces/passages/items/interactions/director)
          applySpacesAndPassagesFromRac(data);
          studioObjects.length = 0;
          data.objects.forEach((raw, idx) => {
            studioObjects.push({
              qNum: raw.qNum || (idx + 1),
              id: raw.id || `prop-ai-${idx + 1}`,
              roomIdx: typeof raw.roomIdx === 'number' ? Math.min(raw.roomIdx, Math.max(0, ROOM_CONFIGS.length - 1)) : 0,
              type: raw.type || 'desk',
              name: raw.name || `기물 #${idx + 1}`,
              x: typeof raw.x === 'number' ? raw.x : (1.5 + (idx % 3) * 1.3),
              z: typeof raw.z === 'number' ? raw.z : (1.5 + Math.floor(idx / 3) * 1.2),
              w: raw.w || 1.0, d: raw.d || 0.7, color: raw.color || '#64748b', rotY: raw.rotY || 0,
              clueId: raw.clueId || `clue-ai-${idx + 1}`, carrierType: raw.carrierType || 'Text',
              cluePayload: raw.cluePayload || '', probId: raw.probId || `prob-ai-${idx + 1}`,
              probRule: raw.probRule || '', gateId: raw.gateId || `gate-ai-${idx + 1}`,
              interfaceType: raw.interfaceType || 'MechanicalLock',
              passcode: String(raw.passcode || '1234').toUpperCase(),
              unlocksId: raw.unlocksId || `cont-ai-${idx + 1}`,
              unlocksName: raw.unlocksName || '다음 단서 해금',
              isBossDoor: !!raw.isBossDoor, solved: !!raw.solved,
              requiresSolvedId: raw.requiresSolvedId || null,
              requiredItemId: raw.requiredItemId || null,
              storyBeat: raw.storyBeat || '',
              mechanism: raw.mechanism || null,
              visualSpec: raw.visualSpec || null,
              onUnlockEffects: Array.isArray(raw.onUnlockEffects) ? raw.onUnlockEffects : null,
              modelPreset: raw.modelPreset || null,
              modelUrl: raw.modelUrl || null,
              material: raw.material || null
            });
          });
          applyItemsAndDirectorFromRac(data);
          currentRoomIdx = studioObjects[0].roomIdx || 0;
        } else if (Array.isArray(data.spaces) && data.spaces.length > 0 && data.logicGraph) {
          // Format B: Official rac.schema.json format
          applySpacesAndPassagesFromRac(data);
          const lg = data.logicGraph;
          const clues = Array.isArray(lg.clues) ? lg.clues : [];
          const problems = Array.isArray(lg.problems) ? lg.problems : [];
          const gates = Array.isArray(lg.gates) ? lg.gates : [];
          const containers = Array.isArray(lg.containers) ? lg.containers : [];

          const clueById = new Map(clues.map(c => [c.id, c]));
          const probByClue = new Map();
          problems.forEach(pr => (pr.consumes || []).forEach(cid => probByClue.set(cid, pr)));
          const gateById = new Map(gates.map(g => [g.id, g]));
          const contById = new Map(containers.map(c => [c.id, c]));

          const built = [];
          let qCounter = 1;
          data.spaces.forEach((sp, rIdx) => {
            const props = Array.isArray(sp.props) ? sp.props : [];
            props.forEach(p => {
              if (!p.targetClueId && !p.qNum) return; // skip decorative extra props
              const cl = clueById.get(p.targetClueId) || clues.find(c => c.propRef === p.id);
              const pr = cl ? probByClue.get(cl.id) : null;
              const gt = (pr && gateById.get(pr.outputGate)) || gates[built.length];
              const cont = gt ? contById.get(gt.unlocks) : null;
              const pos = (p.transform && Array.isArray(p.transform.pos)) ? p.transform.pos : [1.5, 0.5, 1.5];
              const rot = (p.transform && Array.isArray(p.transform.rot)) ? p.transform.rot : [0, 0, 0];
              const isDoor = !!(gt && gt.unlocks && gt.unlocks.startsWith('door-'));
              built.push({
                qNum: (gt && gt.qNum) || p.qNum || qCounter++,
                id: p.id || `prop-rac-${built.length + 1}`,
                roomIdx: rIdx,
                type: p.type || p.model || 'desk',
                name: p.name || `기물 #${built.length + 1}`,
                x: typeof pos[0] === 'number' ? pos[0] : 1.5,
                z: typeof pos[2] === 'number' ? pos[2] : 1.5,
                w: 1.0, d: 0.7, color: '#64748b', rotY: rot[1] || 0,
                clueId: (cl && cl.id) || p.targetClueId || `clue-rac-${built.length + 1}`,
                carrierType: (cl && cl.carrierType) || 'Text',
                cluePayload: (cl && cl.payload) || '',
                probId: (pr && pr.id) || `prob-rac-${built.length + 1}`,
                probRule: (pr && pr.rule) || '',
                gateId: (gt && gt.id) || `gate-rac-${built.length + 1}`,
                interfaceType: (gt && gt.interfaceType) || 'MechanicalLock',
                passcode: parsePasscodeFromCondition(gt && (gt.passcode || gt.condition)),
                unlocksId: (gt && gt.unlocks) || `cont-rac-${built.length + 1}`,
                unlocksName: (cont && cont.name) || (isDoor ? '다음 구역 통로 개방' : '다음 단서 해금'),
                isBossDoor: isDoor,
                solved: !!(gt && gt.isOpen),
                requiresSolvedId: (gt && gt.requiresSolvedId) || null,
                requiredItemId: (gt && gt.requiredItemId) || null,
                storyBeat: (gt && gt.storyBeat) || '',
                mechanism: (gt && gt.mechanism) || null,
                visualSpec: (cl && cl.visualSpec) || null,
                onUnlockEffects: (gt && Array.isArray(gt.onUnlockEffects)) ? gt.onUnlockEffects : null,
                modelPreset: p.modelPreset || null,
                modelUrl: p.modelUrl || null,
                material: p.material || null
              });
            });
          });
          if (built.length > 0) {
            studioObjects.length = 0;
            built.forEach(o => studioObjects.push(o));
          }
          applyItemsAndDirectorFromRac(data);
          currentRoomIdx = 0;
        } else if (data.logicGraph && data.logicGraph.gates) {
          data.logicGraph.gates.forEach(g => {
            const obj = studioObjects.find(o => o.gateId === g.id);
            if (obj && (g.passcode || g.condition)) obj.passcode = parsePasscodeFromCondition(g.passcode || g.condition);
          });
        } else if (Array.isArray(data)) {
          data.forEach(item => {
            const obj = studioObjects.find(o => o.id === item.id);
            if (obj) {
              if (item.solved !== undefined) obj.solved = item.solved;
              if (item.code) obj.passcode = item.code;
            }
          });
        }
        document.getElementById('import-modal').classList.add('hidden');
        rebuild3DRoom();
        rebuild3DObjectsForCurrentRoom();
        renderRoomSidebarAndProgress();
        render2DCadObjects();
        syncSpaceEditorUI();
        renderAuthorItemsAndDirectorUI();
        renderInventoryHud();
        if (studioObjects[0]) selectObject(studioObjects[0].id);
        updateCodeView();
        showDirectorWhisper(`RaC JSON 컴파일 완료! (${ROOM_CONFIGS.length}개 공간 · ${studioObjects.length}개 퍼즐 반영)`);
      } catch (err) {
        alert("올바른 JSON 형식이 아닙니다: " + err.message);
      }
    }

    // -------------------------------------------------------------
    // LOCALSTORAGE AUTO-SAVE / RESTORE (rac_studio_autosave_v5)
    // -------------------------------------------------------------
    const STUDIO_AUTOSAVE_KEY = 'rac_studio_autosave_v5';
    let autosaveTimerId = null;

    function saveStudioAutosave() {
      if (!window.__studioBooted || studioMode !== 'author') return;
      try {
        const payload = {
          version: 2,
          rooms: ROOM_CONFIGS,
          objects: studioObjects,
          props: PROP_ONTOLOGY,
          passages: studioPassages,
          items: ITEM_CATALOG,
          interactions: ITEM_INTERACTIONS,
          directorPersona,
          currentRoomIdx
        };
        localStorage.setItem(STUDIO_AUTOSAVE_KEY, JSON.stringify(payload));
      } catch (_) {}
    }

    function scheduleStudioAutosave() {
      if (!window.__studioBooted || studioMode !== 'author') return;
      clearTimeout(autosaveTimerId);
      autosaveTimerId = setTimeout(saveStudioAutosave, 250);
    }

    function loadStudioAutosave() {
      try {
        const raw = localStorage.getItem(STUDIO_AUTOSAVE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved || !Array.isArray(saved.rooms) || saved.rooms.length === 0) return false;
        ROOM_CONFIGS.length = 0;
        saved.rooms.forEach((r, i) => ROOM_CONFIGS.push({ ...r, idx: i }));
        if (Array.isArray(saved.objects)) {
          studioObjects.length = 0;
          saved.objects.forEach(o => studioObjects.push(o));
        }
        if (Array.isArray(saved.props)) {
          PROP_ONTOLOGY.length = 0;
          saved.props.forEach(p => PROP_ONTOLOGY.push(p));
        }
        if (Array.isArray(saved.passages)) {
          studioPassages.length = 0;
          saved.passages.forEach(p => studioPassages.push(p));
        }
        if (saved.items && typeof saved.items === 'object') {
          Object.keys(ITEM_CATALOG).forEach(k => delete ITEM_CATALOG[k]);
          Object.assign(ITEM_CATALOG, saved.items);
        }
        if (Array.isArray(saved.interactions)) {
          ITEM_INTERACTIONS.length = 0;
          saved.interactions.forEach(ix => ITEM_INTERACTIONS.push(ix));
        }
        if (saved.directorPersona && typeof saved.directorPersona === 'object') {
          directorPersona = { ...DEFAULT_DIRECTOR_PERSONA, ...saved.directorPersona };
        }
        if (typeof saved.currentRoomIdx === 'number' && saved.currentRoomIdx >= 0 && saved.currentRoomIdx < ROOM_CONFIGS.length) {
          currentRoomIdx = saved.currentRoomIdx;
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function clearStudioAutosave() {
      try { localStorage.removeItem(STUDIO_AUTOSAVE_KEY); } catch (_) {}
      restoreAsylumPreset();
      showDirectorWhisper('로컬 자동저장을 초기화하고 기본 404호 프리셋을 복원했습니다.');
    }

    function downloadThemeJsonFile() {
      const snap = buildRacJsonSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'horror-6rooms-30puzzles-rac.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function restoreThemeFromUrlHash() {
      if (!window.location.hash || !window.location.hash.startsWith('#theme=')) return;
      try {
        const b64 = window.location.hash.replace('#theme=', '');
        const jsonStr = decodeURIComponent(atob(b64));
        const data = JSON.parse(jsonStr);
        if (Array.isArray(data)) {
          data.forEach(item => {
            const obj = studioObjects.find(o => o.id === item.id);
            if (obj) {
              if (item.solved !== undefined) obj.solved = item.solved;
              if (item.code) obj.passcode = item.code;
            }
          });
          console.log("✅ Restored theme from URL Hash");
        }
      } catch (e) {
        console.warn("Failed to parse URL hash theme", e);
      }
    }

    function copyShareCode() {
      const snap = buildRacJsonSnapshot();
      navigator.clipboard.writeText(JSON.stringify(snap, null, 2)).then(() => {
        alert("🎉 《폐쇄병동 404호: 심연의 해부학》 6방 30문제 Room as Code JSON이 클립보드에 복사되었습니다!");
      });
    }

    // Expose inline HTML event handlers cleanly on window for ES Module scope
    Object.assign(window, {
      addCustomItem, addItemInteraction, addNewPuzzleObject, addNewSpace,
      addPassageFromCurrentSpace, adjustClockDevice, advanceModalHint,
      applyInventoryItemToActiveModal, applyModalAuthorEdit, autoFillDial, checkLockSolution,
      clearDirKeys, clearStudioAutosave, closeLockModal,
      combineEligibleInventoryItems, copyAiAgentRacPrompt, copyEscapeCertificate,
      copyShareCode, deleteCurrentSpace, deleteCustomItem, deleteItemInteraction,
      deletePassage, deleteSelectedObject, dismissDirectorBanner,
      downloadThemeJsonFile, importThemeFromJsonText, moveUvFlashlight,
      onAuthorIxEffectChange, openDirectorIntercomBarter, openImportModal,
      openLockModalForObject, openPuzzleModalForSelected, pushDirKey,
      resetAll30Puzzles, restoreAsylumPreset, rotateCupDevice,
      runStudioIntegrityValidation, selectObject, selectObjectFromOntologyGraph, setCadViewMode,
      setCameraMode, setOntologyGraphFilter, setViewLayout, shareThemeUrl,
      solveAll30Puzzles, solveCurrentRoomAll, startBlankTheme, switchRoom,
      tapDirectorBarterButton, toggleLeftSidebar, toggleModalAuthorEdit, toggleOrbitAllFloors,
      toggleRightSidebar, toggleSpecimenWeight, toggleStudioMode,
      getStudioMode: () => studioMode,
      getActiveFixtures: () => activeFixtures,
      getMountedThreeLightCount: () => {
        let total = 0;
        let activePool = 0;
        if (scene) {
          scene.traverse(obj => {
            if (obj.isPointLight || obj.isSpotLight) {
              if (obj.userData && obj.userData.isLightPoolSlot) {
                if (obj.intensity > 0) activePool++;
                total++;
                return;
              }
              if (obj === flashlight && obj.intensity <= 0) return;
              total++;
            }
          });
        }
        return { total, activePool, fixtures: getMountedLightCount() };
      },
      checkWallCoplanarCollisions: (tol = 0.005) => {
        if (!unifiedBuildingGroup) return [];
        unifiedBuildingGroup.updateMatrixWorld(true);
        const walls = [];
        const tmpNorm = new THREE.Vector3();
        const tmpQuat = new THREE.Quaternion();
        const tmpBox = new THREE.Box3();
        const tmpCenter = new THREE.Vector3();
        unifiedBuildingGroup.traverse(obj => {
          if (!obj.isMesh || !obj.userData || !obj.userData.isWallSurface) return;
          obj.getWorldQuaternion(tmpQuat);
          tmpNorm.set(0, 0, 1).applyQuaternion(tmpQuat).normalize();
          // Canonicalize normal sign so opposite-facing coplanar walls are compared on the same plane
          if (tmpNorm.x < -0.5 || (Math.abs(tmpNorm.x) <= 0.5 && tmpNorm.z < -0.5)) tmpNorm.negate();
          tmpBox.setFromObject(obj);
          tmpBox.getCenter(tmpCenter);
          const d = tmpNorm.dot(tmpCenter);
          walls.push({
            parent: obj.parent ? obj.parent.name : '',
            normal: tmpNorm.clone(),
            d,
            box: tmpBox.clone()
          });
        });
        const collisions = [];
        const EPS = 0.01;
        for (let i = 0; i < walls.length; i++) {
          for (let j = i + 1; j < walls.length; j++) {
            const a = walls[i], b = walls[j];
            if (Math.abs(a.normal.dot(b.normal)) < 0.99) continue;
            if (Math.abs(a.d - b.d) > tol) continue;
            const overlapX = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
            const overlapY = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
            const overlapZ = Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z);
            const alongX = Math.abs(a.normal.z) > 0.5;
            const horizOverlap = alongX ? overlapX : overlapZ;
            if (horizOverlap > EPS && overlapY > EPS) {
              collisions.push({
                a: a.parent,
                b: b.parent,
                planeGap: Number(Math.abs(a.d - b.d).toFixed(5)),
                horizOverlap: Number(horizOverlap.toFixed(3)),
                vertOverlap: Number(overlapY.toFixed(3))
              });
            }
          }
        }
        return collisions;
      },
      getStudioObjects: () => studioObjects,
      rebuild3DRoom,
      get3DPerfStats: () => {
        const geos = new Set();
        const mats = new Set();
        let wallCount = 0;
        let allWallsDepthWriteFalse = true;
        let allWallsDepthWriteTrue = true;
        let allWallsFrontSide = true;
        let allWallsDoubleSide = true;
        const corridorSouthNormals = [];
        const lintelNormalChecks = [];
        let doorFramePenetrations = 0;
        if (scene) {
          scene.updateMatrixWorld(true);
          const tmpQ = new THREE.Quaternion();
          const tmpN = new THREE.Vector3();
          const tmpBox = new THREE.Box3();
          scene.traverse((obj) => {
            if (obj.geometry) geos.add(obj.geometry);
            if (obj.material) {
              const arr = Array.isArray(obj.material) ? obj.material : [obj.material];
              arr.forEach((m) => { if (m) mats.add(m); });
            }
            if (obj.isMesh && obj.userData && obj.userData.isWallSurface && obj.material) {
              wallCount++;
              if (obj.material.depthWrite !== false) allWallsDepthWriteFalse = false;
              if (obj.material.depthWrite !== true) allWallsDepthWriteTrue = false;
              if (obj.material.side !== THREE.FrontSide) allWallsFrontSide = false;
              if (obj.material.side !== THREE.DoubleSide) allWallsDoubleSide = false;
              obj.getWorldQuaternion(tmpQ);
              tmpN.set(0, 0, 1).applyQuaternion(tmpQ).normalize();
              if (obj.parent && (obj.parent.name === 'corridorGroup_1f' || obj.parent.name === 'corridorGroup_2f') && obj.position.z > 2.5) {
                corridorSouthNormals.push({ parent: obj.parent.name, nz: Number(tmpN.z.toFixed(3)) });
              }
              if (obj.userData.isLintel) {
                const w = obj.userData.wallSide;
                const expected = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[w];
                const dot = expected ? (tmpN.x * expected[0] + tmpN.z * expected[1]) : 0;
                lintelNormalChecks.push({ wall: w, inwardDot: Number(dot.toFixed(3)) });
              }
            }
            if (obj.isMesh && obj.userData && obj.userData.isDoorFrame && obj.parent && obj.parent.userData && obj.parent.userData.roomIdx !== undefined) {
              const rc = ROOM_CONFIGS[obj.parent.userData.roomIdx];
              const w = obj.userData.wallSide;
              if (rc && w) {
                const WALL_INSET = 0.02;
                const halfT = 0.018;
                const p = obj.position;
                if (w === 'N' && (p.z - halfT) < WALL_INSET) doorFramePenetrations++;
                if (w === 'S' && (p.z + halfT) > (rc.h - WALL_INSET)) doorFramePenetrations++;
                if (w === 'W' && (p.x - halfT) < WALL_INSET) doorFramePenetrations++;
                if (w === 'E' && (p.x + halfT) > (rc.w - WALL_INSET)) doorFramePenetrations++;
              }
            }
          });
        }
        const roomVisibility = ROOM_CONFIGS.map(rc => {
          const rg = unifiedBuildingGroup ? unifiedBuildingGroup.getObjectByName(`roomGroup_${rc.idx}`) : null;
          return { idx: rc.idx, id: rc.id, visible: rg ? rg.visible : null };
        });
        return {
          cameraMode,
          infoMemory: renderer ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } : null,
          infoPrograms: renderer && renderer.info && Array.isArray(renderer.info.programs) ? renderer.info.programs.length : 0,
          drawCalls: renderer && renderer.info && renderer.info.render ? renderer.info.render.calls : 0,
          shadowAutoUpdate: renderer ? renderer.shadowMap.autoUpdate : null,
          roomVisibility,
          logarithmicDepthBuffer: renderer ? !!renderer.capabilities.logarithmicDepthBuffer : false,
          pixelRatio: renderer ? renderer.getPixelRatio() : null,
          renderCalls: typeof window.__getRenderCallCount === 'function' ? window.__getRenderCallCount() : 0,
          activeSceneGeometries: geos.size,
          activeSceneMaterials: mats.size,
          wallCount,
          allWallsDepthWriteFalse,
          allWallsDepthWriteTrue,
          allWallsFrontSide,
          allWallsDoubleSide,
          corridorSouthNormals,
          lintelNormalChecks,
          doorFramePenetrations
        };
      },
      switchThemePreset,
      loadThemeFromSampleJson,
      getActiveThemeInfo: () => ({
        id: activeThemeId,
        title: activeThemeTitle,
        genre: activeThemeGenre,
        roomCount: ROOM_CONFIGS.length,
        puzzleCount: studioObjects.length,
        durationMinutes: Math.round(timeLimitSeconds / 60),
        hemiIntensity: hemiLight ? hemiLight.intensity : null,
        ambientIntensity: ambientLight ? ambientLight.intensity : null,
        environmentIntensity: scene ? scene.environmentIntensity : null,
        hasFog: !!(scene && scene.fog),
        flashlightIntensity: flashlight ? flashlight.intensity : null,
        inventory: Array.from(playerInventory)
      }),
      toggleCraftBuilderMode: () => craftBuilder?.toggle(), selectCraftSlot: (slot) => craftBuilder?.selectSlot(slot), openCraftCatalog: () => craftBuilder?.openCatalog(), closeCraftCatalog: () => craftBuilder?.closeCatalog(), deleteObjectById,
      triggerDirectorBlackout, triggerNextPuzzleOrRoom, turnDial, turnSteamValve,
      updateCurrentSpaceProps, updateDirectorPersonaProps, updateSelectedObjectProps
    });

    // Reliable ES Module Boot (works whether DOM/load already fired or not)
    function bootStudio() {
      if (window.__studioBooted) return;
      const restored = loadStudioAutosave();
      window.__studioBooted = true;
      initThree();
      restoreThemeFromUrlHash();
      switchRoom(restored ? currentRoomIdx : 0, true);
      resetAllLightsForMode(studioMode === 'playtest');
      syncSpaceEditorUI();
      renderAuthorItemsAndDirectorUI();
      autoAdjustSidebars();
    }
    if (document.readyState === 'complete') {
      bootStudio();
    } else {
      window.addEventListener('load', bootStudio, { once: true });
    }
  