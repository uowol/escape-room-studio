# escape-room-studio (Room as Code Studio)

Room as Code (RaC) v2 기반 웹 방탈출 크리에이터 스튜디오 및 《폐쇄병동 404호: 심연의 해부학》 2층(1F·2F) 6방 × 30문제 풀 스케일 인터랙티브 플레이어.

## 실행 방법

```bash
python -m http.server 8088
# http://localhost:8088/index.html 접속
```

## 하네스 테스트 실행 (7대 불변식 스위트)

```bash
python harness/test_contract.py
node harness/test_engine.js
node harness/test_horror_6rooms.js
node harness/test_integration.js
node harness/test_iteration2_3.js
node harness/test_ontology_v2.js
node harness/test_validator.js
```
