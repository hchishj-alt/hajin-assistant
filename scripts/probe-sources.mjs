// 공모전 모음 사이트가 목록을 가져가도 된다고 열어 두었는지 확인만 하는 스크립트(사람이 눌러서 한 번 돌림).
// robots.txt에서 허용한 주소만 한 번 읽고, 목록이 어떤 모양인지 요약해 로그에 적어요. 아무것도 저장하지 않아요.
import { canFetch, UA } from './robots.mjs';
const SITES = (process.env.PROBE || '').split(/\s+/).filter(Boolean);
const strip = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
const tree = (v, d = 0) => { if (d > 5) return '…'; if (Array.isArray(v)) return `[${v.length}] ` + (v.length ? tree(v[0], d + 1) : ''); if (v && typeof v === 'object') return '{' + Object.keys(v).slice(0, 40).map(k => `${k}: ${tree(v[k], d + 1)}`).join(', ') + '}'; return typeof v === 'string' ? `"${v.slice(0, 40)}"` : String(v); };
for (const url of SITES) {
  console.log('\n==== ' + url);
  const u = new URL(url);
  try { const r = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }); const t = r.ok ? await r.text() : ''; console.log(`robots ${r.status} ${t.length}자`); console.log(t.split(/\r?\n/).filter(l => /^(user-agent|disallow|allow|sitemap|crawl-delay)/i.test(l.trim())).slice(0, 60).join('\n')); } catch (e) { console.log('robots 실패 ' + e.message); }
  const can = await canFetch(url); console.log(`→ 가져가도 되나: ${can.ok ? '됨' : '안 됨 (' + can.why + ')'}${can.delay ? ' · 간격 ' + can.delay + '초' : ''}`);
  if (!can.ok) continue;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(20000) }); const html = await r.text();
    console.log(`목록 ${r.status} ${r.headers.get('content-type')} ${html.length}자`);
    if (!r.ok) { console.log(html.slice(0, 300).replace(/\s+/g, ' ')); continue; }
    if (/^\s*[{[]/.test(html)) { try { console.log('JSON: ' + tree(JSON.parse(html)).slice(0, 2500)); } catch { console.log(html.slice(0, 600)); } continue; }
    if (/^\s*<\?xml|<rss|<feed|<urlset|<sitemapindex/i.test(html.slice(0, 300))) { console.log('XML: ' + html.slice(0, 1800).replace(/\s+/g, ' ')); continue; }
    console.log('feeds: ' + (html.match(/<link[^>]+(rss|atom)[^>]*>/gi) || []).join(' ').slice(0, 400));
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (nd) { try { console.log('NEXT_DATA: ' + tree(JSON.parse(nd[1]).props).slice(0, 3500)); } catch (e) { console.log('NEXT_DATA 읽기 실패 ' + e.message); } }
    const ld = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || []; console.log('ld+json ' + ld.length + (ld[0] ? ' ' + ld[0].slice(0, 300).replace(/\s+/g, ' ') : ''));
    const body = strip(html); const i = body.search(/<(li|tr|div|a)[^>]*>(?:(?!<\/?(li|tr)\b)[\s\S]){0,400}(공모전|서포터즈|기자단)/);
    console.log('본문 조각: ' + body.slice(Math.max(0, i), Math.max(0, i) + 2600).replace(/\s+/g, ' '));
  } catch (e) { console.log('목록 실패 ' + e.message); }
  await new Promise(r => setTimeout(r, Math.max(1500, (can.delay || 0) * 1000)));
}
