// 공모전 모음 사이트에서 목록 읽기: 링커리어, 콘테스트코리아, 위비티.
// 지키는 것: ① 사이트가 robots.txt로 열어 둔 주소만 ② 요청 사이 1.2초 넘게 쉼 ③ 사이트마다 하루 읽는 양에 한도 ④ 로그인·우회 없음.
// 목록 모양이 바뀌면 그 사이트만 "못 읽음"으로 적고 나머지는 계속 모아요. 못 읽은 곳은 앱에서 "링크로 담기"로 넣게 알려 줘요.
import { canFetch, UA } from './robots.mjs';
import { parse } from '../js/acts.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const last = new Map(), used = new Map();
export const CAP = { 'linkareer.com': 95, 'www.contestkorea.com': 50, 'www.wevity.com': 50 };
export async function get(url) {
  const u = new URL(url); const can = await canFetch(url); if (!can.ok) throw new Error(can.why);
  const n = used.get(u.host) || 0; if (n >= (CAP[u.host] || 30)) throw new Error('오늘 읽을 양을 다 씀');
  const wait = Math.max(1200, (can.delay || 0) * 1000) - (Date.now() - (last.get(u.host) || 0)); if (wait > 0) await sleep(wait);
  used.set(u.host, n + 1);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { last.set(u.host, Date.now()); }
}
export const left = host => (CAP[host] || 30) - (used.get(host) || 0);

