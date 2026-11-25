// 방금 만든 것을 말로 고치기·취소하기: "아니 4시야", "화요일로", "25만원이야", "장소는 성수", "방금 거 취소", "일정이 아니라 할 일이야"
// 비서가 마지막에 만든 항목(chat:last)을 기억해 두고, 뒤이은 짧은 말을 그 항목에 대한 말로 읽음
import * as db from './db.js';
import * as brain from './brain.js';
import * as store from './store.js';

const FRESH = 30 * 60 * 1000;   // "아니 …"처럼 고치는 말머리가 있을 때
const NEAR = 10 * 60 * 1000;    // 말머리 없이 "화요일"만 말했을 때
const fmtD = d => { const x = new Date(d + 'T00:00'); return `${x.getMonth() + 1}/${x.getDate()}(${'일월화수목금토'[x.getDay()]})`; };
const KWORD = { 일정: 'event', 약속: 'event', '할 일': 'task', 할일: 'task', 투두: 'task', 메모: 'note', 지출: 'expense', 비용: 'expense', 아이디어: 'idea', '받을 돈': 'income', 입금: 'income', 수입: 'income', '살 것': 'buy', 살것: 'buy', 구매: 'buy', 연락처: 'contact', 업체: 'vendor', 거래처: 'vendor', SNS: 'sns', sns: 'sns', 레퍼런스: 'reference', 받을돈: 'income' };
const KW = '일정|약속|할\\s*일|할일|투두|메모|지출|비용|아이디어|받을\\s*돈|입금|수입|살\\s*것|구매|연락처|업체|거래처|SNS|sns|레퍼런스';
const kindOf = s => KWORD[s.replace(/\s+/g, ' ').trim()] || KWORD[s.replace(/\s+/g, '')] || null;

