# 하진 프롬프터: 코덱스 작업 지시서

코덱스(코딩 AI)가 프롬프터를 이어서 만들 때 읽는 지시서다. **이 파일을 끝까지 읽고** 번호 순서대로 작업한다. 파일 하나 = PR 하나.

## 서비스 한 줄
영상 찍을 때 폰 카메라 화면 위에 대본을 띄워 주는 텔레프롬프터. 대본이 흐르고, 그 자리에서 녹화·저장까지 된다.
무료로 기본 기능을 쓰고, 월 990원 카드 구독(프로)으로 제한이 풀린다. 기프트 키로도 열 수 있다.

- 주소: https://hchishj-alt.github.io/hajin-assistant/prompter/ (예전 https://hchishj-alt.github.io/eternia-exhibition/studio/ 는 여기로 넘어옴, 그곳 대본 `pst_scripts`는 처음 열 때 자동으로 옮김)
- 구독 관리: 위 주소 + `#/plan` / 관리 화면: `#/admin` (관리 비밀키)
- 운영자: 김하진(사업자 있음, 디자이너라 UI 기준이 높다)
- 같은 저장소의 다른 앱(팀 앱 `/`, 매니저 `/manager/`, 틀 스튜디오 `/studio/`)과 **완전히 따로** 돈다.

## 절대 규칙
1. **고정 운영비 0원.** 가입비·월 이용료·연관리비가 드는 서비스 금지. 결제 건당 수수료만 허용.
2. **빌드 도구·프레임워크·npm 의존성 금지.** `prompter/`는 순수 HTML·CSS·ES 모듈. 외부 스크립트는 결제사 공식 SDK만.
3. **비밀 값은 저장소에 넣지 않는다**: 포트원 API Secret·웹훅 Secret, 관리 비밀키, service_role 키, 빌링키.
   `prompter/config.js`의 Supabase 주소·publishable 키, 포트원 storeId·channelKey는 공개 값이라 괜찮다.
4. **다른 앱 파일을 건드리지 않는다**: 루트 `index.html`·`sw.js`·`js/`·`modules/`, `manager/`, `studio/`, `supabase/setup.sql`·`studio.sql`.
5. 화면 글은 쉬운 존댓말("~해요"). 프리텐다드, 선 아이콘(이모지 금지), 누르는 곳 44px 이상, 입력 칸 글자 16px 이상.
6. 돈이 빠져나가는 시험은 포트원 **테스트 채널**로만. 실제 결제 켜기는 하진 확인 후.
7. 코드를 고치면 `prompter/app.js`의 `VERSION`과 `prompter/sw.js`의 `VERSION`을 같이 올린다.

## 파일 지도
| 무엇 | 어디 |
|---|---|
| 대본 목록(프로젝트 폴더)·편집·촬영 연결 | `prompter/app.js` (`listView`, `editView`, `shootView`, `projects`) |
| 촬영 엔진 (이터니아 스튜디오에서 옮김: 비율 녹화·조명·렌즈·격자·[[구간]]·목소리 따라가기) | `prompter/stage.js`, `prompter/stage.css` (`#st2` 아래만) |
| 구독 상태·잠금·구독 관리·관리 화면 | `prompter/plan.js` (`needPro`, `planView`, `adminView`, `limits`) |
| **카드 결제 어댑터** (결제사 붙이는 곳) | `prompter/billing.js` (`cardReady`, `startCard`, `finishRedirect`) |
| 공개 설정: 요금, 무료 범위, 포트원 storeId·channelKey | `prompter/config.js` |
| 화면 도구(아이콘·시트·알림) | `prompter/ui.js` |
| 이 기기 저장(대본·테이크 IndexedDB, 설정) | `prompter/store.js` |
| 서버 표·함수 (다시 실행해도 안전) | `supabase/prompter.sql` |
| 카드 결제 서버 (Edge Function, 뼈대) | `supabase/functions/prompter-billing/index.ts` |

## 구독 구조 (이미 다 되어 있음)
- 손님은 로그인 없이 **복구 코드(token 16자)**로 구분. 브라우저 `localStorage['prompter:token']`. 다른 기기는 구독 관리에서 복구 코드로 이어 쓴다.
- **구독 중 = `pr_customers.paid_until > now()`**. 카드·기프트 키·손으로 주기 모두 이 값만 늘린다. 평생은 `'infinity'`.
- 무료 범위는 `config.js`의 `FREE` 한 곳(대본 3개, 한 번 녹화 3분, 720p 저장, 목소리 따라가기 잠금). 잠긴 기능을 누르면 `needPro(kind)`가 구독 창을 띄운다.
- 서버 함수: 손님용 `pr_join`·`pr_me`·`pr_redeem`·`pr_card_cancel`, 관리용 `pr_admin*`(비밀키 `pr_settings.admin_secret`),
  결제 반영용(service_role 전용) `pr_card_paid`·`pr_card_failed`·`pr_card_due`. 빌링키는 `pr_billing`에만, 손님 함수 반환값에 절대 넣지 않는다.
- 기프트 키: 관리 화면에서 한 달·1년·평생 키 만들기 → 링크 `/prompter/?gift=KEY`로 주면 구독 관리에 키가 채워진다.

## 남은 일
1. `01_카드결제_연동.md` — 포트원 테스트 채널로 카드 정기결제를 실제로 돌게 한다. **가장 중요.**
`02_하진_할일.md`는 사람(하진) 몫이다. 코덱스는 읽기만.

## 시험 방법 (PR마다)
1. SQL: 로컬 Postgres에 `anon`·`authenticated`·`service_role` 역할을 만들고 `supabase/prompter.sql`을 **두 번** 실행해 오류가 없는지. `set role anon;`으로 `pr_billing`을 읽을 수 없고 `pr_card_paid`를 부를 수 없어야 한다.
2. 화면: Playwright(`channel: 'chromium'`, `--use-fake-device-for-media-stream`, 권한 camera·microphone)로 390px·1280px. Supabase는 `page.route`로 가짜 응답.
   꼭 지나갈 흐름: 목록 → 편집 → 촬영(흐름·멈춤) → 녹화 → 테이크 저장 → 잠긴 기능 → 구독 관리 → 기프트 키 → 관리 화면. 가로 넘침·콘솔 오류 0.
3. 시험 스크립트는 저장소에 넣지 않는다.

## 약관·사업자 정보 (v1.5.0)
- 이용약관·개인정보처리방침·환불 규정: `prompter/legal.js` (#/terms, #/privacy, #/refund). 초안이며 한국어 원문만 둔다.
- 사업자 정보(상호·대표·사업자등록번호·통신판매업·주소)는 `prompter/config.js`의 `BIZ`만 채우면 소개·구독 화면 아래에 나온다. 상호나 등록번호가 비면 줄 전체가 안 나온다.
- 정기결제 고지(금액·주기·해지·7일 환불·약관 동의)는 `plan.js`의 `subNote`. 카드 결제가 열릴 때(`cardReady()`) 구독 단추 아래에 나온다.
- 공유 미리보기 `prompter/og.png`(1200×630), 주소는 `config.js SITE`와 `index.html`의 og·canonical.
