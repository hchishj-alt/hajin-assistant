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
const FALLBACK = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
async function candidates(key) {
  const saved = await db.kvGet('ai:model', ''); let listed = [];
  if (!saved) { try { const j = await (await timed(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, 8000)).json();
    const ms = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini-[\d.]+-flash(-lite)?$/.test(m.name)).map(m => m.name.replace('models/', ''));
    const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    listed = ms.sort((a, b) => (/lite/.test(b) ? 1 : 0) - (/lite/.test(a) ? 1 : 0) || ver(b) - ver(a)).slice(0, 3); } catch { } }
  return [...new Set([saved, ...FALLBACK, ...listed].filter(Boolean))];
}
// 무료 등급은 같은 모델도 때에 따라 1초~10초로 속도가 크게 달라진다.
// 짧은 문장 읽기처럼 빨라야 하는 일은, 첫 모델이 hedge(ms) 안에 답이 없으면 다음 가벼운 모델에도 같이 물어 먼저 온 답을 쓴다.
function raceCall(list, key, body, ms, hedge = 2500) {
  const errOf = st => st === 429 ? '무료 사용량을 잠깐 넘었어요. 조금 뒤에 다시 해 주세요' : st === 400 || st === 403 ? 'AI 키를 확인해 주세요' : 'AI가 답하지 못했어요 (' + st + ')';
  return new Promise((resolve, reject) => {
    const acs = [], timers = []; let done = false, started = 0, pending = 0, last = '';
    const finish = (fn, v) => { if (done) return; done = true; timers.forEach(clearTimeout); fn(v); acs.forEach(a => { try { a.abort(); } catch {} }); };
    const start = i => {
      if (done || i >= list.length || started > i) return; started = i + 1; pending++;
      const m = list[i], ac = new AbortController(); acs.push(ac);
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body })
        .then(async r => { if (!r.ok) { last = errOf(r.status); throw 0; } const j = await r.json(); finish(resolve, { m, j }); })
        .catch(() => { pending--; if (done) return; if (started < list.length) start(started); else if (!pending) finish(reject, new Error(last || 'AI가 답하지 못했어요')); });
      if (i + 1 < list.length) timers.push(setTimeout(() => start(i + 1), hedge));
    };
    timers.push(setTimeout(() => finish(reject, new Error('응답이 너무 늦어요')), ms));
    start(0);
  });
}
export async function ask(prompt, { json = false, ms = 25000, temp = 0.2, fast = false } = {}) {
  const key = await db.kvGet(KEY, ''); if (!key) throw new Error('AI 키가 없어요');
  if (fast) {
    const list = (await candidates(key)).slice(0, 3);
    const { m, j } = await raceCall(list, key, JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, ...(json ? { responseMimeType: 'application/json' } : {}) } }), ms);
    if ((await db.kvGet('ai:model', '')) !== m) await db.kvSet('ai:model', m);
    const out = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!json) return out;
    try { return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('AI 답을 읽지 못했어요'); }
  }
  const call = (m, t) => timed(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, ...(json ? { responseMimeType: 'application/json' } : {}) } }) }, t);
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