export async function remember(ids) { if (ids && ids.length) await db.kvSet('chat:last', { ids, at: Date.now() }); }
// 마지막에 만든 것들: 아직 임시면 임시 항목을, 확정했으면 저장된 기록을 가리킴
async function lastItems(maxAge) {
  const l = await db.kvGet('chat:last', null); if (!l || !l.ids || !l.ids.length || Date.now() - l.at > maxAge) return [];
  const out = [];
  for (const id of l.ids) { const d = await db.get(id); if (!d || d.deleted) continue;
    if (d.status === 'pending') out.push({ d, rec: null, kind: d.kind, data: d.data });
    else if (d.status === 'approved' && d.resultId) { const rec = await db.get(d.resultId); if (rec && !rec.deleted) out.push({ d, rec, kind: d.kind, data: rec }); } }
  return out;
}
async function patch(x, fields) { if (x.rec) await db.patch(x.rec.id, fields); else await db.patch(x.d.id, { data: { ...x.d.data, ...fields } }); }
const title = x => x.data.title || x.data.name || '방금 것';
// 받침에 맞춰 조사 고르기
export const J = (w, a, b) => { const c = String(w || '').charCodeAt(String(w || '').length - 1); return c >= 0xAC00 && c <= 0xD7A3 ? ((c - 0xAC00) % 28 ? a : b) : b; };
const ro = w => { const c = String(w || '').charCodeAt(String(w || '').length - 1); const k = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0; return k && k !== 8 ? '으로' : '로'; };
const addMin = (t, n) => { const [h, m] = t.split(':').map(Number); const v = Math.max(0, Math.min(1439, h * 60 + m + n)); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const addDay = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// chips에서 부르는 실행
export async function run(a) {
  if (a.op === 'revive') { let n = 0; for (const it of a.items || []) { const d = await db.get(it.id); if (!d) continue; if (it.recId) { const rec = await db.get(it.recId); if (rec) await db.put(rec.col, { ...rec, deleted: false }); await db.patch(d.id, { status: 'approved' }); } else await db.patch(d.id, { status: 'pending' }); n++; }
    return { text: n ? `${n}개를 되살렸어요.` : '되살릴 게 없어요.', refresh: (a.items || []).map(x => x.id) }; }
  if (a.op === 'patch') { const d = await db.get(a.id); if (!d) return { text: '그 사이에 없어졌어요.' }; const x = d.status === 'approved' && d.resultId ? { d, rec: await db.get(d.resultId) } : { d, rec: null }; await patch(x, a.fields); return { text: a.say || '바꿨어요.', refresh: [d.id] }; }
  return null;
}

// 고칠 값을 말에서 뽑음. 반환 { when, amount, place, who, title, shift } 중 있는 것만
function readChange(body, { people = [] } = {}) {
  let s = body.trim(); const out = {};
  // "A 아니고 B" → B가 새 값
  const ab = s.match(/^(.{1,20}?)\s*(?:이|가|은|는)?\s*(?:아니고|아니라|말고)\s+(.{1,30})$/); if (ab) { out.from = ab[1].trim(); s = ab[2].trim(); }
  s = s.replace(/\s*(?:이야|야|예요|이에요|입니다|임|이요|요|였어|이었어|이었음)[.!~]*$/, '').replace(/(?:\s*(?:으로|로)\s*|\s+)(?:바꿔|바꾸|변경|수정|고쳐|해|옮겨|옮기|정정|잡아|미뤄|당겨)\S*(?:\s*(?:줘|주세요|줄래))?$/, '').replace(/(으로|로)$/, '').trim();
  let m;
  // 상대 이동: "30분 늦춰", "하루 미뤄졌어", "한 시간 당겨"
  if ((m = body.match(/(\d+|한|두|세|반)\s*(분|시간|일|주)\s*(?:씩|정도)?\s*(늦춰|늦어|늦게|미뤄|미루|밀렸|밀려|뒤로|연기|당겨|당기|앞으로|앞당|일찍|빨라)/)) || (m = body.match(/(하루|이틀|사흘|일주일)()\s*(늦춰|늦어|미뤄|미루|밀렸|밀려|뒤로|연기|당겨|당기|앞으로|앞당|빨라)/))) {
    const n = { 한: 1, 두: 2, 세: 3, 반: 0.5, 하루: 1, 이틀: 2, 사흘: 3, 일주일: 7 }[m[1]] ?? +m[1]; const back = /(당겨|당기|앞으로|앞당|일찍|빨라)/.test(m[3]) ? -1 : 1; const unit = m[2] || '일';
    out.shift = unit === '분' ? { mins: back * n } : unit === '시간' ? { mins: back * n * 60 } : { days: back * n * (unit === '주' ? 7 : 1) }; return out; }
  // "장소는 X", "담당은 X", "제목은 X", "금액은 X", "시간은 X", "날짜는 X"
  if ((m = s.match(/^(장소|위치|곳|어디)(?:는|은|가|이)?\s*[:：]?\s*(.+)$/))) { out.place = m[2].replace(/(에서|에)$/, '').trim(); return out; }
  if ((m = s.match(/^(담당자?|누구랑|같이|참석자?)(?:는|은|가|이)?\s*[:：]?\s*(.+)$/))) { out.who = m[2].replace(/(이랑|랑|하고|이가|가|님)$/, '').trim(); return out; }
  if ((m = s.match(/^(제목|이름)(?:은|는|이|가|을|를)?\s*[:：]?\s*(.+)$/))) { out.title = m[2].trim(); return out; }
  // "민서도 같이 가", "서연이도 와": 같이 하는 사람을 더함
  if ((m = body.trim().match(/^([가-힣]{2,4}?)(?:이)?(?:도|랑|이랑|하고)\s*(?:같이|함께)?\s*(?:가|가요|간대|갈\s*거야|와|와요|온대|올\s*거야|참석\S*|해|해요|한대|껴|끼워\s*줘|추가\S*)?$/)) && people.some(n => n && (n === m[1] || n.slice(1) === m[1]))) { out.whoAdd = people.find(n => n === m[1] || n.slice(1) === m[1]); return out; }
  // "법카로 썼어", "현금으로 냈어": 결제 수단
  if ((m = body.trim().match(/^(법카|법인\s*카드|회사\s*카드|개카|개인\s*카드|내\s*카드|현금|계좌\s*이체|이체)(?:으로|로)?\s*(?:썼어요?|씀|냈어요?|냄|결제\S*|긁었\S*|했어요?|함|이야|야|예요|임)?$/))) { out.pay = /법|회사/.test(m[1]) ? '법인카드' : /현금/.test(m[1]) ? '현금' : /이체/.test(m[1]) ? '계좌이체' : '개인카드'; return out; }
  s = s.replace(/^(시간|시각|날짜|날|금액|가격|마감)(?:은|는|이|가)?\s*[:：]?\s*/, '');
  const money = brain.parseMoney(s); const rest0 = s.replace(new RegExp(brain.MONEY_SRC, 'g'), ' ').trim();
  if (money != null && !rest0) { out.amount = money; return out; }
  const w = brain.parseWhen(s); const rest = w.hits.reduce((x, hh) => x.replace(hh, ' '), s).replace(/(^|\s)(쯤|경|정도|부터|까지|에|으로|로|이|가|은|는)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  if (w.hits.length && rest.length <= 1) { out.when = w; return out; }
  // 이름 하나만 말함 → 담당/같이
  const nm = people.find(n => n && (s === n || s === n.slice(1) || s.replace(/(이|님|씨)$/, '') === n.slice(1)));
  if (nm && out.from != null) { out.who = nm; return out; }
  if (out.from != null && s && s.length <= 20) { out.swap = s; return out; }
  return null;
}

// 반환: { text, chips?, refresh?:[draftId] } 또는 null(해당 없음)
export async function tryFollow(text, { people = [] } = {}) {
  const t = text.trim().replace(/[.!~]+$/, ''); if (!t || t.length > 60 || /\n/.test(t)) return null;
  // 1) 되돌리기
  if (/^(?:아니\s*)?(?:(?:방금|아까|좀\s*전에?|마지막에?|지금)\s*(?:거|것|꺼|건|걸|만든\s*(?:거|것|건|걸)|적은\s*(?:거|것|건|걸)|한\s*(?:거|것|건|걸))?|그거|이거|그건|이건)\s*(?:은|는|을|를)?\s*(?:취소|지워|삭제|빼|없애|버려|무시|없던)\S*(?:\s*(?:줘|주세요|해줘|해 줘|해|할게|일로))?(?:\s*해\s*줘)?$/.test(t) || /^(?:아니\s*)?(?:취소|취소해\s*줘?|취소할게|되돌려\s*줘?|되돌리기|실행\s*취소|undo|잘못\s*(?:만들었어|적었어|말했어|썼어|눌렀어)|방금\s*거\s*아니야)$/i.test(t)) {
    const xs = await lastItems(FRESH); if (!xs.length) return { text: '방금 만든 게 없어서 취소할 게 없어요. 지울 항목 이름을 말해 주세요. 예: “내일 미팅 취소해줘”' };
    const items = []; for (const x of xs) { if (x.rec) { await db.remove(x.rec.id); await db.patch(x.d.id, { status: 'rejected' }); items.push({ id: x.d.id, recId: x.rec.id }); } else { await store.reject(x.d); items.push({ id: x.d.id }); } }
    await db.kvSet('chat:ask', null);
    return { text: `방금 만든 ${xs.length > 1 ? `${xs.length}개를` : `“${title(xs[0])}”${J(title(xs[0]), '을', '를')}`} 버렸어요.`, chips: [{ label: '되살리기', follow: { op: 'revive', items } }], refresh: xs.map(x => x.d.id) };
  }
  // 2) 종류 바꾸기: "일정이 아니라 할 일이야", "이건 메모로 해줘"
  { const m = t.match(new RegExp(`^(?:(?:아니야|아니|아냐|ㄴㄴ|노노|놉)[,\\s]*)?(?:이건|이거|그거|그건|방금\\s*(?:거|건|것)(?:은|는)?)?\\s*(?:(${KW})(?:이|가)?\\s*(?:아니라|아니고|말고)\\s*)?(${KW})(?:이야|야|예요|이에요|임|인데|(?:으로|로)\\s*(?:바꿔|해|만들어|넣어|옮겨)\\S*(?:\\s*(?:줘|주세요))?)?$`));   /* "아니 일정 말고 할 일", "ㄴㄴ 일정으로 바꿔" */
    if (m && (m[1] || /(이건|이거|그거|그건|방금|바꿔|로\s*해|만들어|넣어)/.test(t))) { const kind = kindOf(m[2]); const xs = await lastItems(FRESH); if (!kind) return null;
      if (!xs.length) return { text: '방금 만든 게 없어서 무엇을 바꿀지 모르겠어요. 확인 대기함에서 종류를 바꿀 수 있어요.' };
      const x = (m[1] && xs.find(y => y.kind === kindOf(m[1]))) || xs[0];
      if (x.rec) { await db.remove(x.rec.id); await db.patch(x.d.id, { status: 'pending', resultId: null }); }
      await store.changeKind(await db.get(x.d.id), kind);
      return { text: `“${title(x)}”${J(title(x), '을', '를')} ${store.KINDS[kind].label}${ro(store.KINDS[kind].label)} 바꿨어요.${x.rec ? ' 다시 확정해 주세요.' : ''}`, refresh: [x.d.id] }; } }
  // 3) 값 고치기
  const lead = t.match(/^(?:아니|아니야|아냐|아니다|아\s*맞다|아\s*참|참|정정|수정|앗|아)[,.\s]+(?=\S)/) || t.match(/^(?:방금\s*(?:거|건|것|꺼)|아까\s*(?:거|건|것)|이거|그거|이건|그건)\s*(?:은|는|을|를)?\s+(?=\S)/);
  let body = lead ? t.slice(lead[0].length) : t; body = body.replace(/^(?:방금\s*(?:거|건|것|꺼)|이거|그거|이건|그건)\s*(?:은|는|을|를)?\s+/, '');
  const ch = readChange(body, { people }); if (!ch) return null;
  const labeled = /^(장소|위치|담당자?|제목|시간|시각|날짜|금액|가격|마감|누구랑|참석자?)(?:은|는|이|가|을|를)?\s/.test(body) || ch.from != null || ch.shift || ch.whoAdd || ch.pay;
  if (!lead && !labeled && !(ch.when || ch.amount != null)) return null;
  const xs = await lastItems(lead || labeled ? FRESH : NEAR);
  if (!xs.length) { if (lead || (ch.when && !ch.when.time && body.length <= 6)) return { text: '방금 만든 게 없어서 무엇을 바꿀지 모르겠어요. “내일 미팅 4시로 옮겨줘”처럼 어떤 건지 같이 말해 주세요.' }; return null; }
  const want = ch.whoAdd ? ['event'] : ch.pay ? ['expense'] : ch.when || ch.shift ? ['event', 'task', 'expense', 'income', 'sns'] : ch.amount != null ? ['expense', 'income', 'buy'] : ch.place ? ['event'] : ch.who ? ['task', 'event'] : null;
  let cs = want ? xs.filter(x => want.includes(x.kind)) : xs;
  if (ch.from && cs.length > 1) { const f = cs.filter(x => JSON.stringify(x.data).includes(ch.from)); if (f.length) cs = f; }
  if (!cs.length) return null;
  const x = cs[0]; const k = x.kind; const cur = x.data; let fields = {}, say = '';
  if (ch.shift) {
    if (ch.shift.mins != null) { const base = k === 'event' ? cur.start : cur.time; if (!base) return { text: `“${title(x)}”에는 시간이 없어서 옮길 수 없어요. 몇 시인지 알려 주세요.` };
      fields = k === 'event' ? { start: addMin(cur.start, ch.shift.mins), ...(cur.end ? { end: addMin(cur.end, ch.shift.mins) } : {}) } : { time: addMin(cur.time, ch.shift.mins) }; say = `“${title(x)}” 시간을 ${fields.start || fields.time}으로 옮겼어요.`; }
    else { const key = k === 'task' ? 'due' : 'date'; if (!cur[key]) return { text: `“${title(x)}”에는 날짜가 없어서 옮길 수 없어요.` }; fields = { [key]: addDay(cur[key], ch.shift.days), ...(cur.endDate ? { endDate: addDay(cur.endDate, ch.shift.days) } : {}) }; say = `“${title(x)}”${J(title(x), '을', '를')} ${fmtD(fields[key])}로 옮겼어요.`; }
  } else if (ch.when) { const w = ch.when; const hasDay = w.hits.some(hh => !brain.isTimeHit(hh));
    if (k === 'event') { if (hasDay && w.date) { fields.date = w.date; fields._dated = true; } if (w.time) { fields.start = w.time; if (w.end) fields.end = w.end; else if (cur.start && cur.end) { const mm = s => +s.slice(0, 2) * 60 + +s.slice(3); fields.end = addMin(w.time, Math.max(15, mm(cur.end) - mm(cur.start))); } } if (w.endDate) fields.endDate = w.endDate; }
    else if (k === 'task') { if (hasDay && w.date) fields.due = w.date; if (w.time) fields.time = w.time; }
    else if (hasDay && w.date) fields.date = w.date;
    if (!Object.keys(fields).length) return null;
    say = `“${title(x)}” ${[fields.date || fields.due ? '날짜를 ' + fmtD(fields.date || fields.due) : '', fields.start || fields.time ? '시간을 ' + (fields.start || fields.time) : ''].filter(Boolean).join(', ')}${fields.start || fields.time ? '으로' : '로'} 바꿨어요.`; }
  else if (ch.amount != null) { fields = k === 'buy' ? { price: ch.amount } : { amount: ch.amount }; say = `“${title(x)}” 금액을 ${ch.amount.toLocaleString()}원으로 바꿨어요.`; }
  else if (ch.whoAdd) { const had = String(cur.who || '').split(/\s*,\s*/).filter(Boolean); if (had.includes(ch.whoAdd)) return { text: `“${title(x)}”에는 이미 ${ch.whoAdd} 님이 들어 있어요.` }; fields = { who: [...had, ch.whoAdd].join(', '), scope: 'work' }; say = `“${title(x)}”에 ${ch.whoAdd} 님도 같이 가는 것으로 넣었어요.`; }
  else if (ch.pay) { fields = { pay: ch.pay }; say = `“${title(x)}” 결제 수단을 ${ch.pay}${ro(ch.pay)} 바꿨어요.`; }
  else if (ch.place) { fields = { place: ch.place, addr: '', mapUrl: '' }; say = `“${title(x)}” 장소를 ${ch.place}${ro(ch.place)} 바꿨어요.`; }
  else if (ch.who) { const nm = people.find(n => n && (n === ch.who || n.slice(1) === ch.who)) || ch.who; fields = { who: nm }; say = `“${title(x)}” ${k === 'task' ? '담당을' : '같이 하는 사람을'} ${nm}${ro(nm)} 바꿨어요.`; }
  else if (ch.title) { fields = k === 'contact' || k === 'vendor' ? { name: ch.title } : { title: ch.title }; say = `제목을 “${ch.title}”${ro(ch.title)} 바꿨어요.`; }
  else if (ch.swap && ch.from) { // "민서 아니고 서연" 같은 낱말 바꿔치기: 방금 만든 것 안에서만
    let n = 0; for (const y of cs) { const f = {}; for (const key of ['title', 'name', 'who', 'place', 'memo', 'project', 'from']) if (typeof y.data[key] === 'string' && y.data[key].includes(ch.from)) f[key] = y.data[key].split(ch.from).join(ch.swap); if (Object.keys(f).length) { await patch(y, f); n++; } }
    if (!n) return null; return { text: `방금 만든 것에서 ‘${ch.from}’을(를) ‘${ch.swap}’(으)로 고쳤어요.`, refresh: cs.map(y => y.d.id) }; }
  else return null;
  const prev = Object.fromEntries(Object.keys(fields).map(key => [key, cur[key] ?? '']));
  await patch(x, fields);
  return { text: say + (x.rec ? '' : ' 맞으면 확정해 주세요.'), chips: [{ label: '되돌리기', follow: { op: 'patch', id: x.d.id, fields: prev, say: '원래대로 돌려놨어요.' } }], refresh: [x.d.id] };
}
