// 말로 "이미 있는 것"을 고치기: 완료 처리, 일정 옮기기, 마감 바꾸기, 취소, 넘기기, 담당 정하기, 새 프로젝트
// 하나로 분명히 짚이면 바로 하고 "되돌리기"를 붙임. 여럿이면 어느 건지 되물음. 지우기는 항상 한 번 확인
import * as db from './db.js';
import * as brain from './brain.js';
import { handoff, teammateNames, approve, reject, occursOn } from './store.js';

const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const WHENTOK = /^(오늘|내일|모레|글피|어제|이번\s*주|다음\s*주|다다음\s*주|이번주|다음주|담주|주말|평일|오전|오후|아침|점심|저녁|밤|새벽|정오|자정|반|[월화수목금토일]요일|[월화수목금토일]욜|\d{1,2}월|\d{1,2}일|\d{1,2}\/\d{1,2}|\d{1,2}시(\s*반)?|\d{1,2}분|\d{1,2}:\d{2}|\d+일\s*(뒤|후)|\d+주\s*(뒤|후)|한\s*시간|\d+시간)(에|까지|부터|쯤|경)?$/;
const STOP = /^(일정|약속|할일|할\s*일|일|거|것|그|저|이|좀|그거|건|마감|담당|업무|작업)$/;
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
const label = c => (c.it._draft ? '(확인 전) ' : '') + (c.kind === 'event' ? `${c.it.title} · ${c.it.date ? fmtD(c.it.date) : ''}${c.it.start ? ' ' + c.it.start : ''}` : `${c.it.title}${c.it.due ? ' · 마감 ' + fmtD(c.it.due) : ''}${c.it.who ? ' · ' + c.it.who : ''}`);
const ask = (cs, act, lead) => ({ text: `${lead} 어느 건가요?`, chips: [...cs.map(c => ({ label: label(c).slice(0, 34), act: { ...act, id: c.it.id } })), { label: '아니에요', skip: true }] });
const undo = prev => ({ label: '되돌리기', act: { op: 'restore', prev } });

// 실제로 바꾸는 곳. chips의 act도 여기로 옴
export async function run(a) {
  const it = a.id ? await db.get(a.id) : null;
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
    return { text: `“${it.title}”을 ${fmtD(p.date)}${p.start || it.start ? ' ' + (p.start || it.start) : ''}로 옮겼어요.${clash.length ? ` 그런데 그 시간에 “${clash[0].title}”도 있어요.` : ''}${it.who ? ` ${it.who}에게도 알려 주세요.` : ''}`, chips: [undo(prev)] };
  }
  if (a.op === 'remove') { await db.remove(it.id); return { text: `“${it.title}” 지웠어요.`, chips: [undo(prev)] }; }
  if (a.op === 'handoff') { await handoff(it, a.to, a.note || ''); return { text: `“${it.title}”을 ${a.to} 님에게 넘겼어요.${a.note ? ` 메모: ${a.note}` : ''} 넘긴 기록은 할 일을 열면 보여요.`, chips: [undo(prev)] }; }
  if (a.op === 'assign') { await db.patch(it.id, { who: a.to }); return { text: `“${it.title}” 담당을 ${a.to} 님으로 했어요.`, chips: [undo(prev)] }; }
  if (a.op === 'prio') { await db.patch(it.id, { priority: a.v }); return { text: `“${it.title}”을 ${a.v === 'high' ? '중요' : '보통'}으로 표시했어요.`, chips: [undo(prev)] }; }
  return null;
}

