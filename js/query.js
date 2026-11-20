// 비서에게 물어보는 말 → 기기 안 데이터에서 답 찾기
import * as db from './db.js';
import * as SC from './scope.js';
import * as store from './store.js';
import * as brain from './brain.js';

const eun = s => { const c = String(s || '').trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? ((c - 0xAC00) % 28 ? '은' : '는') : '은'; };   /* 받침 있으면 은, 없으면 는 */
const euro = s => { const c = String(s || '').trim().slice(-1).charCodeAt(0); if (!(c >= 0xAC00 && c <= 0xD7A3)) return '(으)로'; const j = (c - 0xAC00) % 28; return j && j !== 8 ? '으로' : '로'; };   /* 받침 있으면 으로 (ㄹ받침은 로) */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function rangeOf(q, base = new Date()) {
  const b = new Date(base); b.setHours(0, 0, 0, 0);
  const mon = addD(b, -((b.getDay() + 6) % 7));
  if (/이번\s*주|금주/.test(q)) return [ymd(mon), ymd(addD(mon, 6)), '이번 주'];
  if (/다음\s*주|담주/.test(q)) return [ymd(addD(mon, 7)), ymd(addD(mon, 13)), '다음 주'];
  if (/지난\s*주|저번\s*주/.test(q)) return [ymd(addD(mon, -7)), ymd(addD(mon, -1)), '지난 주'];
  if (/이번\s*달|이달|이번달/.test(q)) return [ymd(new Date(b.getFullYear(), b.getMonth(), 1)), ymd(new Date(b.getFullYear(), b.getMonth() + 1, 0)), '이번 달'];
  if (/지난\s*달|저번\s*달/.test(q)) return [ymd(new Date(b.getFullYear(), b.getMonth() - 1, 1)), ymd(new Date(b.getFullYear(), b.getMonth(), 0)), '지난 달'];
  if (/올해|이번\s*년/.test(q)) return [`${b.getFullYear()}-01-01`, `${b.getFullYear()}-12-31`, '올해'];
  if (/다음\s*달|담달|내달/.test(q)) return [ymd(new Date(b.getFullYear(), b.getMonth() + 1, 1)), ymd(new Date(b.getFullYear(), b.getMonth() + 2, 0)), '다음 달'];
  { const mm = q.match(/(?:(내년|작년|올해)\s*)?(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)(?!\s*(?:초|중순|말|첫|둘|셋|넷|마지막))/); // "12월 일정" → 그 달 전체
    if (mm && +mm[2] >= 1 && +mm[2] <= 12) { let y = b.getFullYear() + (mm[1] === '내년' ? 1 : mm[1] === '작년' ? -1 : 0); const mo = +mm[2] - 1; if (!mm[1] && mo < b.getMonth() - 5) y += 1; return [ymd(new Date(y, mo, 1)), ymd(new Date(y, mo + 1, 0)), `${mm[2]}월`]; } }
  const w = brain.parseWhen(q, base);
  if (w.date) return [w.date, w.date, w.hits[0] || w.date];
  return null;
}

