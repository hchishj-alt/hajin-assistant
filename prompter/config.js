// 공개해도 되는 값만 둔다. 결제사 API 시크릿·관리 비밀키는 절대 여기에 넣지 않는다.
export const SB = { url: 'https://wuvqtfvvouweqxbydlqa.supabase.co', key: 'sb_publishable_dpHWxB26toO96sIiv4XlqA_lBmzrGGp' };

// 요금: 카드 월 자동결제 하나. 바꾸면 supabase/functions/prompter-billing 의 PRICE도 같이 바꾼다.
// list: 줄 긋는 '원래 가격'. 실제로 그 값에 판 적이 없으면 0으로 둘 것(표시광고법 허위 할인 소지). 0이면 할인 표시 없음
export const PRICE = { month: 1990, list: 9900, days: 31, event: '오픈가' }; // 11/25 하진: 9,900 취소선 유지, 오픈가 1,990

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

// 문의 메일(하진 요청 11/21: 일단 내 메일로)
export const CONTACT = 'hchis.hj@gmail.com';

// 사이트 주소(검색·공유 미리보기). 주소가 바뀌면 index.html·robots.txt·sitemap.xml도 같이.
export const SITE = 'https://hchishj-alt.github.io/hajin-assistant/prompter/';

// 사업자 정보(전자상거래법 표시 의무). 하진이 알려 주면 채운다. 빈 칸은 화면에 안 나온다.
export const BIZ = {
  name: '',        // 상호
  ceo: '',         // 대표자
  regNo: '',       // 사업자등록번호 000-00-00000
  mailOrder: '',   // 통신판매업 신고번호 (간이과세자는 면제 → '면제'라고 적기)
  address: '',     // 사업장 주소
  phone: '',       // 고객센터 전화(없으면 비워 둠, 메일로 받음)
};

// 출시 베타: 카드 결제가 열리기 전(cardReady()가 거짓)에는 누구나 프로로 쓰게 할지. 카드가 열리면 저절로 꺼진다.
export const BETA = false;
