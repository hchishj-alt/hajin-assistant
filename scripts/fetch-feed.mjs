// 지원사업·창업 정보 수집 (GitHub Actions가 매일 무료로 실행 → data/feed.json)
// 출처는 data/sources.json 에서 고칠 수 있어요. 한 곳이 실패해도 나머지는 계속 모아요.
import fs from 'node:fs';
const sources = JSON.parse(fs.readFileSync('data/sources.json', 'utf8'));
const prev = fs.existsSync('data/feed.json') ? JSON.parse(fs.readFileSync('data/feed.json', 'utf8')) : { items: [] };
const un = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
const out = new Map(prev.items.map(i => [i.link, i]));
const log = [];
for (const s of sources.feeds) {
  try {
    const r = await fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 (feed reader)' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    let n = 0;
    for (const b of blocks.slice(0, s.max || 40)) {
      const title = un(tag(b, 'title'));
      let link = un(tag(b, 'link')) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
      if (!title || !/^https?:/.test(link)) continue;
      const date = new Date(un(tag(b, 'pubDate')) || un(tag(b, 'updated')) || un(tag(b, 'published')) || Date.now());
      const src = un(tag(b, 'source')) || s.name;
      if (!out.has(link)) n++;
      out.set(link, { ...(out.get(link) || {}), title: title.replace(/ - [^-]{2,30}$/, ''), link, desc: un(tag(b, 'description') || tag(b, 'summary')).slice(0, 240), date: isNaN(date) ? new Date().toISOString() : date.toISOString(), source: src, type: s.type, q: s.name });
    }
    log.push(`${s.name}: ${blocks.length}개 (새 글 ${n})`);
  } catch (e) { log.push(`${s.name}: 실패 (${e.message})`); }
}
const cut = Date.now() - 75 * 864e5;
const items = [...out.values()].filter(i => new Date(i.date).getTime() > cut).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400);
fs.writeFileSync('data/feed.json', JSON.stringify({ updatedAt: new Date().toISOString(), log, items }, null, 1));
console.log(log.join('\n'), '\n총', items.length);
