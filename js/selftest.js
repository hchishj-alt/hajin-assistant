// 자가 점검 시나리오 — 앱 안(자가 점검 메뉴)과 개발용 node 테스트가 같이 씀.
// 기준일: 2026-11-19 (목) 오전 10시
import * as B from './brain.js';
export const BASE = new Date(2026, 10, 19, 10, 0, 0);

export const CASES = [
  // [입력, 기대 kind, 기대 필드 일부]
  ['내일 오후 3시 이터니아 팀 회의', 'event', { date: '2026-11-20', start: '15:00' }],
  ['다음주 화요일까지 협찬 초대장 보내기', 'task', { due: '2026-11-24' }],
  ['점심 김밥 8500원', 'expense', { amount: 8500, category: '식비' }],
  ['어도비 구독 3만7천원 결제', 'expense', { amount: 37000, category: '소프트웨어' }],
  ['택시 12,300원 법인카드', 'expense', { amount: 12300, category: '교통', pay: '법인카드' }],
  ['김민서 010-1234-5678 디자이너', 'contact', { name: '김민서', phone: '010-1234-5678' }],
  ['11/25 2시~4시 홍대 스튜디오 촬영', 'event', { date: '2026-11-25', start: '14:00', end: '16:00' }],
  ['금요일 7시 저녁 약속', 'event', { date: '2026-11-20', start: '19:00' }],
  ['모레 오전 10시 반 교수님 면담', 'event', { date: '2026-11-21', start: '10:30' }],
  ['12월 3일 포트폴리오 마감', 'task', { due: '2026-12-03' }],
  ['3일 후 인쇄소 연락하기', 'task', { due: '2026-11-22' }],
  ['https://behance.net/gallery/1 미니멀 포스터 레퍼런스', 'reference', { url: 'https://behance.net/gallery/1' }],
  ['피그마 정리 2시간 작업했음', 'timelog', { minutes: 120 }],
  ['릴스로 전시 비하인드 찍어서 올리기', 'sns', { platform: '인스타그램' }],
  ['도록 표지에 하늘색 그라데이션 넣으면 어떨까', 'idea', {}],
  ['예비창업패키지 지원사업 12/10 마감', 'grant', { deadline: '2026-12-10' }],
  ['오늘 일정 보여줘', 'query', {}],
  ['이번 달 지출 얼마야', 'query', {}],
  ['다음 주 수요일 2시 반 줌 미팅', 'event', { date: '2026-11-25', start: '14:30' }],
  ['저녁 8시 운동', 'event', { date: '2026-11-19', start: '20:00' }],
];
export const MEETING = `음 일단 오늘 회의는 졸업전시 회고랑 다음 프로젝트 방향 정하는 거였는데 그 다음으로 창훈이가 발표자료 다음주 월요일까지 정리하기로 했고요 예진님이 협력사에 감사 메일 보내주세요 그리고 우리 다음 프로젝트는 모바일 게임으로 가기로 결정했습니다 예산은 아직 미정이라 고민이에요 민서가 레퍼런스 조사해서 금요일까지 공유하기로 했어요 다음 회의는 11월 26일 오후 2시에 하자`;
export const MEETING_EXPECT = { decisions: 1, actionsMin: 3, who: ['창훈', '예진', '민서'], dateOf26: '2026-11-26' };

export function run() {
  const results = [];
  for (const [input, kind, fields] of CASES) {
    const r = B.interpret(input, { base: BASE })[0];
    const fails = [];
    if (!r) fails.push('해석 없음');
    else {
      if (r.kind !== kind) fails.push(`종류 ${r.kind} (기대 ${kind})`);
      for (const [k, v] of Object.entries(fields)) if (String(r.data?.[k]) !== String(v)) fails.push(`${k}=${r.data?.[k]} (기대 ${v})`);
    }
    results.push({ group: '한 줄 이해', name: input, ok: !fails.length, detail: fails.join(', ') || `${r.kind} ✓` });
  }
  const a = B.analyzeNotes(MEETING, { base: BASE, people: ['창훈', '예진', '민서'] });
  results.push({ group: '회의 정리', name: '결정사항 찾기', ok: a.decisions.length >= MEETING_EXPECT.decisions, detail: `${a.decisions.length}개` });
  results.push({ group: '회의 정리', name: '할 일 찾기', ok: a.actions.length >= MEETING_EXPECT.actionsMin, detail: `${a.actions.length}개: ${a.actions.map(x => x.title).join(' / ')}` });
  const whoFound = MEETING_EXPECT.who.filter(w => a.actions.some(x => x.who === w));
  results.push({ group: '회의 정리', name: '담당자 찾기', ok: whoFound.length === MEETING_EXPECT.who.length, detail: whoFound.join(', ') });
  results.push({ group: '회의 정리', name: '후속 일정 찾기', ok: a.dates.some(d => d.date === MEETING_EXPECT.dateOf26 && d.time === '14:00'), detail: a.dates.map(d => `${d.date} ${d.time || ''}`).join(', ') });
  results.push({ group: '회의 정리', name: '요약 길이', ok: a.summary.length >= 2 && a.summary.length <= 6, detail: `${a.summary.length}줄` });
  results.push({ group: '회의 정리', name: '키워드 품질', ok: a.keywords.every(k => !/(는데|어요|세요|했고)$/.test(k)) && a.keywords.length >= 4, detail: a.keywords.join(', ') });
  const refs = B.recommendRefs('게임 UI 파스텔 미니멀 인벤토리 화면');
  results.push({ group: '레퍼런스', name: '게임 UI 추천', ok: refs.links.length >= 3 && refs.moods.includes('pastel'), detail: refs.links.map(l => l.site).join(', ') });
  const sim = B.similar('협찬 초대장', [{ id: 1, text: '이터니아 협찬사 초대장 디자인' }, { id: 2, text: '점심 메뉴' }]);
  results.push({ group: '검색', name: '비슷한 기록 찾기', ok: sim[0]?.id === 1, detail: sim.map(s => s.id).join(',') });
  return results;
}
export const EXTRA = [
  ['금요일까지 포트폴리오 정리', 'task', { title: '포트폴리오 정리', due: '2026-11-20' }],
  ['오늘 빈 시간', 'query', {}],
  ['이번 주 할 일', 'query', {}],
  ['내일 일정', 'query', {}],
];
CASES.push(...EXTRA);
CASES.push(
  ['매주 화요일 7시 스터디', 'event', { repeat: 'weekly', start: '19:00', title: '스터디' }],
  ['12/24 크리스마스 파티', 'event', { date: '2026-12-24' }],
  ['30분 동안 이메일 정리했음', 'timelog', { minutes: 30 }],
  ['2주 뒤 IR 피칭 준비', 'task', { due: '2026-12-03' }],
  ['현수막 출력비 8만원 법인카드 #이터니아', 'expense', { amount: 80000, pay: '법인카드' }],
  ['박예진 예진디자인 대표 01098765432', 'contact', { phone: '010-9876-5432' }],
  ['회의록', 'nav', {}],
  ['다음 달 초에 포트폴리오 업데이트', 'task', { due: '2026-12-01' }],
);