const ent = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&middot;/g, '·').replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c));
export const text = h => ent(String(h || '').replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
const one = h => text(h).replace(/\s+/g, ' ').trim();
const kstDay = (d = new Date()) => new Date(new Date(d).getTime() + 9 * 36e5).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* "12.11"처럼 해가 없는 날짜: 기준일과 같거나 그 뒤에 처음 오는 그 날 */
export function mdOnOrAfter(md, from) { const m = String(md || '').match(/(\d{1,2})\s*[.\/]\s*(\d{1,2})/); if (!m) return ''; let y = +from.slice(0, 4); for (let i = 0; i < 2; i++, y++) { const d = `${y}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`; if (d >= from) return d; } return ''; }
const ymd = s => { const m = String(s || '').match(/(20\d\d)\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/); return m ? `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}` : ''; };

export const SUP = /(서포터즈|서포터|기자단|홍보\s*대사|앰배서더|앰버서더|마케터|에디터|크리에이터|리포터|체험단|모니터링단|평가단|홍보단|참여단|메이트|크루)/;
/* 참가 대상 말들을 앱의 다섯 가지로: 일반인·누구나가 끼면 누구나, 대학생이 끼면 대학생, 초·중·고만 있으면 청소년 */
export function whoOf(names, note = '') {
  const s = [].concat(names || []).join(' ') + ' ' + note;
  if (/(제한\s*없|누구나|일반인|전\s*국민|국민\s*누구|대상\s*무관)/.test(s)) return 'anyone';
  if (/(대학생|대학원생|대학\(원\)생)/.test(s)) return 'univ';
  if (/(청년|만\s*\d+\s*세\s*(이상|~|부터))/.test(s) && !/(초등|중학|고등|유치|어린이)/.test(s)) return 'youth';
  if (/(청소년|초등|중학|고등|유치|어린이|영유아)/.test(s)) return 'teen';
  return '';
}
/* 자세한 글에서 개인/팀 인원·지역·상금 같은 것을 더 읽어 채움. 사이트가 칸으로 준 값이 있으면 그게 먼저 */
function fromText(title, body, o) {
  const p = parse(`${title}\n${body}`.slice(0, 4000));
  for (const k of ['part', 'teamMin', 'teamMax', 'region', 'whoNote', 'prize']) if ((o[k] == null || o[k] === '') && p[k]) o[k] = p[k];
  if (!o.who && p.who) o.who = p.who;
  return o;
}
const brief = t => String(t || '').replace(/\n{2,}/g, '\n').trim().slice(0, 600);

// ── 링커리어 ── 목록 화면에 같이 실려 오는 자료(__NEXT_DATA__)를 읽어요
const apollo = html => { const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (!m) throw new Error('목록 모양이 바뀜'); const st = (JSON.parse(m[1]).props?.pageProps || {}).__APOLLO_STATE__; if (!st) throw new Error('목록 모양이 바뀜'); return st; };
const msDay = ms => (ms ? kstDay(new Date(+ms)) : '');
export function linkareerList(html, kind) {
  const st = apollo(html), root = st.ROOT_QUERY || {}; const key = Object.keys(root).find(k => k.startsWith('activities(')); if (!key) throw new Error('목록 모양이 바뀜');
  const out = [];
  for (const n of root[key].nodes || []) {
    const a = st[n.__ref]; if (!a || !a.title) continue;
    if (kind === 'activity' && !(+a.activityTypeID === 1 && SUP.test(a.title))) continue;   /* 대외활동 목록에서는 서포터즈·기자단 종류만 */
    if (kind === 'contest' && +a.activityTypeID !== 3) continue;
    out.push({ sid: 'la' + a.id, src: '링커리어', pri: 1, type: kind === 'contest' ? 'contest' : 'supporters', title: one(a.title), host: one(a.organizationName), due: msDay(a.recruitCloseAt), link: `https://linkareer.com/activity/${a.id}`, poster: (a.thumbnailImage && st[a.thumbnailImage.__ref]?.url) || '' });
  }
  return out;
}
export function linkareerDetail(html, id) {
  const st = apollo(html), a = st['Activity:' + id]; if (!a) throw new Error('자세히 모양이 바뀜');
  const de = r => (r && r.__ref ? st[r.__ref] : null), names = l => (l || []).map(de).filter(Boolean).map(x => x.name).filter(Boolean);
  const body = text(de(a.detailText)?.text || ''); const targets = names(a.targets); const files = (a.files || []).map(de).filter(Boolean);
  const o = { det: 1, start: msDay(a.recruitStartAt), due: msDay(a.recruitCloseAt), host: one(a.organizationName), field: [...new Set([...names(a.categories), ...names(a.interests)])].slice(0, 4).join(', '), who: whoOf(targets), whoNote: '', region: names(a.regions).filter(x => !/전체|전국/.test(x)).slice(0, 2).join('·'),
    poster: (files.find(f => de(f.type)?.name === '포스터') || files.find(f => de(f.type)?.name === '썸네일') || {}).url || '', body: brief(body), apply: /^https?:\/\//.test(a.applyDetail || '') ? a.applyDetail : (a.homepageURL || '') };
  fromText(a.title, body, o);
  if (!o.prize && +a.tenThousandUnitOfReward > 0) o.prize = `시상 ${Number(a.tenThousandUnitOfReward).toLocaleString('ko-KR')}만원`;
  return o;
}

// ── 콘테스트코리아 ── 목록에 접수·발표 날짜와 대상이 같이 있어요
export function ckList(html, kind, today = kstDay()) {
  const at = html.indexOf('list_style_2'); if (at < 0) throw new Error('목록 모양이 바뀜');
  const out = [];
  for (const c of html.slice(at).split('<div class="title">').slice(1)) {
    const href = (c.match(/href="(view\.php\?[^"]+)"/) || [])[1]; const no = href && (href.match(/str_no=(\d+)/) || [])[1]; const title = one((c.match(/<span class="txt">([\s\S]*?)<\/span>/) || [])[1]).replace(/^[「『]\s*|\s*[」』]$/g, '');
    if (!no || !title) continue;
    const cond = one((c.match(/<span class="condition">([^<]*)</) || [])[1]); if (/마감|종료/.test(cond) && !/임박/.test(cond)) continue;
    const rec = c.match(/<em>접수<\/em>\s*([\d.]+)\s*~\s*([\d.]+)/), ann = c.match(/<em>발표<\/em>\s*([\d.]+)/), dn = c.match(/<span class="day">\s*D\s*-\s*(\d+)/);
    let due = rec ? mdOnOrAfter(rec[2], today) : ''; if (!due && dn) due = addDays(today, +dn[1]);
    let start = ''; if (rec && due) { const s = mdOnOrAfter(rec[1], addDays(due, -330)); start = s && s <= due ? s : ''; }
    const target = one((c.match(/<strong>대상<\/strong>\s*\.?\s*([^<]*)/) || [])[1]).replace(/▶/g, '').trim();
    const type = kind === 'activity' || (SUP.test(title) && !/공모전|대회|콘테스트/.test(title)) ? 'supporters' : 'contest'; if (kind === 'activity' && !SUP.test(title)) continue;
    const it = { sid: 'ck' + no, src: '콘테스트코리아', pri: 2, type, title, host: one((c.match(/<strong>주최<\/strong>\s*\.?\s*([^<]*)/) || [])[1]).split(/\s*,\s*/)[0], due, start, link: 'https://www.contestkorea.com/sub/' + ent(href), poster: '',
      field: [...c.matchAll(/<span class="category">([^<]*)</g)].map(m => one(m[1]).replace(/•/g, '·')).slice(0, 3).join(', '), who: whoOf(target) };
    const an = ann && due ? mdOnOrAfter(ann[1], due) : ''; if (an) it.stages = [{ id: 'ann', kind: 'final', date: an }];
    out.push(it);
  }
  return out;
}
export function ckDetail(html) {
  const row = th => { const m = html.match(new RegExp(`<th[^>]*>\\s*${th}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`)); return m ? one(m[1]) : ''; };
  const per = row('접수기간').match(/(20\d\d[.\-\/]\s*\d{1,2}[.\-\/]\s*\d{1,2})\s*~\s*(20\d\d[.\-\/]\s*\d{1,2}[.\-\/]\s*\d{1,2})/); const target = row('참가대상').replace(/해당자|▶/g, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const img = (html.match(/<div class="img_area">\s*<div>\s*<img src="([^"]+)"/) || [])[1]; const prize = row('시상내역').replace(/^상금\s*\(\s*|\s*\)$/g, '').slice(0, 60); const home = (html.match(/class="homepage_go[^"]*"[^>]*val2="(https?:\/\/[^"]+)"/) || html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="homepage_go"/) || [])[1] || '';
  const o = { det: 1, start: per ? ymd(per[1]) : '', due: per ? ymd(per[2]) : '', host: row('주최 . 주관').split(/\s*[,\/]\s*/)[0], who: whoOf(target), whoNote: /만\s*\d+\s*세|학년|재학|거주/.test(target) ? target.slice(0, 40) : '', prize: /무관|없음|해당\s*없/.test(prize) ? '' : prize, poster: img ? new URL(img, 'https://www.contestkorea.com').href : '', apply: ent(home), body: brief(target ? `참가 대상: ${target}` : '') };
  return fromText('', `${target}\n${row('시상내역')}`, o);
}

// ── 위비티 ── 목록에는 D-며칠만 있어서, 정확한 날짜·대상·포스터는 자세히 화면에서 읽어요
export function wevityList(html, kind, today = kstDay()) {
  if (!/<ul class="list">/.test(html)) throw new Error('목록 모양이 바뀜');
  const out = [];
  const re = /<div class="tit">\s*<a href="(\?c=(?:find|active)[^"]*?ix=(\d+)[^"]*)">([\s\S]*?)<\/a>\s*<div class="sub-tit">\s*분야\s*:\s*([^<]*)<\/div>\s*<\/div>\s*<div class="organ">([^<]*)<\/div>\s*<div class="day">\s*([^<]*)<span class="dday[^"]*">([^<]*)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const title = one(m[3].replace(/<span class=['"]stat[\s\S]*?<\/span>/g, '')); const field = one(m[4]); const dn = m[6].match(/D\s*-\s*(\d+)/); if (!title || /마감$/.test(one(m[7])) && !dn) continue;
    const sup = SUP.test(title) && !/공모전|대회|콘테스트|경진/.test(title); if (kind === 'active' && !sup) continue;
    if (!sup && !/(공모|대회|콘테스트|경진|챌린지|어워드|해커톤|영화제|페스티벌|contest|competition|award|challenge)/i.test(title)) continue;   /* 공모전 목록에 섞인 강의·모임 광고는 뺌 */
    out.push({ sid: 'wv' + m[2], src: '위비티', pri: 3, type: sup ? 'supporters' : 'contest', title, host: one(m[5]), due: dn ? addDays(today, Math.max(0, +dn[1] - 1)) : '', approx: 1, link: `https://www.wevity.com/?c=${kind === 'active' ? 'active' : 'find'}&s=1&gbn=view&ix=${m[2]}`, poster: '', field: field.split(/\s*,\s*/).filter(x => !/기타/.test(x)).slice(0, 3).join(', ') });
  }
  return out;
}
export function wevityDetail(html) {
  const li = t => { const m = html.match(new RegExp(`<span class="tit">\\s*${t}\\s*</span>([\\s\\S]*?)</li>`)); return m ? one(m[1].replace(/<span class="cil-dday">[\s\S]*?<\/span>/, '')) : ''; };
  const per = li('접수기간').match(/(20\d\d-\d{1,2}-\d{1,2})\s*~\s*(20\d\d-\d{1,2}-\d{1,2})/); const target = li('응모대상'); const img = (html.match(/<div class="thumb">\s*<img src="([^"]+)"/) || [])[1];
  const bi = html.indexOf('id="viewContents"'); const body = bi > 0 ? text(html.slice(bi + 18, bi + 9000).replace(/^[^>]*>/, '')) : '';
  const tot = li('총 상금'), first = li('1등 상금'); const home = (html.match(/<span class="tit">\s*홈페이지\s*<\/span>\s*<a href="(https?:\/\/[^"]+)"/) || [])[1] || '';
  const o = { det: 1, approx: 0, start: per ? ymd(per[1]) : '', due: per ? ymd(per[2]) : '', host: li('주최/주관').split(/\s*\/\s*/)[0], who: whoOf(target), whoNote: '', prize: tot && !/없음|해당|^-$/.test(tot) ? `총상금 ${tot}`.slice(0, 40) : first && !/없음|^-$/.test(first) ? `1등 ${first}`.slice(0, 40) : '', poster: img ? new URL(img, 'https://www.wevity.com').href : '', apply: ent(home), body: brief(body) };
  return fromText(li('분야'), body, o);
}

