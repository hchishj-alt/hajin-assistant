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

## 날짜

- 저장된 시각(`createdAt`·`updatedAt`·`doneAt`)은 UTC 글자다. 날짜로 쓸 때는 `.slice(0, 10)`이나 `toISOString().slice(0, 10)`을 쓰지 말고 `db.dayOf(시각)`을 쓴다. 자르면 한국 시간 자정~아침 9시에 하루가 어긋난다.

## 영상 편집실 (v1.38.0)
- 영상 만들기는 화면을 실제 속도로 찍는 방식(`js/video.js` `createPlayer`). 클립 시간은 벽시계가 아니라 영상이 실제로 간 만큼(`el.currentTime`)으로 세요. 벽시계로 세면 폰이 버벅일 때 끝이 잘려요.
- 영상·음악 요소는 소리 길에 한 번만 꽂을 수 있어요. 꼭 `srcOf(el)`을 거치세요 (직접 `createMediaElementSource`를 부르면 두 번째 재생부터 소리가 빠져요).
- 같은 파일에서 나눈 클립은 영상 요소 하나를 같이 써요(`loadClip`의 `cache`). 그 요소를 옮기는 일(작은 그림, 나누기, 자동 컷, 썸네일)은 `inTurn`으로 차례를 지키고, 미리보기가 돌고 있으면 먼저 `stopPreview()`.
- 이 기기에서 못 여는 파일(아이폰 고효율 영상, HEIC)은 넣을 때 알려 주고 빼요. 다른 기기에서 넣은 클립은 `ghosts`에 두었다가 저장할 때 제자리에 다시 끼워요. 지우지 마세요.
- 만드는 형식은 `recType()`이 골라요: 크롬은 H.264 mp4를 먼저(그냥 `video/mp4`는 속이 VP9이라 맨 뒤), 애플 엔진은 그냥 `video/mp4`도 괜찮음. 어디서나 열리는지는 `plays(type)`.
- 실제 영상으로 하는 시험: `/mnt/project-files/hajin-assistant-dev/video/` (`vid1.js`, `vid2.js`, 영상은 ffmpeg로 만들어 씀). 시험 크롬은 HEVC를 못 열고 mp4 소리가 Opus로 나와요. 실제 아이폰 사파리에서의 내보내기는 기기로만 확인할 수 있어요.

## 단기 작업자와 새 파트 (v1.39.0)
- 멤버 종류는 둘: 정식(`member`)과 단기 작업자(`guest`). 서버 `members.kind`·`until`(마지막 날, 한국 날짜)·`projects`(맡긴 프로젝트 이름). 관리자 화면 › 멤버에서 넣고 고침.
- 기간이 지나면 서버의 `is_active()`가 거짓이 되어 읽기·쓰기가 모두 막혀요. 새 정책이나 함수를 만들 때 `active`만 보지 말고 `public.member_live(active, until)`이나 `is_active()`를 쓰세요.
- 단기 작업자는 맡은 프로젝트의 할 일·일정·회의록·메모·문서·레퍼런스만 팀과 나눠요(서버 `guest_sees`, 앱 `sync.guestCanShare`). 비용·업체·연락처·팀 공용 AI 키는 내려가지 않아요. 새 공유 종류를 만들면 단기 작업자에게 보일지 두 곳에서 같이 정하세요.
- 단기 작업자에게 보이는 화면은 `app.js`의 `GUEST_OK`. 화면을 새로 만들면 여기에 넣을지 정하세요. 메뉴·검색·주소 이동이 모두 `canOpen`을 거쳐요.
- 파트(역할)는 기본 네 가지(`prompts.TEAM_ROLES`) + 관리자가 만든 것(`team-main.parts`, 팀이 없는 기기는 `team:parts`). 새 파트는 기본 네 가지 중 닮은 쪽(`keys`)을 따라 화면이 맞춰져요. 역할 목록이 필요하면 `TEAM_ROLES` 말고 `teamRoles()`를 쓰세요.
- 서버 트리거에서 `by` 칸은 꼭 `"by"`로 쓰세요. 이 언어의 예약어라 따옴표 없이 쓰면 고칠 때마다 오류가 나요 (v1.39.0 전까지 팀 기록 고치기가 서버에서 전부 막혀 있었음).
- 서버 설치문은 로컬 Postgres에서 먼저 돌려 볼 수 있어요: `/mnt/project-files/hajin-assistant-dev/server-test/` (Supabase 흉내 틀 `stub.sql`, 사람 넷으로 권한을 보는 `t2.sql`).

