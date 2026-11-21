# 프롬프리에딧 카드 결제 연동: GPT(코덱스)에게 한 번에 주는 지시서

> 하진 사용법: ChatGPT **Codex**에 GitHub 저장소 `hchishj-alt/hajin-assistant`를 연결하고, 아래 "붙여넣을 글"을 그대로 붙여 넣으세요.
> 포트원 테스트 채널 storeId·channelKey(공개 값)는 같이 알려 줘도 되고, **API Secret·웹훅 Secret은 절대 채팅에 붙이지 말고** 마지막에 직접 `supabase secrets set`으로 넣으세요.

---

## 붙여넣을 글

저장소 `hchishj-alt/hajin-assistant`의 `prompter/`(촬영용 대본 프롬프터 앱 "프롬프리에딧")에 **포트원 V2 카드 정기결제(월 990원)**를 실제로 돌게 붙여 줘.
화면·서버 표·Edge Function 뼈대는 이미 다 있고, 결제사 연결만 비어 있어. 아래 문서를 끝까지 읽고 그대로 따라 줘.

1. `docs/prompter-codex/README.md` — 서비스 설명, **절대 규칙**(고정 운영비 0원, 빌드 도구·npm 금지, 비밀 값 저장소 금지, 다른 앱 파일 건드리지 않기, VERSION 같이 올리기), 파일 지도, 시험 방법
2. `docs/prompter-codex/01_카드결제_연동.md` — 할 일과 "끝났다고 볼 기준"

고칠 곳은 이것뿐이야:
- `prompter/billing.js` (cardReady·startCard·finishRedirect)
- `supabase/functions/prompter-billing/index.ts` (/issue, /charge-due, /webhook)
- `prompter/config.js`의 `PORTONE.storeId`·`channelKey` (테스트 채널 값: 아래에 적어 둠)
- 필요하면 `supabase/prompter.sql`에 함수 추가(다시 실행해도 안전하게)

꼭 지킬 것:
- 포트원 API 경로·응답 모양은 **https://developers.portone.io 의 V2 문서로 확인**하고 맞춰. 지금 뼈대는 기억으로 쓴 거라 틀릴 수 있어.
- 돈이 빠져나가는 시험은 **테스트 채널로만**.
- 손님은 로그인 없이 복구 코드(`token`)로 구분되고, 메일 로그인(`pr_link`)은 그 token을 메일 계정에 묶는 것뿐이야. 구독 판단은 `pr_customers.paid_until > now()` 하나. 결제가 되면 `pr_card_paid`, 실패는 `pr_card_failed`만 불러.
- 빌링키는 `pr_billing`에만. 손님 쪽 함수 반환값이나 화면에 절대 내보내지 마.
- 화면 글은 쉬운 존댓말("~해요"), 이모지 금지.
- `prompter/app.js`와 `prompter/sw.js`의 `VERSION`을 같이 올려.
- PR 설명 맨 아래에 **하진이 직접 칠 명령**을 적어 줘: `supabase secrets set ...`, `supabase functions deploy prompter-billing --no-verify-jwt`, pg_cron 한 줄(01 문서에 있음).

테스트 채널 값(공개 값):
- storeId: (여기에)
- channelKey: (여기에)

---

## 하진이 GPT 작업 전후로 할 것
1. 포트원 가입·심사(사업자등록증, 통장 사본, 신분증, 통신판매업 신고). 콘솔에서 테스트 채널 만들기.
2. 위 글을 코덱스에 붙여 넣기 → PR이 오면 PR 설명의 명령 세 개 실행.
3. 테스트 카드로 결제 → 프로 열림 → 해지까지 해 보고, 되면 실제 채널 값으로 바꾸기(이것도 코덱스에 "실제 채널로 바꿔 줘, storeId·channelKey는 이거"라고 하면 됨).
4. 카드가 열리면 앱에서 "카드로 구독" 버튼이 저절로 살아나요. 그 전까지는 무료 범위 + 기프트 키로만 프로가 열려요.
