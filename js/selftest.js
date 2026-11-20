// 자가 점검 시나리오 — 앱 안(자가 점검 메뉴)과 개발용 node 테스트가 같이 씀.
// 기준일: 2026-11-19 (목) 오전 10시
import * as B from './brain.js';
import { isWhere } from './where.js';
import * as PS from './prompts.js';
import * as DM from './dm.js';
import { dayOf } from './db.js';
import * as V from './video.js';
import * as SY from './sync.js';
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
    const r = B.interpret(input, { base: BASE, people: ['최민서', '안서연'] })[0];
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
  { const P = ['제일 성수 팝업', '아모레 쿠션 팝업', '아모레 프리오픈', '루미에 팝업'];
    const m = B.minutes('아모레 쿠션 킥오프 회의록\n- 예산 1억 2천, 기간 3주\n- 민서: 굿즈 후보 3개 다음주 금요일까지\n- 서연: 견적서 다음주 화요일까지\n- 하진: 예약 페이지 와이어프레임 11월 30일까지\n- 다음 회의 12월 1일 오후 2시', { base: BASE, people: ['최민서', '안서연'], projects: P, me: ['하진'] });
    const it = (m?.items || []).map(x => `${x.kind}:${x.data.title}:${x.data.who ?? ''}:${x.data.due || x.data.date || ''}`);
    results.push({ group: '회의록 붙여넣기', name: '담당·마감·프로젝트', ok: !!m && m.project === '아모레 쿠션 팝업' && it[0] === 'task:굿즈 후보 3개:민서:2026-11-27' && it[1] === 'task:견적서:서연:2026-11-24' && it[2] === 'task:예약 페이지 와이어프레임::2026-11-30' && m.items[3]?.kind === 'event' && m.notes.length === 1, detail: it.join(' / ') });
    const g = s2 => B.projectGuess(s2, P).name;
    results.push({ group: '프로젝트 묶기', name: '이름 일부만 말해도', ok: g('루미에 포스터') === '루미에 팝업' && g('제일기획 PT') === '제일 성수 팝업' && g('제일 급한 일') === '' && g('아모레 견적서') === '' && B.projectGuess('아모레 견적서', P, '아모레 프리오픈').name === '아모레 프리오픈', detail: [g('루미에 포스터'), g('제일기획 PT'), g('제일 급한 일') || '(없음)', g('아모레 견적서') || '(둘이라 안 정함)'].join(' / ') }); }
    { const yes = ['할일로 쓴거 왜 할일에 없는지?', '방금 적은 일정 어디 갔어', '아까 말한 거 왜 안 보여', '캘린더에 왜 안 떠', '확정했는데 할 일에 없어', '저장 됐어?', '메모 사라졌어'];
      const no = ['오늘 할 일 없어?', '금요일 약속 안 돼', '내일 일정 없지?', '할 일 없어서 심심해', '아까 말한 견적서 금요일까지 보내야 해', '영수증 못 찾겠어서 재발급 받아야 해', '저장해줘'];
      const bad = [...yes.filter(x => !isWhere(x)), ...no.filter(x => isWhere(x))];
      results.push({ group: '어디 갔는지 묻기', name: '“왜 할 일에 없어?”를 알아듣고, 평범한 말과 헷갈리지 않음', ok: !bad.length, detail: bad.length ? '틀림: ' + bad.join(' / ') : `${yes.length + no.length}문장` }); }
  const refs = B.recommendRefs('게임 UI 파스텔 미니멀 인벤토리 화면');
  { // 말로 화면 이동
    const nv = t => { const r = B.interpret(t, {}); return r.length === 1 && r[0].kind === 'nav' ? (r[0].data.q ? 'prompts?' + r[0].data.q : r[0].data.make ? 'prompts/make' : B.navTo(r[0].data.to)) : r.map(x => x.kind).join('+') || '-'; };
    const cases = [['회의록', 'meetings'], ['기획 보드', 'plan'], ['자가 점검', 'health'], ['메신저 열어줘', 'talk'], ['프롬프트 스튜디오 열어 줘', 'prompts'], ['구매 목록', 'shop'], ['설정으로 가줘', 'settings'], ['오늘 화면으로', 'today'], ['견적 프롬프트 보여줘', 'prompts?견적'], ['시안 피드백 프롬프트 쓸래', 'prompts?시안 피드백'], ['프롬프트 만들어줘', 'prompts/make'], ['설정 화면 보여줘', 'settings'], ['캘린더 화면 보여줘', 'calendar'], ['할 일 화면 보여줘', 'tasks'], ['회의록 화면으로 가줘', 'meetings'], ['꾸미기 화면 좀 열어줄래?', 'look'], ['메신저로 이동해줘', 'talk'], ['비용 화면을 보여줘', 'money']];
    const bad = cases.filter(([t, want]) => nv(t) !== want);
    results.push({ group: '화면 이동', name: '메뉴 이름을 말하면 그 화면으로 (예전엔 "회의록"이 오늘 화면으로 갔음)', ok: !bad.length, detail: bad.length ? '틀림: ' + bad.map(([t, w]) => `${t} → ${nv(t)} (기대 ${w})`).join(' / ') : `${cases.length}/${cases.length}` });
    const keep = [['오늘', 'nav'], ['구매', 'nav'], ['점심 9000원', 'nav'], ['내일 3시 회의', 'nav'], ['프롬프트 스튜디오에 견적 틀 저장', 'nav'], ['일정 보여줘', 'nav'], ['오늘 할 일 보여줘', 'nav'], ['민서 일정 보여줘', 'nav'], ['비용 보여줘', 'nav'], ['회의록 보여줘', 'nav']].filter(([t]) => B.interpret(t, {}).some(x => x.kind === 'nav'));
    results.push({ group: '화면 이동', name: '평범한 말을 이동으로 잘못 읽지 않음', ok: !keep.length, detail: keep.length ? '틀림: ' + keep.map(x => x[0]).join(' / ') : '10/10' });
    { // 자정 넘어 끝낸 일이 "오늘"로 세어지는지 (저장은 UTC 글자라 앞 10글자를 자르면 하루 어긋남)
      const late = new Date(2026, 10, 21, 0, 30).toISOString(), noon = new Date(2026, 10, 21, 12, 0).toISOString();
      const ok = dayOf(late) === '2026-11-21' && dayOf(noon) === '2026-11-21' && dayOf('2026-11-21') === '2026-11-21' && dayOf('') === '' && dayOf(new Date(2026, 0, 1, 0, 5)) === '2026-01-01';
      results.push({ group: '날짜', name: '저장된 시각을 이 기기 날짜로 읽음 (자정~아침에 하루 어긋나지 않음)', ok, detail: ok ? '5/5' : `${dayOf(late)} / ${dayOf(noon)}` }); }
  }
  { // 곧 울릴 알림, 비워 둘 시간, 제목 군말
    const base = new Date(2026, 10, 20, 14, 0), cx = { base, people: ['김하진', '최민서', '안서연'], projects: ['가을 팝업', '루미에'] }; const one = t => B.interpret(t, cx)[0] || { data: {} };
    const a = one('10분 뒤에 알려줘'), b2 = one('30분 뒤에 전화하라고 알려줘'), c = one('1시간 반 뒤 회의 준비 알림'), d = one('10분 뒤 미팅');
    results.push({ group: '알림 말', name: '"10분 뒤에 알려줘"는 그때 울리는 일정으로', ok: a.kind === 'event' && a.data.start === '14:10' && a.data.remind === 0 && a.data.title === '알림' && b2.data.start === '14:30' && b2.data.title === '전화' && c.data.start === '15:30' && c.data.title === '회의 준비' && d.kind === 'event' && d.data.title === '미팅' && d.data.start === '14:10', detail: [a, b2, c, d].map(x => `${x.kind} ${x.data.start} ${x.data.title}`).join(' / ') });
    const e = one('수요일 오전은 비워둬'), f = one('책상 비워둬');
    results.push({ group: '알림 말', name: '"수요일 오전은 비워둬"는 그 시간을 잡아 두는 일정, "책상 비워둬"는 아님', ok: e.kind === 'event' && e.data.date === '2026-11-25' && e.data.start === '09:00' && e.data.end === '12:00' && f.kind !== 'event', detail: `${e.kind} ${e.data.date} ${e.data.start}~${e.data.end} / ${f.kind}` });
    const g = one('영수증 정리 금요일에 하자'), h2 = one('사무실 월세 80만원 매달 5일'), i = one('세금계산서 발행 루미에 550만원'), j = one('내일 아침 9시에 깨워줘'), k = one('오늘 뭐 했는지 정리');
    results.push({ group: '알림 말', name: '제목 군말 다듬기, 세금계산서 발행은 받을 돈, "뭐 했는지 정리"는 묻는 말', ok: g.data.title === '영수증 정리' && h2.data.title === '사무실 월세' && i.kind === 'income' && /루미에/.test(i.data.title) && j.data.title === '일어나기' && k.kind === 'query', detail: [g.data.title, h2.data.title, i.kind + ' ' + i.data.title, j.data.title, k.kind].join(' / ') });
  }
  { // 시각이 있는 약속, 낸 사람, 안 들어온 돈
    const cx = { base: new Date(2026, 10, 20, 14, 0), people: ['김하진', '최민서', '안서연'], projects: ['가을 팝업', '루미에'] }; const one = t => B.interpret(t, cx)[0] || { data: {} };
    const a = one('인쇄 감리 목요일 2시 파주'), b2 = one('포스터 인쇄 맡기기 목요일 2시까지'), c = one('목요일 2시까지 견적서 보내기');
    results.push({ group: '약속과 할 일', name: '"인쇄 감리 목요일 2시 파주"는 약속, "…2시까지 보내기"는 할 일', ok: a.kind === 'event' && a.data.start === '14:00' && b2.kind === 'task' && c.kind === 'task', detail: [a, b2, c].map(x => x.kind).join(' / ') });
    const d = one('굿즈 샘플비 15만원 서연이가 냄'), e = one('오로라 계약금 아직 안 들어왔어'), f = one('오로라 계약금 300만원 들어왔어');
    results.push({ group: '약속과 할 일', name: '낸 사람은 제목에서 빼 메모로, "아직 안 들어왔어"는 받을 돈을 보는 말', ok: d.kind === 'expense' && d.data.title === '굿즈 샘플비' && /안서연/.test(d.data.memo || '') && e.kind === 'query' && f.kind === 'income', detail: `${d.data.title} (${d.data.memo}) / ${e.kind} / ${f.kind}` });
    const g = one('루미에 촬영 다음 주 수요일 오전 10시 성수 스튜디오'), h2 = one('내일 2시 강남역 스타벅스 미팅');
    results.push({ group: '약속과 할 일', name: '맨 뒤에 온 곳("…성수 스튜디오", "…파주")과 가게 이름을 곳으로', ok: g.data.place === '성수 스튜디오' && g.data.title === '루미에 촬영' && a.data.area === '파주' && a.data.title === '인쇄 감리' && h2.data.place === '강남역 스타벅스', detail: `${g.data.title} @ ${g.data.place} / ${a.data.title} @ ${a.data.area} / ${h2.data.title} @ ${h2.data.place}` });
    const n1 = one('포스터 시안 B안으로 확정'), n2 = one('서연이한테 견적서 보내달라고 해줘');
    results.push({ group: '약속과 할 일', name: '정한 것은 "결정" 메모로, "○○한테 ~달라고 해줘"는 그 사람 할 일로', ok: n1.kind === 'note' && n1.data.title === '결정: 포스터 시안 B안' && (n1.data.tags || []).includes('결정') && n2.kind === 'task' && n2.data.title === '견적서 보내기' && /서연/.test(n2.data.who || ''), detail: `${n1.kind} ${n1.data.title} / ${n2.kind} ${n2.data.title} (${n2.data.who})` });
    { const all = t => B.interpret(t, cx); const m0 = all('점심 만이천원이랑 커피 오천원'), m1 = all('점심 9000원이랑 커피 4500원 서연이가 냄'), m2 = all('어제 택시 12000원 썼고 오늘 커피 4500원'), m3 = all('오로라 계약금 300만원, 잔금 200만원'), m4 = all('A3 포스터 100장 45000원, 명함 200장 12000원');
      results.push({ group: '묶어서 말하기', name: '금액 두 개는 두 건으로 (한글 금액도, 낸 사람·날짜·거래처는 같이 따라감), 가격표는 그대로 한 건', ok: m0.length === 2 && m0[0].data.amount === 12000 && m0[1].data.amount === 5000 && m1.length === 2 && m1[0].data.amount === 9000 && m1[1].data.amount === 4500 && /서연/.test(m1[0].data.memo || '') && m2.length === 2 && m2[0].data.date === '2026-11-19' && m2[1].data.date === '2026-11-20' && m3.length === 2 && m3[1].kind === 'income' && m3[1].data.title === '오로라 잔금' && m4.length === 1, detail: [m0, m1, m2, m3, m4].map(x => x.map(y => `${y.data.title} ${y.data.amount}`).join(' + ')).join(' / ') });
      { const n1 = all('이번 달 인건비 민서 80만원 서연 80만원'), n2 = all('촬영 소품 대여 5만원 보증금 10만원'), n3 = one('법카로 회의 다과 23,500원'), n4 = all('오전에 은행 가고 오후에 세무사 상담'), n5 = one('내일 3시 편집 회의'), n6 = one('수요일 3시 강남역 미팅');
        results.push({ group: '묶어서 말하기', name: '쉼표 없이 이어 쓴 금액, 머리말 따라가기, "오전에 … 오후에 …", "편집 회의"의 편집은 곳이 아님', ok: n1.length === 2 && /인건비 서연/.test(n1[1].data.title) && n2.length === 2 && n2[1].data.title === '촬영 소품 보증금' && n3.data.title === '회의 다과' && n3.data.pay === '법인카드' && n4.length === 2 && n4[1].kind === 'event' && n4[1].data.date === '2026-11-20' && n5.data.title === '편집 회의' && !n5.data.place && n6.data.place === '강남역', detail: `${n1.map(x => x.data.title).join(' + ')} / ${n2.map(x => x.data.title).join(' + ')} / ${n3.data.title} / ${n4.map(x => x.kind).join('+')} / ${n5.data.title} / ${n6.data.place}` }); }
      { const c1 = all('오늘 회의에서 로고는 B안으로 하고 포스터는 다음 주 금요일까지 민서가 하기로 했어'), c2 = all('회의실 예약하고 금요일까지 자료 준비'), c3 = all('내일 3시 미팅하고 회식');
        results.push({ group: '묶어서 말하기', name: '회의에서 정한 것과 맡은 일을 한 문장으로, "~하고 ~까지"는 할 일 둘, "미팅하고 회식"은 그대로 하나', ok: c1.length === 2 && c1[0].kind === 'note' && c1[0].data.title === '결정: 로고 → B안' && c1[1].kind === 'task' && c1[1].data.title === '포스터' && /민서/.test(c1[1].data.who) && c1[1].data.due === '2026-11-27' && c2.length === 2 && c2[0].data.title === '회의실 예약' && c2[1].data.due === '2026-11-27' && c3.length === 1, detail: [c1, c2, c3].map(x => x.map(y => `${y.kind} ${y.data.title}`).join(' + ')).join(' / ') }); }
      { const k1 = all('회의록: 로고 B안 확정, 포스터 민서 금요일까지'), k2 = one('세무사 상담 예약 전화하기 02-555-1234'), k3 = one('김대표 010-1234-5678');
        results.push({ group: '묶어서 말하기', name: '"회의록: A 확정, B 민서 금요일까지"는 결정 메모와 할 일로, 번호가 있어도 "전화하기"는 할 일', ok: k1.length === 2 && k1[0].kind === 'note' && k1[0].data.title === '결정: 로고 B안' && k1[1].kind === 'task' && k1[1].data.title === '포스터' && k2.kind === 'task' && k3.kind === 'contact', detail: `${k1.map(x => x.kind + ' ' + x.data.title).join(' + ')} / ${k2.kind} / ${k3.kind}` }); }
      { const b1 = one('통장 잔액 320만원'), b2 = one('어도비 구독 월 6만2천원 매달 3일 결제'), b3 = one('세금계산서 오로라 330만원 발행 완료'), b4 = one('담주수욜까지시안'), b5 = one('커피 4.5천원'), b6 = one('#FF5733 메인 컬러로 확정');
        results.push({ group: '약속과 할 일', name: '잔액은 쓴 돈이 아님, "구독 월 6만2천원", 세금계산서 발행은 받을 돈, 붙여 쓴 말, 소수 금액, 결정에는 늘 #결정', ok: b1.kind === 'note' && b2.kind === 'expense' && b2.data.title === '어도비 구독' && b2.data.amount === 62000 && b3.kind === 'income' && b3.data.from === '오로라' && b4.kind === 'task' && b4.data.title === '시안' && b5.data.amount === 4500 && (b6.data.tags || []).includes('결정'), detail: `${b1.kind} / ${b2.data.title} ${b2.data.amount} / ${b3.kind} ${b3.data.from} / ${b4.data.title} / ${b5.data.amount} / ${(b6.data.tags || []).join(',')}` }); }
      { const v1 = one('민서야 내일까지 시안 좀 부탁해'), v2 = one('서연아 회의록 정리해줘 금요일까지'), v3 = one('하진이 내일 3시 오로라 미팅 감'), v4 = one('우리 다음 주에 회식하자'), v5 = one('내일 비 온대'), v6 = one('민서가 내일 2시 치과');
        results.push({ group: '약속과 할 일', name: '"민서야 … 부탁해"는 민서 할 일, "하진이 … 미팅 감"·"우리 … 회식하자" 제목 다듬기, "내일 비 온대"는 그냥 하는 말', ok: v1.kind === 'task' && /민서/.test(v1.data.who) && v1.data.title === '시안' && v2.kind === 'task' && /서연/.test(v2.data.who) && v2.data.title === '회의록 정리' && v2.data.due === '2026-11-27' && v3.data.title === '오로라 미팅' && /하진/.test(v3.data.who || '') && v4.data.title === '회식' && v5.kind === 'talk' && v6.data.place === '치과', detail: `${v1.data.who} ${v1.data.title} / ${v2.data.who} ${v2.data.title} / ${v3.data.title} (${v3.data.who}) / ${v4.data.title} / ${v5.kind} / ${v6.data.place}` }); }
      { const t1 = one('다음 달 첫째 주 월요일 킥오프'), t2 = one('이번 달 말일까지 정산'), t3 = one('크리스마스에 팝업 오픈'), t4 = one('크리스마스 선물 사기'), t5 = one('12/24 크리스마스 파티'), t6 = one('내년 1월 2일 시무식 10시'), t7 = one('한글날에 전시 보러 가기');
        results.push({ group: '약속과 할 일', name: '"다음 달 첫째 주", "말일까지", 때로 쓴 "크리스마스에"만 날짜로, "내년 1월 2일", 지난 기념일은 내년', ok: (t1.data.due || t1.data.date) === '2026-12-07' && t2.data.due === '2026-11-30' && t2.data.title === '정산' && t3.data.date === '2026-12-25' && t3.data.title === '팝업 오픈' && t4.data.title === '크리스마스 선물 사기' && !t4.data.due && t5.data.date === '2026-12-24' && t6.data.date === '2027-01-02' && t6.data.title === '시무식' && t7.data.date === '2027-10-09', detail: `${t1.data.due || t1.data.date} / ${t2.data.title} ${t2.data.due} / ${t3.data.date} / ${t4.data.title} / ${t5.data.date} / ${t6.data.title} ${t6.data.date} / ${t7.data.date}` }); }
      { const w1 = all('평일 오전 9시 출근'), w2 = all('주말마다 팝업 지원'), w3 = one('내일부터 모레까지 워크숍'), w4 = one('다음 주 내내 촬영'), w5 = one('이번 주말 촬영');
        results.push({ group: '약속과 할 일', name: '"평일 9시"는 월~금 되풀이, "주말마다"는 토·일, "내일부터 모레까지"·"다음 주 내내"는 기간', ok: w1.length === 5 && w1.every(x => x.data.repeat === 'weekly' && x.data.title === '출근') && w2.length === 2 && w2[0].data.title === '팝업 지원' && w3.kind === 'event' && w3.data.date === '2026-11-21' && w3.data.endDate === '2026-11-22' && w4.data.date === '2026-11-23' && w4.data.endDate === '2026-11-27' && w4.data.title === '촬영' && w5.data.date === '2026-11-21' && !w5.data.repeat, detail: `${w1.length}건 / ${w2.length}건 / ${w3.data.date}~${w3.data.endDate} / ${w4.data.date}~${w4.data.endDate} / ${w5.data.date}` }); }
      { const l1 = all('할 일: 로고 수정, 포스터 인쇄, 견적서 발송'), l2 = all('내일 할 일 로고 수정이랑 포스터 인쇄'), l3 = all('1. 로고 수정 2. 포스터 인쇄 3. 견적서 발송'), l4 = all('로고 수정 → 포스터 인쇄 → 납품'), l5 = all('할 일: 포스터 수정, 금요일까지'), l6 = all('할 일: 민서랑 미팅 준비'), l7 = one('할 일 뭐 있어?');
        results.push({ group: '묶어서 말하기', name: '늘어놓은 할 일은 하나씩 (쉼표, 이랑, 번호, 화살표), 마감만 따로 쓴 것·사람 이름은 안 나눔', ok: l1.length === 3 && l1.every(x => x.kind === 'task') && l2.length === 2 && l2.every(x => x.data.due === '2026-11-21') && l2[0].data.title === '로고 수정' && l3.length === 3 && l3[0].data.title === '로고 수정' && l4.length === 3 && l4[2].data.title === '납품' && l5.length === 1 && l5[0].data.due === '2026-11-27' && l6.length === 1 && l7.kind === 'query', detail: [l1, l2, l3, l4, l5, l6].map(x => x.length).join(' / ') + ' / ' + l7.kind }); }
      { const o1 = all('민서 할 일: 포스터, 리플렛'), o2 = one('할 일 추가: 견적서'), o3 = all('내일 10시 치과 가고 2시 오로라 미팅'), o4 = one('오늘 할 일 다 했어'), o5 = one('해야 할 일이 너무 많아');
        results.push({ group: '묶어서 말하기', name: '"민서 할 일: A, B"는 민서 할 일 둘, "10시 … 가고 2시 …"는 일정 둘, "할 일 다 했어"·"너무 많아"는 적지 않고 답함', ok: o1.length === 2 && o1.every(x => /민서/.test(x.data.who)) && o2.data.title === '견적서' && o3.length === 2 && o3[0].data.start === '10:00' && o3[1].data.start === '14:00' && o3[1].data.date === '2026-11-21' && o4.kind === 'query' && o5.kind === 'query', detail: `${o1.map(x => x.data.who + ' ' + x.data.title).join(' + ')} / ${o2.data.title} / ${o3.map(x => x.data.start).join('+')} / ${o4.kind} / ${o5.kind}` }); }
      { const w1 = all('화요일 목요일 2시 수업'), w2 = all('월요일 화요일 출장'), w3 = one('내일 휴가'), w4 = one('민서 내일 휴가'), w5 = one('민서 휴가'), w6 = one('내일 휴가자'), w7 = one('매주 화요일 요가'), w8 = all('월 수 금 9시 스탠드업'), w9 = all('화요일, 목요일 요가'); const late = new Date('2026-11-20T19:50:00+09:00'), lt = q => B.interpret(q, { base: late, people: [], projects: [] })[0], t1 = lt('3시 미팅'), t2 = lt('오늘 3시 미팅'), t3 = lt('3시에 미팅했어'), t4 = lt('이따 9시 통화'), t5 = lt('밤 10시 통화');
        results.push({ group: '묶어서 말하기', name: '띄어 쓴 요일(쉼표·낱자 셋 포함)은 요일마다 하나씩, "매주 화요일 요가"는 시간이 없어도 되풀이 일정, 날 없이 말한 지난 시각은 내일(지난 일을 적는 말은 오늘), 이어진 날의 출장은 되풀이 없이 한 줄, "내일 휴가"는 묻는 말이 아니라 쉬는 날', ok: w1.length === 2 && w1[0].data.date === '2026-11-24' && w1[1].data.date === '2026-11-26' && w1[0].data.title === '수업' && w2.length === 1 && w2[0].data.endDate === '2026-11-24' && !w2[0].data.repeat && w3.kind === 'event' && w4.kind === 'event' && /민서/.test(w4.data.who || '') && w5.kind === 'query' && w6.kind === 'query' && w7.kind === 'event' && w7.data.repeat === 'weekly' && w7.data.title === '요가' && w8.length === 3 && w8[0].data.title === '스탠드업' && w9.length === 2 && w9[1].data.title === '요가' && t1.data.date === '2026-11-21' && t2.data.date === '2026-11-20' && t3.data.date === '2026-11-20' && t4.data.date === '2026-11-20' && t4.data.start === '21:00' && t4.data.title === '통화' && t5.data.date === '2026-11-20', detail: `${w1.map(x => x.data.date).join('+')} / ${w2.map(x => x.data.date + '~' + x.data.endDate + ' ' + (x.data.repeat || '한 번')).join('+')} / ${[w3, w4, w5, w6].map(x => x.kind).join(' ')}` }); }
      const p1 = all('민서는 포스터, 서연이는 견적서 금요일까지'), e1 = one('모레 오전 10시에 성수에서 루미에 대표님이랑 굿즈 샘플 보면서 미팅하기로 했어');
      results.push({ group: '묶어서 말하기', name: '"민서는 A, 서연이는 B 금요일까지"는 두 사람 할 일에 같은 마감, "…하기로 했어"는 제목에서 뗌', ok: p1.length === 2 && p1[0].data.title === '포스터' && p1[1].data.title === '견적서' && p1[0].data.due === '2026-11-27' && p1[1].data.due === '2026-11-27' && e1.kind === 'event' && e1.data.title === '굿즈 샘플 보면서 미팅', detail: p1.map(x => `${x.data.who} ${x.data.title} ${x.data.due}`).join(' + ') + ' / ' + e1.data.title });
      const r1 = one('회의록 정리해야되는데 까먹지 않게 내일 아침에 알려줘'), r2 = one('내일 9시에 약 먹으라고 알려줘'), r3 = one('내일 일정 알려줘');
      results.push({ group: '알림 말', name: '"까먹지 않게 내일 아침에 알려줘"는 그때 울리는 알림, "내일 일정 알려줘"는 묻는 말', ok: r1.kind === 'event' && r1.data.title === '회의록 정리' && r1.data.date === '2026-11-21' && r1.data.start === '09:00' && r1.data.remind === 0 && r2.kind === 'event' && r2.data.title === '약 먹기' && r3.kind === 'query', detail: `${r1.data.title} ${r1.data.date} ${r1.data.start} / ${r2.data.title} / ${r3.kind}` }); }
    { const q1 = one('이번 달 수입'), q2 = one('이번 달 얼마 벌었어?'), q3 = one('다음 회의는 다음 주 수요일 오후 2시');
      results.push({ group: '약속과 할 일', name: '"이번 달 수입"·"얼마 벌었어?"는 묻는 말, "다음 회의는 …" 제목에서 "는"을 뗌', ok: q1.kind === 'query' && q2.kind === 'query' && q3.kind === 'event' && q3.data.title === '다음 회의', detail: `${q1.kind} / ${q2.kind} / ${q3.data.title}` }); }
    { const q4 = one('이번 주에 끝낸 일'), q5 = one('금요일까지 끝낼 일 정리하기');
      results.push({ group: '약속과 할 일', name: '"이번 주에 끝낸 일"은 묻는 말 (할 일로 적지 않음)', ok: q4.kind === 'query' && q5.kind === 'task', detail: `${q4.kind} / ${q5.kind}` }); }
    { const ro = [{ id: 'a', name: '최민서' }, { id: 'b', name: '안서연' }]; const d1 = DM.parseSend('민서한테 회의 취소됐다고 전해줘', ro), d2 = DM.parseSend('민서한테 내일 보자고 전해줘', ro), d3 = DM.parseSend('서연이한테 시안 수정하라고 전해줘', ro), d4 = DM.parseSend('민서한테 파일 보내줘', ro), d5 = DM.parseSend('민서한테 수고했어 보내줘', ro);
      results.push({ group: '메신저', name: '옮기는 말의 끝을 살림("취소됐다고" → "취소됐다"), "파일 보내줘"는 전할 말이 아니라 내 할 일', ok: !!d1 && d1.body === '회의 취소됐다' && !!d2 && d2.body === '내일 보자' && !!d3 && d3.body === '시안 수정해 주세요' && d4 === null && !!d5 && d5.body === '수고했어', detail: [d1, d2, d3, d4, d5].map(x => (x ? x.body : '할 일로')).join(' / ') }); }
    { const ro = [{ id: 'a', name: '최민서' }, { id: 'b', name: '안서연' }]; const s1 = DM.parseSend('서연이한테 견적서 보내달라고 해줘', ro), s2 = DM.parseSend('서연이한테 정산 끝났냐고 물어봐줘', ro);
      results.push({ group: '메신저', name: '"서연이한테 ~달라고 해줘"는 부탁하는 말로, "~냐고 물어봐줘"는 묻는 말로 전함', ok: !!s1 && s1.to.name === '안서연' && s1.body === '견적서 보내 주세요' && !!s2 && s2.body === '정산 끝났어?', detail: `${s1 && s1.body} / ${s2 && s2.body}` }); }
  }
  { // 프롬프트 스튜디오
    const body = '우리 팀: {{팀 소개}}\n팀원: {{팀}}\n\n{{고객사}}에 낼 제안서 목차를 잡아 줘.\n예산: {{예산}}';
    const vs = PS.vars(body), f1 = PS.fill(body, { '팀': '김하진(PM), 최민서(아트디렉터)', '고객사': '아모레' });
    results.push({ group: '프롬프트 스튜디오', name: '빈칸 찾고 채우기 (모르는 팀 소개 줄은 빼고, 안 채운 칸은 표시)', ok: vs.join() === '팀 소개,팀,고객사,예산' && !/팀 소개|우리 팀/.test(f1) && f1.startsWith('팀원: 김하진(PM), 최민서(아트디렉터)') && f1.includes('아모레에 낼') && f1.includes('예산: [예산]'), detail: f1.replace(/\n/g, ' / ') });
    const weak = PS.review('로고 만들어줘'), good = PS.review(PS.BUILTIN.find(t => t.id === 'builtin:pm-mail').body);
    results.push({ group: '프롬프트 스튜디오', name: '점검: 짧은 말은 낮게, 잘 짠 말은 높게', ok: weak.score < 40 && weak.missing.some(i => i.id === 'format') && good.score >= 80, detail: `${weak.score}점 / ${good.score}점` });
    const c = PS.compose({ role: '콘텐츠 기획사의 PM', goal: '팝업 제안서 목차를 잡아 줘', format: '표로', ask: true });
    results.push({ group: '프롬프트 스튜디오', name: '칸을 채우면 한 편으로 조립', ok: c.startsWith('너는 콘텐츠 기획사의 PM야.') && c.includes('해 줄 일: 팝업 제안서 목차를 잡아 줘') && c.includes('형식: 표로') && /먼저 질문/.test(c), detail: c.replace(/\n+/g, ' / ') });
  }
  { /* 영상 편집실: 못 여는 클립은 길이 0(건너뜀), 컷 길이 맞추기, 어디서나 열리는 형식 가리기 */
    const vid = (d, o = {}) => ({ type: 'video', el: { duration: d }, ...o });
    const clips = [vid(12), vid(8, { in: 2, out: 5 }), { type: 'image', dur: 3 }, { type: 'video', bad: true, el: { duration: NaN } }, vid(NaN), vid(Infinity)];
    const T = V.totalDuration(clips, {});
    const cut = [vid(10), { type: 'image', dur: 3 }, vid(1)]; const r = V.applyConcept(cut, { edit: { cut: 2, sfxCut: 'pop' } });
    results.push({ group: '영상 편집실', name: '못 여는 클립은 0초로 세고, 컷 길이를 맞추고, 아이폰·인스타에서 열리는 형식만 "어디서나"로 봄', ok: T === 18 && V.clipLen(clips[3]) === 0 && V.clipLen(clips[4]) === 0 && V.clipLen(clips[5]) === 0 && r.trimmed === 2 && cut[0].in === 4 && cut[0].out === 6 && cut[1].dur === 2 && r.sfx.length === 2 && V.plays('video/mp4;codecs=avc1.42E01E,mp4a.40.2') && !V.plays('video/mp4;codecs=avc1,opus') && !V.plays('video/webm;codecs=vp9,opus') && V.recType() === null, detail: `전체 ${T}초 / 컷 ${cut[0].in}~${cut[0].out} / 효과음 ${r.sfx.length}` });
    const cls = [['견적서 항목 뽑아줘', '돈·계약'], ['회의록 정리해줘', '회의·정리'], ['포스터 무드 세 가지', '디자인·이미지'], ['고객 메일 답장 써줘', '글쓰기'], ['팝업 제안서 목차', '기획'], ['경쟁사 사례 조사', '조사']].filter(([t, want]) => PS.classify(t) !== want);
    results.push({ group: '프롬프트 스튜디오', name: '분야 알아서 나누기', ok: !cls.length, detail: cls.length ? '틀림: ' + cls.map(x => x[0]).join(' / ') : '6/6' });
    const rk = [PS.roleKeys('리더·PM·UX/UI').join(), PS.roleKeys('아트디렉터').join(), PS.roleKeys('경영').join()];
    results.push({ group: '프롬프트 스튜디오', name: '역할 글에서 맡은 일 읽기', ok: rk[0] === 'pm,art' && rk[1] === 'art' && rk[2] === 'biz' && PS.byRole(['biz'])[0].role === 'biz', detail: rk.join(' | ') });
    { const mk = PS.MY_ROLES.map(r => PS.roleKeys(r).join()); results.push({ group: '프롬프트 스튜디오', name: '역할은 네 가지로 고정(PM·리더, 아트·디자인, 콘텐츠 제작, 경영·운영), 예전 역할 글도 같은 쪽으로 읽음', ok: mk.join('|') === 'pm|art|make|biz' && PS.roleKeys(PS.MY_ROLES.join(', ')).length === 4 && PS.roleKeys('리더·PM·UX/UI').join() === 'pm,art' && PS.roleKeys('아트디렉터').join() === 'art' && PS.roleKeys('경영').join() === 'biz' && PS.roleKeys('PM·기획').join() === 'pm', detail: mk.join(' | ') }); }
    { /* 새 파트: 관리자가 만든 파트는 닮았다고 고른 쪽을 따르고, 지우면 다시 모름. 단기 작업자는 맡은 프로젝트 것만 팀과 나눔 */
      PS.setParts([{ name: '3D', about: '모델링', keys: ['art', 'make'] }, { name: '개발', keys: ['pm', '없는쪽'] }]);
      const a = PS.roleKeys('3D').join(), b = PS.roleKeys('개발').join(), c = PS.roleKeys('아트·디자인, 3D').join(), names = PS.teamRoles().map(r => r.name).join();
      PS.setParts([]); const d = PS.roleKeys('3D').join();
      const g = { projects: ['루미에 팝업'] }, can = (col, project) => SY.guestCanShare({ col, project }, g);
      results.push({ group: '역할과 단기 작업자', name: '새 파트는 닮은 쪽 화면을 따르고, 단기 작업자는 맡은 프로젝트의 할 일·일정만 팀과 나눔(비용·다른 프로젝트는 나만)', ok: a === 'art,make' && b === 'pm' && c === 'art,make' && d === '' && /콘텐츠 제작,경영·운영,3D,개발$/.test(names) && can('tasks', '루미에 팝업') && can('events', '루미에 팝업') && !can('tasks', '다른 일') && !can('tasks', '') && !can('expenses', '루미에 팝업') && !can('contacts', '루미에 팝업') && SY.guestCanShare({ col: 'expenses' }, null), detail: `${a} / ${b} / ${c} / ${names}` });
    }
    const at = new Date().toISOString(), lg = (by, cat, len, sig) => ({ by, cat, tool: 'Claude', title: cat + ' 틀', len, sig, at });
    const st = PS.style([lg('최민서', '디자인·이미지', 420, { format: true, material: true, context: true }), lg('최민서', '디자인·이미지', 380, { format: true, material: true, context: true }), lg('최민서', '글쓰기', 350, { format: true, context: true }), lg('안서연', '돈·계약', 60, {})], [{ by: '안서연' }], ['김하진', '최민서', '안서연']);
    results.push({ group: '프롬프트 스튜디오', name: '팀원별 작업 방식 요약', ok: st[0].name === '최민서' && st[0].uses === 3 && st[0].cats[0][0] === '디자인·이미지' && st[0].habits.includes('길고 자세하게 시키는 편') && st[0].habits.includes('받을 모양을 꼭 정함') && st.find(x => x.name === '안서연').made === 1 && st.find(x => x.name === '김하진').uses === 0, detail: st.map(x => `${x.name} ${x.uses}번 [${x.habits.join(', ')}]`).join(' / ') });
    const bad = PS.BUILTIN.filter(t => !t.title || t.body.length < 60 || !PS.CATS.includes(t.cat) || !PS.ROLES[t.role] || PS.review(t.body).score < 60);
    results.push({ group: '프롬프트 스튜디오', name: `기본 틀 ${PS.BUILTIN.length}개가 모두 점검을 통과`, ok: !bad.length && PS.BUILTIN.length >= 20 && new Set(PS.BUILTIN.map(t => t.id)).size === PS.BUILTIN.length, detail: bad.length ? '모자람: ' + bad.map(t => `${t.title}(${PS.review(t.body).score})`).join(', ') : '역할별 ' + ['pm', 'art', 'biz', 'all'].map(r => PS.BUILTIN.filter(t => t.role === r).length).join('/') });
  }
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
  ['민서 금요일까지 전투 밸런스 수정', 'task', { who: '민서', title: '전투 밸런스 수정', due: '2026-11-20' }],
  ['서연님한테 포스터 시안 부탁', 'task', { who: '서연', title: '포스터 시안 부탁' }],
  ['매주 화요일 7시 스터디', 'event', { repeat: 'weekly', start: '19:00', title: '스터디' }],
  ['12/24 크리스마스 파티', 'event', { date: '2026-12-24' }],
  ['30분 동안 이메일 정리했음', 'timelog', { minutes: 30 }],
  ['2주 뒤 IR 피칭 준비', 'task', { due: '2026-12-03' }],
  ['현수막 출력비 8만원 법인카드 #이터니아', 'expense', { amount: 80000, pay: '법인카드' }],
  ['박예진 예진디자인 대표 01098765432', 'contact', { phone: '010-9876-5432' }],
  ['회의록', 'nav', {}],
  ['다음 달 초에 포트폴리오 업데이트', 'task', { due: '2026-12-01' }],
  ['수요일까지 아모레 견적서 보내기', 'task', { title: '아모레 견적서 보내기', due: '2026-11-25' }],
  ['사진과 이미지 아이디어 오늘까지 만들어야해', 'task', { title: '사진과 이미지 아이디어 만들기', due: '2026-11-19' }],
  ['이번주 일요일에 두시 서충주에서 하는 전시 수집오빠랑', 'event', { title: '수집오빠와 전시', date: '2026-11-22', start: '14:00', area: '서충주', who: '수집오빠' }],
  ['아이디어 정리해야 해', 'task', { title: '아이디어 정리하기' }],
  ['견적서 고쳐야 해', 'task', { title: '견적서 고치기' }],
  ['민서한테 시안 받아야 함', 'task', { title: '민서한테 시안 받기' }],
  ['예약 페이지 와이어프레임 11월 30일까지', 'task', { title: '예약 페이지 와이어프레임', due: '2026-11-30' }],
  ['공간제작소 시공비 2,800만원 중 선금 1,400만원 보냄', 'expense', { amount: 14000000 }],
  ['스태프 식대 하루 4만원 14일', 'expense', { amount: 560000 }],
  ['이번 주 금요일 6시 제일기획 수정본 컨펌 콜', 'event', { date: '2026-11-20', start: '18:00' }],
  ['루미에 팝업 12월 5일 토요일이랑 6일 일요일 연남동', 'event', { date: '2026-12-05', endDate: '2026-12-06' }],
  ['더현대 담당 이수민 대리 010-5555-0202', 'contact', { name: '이수민' }],
  ['현수막 3000x1200 유포지 2장 발주해야 해', 'task', {}],
);