## 프로젝트 이름·시간 표시·화면 크기 (v1.40.0)
- 프로젝트 이름을 바꿀 때는 꼭 `store.renameProject(id, 새이름)`을 쓰세요. 그 이름으로 묶어 둔 할 일·일정·문서·임시 항목과 단기 작업자에게 맡긴 프로젝트 이름(`sync.renameGuestProject`, 관리자 기기에서만)이 같이 따라가요. `db.put('projects', …)`으로 이름만 바꾸면 묶인 것이 프로젝트에서 빠져 보여요.
- 말로 프로젝트 지우기·이름 바꾸기·상태 바꾸기는 `act.tryProject`. 지우기는 항상 한 번 물어봐요. 만들기는 `tryAct`에 있어요.
- 저장된 시각(`createdAt` 등)에서 시:분을 보여 줄 때는 `db.clockOf(시각)`(ui에서는 `clock`), 목록에서는 `whenShort`. `.slice(11, 16)`은 UTC라 한국에서 9시간 어긋나요 (`tests/order.cjs`가 잡음).
- 폰을 눕힌 화면(높이 500 이하)은 탭 줄을 한 줄로 낮춰요. 떠 있는 것(`#toast`, `.rdw`, `#jobq`, `.cartbar`)의 바닥 높이도 그 미디어 쿼리에 같이 있으니, 떠 있는 것을 새로 만들면 거기에도 넣으세요. 가로 화면의 노치 옆 여백은 `#view`·`#tabbar`의 `env(safe-area-inset-left/right)`.
- 눕힌 폰의 영상 편집실은 두 칸(`.editor-main`: 왼쪽 영상은 붙어 있고 오른쪽에서 편집). 콘셉트 창도 `.editor-grid`를 쓰니 편집실만 바꿀 때는 `.editor-main`으로 고르세요.
- 창(모달)의 제목 줄·단추 줄은 창 안쪽 여백까지 덮어요(`.modal:not(.ai-modal)>.modal-h`, `.modal-f`). 창 여백을 바꾸면 이 값(22px, `--mpb`)도 같이 바꾸세요. 스위치(`.switch`)는 보이는 크기 28px, 누르는 자리는 `::before`로 44px.
- 모든 화면을 여러 크기로 열어 보는 점검: `/mnt/project-files/hajin-assistant-dev/flows/sweep.js` (오류·옆 넘침·화면 밖·탭 줄에 가림), 뜨는 창은 `modals.js`·`mcheck.js`, 편집실 가로 화면은 `video/vshot.js`.

## 처음 켠 사람·폰 캘린더 (v1.41.0)
- 처음 켠 기기의 오늘 화면 카드(`.first-card`)에서 멤버 코드로 바로 들어가요(서버 설정이 있을 때). 들어가면 메뉴·역할·맡은 프로젝트를 처음부터 다시 맞추려고 화면을 새로 열어요(`location.reload()`). 역할 고르기 줄은 이름이나 코드를 넣은 뒤에 나와요.
- 화면 머리 단추에 `.fold`(900px 이하에서 "더보기"로 접힘), `.fold-phone`(560px 이하에서만 접힘). `.fold-phone`만 있는 줄에는 "더보기" 단추가 안 생기니 `.fold`가 하나는 있어야 해요.
- 폰 캘린더는 제목과 단추가 한 줄(`.cal-head`), 월·주·목록 옆에 보기 설정(`.cal-top`). 보기 설정 단추의 온전한 글은 `aria-label`에 있어요.
- 일정 줄의 시간 칸은 `.ev-time`(넓은 화면 92px 한 줄, 폰은 두 줄로 쌓음).
- 주소 뒤에 붙는 말(`params`)은 못 읽는 값이 올 수 있어요. 날짜로 바꿀 때는 꼭 `isNaN`을 확인하세요(캘린더가 "NaN월"로 굳던 적 있음). 점검: `flows/sweep.js 주소 크기 화면/zzz,…` (화면에 NaN·undefined가 나오면 잡음), 기록이 많을 때는 `flows/stress.js`, 단추를 다 눌러 보는 것은 `flows/crawl.js 역할 화면들`.

