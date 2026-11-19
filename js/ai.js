// 외부 무료 서비스 연결: (1) 링크 본문 읽기 = Jina Reader(키 없음) (2) 요약·말 이해 = Google Gemini 무료 키(선택, 이 기기에만 저장)
// 키가 없어도 (1)은 되고, 요약은 앱 안 규칙으로 대신함. 밖으로 나가는 건 그때 읽으라고 한 링크·문장뿐
import * as db from './db.js';

export const KEY = 'secret:gemini';
export const keyed = async () => !!(await db.kvGet(KEY, ''));
export const enabled = async () => (await db.kvGet('ai:on', true)) && (await keyed());

async function timed(url, opt = {}, ms = 20000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opt, signal: c.signal }); } finally { clearTimeout(t); }
}
const abs = (u, base) => { try { return new URL(u, base).href; } catch { return ''; } };
const JUNK = /(sprite|icon|logo|avatar|profile|emoji|badge|button|btn[_-]|banner_ad|\/ads?\/|pixel|spacer|blank|loading|placeholder|favicon|gravatar|1x1|tracking)/i;
const okImg = u => /^https?:\/\//.test(u) && !/\.(svg|ico)(\?|$)/i.test(u) && !JUNK.test(u.split('?')[0]);

// 링크 하나를 읽어 { title, text, images[] }. 본문(기사·상품 설명 부분)만 추려 주는 읽기 서비스를 먼저 쓰고, 안 되면 원본 HTML을 받아 직접 본문을 고름
export async function readPage(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const r = await timed('https://r.jina.ai/' + url, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = (await r.json()).data || {}; const md = d.content || '';
      const images = [...md.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map(m => abs(m[1], url));
      const text = md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[#>*\-\s]+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > 80 || images.length) return { url, title: d.title || '', desc: d.description || '', text, images: uniq(images.filter(okImg)), by: 'reader' };
    }
  } catch { }
  const r = await timed('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  if (!r.ok) throw new Error('페이지를 읽지 못했어요');
  return { url, ...fromHtml(await r.text(), url), by: 'html' };
}
const uniq = a => { const seen = new Set(); return a.filter(u => { const k = u.split('?')[0].replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w+$)/, ''); if (!u || seen.has(k)) return false; seen.add(k); return true; }); };

// 원본 HTML에서 본문 덩어리 찾기: main/article 우선, 없으면 글자·이미지가 가장 많이 모인 블록. 메뉴·푸터·사이드·추천 영역은 뺌
export function fromHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = n => doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute('content') || '';
  doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,[role=navigation],[role=banner],[role=contentinfo],[class*=sidebar i],[class*=footer i],[class*=related i],[class*=recommend i],[class*=comment i],[class*=share i],[id*=footer i],[id*=sidebar i],[class*=gnb i],[class*=lnb i]').forEach(e => e.remove());
  let main = doc.querySelector('article,main,[role=main],#content,.content,.post,.entry-content,.article');
  if (!main || main.textContent.trim().length < 200) {
    let best = doc.body, score = 0;
    for (const el of doc.body?.querySelectorAll('div,section') || []) { const s = [...el.children].filter(c => c.tagName === 'P').reduce((n, p) => n + p.textContent.length, 0) + el.querySelectorAll(':scope > img, :scope > figure, :scope > p img, :scope > picture').length * 150; if (s > score) { score = s; best = el; } }
    main = best || doc.body;
  }
  const srcOf = im => { const ss = im.getAttribute('srcset') || im.getAttribute('data-srcset') || ''; const big = ss.split(',').map(x => x.trim().split(/\s+/)).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0]?.[0]; return im.getAttribute('data-src') || im.getAttribute('data-original') || im.getAttribute('data-lazy-src') || big || im.getAttribute('src') || ''; };
  const images = [...(main?.querySelectorAll('img') || [])].filter(im => { const w = +im.getAttribute('width') || 0, hh = +im.getAttribute('height') || 0; return !(w && w < 160) && !(hh && hh < 120); }).map(im => abs(srcOf(im), url)).filter(okImg);
  const og = abs(meta('og:image'), url);
  return { title: meta('og:title') || doc.title || '', desc: meta('og:description') || meta('description'), text: (main?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim(), images: uniq([og, ...images].filter(okImg)) };
}

