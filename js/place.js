// 장소 찾기: 일정에 적힌 장소 이름으로 실제 주소를 찾아 붙임
// 1) 카카오 로컬 검색 (설정에 무료 키를 넣었을 때. 가게·전시장까지 잘 찾음)  2) 오픈스트리트맵 (키 없이, 큰 장소 위주)
import * as db from './db.js';

export const KEY = 'secret:kakao'; // 이 기기에만 저장, 동기화 안 함
export const links = (q) => ({ naver: 'https://map.naver.com/p/search/' + encodeURIComponent(q), kakao: 'https://map.kakao.com/?q=' + encodeURIComponent(q) });
const timed = (url, opt = {}, ms = 3500) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };

async function kakao(q, key) {
  const r = await timed('https://dapi.kakao.com/v2/local/search/keyword.json?size=3&query=' + encodeURIComponent(q), { headers: { Authorization: 'KakaoAK ' + key } });
  if (!r.ok) throw new Error('kakao ' + r.status);
  return ((await r.json()).documents || []).map(d => ({ name: d.place_name, addr: d.road_address_name || d.address_name, url: d.place_url, lat: +d.y, lon: +d.x, by: '카카오맵' }));
}
async function osm(q) {
  const r = await timed('https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=ko&countrycodes=kr&limit=3&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('osm ' + r.status);
  return (await r.json()).map(d => ({ name: d.name || q, addr: String(d.display_name || '').split(', ').filter(x => x !== '대한민국' && !/^\d{5}$/.test(x) && x !== d.name).reverse().join(' '), lat: +d.lat, lon: +d.lon, by: '오픈스트리트맵' }));
}
// → { name, addr, url, by } 또는 null. 지역(예: 서충주)을 같이 넣으면 그 근처 것을 먼저 찾음
export async function lookup(place, area = '') {
  if (!place || !navigator.onLine) return null;
  const key = await db.kvGet(KEY, ''); const tries = [...new Set([area ? `${area} ${place}` : '', place, area && area.replace(/^(서|동|남|북)(?=[가-힣]{2})/, '') !== area ? `${area.replace(/^(서|동|남|북)/, '')} ${place}` : ''].filter(Boolean))];
  for (const q of tries) {
    try { const hit = key ? await kakao(q, key) : await osm(q); if (hit[0]) return hit[0]; } catch { if (key) { try { const hit = await osm(q); if (hit[0]) return hit[0]; } catch { } } }
  }
  return null;
}