## 기기 사이 맞추기 (v1.42.0)
- 받아 오기(`sync.pullTable`)는 지난번 자리보다 5초 앞에서부터 겹쳐 읽어요(동시에 올린 줄을 놓치지 않게). 같은 줄은 `apply`가 건너뛰니 화면이 다시 그려지지 않아요.
- 볼 수 있는 범위가 바뀌는 사람(단기 작업자)은 서버가 "이제 안 보여요"를 알려 주지 않아요. 그래서 맡은 프로젝트·종류가 바뀌면(`fullNext`), 앱으로 돌아올 때, 10분마다 통째로 다시 받아서 서버에 안 보이는 남의 팀 기록을 그 기기에서 치워요(`dropUnseen`). 내가 쓴 것(`by`가 내 이름·예전 이름), 못 올린 것, 서버가 거절한 것(`syncDenied`)은 지우지 않아요.
- 서버가 거절한 줄(`syncDenied`)은 코드가 다시 살아나거나 맡은 범위가 바뀌면 다시 올려 봐요(`retryDenied`).
- 멤버 이름은 관리자만 고치고, 고칠 때는 `store.renameMember(예전, 새)`로 담당(`who`)·올린 사람(`by`)·참석자도 같이 옮겨요. 본인 기기는 예전 이름을 `me:was`에 적어 두고 자기가 올린 것으로 알아봐요(`admin.who().was`).
- 단기 작업자가 적은 개인 일(`scope: 'personal'`)이나 "나만 보기"는 맡은 프로젝트에 붙이지 않아요.
- 보낸 메시지는 서버 시각을 받기 전까지 기기 시각으로 적어 둬요(`dmSend`).
- 두 기기 시험: `/mnt/project-files/hajin-assistant-dev/flows/flow35.js`(가짜 서버 `fakesb.js`: 서버 규칙을 흉내 내고 관리자·멤버·단기 작업자 기기를 같이 띄움). 서버 규칙(setup.sql)을 바꾸면 `fakesb.js`도 같이 고치세요.

## 글자 크기 (v1.43.0)
- 글자 크기는 이 단계만 써요: 11 · 12 · 13 · 14 · 15(본문) · 16 · 18 · 20 · 22 · 24 · 26 (첫 화면 큰 숫자만 40). 반 단계(12.5 같은 것)와 11 미만은 쓰지 않아요. 쓰는 법은 `font-size:calc(13px*var(--fs,1))` (꾸미기의 글자 크기 설정이 먹게).
- 쓰임: 11 = 아주 작은 표시(탭 이름, 달력 칸, 시각) / 12 = `.tiny`, 칩 / 13 = `.small`, 설명 / 14 = 단추, 작은 제목 / 15 = 본문, `h3` / 18 = `h2` / 26 = `h1`.
- px로 굳힌 것은 크기가 정해진 그림 안의 글자뿐이에요(프사 안 글자, SNS 미리보기 `.fd-*`, 마인드맵 `.mm-*`).

## 로그인 확인 순서 (v1.43.1)
- 첫 화면을 그리기 전에 `sync.ready(1200)`으로 로그인 여부를 알아 둬요. 화면 코드에서 로그인 여부가 필요하면 `await sync.me()`(알게 될 때까지 기다림)를 쓰고, 바로 답하는 `sync.user()`·`enabled()`는 그 뒤에만 믿으세요. 전에는 앱을 메신저·멤버 화면에서 바로 열면 로그인 안 한 것처럼 그려졌어요.
- 로그인한 기기 점검: `flows/crawl2.js 코드 [크기]`(가짜 서버에 로그인해 단추를 다 눌러 보고, 서버가 거절하는 쓰기가 생기는지도 봄), `flows/gshots.js 코드 크기 화면들`(화면 찍기), 처음 뜨는 시간은 `flows/boot.js`.