// ── Gemini (무료 키) ──
// 모델 고르기: 가볍고 빠른 "lite" 별칭을 먼저 쓰고(무료 등급에서 가장 잘 돌아감), 막히거나 느리면 다음 후보로 넘어감. 되는 걸 기억해 둠
const FALLBACK = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
async function candidates(key) {
  const saved = await db.kvGet('ai:model', ''); let listed = [];
  if (!saved) { try { const j = await (await timed(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, 8000)).json();
    const ms = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini-[\d.]+-flash(-lite)?$/.test(m.name)).map(m => m.name.replace('models/', ''));
    const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    listed = ms.sort((a, b) => (/lite/.test(b) ? 1 : 0) - (/lite/.test(a) ? 1 : 0) || ver(b) - ver(a)).slice(0, 3); } catch { } }
  return [...new Set([saved, ...FALLBACK, ...listed].filter(Boolean))];
}
export async function ask(prompt, { json = false, ms = 25000 } = {}) {
  const key = await db.kvGet(KEY, ''); if (!key) throw new Error('AI 키가 없어요');
  const call = (m, t) => timed(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) } }) }, t);
  const list = await candidates(key); let r = null, last = '';
  for (const [i, m] of list.entries()) {
    try { r = await call(m, i < list.length - 1 ? Math.min(ms, 14000) : ms); } catch { last = '응답이 너무 늦어요'; r = null; continue; } // 늦으면 다음 후보
    if (r.ok) { if ((await db.kvGet('ai:model', '')) !== m) await db.kvSet('ai:model', m); break; }
    last = r.status === 429 ? '무료 사용량을 잠깐 넘었어요. 조금 뒤에 다시 해 주세요' : r.status === 400 || r.status === 403 ? 'AI 키를 확인해 주세요' : 'AI가 답하지 못했어요 (' + r.status + ')';
    if (r.status === 400 || r.status === 403) break; r = null;
  }
  if (!r || !r.ok) { await db.kvSet('ai:model', ''); throw new Error(last || 'AI가 답하지 못했어요'); }
  const out = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!json) return out;
  try { return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('AI 답을 읽지 못했어요'); }
}
// 요약 3~5줄. 키가 없거나 실패하면 null → 부르는 쪽이 앱 안 요약으로 대신
export async function summarize(text, title = '') {
  if (!(await enabled())) return null;
  try { const j = await ask(`다음 글을 한국어로 요약해 줘. 핵심만 3~5줄, 각 줄은 한 문장, 숫자·날짜·금액·조건은 빼먹지 말 것. JSON {"lines":["..."],"keywords":["..."]} 로만 답해.\n\n제목: ${title}\n\n${text.slice(0, 12000)}`, { json: true }); return Array.isArray(j.lines) && j.lines.length ? { lines: j.lines.map(String).slice(0, 6), keywords: (j.keywords || []).map(String).slice(0, 6) } : null; } catch (e) { console.warn('ai', e); return null; }
}
// 규칙으로 못 알아들은 말을 일정·할 일 등으로 풀기. 결과는 항상 "확인 대기"(임시)로만 들어감
export async function understand(text, { today, people = [] } = {}) {
  if (!(await enabled())) return null;
  try {
    const j = await ask(`너는 한국어 일정·업무 비서의 분류기야. 오늘은 ${today}. 아는 사람: ${people.slice(0, 30).join(', ') || '없음'}.\n사용자 말을 항목으로 나눠 JSON 배열로만 답해. 각 항목: {"kind":"event|task|idea|note|expense|contact","title":"짧은 제목(명사형)","date":"YYYY-MM-DD 또는 빈칸","start":"HH:MM 또는 빈칸","end":"","who":"같이 하는/맡은 사람","place":"장소","amount":숫자 또는 null}\n규칙: 시간·약속·방문·회의는 event, 해야 할 일은 task(date는 마감), 돈 쓴 건 expense, 떠오른 생각은 idea, 나머지는 note. 말에 없는 정보는 지어내지 말고 빈칸.\n\n말: ${text.slice(0, 2000)}`, { json: true, ms: 12000 });
    const arr = (Array.isArray(j) ? j : j.items || []).filter(x => x && x.title && /^(event|task|idea|note|expense|contact)$/.test(x.kind)).slice(0, 6);
    return arr.length ? arr : null;
  } catch (e) { console.warn('ai', e); return null; }
}

// 회의록·긴 글 정리를 AI로 한 번 더: 요약·결정·할 일을 바꿔 끼움. 키가 없거나 실패하면 앱 안 규칙 결과 그대로 (false)
export async function enhance(a, text, { today = '', people = [], meeting = false } = {}) {
  if (!(await enabled()) || (text || '').length < 120) return false;
  try {
    const j = await ask(`다음은 ${meeting ? '회의를 받아 적은 글' : '메모'}이야. 오늘은 ${today}. 참석자·아는 사람: ${people.slice(0, 30).join(', ') || '없음'}.\n한국어로 정리해서 JSON으로만 답해: {"summary":["핵심 3~6줄, 한 줄 한 문장"],"decisions":["정해진 것"],"actions":[{"title":"할 일(명사형, 짧게)","who":"맡은 사람 또는 빈칸","due":"YYYY-MM-DD 또는 빈칸"}],"questions":["아직 안 정해진 것"]}\n규칙: 글에 없는 내용은 지어내지 말 것. 받아쓰기 오타는 문맥으로 바로잡을 것. 숫자·날짜·금액은 그대로.\n\n${text.slice(0, 14000)}`, { json: true, ms: 30000 });
    if (!Array.isArray(j.summary) || !j.summary.length) return false;
    a.summary = j.summary.map(String).slice(0, 8);
    if (Array.isArray(j.decisions)) a.decisions = j.decisions.map(String).slice(0, 12);
    if (Array.isArray(j.questions)) a.questions = j.questions.map(String).slice(0, 12);
    if (Array.isArray(j.actions) && j.actions.length) a.actions = j.actions.filter(x => x && x.title).slice(0, 20).map(x => ({ title: String(x.title).slice(0, 80), who: String(x.who || ''), due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '', src: String(x.title) }));
    return true;
  } catch (e) { console.warn('ai', e); return false; }
}
