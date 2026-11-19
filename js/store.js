// 도메인 레이어: 어떤 종류의 항목이 어느 컬렉션에 저장되는지, 확인 대기함(임시) 흐름
import * as db from './db.js';
import * as brain from './brain.js';

// kind → 컬렉션
export const KINDS = {
  event: { col: 'events', label: '일정', icon: 'calendar', route: 'calendar' },
  task: { col: 'tasks', label: '할 일', icon: 'check2', route: 'tasks' },
  expense: { col: 'expenses', label: '지출', icon: 'receipt', route: 'money' },
  contact: { col: 'contacts', label: '연락처', icon: 'user', route: 'people' },
  note: { col: 'notes', label: '메모', icon: 'file', route: 'plan' },
  idea: { col: 'notes', label: '아이디어', icon: 'bulb', route: 'plan' },
  reference: { col: 'refs', label: '레퍼런스', icon: 'link', route: 'plan' },
  timelog: { col: 'timelogs', label: '작업 기록', icon: 'timer', route: 'tasks' },
  sns: { col: 'sns', label: 'SNS 콘텐츠', icon: 'film', route: 'studio' },
  okr: { col: 'okrs', label: '목표', icon: 'target', route: 'startup' },
  grant: { col: 'grants', label: '지원사업', icon: 'flag', route: 'startup' },
  vendor: { col: 'vendors', label: '업체', icon: 'briefcase', route: 'vendors' },
  buy: { col: 'buys', label: '살 것', icon: 'cart', route: 'shop' },
  meeting: { col: 'meetings', label: '회의록', icon: 'mic', route: 'meetings' },
  summary: { col: null, label: '요약', icon: 'sparkles', route: 'inbox' },
};

