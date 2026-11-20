// 말로 "이미 있는 것"을 고치기: 완료 처리, 일정 옮기기, 마감 바꾸기, 취소, 넘기기, 담당 정하기, 새 프로젝트, 프로젝트 지우기·이름·상태
// 하나로 분명히 짚이면 바로 하고 "되돌리기"를 붙임. 여럿이면 어느 건지 되물음. 지우기는 항상 한 번 확인
import * as db from './db.js';
import * as brain from './brain.js';
import { handoff, teammateNames, approve, reject, occursOn, renameProject } from './store.js';

const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const WHENTOK = /^(오늘|내일|모레|글피|어제|이번\s*주|다음\s*주|다다음\s*주|이번주|다음주|담주|주말|평일|오전|오후|아침|점심|저녁|밤|새벽|정오|자정|반|[월화수목금토일]요일|[월화수목금토일]욜|\d{1,2}월|\d{1,2}일|\d{1,2}\/\d{1,2}|\d{1,2}시(\s*반)?|\d{1,2}분|\d{1,2}:\d{2}|\d+일\s*(뒤|후)|\d+주\s*(뒤|후)|한\s*시간|\d+시간)(에|까지|부터|쯤|경)?$/;
const STOP = /^(일정|약속|할일|할\s*일|일|거|것|그|저|이|좀|그거|건|마감|담당|업무|작업)$/;
const euro = s => { const c = String(s || '').trim().slice(-1).charCodeAt(0); const j = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0; return j && j !== 8 ? '으로' : '로'; };   /* 받침 있으면 으로 (ㄹ받침은 로) */
const eul = s => { const c = String(s || '').trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? ((c - 0xAC00) % 28 ? '을' : '를') : '을'; };   /* 받침 있으면 을, 없으면 를 */
const josa = s => s.replace(/(은|는|이|가|을|를|의|도|만|에|에서|이랑|랑|하고|으로|로)$/, m => (s.length - m.length >= 2 ? '' : m));
const toks = s => s.split(/[\s,·]+/).map(x => josa(x.trim())).filter(x => x && !STOP.test(x) && !WHENTOK.test(x));
const fmtD = d => { const x = new Date(d + 'T00:00'); return `${x.getMonth() + 1}/${x.getDate()}(${'일월화수목금토'[x.getDay()]})`; };

// 제목이 얼마나 맞는지 0~1. 말한 낱말이 제목에 얼마나 들어 있나
function score(q, title) {
  const qs = toks(q), t = (title || '').replace(/\s/g, ''); if (!qs.length || !t) return 0;
  let hit = 0, len = 0; for (const w of qs) { len += w.length; if (t.includes(w.replace(/\s/g, ''))) hit += w.length; else if (w.length >= 3 && t.includes(w.slice(0, -1))) hit += w.length - 1; }
  return hit / len;
}
async function pool(kinds) {
  const t = today(); const out = [];
  if (kinds.includes('task')) for (const x of await db.list('tasks')) if (!x.done) out.push({ kind: 'task', it: x });
  if (kinds.includes('event')) for (const x of await db.list('events')) if (!x.date || x.date >= t || x.repeat) out.push({ kind: 'event', it: x });
  // 아직 확정 전인 임시 항목도 말로 고칠 수 있게
  for (const d of await db.list('drafts')) if (d.status === 'pending' && kinds.includes(d.kind) && d.data && d.data.title) out.push({ kind: d.kind, it: { ...d.data, id: d.id, col: 'drafts', _draft: true } });
  return out;
}
// 말에 나온 날짜가 있으면 그 날 것을 우선
async function find(q, kinds, { date } = {}) {
  let cs = (await pool(kinds)).map(c => ({ ...c, s: score(q, c.it.title) + (date && (c.it.date === date || c.it.due === date) ? 0.3 : 0) }));
  if (!toks(q).length && date) cs = cs.filter(c => c.it.date === date || c.it.due === date).map(c => ({ ...c, s: 0.7 }));
  cs = cs.filter(c => c.s >= 0.6).sort((a, b) => b.s - a.s || (a.it.date || a.it.due || '9').localeCompare(b.it.date || b.it.due || '9'));
  if (!cs.length) return { none: true };
  if (cs.length === 1 || cs[0].s - cs[1].s >= 0.2) return { one: cs[0] };
  return { many: cs.slice(0, 4) };
}
// 지출·받을 돈에서 말에 맞는 것 찾기 (금액을 말했으면 금액도 맞아야 함)
async function money(q, cols) {
  const amt = brain.parseMoney(q); const words = q.replace(new RegExp(brain.MONEY_SRC, 'g'), ' ').replace(/[\d,]+\s*원/g, ' ');
  const out = []; for (const col of cols) for (const x of await db.list(col)) { const s = toks(words).length ? score(words, `${x.title || ''} ${x.project || ''}`) : (amt != null ? 0.7 : 0); if (s >= 0.6 && (amt == null || Number(x.amount) === amt)) out.push({ ...x, _s: s }); }
  return out.sort((a, b) => b._s - a._s || (b.date || '').localeCompare(a.date || ''));
}
const label = c => (c.it._draft ? '(확인 전) ' : '') + (c.kind === 'event' ? `${c.it.title} · ${c.it.date ? fmtD(c.it.date) : ''}${c.it.start ? ' ' + c.it.start : ''}` : `${c.it.title}${c.it.due ? ' · 마감 ' + fmtD(c.it.due) : ''}${c.it.who ? ' · ' + c.it.who : ''}`);
const ask = (cs, act, lead) => ({ text: `${lead} 어느 건가요?`, chips: [...cs.map(c => ({ label: label(c).slice(0, 34), act: { ...act, id: c.it.id } })), { label: '아니에요', skip: true }] });
const undo = prev => ({ label: '되돌리기', act: { op: 'restore', prev } });