// ── 한데 모으기 ──
export const SITES = [
  { name: '링커리어', host: 'linkareer.com', lists: first => [...Array.from({ length: first ? 8 : 2 }, (_, i) => ['contest', `https://linkareer.com/list/contest${i ? '?page=' + (i + 1) : ''}`]), ...Array.from({ length: first ? 4 : 2 }, (_, i) => ['activity', `https://linkareer.com/list/activity${i ? '?page=' + (i + 1) : ''}`])], list: linkareerList, detail: (html, it) => linkareerDetail(html, it.sid.slice(2)), maxDetail: 70 },
  { name: '콘테스트코리아', host: 'www.contestkorea.com', lists: first => [['contest', 'https://www.contestkorea.com/sub/list.php?int_gbn=1'], ...(first ? [['contest', 'https://www.contestkorea.com/sub/list.php?int_gbn=1&page=2']] : []), ['activity', 'https://www.contestkorea.com/sub/list.php?int_gbn=2&Txt_bcode=040110001']], list: ckList, detail: html => ckDetail(html), maxDetail: 40 },
  { name: '위비티', host: 'www.wevity.com', lists: first => [['find', 'https://www.wevity.com/?c=find&s=1&gub=1'], ...(first ? [['find', 'https://www.wevity.com/?c=find&s=1&gub=1&gp=2']] : []), ['active', 'https://www.wevity.com/?c=active&s=1']], list: wevityList, detail: html => wevityDetail(html), maxDetail: 40 },
];
/* 목록 읽기: 사이트마다 결과와 상태(읽음/못 읽음과 까닭)를 돌려줘요 */
export async function collectLists(have = new Set()) {
  const found = [], status = [];
  for (const s of SITES) {
    const first = !have.has(s.name); let n = 0, err = '';
    for (const [kind, url] of s.lists(first)) {
      try { const got = s.list(await get(url), kind); n += got.length; found.push(...got); if (!got.length && kind !== 'activity' && kind !== 'active') err = err || '목록이 비어 있음'; }
      catch (e) { err = err || e.message; if (/robots|막아|HTTP 4|HTTP 5|다 씀/.test(e.message)) break; }
    }
    status.push({ name: s.name, ok: n > 0, n, why: n > 0 ? '' : (err || '목록이 비어 있음') });
  }
  return { found, status };
}
/* 자세히 읽기: 아직 안 읽은 것을 마감 가까운 순으로, 사이트마다 정해 둔 개수까지만 */
export async function fillDetails(items) {
  let n = 0;
  for (const s of SITES) {
    const todo = items.filter(i => !i.det && (i.sources || []).some(x => x.n === s.name)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, s.maxDetail);
    for (const it of todo) {
      const src = it.sources.find(x => x.n === s.name); if (left(s.host) <= 0) break;
      try { const d = s.detail(await get(src.u), { sid: src.id || '' }); const primary = it.pri === SITES.indexOf(s) + 1;
        for (const [k, v] of Object.entries(d)) { if (v === '' || v == null) continue; if (primary || it[k] === '' || it[k] == null || k === 'det' || (k === 'due' && it.approx)) it[k] = v; }
        if (d.due) it.approx = 0; n++; }
      catch (e) { it.detErr = (it.detErr || 0) + 1; if (it.detErr >= 3) it.det = 1; if (/robots|막아|다 씀/.test(e.message)) break; }
    }
  }
  return n;
}
