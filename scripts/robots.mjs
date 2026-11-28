// robots.txt 읽기: 가져가도 된다고 열어 둔 주소인지 확인. 수집 스크립트는 매번 이걸 먼저 보고, 막아 둔 곳은 건너뜁니다.
export const UA = 'Mozilla/5.0 (compatible; feed-reader/1.0)';
export function rulesOf(txt, agents = ['feed-reader', '*']) {
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false; if (!cur) continue;
    if (k === 'allow' || k === 'disallow') cur.rules.push({ allow: k === 'allow', path: v }); else if (k === 'crawl-delay') cur.delay = +v || 0;
  }
  for (const a of agents) { const g = groups.filter(x => x.agents.some(n => (a === '*' ? n === '*' : n.includes(a)))); if (g.length) return { rules: g.flatMap(x => x.rules), delay: Math.max(0, ...g.map(x => x.delay)) }; }
  return { rules: [], delay: 0 };
}
const rx = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
/* 가장 길게 맞는 규칙이 이김. 길이가 같으면 허용이 이김(구글 방식). 빈 Disallow는 전부 허용 */
export function allowed(rules, path) {
  let best = null;
  for (const r of rules) { if (!r.path) continue; if (!rx(r.path).test(path)) continue; if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r; }
  return best ? best.allow : true;
}
const cache = new Map();
export async function canFetch(url) {
  const u = new URL(url); const key = u.origin;
  if (!cache.has(key)) {
    let info = { ok: false, why: 'robots.txt를 못 읽음', rules: [], delay: 0 };
    try { const r = await fetch(key + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (r.status === 404 || r.status === 410) info = { ok: true, rules: [], delay: 0 };   /* robots.txt가 없으면 막아 둔 것이 없음 */
      else if (r.ok) info = { ok: true, ...rulesOf(await r.text()) };
      else info.why = 'robots.txt HTTP ' + r.status;   /* 401·403·5xx는 허락을 알 수 없으니 가져가지 않음 */
    } catch (e) { info.why = 'robots.txt ' + e.message; }
    cache.set(key, info);
  }
  const info = cache.get(key); if (!info.ok) return { ok: false, why: info.why, delay: 0 };
  const ok = allowed(info.rules, u.pathname + u.search); return { ok, why: ok ? '' : 'robots.txt에서 막아 둠', delay: info.delay };
}
