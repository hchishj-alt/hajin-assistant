// 상품 링크 → 이미지·상품명·가격 자동 채우기 (무료 공개 서비스 microlink, 키 없음). 안 되면 사람이 고칠 수 있게 빈 칸으로.
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const STORES = [[/coupang/, '쿠팡'], [/smartstore\.naver|shopping\.naver|brand\.naver/, '네이버쇼핑'], [/gmarket/, 'G마켓'], [/11st/, '11번가'], [/auction/, '옥션'], [/aliexpress/, '알리익스프레스'], [/amazon/, '아마존'], [/daiso/, '다이소'], [/ikea/, '이케아'], [/musinsa/, '무신사'], [/29cm/, '29CM'], [/oliveyoung/, '올리브영'], [/tmon/, '티몬'], [/wemakeprice/, '위메프'], [/ssg\.com/, 'SSG'], [/kurly/, '컬리'], [/temu/, '테무'], [/artbox/, '아트박스'], [/hottracks|kyobo/, '교보'], [/yes24/, 'YES24'], [/danawa/, '다나와']];
export const storeOf = u => { const h = host(u); return (STORES.find(([re]) => re.test(h)) || [, h])[1]; };
// "12,900원", "₩12,900", "KRW 12900", "$12.99" 같은 글에서 가격 뽑기
export function priceIn(text) {
  const t = String(text || '');
  let m = t.match(/([\d]{1,3}(?:,\d{3})+|\d{3,9})\s*원/) || t.match(/[₩￦]\s*([\d,]{3,12})/) || t.match(/KRW\s*([\d,]{3,12})/i);
  if (m) return Number(m[1].replace(/,/g, ''));
  m = t.match(/(\d+(?:\.\d+)?)\s*만\s*원/); if (m) return Math.round(Number(m[1]) * 10000);
  return null;
}
const clean = (t, store) => String(t || '').replace(/\s*[|:\-–—]\s*(쿠팡!?|네이버\s*쇼핑|스마트스토어|G마켓|11번가|옥션|AliExpress|Amazon[.\w]*|다이소몰?|이케아|IKEA|무신사[\s\w]*|29CM|올리브영)\s*$/i, '').replace(/^\[[^\]]{1,12}\]\s*/, '').trim().slice(0, 120);
export async function lookup(url, ms = 9000) {
  url = String(url || '').trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const out = { link: url, title: '', img: '', price: null, store: storeOf(url), auto: [] };
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try {
    const q = new URLSearchParams({ url, 'data.price.selector': 'meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"]', 'data.price.attr': 'content', 'data.priceText.selector': '[class*="price" i]', 'data.priceText.attr': 'text' });
    const r = await fetch('https://api.microlink.io/?' + q, { signal: c.signal });
    const d = (await r.json()).data || {};
    out.title = clean(d.title); out.img = d.image?.url || ''; if (d.publisher && out.store === host(url)) out.store = d.publisher;
    const p = Number(String(d.price || '').replace(/[^\d.]/g, '')) || priceIn(d.priceText) || priceIn(d.description) || priceIn(d.title);
    if (p) out.price = Math.round(p);
  } catch { } finally { clearTimeout(tm); }
  if (out.title) out.auto.push('상품명'); if (out.img) out.auto.push('이미지'); if (out.price) out.auto.push('가격');
  return out;
}
