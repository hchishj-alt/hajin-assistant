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
| 프롬프트 스튜디오 | modules/prompts.js, js/prompts.js |
| 어디서나 비서(비서 창), 메뉴 줄이기 | js/helper.js, modules/menu.js |
| 내 역할(바로가기·메뉴·프롬프트가 역할에 맞춰짐). 역할은 네 가지로 고정: PM·리더(pm), 아트·디자인(art), 콘텐츠 제작(make), 경영·운영(biz). 관리자가 멤버를 넣을 때 하나를 고름 | js/prompts.js `TEAM_ROLES`·`myRole`·`roleKeys`, js/helper.js `who`·`rolePicker`·`QUICK`·`CORE`·`BY_ROLE`, js/chat.js(쓰는 법), modules/admin.js(멤버 폼) |
| 비서가 말을 읽는 순서 | modules/assistant.js: 되묻던 것의 답(`answerAsk`, 딴 말인지는 `looksNew`) → 방금 만든 것 고치기(js/follow.js) → 메신저 전달(js/dm.js) → 회의록 붙여넣기(js/brain.js `minutes`) → 잡담(js/chat.js) → 고치기(js/act.js) → 읽기(js/brain.js) → 묻는 말 답(js/query.js, js/ask.js) |
| 한 말을 여러 건으로 나누기 | js/brain.js `interpret`: 때 말 다듬기(한글 금액 `korMoney`, 기념일·"다음 주 내내"·"평일") → `splitCommands`(줄, 그리고, 번호, 화살표) → `splitChain`("~하고 ~까지", "오전에 … 오후에 …") → `splitList`(쉼표로 늘어놓은 것, 금액 여러 개, "할 일: A, B") → `splitPeople`("대본은 민서가 쓰고 편집은 서연이") → 조각마다 `interpretOne` |
| 곳으로 읽는 낱말 | js/brain.js `PLACE_RE`(끝 글자)와 `NOTPLACE`(편집·번역처럼 끝 글자만 같은 낱말). 새로 잘못 읽는 낱말이 나오면 `NOTPLACE`에 더함 |
| 피그마 플러그인 | figma-plugin/ |
| 유료 프롬프트 스튜디오(팀 앱과 따로, /studio/) | studio/, supabase/studio.sql. 유료 틀 본문은 저장소에 넣지 않음(서버에만). 작업 지시서는 docs/studio-codex/README.md |
| 촬영용 대본 프롬프터(팀 앱과 따로, /prompter/, 카드 구독 구조) | prompter/, supabase/prompter.sql, supabase/functions/prompter-billing/. 작업 지시서는 docs/prompter-codex/README.md |

## 새 화면을 추가할 때
1. `modules/<id>.js`를 만든다.
2. `js/app.js`의 `MODULES`에 `{ id, title, icon, group }`을 넣는다.
3. `sw.js`의 캐시 목록에 파일을 넣는다.
4. `js/version.js`와 `sw.js`의 `VERSION`을 같은 값으로 올린다. 올리지 않으면 사용자 기기가 새 코드를 받지 않는다.

## 확인 방법
- `python3 -m http.server 8765` 후 `http://localhost:8765/`를 연다.
- 넓은 화면과 폰 폭(390px)에서 바꾼 화면을 열어 콘솔 오류와 가로 넘침이 없는지 본다. 누르는 곳은 44px 이상.
- 앱의 "자가 점검" 화면이 모두 통과해야 한다.
- `node tests/run.mjs`(규칙 시험)와 `node tests/order.cjs`(화면 코드 순서 점검)를 돌린다. 말 읽기를 고쳤으면 `js/selftest.js`에 시험을 하나 더 넣는다.
- 말을 여러 건으로 나누는 규칙을 고쳤으면 나누면 안 되는 말도 같이 시험한다. 예: "민서랑 미팅 준비", "내일 3시 미팅하고 회식", 수량이 있는 가격표, "할 일: 포스터 수정, 금요일까지".
- 말 읽기는 규칙 시험만으로는 부족하다. 잡담·고치기 쪽이 먼저 받아 가는 말이 있으므로 실제 비서 화면에 넣어서도 본다.
- 로그인한 상태만 보지 말고, 이름·명단·역할이 없는 맨 기기 상태로도 연다. 역할은 로그인한 멤버면 서버 값, 아니면 이 기기에서 고른 값(kv `me:role`)이다.
- 화면 시험 스크립트(Playwright)는 저장소 밖에 따로 둔다. 저장소에는 설치할 것을 넣지 않는다.

## 배포
- `main`에 올리면 GitHub Pages가 그대로 배포한다. 별도 빌드가 없다.
- 서버(Supabase) 변경은 `supabase/setup.sql`에 추가하고, 사람이 SQL Editor에서 실행해야 한다고 결과에 적는다.

## 멤버 색·사진·이름 (v1.36.0)

- 색과 사진은 멤버가 설정의 "내 프로필"에서 직접 정함. 서버 `members.color`·`members.avatar`(128px로 줄인 data URL, 4만 자 이하), 바꾸는 길은 `set_my_profile` 하나(내 줄만). 명단(`list_members`)에 같이 내려오고 `ui.setFaces`가 이름표에 씀. 새 이름표를 만들 때는 `colorFor(이름)`과 `facePic(이름, 이름표)`를 쓸 것.
- 이름과 역할은 관리자만(관리자 화면의 멤버). 멤버가 `space_members.name`을 고치던 권한은 없앰. 기기는 명단이 바뀌면 `me:member`와 부를 이름을 따라 바꿈.
- 로그인하지 않은 기기는 `me:face`(이 기기에만)로 같은 화면을 씀.
- 메신저 알림(서버 14번): `dms`에 글이 들어오면 받는 사람 `alarms`에 `dm|…` 줄을 넣어 닫힌 앱에도 푸시가 감.
