// 대외활동(공모전·서포터즈) 찾아오기 (GitHub Actions가 매일 무료로 실행 → data/acts.json)
// 뉴스 검색 RSS처럼 가져가라고 열어 둔 주소만 읽어요. 출처는 data/act-sources.json 에서 고칠 수 있어요. 한 곳이 실패해도 나머지는 계속 모아요.
// 시험: node scripts/fetch-acts.mjs --file 저장해_둔.xml  (인터넷 없이 읽는 법만 확인)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse, typeName } from '../js/acts.js';

const un = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
const KEY = /(공모전|서포터즈|기자단|앰배서더|홍보\s*대사|경진\s*대회|콘테스트|크리에이터\s*모집|체험단)/;
const OPEN = /(모집|접수|개최|공모|참가자|신청|열린다|연다|실시|진행|응모|마감|까지)/;
const DONE = /(시상|수상|입상|당선|성료|성황리|마쳤|마무리|선정|결과\s*발표|발대식|해단식|수료식|우수상|우수작|심사\s*결과|(대상|금상|1등)(에|은|을|,)\s|\d[\d,]*\s*(건|편|점|팀|명|작품)\s*(접수|응모|출품|몰|지원|참여|$)|\d[\d,]*\s*(건|편|점)$|(접수|모집|활동|응모)\s*(를|을)?\s*마감(했|$|\s*$)|마감했)/;
/* 모집 공고가 아닌 것: 운영 대행사 찾기, 사내 행사, 해설 기사, 나라 밖 소식 */
const NOISE = /(대행사|대행\s*의뢰|용역|입찰|직원\s*(대상|아이디어|제안)|임직원|갈린다|이끈다|노하우|비결|中|중국서|중국\s|베트남|Vietnam)/i;
const BADSRC = /(Vietnam|European|대행|아이보스)/i;
export const keep = (title, text = title) => KEY.test(title) && OPEN.test(text) && !DONE.test(title) && !NOISE.test(title);