## 동기화가 안 될 때 (v1.44.0)
- 전에는 동기화가 계속 실패해도 설정에 들어가야만 알 수 있었어요. 이제 `sync.trouble()`이 "알릴 만한 문제"를 돌려주면 한 번 알리고(`app.js`의 `onState`), 오늘 화면 위에 한 줄(`helper.syncStrip`, `.sync-strip`)이 생겨요. 풀리면 사라져요.
- 알릴 만한 문제: 인터넷이 잠깐 끊긴 것은 두 번 이어 실패할 때(`state.fails`), 서버가 거절하거나 로그인이 풀린 것은 바로. 폰이 오프라인인 것(`status: 'offline'`)은 문제로 치지 않아요.
- 로그인 표가 낡아서(JWT expired) 거절되면 한 번 새로 받아 다시 해 봐요.
- 시험: `flows/flow36.js` (비행기 모드, 서버에 안 닿음, 로그인 표가 낡음).
- (v1.44.1) 그림만 있는 단추에는 `aria-label`(과 `title`)을, 라벨 없는 입력 칸·고르기 칸에는 `aria-label`을 꼭 달아요. 점검: `flows/names.js`. 제목을 적는 큰 입력 칸은 `.in-title`(20px), `.in-title.lg`(22px): 폰에서 입력 칸 글자를 16px로 맞추는 규칙보다 앞서요.

## 단기 작업자 한 바퀴·긴 글 (v1.45.0)
- 단기 작업자가 코드가 멈춘 동안(팀 기록이 치워진 상태) 맡은 프로젝트에 적은 업무는 `shareLater`로 표시해 두고, 다시 살아나면 팀에 올려요(`sync.retryDenied`).
- 줄 안의 색 칩(`.li .chip.acc`)은 줄바꿈이 없어서, 길어질 수 있는 글(프로젝트 이름)은 `.chip.cut`(말줄임표)과 `title`을 같이 쓰세요.
- 멤버 줄의 코드·복사·고치기는 `.mem-ctl` 한 덩어리.
- 시험: `flows/flow37.js`(단기 작업자를 화면에서 넣기 → 로그인 → 기간 끝 → 2주 더 → 정지), `flows/stress2.js`(팀 기록 2,100개·긴 글을 받은 멤버 기기, 폰·아이패드·PC).

## 메신저 제목·새 파트·담당 이름 (v1.46.0)
- 메신저로 받은 물음에서 일정 제목을 뽑을 때는 `brain.askTitle(text)`. "~ 가능해?", "~ 갈 수 있어?", "~ 잡아도 될까?" 같은 말끝을 떼요(없으면 "○○ 님과 약속"). 자가 점검 "메신저"에 예문이 있어요.
- 메신저는 폰(900px 이하)에서 목록 주소(`#/talk`)로 오면 목록을 보여요. 보던 대화를 기억하는 것은 넓은 화면에서만. 없는 사람 주소로 와도 목록이 보여야 해요.
- 파트 이름을 바꾸면 그 파트인 멤버의 역할 글도 같이 바꾸고(`sync.saveMember`), 파트에 예전 이름을 `was`로 남겨요. `roleKeys`가 `was`도 봐서, 역할 글이 아직 예전 이름인 기기도 화면 구성이 안 깨져요. 파트를 지우면 그 멤버 줄에 "역할 다시 고르기"가 떠요.
- 담당자별로 묶는 화면은 `store.nameCanon()`으로 이름을 맞춰요("민서"·"민서님"·"최민서" → 명단의 "최민서"). 팀 밖 사람은 적은 그대로.
- 시험: `flows/flow38.js`(메신저 두 기기: 일정·할 일 임시 항목, 답장 추천, 겹침, 긴 글, 말로 전하기, 단기 작업자), `flows/flow39.js`(새 파트 만들기 → 그 파트 멤버 로그인 → 폰·아이패드 한 바퀴 → 파트 고치기·이름 바꾸기·지우기), `flows/canon.js`.

