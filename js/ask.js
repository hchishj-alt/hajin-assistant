// 비서에게 묻는 말 중 "사람·업체·프로젝트·우선순위"에 관한 것. 해당 없으면 null → query.js의 기본 답으로
import * as db from './db.js';
import * as store from './store.js';
import * as brain from './brain.js';

const eun = s => { const c = String(s || '').trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? ((c - 0xAC00) % 28 ? '은' : '는') : '은'; };   /* 받침 있으면 은, 없으면 는 */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const md = s => s ? s.slice(5).replace('-', '/') : '';
const key = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const won = n => Number(n).toLocaleString() + '원';
const atK = l => (/^(오늘|내일)$/.test(l) ? l + '은' : /^(어제|그제|모레)$/.test(l) ? l + '는' : l + '에는');   // "오늘에는" 대신 "오늘은"
const num = v => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
const sameP = (who, name) => !!who && !!name && String(who).split(/[,\s]+/).some(w => w === name || w === name.slice(1) || name === w.slice(1));
const taskItem = (t, today) => ({ icon: 'check2', title: (t._pend ? '(확인 전) ' : '') + t.title, sub: [t.due && (t.due < today ? '밀림 · ' : '') + '마감 ' + md(t.due), t.who, t.project].filter(Boolean).join(' · '), route: 'tasks' });
const evItem = e => ({ icon: 'calendar', title: (e._pend ? '(확인 전) ' : '') + e.title, sub: [md(e.date), e.start || '종일', e.place, e.who].filter(Boolean).join(' · '), route: 'calendar/' + e.date });

