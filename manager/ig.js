// 인스타그램 공식 API (Instagram API with Instagram Login). 프로/크리에이터 계정 + 하진이 만든 메타 앱의 토큰이 있어야 함.
// 할 수 있는 것: 내 프로필 숫자, 내 게시물과 반응·인사이트 읽기. 할 수 없는 것(공식으로 막혀 있음): 팔로워 명단, 팔로우/언팔 실행.
// 토큰은 이 기기에만 저장. 60일짜리라 열 때마다 남은 기간을 보고 늘림.
import * as S from './store.js';
const G = 'https://graph.instagram.com/';
async function j(path, token, params = {}) {
  const u = new URL(G + path); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('access_token', token);
  const r = await fetch(u); const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) { const e = new Error(d.error?.message || ('인스타 응답 ' + r.status)); e.code = d.error?.code; throw e; }
  return d;
}
export async function connect(token) {
  token = token.trim();
  const me = await j('me', token, { fields: 'user_id,username,account_type,followers_count,follows_count,media_count,profile_picture_url' });
  await S.set('g:igtoken', { token, at: Date.now() });
  return me;
}
export async function tokenInfo() { return S.get('g:igtoken', null); }
export async function disconnect() { await S.del('g:igtoken'); }
async function refreshIfOld(t) {
  if (Date.now() - t.at < 7 * 864e5) return t.token;          // 일주일에 한 번 늘림
  try { const d = await j('refresh_access_token', t.token, { grant_type: 'ig_refresh_token' }); const n = { token: d.access_token || t.token, at: Date.now() }; await S.set('g:igtoken', n); return n.token; } catch { return t.token; }
}
const KIND = { REELS: 'reels', CAROUSEL_ALBUM: 'carousel', IMAGE: 'photo', VIDEO: 'reels' };
// 전부 새로 받기. 게시물 최근 40개 + 각 인사이트
export async function sync(onStep = () => { }) {
  const t = await tokenInfo(); if (!t) return null;
  const token = await refreshIfOld(t);
  onStep('프로필');
  const me = await j('me', token, { fields: 'user_id,username,followers_count,follows_count,media_count,profile_picture_url' });
  await S.update('profile', {}, p => { p.ig = { ...(p.ig || {}), username: me.username, followers: me.followers_count, following: me.follows_count, media: me.media_count, pic: me.profile_picture_url, updatedAt: new Date().toISOString(), live: true }; return p; });
  await S.snap('ig', me.followers_count, me.follows_count);
  onStep('게시물');
  const media = await j('me/media', token, { fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url', limit: 40 });
  const posts = [];
  for (const [i, m] of (media.data || []).entries()) {
    onStep(`인사이트 ${i + 1}/${media.data.length}`);
    const kind = m.media_product_type === 'REELS' ? 'reels' : KIND[m.media_type] || 'photo';
    const p = { plat: 'ig', ext: m.id, kind, at: m.timestamp, caption: m.caption || '', likes: m.like_count, comments: m.comments_count, url: m.permalink, thumb: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : ''), src: 'api' };
    const metrics = kind === 'reels' ? 'reach,saved,shares,views,ig_reels_avg_watch_time,total_interactions' : 'reach,saved,shares,views,total_interactions';
    try {
      const ins = await j(`${m.id}/insights`, token, { metric: metrics });
      for (const x of ins.data || []) { const v = x.values?.[0]?.value ?? x.total_value?.value; if (x.name === 'reach') p.reach = v; if (x.name === 'saved') p.saves = v; if (x.name === 'shares') p.shares = v; if (x.name === 'views') p.views = v; if (x.name === 'ig_reels_avg_watch_time') p.avgWatch = v / 1000; }
    } catch { /* 오래된 게시물이나 막힌 지표는 건너뜀 */ }
    posts.push(p);
  }
  await S.addPosts(posts);
  await S.set('g:iglast', Date.now());
  return { me, n: posts.length };
}