const fmtK = d => { const x = new Date(d); return `${x.getMonth() + 1}월 ${x.getDate()}일(${'일월화수목금토'[x.getDay()]})`; };
// 반환: { text, items:[{icon,title,sub,route}] }
export async function answer(q, base = new Date()) {
  const r = rangeOf(q, base);
  const today = ymd(base);
  { const A = await import('./ask.js'); const hit = await A.smart(q, base, r); if (hit) return hit; }
  if (/(빈\s*시간|비는\s*시간|시간\s*(있|비)|언제\s*비|여유)/.test(q)) {
    const d = r ? r[0] : today;
    const slots = await store.freeSlots(d);
    return { text: slots.length ? `${r ? r[2] : '오늘'} 비는 시간은 ${slots.length}칸이에요.` : '비는 시간이 없어요.', items: slots.map(s => ({ icon: 'clock', title: `${s.start} – ${s.end}`, sub: `${s.mins}분`, route: 'calendar' })) };
  }
  if (/(회의|미팅)/.test(q) && /(내용|정리|요약|뭐였|결정|얘기)/.test(q)) {
    let ms = (await db.list('meetings')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (r) ms = ms.filter(m => (m.date || '') >= r[0] && (m.date || '') <= r[1]);
    const items = ms.slice(0, 6).map(m => { const s = m.summaryConfirmed ? m.summary : m.summaryDraft; return { icon: 'mic', title: m.title + (m.summaryConfirmed ? '' : ' (요약 확인 전)'), sub: (s?.decisions?.[0] || s?.summary?.[0] || '').slice(0, 80), route: 'meetings/' + m.id }; });
    return { text: items.length ? `${r ? r[2] + ' ' : ''}회의 ${items.length}개예요. 눌러서 정리를 보세요.` : '해당하는 회의록이 없어요.', items };
  }
  // "내일 뭐 해야 돼?", "이번 주 뭐 있어?" → 그 기간의 일정과 할 일을 같이
  if (r && /(뭐\s*(해|하지|있|해야|하기로)|뭐가\s*있|할\s*거\s*있|해야\s*(돼|해|하지|할))/.test(q) && !/(일정|스케줄|할\s*일|할일|지출|비용)/.test(q)) {
    const evs = (await db.list('events')).filter(e => { for (let d = new Date(r[0]); ymd(d) <= r[1]; d = addD(d, 1)) if (store.occursOn(e, ymd(d))) return true; return false; }).sort((x, y) => ((x.date || '') + (x.start || '')).localeCompare((y.date || '') + (y.start || '')));
    const ts = (await store.openTasks()).filter(t => t.due && t.due <= r[1]).sort((x, y) => x.due.localeCompare(y.due));
    return { text: evs.length || ts.length ? `${r[2]}까지 일정 ${evs.length}개, 끝낼 할 일 ${ts.length}개가 있어요.` : `${r[2]}에는 잡힌 일정도, 마감인 할 일도 없어요.`, items: [...evs.map(e => ({ icon: 'calendar', title: e.title, sub: [e.start || '종일', e.place, e.who].filter(Boolean).join(' · '), route: 'calendar/' + e.date })), ...ts.slice(0, 12).map(t => ({ icon: 'check2', title: t.title, sub: (t.due < today ? '밀림 · ' : '') + '마감 ' + t.due.slice(5).replace('-', '/'), route: 'tasks' }))] };
  }
  // "전시 언제였지", "충주 미팅 언제야" → 그 말이 들어간 일정을 날짜와 함께
  if ((/언제/.test(q) && !/비|빈\s*시간/.test(q)) || /(몇\s*시|어디서|어디야|어디지|어디였|장소|누구랑|누가\s*(와|오|가|참석))/.test(q)) {
    const kws = q.replace(/(언제(까지)?(였지|였더라|야|지|예요|에요|더라|인지|였어|임)?|몇\s*시(였지|야|지|예요|에요|더라|부터)?|어디서(\s*해|\s*하지|\s*했지)?|어디(야|지|였지|였더라|예요|에요)?|장소|누구랑(\s*해|\s*하지|\s*가)?|누가\s*(와|오지|가|참석해)|알려\s*줘|뭐였지|일정|약속|마감|해요?$|\?)/g, ' ').split(/\s+/).map(x => x.replace(/(은|는|이|가|을|를)$/, '')).filter(x => x.length >= 2 && !/^(다음|다음번|이번|제일|가장|빠른|가까운|다가오는|우리)$/.test(x));
    // 가장 가까운 앞날의 것을 고름 (되풀이 일정은 다음에 돌아오는 날로)
    const nearest = list => { const up = list.map(e => { if ((e.date || '') >= today) return { ...e }; if (e.repeat) for (let i = 0; i < 62; i++) { const d = ymd(addD(new Date(today), i)); if (store.occursOn(e, d)) return { ...e, date: d }; } return null; }).filter(Boolean).sort((x, y) => ((x.date || '') + (x.start || '')).localeCompare((y.date || '') + (y.start || ''))); return up[0] || list[0]; };
    if (kws.length) {
      const hay = e => `${e.title} ${e.place || ''} ${e.who || ''} ${e.area || ''}`;
      const evs = (await db.list('events')).filter(e => kws.every(k => hay(e).includes(k))).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
      const ts = (await db.list('tasks')).filter(t => t.due && !t.done && kws.every(k => `${t.title} ${t.project || ''} ${t.who || ''}`.includes(k))).sort((x, y) => x.due.localeCompare(y.due));
      if ((/마감/.test(q) || (/(언제까지|까지\s*(야|예요|에요|지|죠|인가|일까))/.test(q) && !evs.length)) && ts.length) return { text: `“${ts[0].title}” 마감은 ${fmtK(ts[0].due)}${ts[0].time ? ' ' + ts[0].time : ''}이에요.${ts[0].who ? ` 담당은 ${ts[0].who}예요.` : ''}`, items: ts.slice(0, 6).map(t => ({ icon: 'check2', title: t.title, sub: '마감 ' + t.due.slice(5).replace('-', '/') + (t.time ? ' ' + t.time : ''), route: 'tasks' })) };
      { const e = nearest(evs);
        if (e && /(어디|장소)/.test(q)) return { text: e.place || e.area ? `“${e.title}”${eun(e.title)} ${[e.area, e.place].filter(Boolean).join(' ')}에서 해요. ${fmtK(e.date)}${e.start ? ' ' + e.start : ''}이에요.` : `“${e.title}”에는 장소를 안 적어 뒀어요. ${fmtK(e.date)}${e.start ? ' ' + e.start : ''}이에요.`, items: [{ icon: 'calendar', title: e.title, sub: [e.date.slice(5).replace('-', '/'), e.start, e.place].filter(Boolean).join(' · '), route: 'calendar/' + e.date }] };
        if (e && /(누구랑|누가)/.test(q)) return { text: e.who ? `“${e.title}”${eun(e.title)} ${e.who}와(과) 같이 해요.` : `“${e.title}”에는 같이 하는 사람을 안 적어 뒀어요.`, items: [{ icon: 'calendar', title: e.title, sub: [e.date.slice(5).replace('-', '/'), e.start, e.who].filter(Boolean).join(' · '), route: 'calendar/' + e.date }] };
        if (e && /몇\s*시/.test(q)) return { text: e.start ? `“${e.title}”${eun(e.title)} ${fmtK(e.date)} ${e.start}${e.end ? '–' + e.end : ''}이에요.` : `“${e.title}”${eun(e.title)} ${fmtK(e.date)}인데 시간은 안 정해져 있어요.`, items: [{ icon: 'calendar', title: e.title, sub: [e.date.slice(5).replace('-', '/'), e.start, e.place].filter(Boolean).join(' · '), route: 'calendar/' + e.date }] }; }
      if (evs.length || ts.length) { const e = nearest(evs); return { text: e ? `“${e.title}” 일정은 ${fmtK(e.date)}${e.start ? ' ' + e.start : ''}${e.date < today ? '이었어요' : '이에요'}.` : `그 말이 들어간 할 일 ${ts.length}개가 있어요.`, items: [...evs.slice(0, 8).map(x => ({ icon: 'calendar', title: x.title, sub: [x.date.slice(5).replace('-', '/'), x.start, x.place].filter(Boolean).join(' · '), route: 'calendar/' + x.date })), ...ts.slice(0, 5).map(t => ({ icon: 'check2', title: t.title, sub: '마감 ' + t.due.slice(5).replace('-', '/'), route: 'tasks' }))] }; }
      return { text: `‘${kws.join(' ')}’ 일정을 못 찾았어요. 캘린더에 아직 없는 것 같아요.`, items: [] };
    }
  }
  if (/(일정|스케줄|약속|회의\s*언제|미팅)/.test(q)) {
    const [a, b, label0] = r || [today, ymd(addD(base, 6)), '앞으로 7일'];
    // "개인 일정", "팀 일정"처럼 물으면 그쪽만
    const want = /개인|내\s*개인|사적/.test(q) ? 'personal' : /팀|업무|회사/.test(q) ? 'work' : ''; const label = label0 + (want ? ' ' + SC.LABEL[want] + ' 쪽' : '');
    const all = [...(await db.list('events')), ...(await store.drafts()).filter(d => d.kind === 'event' && d.data?.date).map(d => ({ ...d.data, title: '(확인 전) ' + d.data.title }))].filter(e => !want || SC.of(e) === want);
    const out = [];
    const seen = new Set();
    for (let d = new Date(a); ymd(d) <= b; d = addD(d, 1)) for (const e of all) if (store.occursOn(e, ymd(d))) { const span = e.endDate && e.endDate > e.date && !e.repeat; if (span) { const k = e.id || e.title + e.date; if (seen.has(k)) continue; seen.add(k); } out.push({ ...e, _d: ymd(d), _span: span ? `${e.date.slice(5).replace('-', '/')}~${e.endDate.slice(5).replace('-', '/')}` : '' }); }
    out.sort((x, y) => (x._d + (x.start || '')).localeCompare(y._d + (y.start || '')));
    return { text: out.length ? `${label} 일정 ${out.length}개예요.` : `${label}에는 일정이 없어요.`, items: out.map(e => ({ icon: 'calendar', title: e.title, sub: `${e._span || e._d.slice(5).replace('-', '/')} ${e._span ? '' : e.start || '종일'}${e.place ? ' · ' + e.place : ''}${e.who ? ' · ' + e.who : ''}${e.project ? ' · ' + e.project : ''} · ${SC.LABEL[SC.of(e)]}`, route: 'calendar/' + e._d })) };
  }
  if (/(할\s*일|할일|투두|todo|해야\s*할|마감)/i.test(q)) {
    let ts = [...(await store.openTasks()), ...(await store.drafts()).filter(d => d.kind === 'task' && d.data?.title).map(d => ({ ...d.data, title: '(확인 전) ' + d.data.title }))];
    if (r) ts = ts.filter(t => t.due && t.due >= r[0] && t.due <= r[1]);
    if (/밀린|지난|늦은/.test(q)) ts = ts.filter(t => t.due && t.due < today);
    ts.sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    return { text: ts.length ? `${r ? r[2] + ' ' : ''}남은 할 일 ${ts.length}개예요.` : '남은 할 일이 없어요. 깔끔해요.', items: ts.slice(0, 20).map(t => ({ icon: 'check2', title: t.title, sub: [t.due && '마감 ' + t.due.slice(5).replace('-', '/'), t.who, t.project].filter(Boolean).join(' · '), route: 'tasks' })) };
  }
  if (/(지출|비용|돈|얼마|썼|정산|영수증)/.test(q)) {
    const [a, b, label] = r || [ymd(new Date(base.getFullYear(), base.getMonth(), 1)), ymd(new Date(base.getFullYear(), base.getMonth() + 1, 0)), '이번 달'];
    const allX = await db.list('expenses'); let xs = allX.filter(e => e.date >= a && e.date <= b);
    if (/정산\s*(안|전)|미정산/.test(q)) xs = xs.filter(e => e.status !== 'done');
    // "메타 광고비 얼마 썼지", "식비 얼마" → 그 말이 든 것만
    const ws = brain.parseWhen(q, base).hits.reduce((x, hh) => x.replace(hh, ' '), q).replace(/(이번\s*(주|달)|지난\s*(주|달)|다음\s*주|올해|지출|비용|돈|얼마(나|였지|였더라|였어|였나|야|지|예요|에요|임)?|썼(지|어|나|더라|는지)?|나갔(지|어|나)?|들었(지|어|나)?|정산|영수증|내역|알려\s*줘|보여\s*줘|총|전부|다\s|에|은|는|이|가|\?)/g, ' ').split(/\s+/).filter(x => x.length >= 2);
    if (ws.length) { if (!r) xs = allX; const hit = xs.filter(e => ws.every(k => `${e.title} ${e.category || ''} ${e.project || ''} ${e.pay || ''} ${e.memo || ''}`.includes(k))); const any = hit.length ? hit : xs.filter(e => ws.some(k => `${e.title} ${e.category || ''} ${e.project || ''} ${e.pay || ''}`.includes(k)));
      if (any.length) { const s2 = any.reduce((s, e) => s + (Number(e.amount) || 0), 0); return { text: `${r ? label + ' ' : ''}‘${ws.join(' ')}’ 지출은 ${s2.toLocaleString()}원 (${any.length}건)이에요.`, items: any.sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 12).map(e => ({ icon: 'receipt', title: e.title, sub: `${(Number(e.amount) || 0).toLocaleString()}원 · ${e.date.slice(5).replace('-', '/')} · ${e.category || ''}`, route: 'money' })) }; }
      if (ws.some(k => k.length >= 2) && !/^(이번|지난|전체)$/.test(ws.join(''))) return { text: `${label}에는 ‘${ws.join(' ')}’${euro(ws.join(' '))} 적힌 지출이 없어요. 전체 지출은 ${xs.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString()}원이에요.`, items: [] }; }
    const sum = xs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byCat = {}; xs.forEach(e => (byCat[e.category || '기타'] = (byCat[e.category || '기타'] || 0) + (Number(e.amount) || 0)));
    return { text: `${label} 지출은 ${sum.toLocaleString()}원 (${xs.length}건)이에요.`, items: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ icon: 'receipt', title: c, sub: v.toLocaleString() + '원', route: 'money' })) };
  }
  if (/(번호|전화|연락처|이메일|메일\s*주소|누구)/.test(q)) {
    const cs = await db.list('contacts');
    const name = q.replace(/(번호|전화|연락처|이메일|메일\s*주소|알려줘|뭐야|보여줘|찾아줘|좀|의|\?)/g, ' ').trim();
    const hit = brain.similar(name, cs.map(c => ({ id: c.id, text: `${c.name} ${c.org || ''} ${c.role || ''} ${(c.tags || []).join(' ')} ${c.memo || ''}`, c })), 6);
    const list = hit.length ? hit.map(x => x.c) : cs.filter(c => name.split(' ').some(w => w && c.name?.includes(w)));
    return { text: list.length ? `${list.length}명 찾았어요.` : '그런 사람을 못 찾았어요.', items: list.map(c => ({ icon: 'user', title: c.name, sub: [c.phone, c.org, c.email].filter(Boolean).join(' · '), route: 'people/' + c.id, tel: c.phone })) };
  }
  if (/(대기함|확인할|임시)/.test(q)) {
    const ds = await store.drafts();
    return { text: `확인 기다리는 항목 ${ds.length}개예요.`, items: ds.slice(0, 10).map(d => ({ icon: store.KINDS[d.kind]?.icon || 'file', title: d.data.title || d.data.name, sub: store.KINDS[d.kind]?.label, route: 'inbox' })) };
  }
  if (/(작업\s*시간|얼마나\s*(일|작업)|집중\s*시간)/.test(q)) {
    const [a, b, label] = r || [ymd(addD(base, -6)), today, '최근 7일'];
    const logs = (await db.list('timelogs')).filter(l => l.date >= a && l.date <= b);
    const tot = logs.reduce((s, l) => s + (l.minutes || 0), 0);
    const byP = {}; logs.forEach(l => (byP[l.project || l.title] = (byP[l.project || l.title] || 0) + l.minutes));
    return { text: `${label} 작업 ${Math.floor(tot / 60)}시간 ${tot % 60}분이에요.`, items: Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([p, m]) => ({ icon: 'timer', title: p, sub: `${Math.floor(m / 60)}시간 ${m % 60}분`, route: 'tasks' })) };
  }
  // 그 밖에는 전체 검색
  const docs = await store.corpus();
  const res = brain.similar(q.replace(/(찾아줘|검색|보여줘|알려줘|뭐였지|\?)/g, ''), docs, 8);
  return { text: res.length ? `관련 기록 ${res.length}개를 찾았어요.` : '관련 기록을 못 찾았어요. 다르게 물어봐 주세요.', items: res.map(d => ({ icon: 'file', title: d.title || '(제목 없음)', sub: d.text.slice(0, 60), route: d.route + '/' + d.id })) };
}