// 아직 확정 전인 임시 항목을 말로 고칠 때
async function runDraft(a, d, prev) {
  const cur = d.data || {}; const save = f => db.patch(d.id, { data: { ...cur, ...f } }); const ttl = cur.title || cur.name || '임시 항목';
  if (a.op === 'done') { const saved = await approve(d); if (saved) await db.patch(saved.id, { done: true, doneAt: db.now() }); return { text: `“${ttl}” 확정하고 완료로 넘겼어요.` }; }
  if (a.op === 'remove' || a.op === 'skipOnce') { await reject(d); return { text: `“${ttl}” 버렸어요.`, chips: [undo(prev)] }; }
  if (a.op === 'move' || a.op === 'moveOnce') { const f = d.kind === 'task' ? { due: a.date || cur.due || today(), ...(a.time ? { time: a.time } : {}) } : { date: a.date || cur.date || today(), ...(a.time ? { start: a.time } : {}) }; await save(f); return { text: `“${ttl}”을 ${fmtD(f.due || f.date)}${a.time ? ' ' + a.time : ''}로 바꿨어요. 아직 확인 전이에요.`, chips: [undo(prev)], refresh: [d.id] }; }
  if (a.op === 'assign' || a.op === 'handoff') { await save({ who: a.to }); return { text: `“${ttl}” 담당을 ${a.to} 님으로 했어요. 아직 확인 전이에요.`, chips: [undo(prev)], refresh: [d.id] }; }
  if (a.op === 'prio') { await save({ priority: a.v }); return { text: `“${ttl}”을 중요로 표시했어요.`, chips: [undo(prev)], refresh: [d.id] }; }
  return { text: '확인 전인 항목이라 대기함에서 고쳐 주세요.' };
}