// ── Gemini가 먼저 읽기 ──
// 규칙이 읽은 초안(parsed)을 같이 주고, AI가 뜻을 보고 고쳐 쓰게 함. 전화·금액·링크처럼 글자 그대로인 건 규칙 값을 믿고,
// 날짜·종류·제목·누구랑·장소처럼 뜻을 읽어야 하는 건 AI 값을 씀. 실패하면 null → 규칙 결과 그대로
const KO = { event: '일정', task: '할 일', expense: '지출', income: '받을 돈', contact: '연락처', idea: '아이디어', note: '메모', vendor: '업체', buy: '살 것', reference: '레퍼런스', sns: 'SNS 아이디어', grant: '지원사업' };
// AI가 말에 없는 사람을 지어내지 못하게: 말에 실제로 나온 이름만 남긴다(목록 사람은 성 뺀 이름도 인정).
function whoIn(w, text, people, fallback) {
  const t = String(text).replace(/\s/g, ''); const ok = [];
  for (const n of String(w || '').split(/\s*[,·/]\s*/).map(x => x.trim()).filter(Boolean)) {
    const full = people.find(p => p === n || (p.length >= 3 && p.slice(1) === n)) || n;
    const bare = n.replace(/\s/g, ''); const given = full.length >= 3 && people.includes(full) ? full.slice(1) : '';
    if ((t.includes(bare) || (given && t.includes(given))) && !ok.includes(full)) ok.push(full);
  }
  return ok.length ? ok.join(', ') : (fallback || '');
}
const isD = v => /^\d{4}-\d{2}-\d{2}$/.test(v || ''), isT = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');
function calendarTable(today) {
  const b = new Date(today + 'T00:00'); const rows = [];
  for (let i = -7; i <= 27; i++) { const d = new Date(b); d.setDate(b.getDate() + i); const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const wk = Math.floor((i + ((b.getDay() + 6) % 7)) / 7); rows.push(`${y} ${'일월화수목금토'[d.getDay()]}${i === 0 ? ' (오늘)' : ''} [${wk === 0 ? '이번 주' : wk === 1 ? '다음 주' : wk === 2 ? '다다음 주' : wk === -1 ? '지난 주' : wk + '주 뒤'}]`); }
  return rows.join('\n');
}
export async function refine(text, parsed, { today, people = [], projects = [], vendors = [], ms = 12000 } = {}) {
  if (!(await enabled()) || !text || text.trim().length < 4 || text.length > 1500) return null;
  if ((parsed || []).some(p => p.kind === 'query' || p.kind === 'nav')) return null;
  const hint = (parsed || []).filter(p => p.kind !== 'talk').map(p => ({ kind: p.kind, ...p.data }));
  const prompt = `너는 작은 콘텐츠 기획 팀이 쓰는 한국어 업무 비서의 "말 이해" 담당이야. 사용자가 편하게 쓴 말을 읽고 항목으로 정리해 JSON 배열로만 답해.

달력(주는 월요일 시작):
${calendarTable(today)}

아는 사람: ${people.slice(0, 40).join(', ') || '없음'}
프로젝트: ${projects.slice(0, 20).join(', ') || '없음'}
업체: ${vendors.slice(0, 30).join(', ') || '없음'}

항목 모양: {"kind":"event|task|expense|income|contact|idea|note|vendor|buy|reference|sns|grant","title":"짧은 명사형 제목(날짜·사람·장소·조사는 뺌)","date":"YYYY-MM-DD","endDate":"여러 날이면 끝 날짜","start":"HH:MM","end":"HH:MM","allDay":false,"who":"같이 하는/맡은 사람","place":"가게·건물·전시 이름","area":"동네·도시","scope":"work|personal","priority":"high|normal","project":"","amount":0,"category":"","memo":"제목에 못 담은 조건","repeat":"daily|weekly|monthly|weekdays 또는 빈칸","phone":"","email":"","org":"","role":"직함","url":"","cat":"업체 분야","prices":[{"item":"품목","price":0,"note":""}]}
없는 칸은 빼거나 빈칸으로 둬.

읽는 법:
- event: 시간이 정해진 약속·회의·방문·행사·발표·휴가·불참. task: 해야 할 일(date는 마감).
- 한 문장에 약속과 그걸 위한 할 일이 같이 있으면 반드시 event와 task를 따로 만들어. 예: \"28일 오후에 최종 발표, 그 전날까지 PPT 완성\" → event \"최종 발표\"(28일, memo \"오후\") + task \"PPT 완성\"(27일). 서로 다른 할 일이 여러 개여도 하나씩 나눠.
- 한 문장에 단계가 이어지고(\"~해서\", \"~하고\", \"~한 뒤\") 날짜가 따로 있으면 단계마다 task를 따로 만들어. \"까지\"가 붙은 날짜는 바로 그 뒤에 나오는 일의 마감이야. 예: \"오늘 사진 컨셉 기획해서 다음주 월요일까지 촬영해야 해\" → task \"사진 컨셉 기획\"(오늘) + task \"사진 촬영\"(다음 주 월요일). 뒤 단계 제목만 봐도 무엇을 하는지 알 수 있게 대상을 넣어(\"촬영\"이 아니라 \"사진 촬영\"). 반대로 \"다음주 중 작업 목요일까지 제출\"처럼 한 가지 일의 기간과 마감을 말한 것이면 나누지 말고 task 하나로(마감은 \"까지\" 날짜). 날짜를 말하지 않은 단계에 날짜를 지어내지 마.
- 해야 하는 일(\"~해야 해\", \"~까지\")은 컨셉·아이디어 같은 낱말이 있어도 task야.
- expense는 내가 쓴 돈. income은 받을 돈·들어온 돈(입금 예정, 계약금·잔금·협찬비·정산받기). 누가 주는지는 who에, 받기로 한 날은 date에.
- 인스타·릴스·유튜브·블로그에 올릴 거리는 sns. 그냥 떠오른 생각은 idea.
- "다음주 중 작업, 목요일까지 제출"처럼 주 표현과 요일이 떨어져 있어도 그 주의 요일로 읽어. 주를 말하지 않은 요일은 오늘 이후 가장 가까운 그 요일(오늘과 같은 요일이면 다음 주).
- 날짜는 반드시 위 달력에서 골라. 계산하지 말고 찾아.
- "3시"처럼 오전·오후가 없으면 1~7시는 오후로.
- 사람 이름은 말에 나온 사람만. 아는 사람 목록에 있으면 전체 이름으로 쓰고, 목록에 없는 사람(예: \"수집오빠\", \"엄마\")은 말한 그대로 써. 목록의 다른 사람으로 바꾸지 마.
- 제목은 일 자체만(예: \"저녁 식사\", \"클라이언트 미팅\"). 같이 하는 사람은 who에만 쓰고 제목에 넣지 마. 불참·휴가·지각·생일처럼 그 사람이 주어일 때만 제목에 이름을 넣어(예: \"서연 불참\", \"민서 생일\").
- 시각 없이 오전·오후·저녁만 말했으면 start는 비우고 memo에 그 말을 적어. 시각을 지어내지 마.
- \"12월 첫째 주\"처럼 주만 말했으면 그 달 1일이 든 주를 첫째 주로 세고, 그 주에서 그 달에 속한 첫 평일을 date로 넣어.
- contact는 사람이 주인공일 때(이름은 title, 직함은 role, 회사·가게는 org). vendor는 가게·업체가 주인공일 때(담당자 이름은 memo).
- scope: 가족·친구·개인 볼일은 personal, 나머지는 work.
- 말에 없는 내용은 지어내지 마. 뭘 만들 말이 아니면(인사, 감탄, 질문) 빈 배열 [].

규칙이 먼저 읽은 초안(틀렸으면 고쳐 써): ${JSON.stringify(hint).slice(0, 1500)}

사용자 말: ${text}`;
  let arr; try { const j = await ask(prompt, { json: true, ms, temp: 0, fast: true }); arr = Array.isArray(j) ? j : j.items; } catch (e) { console.warn('ai', e); return null; }
  if (!Array.isArray(arr)) return null;
  const out = []; const seen = {};
  for (const g of arr.slice(0, 8)) {
    if (!g || !KO[g.kind] || !String(g.title || '').trim()) continue;
    if (g.kind === 'expense' && (parsed || []).some(p => p.kind === 'income') && !(parsed || []).some(p => p.kind === 'expense')) g.kind = 'income'; /* 규칙이 받을 돈으로 읽은 건 지출로 뒤집지 않음 */
    if (g.kind === 'idea' && /인스타|릴스|유튜브|쇼츠|틱톡|블로그|스레드|트위터|피드/.test(text) && /올리|올려|업로드|게시|포스팅|찍어|콘텐츠/.test(text)) g.kind = 'sns';
    const same = (parsed || []).filter(p => p.kind === g.kind); const nth = seen[g.kind] = (seen[g.kind] ?? -1) + 1; const base = (same[nth] || same[0])?.data || {}; /* 같은 종류가 여럿이면 순서대로 짝지음 */ const title = String(g.title).trim().slice(0, 80); const S = v => (typeof v === 'string' ? v.trim() : ''); let data;
    const date = isD(g.date) ? g.date : '';
    if (g.kind === 'event') data = { ...base, title, date: date || base.date || today, endDate: isD(g.endDate) && g.endDate > (date || '') ? g.endDate : '', start: isT(g.start) ? g.start : g.allDay ? '' : base.start || '', end: isT(g.end) ? g.end : '', who: whoIn(g.who, text, people, base.who), place: S(g.place), area: S(g.area), scope: g.scope === 'personal' ? 'personal' : 'work', repeat: /^(daily|weekly|monthly|weekdays)$/.test(g.repeat || '') ? g.repeat : '', memo: S(g.memo) || base.memo || '', _dated: !!(date || base.date), _allday: !!g.allDay };
    else if (g.kind === 'task') data = { ...base, title, due: date || base.due || '', time: isT(g.start) ? g.start : '', who: whoIn(g.who, text, people, base.who), priority: g.priority === 'high' || base.priority === 'high' ? 'high' : 'normal', project: S(g.project) || base.project || '', scope: g.scope === 'personal' ? 'personal' : 'work', memo: S(g.memo) || base.memo || '' };
    else if (g.kind === 'expense') data = { ...base, title, amount: Number(base.amount) || Number(g.amount) || 0, date: date || base.date || today, category: base.category || S(g.category) || '기타', project: S(g.project) || base.project || '', pay: base.pay || '개인카드' };
    else if (g.kind === 'income') data = { ...base, title, amount: Number(base.amount) || Number(g.amount) || 0, date: date || base.date || '', from: base.from || S(g.who), project: S(g.project) || base.project || '', status: base.status || 'due', memo: base.memo || S(g.memo) };
    else if (g.kind === 'contact') data = { ...base, name: base.name && base.phone ? (S(g.title) || base.name) : title, phone: base.phone || S(g.phone), email: base.email || S(g.email), org: S(g.org) || base.org || '', role: base.role || S(g.role), memo: S(g.memo) };
    else if (g.kind === 'vendor') data = { ...base, name: title, cat: S(g.cat) || base.cat || '기타', phone: base.phone || S(g.phone), link: base.link || S(g.url), kakao: base.kakao || '', memo: S(g.memo), prices: (base.prices && base.prices.length ? base.prices : (g.prices || []).filter(x => x && x.item).map(x => ({ item: String(x.item).slice(0, 40), price: String(Number(x.price) || ''), note: S(x.note), at: today }))) };
    else if (g.kind === 'buy') data = { ...base, title, url: base.url || S(g.url), price: Number(base.price) || Number(g.amount) || 0, qty: 1, need: 'must' };
    else if (g.kind === 'idea' || g.kind === 'note') data = { ...base, title, body: base.body || text, tags: base.tags || [] };
    else if (g.kind === 'grant') data = { ...base, title, deadline: date || base.deadline || '', status: base.status || '검토', amount: base.amount ?? (Number(g.amount) || null), url: base.url || S(g.url) };
    else if (g.kind === 'sns') data = { ...base, title, platform: base.platform || (/유튜브|쇼츠/.test(text) ? '유튜브' : /틱톡/.test(text) ? '틱톡' : /블로그/.test(text) ? '블로그' : /트위터|\bX\b/.test(text) ? 'X' : '인스타그램'), status: base.status || '아이디어', date: date || base.date || '' };
    else data = { ...base, title, url: base.url || S(g.url) };
    out.push({ kind: g.kind, label: g.kind === 'income' && data.status === 'got' ? '받은 돈' : KO[g.kind], confidence: 0.85, data, src: text, ai: true });
  }
  return out.length ? out : (arr.length === 0 ? [] : null);
}