export async function smart(q, base = new Date(), r = null) {
  const today = ymd(base); const Q = key(q);
  const tasks = await db.list('tasks'), open = tasks.filter(t => !t.done);
  const me = (await db.kvGet('name', '')) || '';
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = [...new Set((await store.peopleNames()).filter(n => n && n.length >= 2))];
  const person = names.sort((a, b) => b.length - a.length).find(n => Q.includes(key(n)) || (n.length === 3 && new RegExp(`(^|[^가-힣])${esc(n.slice(1))}(이|가|는|은|의|한테|님|씨|\\s|$)`).test(q)));
  // 아직 확정 전인 임시 항목도 답에 넣음 (확인 전이라고 표시)
  const pend = (await store.drafts()).filter(d => d.data && d.data.title);
  const pTasks = pend.filter(d => d.kind === 'task').map(d => ({ ...d.data, _pend: true })), pEvents = pend.filter(d => d.kind === 'event' && d.data.date).map(d => ({ ...d.data, _pend: true }));
  const mineQ = /(^|\s)(나|내|제|저)(는|가|의)?\s|내\s*(할\s*일|일정)|나\s*뭐/.test(q + ' ') && !person;
  const vendors = await db.list('vendors');
  const projects = (await db.list('projects')).map(p => p.name).filter(Boolean);
  // "이번 주에 끝낸 일": 그 기간에 끝낸 할 일
  if (/(끝낸|완료한|끝난|마친|다\s*한)\s*(일|것|거|할\s*일)/.test(q) && !/(해야|까지|\d+\s*시)/.test(q)) {
    const mon = new Date(base); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const [a0, b0, label] = r || [ymd(mon), today, '이번 주'];
    let ds = tasks.filter(t => t.done && db.dayOf(t.doneAt || t.updatedAt || '') >= a0 && db.dayOf(t.doneAt || t.updatedAt || '') <= b0); if (person) ds = ds.filter(t => store.sameName(t.who, person));
    ds.sort((x, y) => (y.doneAt || '').localeCompare(x.doneAt || ''));
    const at = /^(오늘|어제|그제)$/.test(label) ? label : label + '에';
    return { text: ds.length ? `${at} ${person ? person + ' 님이 ' : ''}끝낸 일은 ${ds.length}개예요.` : `${at} 끝낸 것으로 표시된 일이 아직 없어요.`, items: ds.slice(0, 15).map(t => ({ icon: 'check2', title: t.title, sub: [md(db.dayOf(t.doneAt || t.updatedAt || '')), t.who, t.project].filter(Boolean).join(' · '), go: 'tasks' })), chips: ds.length ? [{ label: '주간 보고로 쓰기', go: 'prompts/use/builtin:pm-weekly' }] : [] };
  }
  // "로고 시안 누가 해?": 그 할 일의 담당
  if (/(누가|누구)\s*(해|하|맡|담당)/.test(q) || /담당(자)?\s*(이|가)?\s*(누구|누가)/.test(q) || (/(누가|누구)\s*[가-힣]{1,6}\s*[?？]*$/.test(q) && !/(바빠|바쁜|바쁘|많|여유|한가|널널|와|오지|참석|쉬|휴가|냈|결제|샀)/.test(q))) {   // "견적서 누가 보내?"도
    const qk = key(q.replace(/(누가|누구)\s*[가-힣]{1,6}\s*[?？]*$/, m0 => (/(해|하|맡|담당)/.test(m0) ? m0 : ' ')).replace(/(누가|누구|담당자?|해\??|하지\??|하고\s*있\S*|맡았\S*|맡아\S*|야\??|이야\??|[?？])/g, ' '));
    const hit = qk.length >= 2 ? [...open, ...pTasks, ...tasks.filter(t => t.done)].filter(t => t.title && (key(t.title).includes(qk) || qk.includes(key(t.title)))).sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0) || key(x.title).length - key(y.title).length)[0] : null;
    if (hit) return { text: hit.who ? `“${hit.title}”${eun(hit.title)} ${hit.who} 님 담당이에요.${hit.due ? ` 마감은 ${md(hit.due)}이에요.` : ''}${hit._pend ? ' (아직 확인 전인 항목이에요)' : ''}${hit.done ? ' 이미 끝난 일이에요.' : ''}` : `“${hit.title}”${eun(hit.title)} ${hit.done ? '담당 없이 끝난 일이에요.' : '아직 담당이 안 정해져 있어요.'}${hit.due ? ` 마감은 ${md(hit.due)}이에요.` : ''}`, items: [{ icon: 'check2', title: hit.title, sub: [hit.due ? '마감 ' + md(hit.due) : '', hit.who].filter(Boolean).join(' · '), go: 'tasks' }] };
  }

  // 업체: 번호·링크, 분야별 목록, 품목 가격, 어디가 제일 싼지
  if (vendors.length) {
    const v = vendors.slice().sort((a, b) => (b.name || '').length - (a.name || '').length).find(x => x.name && Q.includes(key(x.name)));
    if (v && /(번호|전화|연락처|링크|사이트|주소|카톡|담당|어디|정보|알려)/.test(q)) return { text: `${v.name}${v.cat ? ` (${v.cat})` : ''} ${[v.phone, v.kakao && '카톡 ' + v.kakao, v.link].filter(Boolean).join(' · ') || '연락처를 아직 안 적어 뒀어요.'}`, items: [{ icon: 'briefcase', title: v.name, sub: [v.phone, v.link, v.memo].filter(Boolean).join(' · '), route: 'vendors', tel: v.phone }] };
    const all = vendors.flatMap(x => (x.prices || []).filter(p => p.item).map(p => ({ ...p, v: x, n: num(p.price) })));
    const words = q.replace(/(어디가|어디|제일|가장|싸|싼|저렴|최저가|가격|단가|견적|얼마(였지|야|지|예요|에요)?|비교|해\s*줘|알려\s*줘|업체|\?)/g, ' ').split(/\s+/).map(w => w.replace(/(은|는|이|가|을|를|의)$/, '')).filter(w => w.length >= 2 && !(v && key(v.name) === key(w)));
    if (/(싸|싼|저렴|최저가|가격|단가|견적|얼마|비교)/.test(q) && words.length) {
      let hits = all.filter(p => words.every(w => key(p.item).includes(key(w)))); if (!hits.length) hits = all.filter(p => words.some(w => key(p.item).includes(key(w))));
      if (v) hits = hits.filter(p => p.v.id === v.id);
      if (hits.length) { hits.sort((a, b) => (a.n || 9e12) - (b.n || 9e12)); const best = hits[0]; const same = hits.filter(p => key(p.item) === key(best.item));
        return { text: same.length > 1 ? `“${best.item}”${eun(best.item)} ${best.v.name}가 ${won(best.n)}으로 가장 싸요. ${same.length}곳을 비교했어요.${same[1].n > best.n ? ` 다음은 ${same[1].v.name} ${won(same[1].n)}이에요.` : ''}` : `“${best.item}”${eun(best.item)} ${best.v.name}에서 ${best.n ? won(best.n) : best.price}이에요.${best.at ? ` (${md(best.at)} 기준)` : ''}`, items: hits.slice(0, 8).map(p => ({ icon: 'receipt', title: `${p.v.name} · ${p.item}`, sub: [p.n ? won(p.n) : p.price, p.note, p.at && md(p.at) + ' 기준'].filter(Boolean).join(' · '), route: 'vendors', tel: p.v.phone })) }; }
    }
    if (/업체|거래처/.test(q) && /(어디|뭐|알려|보여|목록|리스트|있어|있나|누구)/.test(q)) { const cats = [...new Set(vendors.map(x => x.cat || '기타'))]; const c = cats.find(x => x.split(/[·\s]/).some(w => w.length >= 2 && q.includes(w))); const list = vendors.filter(x => !c || (x.cat || '기타') === c);
      return { text: `${c ? c + ' ' : ''}업체 ${list.length}곳이에요.`, items: list.slice(0, 12).map(x => ({ icon: 'briefcase', title: x.name, sub: [x.cat, x.phone, (x.prices || []).length ? `가격 ${x.prices.length}개` : ''].filter(Boolean).join(' · '), route: 'vendors', tel: x.phone })) }; }
  }

  // 누가 바쁜지, 누가 여유 있는지
  if (/(누가|누구).{0,8}(바빠|바쁜|바쁘|일이?\s*많|여유|한가|널널|맡을|맡길)/.test(q)) {
    const cnt = new Map(); for (const t of open) { const w = t.who ? (names.find(n => sameP(t.who, n)) || t.who) : (me || '나'); const c = cnt.get(w) || { n: 0, late: 0, week: 0 }; c.n++; if (t.due && t.due < today) c.late++; cnt.set(w, c); }
    for (const n of await store.teammateNames()) if (!cnt.has(n)) cnt.set(n, { n: 0, late: 0 });
    const rows = [...cnt.entries()].sort((a, b) => b[1].n - a[1].n); if (!rows.length) return { text: '남은 할 일이 없어서 다들 여유 있어요.', items: [] };
    const top = rows[0], low = rows.at(-1);
    const nim = (n, j) => n === '나' ? (j === '이' ? '내가' : '나') : `${n} 님${j || ''}`;
    return { text: `${nim(top[0], '이')} 남은 일 ${top[1].n}개로 가장 바빠요${top[1].late ? ` (밀린 것 ${top[1].late}개)` : ''}.${rows.length > 1 && low[1].n < top[1].n ? (low[0] === '나' ? ` 남은 일이 가장 적은 건 나(${low[1].n}개)예요.` : ` 새 일은 ${nim(low[0])}(${low[1].n}개)에게 맡기는 게 좋아요.`) : ''}`, items: rows.map(([n, c]) => ({ icon: 'user', title: n, sub: `남은 일 ${c.n}개${c.late ? ` · 밀림 ${c.late}개` : ''}`, route: 'tasks' })) };
  }

  // 프로젝트 진행 상황, 프로젝트에 쓴 돈
  const pg = brain.projectGuess(q, projects);
  const proj = projects.sort((a, b) => b.length - a.length).find(p => Q.includes(key(p))) || pg.name || '';
  const inP = (x, p) => x.project === p || key(x.title).includes(key(p));
  const sumA = a => a.reduce((s2, x) => s2 + (Number(x.amount) || 0), 0);
  const cash = async p => { const inc = (await db.list('incomes')).filter(x => inP(x, p)), exp = (await db.list('expenses')).filter(x => inP(x, p)); const got = sumA(inc.filter(x => x.status === 'got')), due = sumA(inc.filter(x => x.status !== 'got')), out = sumA(exp); return { got, due, out, left: got + due - out, n: inc.length + exp.length }; };
  const prog = p => { const ts = [...tasks, ...pTasks].filter(t => inP(t, p)); const left = ts.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); return { all: ts.length, done: ts.length - left.length, left, late: left.filter(t => t.due && t.due < today).length, next: left.find(t => t.due) }; };
  // 프로젝트별로 한눈에: 진행, 또는 돈(받은 돈·받을 돈·쓴 돈·남는 돈)
  { const many = !proj && pg.many && pg.many.length > 1 ? pg.many : null; const allQ = /프로젝트\s*별|전체\s*프로젝트|프로젝트\s*(전체|전부|다|현황|상황|정리|요약)/.test(q);
    if ((allQ || many) && projects.length) { const ps = many || projects; const moneyQ = /(돈|수익|매출|비용|지출|정산|얼마|남는|남아|남았|이익|마진|예산)/.test(q) && !/할\s*일/.test(q);
      if (moneyQ) { let rows = []; for (const p of ps) rows.push([p, await cash(p)]); if (rows.some(([, c]) => c.n)) rows = rows.filter(([, c]) => c.n); const tot = rows.reduce((s2, [, c]) => s2 + c.left, 0);
        return { text: `${many ? '이름이 겹치는 ' : ''}프로젝트 ${rows.length}개의 돈이에요. 받은 돈과 받을 돈에서 쓴 돈을 빼면 모두 ${won(tot)} 남아요.`, items: rows.map(([p, c]) => ({ icon: 'receipt', title: p, sub: c.n ? `받음 ${won(c.got)} · 받을 돈 ${won(c.due)} · 씀 ${won(c.out)} · 남는 돈 ${won(c.left)}` : '아직 적힌 돈이 없어요', route: 'plan' })) }; }
      if (allQ || /(어디까지|진행|상황|현황|얼마나|남았|어때|어떻게|됐|끝났|정리|할\s*일|마감)/.test(q) || key(q).length <= 6) { const rows = ps.map(p => [p, prog(p)]);
        return { text: `${many ? '그 이름이 들어간 ' : ''}프로젝트 ${rows.length}개예요. ${rows.filter(([, g]) => g.late).length ? `밀린 일이 있는 곳은 ${rows.filter(([, g]) => g.late).map(([p]) => p).join(', ')}이에요.` : '밀린 일은 없어요.'}`, items: rows.map(([p, g]) => ({ icon: 'folder', title: p, sub: g.all ? `할 일 ${g.done}/${g.all} 끝남${g.late ? ` · 밀림 ${g.late}` : ''}${g.next ? ` · 다음 마감 ${md(g.next.due)} ${g.next.title}${g.next.who ? '(' + g.next.who + ')' : ''}` : ''}` : '아직 묶인 할 일이 없어요', route: 'plan' })) }; } } }

  // 주간 점검: 이번 주에 끝낸 것, 남은 것, 밀린 것, 다음 주 일정
  if (/(주간|이번\s*주|금주|지난\s*주)\s*(점검|보고|리포트|결산|회고|정리)/.test(q)) {
    const b0 = new Date(base); b0.setHours(0, 0, 0, 0); const mon = new Date(b0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - (/지난/.test(q) ? 7 : 0)); const sun = new Date(mon); sun.setDate(sun.getDate() + 6); const nx = new Date(sun); nx.setDate(nx.getDate() + 7);
    const a = ymd(mon), z = ymd(sun); const doneW = tasks.filter(t => t.done && db.dayOf(t.doneAt || t.updatedAt || '') >= a && db.dayOf(t.doneAt || t.updatedAt || '') <= z);
    const late = open.filter(t => t.due && t.due < today), dueW = open.filter(t => t.due && t.due >= today && t.due <= z); const evN = []; for (const e of await db.list('events')) for (let d = new Date(sun.getTime() + 864e5); ymd(d) <= ymd(nx); d.setDate(d.getDate() + 1)) if (store.occursOn(e, ymd(d))) { evN.push({ ...e, date: ymd(d) }); break; }
    const byWho = new Map(); for (const t of open) { const w = t.who || me || '나'; byWho.set(w, (byWho.get(w) || 0) + 1); }
    return { text: `${/지난/.test(q) ? '지난 주' : '이번 주'} 점검이에요. 끝낸 일 ${doneW.length}개, 이번 주 안에 끝낼 일 ${dueW.length}개, 밀린 일 ${late.length}개, 다음 주 일정 ${evN.length}개예요.${byWho.size > 1 ? ' 남은 일은 ' + [...byWho.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n, c]) => `${n} ${c}개`).join(', ') + '예요.' : ''}`,
      items: [...late.slice(0, 5).map(t => taskItem(t, today)), ...dueW.slice(0, 6).map(t => taskItem(t, today)), ...doneW.slice(0, 4).map(t => ({ icon: 'check', title: t.title, sub: '끝냄' + (t.who ? ' · ' + t.who : ''), route: 'tasks' })), ...evN.slice(0, 4).map(evItem)] };
  }
  // 누가 쉬는지
  if (/(누가|누구).{0,8}(쉬|휴가|반차|연차|없|안\s*나와|못\s*나와|빠져|출장|재택)|휴가자|쉬는\s*사람|부재/.test(q)) {
    const [a, b, label] = r || [today, ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 13)), '앞으로 2주']; const LV = /(휴무|반차|연차|월차|휴가|출장|외근|재택|병가|조퇴|결근|불참)/; const out = [];
    for (const e of [...await db.list('events'), ...pEvents]) if (LV.test(e.title || '')) for (let d = new Date(a + 'T00:00'); ymd(d) <= b; d.setDate(d.getDate() + 1)) if (e._pend ? e.date === ymd(d) || (e.endDate && ymd(d) > e.date && ymd(d) <= e.endDate) : store.occursOn(e, ymd(d))) { out.push({ ...e, date: ymd(d) }); break; }
    out.sort((x, y) => x.date.localeCompare(y.date));
    return { text: out.length ? `${label} 자리를 비우는 일정은 ${out.length}개예요.` : `${label}에는 휴가나 출장이 적혀 있지 않아요.`, items: out.map(evItem) };
  }
  // 팀원별로 누가 뭘 하고 있는지
  if (!person && /(팀원별|사람별|담당자?별|다들\s*뭐|각자\s*뭐|누가\s*뭐|누가\s*뭘|팀\s*(할\s*일|현황|상황)|팀원.{0,4}(할\s*일|뭐\s*해|뭐\s*하))/.test(q)) {
    const g = new Map(); for (const t of [...open, ...pTasks]) { const w = t.who ? (names.find(n => sameP(t.who, n)) || t.who) : (me || '나'); (g.get(w) || g.set(w, []).get(w)).push(t); }
    const rows = [...g.entries()].sort((x, y) => y[1].length - x[1].length); if (!rows.length) return { text: '남은 할 일이 없어요.', items: [] };
    return { text: `남은 할 일을 사람별로 묶었어요. ${rows.slice(0, 5).map(([n, ts]) => `${n} ${ts.length}개`).join(', ')}.`, items: rows.flatMap(([n, ts]) => ts.sort((x, y) => (x.due || '9').localeCompare(y.due || '9')).slice(0, 4).map(t => ({ ...taskItem(t, today), sub: [n, t.due && (t.due < today ? '밀림 · ' : '') + '마감 ' + md(t.due), t.project].filter(Boolean).join(' · ') }))).slice(0, 20) };
  }
  // 받을 돈
  // "오로라 계약금 아직 안 들어왔어": 그 건이 받을 돈에 있으면 언제 받기로 했고 며칠 지났는지, 그리고 정중히 묻는 말을 만들 수 있게
  if (/(안|못)\s*(들어왔|들어옴|받았|받음|입금\s*됐|입금됨)/.test(q)) {
    const due = (await db.list('incomes')).filter(x => x.status !== 'got'); const words = q.replace(/(아직|여태|계속|안|못|들어왔\S*|들어옴|받았\S*|받음|입금\S*|돈)/g, ' ').split(/\s+/).map(x => x.replace(/(이|가|은|는|을|를|도)$/, '')).filter(x => x.length >= 2);
    const hit = due.filter(x => words.some(k => `${x.title} ${x.from || ''} ${x.project || ''}`.includes(k))).sort((x, y) => (x.date || '9').localeCompare(y.date || '9'))[0];
    if (hit) { const late = hit.date && hit.date < today ? Math.round((new Date(today) - new Date(hit.date)) / 864e5) : 0;
      return { text: `“${hit.title}” ${won(hit.amount)}은 아직 받을 돈으로 남아 있어요. ${hit.date ? (late ? `받기로 한 날(${md(hit.date)})에서 ${late}일 지났어요.` : `받기로 한 날은 ${md(hit.date)}이에요.`) : '받기로 한 날은 안 적혀 있어요.'}${late ? ' 정중하게 묻는 말을 만들어 드릴까요?' : ''}`, items: [{ icon: 'wallet', title: hit.title, sub: [won(hit.amount), hit.date ? '받는 날 ' + md(hit.date) : '날짜 미정', hit.from].filter(Boolean).join(' · '), route: 'money' }], chips: [{ label: '묻는 말 만들기', go: 'prompts/use/builtin:biz-dunning' }, { label: '들어왔어요', say: `${hit.title} 들어왔어` }] }; }
  }
  // "루미에 잔금 언제 들어와?", "오로라 계약금 언제 받아?": 그 받을 돈의 약속일
  if (/언제/.test(q) && /(들어와|들어오|들어올|입금|받아|받지|받기로|받을|준대|주기로|줘\?*$)/.test(q)) {
    const due = (await db.list('incomes')).filter(x => x.status !== 'got'); const words = q.replace(/(언제\S*|들어\S*|입금\S*|받\S*|준대|주기로|돈|[?？])/g, ' ').split(/\s+/).map(x => x.replace(/(이|가|은|는|을|를|도|에서|한테서?)$/, '')).filter(x => x.length >= 2);
    const hits = due.filter(x => words.length && words.every(k => `${x.title} ${x.from || ''} ${x.project || ''}`.includes(k))).sort((x, y) => (x.date || '9').localeCompare(y.date || '9'));
    const hit = hits[0] || (words.length ? due.filter(x => words.some(k => `${x.title} ${x.from || ''}`.includes(k)))[0] : null);
    if (hit) { const late = hit.date && hit.date < today ? Math.round((new Date(today) - new Date(hit.date)) / 864e5) : 0;
      return { text: hit.date ? (late ? `“${hit.title}” ${won(hit.amount)}은 ${md(hit.date)}에 받기로 했는데 ${late}일 지났어요.` : `“${hit.title}” ${won(hit.amount)}은 ${md(hit.date)}에 받기로 했어요.`) : `“${hit.title}” ${won(hit.amount)}은 받기로 한 날을 안 적어 뒀어요.`, items: [{ icon: 'wallet', title: hit.title, sub: [won(hit.amount), hit.date ? '받는 날 ' + md(hit.date) : '날짜 미정', hit.from].filter(Boolean).join(' · '), go: 'money' }], chips: late ? [{ label: '묻는 말 만들기', go: 'prompts/use/builtin:biz-dunning' }] : [] }; }
  }
  // "이번 달 얼마 벌었어?", "이번 달 수입": 그 기간에 실제로 들어온 돈
  if (/(벌었|번\s*돈|수입|들어온\s*돈|매출)/.test(q) && !/(받을|미수|안\s*들어|못\s*받|예정|언제)/.test(q)) {
    const xs = await db.list('incomes'); const sum = a2 => a2.reduce((s2, x) => s2 + (Number(x.amount) || 0), 0);
    const a0 = r ? r[0] : ymd(new Date(base.getFullYear(), base.getMonth(), 1)), b0 = r ? r[1] : ymd(new Date(base.getFullYear(), base.getMonth() + 1, 0)), label = r ? r[2] : '이번 달';
    const got = xs.filter(x => x.status === 'got' && (x.gotAt || x.date || '') >= a0 && (x.gotAt || x.date || '') <= b0).sort((x, y) => (y.gotAt || y.date || '').localeCompare(x.gotAt || x.date || '')); const due = xs.filter(x => x.status !== 'got');
    return { text: `${got.length ? `${label}에 들어온 돈은 ${won(sum(got))} (${got.length}건)이에요.` : `${label}에 들어온 돈은 아직 없어요.`}${due.length ? ` 받을 돈은 ${won(sum(due))} (${due.length}건) 남아 있어요.` : ''}`,
      items: got.slice(0, 12).map(x => ({ icon: 'wallet', title: x.title, sub: [won(x.amount), md(x.gotAt || x.date), x.from].filter(Boolean).join(' · '), go: 'money' })), chips: due.length ? [{ label: '받을 돈 보기', say: '받을 돈 얼마야?' }] : [] };
  }
  if (/(받을\s*돈|미수금|입금\s*(안|예정|언제|됐|들어)|안\s*들어온|들어올\s*돈|수금|매출)/.test(q)) {
    let xs = await db.list('incomes'); if (proj) xs = xs.filter(x => x.project === proj || key(x.title).includes(key(proj)));
    // "오로라한테 받을 돈 얼마야?": 그 거래처 것만
    const nm = q.replace(/(받을\s*돈|미수금|수금|매출|얼마\S*|입금\S*|언제\S*|들어\S*|있어\S*|남았\S*|아직|전부|다|총|[?？])/g, ' ').split(/\s+/).map(x => x.replace(/(한테서?|에게서?|에서|이|가|은|는|을|를|도|의)$/, '')).filter(x => x.length >= 2);
    const byN = nm.length ? xs.filter(x => nm.some(k => `${x.title} ${x.from || ''}`.includes(k))) : []; const whoN = byN.length ? (byN[0].from && nm.find(k => byN[0].from.includes(k)) ? byN[0].from : nm.find(k => byN.some(x => x.title.includes(k)))) : ''; if (byN.length) xs = byN;
    const due = xs.filter(x => x.status !== 'got').sort((x, y) => (x.date || '9').localeCompare(y.date || '9')), got = xs.filter(x => x.status === 'got');
    const sum = a => a.reduce((s2, x) => s2 + (Number(x.amount) || 0), 0);
    return { text: due.length ? `${whoN ? whoN + '에서 ' : ''}받을 돈은 ${won(sum(due))} (${due.length}건)이에요.${due.filter(x => x.date && x.date < today).length ? ` 받기로 한 날이 지난 게 ${due.filter(x => x.date && x.date < today).length}건 있어요.` : ''}${got.length ? ` 지금까지 받은 돈은 ${won(sum(got))}이에요.` : ''}` : (got.length ? `받을 돈은 다 받았어요. 지금까지 ${won(sum(got))} 받았어요.` : '적어 둔 받을 돈이 없어요. “오로라 계약금 300만원 25일 입금 예정”처럼 말해 주세요.'), items: due.concat(got.slice(0, 3)).slice(0, 12).map(x => ({ icon: 'wallet', title: x.title, sub: [won(x.amount), x.status === 'got' ? '받음' : x.date ? '받는 날 ' + md(x.date) : '날짜 미정', x.from].filter(Boolean).join(' · '), route: 'money' })) };
  }
  if (proj && /(얼마|썼|지출|비용|예산|돈|수익|남는|남아)/.test(q)) { const xs = (await db.list('expenses')).filter(e => inP(e, proj)); const sum = xs.reduce((s, e) => s + (Number(e.amount) || 0), 0); const c = await cash(proj);
    return { text: `“${proj}”에 지금까지 ${won(sum)} 썼어요 (${xs.length}건).${c.got || c.due ? ` 받은 돈 ${won(c.got)}, 받을 돈 ${won(c.due)}이라 지금 계산으로는 ${won(c.left)} 남아요.` : ''}`, items: xs.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map(e => ({ icon: 'receipt', title: e.title, sub: `${won(e.amount)} · ${md(e.date)}`, route: 'money' })) }; }
  if (proj && (/(어디까지|진행|상황|현황|얼마나|남았|어때|어떻게|됐|끝났|정리|할\s*일|마감|일정)/.test(q) || key(q) === key(proj))) { const ts = [...tasks, ...pTasks].filter(t => t.project === proj || key(t.title).includes(key(proj))), done = ts.filter(t => t.done).length, left = ts.filter(t => !t.done), late = left.filter(t => t.due && t.due < today); const next = left.filter(t => t.due && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
    const evs = (await db.list('events')).filter(e => (e.project === proj || key(e.title).includes(key(proj))) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    return { text: ts.length ? `“${proj}”${eun(proj)} 할 일 ${ts.length}개 중 ${done}개 끝났어요 (${Math.round(done / ts.length * 100)}%).${late.length ? ` 밀린 게 ${late.length}개 있어요.` : ''}${next ? ` 다음 마감은 ${md(next.due)} “${next.title}”${next.who ? `(${next.who})` : ''}이에요.` : ''}` : `“${proj}”에 묶인 할 일이 아직 없어요.`, items: [...late, ...left.filter(t => !late.includes(t)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))].slice(0, 10).map(t => taskItem(t, today)).concat(evs.slice(0, 3).map(evItem)) }; }

  // 사람: 뭐 하고 있는지, 할 일, 일정
  if (person && !/(번호|전화|연락처|이메일|메일)/.test(q) && /(뭐\s*하|뭐하|뭐\s*해|뭐해|뭐\s*남|하고\s*있|할\s*일|할일|할\s*거|맡은|담당|일정|스케줄|약속|바빠|바쁜|언제\s*돼|시간\s*돼|있어|있나|뭐야|상황|마감)/.test(q)) {
    const short = person.length === 3 ? person.slice(1) : person; const mine = [...open, ...pTasks].filter(t => sameP(t.who, person) && (!r || !t.due || t.due <= r[1])).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); const late = mine.filter(t => t.due && t.due < today);
    const [a, b, label] = r || [today, ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 13)), '앞으로 2주']; const evs = [];
    for (const e of await db.list('events')) if (sameP(e.who, person) || key(e.title).includes(key(short))) for (let d = new Date(a + 'T00:00'); ymd(d) <= b; d.setDate(d.getDate() + 1)) if (store.occursOn(e, ymd(d))) { evs.push({ ...e, date: ymd(d) }); break; }
    evs.sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')));
    if (/(일정|스케줄|약속)/.test(q)) return { text: evs.length ? `${label} ${short} 님이 낀 일정은 ${evs.length}개예요.` : `${label}에는 ${short} 님이 낀 일정이 없어요.`, items: evs.map(evItem) };
    return { text: mine.length || evs.length ? `${short} 님은 남은 할 일 ${mine.length}개${late.length ? `(밀린 것 ${late.length}개)` : ''}, ${label} 일정 ${evs.length}개예요.${mine[0] ? ` 가장 급한 건 “${mine[0].title}”${mine[0].due ? ` (마감 ${md(mine[0].due)})` : ''}이에요.` : ''}` : `${short} 님에게 맡겨진 일이나 일정이 아직 없어요.`, items: [...mine.slice(0, 10).map(t => taskItem(t, today)), ...evs.slice(0, 5).map(evItem)] };
  }

  // 내 것만: "나 뭐 남았어", "이번 주 내 할 일"
  if (mineQ && /(할\s*일|할일|뭐\s*남|뭐\s*해|뭐\s*하|해야|마감)/.test(q)) { const myN = await store.myNames(); let ts = [...open, ...pTasks].filter(t => !t.who || myN.some(n => store.sameName(n, t.who))); if (r) ts = ts.filter(t => t.due && t.due <= r[1]); ts.sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    return { text: ts.length ? `${r ? r[2] + ' ' : ''}내 할 일은 ${ts.length}개예요.${ts.filter(t => t.due && t.due < today).length ? ` 밀린 게 ${ts.filter(t => t.due && t.due < today).length}개 있어요.` : ''}` : `${r ? r[2] + ' ' : ''}내 할 일은 없어요.`, items: ts.slice(0, 20).map(t => taskItem(t, today)) }; }
  // 끝낸 일: "어제 뭐 했지", "이번 주 끝낸 일"
  if (r && /(뭐\s*했|뭐했|끝낸|완료한|한\s*일|했던|어땠|하루\s*(정리|돌아|요약)|돌아보)/.test(q) && r[0] <= today) { const dn = tasks.filter(t => t.done && db.dayOf(t.doneAt || t.updatedAt || '') >= r[0] && db.dayOf(t.doneAt || t.updatedAt || '') <= r[1]); const evs = []; for (const e of await db.list('events')) for (let d = new Date(r[0] + 'T00:00'); ymd(d) <= r[1] && ymd(d) <= today; d.setDate(d.getDate() + 1)) if (store.occursOn(e, ymd(d))) { evs.push({ ...e, date: ymd(d) }); break; }
    const logs = (await db.list('timelogs')).filter(l => l.date >= r[0] && l.date <= r[1]);
    return { text: dn.length || evs.length || logs.length ? `${atK(r[2])} 끝낸 일 ${dn.length}개, 일정 ${evs.length}개${logs.length ? `, 작업 기록 ${logs.length}개` : ''}가 있어요.` : `${atK(r[2])} 남은 기록이 없어요.`, items: [...dn.slice(0, 8).map(t => ({ icon: 'check', title: t.title, sub: '끝냄' + (t.who ? ' · ' + t.who : ''), route: 'tasks' })), ...evs.slice(0, 6).map(evItem), ...logs.slice(0, 4).map(l => ({ icon: 'timer', title: l.title, sub: `${l.minutes}분`, route: 'tasks' }))] }; }
  // 밀린 일
  if (/(밀린|늦은|지난\s*마감|못\s*끝낸)/.test(q)) { const late = (await store.openTasks()).filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
    return { text: late.length ? `밀린 일이 ${late.length}개 있어요. 가장 오래된 건 “${late[0].title}” (마감 ${md(late[0].due)})이에요.` : '밀린 일이 없어요. 잘하고 있어요.', items: late.slice(0, 15).map(t => taskItem(t, today)) }; }

  // "오늘 할 일 다 했어", "할 일 3개 남았어": 남은 것을 세어 맞장구
  if (/할\s*(일|거)(이|은|는|도|들)?\s*(다\s*(했|끝냈|끝났)|\d+\s*개\s*남았)/.test(q)) { const mine = await store.openTasks(); const td = mine.filter(t => t.due && t.due <= today);
    return { text: /다\s*(했|끝)/.test(q) ? (td.length ? `수고했어요. 다만 오늘까지인 할 일이 아직 ${td.length}개 남아 있어요.` : mine.length ? `수고했어요! 오늘까지인 건 다 끝났어요. 남은 할 일은 ${mine.length}개인데 급하지 않아요.` : '수고했어요! 남은 할 일이 하나도 없어요.') : `지금 남은 할 일은 ${mine.length}개예요.${td.length ? ` 그중 ${td.length}개는 오늘까지예요.` : ''}`, items: (td.length ? td : mine).slice(0, 6).map(t => ({ icon: 'check2', title: t.title, sub: [t.due ? '마감 ' + md(t.due) : '', t.who].filter(Boolean).join(' · '), route: 'tasks' })) }; }
  // 뭐부터 해야 하는지
  if (/(뭐\s*부터|뭐부터|뭘\s*먼저|뭐\s*먼저|우선\s*순위|제일\s*급(한|해)|가장\s*급(한|해)|급한\s*(거|것|일)|(뭐가|뭐\s*가|어떤\s*게)\s*(제일\s*|가장\s*)?(급|중요)|할\s*(일|거)(이|은|도)?\s*(너무\s*|진짜\s*|엄청\s*)?(많아|많다|많네|많음|쌓였|밀렸))/.test(q)) {
    const mine = await store.openTasks(); const rank = t => (t.due && t.due < today ? 0 : t.due === today ? 1 : 3) + (t.priority === 'high' ? -0.5 : 0) + (t.due && t.due > today ? Math.min(3, (new Date(t.due) - new Date(today)) / 864e5 / 3) : t.due ? 0 : 4);
    const order = mine.slice().sort((a, b) => rank(a) - rank(b) || (a.due || '9').localeCompare(b.due || '9')).slice(0, 5);
    const nextEv = (await store.eventsOn(today)).find(e => e.start && e.start > `${pad(base.getHours())}:${pad(base.getMinutes())}`);
    if (!order.length) return { text: nextEv ? `급한 할 일은 없어요. ${nextEv.start}에 “${nextEv.title}”만 챙기면 돼요.` : '급한 할 일이 없어요. 여유 있을 때 미뤄 둔 걸 해 보세요.', items: nextEv ? [evItem(nextEv)] : [] };
    const f = order[0]; const why = f.due && f.due < today ? '마감이 지났어요' : f.due === today ? '오늘 마감이에요' : f.priority === 'high' ? '중요 표시가 있어요' : f.due ? `마감이 ${md(f.due)}로 가장 가까워요` : '마감은 없지만 가장 먼저 적어 둔 일이에요';
    return { text: `“${f.title}”부터 하세요. ${why}.${order[1] ? ` 그다음은 “${order[1].title}”이에요.` : ''}${nextEv ? ` ${nextEv.start}에 “${nextEv.title}”이 있으니 그 전에 끝내면 좋아요.` : ''}`, items: order.map(t => taskItem(t, today)) };
  }

  // 몇 개 남았는지
  if (/(할\s*일|할일|일).{0,6}몇\s*(개|건)/.test(q)) { const mine = await store.openTasks(); const late = mine.filter(t => t.due && t.due < today).length, td = mine.filter(t => t.due === today).length;
    return { text: `남은 할 일은 ${mine.length}개예요. 오늘 마감 ${td}개, 밀린 것 ${late}개예요.`, items: mine.sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 8).map(t => taskItem(t, today)) }; }
  return null;
}
