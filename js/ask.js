// 비서에게 묻는 말 중 "사람·업체·프로젝트·우선순위"에 관한 것. 해당 없으면 null → query.js의 기본 답으로
import * as db from './db.js';
import * as store from './store.js';

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const md = s => s ? s.slice(5).replace('-', '/') : '';
const key = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const won = n => Number(n).toLocaleString() + '원';
const num = v => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
const sameP = (who, name) => !!who && !!name && String(who).split(/[,\s]+/).some(w => w === name || w === name.slice(1) || name === w.slice(1));
const taskItem = (t, today) => ({ icon: 'check2', title: t.title, sub: [t.due && (t.due < today ? '밀림 · ' : '') + '마감 ' + md(t.due), t.who, t.project].filter(Boolean).join(' · '), route: 'tasks' });
const evItem = e => ({ icon: 'calendar', title: e.title, sub: [md(e.date), e.start || '종일', e.place, e.who].filter(Boolean).join(' · '), route: 'calendar/' + e.date });

export async function smart(q, base = new Date(), r = null) {
  const today = ymd(base); const Q = key(q);
  const tasks = await db.list('tasks'), open = tasks.filter(t => !t.done);
  const me = (await db.kvGet('name', '')) || '';
  const names = [...new Set([...(await db.list('contacts')).filter(c => c.group === '팀' || true).map(c => c.name), ...(await store.teammateNames())].filter(n => n && n.length >= 2))];
  const person = names.sort((a, b) => b.length - a.length).find(n => Q.includes(key(n)) || (n.length === 3 && new RegExp(`(^|[^가-힣])${n.slice(1)}(이|가|는|은|의|한테|님|씨|\\s|$)`).test(q)));
  const vendors = await db.list('vendors');
  const projects = (await db.list('projects')).map(p => p.name).filter(Boolean);

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
        return { text: same.length > 1 ? `“${best.item}”은 ${best.v.name}가 ${won(best.n)}으로 가장 싸요. ${same.length}곳을 비교했어요.${same[1].n > best.n ? ` 다음은 ${same[1].v.name} ${won(same[1].n)}이에요.` : ''}` : `“${best.item}”은 ${best.v.name}에서 ${best.n ? won(best.n) : best.price}이에요.${best.at ? ` (${md(best.at)} 기준)` : ''}`, items: hits.slice(0, 8).map(p => ({ icon: 'receipt', title: `${p.v.name} · ${p.item}`, sub: [p.n ? won(p.n) : p.price, p.note, p.at && md(p.at) + ' 기준'].filter(Boolean).join(' · '), route: 'vendors', tel: p.v.phone })) }; }
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
    return { text: `${top[0]} 님이 남은 일 ${top[1].n}개로 가장 바빠요${top[1].late ? ` (밀린 것 ${top[1].late}개)` : ''}.${rows.length > 1 && low[1].n < top[1].n ? ` 새 일은 ${low[0]} 님(${low[1].n}개)에게 맡기는 게 좋아요.` : ''}`, items: rows.map(([n, c]) => ({ icon: 'user', title: n, sub: `남은 일 ${c.n}개${c.late ? ` · 밀림 ${c.late}개` : ''}`, route: 'tasks' })) };
  }

  // 프로젝트 진행 상황, 프로젝트에 쓴 돈
  const proj = projects.sort((a, b) => b.length - a.length).find(p => Q.includes(key(p)));
  if (proj && /(얼마|썼|지출|비용|예산)/.test(q)) { const xs = (await db.list('expenses')).filter(e => e.project === proj); const sum = xs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { text: `“${proj}”에 지금까지 ${won(sum)} 썼어요 (${xs.length}건).`, items: xs.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map(e => ({ icon: 'receipt', title: e.title, sub: `${won(e.amount)} · ${md(e.date)}`, route: 'money' })) }; }
  if (proj && /(어디까지|진행|상황|현황|얼마나|남았|어때|어떻게|됐|끝났|정리)/.test(q)) { const ts = tasks.filter(t => t.project === proj), done = ts.filter(t => t.done).length, left = ts.filter(t => !t.done), late = left.filter(t => t.due && t.due < today); const next = left.filter(t => t.due && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
    const evs = (await db.list('events')).filter(e => (e.project === proj || key(e.title).includes(key(proj))) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    return { text: ts.length ? `“${proj}”은 할 일 ${ts.length}개 중 ${done}개 끝났어요 (${Math.round(done / ts.length * 100)}%).${late.length ? ` 밀린 게 ${late.length}개 있어요.` : ''}${next ? ` 다음 마감은 ${md(next.due)} “${next.title}”${next.who ? `(${next.who})` : ''}이에요.` : ''}` : `“${proj}”에 묶인 할 일이 아직 없어요.`, items: [...late, ...left.filter(t => !late.includes(t)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))].slice(0, 10).map(t => taskItem(t, today)).concat(evs.slice(0, 3).map(evItem)) }; }

  // 사람: 뭐 하고 있는지, 할 일, 일정
  if (person && !/(번호|전화|연락처|이메일|메일)/.test(q) && /(뭐\s*하|뭐하|하고\s*있|할\s*일|할일|맡은|담당|일정|스케줄|약속|바빠|바쁜|언제\s*돼|시간\s*돼|있어|있나|뭐야|상황)/.test(q)) {
    const short = person.length === 3 ? person.slice(1) : person; const mine = open.filter(t => sameP(t.who, person)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); const late = mine.filter(t => t.due && t.due < today);
    const [a, b, label] = r || [today, ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 13)), '앞으로 2주']; const evs = [];
    for (const e of await db.list('events')) if (sameP(e.who, person) || key(e.title).includes(key(short))) for (let d = new Date(a + 'T00:00'); ymd(d) <= b; d.setDate(d.getDate() + 1)) if (e.date === ymd(d) || store.repeatsOn(e, ymd(d))) { evs.push({ ...e, date: ymd(d) }); break; }
    evs.sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')));
    if (/(일정|스케줄|약속)/.test(q)) return { text: evs.length ? `${label} ${short} 님이 낀 일정은 ${evs.length}개예요.` : `${label}에는 ${short} 님이 낀 일정이 없어요.`, items: evs.map(evItem) };
    return { text: mine.length || evs.length ? `${short} 님은 남은 할 일 ${mine.length}개${late.length ? `(밀린 것 ${late.length}개)` : ''}, ${label} 일정 ${evs.length}개예요.${mine[0] ? ` 가장 급한 건 “${mine[0].title}”${mine[0].due ? ` (마감 ${md(mine[0].due)})` : ''}이에요.` : ''}` : `${short} 님에게 맡겨진 일이나 일정이 아직 없어요.`, items: [...mine.slice(0, 10).map(t => taskItem(t, today)), ...evs.slice(0, 5).map(evItem)] };
  }

  // 밀린 일
  if (/(밀린|늦은|지난\s*마감|못\s*끝낸)/.test(q)) { const late = (await store.openTasks()).filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
    return { text: late.length ? `밀린 일이 ${late.length}개 있어요. 가장 오래된 건 “${late[0].title}” (마감 ${md(late[0].due)})이에요.` : '밀린 일이 없어요. 잘하고 있어요.', items: late.slice(0, 15).map(t => taskItem(t, today)) }; }

  // 뭐부터 해야 하는지
  if (/(뭐\s*부터|뭐부터|뭘\s*먼저|뭐\s*먼저|우선\s*순위|제일\s*급한|가장\s*급한|급한\s*(거|것|일))/.test(q)) {
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