## 비용 두 기기·같이 고치는 문서 (v1.47.0)
- 비용 화면의 "돌려받을 돈"은 내 개인 결제만 세요. 팀원이 올린 개인 결제는 "팀원에게 돌려줄 돈"(관리자) / "팀원이 돌려받을 돈"(멤버) 칸으로 따로 보여요(그때는 건수 칸 자리에). 올린 사람 이름은 `store.nameCanon()`으로.
- 지출 줄은 `.exp-li`. 폰(560px 이하)에서는 분류 아이콘을 숨기고 금액·상태를 오른쪽 두 줄로 둬요. 결재 대기 줄의 금액·반려·승인은 `.mem-ctl` 한 덩어리.
- 자동 저장하는 화면(기획 문서 `plan.js editor`)은 마지막으로 맞춘 내용(`base`)과 견줘요. 다른 기기에서 다른 칸을 고쳤으면 합치고, 같은 칸을 둘 다 고쳤으면 자동 저장을 멈추고 "둘 다 남기기 / 내 내용으로 / 그쪽 내용으로"를 물어요. 쓰는 중에 받아 온 것(`hajin:remote`)도 같은 길로. 새 자동 저장 화면을 만들면 이 방식을 따르세요.
- 내가 고칠 수 없는 팀 기록인지는 `admin.canEdit(item)`. 자동 저장 화면은 미리 읽기 전용으로 바꿔요(칠 때마다 거절 알림이 뜨지 않게).
- 회의록 받아쓴 글 저장도 다른 기기에서 고친 글이 있으면 먼저 물어요.
- 시험: `flows/flow40.js`(비용: 경영 멤버 폰 ↔ 관리자 PC, 결재 요청·승인·반려·받을 돈·단기 작업자), `flows/flow41.js`(같은 문서를 PC·아이패드에서, 다른 멤버 읽기 전용, 회의록), `flows/calshot.js`(캘린더 개인/팀 눈으로 보기).

## 마인드맵·프롬프트를 여럿이 (v1.48.0)
- 마인드맵 노드(`bnodes`)는 `admin.js FREE`에 있어요. 같이 그리는 것이라 멤버가 남이 만든 노드도 고치고 옮기고 지워요.
- 마인드맵 화면의 `.mm-stage`에는 `data-live`가 있어요. 다른 기기 것을 받아도 `app.js`가 화면을 통째로 다시 그리지 않고(보던 자리·확대·고른 노드 유지), 노드는 `db.onChange`로 하나씩 들어와요. 같은 식으로 "받아도 다시 그리면 안 되는 화면"은 `data-live`를 붙이고 스스로 반영하세요.
- 마인드맵을 처음 열 때 `fit(true)`: 글자를 읽을 수 있는 크기(0.7배) 밑으로는 줄이지 않고 가운데 노드부터 보여 줘요. "가지런히" 뒤에는 전체 맞춤.
- 프롬프트 보관함: 역할로 걸러도 공통(`all`)으로 저장한 것은 보이고, 다른 역할 쪽에 가려진 것이 있으면 `.ps-more` 줄로 개수와 "전체 보기"를 보여 줘요. 남이 올린 팀 프롬프트는 "내 것으로 고치기"(복사본).
- 팀 화면 멤버 목록: 끝났거나 멈춘 사람은 관리자에게만 보이고, 단기 작업자는 "단기" 표시.
- 시험: `flows/flow42.js`(마인드맵 PC ↔ 아이패드·폰), `flows/flow43.js`(시간 조율 세 사람 → 확정 → 팀 일정), `flows/flow44.js`(프롬프트: 관리자 저장 → 멤버 폰에서 쓰기·복사본).

