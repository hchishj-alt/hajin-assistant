// 공개해도 되는 값만 둔다. 결제사 API 시크릿·관리 비밀키는 절대 여기에 넣지 않는다.
export const SB = { url: 'https://wuvqtfvvouweqxbydlqa.supabase.co', key: 'sb_publishable_dpHWxB26toO96sIiv4XlqA_lBmzrGGp' };

// 요금: 카드 월 자동결제 하나. 바꾸면 supabase/functions/prompter-billing 의 PRICE도 같이 바꾼다.
export const PRICE = { month: 990, list: 9900, days: 31, event: '오픈 이벤트가' }; // list: 원래 가격(줄 긋기), 할인율은 자동

// 무료로 쓸 수 있는 범위. 여기만 고치면 앱 전체 잠금이 바뀐다.
export const FREE = {
  scripts: 3,      // 대본 개수
  recSec: 180,     // 한 번 녹화 최대 길이(초)
  voice: false,    // 목소리 따라가기
  hq: false,       // 1080p 저장 (무료는 720p)
};

// 카드 정기결제(포트원 V2). storeId·channelKey는 공개 값이라 여기 둬도 된다.
// 비어 있으면 화면에 "카드 결제 준비 중"이 뜨고, 기프트 키로만 열 수 있다.
// 연동 방법: docs/prompter-codex/01_카드결제_연동.md
export const PORTONE = {
  storeId: '',
  channelKey: '',
  sdk: 'https://cdn.portone.io/v2/browser-sdk.js',
  fn: SB.url + '/functions/v1/prompter-billing',
};
