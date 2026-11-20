// 공개 웹에서 읽어 오기 (무료, 키 없음): 읽기 서비스(r.jina.ai)로 공개 페이지 글을 받아 숫자·링크를 뽑음.
// 틱톡 공개 프로필(팔로워·팔로잉·좋아요·영상 조회수), 유튜브 쇼츠 검색 결과(참고 영상). 인스타는 로그인 벽이라 여기서 못 읽음.
async function jina(url, ms = 25000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'application/json' }, signal: c.signal }); if (!r.ok) throw new Error('읽기 실패 ' + r.status); return ((await r.json()).data || {}); }
  finally { clearTimeout(t); }
}
export const num = s => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMB만천억])?/i); if (!m) return null; const k = { K: 1e3, k: 1e3, M: 1e6, m: 1e6, B: 1e9, 천: 1e3, 만: 1e4, 억: 1e8 }[m[2]] || 1; return Math.round(+m[1] * k); };
// 틱톡 영상 id 앞부분에 올린 시각이 들어 있음
const ttTime = id => { try { return new Date(Number(BigInt(id) >> 32n) * 1000).toISOString(); } catch { return null; } };
export async function tiktokProfile(u) {
  const d = await jina('https://www.tiktok.com/@' + encodeURIComponent(u));
  const c = d.content || '', desc = d.description || '';
  if (/couldn't find this account|계정을 찾을 수 없/i.test(c)) throw new Error('틱톡 계정을 못 찾았어요');
  const pick = re => { const m = c.match(re); return m ? num(m[1]) : null; };
  const followers = pick(/\*\*([\d.,KMB]+)\*\*\s*Followers/i) ?? (desc.match(/([\d.,KMB]+)\s*Followers/i) ? num(desc.match(/([\d.,KMB]+)\s*Followers/i)[1]) : null);
  const following = pick(/\*\*([\d.,KMB]+)\*\*\s*Following/i);
  const likes = pick(/\*\*([\d.,KMB]+)\*\*\s*Likes/i) ?? (desc.match(/([\d.,KMB]+)\s*Likes/i) ? num(desc.match(/([\d.,KMB]+)\s*Likes/i)[1]) : null);
  const esc = u.replace(/\./g, '\\.');
  const re = new RegExp(`(?:Image \\d+: ([^\\]]*?) created by[^\\]]*\\]\\([^)]*\\))?[^\\[]*?\\*\\*([\\d.,KMB]+)\\*\\*\\]\\((https://www\\.tiktok\\.com/@${esc}/video/(\\d+))\\)`, 'gi');
  const videos = []; const seen = new Set();
  for (const m of c.matchAll(re)) { if (seen.has(m[4])) continue; seen.add(m[4]); videos.push({ id: m[4], url: m[3], views: num(m[2]), caption: (m[1] || '').trim(), at: ttTime(m[4]) }); }
  if (followers == null && !videos.length) throw new Error('틱톡 숫자를 못 읽었어요');
  return { followers, following, likes, videos };
}
// 유튜브 쇼츠 검색: [{id, title, views}]
export async function ytShorts(q) {
  const d = await jina('https://www.youtube.com/results?search_query=' + encodeURIComponent(q + ' shorts'));
  const c = d.content || ''; const out = []; const seen = new Set();
  for (const m of c.matchAll(/### \[([^\]]+)\]\(https:\/\/www\.youtube\.com\/shorts\/([\w-]{11})[^)]*\)\s*\n+\s*([\d.,]+[KMB]?)\s*views/g)) {
    if (seen.has(m[2])) continue; seen.add(m[2]); out.push({ id: m[2], title: m[1], views: num(m[3]), q, src: 'yt' });
  }
  return out;
}
