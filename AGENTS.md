# 하진 비서: 코딩 AI가 이 저장소를 고칠 때 읽는 안내서

팀을 위한 관리 앱(PWA)이다. 개인 일정 관리는 보조 기능이다. 웹, 폰, 아이패드에서 같은 코드로 돈다.
서버 비용 0원, 외부 AI 없이 규칙 기반 두뇌(js/brain.js)로 움직인다. 이 전제를 깨는 변경은 하지 않는다.

## 절대 규칙
- 빌드 도구, 프레임워크, npm 의존성을 추가하지 않는다. 순수 ES 모듈 + 정적 파일이다.
- 비밀 값(Supabase secret/service_role 키, DB 비밀번호, 멤버 코드, 피그마 토큰)을 코드, 커밋, 이슈에 넣지 않는다. `js/config.js`에는 Project URL과 publishable 키만 둔다.
- 유료 API나 상시 서버가 필요한 기능을 넣지 않는다. 필요해 보이면 구현하지 말고 대안을 제안한다.
- 화면 글은 쉬운 한국어로 쓴다. 사용자에게 플래그나 설정 입력을 요구하지 말고, 가능한 한 자동으로 판단하고(js/auto.js) 고친 것을 학습한다.
- AI가 만든 결과는 바로 저장하지 않고 "확인 대기함"의 임시 항목(store.draft)으로 넣는다.

## 구조
- `index.html` → `js/app.js`(해시 라우터, MODULES 목록, 내비게이션) → `modules/<id>.js`를 필요할 때 불러온다.
- 모듈 모양: `export default { async render(root, params) { ...; return cleanupFn; } }`.
- 화면은 `js/ui.js`의 `h('tag.class', attrs, ...kids)`, `modal`, `form`, `seg`, `toast`, `head`, `ic(아이콘)`으로 만든다. 아이콘은 `js/icons.js`.
- 데이터는 IndexedDB(`js/db.js`): `db.put(col, item)`, `db.patch(id, 값)`, `db.list(col)`, `db.remove(id)`, `db.kvGet/kvSet`, `db.putBlob/getBlob`. 모든 항목은 `{id, col, createdAt, updatedAt, deleted}`를 가진다.
- 동기화는 `js/sync.js`(Supabase). 개인 항목은 `items`, 팀 공유 항목은 `space_items`. 공유 대상 컬렉션은 `SHARE_COLS`. 충돌은 `updatedAt`이 늦은 쪽이 이긴다. 서버 구조는 `supabase/setup.sql`(다시 실행해도 안전하게 작성).
- 권한과 수정 기록은 `js/admin.js`의 guard가 `db.put`에서 처리한다. 새 컬렉션을 누구나 고칠 수 있게 하려면 `FREE`에 넣는다.
- 꾸미기는 CSS 변수로 한다: `--fs`(글씨 배율), `--rd`(둥글기), `--bw`(테두리), `--acc`, `--card`, `--bg`, `--ink`, `--line`. 새 CSS도 `calc(14px*var(--fs,1))`처럼 변수를 곱해 쓴다.

## 파일 지도
| 화면 | 파일 |
|---|---|
| 오늘(메인) | modules/today.js |
| 비서 채팅 | modules/assistant.js, js/brain.js, js/query.js |
| 확인 대기함 | modules/inbox.js, js/draftcard.js, js/store.js |
| 캘린더, 구글 연동 | modules/calendar.js, js/gcal.js |
| 회의록, 마인드맵 회의 | modules/meetings.js, modules/board.js |
| SNS 스튜디오 | modules/studio.js(영상), modules/feed.js(피드·게시글), js/video.js |
| 레퍼런스 | modules/archive.js, js/linkpreview.js |
| 메신저 | modules/talk.js, js/dm.js |
| 구매 목록 | modules/shop.js, js/product.js, js/xlsx.js |
| 꾸미기 | modules/look.js, js/look.js, js/theme.js |
| 관리자 | modules/admin.js, js/admin.js |
| 자동 분류, 피드백 학습 | js/auto.js, js/feedback.js |
| 앱 개선 요청 | modules/dev.js, js/codex.js |
| 피그마 플러그인 | figma-plugin/ |

## 새 화면을 추가할 때
1. `modules/<id>.js`를 만든다.
2. `js/app.js`의 `MODULES`에 `{ id, title, icon, group }`을 넣는다.
3. `sw.js`의 캐시 목록에 파일을 넣는다.
4. `js/version.js`와 `sw.js`의 `VERSION`을 같은 값으로 올린다. 올리지 않으면 사용자 기기가 새 코드를 받지 않는다.

## 확인 방법
- `python3 -m http.server 8765` 후 `http://localhost:8765/`를 연다.
- 넓은 화면과 폰 폭(390px)에서 바꾼 화면을 열어 콘솔 오류와 가로 넘침이 없는지 본다. 누르는 곳은 44px 이상.
- 앱의 "자가 점검" 화면이 모두 통과해야 한다.
- `tests/`에 있는 점검 스크립트가 있으면 함께 돌린다.

## 배포
- `main`에 올리면 GitHub Pages가 그대로 배포한다. 별도 빌드가 없다.
- 서버(Supabase) 변경은 `supabase/setup.sql`에 추가하고, 사람이 SQL Editor에서 실행해야 한다고 결과에 적는다.
