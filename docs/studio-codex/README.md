# 프롬프트 스튜디오: 코덱스 작업 지시서

이 폴더는 코덱스(코딩 AI)가 프롬프트 스튜디오를 이어서 만들 때 읽는 지시서다.
**먼저 이 파일을 끝까지 읽고**, 그다음 번호 순서대로 한 파일씩 작업한다. 파일 하나 = PR 하나.

## 서비스 한 줄
빈칸만 채우면 바로 쓰는 프롬프트 틀을 파는 웹 서비스. 무료 틀 일부 + 월 990원 구독으로 전부 열림.
팀 앱(하진 비서)과 **같은 저장소의 다른 폴더**에서 따로 돈다.

- 주소: https://hchishj-alt.github.io/hajin-assistant/studio/
- 관리 화면: 위 주소 + `#admin` (입금 알림 비밀키로 들어감)
- 운영자: 김하진 (사업자 있음). 디자이너라 UI 기준이 높다.

## 절대 규칙
1. **고정 운영비 0원.** 가입비·월 이용료·연관리비가 드는 서비스는 쓰지 않는다. 결제 건당 수수료만 허용.
   지금 쓰는 것: GitHub Pages(무료), Supabase 무료 플랜(Edge Functions·pg_cron 포함).
2. **빌드 도구·프레임워크·npm 의존성 금지.** `studio/`는 순수 HTML·CSS·ES 모듈. 외부 스크립트는 결제사 공식 SDK만 CDN으로.
3. **비밀 값을 저장소에 넣지 않는다.** 결제사 API 시크릿, 입금 알림 비밀키, Supabase service_role 키, 계좌번호.
   `studio/app.js`의 Supabase 주소와 publishable 키는 공개 값이라 괜찮다.
4. **유료 틀 본문은 저장소에 넣지 않는다.** 서버 `ps_templates` 표에만 있다. 화면은 `ps_body`로 받아 온다.
5. **팀 앱 파일을 건드리지 않는다.** (`index.html`, `sw.js`, `js/`, `modules/`, `supabase/setup.sql`). 팀 앱은 다른 작업자가 계속 배포 중이다.
6. 화면 글은 쉬운 한국어 존댓말("~해요"). 폰트 프리텐다드, 아이콘은 선 아이콘(이모지 금지), 누르는 곳 44px 이상, 입력 칸 글자 16px 이상(아이폰 확대 방지).
7. 돈이 실제로 빠져나가는 시험은 결제사 **테스트 모드**로만. 실제 결제 켜기는 하진 확인 후.

## 파일 지도
| 무엇 | 어디 |
|---|---|
| 화면 전체 (목록·틀 창·결제 창·마이페이지·도움말·첫 안내·관리) | `studio/app.js` |
| 꾸미기 (라이트·다크, 스프링 애니메이션) | `studio/style.css` |
| 페이지 틀, 앱 메타 | `studio/index.html`, `studio/manifest.webmanifest` |
| 전용 서비스 워커 (범위 /studio/, 새 것 먼저) | `studio/sw.js` — 고치면 `CACHE` 이름을 올린다 |
| 서버 표·함수 (다시 실행해도 안전) | `supabase/studio.sql` |

`studio/app.js`의 주요 함수: `rpc`(서버 함수 호출), `loadAll`, `render`(해시 라우터: `#`, `#me/saves|plan|help`, `#admin`),
`openTemplate`(빈칸 채우기 창), `saveBox`(보관), `paySheet`(이체 결제 창), `renderSaves`/`renderPlan`/`renderHelp`, `onboarding`, `renderAdmin`.
화면은 `h('tag.class#id', attrs, ...kids)`로 만든다. 창은 `sheet(build, opts)`, 알림은 `toast()`.

## 손님 구분 방식 (로그인 없음)
- 처음 결제하거나 보관할 때 `ps_join()`이 **복구 코드(token, 16자)**와 **입금 코드(code, 예: K7M2)**를 만든다. token은 브라우저 `localStorage['ps:token']`에 저장.
- 다른 기기에서는 마이페이지 › 구독에 복구 코드를 넣어 이어 쓴다.
- 구독 여부 = `ps_customers.paid_until > now()`. **모든 결제 수단은 결국 이 값만 늘린다.** (이체·카드·달러 모두 같은 규칙)

## 서버 (supabase/studio.sql)
표는 직접 못 읽는다(RLS 정책 없음 + 권한 회수). 아래 함수로만 다룬다. 모두 `security definer`.
| 함수 | 하는 일 |
|---|---|
| `ps_catalog(lang)` | 틀 목록. 유료 틀은 본문 null |
| `ps_join()` / `ps_me(token)` | 손님 만들기 / 내 상태 |
| `ps_body(token, id)` | 무료거나 구독 중이면 본문 |
| `ps_bank()` | 손님에게 보일 계좌 |
| `ps_deposit(secret, msg)` | 입금 알림 글에서 금액·입금 코드를 찾아 기간을 늘림 (9,900원마다 365일, 990원마다 31일) |
| `ps_admin*` | 관리 화면용 (비밀키 확인) |
| `ps_mine`, `ps_save`, `ps_unsave`, `ps_folders`, `ps_move_folder` | 보관함·폴더·결제 내역 |

서버 변경은 `supabase/studio.sql` 끝에 **덧붙이고**(다시 실행해도 안전하게), PR 설명에 "SQL Editor에서 실행 필요"라고 적는다.
새 표를 만들면 반드시 `enable row level security` + `revoke all ... from anon, authenticated`.

## 시험 방법 (PR마다)
1. SQL: 로컬 Postgres에 `anon`·`authenticated` 역할을 만들고 `supabase/studio.sql`을 **두 번** 실행해 오류가 없는지. `set role anon;`으로 함수 호출해 본다. 다른 사람 token으로는 아무것도 안 보여야 한다.
2. 화면: Playwright로 390px(폰)·1280px(PC). Supabase 주소는 `page.route`로 가짜 응답(CORS 헤더 포함). 가로 넘침·콘솔 오류 0.
   꼭 지나갈 흐름: 첫 안내 → 무료 틀 채우기·복사 → 보관(새 폴더) → 잠긴 틀 → 결제 창 → 결제 반영 → 잠금 풀림 → 마이페이지 세 탭 → 관리 화면.
3. 시험 스크립트는 저장소에 넣지 않는다.

## 작업 순서
1. `01_카드_정기결제_포트원.md` — 가장 중요. 하진이 포트원 가입·심사 중(3~4주). 테스트 키로 먼저 만든다.
2. `02_법적_표기와_약관.md` — 카드 심사 전에 필요.
3. `03_해외_달러판.md`
4. `04_다듬기.md`
`05_하진_할일.md`는 사람(하진) 몫이다. 코덱스는 읽기만.
