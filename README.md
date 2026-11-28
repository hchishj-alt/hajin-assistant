# 소머스튜디오 (구 하진 비서)

Somer Studio 팀의 업무 웹앱 (PWA). 안의 비서 이름은 소머AI. 외부 AI 없이 기기 안에서 돌아가는 자체 두뇌로 일정·할 일·회의·기획·인맥·비용·SNS·피그마를 한곳에서 관리해요.

## 구조
- `index.html`, `css/`, `js/`, `modules/` — 빌드 없는 정적 앱 (GitHub Pages에 그대로 올리면 동작)
- `js/brain.js` — 기본 두뇌 (한국어 날짜·금액·할 일·결정 인식, 요약, 키워드, 분류, 학습)
- `js/ext.js` — 확장 두뇌 (기기 내 Whisper 음성인식, 소형 언어모델; 선택 다운로드)
- `js/store.js` — 확인 대기함 흐름: 비서가 만든 건 전부 임시 → 하진이 확정해야 저장
- `js/selftest.js` + `tests/run.mjs` — 자가 점검 시나리오 (`node tests/run.mjs`)
- `tests/order.cjs` — 화면 코드에서 값을 만들기 전에 쓰는 순서 문제 찾기 (`node tests/order.cjs`, 푸시 전에 같이 돌림)
- `figma-plugin/` — 피그마 정리 자체 플러그인 (manifest.json으로 가져오기)
- `sw.js` — 오프라인 실행·자동 업데이트

## 업데이트하는 법
1. 코드 수정
2. `js/version.js`와 `sw.js`의 VERSION을 같이 올리기
3. `node tests/run.mjs`로 점검 → 푸시
앱은 다음에 열 때 새 버전을 받아 "업데이트" 알림을 띄워요. 기록은 기기에 그대로 남아요.