// 캘린더·할 일 화면의 한 줄 입력처럼 종류가 정해진 곳에서 쓴다.
// AI가 같은 종류로 읽은 항목들을 돌려준다. 못 읽었거나 늦으면 null.
export async function readOne(kind, text, rule, ms = 12000) {
  const clean = d => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_')));
  if (!(await enabled())) return null;
  try {
    const store = await import('./store.js'); const d = new Date();
    const people = [...new Set([...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean))];
    const got = await refine(text, [rule], { today: new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), people, projects: (await db.list('projects')).map(x => x.name), ms });
    const hit = (got || []).filter(x => x.kind === kind);
    return hit.length ? hit.map(x => clean(x.data)) : null;
  } catch { return null; }
}
// 한 줄 입력은 규칙이 읽은 값으로 바로 저장해 기다리지 않게 하고, AI가 읽은 뒤 조용히 고쳐 준다.
// 그 사이 사용자가 손댔으면(updatedAt이 바뀜) 건드리지 않는다. 바뀐 게 있으면 true.
export async function polishSaved(kind, text, rule, saved, { patch, add, fix = d => d }) {
  const list = await readOne(kind, text, rule); if (!list) return false;
  const cur = await db.get(saved.id); if (!cur || cur.deleted || cur.updatedAt !== saved.updatedAt) return false;
  const KEYS = kind === 'task' ? ['title', 'due', 'time', 'who', 'priority', 'scope', 'memo'] : ['title', 'date', 'endDate', 'start', 'end', 'who', 'place', 'area', 'scope', 'repeat', 'memo'];
  const a = fix(Object.fromEntries(KEYS.filter(k => list[0][k] !== undefined).map(k => [k, list[0][k]])));
  const differ = ks => ks.some(k => a[k] !== undefined && (a[k] || '') !== (cur[k] || ''));
  if (differ(Object.keys(a))) await patch(cur.id, a);
  let changed = differ(['title', 'due', 'date', 'endDate', 'time', 'start', 'end', 'who', 'place']); // 눈에 보이는 게 바뀌었을 때만 알림
  for (const d of list.slice(1)) { await add(fix(d)); changed = true; }
  return changed;
}