## v1.49.0에서 생긴 규칙 (레퍼런스·구매 목록·확인 대기함을 여러 기기로)
- 구매 목록의 "고르기"는 이 기기 것(`shop:picked`, 동기화 안 함)이에요. 물건에 `checked`를 적으면 팀 모두에게 골라진 것으로 보이고 남이 고른 것까지 구매완료로 넘어가요. 합계용 고르기 같은 "보는 사람 마음" 상태는 공유 항목에 적지 않아요.
- 구매 목록 예산: 프로젝트 폴더면 프로젝트의 `buyBudget`에 적어 팀이 같이 보고(고치기는 `canEdit(프로젝트)`), 전체·직접 적은 폴더는 이 기기(`shop:budget`)에만.
- `store.approve`는 만든 기록의 id를 임시 항목에서 따요(`'ok' + 임시 항목 id`). 같은 임시 항목을 두 기기에서 확정해도 기록이 하나예요. 임시 항목 하나로 기록을 여럿 만들 일이 생기면 id를 따로 줘요.
- 레퍼런스: 남이 올린 팀 자료는 `canEdit`가 거짓이면 고치기·지우기·색 분석 단추를 안 보여 주고 까닭을 한 줄로 알려 줘요. 눌러도 거절 알림만 뜨는 단추는 만들지 않아요.
- 레퍼런스·구매 목록의 올린 사람·산 사람은 `nameCanon()`으로 명단 이름 하나로 보여 주고, 얼굴은 `facePic`.
- 단기 작업자가 레퍼런스를 담을 때 기본 폴더는 맡은 프로젝트(`defFolder`), "분류 안 됨"은 고를 수 없어요.
- 링크 제목을 못 읽으면 `linkpreview.nameFromUrl`로 "사이트 · 주소 끝말". 사이트 이름만 쓰면 같은 사이트 링크가 전부 같은 이름이 돼요.
- 영상 편집실 배경음: `musicName`을 같이 저장하고 `.music-info` 줄에 파일 이름과 "빼기"(되돌리기 됨). 다른 기기에서 넣은 배경음은 파일이 없다고 알려 줘요.
- 시험: `flows/flow45.js`(레퍼런스: 관리자 PC·멤버 폰·단기 작업자 아이패드, 이미지 올리기는 `fakesb.js`의 가짜 저장소), `flows/flow46.js`(구매 목록 두 기기, 확인 대기함 같은 사람의 PC·폰), `video/vid3.js`(`sync` 소리 어긋남, `mix` 여러 형식·배경음·두 번 내보내기).

## v1.50.0에서 생긴 규칙 (오늘 화면·알림은 "내 것" 기준, 업체 같이 고치기)
- 오늘 화면의 "오늘 할 일"·숫자·한 줄 브리핑은 `store.mineFilter()`를 거친 내 것만(할 일 화면과 같은 기준). 남이 맡은 팀 할 일은 "팀 할 일" 카드에만.
- 알림(`alarm.plan`)과 앱 아이콘 숫자(`alarm.count`)의 팀 일정은 `SC.involves(e, 내 이름)`인 것만: 다른 팀원끼리의 약속으로 내 기기가 울리지 않게. 캘린더 "내 일정"과 같은 기준이라 한쪽을 바꾸면 같이 바꿔요.
- 단기 작업자 오늘 화면에는 "팀 최근 활동"·"챙길 사람" 카드를 안 둬요(볼 수 없는 화면·기록의 빈 카드).
- 메인 화면 카드 머리(`.home-grid .card-h`)는 줄바꿈하지 않고 제목 옆 설명(`small`)만 줄여요.
- 업체 고치기 저장: 창을 열어 둔 사이 다른 기기에서 바뀐 것은 내가 안 건드린 칸·품목을 그쪽 것으로 합쳐요. 새 업체가 띄어쓰기만 다른 같은 이름이면 `store.saveVendor`로 합쳐요.
- 업체 품목 줄은 `.vd-pr`: 폰에서는 품목이 윗줄 전체, 가격·메모가 아랫줄.
- 시험: `flows/flow47.js`(업체 두 기기), `flows/flow48.js`(알림 시각: `plan`·`tick`에 시각을 넣어 봄), 역할별 오늘 화면 사진은 `gshots.js 코드 가로x세로 today`.

