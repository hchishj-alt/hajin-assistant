// 비서가 질문에 답할 때 AI에게 같이 보여 주는 "앱 기록 한눈에". 전화번호·메모 본문 같은 건 넣지 않고 제목·날짜·상태만.
// 줄마다 짧은 번호(T1, E2…)를 붙여 두고, AI가 번호로 가리키면 map으로 실제 기록을 찾음
import * as db from './db.js';
import * as store from './store.js';

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const wd = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}(${'일월화수목금토'[new Date(s + 'T00:00').getDay()]})` : '';
const cut = (s, n = 40) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const won = n => (Number(n) || 0).toLocaleString() + '원';

export async function snapshot(now = new Date()) {
  const today = ymd(now); const map = new Map(); const L = []; const ICON = { tasks: 'check2', calendar: 'calendar', inbox: 'inbox', money: 'receipt', meetings: 'mic', plan: 'file' };
  const add = (code, rec, route, line) => { const f = line.split(' | '); map.set(code, { id: rec.id, col: rec.col, title: rec.title || rec.name || f[0], route, icon: ICON[route] || 'file', sub: f.slice(1, 4).filter(x => x && x !== '-' && x !== '나').join(' · ') }); L.push(`${code} | ${line}`); };
  const [tasks, events, drafts, incomes, expenses, contacts, meetings, notes] = await Promise.all(['tasks', 'events', 'drafts', 'incomes', 'expenses', 'contacts', 'meetings', 'notes'].map(c => db.list(c)));
  const mine = await store.mineFilter(); const names = await store.myNames();
  const recent = (x, days) => Date.parse(x.updatedAt || x.createdAt || 0) > now.getTime() - days * 864e5;

  // 할 일
  const where = t => t.done ? '완료 탭' : !mine(t) ? '담당자별 탭' : t.due && t.due > today ? '예정 탭' : '오늘 탭';
  const open = tasks.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); const done = tasks.filter(t => t.done && recent(t, 3)).slice(0, 10);
  L.push(`[할 일] 남은 일 ${open.length}개${open.length > 50 ? ' (앞의 50개만)' : ''}, 최근 3일 끝낸 일 ${done.length}개. 형식: 번호 | 제목 | 마감 | 담당 | 프로젝트 | 상태 | 보이는 곳`);
  [...open.slice(0, 50), ...done].forEach((t, i) => add('T' + (i + 1), t, 'tasks', `${cut(t.title)} | ${t.due ? wd(t.due) + (!t.done && t.due < today ? ' 지남' : '') : '마감 없음'} | ${t.who && !names.includes(t.who) ? t.who : '나'} | ${t.project || '-'} | ${t.done ? '끝남' : '남음'} | 할 일 › ${where(t)}`));

  // 일정: 지난 7일 ~ 앞으로 45일, 반복 일정은 따로
  const from = ymd(new Date(now.getTime() - 7 * 864e5)), to = ymd(new Date(now.getTime() + 45 * 864e5));
  const evs = events.filter(e => e.repeat || ((e.endDate || e.date || '') >= from && (e.date || '') <= to)).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start || '').localeCompare(b.start || '')).slice(0, 60);
  L.push(`[일정] ${from}~${to}에 ${evs.length}개. 형식: 번호 | 제목 | 날짜 시간 | 곳 | 누구랑 | 개인/팀 | 프로젝트`);
  evs.forEach((e, i) => add('E' + (i + 1), e, 'calendar', `${cut(e.title)} | ${wd(e.date)}${e.endDate && e.endDate > e.date ? '~' + wd(e.endDate) : ''} ${e.start || '종일'}${e.end ? '-' + e.end : ''}${e.repeat ? ' (반복: ' + e.repeat + ')' : ''} | ${cut([e.area, e.place].filter(Boolean).join(' '), 24) || '-'} | ${e.who || '-'} | ${e.scope === 'personal' ? '개인' : '팀 업무'} | ${e.project || '-'}`));

  // 확인 대기함(임시)과 최근에 확정·버린 것
  const pend = drafts.filter(d => d.status === 'pending' && d.kind !== 'summary'), dec = drafts.filter(d => d.status !== 'pending' && d.kind !== 'summary' && recent(d, 3)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 12);
  L.push(`[대기함] 확정 전인 임시 항목 ${pend.length}개 (확정해야 목록에 들어감). 그 아래는 최근 3일에 확정하거나 버린 것. 형식: 번호 | 종류 | 제목 | 상태`);
  pend.slice(0, 20).forEach((d, i) => add('D' + (i + 1), { id: d.id, col: 'drafts', title: d.data.title || d.data.name }, 'inbox', `${store.KINDS[d.kind]?.label || d.kind} | ${cut(d.data.title || d.data.name)} | 확정 전 (대기함에 있음)`));
  dec.forEach((d, i) => add('D' + (pend.slice(0, 20).length + i + 1), { id: d.resultId || d.id, col: store.KINDS[d.kind]?.col || 'drafts', title: d.data.title || d.data.name }, d.status === 'approved' ? (store.KINDS[d.kind]?.route || 'today') : 'inbox', `${store.KINDS[d.kind]?.label || d.kind} | ${cut(d.data.title || d.data.name)} | ${d.status === 'approved' ? '확정됨 (목록에 들어감)' : '버림'}`));

  // 돈
  const month = today.slice(0, 7); const mx = expenses.filter(e => (e.date || '').startsWith(month)); const due = incomes.filter(i => i.status !== 'got');
  L.push(`[돈] 이번 달 지출 ${won(mx.reduce((s, e) => s + (Number(e.amount) || 0), 0))} (${mx.length}건), 받을 돈 ${won(due.reduce((s, e) => s + (Number(e.amount) || 0), 0))} (${due.length}건). 형식: 번호 | 제목 | 금액 | 날짜 | 프로젝트`);
  due.slice(0, 15).forEach((x, i) => add('I' + (i + 1), x, 'money', `받을 돈: ${cut(x.title)} | ${won(x.amount)} | ${wd(x.date) || '날짜 없음'} | ${x.project || '-'}`));
  [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 15).forEach((x, i) => add('X' + (i + 1), x, 'money', `지출: ${cut(x.title)} | ${won(x.amount)} | ${wd(x.date)} | ${x.project || '-'}`));

  // 프로젝트
  try { const ps = (await store.projectStats()).filter(p => (p.status || '진행') !== '완료').slice(0, 15);
    if (ps.length) { L.push('[프로젝트] 형식: 이름 | 할 일 끝남/전체 | 밀린 일 | 받은 돈 | 받을 돈 | 쓴 돈'); ps.forEach(p => L.push(`${cut(p.name, 30)} | ${p.done}/${p.all} | ${p.late} | ${won(p.got)} | ${won(p.due)} | ${won(p.out)}`)); } } catch { }

  // 사람·회의·메모는 이름과 제목만
  const team = await store.teammateNames().catch(() => []);
  L.push(`[사람] 팀원: ${team.join(', ') || '없음'}. 연락처: ${contacts.slice(0, 40).map(c => c.name + (c.org || c.role ? `(${cut([c.org, c.role].filter(Boolean).join(' '), 14)})` : '')).join(', ') || '없음'}`);
  const ms = [...meetings].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6); if (ms.length) { L.push('[회의록] 형식: 번호 | 제목 | 날짜'); ms.forEach((m, i) => add('M' + (i + 1), m, 'meetings', `${cut(m.title)} | ${wd(m.date)}`)); }
  const ns = [...notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 10); if (ns.length) { L.push('[메모·아이디어] 형식: 번호 | 종류 | 제목'); ns.forEach((n, i) => add('N' + (i + 1), n, 'plan', `${n.type === 'idea' ? '아이디어' : '메모'} | ${cut(n.title)}`)); }
  return { text: L.join('\n'), map, today };
}

// 방금 나눈 대화 몇 줄 (AI가 "그거", "방금 거"를 알아듣게)
export async function recentTalk(n = 6) {
  const ms = (await db.list('chat')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).slice(-n);
  return ms.map(m => `${m.role === 'me' ? '사용자' : '비서'}: ${cut(m.text, 160)}`).join('\n');
}
