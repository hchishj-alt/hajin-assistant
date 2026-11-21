// 공개해도 되는 값만 둔다. 결제 시크릿·키는 절대 여기에 넣지 않는다.
// 서비스 이름. 바꾸면 index.html 제목·manifest 이름도 같이.
export const NAME = '피드메이트';
// 문의 메일(하진 11/21)
export const CONTACT = 'hchis.hj@gmail.com';
// 요금(하진 11/21): 월 2,990원, 원래 가격 12,990원에 줄 긋고 할인 표시. 외국은 달러.
export const PRICE = { month: 2990, list: 12990, usd: 2.99, usdList: 12.99, event: '오픈 할인가' };
// 카드 결제가 붙기 전에는 전부 열어 둠. 결제를 붙이면 false 로.
export const BETA = true;
// 유료로 묶을 기능(결제를 붙일 때 이 목록대로 잠금)
export const PRO = ['내 분야 트렌드 매일 찾기', 'AI가 짜는 주간 전략', '영상·캡션 피드백', '캡처에서 숫자 읽기', '협찬 답장 초안'];
export const FREE = ['규칙으로 짜는 주간 계획', '숫자 직접 적기·분석', '맞팔 정리', '협찬·광고 기록', '연습 계정으로 구경'];