// ── 대화·질문 답하기 ──
// 사용자의 말과 "앱 기록 한눈에"(js/context.js)를 같이 주고, 뜻(질문·잡담 / 새로 적기 / 있는 것 고치기)을 고르게 한 뒤 질문이면 기록을 근거로 답하게 함.
// 키가 없거나 늦거나 실패하면 null → 부르는 쪽이 앱 안 규칙으로 대신 답함
export async function converse(text, { snapshot = '', history = '', name = '', now = new Date(), hint = '', ms = 15000 } = {}) {
  if (!(await enabled()) || !text || text.length > 600) return null;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const prompt = `너는 작은 콘텐츠 기획 팀이 쓰는 업무 앱 "하진 비서" 안의 비서야. 사용자${name ? '(' + name + ')' : ''}의 말을 읽고 JSON 하나로만 답해.

지금: ${today} ${'일월화수목금토'[now.getDay()]}요일 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}
달력(주는 월요일 시작):
${calendarTable(today)}

먼저 말의 뜻을 하나 골라 intent 에 넣어.
- "add": 새로 적어 달라는 말. 일정·약속, 해야 할 일, 쓴 돈·받을 돈, 연락처, 메모·아이디어처럼 기록으로 남길 내용이 담긴 말. 날짜·시간·금액이 있거나 "~해야 해", "~하기로 했어"면 대개 이것. 이때 say 는 빈칸.
- "edit": 이미 [앱 기록]에 있는 것을 바꾸거나, 끝냈다고 하거나, 지워 달라는 말(그래도 될지 묻는 말 포함). ids 에 그 기록 번호, say 에는 무엇을 어떻게 바꾸려는 말인지 한 줄, next 에는 앱에 그대로 시킬 명령문 하나를 제목을 넣어서 써(예: "견적서 보내기 금요일로 미뤄줘", "시안 보내기 끝났어", "주간회의 취소해줘", "포스터 시안 민서한테 넘겨줘").
- "answer": 그 밖의 전부. 기록에 대한 질문(뭐가 있는지, 어디 있는지, 왜 안 보이는지, 언제인지, 얼마인지, 누가 바쁜지, 뭐부터 할지), 앱 쓰는 법, 인사·잡담.

intent 가 "answer"일 때 say 쓰는 법:
- 한국어 존댓말(해요체)로 짧게. 보통 1~3문장. 목록이 필요하면 문장 안에 풀어서 쓰고, 마크다운 기호(*, #, -)는 쓰지 마.
- 기록에 대한 답은 아래 [앱 기록]에 있는 것만 근거로 해. 없으면 없다고 말하고, 지어내지 마. 날짜는 "11/22(일)"처럼.
- 답의 근거가 된 기록 번호(T1, E2, D1…)를 ids 에 넣어(최대 6개). say 안에는 번호를 쓰지 말고 제목으로 말해.
- "왜 없어/안 보여/어디 갔어"는 [대기함]과 [할 일]의 '보이는 곳'을 보고 까닭을 말해 줘: 확정 전이면 대기함에서 확정해야 한다, 마감이 내일 이후면 예정 탭에 있다, 끝냈으면 완료 탭, 담당이 다른 사람이면 담당자별 탭, 기록에 아예 없으면 저장이 안 된 것이니 다시 말해 달라.
- 우선순위를 물으면 마감이 지났거나 가까운 것, 받을 돈, 오늘 일정을 근거로 순서를 권해.
- 앱이 못 하는 일(인터넷 검색, 메일·카톡 보내기, 결제 등)은 못 한다고 하고 앱에서 대신 할 수 있는 것을 한 가지 알려 줘.
- 인사·혼잣말·칭찬·푸념 같은 잡담(예: "민서야 수고가 많아", "아 피곤해")에는 기록을 뒤지거나 앱 사용법을 설명하지 말고, 사람이 받아 주듯 가볍게 한두 문장으로만 답해. ids 는 비워.
- 오타가 있거나 뜻이 분명하지 않은 말은 넘겨짚지 말고, 어떤 뜻인지 한 문장으로 되물어.
- 말끝은 "~해요", "~예요"로. "~합니다", "~입니다"는 쓰지 마.

앱 화면 이름: 오늘(홈), 캘린더, 할 일(탭: 오늘·예정·전체·완료·담당자별), 대기함(비서가 읽어 만든 임시 항목을 확정하는 곳), 기획 보드, 돈(지출·받을 돈), 인맥, 회의록, 마인드맵, 설정.
앱 규칙: 비서가 말에서 읽어 만든 항목은 '임시'로 대기함에 들어가고, 확정을 눌러야 목록·캘린더에 들어가. 할 일 화면에서 직접 적은 건 바로 들어가. 할 일의 오늘 탭은 마감이 오늘까지거나 마감이 없는 일, 예정 탭은 마감이 내일 이후인 일.

intent 가 "answer"면 next 에는 사용자가 이어서 보낼 만한 짧은 말을 0~2개(예: "오늘 할 일 보여줘", "그거 금요일로 미뤄줘").
${hint ? '\n앱 규칙이 먼저 만든 답(참고만, 틀렸으면 고쳐): ' + hint + '\n' : ''}
[앱 기록]
${snapshot || '(비어 있음)'}

[방금 대화]
${history || '(없음)'}

[사용자 말]
${text}

JSON 형식: {"intent":"answer|add|edit","say":"...","ids":["T1"],"next":["..."]}`;
  try {
    const j = await ask(prompt, { json: true, fast: true, ms, temp: 0.3 });
    const o = Array.isArray(j) ? j[0] : j; if (!o || !/^(answer|add|edit)$/.test(o.intent || '')) return null;
    const say = String(o.say || '').replace(/[*#`]/g, '').replace(/\b[TEDIXMN]\d{1,2}\b\s*[,·]?\s*/g, '').replace(/\s+\n/g, '\n').trim().slice(0, 700);
    if (o.intent === 'answer' && !say) return null;
    return { intent: o.intent, say, ids: (Array.isArray(o.ids) ? o.ids : []).map(String).filter(x => /^[TEDIXMN]\d{1,2}$/.test(x)).slice(0, 6), next: (Array.isArray(o.next) ? o.next : []).map(x => String(x).trim()).filter(x => x && x.length <= 30).slice(0, 2) };
  } catch (e) { console.warn('ai', e); return null; }
}

// 글 한 덩이를 정리: 요약·결정·할 일. (마인드맵 "AI 정리", 붙여 넣은 회의록 등) 실패하면 null
export async function digest(text, { today = '', people = [], what = '메모' } = {}) {
  if (!(await enabled()) || (text || '').length < 40) return null;
  try {
    const j = await ask(`다음은 ${what}이야. 오늘은 ${today}. 아는 사람: ${people.slice(0, 30).join(', ') || '없음'}.\n한국어로 정리해서 JSON으로만 답해: {"summary":["핵심 3~6줄, 한 줄 한 문장"],"decisions":["정해진 것"],"actions":[{"title":"할 일(명사형, 짧게)","who":"맡은 사람 또는 빈칸","due":"YYYY-MM-DD 또는 빈칸"}],"ideas":["아이디어"],"questions":["아직 안 정해진 것"]}\n글에 없는 내용은 만들지 마. 숫자·날짜·금액·조건은 빼먹지 마.\n\n${String(text).slice(0, 12000)}`, { json: true });
    if (!Array.isArray(j.summary) || !j.summary.length) return null;
    const arr = v => (Array.isArray(v) ? v : []).map(String).filter(Boolean);
    return { summary: arr(j.summary).slice(0, 8), decisions: arr(j.decisions).slice(0, 12), ideas: arr(j.ideas).slice(0, 12), questions: arr(j.questions).slice(0, 12),
      actions: (Array.isArray(j.actions) ? j.actions : []).filter(x => x && x.title).slice(0, 20).map(x => ({ title: String(x.title).slice(0, 80), who: String(x.who || ''), due: isD(x.due) ? x.due : '', src: String(x.title) })) };
  } catch (e) { console.warn('ai', e); return null; }
}

// SNS 캡션: 제목·자막·콘셉트를 보고 첫 줄(훅)·본문·해시태그. 실패하면 null
export async function caption({ title = '', subs = '', concept = '', tags = '' } = {}) {
  if (!(await enabled()) || !(title + subs).trim()) return null;
  try {
    const j = await ask(`인스타그램·릴스에 올릴 글을 한국어로 써 줘. 작은 콘텐츠 기획 팀 계정이고, 과장 없이 담백하고 귀엽게.\n제목: ${title}\n영상 자막: ${String(subs).slice(0, 3000) || '(없음)'}\n콘셉트: ${concept || '(없음)'}\n꼭 넣을 해시태그: ${tags || '(없음)'}\nJSON으로만: {"hook":"첫 줄, 20자 안팎","body":"본문 2~3문장","hashtags":["#태그", "..."]} 해시태그는 8~12개, 띄어쓰기 없이.`, { json: true, temp: 0.7 });
    if (!j || !j.hook) return null;
    return { hook: String(j.hook), body: String(j.body || ''), hashtags: (Array.isArray(j.hashtags) ? j.hashtags : []).map(x => '#' + String(x).replace(/^#+/, '').replace(/\s/g, '')).filter(x => x.length > 1).slice(0, 14) };
  } catch (e) { console.warn('ai', e); return null; }
}
