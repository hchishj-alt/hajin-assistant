// 자가 점검 시나리오 — 앱 안(자가 점검 메뉴)과 개발용 node 테스트가 같이 씀.
// 기준일: 2026-11-19 (목) 오전 10시
import * as B from './brain.js';
import { isWhere } from './where.js';
import * as PS from './prompts.js';
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
    const cases = [['회의록', 'meetings'], ['기획 보드', 'plan'], ['자가 점검', 'health'], ['메신저 열어줘', 'talk'], ['프롬프트 스튜디오 열어 줘', 'prompts'], ['구매 목록', 'shop'], ['설정으로 가줘', 'settings'], ['오늘 화면으로', 'today'], ['견적 프롬프트 보여줘', 'prompts?견적'], ['시안 피드백 프롬프트 쓸래', 'prompts?시안 피드백'], ['프롬프트 만들어줘', 'prompts/make']];
    const bad = cases.filter(([t, want]) => nv(t) !== want);
    results.push({ group: '화면 이동', name: '메뉴 이름을 말하면 그 화면으로 (예전엔 "회의록"이 오늘 화면으로 갔음)', ok: !bad.length, detail: bad.length ? '틀림: ' + bad.map(([t, w]) => `${t} → ${nv(t)} (기대 ${w})`).join(' / ') : `${cases.length}/${cases.length}` });
    const keep = [['오늘', 'nav'], ['구매', 'nav'], ['점심 9000원', 'nav'], ['내일 3시 회의', 'nav'], ['프롬프트 스튜디오에 견적 틀 저장', 'nav'], ['일정 보여줘', 'nav']].filter(([t]) => B.interpret(t, {}).some(x => x.kind === 'nav'));
    results.push({ group: '화면 이동', name: '평범한 말을 이동으로 잘못 읽지 않음', ok: !keep.length, detail: keep.length ? '틀림: ' + keep.map(x => x[0]).join(' / ') : '6/6' });
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
  }
  { // 프롬프트 스튜디오
    const body = '우리 팀: {{팀 소개}}\n팀원: {{팀}}\n\n{{고객사}}에 낼 제안서 목차를 잡아 줘.\n예산: {{예산}}';
    const vs = PS.vars(body), f1 = PS.fill(body, { '팀': '김하진(PM), 최민서(아트디렉터)', '고객사': '아모레' });
    results.push({ group: '프롬프트 스튜디오', name: '빈칸 찾고 채우기 (모르는 팀 소개 줄은 빼고, 안 채운 칸은 표시)', ok: vs.join() === '팀 소개,팀,고객사,예산' && !/팀 소개|우리 팀/.test(f1) && f1.startsWith('팀원: 김하진(PM), 최민서(아트디렉터)') && f1.includes('아모레에 낼') && f1.includes('예산: [예산]'), detail: f1.replace(/\n/g, ' / ') });
    const weak = PS.review('로고 만들어줘'), good = PS.review(PS.BUILTIN.find(t => t.id === 'builtin:pm-mail').body);
    results.push({ group: '프롬프트 스튜디오', name: '점검: 짧은 말은 낮게, 잘 짠 말은 높게', ok: weak.score < 40 && weak.missing.some(i => i.id === 'format') && good.score >= 80, detail: `${weak.score}점 / ${good.score}점` });
    const c = PS.compose({ role: '콘텐츠 기획사의 PM', goal: '팝업 제안서 목차를 잡아 줘', format: '표로', ask: true });
    results.push({ group: '프롬프트 스튜디오', name: '칸을 채우면 한 편으로 조립', ok: c.startsWith('너는 콘텐츠 기획사의 PM야.') && c.includes('해 줄 일: 팝업 제안서 목차를 잡아 줘') && c.includes('형식: 표로') && /먼저 질문/.test(c), detail: c.replace(/\n+/g, ' / ') });
    const cls = [['견적서 항목 뽑아줘', '돈·계약'], ['회의록 정리해줘', '회의·정리'], ['포스터 무드 세 가지', '디자인·이미지'], ['고객 메일 답장 써줘', '글쓰기'], ['팝업 제안서 목차', '기획'], ['경쟁사 사례 조사', '조사']].filter(([t, want]) => PS.classify(t) !== want);
    results.push({ group: '프롬프트 스튜디오', name: '분야 알아서 나누기', ok: !cls.length, detail: cls.length ? '틀림: ' + cls.map(x => x[0]).join(' / ') : '6/6' });
    const rk = [PS.roleKeys('리더·PM·UX/UI').join(), PS.roleKeys('아트디렉터').join(), PS.roleKeys('경영').join()];
    results.push({ group: '프롬프트 스튜디오', name: '역할 글에서 맡은 일 읽기', ok: rk[0] === 'pm,art' && rk[1] === 'art' && rk[2] === 'biz' && PS.byRole(['biz'])[0].role === 'biz', detail: rk.join(' | ') });
    { const mk = PS.MY_ROLES.map(r => PS.roleKeys(r).join()); results.push({ group: '프롬프트 스튜디오', name: '직접 고른 역할(로그인 안 한 기기)', ok: mk.join('|') === 'pm|art|biz' && PS.roleKeys(PS.MY_ROLES.join(', ')).length === 3, detail: mk.join(' | ') }); }
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
