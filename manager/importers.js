// 인스타·틱톡 "내 정보 다운로드" 파일 읽기 (zip 통째로 또는 json 하나씩)
// 팔로워·팔로잉 명단과, 있으면 내 게시물 캡션·올린 시각까지 꺼냄. 모두 이 기기 안에서만 읽음.

// ── zip 풀기 (브라우저 내장 DecompressionStream 사용, 라이브러리 없음) ──
export async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf); let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip 파일이 아니에요');
  let n = v.getUint16(e + 10, true), p = v.getUint32(e + 16, true); const out = []; const dec = new TextDecoder();
  while (n-- > 0 && v.getUint32(p, true) === 0x02014b50) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    const raw = u8.subarray(start, start + csize);
    out.push({ name, text: async () => {
      if (method === 0) return dec.decode(raw);
      const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(s).text();
    } });
  }
  return out;
}

const fixText = s => { try { return decodeURIComponent(escape(s)); } catch { return s; } }; // 인스타 json은 한글이 깨진 채(latin1)로 들어 있음
const tail = h => (String(h || '').replace(/\/+$/, '').split('/').pop() || '').replace(/^_u\//, '').replace(/^@/, '');
const iso = t => t ? new Date((t > 1e12 ? t : t * 1000)).toISOString() : '';

function igEntries(arr) {
  return (arr || []).map(e => {
    const s = (e.string_list_data || [])[0] || {};
    const u = (e.title || s.value || tail(s.href) || '').trim().toLowerCase();
    return u ? { u, t: iso(s.timestamp) } : null;
  }).filter(Boolean);
}
function ttEntries(arr) {
  return (arr || []).map(e => { const u = String(e.UserName || e.userName || e.username || e.Username || '').trim().replace(/^@/, '').toLowerCase(); return u ? { u, t: e.Date ? new Date(String(e.Date).replace(' ', 'T') + 'Z').toISOString() : '' } : null; }).filter(Boolean);
}
// 틱톡 json: 구조가 판마다 조금 달라서, UserName을 가진 배열을 찾아 부모 이름으로 팔로워/팔로잉을 가림
function ttWalk(o, path, acc) {
  if (Array.isArray(o)) {
    if (o.length && o[0] && typeof o[0] === 'object' && ('UserName' in o[0] || 'userName' in o[0])) {
      const p = path.join('/').toLowerCase();
      if (/fan|follower/.test(p)) acc.followers.push(...ttEntries(o)); else if (/following/.test(p)) acc.following.push(...ttEntries(o));
    } else if (o.length && o[0] && typeof o[0] === 'object' && ('Link' in o[0] || 'link' in o[0]) && ('Date' in o[0]) && /video|post/i.test(path.join('/'))) {
      acc.posts.push(...o.map(x => ({ plat: 'tt', kind: 'video', at: new Date(String(x.Date).replace(' ', 'T') + 'Z').toISOString(), url: x.Link || x.link, ext: tail(x.Link || x.link), caption: x.Title || x.Description || x.VideoDescription || '', likes: num(x.Likes ?? x.likes), src: 'export' })));
    }
    return;
  }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) ttWalk(v, [...path, k], acc);
}
const num = x => { if (x == null || x === '') return undefined; const n = +String(x).replace(/[^\d.]/g, ''); return Number.isFinite(n) ? n : undefined; };
// 틱톡 txt 형식: "Date: 2025-01-01 10:00:00\nUsername: abc" 묶음
function ttTxt(text) { return [...text.matchAll(/Username:\s*@?([\w.]+)/gi)].map(m => ({ u: m[1].toLowerCase(), t: '' })); }
// html 형식으로 받았을 때: 링크에서 아이디만 뽑음
function htmlUsers(text, host) { const re = host === 'ig' ? /instagram\.com\/(?:_u\/)?([\w.]+)/g : /tiktok\.com\/@([\w.]+)/g; return [...new Set([...text.matchAll(re)].map(m => m[1].toLowerCase()))].map(u => ({ u, t: '' })); }

// files: [{name, text()}] → { ig:{followers, following, posts}, tt:{...}, found:[...] }
export async function readExport(files) {
  const r = { ig: { followers: [], following: [], posts: [] }, tt: { followers: [], following: [], posts: [] }, found: [] };
  for (const f of files) {
    const n = f.name.toLowerCase(), base = n.split('/').pop();
    try {
      if (/followers_\d+\.json$|^followers\.json$/.test(base) && !n.includes('tiktok')) { r.ig.followers.push(...igEntries(JSON.parse(await f.text()))); r.found.push('인스타 팔로워'); }
      else if (/^following\.json$/.test(base)) { const j = JSON.parse(await f.text()); r.ig.following.push(...igEntries(j.relationships_following || j)); r.found.push('인스타 팔로잉'); }
      else if (/^posts_\d+\.json$/.test(base)) { const j = JSON.parse(await f.text()); r.ig.posts.push(...(Array.isArray(j) ? j : []).map(x => { const m = (x.media || [])[0] || {}; const at = x.creation_timestamp || m.creation_timestamp; return at ? { plat: 'ig', kind: (x.media || []).length > 1 ? 'carousel' : 'photo', at: iso(at), caption: fixText(x.title || m.title || ''), src: 'export' } : null; }).filter(Boolean)); r.found.push('인스타 게시물'); }
      else if (/^reels\.json$/.test(base)) { const j = JSON.parse(await f.text()); r.ig.posts.push(...(j.ig_reels_media || []).map(x => { const m = (x.media || [])[0] || {}; return m.creation_timestamp ? { plat: 'ig', kind: 'reels', at: iso(m.creation_timestamp), caption: fixText(m.title || ''), src: 'export' } : null; }).filter(Boolean)); r.found.push('인스타 릴스'); }
      else if (/followers_\d+\.html$/.test(base)) { r.ig.followers.push(...htmlUsers(await f.text(), 'ig')); r.found.push('인스타 팔로워(html)'); }
      else if (/^following\.html$/.test(base)) { r.ig.following.push(...htmlUsers(await f.text(), 'ig')); r.found.push('인스타 팔로잉(html)'); }
      else if (/user_data.*\.json$|tiktok.*\.json$/.test(base)) { const acc = { followers: [], following: [], posts: [] }; ttWalk(JSON.parse(await f.text()), [], acc); r.tt.followers.push(...acc.followers); r.tt.following.push(...acc.following); r.tt.posts.push(...acc.posts); r.found.push('틱톡 기록'); }
      else if (/^(follower|fans)(list)?\.txt$/.test(base)) { r.tt.followers.push(...ttTxt(await f.text())); r.found.push('틱톡 팔로워'); }
      else if (/^following(list)?\.txt$/.test(base)) { r.tt.following.push(...ttTxt(await f.text())); r.found.push('틱톡 팔로잉'); }
    } catch (e) { r.found.push(f.name + ' 읽기 실패'); }
  }
  for (const p of ['ig', 'tt']) for (const k of ['followers', 'following']) { const m = new Map(); r[p][k].forEach(x => m.set(x.u, x)); r[p][k] = [...m.values()]; }
  r.found = [...new Set(r.found)];
  return r;
}
export async function readFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') files.push(...await unzip(await f.arrayBuffer()));
    else files.push({ name: f.name, text: () => f.text() });
  }
  return readExport(files);
}
