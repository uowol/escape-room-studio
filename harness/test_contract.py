"""
Room as Code (RaC) v1.0 - Contract & Invariant Validation Harness
1단계 데이터 계약 및 닫힌 세계 불변식 자동 검증 하네스
"""
import json
import os
import sys

def run_contract_harness():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schema_path = os.path.join(base_dir, "schema", "rac.schema.json")
    sample_path = os.path.join(base_dir, "samples", "minimal-room.json")

    print("🔍 [RaC Harness] 1단계: 스키마 및 불변식 계약 검증 시작...")

    # 1. 파일 존재성 확인
    assert os.path.exists(schema_path), f"스키마 파일 부재: {schema_path}"
    assert os.path.exists(sample_path), f"샘플 파일 부재: {sample_path}"
    print("  ✅ 스키마 및 샘플 파일 로드 성공")

    # 2. JSON 파싱 검증
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
    with open(sample_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 3. 필수 루트 키 검증
    for key in schema.get("required", []):
        assert key in data, f"루트 필수 키 누락: {key}"
    print(f"  ✅ 루트 필수 키 검증 완료 ({schema['required']})")

    # 4. 도메인 불변식 (Axiom Assertions)
    # 4-1. 공간(Space) 폴리곤 검증
    for space in data["spaces"]:
        poly = space["polygon"]
        assert len(poly) >= 3, f"공간 {space['id']}의 폴리곤 꼭짓점이 3개 미만임: {len(poly)}"
        assert space["wallHeight"] >= 2.0, f"벽 높이가 2m 미만임: {space['wallHeight']}"
    print(f"  ✅ 공간 기하학 불변식 검증 완료 (Spaces: {len(data['spaces'])}개)")

    # 4-2. 단서-문제-게이트 연결성 (No Orphan Rules)
    clue_ids = {c["id"] for c in data["logicGraph"]["clues"]}
    gate_ids = {g["id"] for g in data["logicGraph"]["gates"]}
    door_ids = {p["door"]["id"] for p in data["passages"]}

    for prob in data["logicGraph"]["problems"]:
        for consumed_clue in prob["consumes"]:
            assert consumed_clue in clue_ids, f"문제 {prob['id']}가 존재하지 않는 단서 참조: {consumed_clue}"
        assert prob["outputGate"] in gate_ids, f"문제 {prob['id']}가 존재하지 않는 게이트 참조: {prob['outputGate']}"
    print(f"  ✅ 단서-문제 연결 무결성 검증 완료 (Problems: {len(data['logicGraph']['problems'])}개)")

    # 4-3. 게이트-문/은닉함 해금 결속 검증
    container_ids = {c["id"] for c in data["logicGraph"].get("containers", [])}
    valid_targets = door_ids | container_ids
    for gate in data["logicGraph"]["gates"]:
        target_id = gate["unlocks"]
        assert target_id in valid_targets, f"게이트 {gate['id']}가 존재하지 않는 타겟 해금 참조: {target_id}"
    print(f"  ✅ 게이트-문/은닉함 해금 결속 검증 완료 (Gates: {len(data['logicGraph']['gates'])}개)")

    # 5. 풀 스케일 6방 30문제 공포 테마 계약 검증
    full_path = os.path.join(base_dir, "samples", "horror-6rooms-30puzzles.json")
    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            full_data = json.load(f)
        assert len(full_data["spaces"]) == 6, "6방 테마의 공간 수가 6개가 아님"
        assert len(full_data["logicGraph"]["problems"]) == 30, "6방 테마의 문제 수가 30개가 아님"
        f_clues = {c["id"] for c in full_data["logicGraph"]["clues"]}
        f_gates = {g["id"] for g in full_data["logicGraph"]["gates"]}
        f_doors = {p["door"]["id"] for p in full_data["passages"]}
        f_conts = {c["id"] for c in full_data["logicGraph"].get("containers", [])}
        for p in full_data["logicGraph"]["problems"]:
            for cc in p["consumes"]:
                assert cc in f_clues, f"6방 테마 문제 {p['id']} 고아 단서 참조: {cc}"
            assert p["outputGate"] in f_gates, f"6방 테마 문제 {p['id']} 고아 게이트 참조: {p['outputGate']}"
        for g in full_data["logicGraph"]["gates"]:
            assert g["unlocks"] in (f_doors | f_conts), f"6방 테마 게이트 {g['id']} 고아 타겟 참조: {g['unlocks']}"
        
        # 4-4. 소품(Prop) - 단서(Clue) 결속 및 기믹 온톨로지 무결성 검증
        all_props = {}
        for sp in full_data["spaces"]:
            for pr in sp.get("props", []):
                all_props[pr["id"]] = pr
                assert "transform" in pr and "pos" in pr["transform"], f"소품 {pr['id']} transform 누락"
                if "gimmick" in pr:
                    assert "kind" in pr["gimmick"] and "description" in pr["gimmick"], f"소품 {pr['id']} gimmick 스키마 불완전"
        for c in full_data["logicGraph"]["clues"]:
            prop_ref = c.get("propRef")
            assert prop_ref in all_props, f"단서 {c['id']}가 존재하지 않는 소품 참조: {prop_ref}"
        print(f"  ✅ 소품-단서 결속 및 기믹 온톨로지 무결성 검증 완료 (Props: {len(all_props)}개, Clues: {len(f_clues)}개)")
        print("  ✅ 6방 30문제 공포 테마(horror-6rooms-30puzzles.json) 데이터 계약 및 무결성 검증 완료")

    print("\n🎉 [RaC Harness PASS] 1단계 데이터 계약 및 닫힌 세계 불변식 100% 통과 (결함 0개)")

if __name__ == "__main__":
    try:
        run_contract_harness()
    except AssertionError as e:
        print(f"\n❌ [RaC Harness FAIL] 계약 위반 발생: {e}")
        sys.exit(1)