// ── 확인 대기함 ──
// AI(두뇌)가 만든 결과는 전부 여기 먼저. 하진이 승인해야 실제 컬렉션에 들어감.
export async function draft(kind, data, { source = '', sourceRef = '', confidence = 0.7, origin = 'chat' } = {}) {
  return db.put('drafts', { kind, data, source, sourceRef, confidence, origin, status: 'pending' });
}
export async function drafts() {
  return (await db.list('drafts')).filter(d => d.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function approve(d, edited) {
  const data = edited || d.data;
  const k = KINDS[d.kind];
  let saved = null;
  if (k && k.col) {
    const payload = { ...data };
    if (d.kind === 'idea') payload.type = 'idea';
    if (d.kind === 'note') payload.type = payload.type || 'note';
    if (d.kind === 'task') payload.done = false;
    if (d.sourceRef) payload.sourceRef = d.sourceRef;
    if (d.kind === 'vendor') saved = await saveVendor(payload);
    else saved = await db.put(k.col, await teamify(d.kind, payload));
  } else if (d.kind === 'summary' && d.sourceRef) {
    // 회의·메모 요약 승인 → 원본에 확정 요약으로 붙임
    await db.patch(d.sourceRef, { summary: data, summaryConfirmed: true });
  }
  if (edited) { brain.learn(d.kind, d.source || '', edited); await saveLearned(); }
  await db.patch(d.id, { status: 'approved', approvedAt: db.now(), resultId: saved?.id || null });
  return saved;
}
// 업체는 같은 이름이 있으면 새로 만들지 않고 합침: 빈 칸만 채우고, 같은 품목은 새 가격으로 바꿈
export async function saveVendor(v) {
  const key = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const team = (await db.get('team-main')) ? 'team-main' : '';
  const ex = (await db.list('vendors')).find(x => key(x.name) && key(x.name) === key(v.name));
  if (!ex) return db.put('vendors', { ...v, name: (v.name || '이름 없는 업체').trim(), cat: v.cat || '기타', prices: v.prices || [], team });
  const prices = [...(ex.prices || [])]; for (const p of v.prices || []) { const i = prices.findIndex(q => key(q.item) === key(p.item)); if (i >= 0) prices[i] = { ...prices[i], ...p, note: p.note || prices[i].note || '', was: prices[i].price !== p.price ? prices[i].price : prices[i].was }; else prices.push(p); }
  return db.patch(ex.id, { phone: v.phone || ex.phone || '', link: v.link || ex.link || '', kakao: v.kakao || ex.kakao || '', cat: ex.cat && ex.cat !== '기타' ? ex.cat : v.cat || ex.cat || '기타', memo: [ex.memo, v.memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' / ').slice(0, 200), prices });
}
export async function reject(d) { await db.patch(d.id, { status: 'rejected' }); }
export async function changeKind(d, kind) {
  brain.learnKind(d.source || d.data.title || '', kind); await saveLearned();
  const re = brain.interpret(`${KINDS[kind]?.label || kind}: ${d.source || d.data.title}`)[0];
  return db.patch(d.id, { kind, data: re?.data || d.data });
}
export async function saveLearned() { await db.kvSet('brain:learned', brain.getLearned()); }
export async function loadLearned() { brain.setLearned(await db.kvGet('brain:learned', null)); }

// 바로 저장 (하진이 직접 입력한 건 확정)
export async function commit(kind, data) {
  const k = KINDS[kind];
  const payload = { ...data };
  if (kind === 'idea') payload.type = 'idea';
  if (kind === 'task' && payload.done === undefined) payload.done = false;
  return db.put(k.col, await teamify(kind, payload));
}

// 자주 쓰는 조회
export async function projects() {
  const ps = await db.list('projects');
  return ps.map(p => p.name).filter(Boolean);
}
export async function eventsOn(date) {
  const evs = await db.list('events');
  return evs.filter(e => e.date === date || repeatsOn(e, date)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}
export function repeatsOn(e, date) {
  if (e.endDate && date > e.date && date <= e.endDate) return true; // 여러 날 이어지는 일정
  if (!e.repeat || date < e.date) return false;
  if (e.until && date > e.until) return false;
  const a = new Date(e.date), b = new Date(date);
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekly') return a.getDay() === b.getDay();
  if (e.repeat === 'monthly') return a.getDate() === b.getDate();
  if (e.repeat === 'weekdays') return b.getDay() > 0 && b.getDay() < 6;
  return false;
}
export async function openTasks() { const mine = await mineFilter(); return (await db.list('tasks')).filter(t => !t.done && mine(t)); }

// ── 팀 ──
// 팀 공간에서 받은 할 일 중 내 것(담당 없음·나)만 내 목록에. 나머지는 할 일 → 팀 보기에서.
const given = n => (n || '').replace(/\s/g, '').replace(/(님|씨)$/, '');
export const sameName = (a, b) => { a = given(a); b = given(b); if (!a || !b) return false; return a === b || (a.length === 3 && a.slice(1) === b) || (b.length === 3 && b.slice(1) === a); };
export async function myNames() {
  const m = await db.kvGet('me:member', null);
  return [await db.kvGet('name', '하진'), m?.name, '나'].filter(Boolean);
}
export async function mineFilter() {
  const names = await myNames();
  return t => !t.team || !t.who || names.some(n => sameName(n, t.who));
}
export async function teammateNames() {
  const sp = await db.kvGet('sync:spaces', []);
  const mine = await myNames();
  const roster = (await db.kvGet('sync:roster', [])).map(m => m.name);
  return [...new Set([...sp.flatMap(s => s.members.map(m => m.name)), ...roster])].filter(n => !mine.some(x => sameName(x, n)));
}
// 팀원에게 맡긴 할 일은 자동으로 팀에 공유 (로그인해서 기본 팀이 있을 때)
async function teamify(kind, payload) {
  if (!(await db.get('team-main'))) return payload;
  if (kind === 'task' && payload.who && !payload.team && (await teammateNames()).some(n => sameName(n, payload.who))) payload.team = 'team-main';
  if (payload.team && !payload.by) payload.by = await db.kvGet('name', '하진');
  return payload;
}

// 연락 주기 지난 사람
export async function peopleToReach() {
  const cs = await db.list('contacts');
  const today = new Date();
  return cs.filter(c => c.cadence && c.cadence > 0).map(c => {
    const last = c.lastContact ? new Date(c.lastContact) : new Date(c.createdAt);
    const days = Math.floor((today - last) / 864e5);
    return { ...c, overdue: days - c.cadence };
  }).filter(c => c.overdue >= 0).sort((a, b) => b.overdue - a.overdue);
}
export async function upcomingBirthdays(days = 14) {
  const cs = await db.list('contacts');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return cs.filter(c => c.birthday).map(c => {
    const [, m, d] = c.birthday.split('-').map(Number);
    let n = new Date(t.getFullYear(), m - 1, d);
    if (n < t) n.setFullYear(n.getFullYear() + 1);
    return { ...c, inDays: Math.round((n - t) / 864e5) };
  }).filter(c => c.inDays <= days).sort((a, b) => a.inDays - b.inDays);
}

// 전체 검색용 문서
export async function corpus() {
  const out = [];
  const add = (col, route, f) => db.list(col).then(xs => xs.forEach(x => out.push({ id: x.id, col, route, title: f(x).title, text: f(x).text, item: x })));
  await Promise.all([
    add('notes', 'plan', x => ({ title: x.title, text: `${x.title} ${x.body || ''} ${(x.tags || []).join(' ')}` })),
    add('refs', 'plan', x => ({ title: x.title, text: `${x.title} ${x.memo || ''} ${(x.tags || []).join(' ')}` })),
    add('meetings', 'meetings', x => ({ title: x.title, text: `${x.title} ${x.transcript || ''} ${x.notes || ''}` })),
    add('tasks', 'tasks', x => ({ title: x.title, text: `${x.title} ${x.memo || ''} ${x.project || ''}` })),
    add('events', 'calendar', x => ({ title: x.title, text: `${x.title} ${x.place || ''} ${x.memo || ''}` })),
    add('contacts', 'people', x => ({ title: x.name, text: `${x.name} ${x.org || ''} ${x.role || ''} ${x.memo || ''} ${(x.tags || []).join(' ')}` })),
    add('expenses', 'money', x => ({ title: x.title, text: `${x.title} ${x.category} ${x.project || ''}` })),
    add('sns', 'studio', x => ({ title: x.title, text: `${x.title} ${x.caption || ''}` })),
  ]);
  return out;
}

// 빈 시간 찾기 (Motion·Reclaim 방식: 할 일을 빈 시간에 배치)
export async function freeSlots(date, { from = '09:00', to = '22:00', minMins = 30 } = {}) {
  const evs = (await eventsOn(date)).filter(e => e.start);
  const toM = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const busy = evs.map(e => [toM(e.start), toM(e.end || addMins(e.start, 60))]).sort((a, b) => a[0] - b[0]);
  const slots = []; let cur = toM(from);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  if (date === ymdLocal(new Date())) cur = Math.max(cur, Math.ceil(nowM / 15) * 15);
  for (const [s, e] of busy) { if (s - cur >= minMins) slots.push([cur, s]); cur = Math.max(cur, e); }
  if (toM(to) - cur >= minMins) slots.push([cur, toM(to)]);
  const f = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return slots.map(([a, b]) => ({ start: f(a), end: f(b), mins: b - a }));
}
export function addMins(t, n) { const [h, m] = t.split(':').map(Number); const x = Math.min(23 * 60 + 59, h * 60 + m + n); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }
const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 오류 기록 (자가 점검용)
export async function logError(err, where = '') {
  try {
    const list = await db.kvGet('errors', []);
    list.unshift({ at: db.now(), where, msg: String(err?.message || err), stack: String(err?.stack || '').slice(0, 800) });
    await db.kvSet('errors', list.slice(0, 100));
  } catch { }
}

// 동시 작업: 고치는 창을 연 뒤 다른 사람(다른 기기)이 먼저 고쳤으면 알려 줌. 현업 도구들처럼 "마지막에 저장한 사람 기준 + 고친 기록 남김"
export async function changedSince(opened) {
  if (!opened?.id) return null; const cur = await db.get(opened.id);
  if (!cur || cur.updatedAt === opened.updatedAt) return null;
  const diff = Object.keys(cur).filter(k => !['updatedAt', 'dirty', 'rev', 'auto'].includes(k) && JSON.stringify(cur[k]) !== JSON.stringify(opened[k]));
  return diff.length ? { cur, diff } : null;
}
// 인수인계: 담당은 늘 한 사람. 넘길 때 한 줄 메모를 남기고, 누가 누구에게 넘겼는지 기록이 쌓임
export async function handoff(task, to, note = '') {
  const from = task.who || (await db.kvGet('name', '')) || '나';
  const log = [...(task.handoffs || []), { from, to, note, at: new Date().toISOString() }];
  const t = await db.put('tasks', { ...task, who: to, handoffs: log });
  try { const sync = await import('./sync.js'); const r = (await db.kvGet('sync:roster', [])).find(m => m.name === to); if (r?.id && await sync.me()) await sync.dmSend(r.id, `[인수인계] “${task.title}”을 넘겨받았어요.${note ? ' 메모: ' + note : ''}${task.due ? ' (마감 ' + task.due.slice(5).replace('-', '/') + ')' : ''}`); } catch { }
  return t;
}
