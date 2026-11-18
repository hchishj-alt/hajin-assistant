// 비서에게 물어보는 말 → 기기 안 데이터에서 답 찾기
import * as db from './db.js';
import * as store from './store.js';
import * as brain from './brain.js';

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
  const w = brain.parseWhen(q, base);
  if (w.date) return [w.date, w.date, w.hits[0] || w.date];
  return null;
}

// 반환: { text, items:[{icon,title,sub,route}] }
export async function answer(q, base = new Date()) {
  const r = rangeOf(q, base);
  const today = ymd(base);
  if (/(빈\s*시간|시간\s*(있|비)|언제\s*비|여유)/.test(q)) {
    const d = r ? r[0] : today;
    const slots = await store.freeSlots(d);
    return { text: slots.length ? `${r ? r[2] : '오늘'} 비는 시간은 ${slots.length}칸이에요.` : '비는 시간이 없어요.', items: slots.map(s => ({ icon: 'clock', title: `${s.start} – ${s.end}`, sub: `${s.mins}분`, route: 'calendar' })) };
  }
  if (/(일정|스케줄|약속|회의\s*언제|미팅)/.test(q)) {
    const [a, b, label] = r || [today, ymd(addD(base, 6)), '앞으로 7일'];
    const all = await db.list('events');
    const out = [];
    for (let d = new Date(a); ymd(d) <= b; d = addD(d, 1)) for (const e of all) if (e.date === ymd(d) || store.repeatsOn(e, ymd(d))) out.push({ ...e, _d: ymd(d) });
    out.sort((x, y) => (x._d + (x.start || '')).localeCompare(y._d + (y.start || '')));
    return { text: out.length ? `${label} 일정 ${out.length}개예요.` : `${label}에는 일정이 없어요.`, items: out.map(e => ({ icon: 'calendar', title: e.title, sub: `${e._d.slice(5).replace('-', '/')} ${e.start || '종일'}${e.place ? ' · ' + e.place : ''}`, route: 'calendar/' + e._d })) };
  }
  if (/(할\s*일|할일|투두|todo|해야\s*할|마감)/i.test(q)) {
    let ts = await store.openTasks();
    if (r) ts = ts.filter(t => t.due && t.due >= r[0] && t.due <= r[1]);
    if (/밀린|지난|늦은/.test(q)) ts = ts.filter(t => t.due && t.due < today);
    ts.sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    return { text: ts.length ? `${r ? r[2] + ' ' : ''}남은 할 일 ${ts.length}개예요.` : '남은 할 일이 없어요. 깔끔해요.', items: ts.slice(0, 20).map(t => ({ icon: 'check2', title: t.title, sub: [t.due && '마감 ' + t.due.slice(5).replace('-', '/'), t.who, t.project].filter(Boolean).join(' · '), route: 'tasks' })) };
  }
  if (/(지출|비용|돈|얼마|썼|정산|영수증)/.test(q)) {
    const [a, b, label] = r || [ymd(new Date(base.getFullYear(), base.getMonth(), 1)), today, '이번 달'];
    let xs = (await db.list('expenses')).filter(e => e.date >= a && e.date <= b);
    if (/정산\s*(안|전)|미정산/.test(q)) xs = xs.filter(e => e.status !== 'done');
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