/* 기사 제목에서 공모전 이름만: 따옴표 안 이름 → 키워드가 든 토막 → 제목 그대로 */
const TAGS = /^(모집|공모|공고|알림|안내|포토|단독|소식|행사|종합|속보|사진|영상|기획|이벤트)$/;
export function lead(title) { const m = title.match(/^\s*[\[【(]([^\]】)]{2,16})[\]】)]\s*/); return m ? { tag: m[1].trim(), rest: title.slice(m[0].length) } : { tag: '', rest: title }; }
export function nameOf(title) {
  title = lead(title).rest.replace(/[.。!]+\s*$/, '').replace(/\s*(서류\s*)?(접수|모집)\s*공고.*$/, '').replace(/\s*[_|]\s*\d{1,2}\s*[.\/월].*$/, '').replace(/\s*\(\s*\d+\s*명\s*\)\s*$/, '').replace(/\s*\(\s*\d+\s*명\s*\)\s*/, ' ').trim();
  const q = title.match(/[‘'“"「『<]([^’'”"」』>]{3,44})[’'”"」』>]/g) || [];
  for (const x of q) { const s = x.slice(1, -1).trim(); if (KEY.test(s)) return s; }
  const safe = title.replace(/[‘'“"「『<][^’'”"」』>]{3,44}[’'”"」』>]/g, m => m.replace(/,/g, '\u0001'));   /* 따옴표 안 쉼표에서는 자르지 않음 */
  const parts = safe.split(/\s*[,…·|]\s*|\s+[-–]\s+|\.\.\./).map(s => s.replace(/\u0001/g, ',').trim()).filter(Boolean);
  let hit = parts.find(p => KEY.test(p)) || title;
  if (q.length === 1 && !KEY.test(q[0]) && KEY.test(hit) && !hit.includes(q[0].slice(1, -1))) hit = `${q[0].slice(1, -1)} ${hit}`;
  for (let i = 0; i < 3; i++) hit = hit.replace(/\s*(참가자|참여자|지원자|단원|작품)?\s*(을|를)?\s*(모집|접수|개최|실시|진행|공모|연다|열린다|시작|오픈|선발)(한다|합니다|해요|해|중|하고|나서|…)?[.!]?\s*$/, '');
  hit = hit.replace(/[‘'“"’”]/g, '').replace(/\s+/g, ' ').trim();
  return hit.length >= 4 ? hit.slice(0, 60) : title.slice(0, 60);
}
export function hostOf(title) {
  const l = lead(title); if (l.tag && !TAGS.test(l.tag) && !KEY.test(l.tag)) return l.tag; title = l.rest;
  const W = '[가-힣A-Za-z0-9()·&]';
  const all = [...title.matchAll(new RegExp(`(?:^|…\\s*|\\.\\.\\.\\s*|[”"’']\\s+)(${W}{2,14}(?:\\s${W}{1,8})?),\\s`, 'g'))].map(m => m[1].trim()).filter(x => !KEY.test(x) && !/(상금|상품|만\s*원|억\s*원|\d{3,}|까지|마감|모집|접수)/.test(x));   /* "…서울시, 숏폼 공모전"처럼 쉼표 바로 앞 */
  if (all.length) return all[all.length - 1];
  const m = title.match(new RegExp(`^(${W}{2,14})\\s*[‘'“"「『<]`)); return m && !KEY.test(m[1]) ? m[1].trim() : '';
}
/* "20일까지 접수"처럼 달이 없으면 기사 난 달(그 날짜가 지났으면 다음 달) */
export function bareDue(text, when) { const m = String(text).match(/(?:오는\s*)?(\d{1,2})일\s*(?:까지|마감)/); if (!m || +m[1] < 1 || +m[1] > 31) return ''; const k = new Date(new Date(when).getTime() + 9 * 36e5); let mo = k.getUTCMonth(); if (+m[1] < k.getUTCDate()) mo++; const d = new Date(Date.UTC(k.getUTCFullYear(), mo, +m[1])); return d.getUTCDate() === +m[1] ? d.toISOString().slice(0, 10) : ''; }
/* 이름이 "숏폼 공모전"처럼 너무 흔하면 주최를 앞에 붙여 알아볼 수 있게 */
export const full = (name, host) => (name = name.replace(/^(총\s*)?상금\s*[\d,]+\s*(만|억)\s*원\s*/, '').trim() || name, host && !name.includes(host) && name.replace(/\s/g, '').length <= 11 ? `${host} ${name}` : name);
export function itemsOf(xml, src, now = new Date()) {
  const out = [];
  for (const b of (xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || []).slice(0, src.max || 40)) {
    const raw = un(tag(b, 'title')); let link = un(tag(b, 'link')) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    if (!raw || !/^https?:/.test(link)) continue;
    const title = raw.replace(/ - [^-]{2,30}$/, ''); const desc = un(tag(b, 'description') || tag(b, 'summary')).slice(0, 300); const text = `${title} ${desc}`;
    if (!keep(title, text) || BADSRC.test(un(tag(b, 'source')))) continue;
    const date = new Date(un(tag(b, 'pubDate')) || un(tag(b, 'updated')) || un(tag(b, 'published')) || now); const when = isNaN(date) ? now : date;
    const p = parse(text, when);
    if (!p.due) p.due = bareDue(text, when);
    if (p.due && p.due < when.toISOString().slice(0, 10)) delete p.due;   /* 기사보다 이른 날짜는 마감이 아님 */
    const type = /서포터즈|기자단|앰배서더|홍보\s*대사|체험단|크리에이터\s*모집/.test(title) && !/공모전|경진\s*대회|콘테스트/.test(title) ? 'supporters' : src.type === 'supporters' && !/공모전/.test(title) ? 'supporters' : 'contest';
    out.push({ id: 'n' + crypto.createHash('sha1').update(link).digest('hex').slice(0, 12), type, title: full(nameOf(title), hostOf(title) || p.host), host: hostOf(title) || p.host, due: p.due || '', start: p.start || '', link, poster: '', body: title + (desc && desc !== title && !desc.startsWith(title.slice(0, 20)) ? '\n' + desc : ''), field: '', part: p.part || '', teamMin: p.teamMin || null, teamMax: p.teamMax || null, who: p.who || '', whoNote: p.whoNote || '', region: p.region || '', prize: p.prize || '', source: un(tag(b, 'source')) || src.name, date: when.toISOString() });
  }
  return out;
}
/* 같은 공모전을 다룬 기사 여러 개는 하나로: 이름에서 연도·회차·꾸밈말을 빼고 두 글자씩 겹치는 정도로 견줌 */
const norm = t => t.replace(/20\d\d\s*년?/g, '').replace(/제?\s*\d+\s*(회|기)/g, '').replace(/(참가자|모집|접수|개최|공모전|서포터즈)/g, m => (m === '공모전' || m === '서포터즈' ? m : '')).replace(/([가-힣]{2,3})(특별시|광역시|시|군|구|도)(?=\s|[가-힣])/g, '$1').replace(/[^가-힣A-Za-z0-9]/g, '');
const grams = s => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
export const alike = (a, b) => { const x = grams(norm(a)), y = grams(norm(b)); if (x.size < 3 || y.size < 3) return norm(a) === norm(b); let n = 0; for (const g of x) if (y.has(g)) n++; return n / Math.min(x.size, y.size) >= 0.72; };
export function merge(prev, found, now = new Date()) {
  const today = now.toISOString().slice(0, 10); const cut = now.getTime() - 30 * 864e5;
  const list = [];
  prev = prev.filter(i => { const t = String(i.body || i.title).split('\n')[0]; return keep(t, t + ' 모집') && !BADSRC.test(i.source || ''); }).map(i => { const t = String(i.body || i.title).split('\n')[0]; const host = hostOf(t) || ''; return { ...i, host, title: full(nameOf(t), host), due: i.due || bareDue(t, i.date) }; });   /* 거르는 법이 나아지면 예전에 모은 것도 다시 거름 */
  for (const it of [...prev, ...found]) { const i = list.findIndex(c => c.id === it.id || c.link === it.link || alike(c.title, it.title)); if (i < 0) { list.push(it); continue; } const cur = list[i]; list[i] = { ...cur, due: cur.due || it.due, start: cur.start || it.start, part: cur.part || it.part, teamMax: cur.teamMax || it.teamMax, teamMin: cur.teamMin || it.teamMin, who: cur.who || it.who, whoNote: cur.whoNote || it.whoNote, region: cur.region || it.region, prize: cur.prize || it.prize, host: cur.host || it.host }; }
  return list.filter(i => (i.due ? i.due >= today : new Date(i.date).getTime() > cut)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.date.localeCompare(a.date)).slice(0, 160);
}

const fileArg = process.argv.indexOf('--file');
if (process.argv[1] && process.argv[1].endsWith('fetch-acts.mjs')) {
  const sources = JSON.parse(fs.readFileSync('data/act-sources.json', 'utf8'));
  const prev = fs.existsSync('data/acts.json') ? JSON.parse(fs.readFileSync('data/acts.json', 'utf8')) : { items: [] };
  const found = []; const log = [];
  if (fileArg > 0) { const xml = fs.readFileSync(process.argv[fileArg + 1], 'utf8'); const got = itemsOf(xml, sources.feeds[0]); found.push(...got); log.push(`파일: ${got.length}개`); }
  else for (const s of sources.feeds) {
    const url = s.url || `https://news.google.com/rss/search?q=${encodeURIComponent(s.q)}&hl=ko&gl=KR&ceid=KR:ko`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (feed reader)' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const got = itemsOf(await r.text(), s); found.push(...got); log.push(`${s.name}: ${got.length}개`);
    } catch (e) { log.push(`${s.name}: 실패 (${e.message})`); }
  }
  const items = merge(prev.items || [], found);
  if (fileArg > 0) { console.log(log.join('\n')); for (const i of items) console.log(`- [${typeName(i.type)}] ${i.title} | 주최 ${i.host || '-'} | 마감 ${i.due || '-'} | ${i.part || '-'} ${i.teamMax || ''} | ${i.who || '-'} | ${i.region || '-'} | ${i.prize || '-'}`); }
  else { fs.writeFileSync('data/acts.json', JSON.stringify({ updatedAt: new Date().toISOString(), log, items }, null, 1)); console.log(log.join('\n'), '\n총', items.length); }
}