// 말에서 고치기 명령을 알아봄. 해당 없으면 null (→ 평소처럼 새로 만들기·대화로 넘어감)
export async function tryAct(text, { people = [] } = {}) {
  const t = text.trim().replace(/[.!~]+$/, ''); if (t.length < 4 || t.length > 90 || /\n/.test(t)) return null;
  const names = [...new Set([...people, ...(await teammateNames())].filter(Boolean))];
  const who = s => names.find(n => s === n || s === n.slice(1) || s.replace(/(이|님|씨)$/, '') === n || s.replace(/(이|님|씨)$/, '') === n.slice(1));
  let m;

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
  // 넘기기: "포스터 시안 민서한테 넘겨줘 (메모)"
  if ((m = t.match(/^(.+?)\s+(\S+?)\s*(?:한테|에게|께)\s*(?:넘겨|넘길|넘김|인계|토스)\S*\s*(.*)$/))) {
    const to = who(m[2]); if (to) { const r = await find(m[1], ['task']); const act = { op: 'handoff', to, note: m[3].replace(/^[,\s]+/, '') };
      if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, `${to} 님에게 넘길 일이`); return { text: `“${m[1]}”에 맞는 할 일을 못 찾았어요. ${to} 님 할 일로 새로 만들까요?`, chips: [{ label: '새 할 일로', say: `할 일: ${to} ${m[1]}` }, { label: '아니에요', skip: true }] }; }
  }
  // 담당: "포스터 시안 담당 서연" / "포스터 시안은 서연이가 맡아"
  if ((m = t.match(/^(.+?)\s*(?:은|는)?\s*담당(?:자)?(?:은|는|을|를)?\s*([가-힣A-Za-z]+?)(?:으로|로)?(?:\s+(?:해\s*줘|해줘|바꿔\s*줘|바꿔줘|지정\S*|변경\S*))?$/)) || (m = t.match(/^(.+?)\s+(\S+?)(?:이가|가|이)\s*(?:맡|담당)\S*$/))) {
    const to = who(m[2]); if (to) { const r = await find(m[1], ['task']); const act = { op: 'assign', to }; if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, `${to} 님이 맡을 일이`); }
  }
  // 옮기기·미루기·마감 바꾸기: "내일 미팅 4시로 옮겨줘", "포스터 시안 마감 금요일로 미뤄줘"
  if ((m = t.match(/^(.+?)(?:으로|로)\s*(?:옮겨|옮길|옮기|옮김|미뤄|미루|당겨|당기|바꿔|바꾸|바뀜|바뀌|변경|연기|밀렸|밀려|잡혔|확정)\S*(?:\s*(?:줘|주세요|줄래))?$/))) {
    const parts = m[1].split(/\s+/); const tail = []; while (parts.length > 1 && WHENTOK.test(parts.at(-1))) tail.unshift(parts.pop());
    const nw = brain.parseWhen(tail.join(' ')); const subj = parts.join(' ').replace(/\s*(마감|일정|시간|날짜)(을|를|은|는)?$/, '');
    if (tail.length && (nw.date || nw.time)) { const sw = brain.parseWhen(subj); const due = /마감/.test(m[1]);
      const r = await find(subj, due ? ['task'] : ['event', 'task'], { date: sw.hits.length ? sw.date : null }); const act = { op: 'move', date: nw.hits.some(x => !/^\d{1,2}시|^\d{1,2}:\d|^오전|^오후|^반$/.test(x)) || !nw.time ? nw.date : null, time: nw.time || '' };
      if (r.one && r.one.it.repeat && !r.one.it._draft && !/(앞으로|계속|매주|매번|전부|다\s)/.test(t)) { const from = sw.hits.length && sw.date ? sw.date : null; return { text: `“${r.one.it.title}”은 반복 일정이에요. 이번 한 번만 옮길까요, 앞으로 계속 옮길까요?`, chips: [{ label: '이번만', act: { ...act, op: 'moveOnce', id: r.one.it.id, from } }, { label: '앞으로 계속', act: { ...act, id: r.one.it.id } }, { label: '그냥 두기', skip: true }] }; }
      if (r.one) return run({ ...act, id: r.one.it.id }); if (r.many) return ask(r.many, act, '옮길 게'); return { text: `“${subj}”에 맞는 일정이나 할 일을 못 찾았어요. 새로 만들까요?`, chips: [{ label: '새 일정으로', say: `일정: ${subj} ${tail.join(' ')}` }, { label: '아니에요', skip: true }] }; }
  }
  // 취소·지우기 (항상 확인)
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를)?\s*(?:취소|지워|삭제|없애|빼)\S*(?:\s*(?:줘|주세요|해줘|해 줘|됐어|됐대|됨))?$/)) && !/(기억|별명|배운|취향)/.test(t)) {
    const sw = brain.parseWhen(m[1]); const r = await find(m[1].replace(/\s*(일정|약속|할\s*일)$/, ''), ['event', 'task'], { date: sw.hits.length ? sw.date : null });
    if (r.one && r.one.it.repeat && !r.one.it._draft) return { text: `“${r.one.it.title}”은 반복 일정이에요. 이번 것만 뺄까요, 전부 지울까요?`, chips: [{ label: '이번만 빼기', act: { op: 'skipOnce', id: r.one.it.id, from: sw.hits.length && sw.date ? sw.date : null } }, { label: '전부 지우기', act: { op: 'remove', id: r.one.it.id } }, { label: '그냥 두기', skip: true }] };
    if (r.one) return { text: `“${label(r.one)}” 이거 지울까요?`, chips: [{ label: '지우기', act: { op: 'remove', id: r.one.it.id } }, { label: '그냥 두기', skip: true }] };
    if (r.many) return ask(r.many, { op: 'remove' }, '지울 게');
  }
  // 완료: "포스터 시안 끝냈어", "견적 요청 보냈어"
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를|도)?\s*(?:다\s*)?(?:끝냈|끝났|끝냄|끝남|끝$|끝!|완료|마쳤|마침|해결했|해결됨|다\s*했|다\s*함|다함|했어|했음|했다|했습니다|챙겼|보냈어|보냈음|보냈습니다|보냄|제출했|제출함|올렸어|올렸음|올림|처리했|처리함|넘겼어|넘겼음|전달했|전달함|공유했|공유함|컨펌\s*받았)\S*$/)) && !/(해야|까지|할\s*거|하자|할까|언제|\?|못\s|안\s)/.test(t)) {
    const r = await find(m[1], ['task']);
    if (r.one && r.one.s >= 0.75) return run({ op: 'done', id: r.one.it.id });
    if (r.one || r.many) return ask(r.many || [r.one], { op: 'done' }, '끝낸 일이');
  }
  // 중요 표시
  if ((m = t.match(/^(.+?)\s*(?:은|는|을|를)?\s*(?:중요|급한\s*일|우선)\s*(?:표시|으로|로)?\s*(?:해\s*줘|해줘|올려\s*줘|해)?$/))) { const r = await find(m[1], ['task']); if (r.one) return run({ op: 'prio', v: 'high', id: r.one.it.id }); if (r.many) return ask(r.many, { op: 'prio', v: 'high' }, '중요로 올릴 게'); }
  return null;
}