// 실제로 바꾸는 곳. chips의 act도 여기로 옴
export async function run(a) {
  const it = a.id ? await db.get(a.id) : null;
  if (a.op === 'unproj') { for (const id of a.ids || []) { const x = await db.get(id); if (!x) continue; if (x.col === 'drafts') await db.patch(id, { data: { ...x.data, project: '' } }); else await db.patch(id, { project: '' }); } return { text: '프로젝트에서 뺐어요.', refresh: a.ids || [] }; }
  if (a.op === 'projRename') { const r = await renameProject(a.id, a.to); if (!r.old) return { text: '그 사이에 없어졌어요.' }; const g = r.guests || []; const todo = Array.isArray(g) ? [] : (g.todo || []);
    return { text: `“${r.old}” 프로젝트 이름을 “${a.to}”${euro(a.to)} 바꿨어요.${r.n ? ` 묶여 있던 ${r.n}개도 새 이름으로 옮겼어요.` : ''}${todo.length ? ` 단기 작업자 ${todo.join(', ')} 님에게 맡긴 프로젝트는 관리자 › 멤버에서 다시 골라 주세요.` : ''}`, chips: a.back ? [] : [{ label: '되돌리기', act: { op: 'projRename', id: a.id, to: r.old, back: true } }] }; }
  if (a.op === 'restore') { await db.put(a.prev.col, { ...a.prev, deleted: false }); return { text: `“${a.prev.title || a.prev.name}” 원래대로 돌려놨어요.` }; }
  if (!it || it.deleted) return { text: '그 사이에 없어졌어요.' };
  const prev = { ...it };
  if (it.col === 'drafts') return runDraft(a, it, prev);
  const nextOn = () => { const t0 = new Date(today() + 'T00:00'); for (let k = 0; k < 62; k++) { const d = new Date(t0); d.setDate(d.getDate() + k); const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (occursOn(it, ds)) return ds; } return it.date; };
  if (a.op === 'moveOnce' || a.op === 'skipOnce') { // 반복 일정에서 한 번만 옮기거나 빼기
    const from = a.from || nextOn(); await db.patch(it.id, { skip: [...new Set([...(it.skip || []), from])] });
    if (a.op === 'skipOnce') return { text: `“${it.title}” ${fmtD(from)} 것만 뺐어요. 다른 날은 그대로예요.`, chips: [undo(prev)] };
    const { id, createdAt, updatedAt, repeat, until, skip, gcalId, ...rest } = it; const start = a.time || it.start || ''; let end = it.end || '';
    if (a.time && it.start && it.end) { const mm = s => +s.slice(0, 2) * 60 + +s.slice(3); const e = Math.min(1439, mm(a.time) + Math.max(15, mm(it.end) - mm(it.start))); end = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; }
    const one = await db.put('events', { ...rest, repeat: '', date: a.date || from, start, end });
    return { text: `“${it.title}” ${fmtD(from)} 것만 ${fmtD(one.date)}${start ? ' ' + start : ''}로 옮겼어요. 다른 날은 그대로예요.`, chips: [undo(prev), { label: '옮긴 것 지우기', act: { op: 'remove', id: one.id } }] }; }
  if (a.op === 'shift') { const addMin = (t, n) => { const [h, m] = t.split(':').map(Number); const v = Math.max(0, Math.min(1439, h * 60 + m + n)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; }; const addDay = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const isT = it.col === 'tasks';
    if (a.mins != null) { const base = isT ? it.time : it.start; if (!base) return { text: `“${it.title}”에는 시간이 없어서 옮길 수 없어요. 몇 시로 할지 알려 주세요.` }; const f = isT ? { time: addMin(it.time, a.mins) } : { start: addMin(it.start, a.mins), ...(it.end ? { end: addMin(it.end, a.mins) } : {}) }; await db.patch(it.id, f); return { text: `“${it.title}” 시간을 ${f.time || f.start}(으)로 옮겼어요.`, chips: [undo(prev)] }; }
    const key = isT ? 'due' : 'date'; if (!it[key]) return { text: `“${it.title}”에는 날짜가 없어서 옮길 수 없어요.` }; const f = { [key]: addDay(it[key], a.days), ...(it.endDate ? { endDate: addDay(it.endDate, a.days) } : {}) }; await db.patch(it.id, f); return { text: `“${it.title}”${isT ? ' 마감' : ''}을 ${fmtD(f[key])}로 옮겼어요.`, chips: [undo(prev)] }; }
  if (a.op === 'done') { await db.patch(it.id, { done: true, doneAt: db.now() }); const left = (await db.list('tasks')).filter(x => !x.done).length; return { text: `“${it.title}” 완료로 넘겼어요. 수고했어요! 남은 할 일은 ${left}개예요.`, chips: [undo(prev)] }; }
  if (a.op === 'move') {
    if (it.col === 'tasks') { const due = a.date || it.due || today(); await db.patch(it.id, { due, time: a.time || it.time || '' }); return { text: `“${it.title}” 마감을 ${fmtD(due)}${a.time ? ' ' + a.time : ''}로 바꿨어요.`, chips: [undo(prev)] }; }
    const p = { date: a.date || it.date };
    if (a.time) { p.start = a.time; if (it.start && it.end) { const m = s => +s.slice(0, 2) * 60 + +s.slice(3); const e = (m(a.time) + Math.max(15, m(it.end) - m(it.start))) % 1440; p.end = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; } }
    await db.patch(it.id, p); const clash = (await db.list('events')).filter(x => x.id !== it.id && x.date === p.date && x.start && (p.start || it.start) && x.start === (p.start || it.start));
    return { text: `“${it.title}”${eul(it.title)} ${fmtD(p.date)}${p.start || it.start ? ' ' + (p.start || it.start) : ''}로 옮겼어요.${clash.length ? ` 그런데 그 시간에 “${clash[0].title}”도 있어요.` : ''}${it.who ? ` ${it.who}에게도 알려 주세요.` : ''}`, chips: [undo(prev)] };
  }
  if (a.op === 'projStatus') { await db.patch(it.id, { status: a.v }); return { text: `“${it.name}” 프로젝트를 ${a.v}${euro(a.v)} 바꿨어요.`, chips: [undo(prev)] }; }
  if (a.op === 'remove') { await db.remove(it.id); return { text: `“${it.title || it.name}” 지웠어요.`, chips: [undo(prev)] }; }
  if (a.op === 'got') { await db.patch(it.id, { status: 'got', gotAt: today(), ...(it.date && it.date !== today() ? { date: today(), planned: it.date } : {}) }); const left = (await db.list('incomes')).filter(x => x.status !== 'got'); return { text: `“${it.title}” ${Number(it.amount || 0).toLocaleString()}원 받은 것으로 바꿨어요.${left.length ? ` 아직 받을 돈은 ${left.reduce((s, x) => s + (Number(x.amount) || 0), 0).toLocaleString()}원(${left.length}건)이에요.` : ' 이제 받을 돈이 없어요.'}`, chips: [undo(prev)] }; }
  if (a.op === 'handoff') { await handoff(it, a.to, a.note || ''); return { text: `“${it.title}”${eul(it.title)} ${a.to} 님에게 넘겼어요.${a.note ? ` 메모: ${a.note}` : ''} 넘긴 기록은 할 일을 열면 보여요.`, chips: [undo(prev)] }; }
  if (a.op === 'assign') { await db.patch(it.id, { who: a.to }); return { text: `“${it.title}” 담당을 ${a.to} 님으로 했어요.`, chips: [undo(prev)] }; }
  if (a.op === 'prio') { await db.patch(it.id, { priority: a.v }); return { text: `“${it.title}”${eul(it.title)} ${a.v === 'high' ? '중요로' : '보통으로'} 표시했어요.`, chips: [undo(prev)] }; }
  if (a.op === 'place') { await db.patch(it.id, { place: a.v }); return { text: `“${it.title}” 장소를 ${a.v}${euro(a.v)} 바꿨어요.`, chips: [undo(prev)] }; }
  return null;
}

// 아직 확정 전인 임시 항목을 말로 고칠 때
async function runDraft(a, d, prev) {
  const cur = d.data || {}; const save = f => db.patch(d.id, { data: { ...cur, ...f } }); const ttl = cur.title || cur.name || '임시 항목';
  if (a.op === 'done') { const saved = await approve(d); if (saved) await db.patch(saved.id, { done: true, doneAt: db.now() }); return { text: `“${ttl}” 확정하고 완료로 넘겼어요.` }; }
  if (a.op === 'remove' || a.op === 'skipOnce') { await reject(d); return { text: `“${ttl}” 버렸어요.`, chips: [undo(prev)] }; }
  if (a.op === 'move' || a.op === 'moveOnce') { const f = d.kind === 'task' ? { due: a.date || cur.due || today(), ...(a.time ? { time: a.time } : {}) } : { date: a.date || cur.date || today(), ...(a.time ? { start: a.time } : {}) }; await save(f); return { text: `“${ttl}”${eul(ttl)} ${fmtD(f.due || f.date)}${a.time ? ' ' + a.time : ''}로 바꿨어요. 아직 확인 전이에요.`, chips: [undo(prev)], refresh: [d.id] }; }
  if (a.op === 'assign' || a.op === 'handoff') { await save({ who: a.to }); return { text: `“${ttl}” 담당을 ${a.to} 님으로 했어요. 아직 확인 전이에요.`, chips: [undo(prev)], refresh: [d.id] }; }
  if (a.op === 'prio') { await save({ priority: a.v }); return { text: `“${ttl}”${eul(ttl)} 중요로 표시했어요.`, chips: [undo(prev)], refresh: [d.id] }; }
  if (a.op === 'place') { await save({ place: a.v }); return { text: `“${ttl}” 장소를 ${a.v}${euro(a.v)} 바꿨어요. 아직 확인 전이에요.`, chips: [undo(prev)], refresh: [d.id] }; }
  return { text: '확인 전인 항목이라 대기함에서 고쳐 주세요.' };
}

// 말에서 고치기 명령을 알아봄. 해당 없으면 null (→ 평소처럼 새로 만들기·대화로 넘어감)
// 프로젝트를 말로: 지우기(항상 확인)·이름 바꾸기·상태 바꾸기. 만들기는 tryAct에 있음. 프로젝트 이야기가 아니면 null
const pkey = s => String(s || '').replace(/\s/g, '').toLowerCase();
async function findProj(q) { const ps = await db.list('projects'); const k = pkey(String(q || '').replace(/\s*프로젝트$/, '').replace(/^(그|이|저)\s+/, '')); if (!k) return []; const ex = ps.filter(p => pkey(p.name) === k); if (ex.length) return ex; return ps.filter(p => pkey(p.name).includes(k) || brain.projAliases(p.name).some(a => pkey(a) === k)); }
const PSTAT = [[/^(완료|끝|끝남|종료|마감|마무리)$/, '완료'], [/^(보류|홀드|중단|멈춤|대기)$/, '보류'], [/^(진행|진행\s*중|재개|다시\s*진행)$/, '진행'], [/^(준비|준비\s*중)$/, '준비']];
export async function tryProject(text) {
  const t = String(text || '').trim().replace(/[.!~]+$/, ''); if (!/프로젝트/.test(t) || t.length < 6 || t.length > 70 || /\n/.test(t) || /[?？]$/.test(t)) return null; let m;
  const none = q => ({ text: `“${q}” 프로젝트를 못 찾았어요.`, chips: [{ label: '프로젝트 열기', go: 'plan/projects' }] });
  const which = (ps, verb, say) => ({ text: `어느 프로젝트를 ${verb}?`, chips: [...ps.slice(0, 4).map(p => ({ label: p.name.slice(0, 18), say: say(p) })), { label: '아니에요', skip: true }] });
  // 이름·상태 바꾸기: "루미에 프로젝트 이름 루미에 팝업으로 바꿔줘", "프로젝트 루미에를 보류로 바꿔줘"
  const CH = '(?:바꿔|바꾸|변경|고쳐|수정)\\S*(?:\\s*(?:줘|주세요|줄래))?', NAMEW = '(?:\\s*(?:의\\s*)?(?:이름|명|상태)\\s*(?:을|를|은|는)?)', PART = '(?:을|를|은|는)';
  m = t.match(new RegExp(`^(.{1,30}?)\\s*프로젝트(${NAMEW}|${PART})?\\s+(.{1,30}?)\\s*(?:으로|로)\\s*(이름\\s*)?${CH}$`)) || t.match(new RegExp(`^프로젝트\\s+(.{1,30}?)(${NAMEW}|${PART})\\s+(.{1,30}?)\\s*(?:으로|로)\\s*(이름\\s*)?${CH}$`));
  if (m) { const to = m[3].replace(/\s*프로젝트$/, '').trim(); const st = PSTAT.find(([re]) => re.test(to)); const named = /이름|명|상태/.test(m[2] || '') || !!m[4];
    /* "이름"이라는 말이 없으면 프로젝트 안의 일정·할 일을 옮기는 말일 수 있음("루미에 프로젝트 회의 4시로 바꿔줘", "… 마감 금요일로", "… 담당 민서로") → 이름 바꾸기로 읽지 않고 넘김 */
    if (!st && !named && (!m[2] || brain.parseWhen(to).hits.length || /^(담당|마감|장소|일정|회의|미팅|시간|날짜|색)/.test(to) || /\d\s*(시|분|일|월|주)/.test(to) || (await teammateNames()).some(n => to === n || to === n.slice(1)))) m = null; }
  if (m) { const ps = await findProj(m[1]); const to = m[3].replace(/\s*프로젝트$/, '').trim(); const st = PSTAT.find(([re]) => re.test(to));
    if (!ps.length) return none(m[1].trim()); if (ps.length > 1) return which(ps, '바꿀까요', p => `${p.name} 프로젝트 ${st ? '' : '이름 '}${to}${euro(to)} 바꿔줘`);
    if (st) return run({ op: 'projStatus', id: ps[0].id, v: st[1] });
    if (!to) return null; if ((await db.list('projects')).some(p => p.id !== ps[0].id && pkey(p.name) === pkey(to))) return { text: `“${to}” 프로젝트는 이미 있어요. 다른 이름으로 해 주세요.` };
    return run({ op: 'projRename', id: ps[0].id, to }); }
  // 상태: "루미에 프로젝트 끝났어", "루미에 프로젝트 보류해줘"
  if ((m = t.match(/^(.{1,30}?)\s*프로젝트\s*(?:는|은|가|이|를|을|도)?\s*(?:이제\s*|다\s*)?(끝났|끝남|끝냈|완료|종료|마무리|보류|홀드|중단|재개|다시\s*진행)\S*(?:\s*(?:해\s*줘|해줘|줘|주세요|됐어|됐대|했어|됨))?$/))) {
    const ps = await findProj(m[1]); const v = /^(보류|홀드|중단)/.test(m[2]) ? '보류' : /^(재개|다시)/.test(m[2]) ? '진행' : '완료';
    if (!ps.length) return none(m[1].trim()); if (ps.length > 1) return which(ps, '바꿀까요', p => `${p.name} 프로젝트 ${v}${euro(v)} 바꿔줘`);
    if (ps[0].status === v) return { text: `“${ps[0].name}” 프로젝트는 이미 ${v}${v === '진행' ? '이에요' : '예요'}.` };
    return run({ op: 'projStatus', id: ps[0].id, v }); }
  // 지우기 (항상 확인): "루미에 프로젝트 지워줘", "프로젝트 루미에 삭제"
  if ((m = t.match(/^(.{1,30}?)\s*프로젝트\s*(?:는|은|를|을|도)?\s*(?:이제\s*|그냥\s*)?(?:지워|지우|삭제|없애|없앨)\S*(?:\s*(?:줘|주세요|해줘|해 줘|줄래))?$/)) || (m = t.match(/^프로젝트\s+(.{1,30}?)\s*(?:는|은|를|을)?\s*(?:지워|지우|삭제|없애|없앨)\S*(?:\s*(?:줘|주세요|해줘|해 줘|줄래))?$/))) {
    const ps = await findProj(m[1]); if (!ps.length) return none(m[1].trim()); if (ps.length > 1) return which(ps, '지울까요', p => `${p.name} 프로젝트 지워줘`);
    const p = ps[0]; let n = 0; for (const it of await db.allItems()) if (!it.deleted && it.col !== '_kv' && it.id !== p.id && (it.project === p.name || (it.col === 'drafts' && it.data && it.data.project === p.name))) n++;
    return { text: `“${p.name}” 프로젝트를 지울까요?${n ? ` 이 이름으로 묶어 둔 ${n}개는 지워지지 않고 그대로 남아요.` : ''}`, chips: [{ label: '지우기', act: { op: 'remove', id: p.id } }, { label: '끝난 걸로만', act: { op: 'projStatus', id: p.id, v: '완료' } }, { label: '그냥 두기', skip: true }] }; }
  return null;
}

export async function tryAct(text, { people = [] } = {}) {
  let t = text.trim().replace(/[.!~]+$/, ''); if (t.length < 4 || t.length > 90 || /\n/.test(t)) return null;
  const names = [...new Set([...people, ...(await teammateNames())].filter(Boolean))];
  const who = s => names.find(n => s === n || s === n.slice(1) || s.replace(/(이|님|씨)$/, '') === n || s.replace(/(이|님|씨)$/, '') === n.slice(1));
  let m;
  // "견적서 확정해줘", "그거 확정", "전부 확정해줘", "방금 거 버려줘" → 대기함의 임시 항목을 말로 확정·버리기
  if ((m = t.match(/^(.*?)\s*(확정|승인|버려|버리기|버림)\s*(해|하자|할게|해\s*줘|해\s*주세요|해\s*둬|줘|주세요)?$/)) && !/(?:^|\s)(왜|안|못|언제|어디)\s*$/.test(m[1]) && !/(됐|됨|됐어|했)/.test(t.slice(-3))) {
    const drop = /^버/.test(m[2]); const pend = (await db.list('drafts')).filter(d => d.status === 'pending' && d.kind !== 'summary').sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
    const subj = m[1].replace(/(을|를|은|는|이|가|도|좀)$/, '').trim(); const key = x => String(x || '').replace(/\s/g, '');
    const asked = !!m[3] && /줘|주세요|둬/.test(m[3]);   /* "해줘"처럼 시키는 말일 때만 못 찾았다고 답하고, 아니면 새로 적는 말일 수 있으니 넘김 */
    if (!pend.length) return asked ? { text: `대기함에 ${drop ? '버릴' : '확정할'} 임시 항목이 없어요.` } : null;
    let hit;
    if (/^(전부|다|모두|싹|전체|모든\s*거|대기함)\s*(다|전부)?$/.test(subj)) hit = pend;
    else if (!subj || /^(그거|이거|저거|그것|이것|방금\s*(거|것|건)?|아까\s*(거|것|건)?|위에\s*(거|것))$/.test(subj)) { const l = await db.kvGet('chat:last', null); hit = pend.filter(d => l && (l.ids || []).includes(d.id)); if (!hit.length) hit = pend.slice(0, 1); }
    else { const ws = toks(subj).map(key); hit = pend.filter(d => key(d.data.title || d.data.name).includes(key(subj))); if (!hit.length && ws.length) hit = pend.filter(d => ws.every(w => key(d.data.title || d.data.name).includes(w))); }
    if (!hit.length && !asked) return null;
    if (!hit.length) return { text: `대기함에서 “${subj}”${/[가-힣]$/.test(subj) && (subj.charCodeAt(subj.length - 1) - 0xac00) % 28 ? '이' : '가'} 들어간 임시 항목을 못 찾았어요. 지금 대기함에는 ${pend.slice(0, 3).map(d => '“' + (d.data.title || d.data.name) + '”').join(', ')}${pend.length > 3 ? ` 외 ${pend.length - 3}개` : ''}가 있어요.` };
    if (hit.length > 1 && hit.length < pend.length && !/^(전부|다|모두|싹)/.test(subj) && subj && !/^(그거|이거|방금|아까)/.test(subj)) return { text: `“${subj}”에 맞는 임시 항목이 ${hit.length}개예요. 어느 걸 ${drop ? '버릴까요' : '확정할까요'}?`, chips: hit.slice(0, 4).map(d => ({ label: (d.data.title || d.data.name || '').slice(0, 16), say: `${d.data.title || d.data.name} ${drop ? '버려줘' : '확정해줘'}` })) };
    const done = [];
    for (const d of hit) { if (drop) { await reject(d); done.push(`“${d.data.title || d.data.name}”`); continue; }
      const saved = await approve(d); let at = ''; try { if (saved) at = (await (await import('./where.js')).placeOf(d.kind, saved)).where; } catch { } done.push(`“${d.data.title || d.data.name}”${at ? ' (' + at + ')' : ''}`); }
    return { text: drop ? `${done.join(', ')} 버렸어요.` : `${done.join(', ')} 확정했어요.${hit.length === 1 ? '' : ` 모두 ${hit.length}개예요.`}`, refresh: hit.map(d => d.id) };
  }

  // 새 프로젝트
  if ((m = t.match(/^(?:새\s*)?프로젝트\s*(?:추가|생성|등록)?\s*[:：]?\s*(.{2,30}?)\s*(?:추가|생성|등록|만들어|시작)?(?:해\s*줘|해줘|줘|할게|해|하자)?$/)) && /(새|추가|생성|등록|만들|시작|[:：])/.test(t) && !/(회의|일정|마감|까지)/.test(t)) {
    const name = m[1].replace(/\s*(프로젝트|을|를)$/, '').trim(); if (!name) return null;
    if ((await db.list('projects')).some(p => p.name === name)) return { text: `“${name}” 프로젝트는 이미 있어요.` };
    const { colorFor } = await import('./ui.js'); const p = await db.put('projects', { name, status: '진행', color: colorFor(name), team: (await db.get('team-main')) ? 'team-main' : '' });
    return { text: `“${name}” 프로젝트를 만들었어요. 이제 할 일·일정·레퍼런스를 이 이름으로 묶을 수 있어요.`, chips: [{ label: '되돌리기', act: { op: 'remove', id: p.id } }] };
  }

  if ((m = t.match(/^(.{2,30}?)\s*프로젝트\s*(?:를|을)?\s*(?:새로\s*)?(?:추가|생성|등록|만들어|만들|시작|파)\S*(?:\s*(?:줘|주세요|줄래))?$/)) && !/(회의|일정|마감|까지|할\s*일)/.test(m[1])) {
    const name = m[1].replace(/^(새|새로운)\s+/, '').trim();
    if ((await db.list('projects')).some(p => p.name === name)) return { text: `“${name}” 프로젝트는 이미 있어요.` };
    const { colorFor } = await import('./ui.js'); const p = await db.put('projects', { name, status: '진행', color: colorFor(name), team: (await db.get('team-main')) ? 'team-main' : '' });
    return { text: `“${name}” 프로젝트를 만들었어요. 이제 할 일·일정·레퍼런스를 이 이름으로 묶을 수 있어요.`, chips: [{ label: '되돌리기', act: { op: 'remove', id: p.id } }] };
  }
  // 얼마만큼 미루기·당기기: "촬영 하루 미뤄졌어", "회의 30분 늦춰줘"
  if ((m = t.match(/^(.+?)\s+(?:(\d+|한|두|세)\s*(분|시간|일|주)|(하루|이틀|사흘|일주일|반\s*시간))\s*(?:씩|정도)?\s*(늦춰|늦어|늦게|미뤄|미루|밀렸|밀려|뒤로|연기|당겨|당기|앞으로|앞당|일찍|빨라)\S*(?:\s*(?:줘|주세요|됐어|됐대|됨))?$/))) {
    const n = m[4] ? { 하루: 1, 이틀: 2, 사흘: 3, 일주일: 7 }[m[4]] ?? 0.5 : ({ 한: 1, 두: 2, 세: 3 }[m[2]] ?? +m[2]); const unit = m[4] ? (/시간/.test(m[4]) ? '시간' : '일') : m[3]; const sign = /(당겨|당기|앞으로|앞당|일찍|빨라)/.test(m[5]) ? -1 : 1;
    const act = unit === '분' ? { op: 'shift', mins: sign * n } : unit === '시간' ? { op: 'shift', mins: sign * n * 60 } : { op: 'shift', days: sign * n * (unit === '주' ? 7 : 1) };
    const subj = m[1].replace(/\s*(일정|시간|날짜|마감)(을|를|은|는|이|가)?$/, ''); const sw = brain.parseWhen(subj); const r = await find(subj, ['event', 'task'], { date: sw.hits.length ? sw.date : null });
    if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, '옮길 게');
    if (!/^(방금|아까|그거|이거)/.test(subj)) return { text: `“${subj}”에 맞는 일정이나 할 일을 못 찾았어요. 이름을 조금 더 정확히 말해 주세요.` };
  }
  // 장소 바꾸기: "주간 회의 장소 성수로 바꿔줘"
  if ((m = t.match(/^(.+?)\s*(?:의\s*)?(?:장소|위치)(?:는|은|를|을)?\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|옮겨|수정|고쳐|해)\S*(?:\s*(?:줘|주세요))?$/))) { const r = await find(m[1], ['event']); const act = { op: 'place', v: m[2].trim() };
    if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, '장소를 바꿀 게'); }
  // 넘기기: "포스터 시안 민서한테 넘겨줘 (메모)"
  { const m2 = t.match(/^(\S{1,6}?)(?:이)?\s*(?:한테|에게|께)\s+(.+?)\s*(?:을|를|은|는)?\s*(?:넘겨|넘길|넘김|인계|토스)\S*(?:\s*(?:줘|주세요))?$/); if (m2 && who(m2[1]) && !/(한테|에게|께)/.test(m2[2])) t = `${m2[2]} ${m2[1]}한테 넘겨줘`; }   /* "민서한테 로고 시안 넘겨줘"처럼 사람을 먼저 말해도 */
  if ((m = t.match(/^(.+?)\s+(\S+?)\s*(?:한테|에게|께)\s*(?:넘겨|넘길|넘김|인계|토스)\S*\s*(.*)$/))) {
    const to = who(m[2]); if (to) { const r = await find(m[1], ['task']); const act = { op: 'handoff', to, note: m[3].replace(/^[,\s]+/, '') };
      if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, `${to} 님에게 넘길 일이`); return { text: `“${m[1]}”에 맞는 할 일을 못 찾았어요. ${to} 님 할 일로 새로 만들까요?`, chips: [{ label: '새 할 일로', say: `할 일: ${to} ${m[1]}` }, { label: '아니에요', skip: true }] }; }
  }
  // 담당: "포스터 시안 담당 서연" / "포스터 시안은 서연이가 맡아"
  if ((m = t.match(/^(.+?)\s*(?:은|는)?\s*담당(?:자)?(?:은|는|을|를)?\s*([가-힣A-Za-z]+?)(?:으로|로)?(?:\s+(?:해\s*줘|해줘|바꿔\s*줘|바꿔줘|지정\S*|변경\S*))?$/)) || (m = t.match(/^(.+?)(?:은|는)?\s+(\S+?)(?:이가|가|이)\s*(?:맡|담당|하기로|한대|한다고|할\s*거|할게)\S*(?:\s*(?:했\S*|함|했음))?$/))) {
    const to = who(m[2]); if (to) { const r = await find(m[1], ['task']); const act = { op: 'assign', to }; if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, `${to} 님이 맡을 일이`); }
  }
  // 옮기기·미루기·마감 바꾸기: "내일 미팅 4시로 옮겨줘", "포스터 시안 마감 금요일로 미뤄줘"
  if ((m = t.match(/^(.+?)(?:으로|로)\s*(?:옮겨|옮길|옮기|옮김|미뤄|미루|당겨|당기|바꿔|바꾸|바뀜|바뀌|변경|연기|밀렸|밀려|잡혔|확정)\S*(?:\s*(?:줘|주세요|줄래))?$/))) {
    const parts = m[1].split(/\s+/); const tail = []; while (parts.length > 1 && WHENTOK.test(parts.at(-1))) tail.unshift(parts.pop()); if (parts.length > 2 && parts.at(-1) === '주' && /^(다음|이번|다다음|지난)$/.test(parts.at(-2))) tail.unshift(parts.splice(-2).join(' '));   /* "… 다음 주 수요일로"의 "다음 주"도 때 */
    const nw = brain.parseWhen(tail.join(' ')); const subj = parts.join(' ').replace(/\s*(마감|일정|시간|날짜)(을|를|은|는)?$/, '');
    if (tail.length && (nw.date || nw.time)) { const sw = brain.parseWhen(subj); const due = /마감/.test(m[1]);
      const r = await find(subj, due ? ['task'] : ['event', 'task'], { date: sw.hits.length ? sw.date : null }); const act = { op: 'move', date: nw.hits.some(x => !/^\d{1,2}시|^\d{1,2}:\d|^오전|^오후|^반$/.test(x)) || !nw.time ? nw.date : null, time: nw.time || '' };
      if (r.one && r.one.it.repeat && !r.one.it._draft && !/(앞으로|계속|매주|매번|전부|다\s)/.test(t)) { const from = sw.hits.length && sw.date ? sw.date : null; return { text: `“${r.one.it.title}”은 반복 일정이에요. 이번 한 번만 옮길까요, 앞으로 계속 옮길까요?`, chips: [{ label: '이번만', act: { ...act, op: 'moveOnce', id: r.one.it.id, from } }, { label: '앞으로 계속', act: { ...act, id: r.one.it.id } }, { label: '그냥 두기', skip: true }] }; }
      if (r.one && act.date && /(미뤄|미루|연기|밀렸|밀려)/.test(t) && tail.every(x => /^[월화수목금토일](요일|욜)$/.test(x) || !/[월화수목금토일](요일|욜)/.test(x)) && !/(주|달|월|일$)/.test(tail.filter(x => !/(요일|욜)$/.test(x)).join('')) && tail.some(x => /(요일|욜)$/.test(x))) { const cur = r.one.it.due || r.one.it.date || ''; let d = new Date(act.date + 'T00:00'); let k = 0; const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; while (cur && f(d) <= cur && k++ < 8) d.setDate(d.getDate() + 7); act.date = f(d); } // 미루는 건 지금 날짜보다 뒤로
      if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, '옮길 게'); return { text: `“${subj.replace(/\s*(다다음\s*주|다음\s*주|이번\s*주|담주|오늘|내일|모레)\s*$/, '') || subj}”에 맞는 일정이나 할 일을 못 찾았어요. 새로 만들까요?`, chips: [{ label: '새 일정으로', say: `일정: ${subj} ${tail.join(' ')}` }, { label: '아니에요', skip: true }] }; }
  }
  // 취소·지우기 (항상 확인)
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를)?\s*(?:취소|지워|삭제|없애|빼)\S*(?:\s*(?:줘|주세요|해줘|해 줘|됐어|됐대|됨))?$/)) && !/(기억|별명|배운|취향)/.test(t)) {
    const sw = brain.parseWhen(m[1]); const r = await find(m[1].replace(/\s*(일정|약속|할\s*일)$/, ''), ['event', 'task'], { date: sw.hits.length ? sw.date : null });
    if (r.one && r.one.it.repeat && !r.one.it._draft) return { text: `“${r.one.it.title}”은 반복 일정이에요. 이번 것만 뺄까요, 전부 지울까요?`, chips: [{ label: '이번만 빼기', act: { op: 'skipOnce', id: r.one.it.id, from: sw.hits.length && sw.date ? sw.date : null } }, { label: '전부 지우기', act: { op: 'remove', id: r.one.it.id } }, { label: '그냥 두기', skip: true }] };
    if (r.one) return { text: `“${label(r.one)}” 이거 지울까요?`, chips: [{ label: '지우기', act: { op: 'remove', id: r.one.it.id } }, { label: '그냥 두기', skip: true }] };
    if (r.many) return ask(r.many, { op: 'remove' }, '지울 게');
    // 일정·할 일이 아니면 지출·받을 돈에서 찾음: "주차 2만원 지워줘"
    { const ms = await money(m[1], ['expenses', 'incomes']); const lab = x => `${x.title} ${Number(x.amount || 0).toLocaleString()}원${x.date ? ' · ' + fmtD(x.date) : ''}`;
      if (ms.length === 1) return { text: `${ms[0].col === 'incomes' ? '받을 돈' : '지출'} “${lab(ms[0])}” 이거 지울까요?`, chips: [{ label: '지우기', act: { op: 'remove', id: ms[0].id } }, { label: '그냥 두기', skip: true }] };
      if (ms.length > 1) return { text: '지울 게 어느 건가요?', chips: [...ms.slice(0, 4).map(x => ({ label: lab(x).slice(0, 34), act: { op: 'remove', id: x.id } })), { label: '아니에요', skip: true }] };
      if (brain.parseMoney(m[1]) != null) return { text: `“${m[1].trim()}”에 맞는 지출이나 받을 돈을 못 찾았어요. 비용 화면에서 직접 지울 수 있어요.`, chips: [{ label: '비용 화면 열기', go: 'money' }] }; }
  }
  // 입금 확인: "루미에 잔금 들어왔어", "제일기획 계약금 입금됐어" → 받기로 한 돈을 받은 것으로
  if ((m = t.match(/^(.+?)\s*(?:이|가|은|는|도)?\s*(?:오늘\s*)?(?:다\s*)?(?:들어왔|들어옴|입금\s*됐|입금\s*됨|입금\s*완료|입금\s*확인|받았|받음|수금했|수금함)\S*$/)) && !/(해야|까지|언제|\?|아직|(?<![가-힣\d])안\s|(?<![가-힣\d])못\s)/.test(t)) {
    const amt = brain.parseMoney(m[1]); const ms = (await money(m[1], ['incomes'])).filter(x => x.status !== 'got');
    if (ms.length === 1 || (ms.length > 1 && amt != null && ms.filter(x => Number(x.amount) === amt).length === 1)) { const x = amt != null ? (ms.find(y => Number(y.amount) === amt) || ms[0]) : ms[0];
      // 말한 낱말이 다 들어맞지 않으면("오로라 잔금"인데 있는 건 "오로라 계약금") 돈을 바로 받은 것으로 바꾸지 않고 한 번 물음
      const hay = `${x.title || ''} ${x.from || ''} ${x.project || ''}`.replace(/\s/g, ''); const ws = m[1].replace(/\d[\d,.]*\s*(만|천|백)?\s*원?/g, ' ').split(/\s+/).map(w => w.replace(/(이|가|은|는|도|에서|한테서)$/, '')).filter(w => w.length >= 2);
      if (amt == null && ws.some(w => !hay.includes(w))) return { text: `“${x.title}” ${Number(x.amount || 0).toLocaleString()}원이 들어온 건가요? 말씀하신 것과 이름이 조금 달라서 여쭤봐요.`, chips: [{ label: '맞아요', act: { op: 'got', id: x.id } }, { label: '아니에요', skip: true }] };
      return run({ op: 'got', id: x.id }); }
    if (ms.length > 1) return { text: '어느 돈이 들어왔나요?', chips: [...ms.slice(0, 4).map(x => ({ label: `${x.title} ${Number(x.amount || 0).toLocaleString()}원`.slice(0, 34), act: { op: 'got', id: x.id } })), { label: '아니에요', skip: true }] };
  }
  // 완료: "포스터 시안 끝냈어", "견적 요청 보냈어"
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를|도)?\s*(?:다\s*)?(?:끝냈|끝났|끝냄|끝남|끝$|끝!|완료|마쳤|마침|해결했|해결됨|다\s*했|다\s*함|다함|했어|했음|했다|했습니다|챙겼|보냈어|보냈음|보냈습니다|보냄|제출했|제출함|올렸어|올렸음|올림|처리했|처리함|넘겼어|넘겼음|전달했|전달함|공유했|공유함|컨펌\s*받았)\S*$/)) && !/(해야|까지|할\s*거|하자|할까|언제|\?|(?<![가-힣\d])못\s|(?<![가-힣\d])안\s)/.test(t)) {
    const r = await find(m[1], ['task']);
    if (r.one && r.one.s >= 0.75) return run({ op: 'done', id: r.one.it.id });
    if (r.one || r.many) return ask(r.many || [r.one], { op: 'done' }, '끝낸 일이');
  }
  // 중요 표시
  if ((m = t.match(/^(.+?)\s*(?:은|는|이|가|을|를)?\s*(?:제일\s*|진짜\s*|좀\s*|엄청\s*)?(?:급해요?|급함|급하다|급한\s*거야|급합니다|먼저\s*(?:해야\s*(?:해|돼|함)|해\s*줘|하자))$/))) { const r = await find(m[1], ['task']); if (r.one) return run({ op: 'prio', v: 'high', id: r.one.it.id }); if (r.many) return ask(r.many, { op: 'prio', v: 'high' }, '중요로 올릴 게'); }   /* "로고 시안 급해": 있는 할 일이면 중요로 */
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를)?\s*(?:중요|급한\s*일|우선)\s*(?:표시|으로|로)?\s*(?:해\s*줘|해줘|올려\s*줘|해)?$/))) { const r = await find(m[1], ['task']); if (r.one) return run({ op: 'prio', v: 'high', id: r.one.it.id }); if (r.many) return ask(r.many, { op: 'prio', v: 'high' }, '중요로 올릴 게'); }
  return null;
}
