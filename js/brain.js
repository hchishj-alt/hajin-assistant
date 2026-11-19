// ─────────────────────────────────────────────────────────────
import { guess as guessScope } from './scope.js';
// 하진 비서의 기본 두뇌 (외부 AI 없이 기기 안에서 돌아가는 한국어 분석 로직)
//  - parseWhen   : "다음 주 화요일 오후 3시" 같은 날짜·시간 인식
//  - keywords    : 핵심 키워드 추출
//  - summarize   : 중요한 문장 골라 요약 (TextRank)
//  - analyzeNotes: 회의·메모에서 결정사항/할 일/질문/일정 뽑기
//  - interpret   : 채팅 한 줄 → 어떤 메뉴의 어떤 작업인지 판단
//  - similar     : 비슷한 기록 찾기
//  - learn       : 하진이 고친 결과에서 배워서 다음부터 반영
// ─────────────────────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const KDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const KNUM = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };
const numOf = s => (s in KNUM ? KNUM[s] : parseInt(s, 10));

// 학습된 규칙 (설정에서 로드)
let learned = { cat: {}, kind: {}, people: [] };
export function setLearned(l) { learned = { cat: {}, kind: {}, people: [], ...(l || {}) }; }
export function getLearned() { return learned; }

// ── 날짜·시간 ────────────────────────────────────────────────
export function parseWhen(text, base = new Date()) {
  const t = ' ' + String(text == null ? '' : text).replace(/[ \t]{3,}/g, '  ') + ' ';
  const b = new Date(base); b.setHours(0, 0, 0, 0);
  let date = null, time = null, end = null, vague = false, dead = false;
  const addM = n => { const d = new Date(b.getFullYear(), b.getMonth() + n, 1); d.setDate(Math.min(b.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d; };
  const hits = [];
  const hit = m => { if (m) hits.push(m[0].trim()); return m; };
  let m;

  // "12월 첫째 주 금요일": 요일이 있으면 그 달의 n번째 그 요일, 없으면 그 주 월요일(흐릿함)
  const nth = t.match(/(\d{1,2})\s*월\s*(첫|둘|셋|넷|다섯|마지막)\s*째?\s*주(?:\s*(월|화|수|목|금|토|일)(?:요일|욜))?/);
  if (nth && +nth[1] >= 1 && +nth[1] <= 12) {
    hits.push(nth[0].trim()); const mo = +nth[1] - 1; let y = b.getFullYear(); const k = { 첫: 1, 둘: 2, 셋: 3, 넷: 4, 다섯: 5, 마지막: 9 }[nth[2]]; const want = nth[3] ? KDAY[nth[3]] : 1;
    const find = yy => { const ds = []; for (let d = new Date(yy, mo, 1); d.getMonth() === mo; d = addD(d, 1)) if (d.getDay() === want) ds.push(new Date(d)); return ds[Math.min(k, ds.length) - 1]; };
    date = find(y); if (date < addD(b, -60)) date = find(y + 1); if (!nth[3]) vague = true;
  }
  else // 절대 날짜
  if ((m = hit(t.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/)))) { date = new Date(+m[1], +m[2] - 1, +m[3]); if (date.getMonth() !== +m[2] - 1 || date.getDate() !== +m[3]) { date = null; dead = true; } }
  else if ((m = hit(t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) || (m = hit(t.match(/(?<![\d:./]|버전\s?|[vV]\s?|ver\.?\s?)(\d{1,2})[/.](\d{1,2})(?![\d:/.%]|\s*(?:%|만|천|억|배|점|위|초|개|명|회|달러|불|지점|[a-zA-Z]))/)))) {
    const mo = +m[1], da = +m[2];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      date = new Date(b.getFullYear(), mo - 1, da);
      if (date < addD(b, -60)) date = new Date(b.getFullYear() + 1, mo - 1, da);
      if (date.getMonth() !== mo - 1) { date = null; dead = true; } // 2월 30일 같은 없는 날
    }
  }
  else if ((m = hit(t.match(/(\d{1,2})\s*월\s*(말|초|중순)/))) && +m[1] >= 1 && +m[1] <= 12) { date = m[2] === '말' ? new Date(b.getFullYear(), +m[1], 0) : new Date(b.getFullYear(), +m[1] - 1, m[2] === '초' ? 1 : 15); if (date < addD(b, -60)) date.setFullYear(date.getFullYear() + 1); }
  else if ((m = hit(t.match(/(다음\s*달|담달|이번\s*달|이달)\s*(\d{1,2})\s*일/))) && +m[2] >= 1 && +m[2] <= 31) { date = new Date(b.getFullYear(), b.getMonth() + (/다음|담/.test(m[1]) ? 1 : 0), +m[2]); if (date.getDate() !== +m[2]) { date = null; dead = true; } }
  // 여러 날: 시작일 바로 뒤의 "6일", "~6일", "부터 6일까지"
  let endDate = null;
  if (date) { const last = hits.at(-1); const rest = t.slice(t.indexOf(last) + last.length); const em = rest.match(/^\s*(?:~|-|부터|,)?\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일(?:까지)?/); if (em && /일$/.test(last)) { let e = new Date(date.getFullYear(), em[1] ? +em[1] - 1 : date.getMonth(), +em[2]); if (em[1] && e < date) e = new Date(date.getFullYear() + 1, +em[1] - 1, +em[2]); if (e > date && e - date < 15 * 864e5) { endDate = e; hits.push(em[0].trim()); } } }
  // 상대 날짜
  if (!date && !dead) {
    if ((m = hit(t.match(/(오늘|(?<![가-힣])금일)\s*(안에|안으로|중으로|중에|내로)/)))) date = b;
    else if ((m = hit(t.match(/(내일|(?<![가-힣])낼)\s*(안에|안으로|중으로|중에|내로)/)))) date = addD(b, 1);
    else if ((m = hit(t.match(/(이번\s*주|금주)\s*(안에|안으로|내로|내에|중으로|중에|까지)/)))) { const fri = addD(b, -((b.getDay() + 6) % 7) + 4); date = fri < b ? addD(fri, 2) : fri; }
    else if ((m = hit(t.match(/((이번\s*달|이달)\s*말|월말|(?<![가-힣])말일)/)))) date = new Date(b.getFullYear(), b.getMonth() + 1, 0);
    else if ((m = hit(t.match(/(오늘|(?<![가-힣])금일)/)))) date = b;
    else if ((m = t.match(/(퇴근\s*전|자기\s*전|점심\s*전|오전\s*중|오후\s*중)(에|까지|으로)?(?=\s|$)/))) date = b;
    else if ((m = hit(t.match(/(내일|(?<![가-힣])낼)\s*모레|(?<![가-힣])모레/)))) date = addD(b, 2);
    else if ((m = hit(t.match(/(내일|(?<![가-힣])낼)/)))) date = addD(b, 1);
    else if ((m = hit(t.match(/(?<![가-힣])글피/)))) date = addD(b, 3);
    else if ((m = hit(t.match(/(그저께|그제|엊그제|엊그저께)/)))) date = addD(b, -2);
    else if ((m = hit(t.match(/어제/)))) date = addD(b, -1);
    else if ((m = hit(t.match(/(일주일|이틀|사흘|나흘|닷새|엿새|열흘|보름)\s*(후|뒤|있다가)/)))) date = addD(b, { 일주일: 7, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 열흘: 10, 보름: 15 }[m[1]]);
    else if ((m = hit(t.match(/(\d+|한|두|세|네|다섯|여섯|일곱)\s*(일|주|달|개월)\s*(후|뒤|있다가)/)))) {
      const n = numOf(m[1]);
      date = m[2] === '일' ? addD(b, n) : m[2] === '주' ? addD(b, n * 7) : addM(n);
    }
    else if ((m = hit(t.match(/(이번\s*주|이번주|금주|다음\s*주|담주|다담주|다다음\s*주|저번\s*주|지난\s*주)?\s*(월|화|수|목|금|토|일)(?:요일|욜)/))) || (m = hit(t.match(/(이번\s*주|이번주|금주|다음\s*주|다음주|담주|다담주|다다음\s*주|다다음주|매주|격주)\s*(월|화|수|목|금|토)(?=\s|까지|에\s|$)/))) || (/\d\s*시|\d:\d\d/.test(t) && (m = hit(t.match(/^\s()(월|화|수|목|금|토)(?=\s+\S)/))))) {
      const target = KDAY[m[2]];
      const mon = addD(b, -((b.getDay() + 6) % 7));
      let off = 0;
      const w = (m[1] || '').replace(/\s/g, '');
      if (/다다음주|다담주/.test(w)) off = 14; else if (/다음주|담주/.test(w)) off = 7; else if (/저번주|지난주/.test(w)) off = -7;
      // "다음주 중 작업 목요일까지"처럼 주 표현이 요일과 떨어져 있어도 같이 읽음
      let far = null; if (!w && (far = t.match(/(이번\s*주|이번주|금주|다음\s*주|다음주|담주|다담주|다다음\s*주|다다음주)\s*(중에|중으로|중|안에|안으로|내로|내에)?(?=\s|$)/))) { const fw = far[1].replace(/\s/g, ''); off = /다다음주|다담주/.test(fw) ? 14 : /다음주|담주/.test(fw) ? 7 : 0; hits.push(far[0].trim()); }
      date = addD(mon, off + ((target + 6) % 7));
      // 주를 말하지 않은 요일이 오늘이거나 지났으면 다음 주 그 요일 (오늘이면 보통 "오늘"이라고 하니까)
      if ((!w && !far && date <= b) || (/매주|격주/.test(w) && date < b)) date = addD(date, 7);
      // "화요일부터 목요일까지" → 며칠짜리
      { const rest = t.slice(t.indexOf(m[0]) + m[0].length); const em = rest.match(/^\s*(?:부터|~|-)\s*(월|화|수|목|금|토|일)(?:요일|욜)?(?:까지)?/); if (em) { const diff = (KDAY[em[1]] - target + 7) % 7; if (diff > 0) { endDate = addD(date, diff); hits.push(em[0].trim()); } } }
    }
    else if ((m = hit(t.match(/(다음\s*주|담주|다다음\s*주|다담주)\s*주?말/)))) date = addD(b, (b.getDay() === 0 ? 0 : 6 - b.getDay()) + (/다다음|다담/.test(m[1]) ? 14 : 7));
    else if ((m = hit(t.match(/(다다음\s*주|다담주)\s*(중에|중으로|중|안에|안으로|내로|까지|부터|에|엔|은|는)?(?=\s|$)/)))) { const cut = /안|내로|까지/.test(m[2] || ''); date = addD(addD(b, -((b.getDay() + 6) % 7)), 14 + (cut ? 4 : 0)); vague = !cut; }
    else if ((m = hit(t.match(/(다음\s*주|담주|다음주)\s*(중에|중으로|중|안에|안으로|내로|까지|부터|에|엔|은|는)?(?=\s|$)/)))) { const cut = /안|내로|까지/.test(m[2] || ''); date = addD(addD(b, -((b.getDay() + 6) % 7)), 7 + (cut ? 4 : 0)); vague = !cut; }
    else if ((m = hit(t.match(/(이번\s*주|이번주|금주)\s*(중에|중으로|중|에)(?=\s|$)/)))) { const fri = addD(b, -((b.getDay() + 6) % 7) + 4); date = fri < b ? b : fri; vague = true; }
    else if ((m = hit(t.match(/(이번\s*주말|주말)/)))) date = addD(b, b.getDay() === 0 ? 0 : 6 - b.getDay());
    else if ((m = hit(t.match(/(이번\s*달|이달)\s*(말|안)/)))) date = new Date(b.getFullYear(), b.getMonth() + 1, 0);
    else if ((m = hit(t.match(/(다음\s*달|담달)\s*(초|말|부터)?/)))) date = m[2] === '말' ? new Date(b.getFullYear(), b.getMonth() + 2, 0) : m[2] ? new Date(b.getFullYear(), b.getMonth() + 1, 1) : addM(1);
    else if ((m = hit(t.match(/(?<![\d월/.박xX×*]|[xX×*]\s)(\d{1,2})\s*일(?![\d간정])(?!\s*(?:필요|걸|소요|동안|정도|치|연장|추가|더|남|만에|째|차|이내|씩|짜리))(?!\s*\d+(?:\.\d+)?\s*만|\s*\d[\d,]*\s*(?:원|천))(?=\s|까지|에|날|$|,)/))) && !(/(하루|일당|1일)\s*[\d,.]+\s*(만|천)?\s*(\d+\s*천)?\s*원?\s*(씩)?\s*\d{1,3}\s*일/.test(t) && hits.pop())) {
      const da = +m[1];
      if (da >= 1 && da <= 31) { for (let k = 0; k < 4; k++) { date = new Date(b.getFullYear(), b.getMonth() + k, da); if (date.getDate() === da && date >= b) break; } } // 31일이 없는 달은 건너뜀
    }
  }

  if (date && !endDate) { const last = hits.find(x => /\d\s*일$|\d{1,2}[/.]\d{1,2}$/.test(x)); if (last) { const rest = t.slice(t.indexOf(last) + last.length); const em = rest.match(/^\s*(?:~|-|부터)?\s*(?:(\d{1,2})[/.])?(\d{1,2})(?:\s*일)?(?:까지)?(?![\d:시/.])/); if (em && (/^\s*(~|-|부터)/.test(em[0]) || /일/.test(em[0])) && +em[2] >= 1 && +em[2] <= 31) { const e = new Date(date.getFullYear(), em[1] ? +em[1] - 1 : date.getMonth(), +em[2]); if (e > date && e - date < 15 * 864e5) { endDate = e; hits.push(em[0].trim()); } } } }
  if (date && !endDate) { const last = hits.find(x => /\d\s*일$/.test(x)); if (last) { const rest = t.slice(t.indexOf(last) + last.length); const em = rest.match(/^\s*\(?[월화수목금토일]?(?:요일)?\)?\s*(?:이랑|랑|하고|와|과|,|·)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일(?:\s*\(?[월화수목금토일](?:요일)?\)?)?/); if (em) { const e = new Date(date.getFullYear(), em[1] ? +em[1] - 1 : date.getMonth(), +em[2]); if (Math.round((e - date) / 864e5) === 1) { endDate = e; hits.push(em[0].trim()); } } } }
  // 시간
  const early = /(집합|콜\s*타임|슛|출발|기상|일출|첫\s*차|조식|(?<!컨펌\s?|확인\s?|피드백\s?|화상\s?|전화\s?|줌\s?|수정본\s?|보고\s?)콜(?=\s|$|,))/.test(t); // 현장 말은 아침 시간
  const ampm = s => /밤/.test(s) ? 'night' : /오후|저녁|pm|PM/.test(s) ? 'pm' : /오전|아침|새벽|am|AM/.test(s) ? 'am' : /점심|낮/.test(s) ? 'noon' : '';
  const toH = (h, ap) => {
    h = +h;
    if (ap === 'night') h = h === 12 ? 24 : h < 5 ? h : h < 12 ? h + 12 : h; // 밤 12시는 그날 끝, 밤 1시는 새벽
    else if (ap === 'pm' && h < 12) h += 12;
    else if (ap === 'am' && h === 12) h = 0;
    else if (ap === 'noon' && h < 6) h += 12;
    else if (!ap && h >= 1 && h <= 7 && !(early && h >= 5)) h += 12; // "3시 회의" → 보통 오후
    return h;
  };
  let tm;
  if ((tm = hit(t.match(/(오전|오후|아침|점심|저녁|밤|새벽|낮)?\s*(\d{1,2})\s*(?:~|-)\s*(\d{1,2})\s*시(?!간|안|작|스템|나리|리즈|즌|행|설|장|청|험|공|사|범|연|트|퀀|뮬|급)/))) && +tm[2] <= 24 && +tm[3] <= 24) {
    const ap = ampm(tm[1] || ''); let h1 = toH(+tm[2], ap), h2 = toH(+tm[3], ap); if (!ap && h1 > h2 && +tm[2] >= 8) h1 = +tm[2]; if (h2 < h1) h2 += 12;
    time = `${pad(Math.min(h1, 23))}:00`; end = h2 >= 24 ? '23:59' : `${pad(h2)}:00`;
  } else if ((tm = hit(t.match(/(오전|오후|아침|점심|저녁|밤|새벽|낮)?\s*(\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*시\s*(반(?=\s|$|에|까지|부터|쯤|으로|이고|,|~|-)|(\d{1,2})\s*분)?\s*(?:부터|~|-|에서)\s*(오전|오후|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)\s*(반(?=\s|$|에|까지|부터|쯤|으로|이고|,|~|-)|(\d{1,2})\s*분)?/)))) {
    const ap = ampm(tm[1] || '');
    const h1 = toH(numOf(tm[2]), ap); const m1 = tm[3] === '반' ? 30 : +(tm[4] || 0);
    let h2 = toH(+tm[6], ampm(tm[5] || '') || (ap === 'am' && +tm[6] < numOf(tm[2]) ? 'pm' : ap)); const m2 = tm[7] === '반' ? 30 : +(tm[8] || 0);
    if (h2 < h1) h2 += 12;
    if (m1 < 60 && m2 < 60) { time = `${pad(Math.min(h1, 23))}:${pad(m1)}`; end = h2 >= 24 ? '23:59' : `${pad(h2)}:${pad(m2)}`; }
  } else if ((tm = hit(t.match(/(\d{1,2}):(\d{2})\s*(?:~|-|부터)\s*(\d{1,2}):(\d{2})/)))) {
    if (+tm[1] < 24 && +tm[3] <= 24 && +tm[2] < 60 && +tm[4] < 60) { time = `${pad(+tm[1])}:${tm[2]}`; end = `${pad(+tm[3])}:${tm[4]}`; }
  } else if ((tm = hit(t.match(/(오전|오후|아침|점심|저녁|밤|새벽|낮|am|pm|AM|PM)?\s*(\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)(?:시(?!간|안|작|스템|나리|리즈|즌|행|설|장|청|험|공|사|범|연|트|퀀|뮬|급)|\s+시(?=\s|$|에|반|까지|부터|쯤))\s*(반(?=\s|$|에|까지|부터|쯤|으로|이고|,|~|-)|(\d{1,2})\s*분)?/)))) {
    const h1 = toH(numOf(tm[2]), ampm(tm[1] || ''));
    const mi = tm[3] === '반' ? 30 : +(tm[4] || 0);
    if (h1 <= 24 && mi < 60) time = h1 === 24 ? (/밤/.test(tm[1] || '') ? '23:59' : '00:00') : `${pad(h1)}:${pad(mi)}`;
  } else if ((tm = hit(t.match(/(?<![\d.:a-zA-Z])(\d{1,2})(?::([0-5]\d))?\s*(am|pm|AM|PM)(?![a-zA-Z])/))) && +tm[1] >= 1 && +tm[1] <= 12) {
    time = `${pad((+tm[1] % 12) + (/pm/i.test(tm[3]) ? 12 : 0))}:${tm[2] || '00'}`;
  } else if ((tm = hit(t.match(/(?<![\d.:])(0?[1-9]|1\d|2[0-3]):([0-5]\d)(?![\d:])/)))) {
    time = `${pad(+tm[1])}:${tm[2]}`;
  } else if ((tm = hit(t.match(/정오/)))) time = '12:00';
  else if ((tm = hit(t.match(/자정/)))) time = '23:59';

  if (!date && time) date = b;
  // 기간(소요시간): "1시간", "30분 동안"
  let mins = null;
  if ((m = t.match(/(\d+(?:\.\d+)?|한|두|세)\s*시간(?:\s*(\d+)\s*분|\s*(반)(?=\s|$|,|동안|정도))?/))) mins = Math.round(numOf(m[1]) * 60 + +(m[2] || 0) + (m[3] ? 30 : 0));
  else if ((m = t.match(/(\d+)\s*분\s*(동안|정도|간)?/)) && !time) mins = +m[1];
  if (time && !end && mins) { const [hh, mm] = time.split(':').map(Number); const e = hh * 60 + mm + mins; end = `${pad(Math.min(23, Math.floor(e / 60)))}:${pad(e % 60)}`; }

  return { date: date ? ymd(date) : null, time, end, mins, hits, endDate: endDate ? ymd(endDate) : null, vague };
}

export const isTimeHit = x => /^(오전|오후|아침|점심|저녁|밤|새벽|낮|am|pm)?\s*(\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*(시|~|-)|^\d{1,2}:\d{2}|^정오|^자정/i.test(String(x || '').trim());
// "까지" → 마감일
export function isDeadline(text) { return /까지|마감|데드라인|due|제출일|안에|안으로|내로|EOD|eod/.test(text); }

// ── 금액·전화·이메일 ─────────────────────────────────────────
export const MONEY_SRC = '(?:\\d+(?:\\.\\d+)?\\s*억\\s*)?(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*만\\s*(?:\\d+\\s*천)?\\s*(?:\\d+\\s*백)?\\s*원?|\\d+(?:\\.\\d+)?\\s*억\\s*원?|\\d+\\s*천\\s*(?:\\d+\\s*백)?\\s*원|(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:원|\\s+원(?![가-힣]))|₩\\s*[\\d,]+';
export function parseMoney(text) {
  const num = x => parseFloat(String(x).replace(/,/g, ''));
  let m = text.match(/(\d+(?:\.\d+)?)\s*억\s*(?:(\d{1,3}(?:,\d{3})+|\d+)\s*만)?\s*(?:(\d+)\s*천)?/);
  if (m) return Math.round(num(m[1]) * 1e8 + (m[2] ? num(m[2]) * 1e4 : 0) + (m[3] && m[2] ? +m[3] * 1000 : m[3] ? +m[3] * 1e7 : 0));
  m = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?\s*(?:(\d+)\s*백)?\s*원?/);
  if (m) return Math.round(num(m[1]) * 10000 + (+(m[2] || 0)) * 1000 + (+(m[3] || 0)) * 100);
  m = text.match(/(\d+)\s*천\s*(?:(\d+)\s*백)?\s*원/);
  if (m) return +m[1] * 1000 + (+(m[2] || 0)) * 100;
  m = text.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:원|\s+원(?![가-힣])|\s*₩|\s*krw)/i) || text.match(/₩\s*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (m) return +m[1].replace(/,/g, '');
  return null;
}
// 단위 없이 쓴 금액: "택시비 12800 법카", "KTX 59,800 왕복"
export function bareAmount(text) { const m = String(text).replace(/\d{3,}\s*[xX×*]\s*\d{3,}(\s*[xX×*]\s*\d+)?\s*(mm|cm|m|px)?/g, ' ').replace(/\d+\s*(mm|cm|px)\s*[xX×*]\s*\d+\s*(mm|cm|px)?/g, ' ').replace(/(01[016789]|02|0[3-6]\d)[\s.-]?\d{3,4}[\s.-]?\d{4}/g, ' ').match(/(?<![\d.,:/#-])(\d{1,3}(?:,\d{3})+|\d{4,7})(?![\d.,:/]|\s*(?:년|월|일|시|분|초|명|개|장|건|회|번|호|층|차|px|mm|cm|kg|km|TB|GB|tb|gb|%|원|만|천)(?![가-힣]))/); return m ? +m[1].replace(/,/g, '') : null; }
export function parsePhone(text) { const m = text.match(/(01[016789]|02|0[3-6]\d)[\s.-]?(\d{3,4})[\s.-]?(\d{4})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; }
export function parseEmail(text) { const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); return m ? m[0] : null; }
export function parseUrls(text) { return text.match(/https?:\/\/[^\s)]+/g) || []; }
export function parseTags(text) { return [...new Set((text.match(/#([\p{L}\p{N}_]+)/gu) || []).map(s => s.slice(1)))]; }

// ── 토큰화 (한국어 조사·어미 떼기) ───────────────────────────
const JOSA = ['으로부터', '에서부터', '이라고', '라고는', '에게서', '한테서', '으로써', '으로서', '이랑', '에서', '에게', '한테', '까지', '부터', '마다', '처럼', '보다', '으로', '이나', '이며', '라고', '하고', '이고', '께서', '에는', '에도', '와는', '과는', '이란', '이야', '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '로', '만', '랑', '나', '야', '요', '님'];
const EOMI = ['이었는데', '였는데', '이라서', '이에요', '이었어', '였어요', '했어요', '했고요', '하는데요', '주세요', '해주세요', '했었는데', '하겠습니다', '했습니다', '합니다', '해야겠다', '해야지', '해야함', '해야돼', '해야해', '해야', '하기로', '하려고', '하는데', '했는데', '해서', '하면', '하고', '했고', '했다', '한다', '하자', '해요', '했어', '할게', '할래', '하기', '하는', '해줘', '해주세요', '시키기', '되는', '되고', '됐다', '된다', '되면', '스럽게', '적으로', '적인', '같은', '같아', '거든요', '잖아요', '는데요', '네요', '어요', '아요', '고요', '죠', '임', '함', '됨', '음'];
const STOP = new Set('어떨까 어떨까요 가기 가면 정리 결정 하기 했어요 했습니다 같아요 다음주 이번주 지난주 저번주 담주 월요일 화요일 수요일 목요일 금요일 토요일 일요일 오늘은 내일은 그리고 그래서 그런데 근데 하지만 그러면 그럼 이제 일단 약간 진짜 정말 너무 아주 좀 조금 많이 그냥 막 뭔가 이런 저런 그런 이거 저거 그거 여기 저기 거기 우리 저희 제가 내가 나는 저는 너는 이번 다음 지난 오늘 내일 모레 어제 때문 정도 부분 경우 관련 대해 대한 위해 통해 가지 하나 하는 있는 없는 있다 없다 있어 없어 있고 없고 같다 같은 되다 하다 것 거 수 등 및 또 더 다 안 못 잘 왜 뭐 어떻게 언제 어디 누구 오전 오후 저녁 아침 점심 시간 분 시 월 일 주 년 요일 해야 하기로 하면 해서 그거는 이거는 저거는 the a an and or to of in on for is are be it this that we i you 음 어 아 네 예 응 오케이 ok 넵 넹 감사합니다 수고 했습니다 합니다'.split(' '));

export function stem(w) {
  w = w.replace(/[^\p{L}\p{N}#+]/gu, '');
  if (!w) return '';
  if (/^[a-z0-9#+]+$/i.test(w)) return w.toLowerCase();
  if (/(는데|어서|아서|해서|고요|세요|라서|니까|면서|거든|잖아|었는|았는|겠는|는지|ㄴ데|던데|으면|다고|라고|냐고|자고|이라|이에|에요|어요|아요|해요|했어|했다|한다|하는|된다|됐어|같아|같은|싶어|싶은)$/.test(w)) return '';
  if (/[가-힣]으로$/.test(w) && w.length >= 3) w = w.slice(0, -2);
  for (const e of EOMI) if (w.length > e.length + 1 && w.endsWith(e)) { w = w.slice(0, -e.length); break; }
  for (let k = 0; k < 2; k++) for (const j of JOSA) if (w.length > j.length + 1 && w.endsWith(j)) { w = w.slice(0, -j.length); break; }
  return w;
}
export function tokens(text) {
  return String(text || '').replace(/https?:\/\/\S+/g, ' ').split(/[\s,.!?·…~\-"'“”‘’()[\]{}<>:;/\\|]+/).map(stem).filter(w => w && w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

// ── 문장 나누기 (말로 한 것처럼 구두점 없는 글도 처리) ─────────
export function sentences(text) {
  let s = String(text || '').replace(/\r/g, '');
  s = s.replace(/([.!?。])\s+/g, '$1\n')
    .replace(/(다|요|죠|음|함|임|네|까|지|래|게|자)\s+(?=(그리고|그래서|그런데|근데|그럼|일단|또|아 |음 |그 다음|다음으로|마지막으로|참|아무튼|암튼))/g, '$1\n')
    .replace(/(요|니다|[었았했겠한된인였]다|이다|하자|가자|보자|두자|합시다|죠|까|거든|래)\s+/g, '$1\n')
    .replace(/\s+(?=(그 다음으로|그 다음에|다음으로|마지막으로|그리고 나서|아무튼|암튼)\s)/g, '\n');
  const out = [];
  for (let line of s.split('\n')) {
    line = line.replace(/^\s*[-*•·\d.)]+\s*/, '').trim();
    if (!line) continue;
    // 너무 긴 문장은 쉼표·접속어미 기준으로 다시 자름
    if (line.length > 140) out.push(...line.split(/(?<=[,，]|는데|어서|고서)\s+/).map(x => x.trim()).filter(Boolean));
    else out.push(line);
  }
  return out;
}

// ── 키워드 ───────────────────────────────────────────────────
export function keywords(text, k = 8, corpus = null) {
  const toks = tokens(text).filter(w => !/^\d/.test(w) && !/(이다|였다|했다|한다|된다|있다|없다)$/.test(w)); // 숫자·서술어 조각은 열쇠말이 아님
  if (!toks.length) return [];
  const tf = new Map();
  toks.forEach((w, i) => {
    tf.set(w, (tf.get(w) || 0) + 1);
    // 연속 두 단어 구문 (예: "협찬 초대장")
    if (i && toks[i - 1] !== w) { const bg = toks[i - 1] + ' ' + w; tf.set(bg, (tf.get(bg) || 0) + 0.6); }
  });
  const df = corpus ? docFreq(corpus) : null;
  const N = corpus ? corpus.length + 1 : 1;
  const scored = [...tf].map(([w, f]) => {
    const isBg = w.includes(' ');
    let s = f * (1 + Math.min(w.length, 8) / 6);
    if (isBg && f < 1.2) s *= 0.4;
    if (/^[A-Z]/.test(w) || /^[a-z]{3,}$/.test(w)) s *= 1.15;
    if (df) s *= Math.log(1 + N / (1 + (df.get(w) || 0)));
    return [w, s];
  }).sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [w] of scored) {
    if (out.length >= k) break;
    if (out.some(o => o.includes(w) || w.includes(o))) continue;
    out.push(w);
  }
  return [...new Set([...parseTags(text), ...out])].slice(0, k);
}
function docFreq(corpus) { const df = new Map(); for (const d of corpus) for (const w of new Set(tokens(d))) df.set(w, (df.get(w) || 0) + 1); return df; }

// ── 요약 (TextRank) ──────────────────────────────────────────
export function summarize(text, n = null) {
  const ss = sentences(text).slice(0, 400); // 아주 긴 글은 앞 400문장만 견줌
  if (ss.length <= 2) return ss;
  n = n || Math.max(2, Math.min(6, Math.round(ss.length * 0.3)));
  const toks = ss.map(s => new Set(tokens(s)));
  const kw = new Set(keywords(text, 10).flatMap(k => k.split(' ')));
  const W = ss.map((_, i) => ss.map((_, j) => {
    if (i === j) return 0;
    const a = toks[i], b = toks[j];
    if (!a.size || !b.size) return 0;
    let inter = 0; a.forEach(x => b.has(x) && inter++);
    return inter / (Math.log(a.size + 1) + Math.log(b.size + 1));
  }));
  let r = ss.map(() => 1);
  const sums = W.map(row => row.reduce((x, y) => x + y, 0));
  for (let it = 0; it < 30; it++) {
    r = r.map((_, i) => { let acc = 0; for (let j = 0; j < W.length; j++) if (sums[j]) acc += (W[j][i] / sums[j]) * r[j]; return 0.15 + 0.85 * acc; });
  }
  const score = ss.map((s, i) => {
    let sc = r[i];
    toks[i].forEach(w => kw.has(w) && (sc += 0.25));
    if (DECIDE.test(s) || ACTION.test(s)) sc += 0.6;
    if (s.length < 12) sc *= 0.5;
    if (i === 0) sc += 0.2;
    return [i, sc];
  });
  return score.sort((a, b) => b[1] - a[1]).slice(0, n).sort((a, b) => a[0] - b[0]).map(([i]) => tidy(ss[i]));
}
const tidy = s => s.replace(/^((그리고|그래서|근데|그런데|일단|아|음|어|그|또|암튼|아무튼|그 다음으로|다음으로|그 다음에|마지막으로)\s+)+/, '').replace(/\s+/g, ' ').trim();

// ── 회의·메모 분석 ───────────────────────────────────────────
const DECIDE = /(결정|확정|으로\s*(가기로|정했|결정)|로\s*가기로|정했|합의|채택|으로\s*가자|로\s*가자|하자고\s*했|으로\s*간다|로\s*픽스|픽스)/;
const ACTION = /(해야|야\s*(함|해|돼|됨|한다|하는데|겠)|끝내|넘기|넘겨|받아|받기|신고|할\s*것|하기로|해\s*주세요|해주세요|해\s*줘|해줘|부탁|맡|담당|준비|보내|제출|전달|공유하|정리하|만들|작성|수정|체크|확인하|확인해|예약|연락|요청|업로드|올리|뽑|찾아|알아보|검토|리뷰|컨펌|피드백|까지|마감|todo|TODO|할\s*일|챙기|구매|주문|결제|신청|발송|출력|인쇄)/;
const QUESTION = /(\?|인가요|일까(?!지)|할까(?!지)|될까(?!지)|[^끝]나요$|는지\s|궁금|고민|문제|이슈|리스크|걱정|애매|미정|모르겠)/;
const IDEA = /(아이디어|어떨까|하면 좋|해보면|해 보면|넣으면|컨셉|콘셉트|느낌으로|제안|해볼까|하는 건 어때)/;

const GIVEN = new Set('민서 서연 지우 서윤 하윤 지유 지민 채원 수아 지아 다은 예은 수빈 소율 예린 지원 소윤 유진 시은 은서 윤서 가은 민지 예진 수민 유나 서영 예서 채은 다인 수연 서진 나은 민주 지현 연우 하린 다현 시연 서아 지은 예지 수현 유빈 혜원 은채 주은 소연 가윤 나연 민경 승연 세은 다연 하은 지수 예나 아영 채윤 지안 현서 서현 시현 민정 은지 혜진 수진 지혜 지영 미진 은영 현정 수정 보람 아름 유리 소영 혜인 다솜 한나 세영 나영 희진 주연 은비 소희 예슬 가영 선영 미소 수지 윤아 태희 민준 서준 도윤 예준 시우 주원 하준 지호 지후 준우 준서 건우 현우 우진 지훈 선우 서진 연우 유준 정우 승우 승현 시윤 준혁 은우 지환 승민 유찬 민성 준영 시후 진우 지성 수호 현준 재윤 태윤 민재 재원 한결 윤우 민규 재민 은찬 성민 동현 재현 성현 민혁 태현 준호 민호 승준 경민 정민 현수 동욱 성훈 상현 재영 영준 태민 종현 상우 준기 창훈 예진 하진 수집 태양 지원 현아 창민 형준 성준 재훈 기현 도현 주환 태준 은호 이준 하람 로운 서율 다온 라온 가람 나래 누리 마루 보라 새롬 슬기 우리 은솔 초롱 하늘 한별 한솔 해인 세진 경수 정훈 영호 상민 동훈 진혁 대현 성우 용준 병준 석진 남준 태형 윤기 호석 정국'.split(' '));
const SURNAME = '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용';
const NOTNAME = new Set('우리 하늘 보라 마루 누리 나래 슬기 가람 지원 수정 주연 미소 수집 태양 한결'.split(' ')); // 이름으로도 쓰지만 보통 낱말인 것은 조사가 붙었을 때만
// 처음 보는 이름이라도 사람 이름으로 볼 만한가
export function isName(w, strict = false) {
  w = String(w || ''); if ((learned.people || []).includes(w)) return true;
  if (/^[가-힣]{2}$/.test(w)) return GIVEN.has(w) && (!strict || !NOTNAME.has(w));
  if (/^[가-힣]{3}$/.test(w)) return SURNAME.includes(w[0]) && GIVEN.has(w.slice(1));
  return false;
}
// 문장 맨 앞에 선 이름: "민서 금요일까지 …", "서연이가 …", "지훈: …"
export function leadName(s) {
  const t = String(s || '').trim();
  for (const n of [3, 2]) { const c = t.slice(0, n), rest = t.slice(n); const m = rest.match(/^(님|씨|이가|가|이는|이도|이|는|은|도|한테|에게)?(\s*[:：]|\s|$)/); if (m && isName(c, !m[1] && !/[:：]/.test(m[2]))) return c; }
  return '';
}
export function findAssignee(s, people = []) {
  const names = [...(people || []), ...(learned.people || [])].filter(Boolean);
  const E = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "민서한테 전달", "민서가 준 수정사항"의 민서는 일을 하는 사람이 아님
  const notDoer = n => (new RegExp(`${E(n)}(이|님|씨)?\\s*(한테|에게|께)(서)?(\\s|도)`).test(s + ' ') && !/(맡기|맡겨|맡김|맡길|시키|시켜|시킴|넘기|넘겨|넘김|부탁|토스|배정|할당)/.test(s)) || new RegExp(`${E(n)}(이|님|씨)?(가|이가)?\\s*(준|보낸|말한|요청한|부탁한|올린|만든|쓴|찍은|정한|시킨|넘겨준|넘긴)\\s`).test(s + ' ');
  for (const n of names) if (s.includes(n) && !notDoer(n)) return n;
  // 성 빼고 이름만 불러도 알아듣기 (김민서 → 민서)
  for (const n of names) if (/^[가-힣]{3}$/.test(n) && new RegExp(E(n.slice(1)) + '(님한테|님께|님에게|님이|님|씨|이가|이는|이|가|는|은|한테|에게|께|선배|팀장|실장|대리|피디|PD)?[\\s,:：]').test(s + ' ') && !notDoer(n.slice(1))) return n.slice(1);
  const m = s.match(/([가-힣]{2,6})(?:님|씨|이가|가|이)\s*(?:이|가)?\s*(?:맡|담당|하기로|해\s*주|준비|정리|만들|보내|작성|해오|검수|확인|체크|편집|촬영|섭외|디자인|수정)/);
  if (m && !STOP.has(m[1]) && !/^(우리|저희|제가|내가|그게|이게|이거|그거|다음|이번|클라이언트|광고주|고객)$/.test(m[1])) { const nm = m[1].replace(/님$/, '').replace(/(팀장|실장|선배|후배|대리|과장|피디|PD|대표|감독|작가)$/, ''); if (nm.length >= 2 && (m[1].length <= 4 || nm !== m[1])) return nm; }
  if (/(제가|내가|저는|나는)\s*/.test(s) && ACTION.test(s)) return '나';
  if (/^(나|저)\s+\S/.test(s.trim())) return '나';
  const ln = leadName(s); return ln && !notDoer(ln) ? ln : '';
}

export function cleanTask(s, who = '') {
  let r = tidy(s).replace(/(^|\s)(급하게|급히|빨리|꼭|반드시|무조건)(?=\s)/g, ' ').replace(/(이번\s*주|금주|오늘|내일|월말|말일|이번\s*달\s*말)\s*(안에|안으로|중으로|중에|내로|내에|까지)/g, ' ');
  { const end = { 겨: '기기', 려: '리기', 봐: '보기', 워: '우기', 와: '오기', 써: '쓰기', 줘: '주기', 꿔: '꾸기', 춰: '추기', 내: '내기', 해: '하기' }; r = r.replace(/(겨|려|봐|워|와|써|줘|꿔|춰|내|해)야\s*(해|돼|함|됨|겠다|한다|하는데|되는데|지)\S*\s*$/, (m0, a) => end[a]).replace(/([받찾닫믿얻])아야\s*(해|돼|함|됨|겠다|한다|지)\S*\s*$/, '$1기'); }
  r = r.replace(/^(나|저)(는|도)?\s+(?=\S)/, '').replace(/\s*(아직|여태|결국)?\s*(못|안)\s*(함|했어요?|했음|했다|끝냄|끝냈어요?|보냄|보냈어요?|한\s*상태)\s*$/, '').replace(/(봐|와|써|꿔|춰|겨|려|워|져|쳐|여|켜)\s*(주세요|줘|주라|줄래)\s*$/, (m0, a) => ({ 봐: '보', 와: '오', 써: '쓰', 꿔: '꾸', 춰: '추', 겨: '기', 려: '리', 워: '우', 져: '지', 쳐: '치', 여: '이', 켜: '키' }[a]) + '기');
  if (who && who !== '나') r = r.replace(new RegExp('(^|\\s)' + who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(팀장|실장|선배|후배|대리|과장|피디|PD|대표|감독|작가)?(님|씨)?(이가|이|가|은|는|께서|한테|에게|께)?\\s*[:：]?\\s*'), ' ').trim().replace(/([가-힣])(은|는)\s+(하기로\S*|하기|맡기로\S*|담당)\s*$/, '$1');
  r = r.replace(/(다음\s*주|이번\s*주|담주|다담주|다다음\s*주)?\s*[월화수목금토일](요일|욜)(까지|에|부터)?/g, ' ')
    .replace(/(?<![가-힣])(오늘|내일|모레|글피|오전|오후|저녁|아침)(까지|에|부터)?(?![가-힣])|(다음\s*주|이번\s*주|\d+월\s*\d+일|\d{1,2}\/\d{1,2}|\d+시(\s*반|\s*\d+분)?)(까지|에|부터)?/g, ' ')
    .replace(/(^|\s)(밤|새벽|낮|점심)(까지|부터)(?=\s|$)/g, ' ')
    .replace(/\s(까지|에)\s/g, ' ')
    .replace(/(제가|내가|저는|나는|우리가|저희가)\s*/g, '')
    .replace(/[.!~]+$/, '').replace(/\s+/g, ' ').trim()
    .replace(/^(까지였던|까지인|까지였는데|까지|부터|에)\s+/, '');
  // 끝말을 "~하기" 꼴로
  r = r.replace(/(\S+?)하?(해\s*주세요|해\s*줘|해\s*주라|하기로\s*\S*|해야\s*\S*|할\s*것|합시다|하자|할게요?|해요|했어요|합니다)$/, (m, a) => a + (/하$/.test(a) ? '기' : '하기'))
    .replace(/(\S+?)[어아]?\s*(주세요|줘|주라|드리기|드려요|드릴게요)$/, '$1기')
    .replace(/(\S+?)(기로\s*\S*|야\s*(해|돼|함|됨|겠다)\S*|ㄹ게요?)$/, '$1기')
    .replace(/\s+(할게요?|하겠음|하겠습니다|맡을게요?|맡음|달래|해\s*달래|해달래)$/, '').replace(/(했음|했다|했어|(?<!명|보관|우편|사서|수거|투표|응모|건의|편지|메일|구급|경|군)함|(?<!안|작)됨|(?<!프레|게|타|모|라|클레|책|담|선|후|부|취|위|역|해|분|디|퍼|패러다|맥|헬|스트)임)$/, '').trim();
  return r.replace(/^[,.:：\s]+|[,.\s]+$/g, '');
}

export function analyzeNotes(text, { people = [], base = new Date() } = {}) {
  const ss = sentences(text);
  const decisions = [], actions = [], questions = [], ideas = [], dates = [];
  for (const s of ss) {
    const w = parseWhen(s, base);
    if (DECIDE.test(s)) decisions.push(tidy(s));
    if (ACTION.test(s) && !/(했었|했던|지난번)/.test(s)) {
      const who = findAssignee(s, people); const title = cleanTask(s, who);
      if (title.length >= 3) actions.push({ title, who, due: w.date, time: isDeadline(s) ? null : w.time, src: tidy(s) });
    } else if (w.date && (w.time || w.hits.some(x => !/^(오늘|금일)$/.test(x)))) dates.push({ title: cleanTask(s), date: w.date, time: w.time, end: w.end, src: tidy(s) });
    if (QUESTION.test(s)) questions.push(tidy(s));
    else if (IDEA.test(s) && !DECIDE.test(s)) ideas.push(tidy(s));
  }
  return {
    summary: summarize(text),
    keywords: keywords(text, 10),
    decisions: uniq(decisions).slice(0, 12),
    actions: uniqBy(actions, a => a.title).slice(0, 20),
    questions: uniq(questions).slice(0, 10),
    ideas: uniq(ideas).slice(0, 10),
    dates: uniqBy(dates, d => d.title + d.date).slice(0, 10),
    stats: { sentences: ss.length, chars: text.length, minutesRead: Math.max(1, Math.round(text.length / 500)) },
  };
}
const RATE = /(하루|1일(?=\s)|일당|회당|건당|컷당|편당|장당|개당|인당|시간당|분당|단가|견적|최소\s*\d)/;
const SPENT = /(썼|씀|결제|샀|삼$|구매했|구매함|냈|냄$|긁|지출|영수증|이체|송금함|송금했|계산함|계산했|법카|법인\s*카드|개인\s*카드|카드로|현금으로|회의비|교통비|식대|택시|주차비|커피|점심|저녁|간식|배달|충전)/;
const INCOME = /(받기로|받을\s*(돈|거|예정)|입금\s*(됨|됐|받|예정|확인|완료)|들어옴|들어왔|안\s*들어|미수금|계약금|선금|착수금|잔금|중도금|수금|매출|받음|받았)/;
const BIZ = /(?:^|\s)[가-힣A-Za-z0-9]{2,}(프린팅|프린트|애드피아|렌탈|컴퍼니|상사|공방|인쇄|미디어|픽처스|필름|웍스|코리아|조명|사운드|시티|나라|마켓|상회|전자|엔터|프로덕션|스토어|픽셀랩|랩|샵|숍)(?=\s|$|은|는|이|가|에서)/;
const LEAVE = /(휴무|반차|연차|월차|휴가|출장|외근|재택|병가|조퇴|지각|결근|휴일|쉬는\s*날|대체\s*휴일|못\s*(온|와|옴|간|감|나온|나와)|불참|빠진대|빠질|안\s*온대)/;
const NOTELABEL = /(주소|비번|비밀번호|와이파이|wifi|계좌|사이즈|치수|규격|문구|순서|해시태그|배운\s*거|배운\s*것|참고사항|특이사항)\s*[:：]/i;
const METRIC = /(ROAS|CPC|CTR|CPA|CPM|조회수|팔로워|구독자|전환율|도달|노출수|클릭률|시청률|이탈률?|소진)/i;
const TASKEND = /((?<!이야|얘|분위|크|세|동|계|악|일|연|인|향|감|장|단|초|후|중|말|시|주|분|용|무|경|전|공|기|자|저|여|거|고|아|반|정|수)[가-힣]기|정리|작성|수정|제출|확인|검토|공유|전달|발주|예약|섭외|준비|체크|업로드|백업|발송|회신|답장|리서치|조사|문의|필요|검수|반영|교체|삭제|변경|물어보기|알아보기)$/;
const HELPQ = /(어떻게\s*(써|쓰|지워|지우|해요?\s*\??$|하나요?|바꿔|고쳐|만들|들어가|공유)|차이가?\s*뭐|뭐\s*할\s*수\s*있|할\s*수\s*있는\s*(거|게|일)|(대기|대기함|확정|임시|공유|동기화|팀\s*공간)[가이은는]?\s*뭐|뭐\s*먹|사용법|쓰는\s*법)/;
const uniq = a => [...new Set(a)];
const uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };

// ── 비용 카테고리 ────────────────────────────────────────────
export const EXP_CATS = {
  식비: /(점심|저녁|아침|밥|식사|식대|식당|배달|커피|카페|스타벅스|음료|간식|회식|치킨|피자|빵|편의점|마라|국밥|떡볶이)/,
  교통: /(택시|버스|지하철|기차|ktx|KTX|srt|SRT|주유|기름|주차|톨게이트|카카오T|우버|항공|비행기|교통)/,
  재료비: /(재료|인쇄|출력|프린트|제본|원단|화방|문구|폼보드|아크릴|굿즈|샘플|목업|촬영소품|소품)/,
  소프트웨어: /(구독|어도비|adobe|피그마|figma|노션|notion|클로드|claude|chatgpt|gpt|구글|google|클라우드|서버|도메인|호스팅|앱스토어|플러그인|폰트|unity|유니티|언리얼)/i,
  장비: /(노트북|모니터|키보드|마우스|태블릿|아이패드|카메라|렌즈|조명|마이크|삼각대|하드|ssd|SSD|케이블|충전기)/,
  대관·시공: /(대관|임대료|임차|시공|철거|설치비|집기\s*대여|렌탈|부스\s*제작)/,
  회의비: /(회의|미팅|스터디룸|공간|장소)/,
  마케팅: /(광고|홍보|인스타|instagram|유튜브|부스트|협찬|현수막|포스터|전단|명함)/,
  교육: /(강의|수강|책|도서|세미나|컨퍼런스|교육|클래스|튜토리얼)/,
  인건비: /(외주|인건비|알바|용역|사례비|강사비|페이)/,
};
export function guessCategory(text) {
  for (const [k, v] of Object.entries(learned.cat || {})) if (text.includes(k)) return v;
  for (const [c, re] of Object.entries(EXP_CATS)) if (re.test(text)) return c;
  return '기타';
}

// ── 채팅 한 줄 해석 ─────────────────────────────────────────
// 반환: [{ kind, data, label, confidence }]  kind ∈ event|task|expense|contact|note|idea|reference|timelog|sns|okr|grant|query|nav
export function interpret(input, ctx = {}) {
  input = String(input == null ? '' : input).replace(/[ \t]{3,}/g, '  '); ctx = { ...ctx, people: (ctx.people || []).filter(x => typeof x === 'string' && x) };
  const base = ctx.base || new Date();
  const blk = noticeBlock(input, base, ctx) || bulletBlock(input, base, ctx); if (blk) return blk.map(r => polish({ src: input, ...r }, ctx));
  const parts = splitCommands(input).flatMap(p => splitList(p, base, ctx)).flatMap(p => splitPeople(p, base, ctx));
  const out = [];
  for (const p of parts) {
    const pre = (p.match(/^\s*(할\s*일|할일|투두|todo)\s*[:：]\s*/i) || [''])[0];
    const days = pre ? null : weekdayList(p);
    if (days) { // "릴스 화목 저녁 7시 업로드" → 요일마다 하나씩. 이어진 날의 휴가는 한 줄로
      const mk = d => interpretOne(p.replace(days.raw, ` ${days.week || (days.repeat ? '매주' : '')} ${d}요일 `).replace(/\s+/g, ' '), base, ctx)[0];
      if (days.span) { const r = mk(days.list[0]); if (r && r.data && r.data.date) { const e = new Date(r.data.date + 'T00:00'); e.setDate(e.getDate() + days.list.length - 1); r.data.endDate = ymd(e); } if (r) out.push({ ...r, src: p.trim() }); }
      else for (const d of days.list) { const r = mk(d); if (r) out.push({ ...r, src: p.trim() }); }
      continue;
    }
    const steps = splitSteps(p.slice(pre.length), base, ctx).map((st, i, a) => (i ? carryDate(a[i - 1], st, base) : st));
    if (steps.length < 2) { out.push(...interpretOne(p, base, ctx).map(r => ({ ...r, src: p.trim() }))); continue; }
    // 단계마다 날짜가 다른 한 문장 → 단계별 항목. 약속(시간 있음)은 일정, 나머지는 할 일
    let prev = null;
    for (const st of steps) {
      let r = pre ? null : interpretOne(st, base, ctx)[0];
      if (!r || (r.kind !== 'task' && r.kind !== 'event')) r = interpretOne('할일: ' + st, base, ctx)[0];
      if (r.kind === 'event') r.data.title = String(r.data.title || '').replace(/\s*하기$/, '').trim() || r.data.title;
      if (r.kind === 'task' && prev) r.data.memo = [r.data.memo, `앞 단계: ${prev.data.title}`].filter(Boolean).join(' · ');
      out.push({ ...r, src: p.trim() }); prev = r;
    }
  }
  return out.map(r => polish(r, ctx));
}
// 뒤 조각에 시각만 있으면 앞 조각의 날짜를 물려줌: "내일 10시 미팅하고 3시에 답사" → 답사도 내일
function carryDate(prev, cur, base) { const cw = parseWhen(cur, base); if (!cw.hits.length || !cw.hits.every(isTimeHit)) return cur; const dh = parseWhen(prev, base).hits.find(x => !isTimeHit(x)); return dh ? `${dh} ${cur}` : cur; }
const known = (w, ctx) => (ctx.people || []).some(n => n && (n === w || n.slice(1) === w));
// 쉼표로 늘어놓은 여러 건: 조각마다 날짜·시각·금액이 있거나, 조각마다 사람으로 시작할 때만 나눔
function splitList(p, base, ctx) {
  if (p.length > 200 || /https?:\/\//.test(p) || /^\s*(업체|거래처)\s*[:：]/.test(p)) return [p];
  const segs = p.split(/\s*,\s+|\s+\/\s+/).map(x => x.trim()).filter(Boolean); if (segs.length < 2 || segs.length > 6) return [p];
  const lead = x => /^(나|저|내가|제가)(는|은)?\s+\S/.test(x) || (() => { const m = x.match(/^([가-힣]{2,3}?)(이는|는|은|이가|가|이)\s+\S/); return !!m && (known(m[1], ctx) || isName(m[1])); })();
  if (segs.every(lead)) return segs.map(x => '할일: ' + x);
  const sig = x => parseWhen(x, base).hits.length > 0 || parseMoney(x) != null;
  if (!segs.every(x => sig(x) && x.replace(/\s/g, '').length >= 3) || segs.filter(x => parseWhen(x, base).hits.length).length < 1) return [p];
  if (segs.every(x => parseMoney(x) != null && !parseWhen(x, base).hits.length) && !/(썼|결제|샀|냈|긁|지출)/.test(p)) return [p]; // 가격표는 한 업체의 품목들
  return segs.map((x, i) => (i ? carryDate(segs.slice(0, i).reverse().find(y => parseWhen(y, base).hits.some(h => !isTimeHit(h))) || '', x, base) : x));
}
// "대본은 민서가 쓰고 편집은 서연이 금요일까지" → 사람마다 하나씩, 마감은 같이
function splitPeople(p, base, ctx) {
  const toks = p.trim().split(/\s+/); if (toks.length < 4 || toks.length > 16) return [p];
  const nameAt = i => { const m = toks[i].match(/^([가-힣]{2,3}?)(이가|가|이는|이|는|은)?$/); return m && m[2] !== undefined && (known(m[1], ctx) || isName(m[1])) ? m[1] : (m && !m[2] && (known(toks[i], ctx) || isName(toks[i], true)) ? toks[i] : ''); };
  const idx = toks.map((_, i) => (nameAt(i) ? i : -1)).filter(i => i >= 0); if (idx.length !== 2 || nameAt(idx[0]) === nameAt(idx[1])) return [p];
  for (let k = idx[0] + 1; k < idx[1]; k++) if (/^[가-힣]+고$/.test(toks[k]) && !/^(광고|보고|참고|원고|공고|그리고|최고|사고|재고|창고|경고)$/.test(toks[k])) {
    let left = [...toks.slice(0, k), toks[k].replace(/하고$/, '하기').replace(/고$/, '기')].join(' '); const right = toks.slice(k + 1).join(' ');
    const dl = right.match(/(\S+\s+)?\S+까지/); if (dl && !parseWhen(left, base).hits.length && parseWhen(dl[0], base).date) left += ' ' + (parseWhen(dl[0], base).hits.join(' ') + '까지');
    return ['할일: ' + left, '할일: ' + right];
  }
  return [p];
}
// 요일 묶음: "화목", "월수금", "월 화 수", "화요일 목요일"
const DAYWORD = new Set('수금 금일 일월 월일 일수 토목 목화 수화 화수 일화 금수 일목 수일 금화 목수'.split(' '));
export function weekdayList(p) {
  const wk = '(이번\\s*주|이번주|금주|다음\\s*주|다음주|담주|다담주|다다음\\s*주|매주|격주)';
  let m = p.match(new RegExp(`(?:^|\\s)(?:${wk}\\s*)?([월화수목금토일]{2,5})(?=\\s|마다|에\\s|$)`)); let list = null, raw = '';
  if (m && new Set(m[2]).size === m[2].length && !DAYWORD.has(m[2]) && [...m[2]].every((c, i, a) => !i || KDAY[c] === 0 || KDAY[c] > KDAY[a[i - 1]] || a[i - 1] === '일')) { list = [...m[2]]; raw = m[0]; }
  if (!list && (m = p.match(new RegExp(`(?:^|\\s)(?:${wk}\\s*)?((?:[월화수목금토일](?:요일|욜)?(?:\\s*[,·]\\s*|\\s+)){1,4}[월화수목금토일](?:요일|욜)?)(?=\\s|마다|에\\s|$)`)))) { const ds = m[2].match(/[월화수목금토일](?=요일|욜|\s|,|·|$)/g) || []; if (ds.length >= 2 && new Set(ds).size === ds.length && (/요일|욜/.test(m[2]) || m[1])) { list = ds; raw = m[0]; } }
  if (!list) return null;
  const week = (m[1] || '').replace(/\s/g, ''); const fixed = /(매주|격주|고정|마다|매번)/.test(p);
  const consec = list.every((c, i) => !i || KDAY[c] === (KDAY[list[i - 1]] + 1) % 7);
  return { list, raw, week: /매주|격주/.test(week) ? week : week, repeat: fixed || !week, span: consec && /(휴가|연차|월차|출장|워크숍|엠티|MT|여행|답사|로케)/.test(p) && !fixed };
}
// 줄마다 "- 항목"으로 온 묶음(수정 요청, 체크리스트): 항목마다 할 일, 맨 끝 줄의 마감을 같이 씀
export function isBlock(input) { const ls = String(input || '').split(/\n+/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return false; const b = ls.filter(l => /^(?:[-*•·▪◦✓☐□]|\d{1,2}[.)]|\(\d{1,2}\)|[①-⑳])\s*\S/.test(l)).length; const lab = ls.filter(l => /^(일시|날짜|시간|장소|회비|준비물|대상|참석|인원|내용|문의|복장|집합)\s*[:：]/.test(l)).length; return (b >= 2 && b >= ls.length - 3) || lab >= 2; }
function bulletBlock(input, base, ctx) {
  const ls = String(input || '').split(/\n+/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return null;
  const B = /^(?:[-*•·▪◦✓☐□]|\d{1,2}[.)]|\(\d{1,2}\)|[①-⑳])\s*(?=\S)/; const items = ls.filter(l => B.test(l)); if (items.length < 2 || items.length < ls.length - 3) return null;
  const first = ls.findIndex(l => B.test(l)); const head = first > 0 ? ls.slice(0, first).join(' ') : ''; const tail = ls.filter((l, i) => i > first && !B.test(l)).join(' ');
  if (/(회의록|회의\s*내용|미팅\s*내용)/.test(head)) return null;
  const dsrc = [tail, head].find(x => x && parseWhen(x, base).hits.length) || ''; const dw = dsrc ? parseWhen(dsrc, base) : null; const due = dsrc ? (isDeadline(dsrc) && deadlineDate(dsrc, base)) || dw.date || '' : '';
  const kind = /(살\s*것|구매|장보기|쇼핑|사야)/.test(head) ? 'buy' : 'task'; const who = findAssignee(head + ' ' + tail, ctx.people || []); const title0 = head.replace(/[:：]\s*$/, '').trim();
  return items.map(l => { const t = l.replace(B, '').trim(); return kind === 'buy'
    ? { kind, label: '살 것', confidence: 0.7, src: l, data: { title: t, url: '', price: parseMoney(t) || 0, qty: 1, need: 'must' } }
    : { kind, label: '할 일', confidence: 0.75, src: l, data: { title: t.slice(0, 80), who: who === '나' ? '' : who, due, time: '', priority: 'normal', project: projectOf(input, ctx), tags: [], ...(title0 ? { memo: title0.slice(0, 60) } : {}) } }; });
}
// 회의록 붙여넣기: 첫 줄에 '○○ 회의록'(쌍점 없어도 됨), 아래에 줄마다 한 가지
// "민서: 굿즈 후보 3개 다음주 금요일까지" → 민서 할 일, "다음 회의 12월 1일 오후 2시" → 일정, 나머지 줄은 결정사항
export function minutes(input, ctx = {}) {
  const ls = String(input || '').split(/\n+/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return null;
  const head = ls[0]; if (head.length > 40 || !/(회의록|회의\s*(내용|정리|메모|결과|요약)|미팅\s*(내용|정리|메모|결과|요약|노트))/.test(head)) return null;
  const base = ctx.base || new Date(); const people = ctx.people || []; const mine = [].concat(ctx.me || []).filter(Boolean);
  const title = head.replace(/[:：]\s*$/, '').replace(/^[#\[\]\s]+|[\]\s]+$/g, '').trim(); const hw = parseWhen(head, base);
  const project = projectGuess(head, ctx.projects || [], ctx.project || '').name || ctx.project || '';
  const B = /^(?:[-*•·▪◦✓☐□]|\d{1,2}[.)]|\(\d{1,2}\)|[①-⑳])\s*/; const MUST = /(해야|하기로|줘야|필요|부탁|까지|하기$|보내기|만들기|확인$|정리$|작성$|준비$|섭외$|발주$|예약$)/;
  const items = [], notes = [], att = new Set();
  for (const raw of ls.slice(1)) {
    let l = raw.replace(B, '').trim(); if (!l) continue; let who = null;
    const pm = l.match(/^([가-힣A-Za-z]{1,6}?)(?:님|씨)?\s*[:：]\s*(.+)$/);
    if (pm) { const n = pm[1]; const full = people.find(p => p === n || (p.length === 3 && p.slice(1) === n)); const isMe = /^(나|저|본인)$/.test(n) || mine.some(x => x === n || (x.length === 3 && x.slice(1) === n));
      if (isMe) { who = ''; att.add(mine[0] || '나'); l = pm[2]; } else if (full) { who = n; att.add(full); l = pm[2]; }
      else if (/^(참석자?|참여자?|참석\s*인원)$/.test(n)) { pm[2].split(/[,\s·]+/).filter(x => x.length >= 2).forEach(x => att.add(x)); continue; }
      else if (/^(결정|결론|결정\s*사항|메모|비고|공유|안건|논의|이슈)$/.test(n)) { notes.push(pm[2]); continue; } }
    let rs = interpret(who ? `${who} ${l}` : l, { ...ctx, project }).filter(r => r.kind !== 'talk' && r.kind !== 'query' && r.kind !== 'nav');
    if (who !== null && !rs.some(r => r.kind === 'task' || r.kind === 'event')) { const w = parseWhen(l, base); rs = [{ kind: 'task', label: '할 일', confidence: 0.75, data: { title: cleanTask(w.hits.reduce((x, hh) => x.replace(hh, ' '), l), who || '') || l, due: w.date || '', time: '', who, priority: 'normal', project, tags: [] } }]; }
    const keep = rs.filter(r => who !== null ? (r.kind === 'task' || r.kind === 'event') : ((r.kind === 'event' && r.data.date) || (r.kind === 'task' && (r.data.who || r.data.due || MUST.test(l)))));
    if (!keep.length) { notes.push(l); continue; }
    for (const r of keep) { const d = r.data; if (r.kind === 'task' && who !== null) d.who = who; if (!d.project && project) d.project = project;
      if (r.kind === 'event' && /^다음\s*(회의|미팅)$/.test(d.title || '')) d.title = `${project ? project + ' ' : ''}${d.title.replace(/^다음\s*/, '')}`;
      items.push({ ...r, src: raw }); }
  }
  if (!items.length && notes.length < 2) return null;
  return { title, project, date: hw.date && hw.hits.length ? hw.date : '', attendees: [...att], items, notes, body: ls.slice(1).join('\n') };
}
// "[공지] 11/27(금) 워크숍 / 시간: 10시 집합 / 장소: … / 회비: …" → 일정 하나
function noticeBlock(input, base, ctx) {
  const ls = String(input || '').split(/\n+/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return null;
  const L = /^(일시|날짜|시간|장소|회비|준비물|대상|참석|인원|내용|문의|복장|집합)\s*[:：]\s*(.+)$/; const labs = ls.map(l => l.match(L)).filter(Boolean); if (labs.length < 2) return null;
  const get = k => (labs.find(m => k.includes(m[1])) || [])[2] || ''; const headL = ls.find(l => !L.test(l)) || ''; const w = parseWhen([headL, get(['일시', '날짜']), get(['시간', '집합'])].join(' '), base); if (!w.date) return null;
  const title = headL.replace(/^\[[^\]]*\]\s*/, '').replace(/\(\s*[월화수목금토일]\s*\)/g, ' '); let tt = title; for (const hh of parseWhen(title, base).hits) tt = tt.replace(hh, ' ');
  return [{ kind: 'event', label: '일정', confidence: 0.8, src: input.trim(), data: { repeat: '', title: tt.replace(/\s+/g, ' ').trim() || '공지', date: w.date, start: w.time || '', end: w.end || '', place: get(['장소']).slice(0, 40), memo: ls.filter(l => l !== headL && !/^(일시|날짜|장소)\s*[:：]/.test(l)).join(' · ').slice(0, 300), scope: 'work', tags: [] } }];
}
// "오늘 컨셉 기획해서 다음주 월요일까지 촬영해야 해" → ["오늘 컨셉 기획하기", "다음주 월요일까지 촬영해야 해"]
// 이어 주는 말(해서·하고·한 뒤…) 앞뒤에 서로 다른 날짜가 있을 때만 나눈다.
const STEP_END = /^(.*?)(하고서?|해서|끝내고|마치고|만들고|보내고|받고|뽑고|짜고|잡고|찍고|쓰고|올리고|고르고|모으고|정리하고)$/;
export function splitSteps(text, base = new Date(), ctx = {}) {
  const toks = String(text).trim().split(/\s+/); if (toks.length < 4 || text.length > 160) return [text];
  for (let i = 0; i < toks.length - 2; i++) {
    let m = STEP_END.exec(toks[i]), skip = 0, stem = '', tail = '';
    if (m) { stem = m[1]; tail = m[2]; if (/^(나서|난)$/.test(toks[i + 1])) { skip = 1; if (/^(뒤|후|다음)에?$/.test(toks[i + 2] || '')) skip = 2; } }
    else if (/한$/.test(toks[i]) && /^(뒤|후|다음)에?$/.test(toks[i + 1])) { stem = toks[i].slice(0, -1); tail = '한'; skip = 1; }
    else if (/^[가-힣]{2,}고$/.test(toks[i]) && !/^(광고|보고|창고|재고|경고|참고|사고|원고|공고|그리고|최고|예고|권고|신고|충고|보고서|출고|입고|퇴고|숙고|중고|여고|남고)$/.test(toks[i])) { stem = toks[i].slice(0, -1); tail = '고'; }
    else continue;
    if ((ctx.people || []).some(n => n && (n === stem || n.slice(1) === stem || n === stem.replace(/이$/, '') || n.slice(1) === stem.replace(/이$/, '')))) continue; // "민서하고 회의"의 하고는 '와'
    const noun = /^(하고서?|해서|한|정리하고)$/.test(tail) ? (tail === '정리하고' ? stem + '정리하기' : stem.length >= 2 ? stem + '하기' : stem + '하기') : stem + tail.replace(/고$/, '기');
    if (!stem && !/^(끝내고|마치고|만들고|보내고|받고|뽑고|짜고|잡고|찍고|쓰고|올리고|고르고|모으고|정리하고)$/.test(tail)) continue; // 그냥 "하고"만 있으면 앞말이 없음
    const left = [...toks.slice(0, i), noun].join(' '), right = toks.slice(i + 1 + skip).join(' ');
    const wl = parseWhen(left, base), wr = parseWhen(right, base);
    if (wl.date && wr.date && wl.hits.length && wr.hits.length && left.replace(/\s/g, '').length >= 5) return [left, ...splitSteps(right, base, ctx)];
  }
  return [text];
}
// "오늘 회의에서 다음주 월요일까지 내기로 함"처럼 날짜가 둘이면 '까지'가 붙은 쪽이 마감
export function deadlineDate(text, base = new Date()) {
  const toks = String(text).trim().split(/\s+/); let found = '';
  toks.forEach((tk, i) => {
    const m = tk.match(/^(.+?)까지/); if (!m) { if (tk !== '까지') return; }
    const a = m ? m[1] : toks[i - 1] || '', off = m ? 0 : 1, b = toks[i - 1 - off] || '', c = toks[i - 2 - off] || '';
    let seg = /^(다음|이번|다다음|지난)$/.test(c) && /^(주|달)$/.test(b) ? `${c} ${b} ${a}` : /^(다음\s*주|이번\s*주|다다음\s*주|담주|금주|다음\s*달|이번\s*달|\d{1,2}월|다음|이번)$/.test(b) ? `${b} ${a}` : a;
    let pw = parseWhen(seg, base);
    if (pw.hits.length && pw.hits.every(isTimeHit)) { const back = []; for (let k = i - (m ? 1 : 2); k >= 0 && back.length < 4; k--) { if (/^(다음|이번|다다음|주|달|오전|오후|아침|저녁|밤|점심|낮|새벽)$/.test(toks[k]) || parseWhen(toks[k], base).hits.length) back.unshift(toks[k]); else break; } seg = [...back, a].join(' '); pw = parseWhen(seg, base); if (pw.hits.every(isTimeHit)) return; }
    const d = pw.date; if (d) found = d;
  });
  return found;
}
// 빠른 입력 칸처럼 '적어 두려고' 쓴 말은 신호가 없어도 할 일로 받음
export function interpretCapture(input, ctx = {}) { return interpret(input, ctx).flatMap(p => p.kind === 'talk' ? interpret('할일: ' + (p.src || input), ctx).map(r => ({ ...r, src: p.src })) : [p]); }
function splitCommands(input) {
  const lines = input.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(l => l.length < 160)) return lines;
  if (input.length > 220) return [input]; // 긴 글은 하나의 기록으로
  return input.split(/\s*(?:그리고|,\s*그리고|;\s*|\s+또\s+|\s+그 다음에\s+)\s*/).filter(s => s.trim().length > 1);
}
// 업체: "레드프린팅 인쇄 업체 02-123-4567 A3 포스터 100장 45000원" → 이름·분야·전화·링크·품목별 가격
const VCAT = [['인쇄', /인쇄|프린팅|출력|명함|포스터|리플렛|전단|책자/], ['굿즈 제작', /굿즈|키링|아크릴|스티커|뱃지|에코백|머그|티셔츠/], ['현수막·실사', /현수막|배너|실사/], ['촬영·스튜디오', /촬영|스튜디오|사진관/], ['대관·장소', /대관|공간\s*대여|장소\s*대여/], ['영상·편집', /영상|편집/], ['포장·배송', /포장|택배|퀵|박스/], ['케이터링', /케이터링|다과|도시락/]];
const VWORD = /(업체|거래처|인쇄소|제작소|공방|견적)/;
const VSKIP = /^(업체|거래처|견적|추가|등록|새|새로|저장|정리|목록|리스트|:|：)$/;
const bareUrl = t => (t.match(/https?:\/\/[^\s<>"']+/) || t.match(/(?:www\.)?[a-z0-9][a-z0-9-]*\.(?:co\.kr|com|kr|net|shop|store|io)(?:\/[^\s]*)?/i) || [''])[0];
export function vendorParts(t, known = []) {
  const phone = parsePhone(t) || (t.match(/\b1[5-9]\d{2}[-\s]?\d{4}\b/) || [''])[0]; const link = bareUrl(t);
  let rest = t.replace(/^(업체|거래처)\s*[:：]\s*/, ''); if (phone) rest = rest.replace(phone, ' '); if (link) rest = rest.replace(link, ' ');
  rest = rest.replace(/(\d{2,4})[-\s]?(\d{3,4})[-\s]?(\d{4})/g, m => (phone && m.replace(/\D/g, '') === String(phone).replace(/\D/g, '') ? ' ' : m));
  const kakao = (rest.match(/(?:카톡|카카오톡|담당자?)\s*[:：]?\s*([가-힣A-Za-z0-9_]{2,12}(?:\s?(?:대리|과장|팀장|실장|사장|대표)님?)?)/) || [])[1] || '';
  if (kakao) rest = rest.replace(/(?:카톡|카카오톡|담당자?)\s*[:：]?\s*[가-힣A-Za-z0-9_]{2,12}(?:\s?(?:대리|과장|팀장|실장|사장|대표)님?)?/, ' ');
  const hit = known.filter(Boolean).sort((a, b) => b.length - a.length).find(n => t.replace(/\s/g, '').includes(n.replace(/\s/g, '')));
  const toks = rest.split(/[\s,·/]+/).filter(Boolean);
  let name = hit || toks.find(x => !VSKIP.test(x) && !/^\d/.test(x) && !VCAT.some(([c, re]) => x === c || (re.test(x) && x.length <= 3))) || '';
  { const after = rest.match(/^\s*([가-힣A-Za-z·]{2,8})\s*(?:업체|거래처)(?:는|은)?\s+([가-힣A-Za-z0-9]{2,})/); if (!hit && after && !VSKIP.test(after[2]) && !/^(견적|가격|단가|연락|전화|번호)/.test(after[2])) name = after[2]; }
  name = name.replace(/(은|는|이|가|에서|에|한테|의)$/, m => (name.length - m.length >= 2 ? '' : m));
  const explicit = (rest.match(/([가-힣·]+)\s*(?:업체|거래처)/) || [])[1] || '';
  const cat = (VCAT.find(([c, re]) => re.test(explicit)) || (hit ? [''] : null) || VCAT.find(([c, re]) => re.test(name)) || VCAT.find(([c, re]) => re.test(rest)) || ['기타'])[0];
  // 품목 + 가격 쌍
  const prices = []; let body = rest; if (name) body = body.replace(name, ' '); body = body.replace(/^.*?(업체|거래처|견적)(는|은|가|이)?\s*/, ' ').replace(/(추가|등록|저장)(해\s*줘|해줘|해|요)?\s*$/, ' ');
  const re = /(\d[\d,]*(?:\.\d+)?\s*만\s*(?:\d+\s*천)?\s*원?|\d[\d,]*\s*천\s*원|\d[\d,]{2,}\s*원?)(?!\s*(장|개|매|부|권|세트|박스|ea|mm|cm|g|ml))/gi;
  let last = 0, m; const today = new Date().toISOString().slice(0, 10); let memoBits = [];
  while ((m = re.exec(body))) { let item = body.slice(last, m.index).replace(/[,·:：/]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^((추가|등록|저장|견적|그리고|또)\s+)+/, '').replace(/\s*(은|는|이|가|에|으로|로)$/, ''); const price = parseMoney(m[0].includes('원') ? m[0] : m[0] + '원');
    const after = (body.slice(re.lastIndex).match(/^\s*\(([^)]{1,30})\)/) || [])[1] || ''; if (after) re.lastIndex += body.slice(re.lastIndex).indexOf(')') + 1;
    if (item.length >= 2 && price) prices.push({ item: item.slice(0, 40), price: String(price), note: after, at: today }); else if (item) memoBits.push(item); last = re.lastIndex; }
  const tail = body.slice(last).replace(/^\s*(으로|로)?\s*(올랐|내렸|바뀌|바꼈|변경|인상|인하)\S*/, ' ').replace(/\s+/g, ' ').trim().replace(/^[,·]+|[,·]+$/g, '');
  const memo = [...(prices.length ? [] : memoBits), tail].filter(x => x && x.length > 1 && !VSKIP.test(x) && !VCAT.some(([c]) => x === c)).join(' ').slice(0, 120);
  return { name, cat, phone: phone || '', kakao, link, memo, prices };
}
function interpretOne(s, base, ctx) {
  const t = s.trim();
  const w = parseWhen(t, base);
  const money = parseMoney(t);
  const phone = parsePhone(t);
  const email = parseEmail(t);
  const urls = parseUrls(t);
  const tags = parseTags(t);
  const forced = (learned.kind || {});
  // 종류를 고쳐 준 적이 있는 낱말이면 그 종류로. 단, 시간·금액·전화번호처럼 분명한 신호가 있으면 그쪽이 우선이고, 사람 이름으로는 배우지 않음
  const strong = (w.time && !isDeadline(t)) || (money != null && /(원|결제|샀|구매|썼|지출|냈)/.test(t)) || phone || email;
  if (!strong) for (const [k, v] of Object.entries(forced)) if (t.includes(k) && !new RegExp(`(${KIN}|${FAMILY})$`).test(k) && !(ctx.people || []).some(n => n && (n === k || n.slice(1) === k))) return [build(v)];

  // 명시 접두어: "일정:", "할일:", "지출:" ...
  if (/^(업체|거래처)\s*[:：]/.test(t)) return [build('vendor')];
  if (/^(구매|살\s*것|장바구니)\s*[:：]/.test(t)) return [build('buy', t.replace(/^[^:：]+[:：]\s*/, ''))];
  const pre = t.match(/^(일정|약속|회의|미팅|할\s*일|할일|투두|todo|지출|비용|결제|연락처|번호|메모|노트|아이디어|레퍼런스|참고|sns|콘텐츠|기록|목표|okr|지원사업|공모)\s*[:：]\s*/i);
  if (pre) {
    const k = { 일정: 'event', 약속: 'event', 회의: 'event', 미팅: 'event', 할일: 'task', '할 일': 'task', 투두: 'task', todo: 'task', 지출: 'expense', 비용: 'expense', 결제: 'expense', 연락처: 'contact', 번호: 'contact', 메모: 'note', 노트: 'note', 기록: 'note', 아이디어: 'idea', 레퍼런스: 'reference', 참고: 'reference', sns: 'sns', 콘텐츠: 'sns', 목표: 'okr', okr: 'okr', 지원사업: 'grant', 공모: 'grant' }[pre[1].toLowerCase().replace(/\s/g, '') === '할일' ? '할일' : pre[1].toLowerCase()] || 'note';
    return [build(k, t.slice(pre[0].length))];
  }

  // 질문/조회: 물음표, 묻는 말(뭐·누가·언제·몇·얼마…)로 끝나는 말, 낱말 몇 개짜리 물음
  const isQ = (() => {
    if (phone || email || urls.length) return false;
    if (HELPQ.test(t)) return false;
    if (/\?\s*$/.test(t)) return true;
    if (/(얼마나?\s*(썼|나갔|들었|남았|받았|벌었)|누가\s*(제일|가장)|뭐가\s*(제일|가장)|어디가\s*(제일|가장))/.test(t)) return true;
    if (/(얼마|몇\s*(개|명|건|번|시|층|일|분))/.test(t) && /(썼|남았|남아|남지|남나|남는지|들었|나갔|야|지|죠|예요|에요|였지|였죠|더라|인지|돼|됐)(어|어요|나|니)?\s*$/.test(t)) return true;
    if (/프로젝트\s*별|(어디까지|얼마나)\s*(됐|했|진행|왔|남)/.test(t) && money == null && !/(해야|하기|까지\s*$)/.test(t)) return true;
    if (money != null) return false;
    const QW = /(언제|어디|누구|누가|뭐|뭘|무슨|몇|얼마|어느|어떻게|어땠|어때)/;
    if (QW.test(t) && !/(뭐\s*좀|뭔가|어떻게든|어디든|언제든|누구든|뭐든|아무)/.test(t)) {
      const oblig = /(야\s*(해|돼|함|됨)|해야|기로\s*함?)\s*$/.test(t);
      if (oblig) return /(뭐|뭘|뭐부터|뭘\s*먼저)\s*\S*\s*(해야|야\s*(해|돼))/.test(t) && !/(누구한테|어디에|어디서|언제까지)\s/.test(t);
      if (/(지|죠|어|해|야|니|냐|나|까|돼|와|래|더라|인지|요)\s*$/.test(t) && !/(해야지|하기|하자|줘|주세요|확인|물어보기|조사|알아보기|정하기)\s*$/.test(t)) return true;
      if (/(알려|보여|찾아|말해|정리해|요약해|비교해)\s*(줘|주세요|줄래)\s*$/.test(t)) return true;
    }
    if (/(보여\s*줘|알려\s*줘|찾아\s*줘|찾아\s*봐|검색|비교해\s*줘|정리해\s*줘|요약해\s*줘|뭐였지|있었나|있나)\s*$/.test(t)) return true;
    if (t.length <= 40 && /(찾아\s*줘|보여\s*줘|알려\s*줘)/.test(t) && !/(라고|하라고|한테|에게)\s*(알려|전해)/.test(t)) return true;
    if (t.length <= 16 && /(번호|연락처|전화번호|가격|단가)$/.test(t)) return true;
    if (t.length <= 30 && !w.time) {
      if (/^(주간|이번\s*주|금주|지난\s*주)\s*(점검|보고|리포트|결산|회고)(\s*(해\s*줘|보여\s*줘|뽑아\s*줘))?$/.test(t)) return true;
      const m = t.match(/^(.*?)\s*(할\s*일|할일|마감|일정|스케줄|지출|지출\s*내역|진행\s*상황|진행상황|진행\s*현황|현황|회의\s*내용|휴가자?|빈\s*시간|작업\s*시간|대기함|확인할\s*것)\s*(은|는|좀)?$/);
      if (m) { const rest = m[1].trim().split(/\s+/).filter(Boolean); const bare = x => x.replace(/(이|의|님)$/, '');
        const okW = x => /^(오늘|내일|모레|어제|이번|다음|지난|주|달|이번주|다음주|지난주|이번달|금주|담주|팀|팀원|개인|내|우리|전체|남은|밀린|끝난|나|저|프로젝트|프로젝트별)$/.test(x) || known(bare(x), ctx) || isName(bare(x));
        if (rest.length <= 4 && (rest.every(okW) || (rest.length && (g => !!(g.name || g.many))(projectGuess(m[1], ctx.projects || [])) && !w.date))) return true; }
    }
    return false;
  })();
  if (HELPQ.test(t) && !phone && !urls.length && money == null) return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.6 }];
  if (isQ) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];
  // 이동
  const nav = t.match(/^(캘린더|일정|할\s*일|회의|회의록|기획|기획\s*보드|인맥|연락처|비용|지출|스타트업|SNS|스튜디오|피그마|설정|자가\s*점검|팀|확인\s*대기함|대기함)\s*(열어|가자|으로|로|화면)?\s*(줘)?$/i);
  if (nav) return [{ kind: 'nav', data: { to: nav[1] }, label: '이동', confidence: 0.9 }];

  const gk = guessKind();
  if (gk === 'talk') return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.5 }];
  const made = build(gk);
  // 날짜·시간을 빼고 나니 남는 말이 없으면("금요일로 하자", "오늘 다 했어") 만들지 않고 대화로 받음
  if ((made.kind === 'task' || made.kind === 'event') && /^(으로|로)?\s*(다|전부|모두)?\s*(하자|하기|해|함|했어|했다|했음|할게|하다|되기|끝|끝내기|일정)?$/.test((made.data.title || '').trim())) return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.5 }];
  return [made];

  function guessKind() {
    const vknown = (ctx.vendors || []).some(n => n && n.length >= 2 && t.replace(/\s/g, '').includes(n.replace(/\s/g, '')));
    const vsig = phone || urls.length || bareUrl(t) || money != null || /\b1[5-9]\d{2}[-\s]?\d{4}\b/.test(t);
    const dl = isDeadline(t), biz = BIZ.test(t);
    const OBLIG = /(해야|야\s*(함|해|돼|됨|한다|겠|지)|하기로|줘야|필요|부탁)/;
    // 일정 낱말로 세면 안 되는 것: 회의록·발표 자료 같은 '물건', 때를 가리키는 저녁·점심
    const T = t.replace(/(회의록|회의\s*자료|회의\s*준비|미팅\s*자료|미팅\s*준비|발표\s*자료|발표\s*준비|촬영\s*콘티|촬영본|촬영분|행사\s*준비|전시\s*준비|촬영\s*준비|촬영\s*허가|촬영\s*소품|촬영\s*장비|촬영\s*순서)/g, '□').replace(/(오늘|내일|모레|요일|욜)\s*(저녁|점심|아침)(에)?(?=\s|$)/g, '$1');
    if (/(뵙겠습니다|수고하셨습니다|고생하셨습니다|수고했어요?|고생했어요?|감사합니다|고마워요?|들어가세요)\s*[.!~ㅎㅋ^]*$/.test(t) && money == null && !dl) return 'talk';
    const tail = (w.hits || []).reduce((x, hh) => x.replace(hh, ' '), t).replace(/(오전|오후|아침|저녁|밤|점심)(에)?\s*$/, '').replace(/\s+/g, ' ').trim(); // 날짜·시간 말을 뺀 나머지
    const doit = ACTION.test(t) || TASKEND.test(tail);
    if (NOTELABEL.test(t) || /(저장해\s*놔|적어\s*놔|기억해\s*(둬|놔|줘)|메모해)/.test(t)) return 'note';
    if (/^.{0,14}(피드백|회고|후기|조건|원칙|규칙|결론|결정\s*사항)\s*[:：]/.test(t)) return 'note'; // "수정 3차 피드백: …", "회고: …"
    if (/(익월|익일\s*지급|지급\s*조건|결제\s*조건|정산\s*조건)/.test(t) && !/(해야|보내|요청)/.test(t)) return 'note'; // 거래 조건
    if (/(으면|면)\s/.test(t) && /(하기로|청구하기로|받기로)\s*(함|했\S*)?\s*$/.test(t) && !w.date) return 'note'; // "~하면 ~하기로 함"은 약속한 규칙
    if (/(선금|계약금|잔금|중도금|대금|시공비|인건비|외주비|대관료)\s*[\d,.]+\s*(만|천|억)?\s*원?\s*(을|를)?\s*(보냄|보냈\S*|송금\S*|이체\S*|지급함|지급했\S*|입금함|입금했\S*)\s*$/.test(t)) return 'expense';
    if (/\d{3,}\s*[xX×*]\s*\d{3,}/.test(t) && /(발주|주문|인쇄|출력|제작)/.test(t) && OBLIG.test(t)) return 'task'; // 치수는 금액이 아님
    if (METRIC.test(t) && /\d/.test(t) && !dl && !OBLIG.test(t)) return 'note';
    const sentQuote = /(견적|제안)/.test(t) && /(보냄|보냈|보내드|발송|제출함|제출했)/.test(t);
    if (!sentQuote && (((/(업체|거래처|인쇄소|제작소|공방)/.test(t) || (/견적/.test(t) && (biz || vknown || phone || urls.length))) && (vsig || /(추가|등록|저장|정리)/.test(t)) && !/(받기|받아|요청|보내|문의하|연락하|알아보)/.test(t)) || (vknown && vsig && !/(결제|샀|구매했|썼|냈|입금)/.test(t)))) return 'vendor';
    if (urls.length && /(사야|살\s*거|살\s*것|구매\s*(목록|예정|할)|장바구니|주문해야|사자|사 ?줘)/.test(t)) return 'buy';
    if ((/(사야|살\s*거|살\s*것|구매해야|사\s*와야|사\s*놔야|사\s*둬야)/.test(t) || /[가-힣]\s*(에서|서)\s*사기\s*$/.test(t)) && !w.date && !dl) return 'buy';
    if (phone || email) { if (money != null || RATE.test(t) || vknown) return 'vendor'; if ((dl || OBLIG.test(t)) && ACTION.test(t.replace(/담당|까지/g, ''))) return 'task'; return 'contact'; }
    if (money != null) {
      const out = /(외주비|외주|페이|인건비|알바|사례비|대관|렌탈|대여|모델료|출연료|수수료|월세|구독|광고비|원천세|급여|월급)/.test(t);
      if ((dl || OBLIG.test(t) || /(요청|하기|할\s*것)\s*$/.test(t)) && /(입금|발행|정산|지급|송금|보내|이체|결제|납부|청구)/.test(t) && !/(입금\s*(됨|됐|완료|확인)|받음|받았)/.test(t)) return 'task';
      if (INCOME.test(t) && !out) return 'income';
      if (sentQuote) return 'note';
      if (/예산/.test(t) && !SPENT.test(t)) return 'note';
      if (SPENT.test(t) || (out && /(입금|보냄|보냈|지급)/.test(t))) return 'expense';
      if (RATE.test(t) || vknown || biz) return vknown || biz || /(업체|거래처)/.test(t) || urls.length ? 'vendor' : 'note';
      if (/(원|만|천|억|₩)/.test(t)) return 'expense';
    }
    if (money == null && bareAmount(t) != null && (SPENT.test(t) || guessCategory(t) !== '기타') && !w.time && !dl) return 'expense';
    if (/\$\s*\d/.test(t) && /(구매|구독|결제|갱신|샀|플러그인|라이선스)/.test(t)) return 'expense';
    if (urls.length && RATE.test(t)) return 'vendor';
    if (urls.length && /(레퍼런스|참고|ref|무드|영감|예시|느낌)/i.test(t)) return 'reference';
    if (urls.length) return 'reference';
    if (/(OKR|KR\b|핵심\s*결과)/i.test(t) || (/목표/.test(t) && /(분기|올해|이번\s*(달|분기)|달성|세우|잡)/.test(t) && !/(현재|지금)/.test(t))) return 'okr';
    if (/목표/.test(t) && /\d/.test(t) && !dl) return 'note';
    if (w.time && w.end && /(했음|했다|했어|했고|함$|작업함|편집함|완료)\s*$/.test(t)) return 'timelog';
    if ((w.date || w.time) && LEAVE.test(t) && !ACTION.test(t.replace(/까지/g, ''))) return 'event';
    if (/(된대|안\s*된대|가능하대|만\s*가능|가능함|불가능)\s*$/.test(t) && !OBLIG.test(t)) return 'note';
    if (w.endDate && !OBLIG.test(t)) return 'event';
    if (/(매일|날마다|매주|격주|매달|매월|평일마다)/.test(t) && !dl && (w.time || /(매달|매월)\s*\d{1,2}\s*일/.test(t)) && money == null) return 'event';
    if (w.time && /(설명회|간담회|세미나|미팅|회의|상담|행사|교육|워크숍|발표|면접|방문|관람)/.test(T)) return 'event';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) && dl && ACTION.test(t.replace(/까지|마감/g, ''))) return 'task';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) || (/(IR|투자\s*유치|데모데이)/.test(t) && !ACTION.test(t))) return 'grant';
    const upload = /(릴스|쇼츠|틱톡|유튜브|인스타|브이로그|썸네일|게시물|피드|스토리|카드뉴스|라이브|라방)/.test(t) && /(업로드|예약|게시|공개|올리|라이브|라방)/.test(t);
    if (upload && w.time && !dl) return 'event'; // 올리는 시각이 정해진 건 캘린더에 보여야 함
    if (upload && w.date && !dl && /(올리기|올려야|업로드해야|예약)/.test(t)) return 'task';
    if (/(릴스|쇼츠|틱톡|유튜브|인스타|브이로그|썸네일|업로드|게시물|피드)/.test(t) && /(올리|찍|만들|편집|콘텐츠|아이디어|기획|업로드|예고|게시)/.test(t) && !dl) return 'sns';
    if ((/\d+(\.\d+)?\s*(시간|분)/.test(t) && /(했음|했다|했어|했고|함$|완료|끝냄|작업|공부|집중|걸림|걸렸)/.test(t) && !w.time) || /작업\s*(했|함|기록)/.test(t)) return 'timelog';
    // 한 일을 알리는 말은 새 할 일이 아님
    if (/(처리함|처리했\S*|보냈어요?|보냈음|보냈습니다|끝냄|끝냈\S*|완료함|완료했\S*|올랐음|나옴|나왔\S*|왔음|떨어짐$)/.test(t) && !dl && !OBLIG.test(t) && !w.date && !/(떨어짐|떨어졌)/.test(t)) return /\d/.test(t) ? 'note' : 'talk';
    if ((w.time || /(오전|오후|아침|저녁|점심)(에)?(\s|$)/.test(t)) && w.date && !dl && /(보고|리뷰|시사|피칭|PT|피티|리허설|답사|로케|집합|콜\s*타임|슛|픽업|반납|녹음|합주|회식|컨펌\s*콜|킥오프|브리핑|워크숍|오티|OT)/.test(T) && !OBLIG.test(t)) return 'event';
    if ((w.time || w.date) && /(회의|미팅|약속|만나|만남|수업|면접|발표|전시|촬영|병원|저녁|점심|콜|통화|줌|zoom|meet|일정|스케줄|행사|세미나|오픈(?!채팅|톡|카톡|소스)|마감식|파티|회식|생일|생신|결혼식|송년회|신년회|기념일|돌잔치|제사|엠티|런칭|론칭|페스티벌|여행|공연|콘서트|(?<!업)데이트|식사|모임|스터디|레슨|강의|워크숍|휴가|설명회|간담회|관람|방문|상담|진료|치과|인터뷰|구경|팝업|나들이|답사|견학|투어|페어|박람회)/i.test(T) && !(dl && ACTION.test(t)) && !(OBLIG.test(t) && !w.time && /(짜|준비|섭외|확정|정리|예약)/.test(t))) return 'event';
    if (w.time && w.end && !dl) return 'event';
    if (w.time && !doit) return 'event';
    if (/(오전|오후|아침|저녁|밤)(에)?(\s|$)/.test(t) && w.date && !doit && !dl) return 'event';
    if (/(회의|미팅|약속|만나|수업|면접|발표|행사|세미나|전시)/.test(T) && w.date && !(dl && /(기로|해야|야\s*(함|해|돼|됨|한다|겠)|제출|보내|넘기|넘겨|내야|내기|공유|정리|작성)/.test(t))) return 'event';
    if (dl && w.date && !/(어떨까|하면\s*좋|해볼까)/.test(t)) return 'task';
    if (dl && /(해야|야\s*(함|해|돼|됨|한다|겠)|하기로|제출|끝내|완료|마쳐|넘겨|보내)/.test(t)) return 'task';
    if (/(미룸|미뤄짐|밀림|바뀜|변경됨|취소됨|확정됨|정해짐|결정됨|하기로\s*했음)\s*$/.test(t) && !OBLIG.test(t)) return 'note';
    if (IDEA.test(t) || /(떠올|생각났|영감|후보(는|가|로)?\s|후보\s*[:：]|후보$)/.test(t)) return 'idea';
    if (/(달라고\s*(함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심|해\s*달라는|떨어짐|떨어졌|다\s*씀|다\s*썼|고장|망가졌|안\s*됨$|안\s*나옴$)/.test(t)) return 'task';
    if (ACTION.test(t) || w.date || TASKEND.test(t)) return 'task';
    if (OBLIG.test(t)) return 'task';
    if (t.length > 120) return 'note';
    // 사실을 적은 말(숫자 여럿, "항목: 내용", 쉼표로 늘어놓은 것)은 묻지 않고 메모로
    if ((/[:：]/.test(t) && t.length >= 8) || (t.match(/\d+/g) || []).length >= 2 || (/,\s/.test(t) && t.split(/\s+/).length >= 4) || /\d\s*%/.test(t)) return 'note';
    return 'talk'; // 분명한 신호가 없으면 만들지 않고 대화로 받음
  }

  function build(kind, body = t) {
    const bw = body === t ? w : parseWhen(body, base);
    const cleanTitle = strip(body, bw.hits);
    switch (kind) {
      case 'event': { const rep = /매일|날마다/.test(body) ? 'daily' : /평일마다|매\s*평일|평일\s*매일/.test(body) ? 'weekdays' : /격주|2주마다|이주마다|2주에\s*한\s*번/.test(body) ? 'biweekly' : /매주|주마다/.test(body) ? 'weekly' : /매달|매월|달마다/.test(body) ? 'monthly' : ''; const r0 = { kind, label: rep ? '반복 일정' : '일정', confidence: bw.time ? 0.9 : 0.7, data: { repeat: rep, title: cleanTitle.replace(/(매일|날마다|평일마다|매\s*평일|격주|2주마다|이주마다|2주에\s*한\s*번|매주|주마다|매달|매월|달마다)\s*/g, '').trim() || '일정', date: bw.date || ymd(base), start: bw.time || '', end: bw.end || '', place: '', tags } }; const ev = r0.data; if (bw.endDate) ev.endDate = bw.endDate; ev.title = ev.title.replace(/^(이틀|사흘|나흘|\d+박\s*\d+일|\d+일간)\s*/, '').trim() || ev.title;
        { const AB = /(못\s*(?:온|와|옴|간|감|나온|나와)\S*|불참|빠진대|빠질\S*|안\s*온대)/; const am = ev.title.match(AB); if (am) { const ws0 = ev.title.slice(0, am.index).trim().split(/\s+/).filter(Boolean); const bareN = x => x.replace(/(이가|이는|이|가|는|은|님)$/, ''); const isP = x => (ctx.people || []).some(n => n === x || n.slice(1) === x) || isName(x); let k = ws0.length - 1; while (k >= 0 && !isP(bareN(ws0[k]))) k--; if (k < 0 && ws0.length) k = ws0.findIndex(x => /^[가-힣]{2,4}$/.test(bareN(x)) && !/(회의|미팅|촬영|회식|모임|행사)$/.test(x)); if (k >= 0) { const nm0 = bareN(ws0[k]); const nm = (ctx.people || []).find(n => n === nm0 || n.slice(1) === nm0) || nm0; const others = ws0.filter((_, q) => q !== k).join(' '); ev.title = `${nm.length > 2 && /^[가-힣]{3}$/.test(nm) && (ctx.people || []).includes(nm) ? nm.slice(1) : nm} ${others ? others + ' ' : ''}불참`.replace(/\s+/g, ' '); ev.who = nm; ev._allday = !ev.start; } } }
        { const lv = ev.title.match(/^(\S{2,4}?)(?:이가|이는|이|가|는|은|님)?\s+(?:.*\s)?(휴무|반차|연차|월차|휴가|출장|외근|재택|병가|조퇴|지각|결근)/); if (lv && !ev.who) { const nm = (ctx.people || []).find(n => n === lv[1] || n.slice(1) === lv[1]) || (isName(lv[1]) ? lv[1] : ''); if (nm) ev.who = nm; } }
        if (/(휴무|반차|연차|월차|휴가|출장|외근|재택|휴일|병가|결근)/.test(ev.title) && !ev.start) ev._allday = true;
        const pp = ev.who && /불참$/.test(ev.title) ? null : eventParts(ev.title, ctx.people || []); if (pp) { ev.title = String(pp.title || '').replace(/^(에서|에|이랑|랑|하고|와|과)\s+/, '').trim() || pp.title; if (pp.who) ev.who = pp.who; if (pp.place) ev.place = pp.place; if (pp.area) ev.area = pp.area; } if (!ev.place && !ev.area) ev.place = placeOf(body); ev.scope = guessScope(body, { who: ev.who || '', team: ctx.people || [] }); return r0; }
      case 'task': { let who0 = findAssignee(body, ctx.people || []); let ct = cleanTitle.replace(/\s+(오전|오후|아침|저녁|밤)(에|까지|중)?$/, '').replace(/(^|\s)(급함|급해|급한\s*건데|asap|ASAP)[,:：!\s]*/g, ' ').replace(/\s*마감(임|이야|입니다)?\s*$/, '').trim(); let memo = '';
        // "서연이한테 영상 편집 맡기기" → 담당 서연, 할 일 영상 편집
        { const hm = ct.match(/^(\S{1,6}?)(?:이)?(?:한테|에게|께)\s+(.+?)\s*(?:맡기기|맡기|맡김|맡겨|시키기|시키)\S*$/); if (hm) { const nm = (ctx.people || []).find(n => n === hm[1] || n.slice(1) === hm[1]); if (nm || /^[가-힣]{2,3}$/.test(hm[1])) { who0 = nm || hm[1]; ct = hm[2]; } } }
        // "클라이언트가 로고 색 바꿔달라고 함" → 로고 색 바꿔 주기 (클라이언트 요청)
        { const rm = ct.match(/^(?:(\S{1,8}?)(?:이|가|께서|님이)\s+)?(.+?)\s*(?:달라고\s*(?:함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심)$/); if (rm) { ct = rm[2].replace(/\s*(해|줘)$/, m0 => m0) + ' 주기'; ct = ct.replace(/해\s*주기$/, '해 주기').replace(/\s+/g, ' '); if (rm[1] && !(ctx.people || []).some(n => n === rm[1] || n.slice(1) === rm[1])) memo = rm[1] + ' 요청'; if (rm[1] && who0 === rm[1]) who0 = ''; } }
        const who = who0 === '나' ? '' : who0; return { kind, label: '할 일', confidence: 0.75, data: { who, ...(memo ? { memo } : {}), title: (/주기$/.test(ct) && memo ? ct : cleanTask(ct, who)) || ct || body, due: (() => { const dl = isDeadline(body) ? deadlineDate(body, base) : ''; return dl && !(bw.date && new Date(dl).getDay() === new Date(bw.date).getDay()) ? dl : (bw.date || dl || ''); })(), time: isDeadline(body) && !/(\d\s*시|\d:\d\d)\s*(반\s*)?(까지|전까지)/.test(body) && !/마감/.test(body) ? '' : (bw.time || ''), priority: /(급|급함|asap|ASAP|중요|빨리|꼭|반드시|!!)/.test(body) ? 'high' : 'normal', project: projectOf(body, ctx), tags } }; }
      case 'expense': { const X = moneyParts(body, bw); return { kind, label: '지출', confidence: X.amount ? 0.85 : 0.6, data: { title: X.title.replace(/\s*(내가|제가|우리가)?\s*(결제|샀다|샀어|샀음|삼|썼다|썼어|썼음|씀|지출|냈다|냈어|냈음|냄|했다|입금함|입금했어|입금|결제함|결제했어|긁음|긁었어|송금함|송금했어|보냄|보냈어)\s*$/, '').trim() || '지출', amount: X.amount, date: bw.date || ymd(base), category: guessCategory(body), project: projectOf(body, ctx), pay: /(법인|회사|팀)\s*카드|법카/.test(body) ? '법인카드' : /현금/.test(body) ? '현금' : /(계좌\s*이체|이체|송금|입금)/.test(body) ? '계좌이체' : '개인카드', ...(X.memo ? { memo: X.memo } : {}) } }; }
      case 'income': { const X = moneyParts(body, bw); const got = /(입금\s*(됨|됐|받|확인|완료)|들어옴|들어왔|받음|받았|수금\s*(함|완료))/.test(body) && !/(안\s*들어|아직|예정|받기로|받을)/.test(body);
        const from = (ctx.vendors || []).find(n => n && body.includes(n)) || (X.title.match(/^([가-힣A-Za-z0-9]{2,12}?)(?:에서|한테서|에게서|한테|이|가)?\s+(?:.*\s)?(?:계약금|선금|착수금|잔금|중도금|미수금|매출|대금|제작비|입금)/) || [])[1] || '';
        return { kind, label: got ? '받은 돈' : '받을 돈', confidence: X.amount ? 0.8 : 0.6, data: { title: X.title.replace(/\s*(입금\s*(됨|됐어요?|됐음|받음|받았어요?|예정|확인|완료)|들어옴|들어왔어요?|받기로\s*(함|했어요?|했음)?|받음|받았어요?|받을\s*(돈|거|예정)|안\s*들어왔?\S*|아직)\s*$/, '').replace(/\s+/g, ' ').trim() || '받을 돈', amount: X.amount, date: bw.date || (got ? ymd(base) : ''), from, project: projectOf(body, ctx), status: got ? 'got' : 'due', ...(X.memo ? { memo: X.memo } : {}) } }; }
      case 'contact': { const ph = parsePhone(body), em = parseEmail(body); const raw = body.replace(ph ? /(01[016789]|02|0[3-6]\d)[\s.-]?\d{3,4}[\s.-]?\d{4}/ : /$^/, ' ').replace(em || /$^/, ' ').replace(/(명함\s*(받음|받았어|받았음|교환)?|번호|전화|연락처|이메일|메일|저장|추가|해줘|해 줘|받음|받았어|알게\s*됨|소개\s*받음)/g, ' ').replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
        const ROLE = /^(.*?)(대표|이사|팀장|실장|부장|차장|과장|대리|주임|사원|주무관|매니저|PD|피디|교수|작가|감독|디자이너|개발자|기획자|마케터|에디터|사장|선생님|쌤|원장|담당자?)(님)?$/; const ws = raw.split(' ').filter(Boolean); let nm = '', role = '', org = '';
        const ti = ws.findIndex(x => ROLE.test(x) && x.match(ROLE)[1].length >= 1 && x.match(ROLE)[1].length <= 3); // "김대리", "박대표님"
        const ni = ws.findIndex(x => /^[가-힣]{2,4}$/.test(x) && !ROLE.test(x) && !PLACE_SUF.test(x) && !/(프린팅|디자인|스튜디오|컴퍼니|상사|기획|미디어|랩|웍스|코리아|주식회사|팀|부서|센터|회사|대학교|대학|학과|본부|지점|은행|병원|협회|재단)$/.test(x));
        const JOBW = /^(아트|디렉터|서기|경영|총무|회계|PM|피엠|UI|UX|디자이너|기획자?|개발자?|마케터|에디터|PD|피디|AE|카피라이터|인턴|운영|촬영|편집자?|리서처|매니저|아트디렉터)$/i;
        const ri = ws.findIndex((x, k) => k >= 1 && ROLE.test(x) && !/^담당자?$/.test(x) && !x.match(ROLE)[1] && /^[가-힣]{2,4}$/.test(ws[k - 1]) && !ROLE.test(ws[k - 1]) && !/^(담당|소속)$/.test(ws[k - 1]));
        if (ri >= 2 || (ri === 1 && ws.length === 2)) { nm = ws[ri - 1]; role = ws[ri].replace(/님$/, ''); org = ws.slice(0, ri - 1).filter(x => !/^(담당|소속)$/.test(x)).concat(ws.slice(ri + 1)).join(' '); }
        else if (ni >= 0 && ws.length > 1 && ws.filter((_, k) => k !== ni).every(x => JOBW.test(x))) { nm = ws[ni]; role = ws.filter((_, k) => k !== ni).join(' '); org = ''; }
        else if (ni >= 0) { nm = ws[ni]; const others = ws.filter((_, k) => k !== ni); role = others.find(x => ROLE.test(x) && !x.match(ROLE)[1]) || ''; org = others.filter(x => x !== role).join(' '); }
        else if (ti >= 0) { nm = ws[ti]; role = ws[ti].match(ROLE)[2]; org = ws.filter((_, k) => k !== ti).join(' '); }
        else { nm = (raw.match(/[가-힣]{2,4}|[A-Za-z]+(?:\s[A-Za-z]+)?/) || [''])[0]; org = raw.replace(nm, '').trim(); }
        return { kind, label: '연락처', confidence: 0.85, data: { name: nm, phone: ph || '', email: em || '', org, role, memo: '', tags } }; }
      case 'reference': return { kind, label: '레퍼런스', confidence: 0.8, data: { title: strip(body.replace(/https?:\/\/\S+/g, ''), []) || (parseUrls(body)[0] || '레퍼런스'), url: parseUrls(body)[0] || '', tags: tags.length ? tags : keywords(body.replace(/레퍼런스|참고/g, ''), 4) } };
      case 'vendor': { const v = vendorParts(body, ctx.vendors || []); return { kind, label: '업체', confidence: v.name && (v.phone || v.link || v.prices.length) ? 0.8 : 0.6, data: v }; }
      case 'buy': { const u = parseUrls(body)[0] || ''; return { kind, label: '살 것', confidence: 0.75, data: { title: strip(body.replace(/https?:\/\/\S+/g, '').replace(/\d[\d,]*\s*(만\s*)?(\d+\s*천\s*)?원/g, ' ').replace(/(사야\s*(돼|해|함|겠다)?|살\s*거|살\s*것|구매\s*(목록|예정|할\s*것)?(에)?\s*(추가|넣어)?(해\s*줘|줘)?|장바구니(에)?\s*(추가|넣어)?(해\s*줘|줘)?|주문해야\s*(돼|해)?)/g, ' '), []) || '(상품명을 적어 주세요)', url: u, price: parseMoney(body) || 0, qty: 1, need: 'must' } }; }
      case 'idea': return { kind, label: '아이디어', confidence: 0.7, data: { title: summarize(body, 1)[0]?.slice(0, 60) || body.slice(0, 60), body, tags: tags.length ? tags : keywords(body, 5) } };
      case 'note': return { kind, label: '메모', confidence: 0.6, data: { title: (summarize(body, 1)[0] || body).slice(0, 60), body, tags: tags.length ? tags : keywords(body, 6) } };
      case 'timelog': { const tw = parseWhen(body, base); const span = tw.time && tw.end ? (+tw.end.slice(0, 2) * 60 + +tw.end.slice(3)) - (+tw.time.slice(0, 2) * 60 + +tw.time.slice(3)) : 0; const m = span > 0 ? span : tw.mins || 60; body = span > 0 ? strip(body, tw.hits).replace(/^(부터|까지)\s*/, '') : body; return { kind, label: '작업 기록', confidence: 0.8, data: { title: strip(body, []).replace(/\d+\s*(시간|분)\s*(동안)?/g, '').replace(/\s*(작업)?\s*(했음|했다|했어|함|완료)$/, '').trim() || '작업', minutes: m, date: tw.date && tw.date <= ymd(base) ? tw.date : ymd(base), project: projectOf(body, ctx) } }; }
      case 'sns': return { kind, label: 'SNS 아이디어', confidence: 0.75, data: { title: cleanTitle, platform: /(릴스|인스타)/.test(body) ? '인스타그램' : /(쇼츠|유튜브)/.test(body) ? '유튜브' : /틱톡/.test(body) ? '틱톡' : '인스타그램', status: '아이디어', date: bw.date || '', tags } };
      case 'okr': return { kind, label: '목표', confidence: 0.7, data: { title: cleanTitle.replace(/^(이번|다음|올해|\d분기)?\s*(분기|달|연도)?\s*(목표|OKR|okr)\s*(는|은|:|：)?\s*/, '').trim() || cleanTitle, quarter: quarterOf(base), krs: [] } };
      case 'grant': { const ek = body.match(/(?:최대\s*)?(\d+(?:\.\d+)?)\s*억\s*(?:(\d+)\s*천)?\s*(?:만\s*)?원?/); const amt = ek ? Math.round(parseFloat(ek[1]) * 1e8 + (+(ek[2] || 0)) * 1e7) : parseMoney(body) || null;
        return { kind, label: '지원사업', confidence: 0.7, data: { title: cleanTitle.replace(/(최대\s*)?\d+(\.\d+)?\s*억\s*(\d+\s*천)?\s*(만\s*)?원?/, ' ').replace(/(최대\s*)?\d[\d,]*\s*(만|천)?\s*원/, ' ').replace(/\s*(마감|접수\s*마감|신청\s*마감|지원금|최대)\s*/g, ' ').replace(/\s+/g, ' ').trim() || cleanTitle, deadline: bw.date || '', status: '검토', amount: amt, url: parseUrls(body)[0] || '' } }; }
      default: return { kind: 'note', label: '메모', confidence: 0.5, data: { title: body.slice(0, 60), body, tags } };
    }
  }
  // 금액 읽기: "20만 x 3", "8천원씩 5명", "총 60만", 단위 없는 "12800", 3.3% 메모
  function moneyParts(body, bw) {
    const MR = new RegExp(MONEY_SRC, 'g'); let amt = parseMoney(body); let memo = ''; let ttl = body;
    const tot = body.match(new RegExp('(?:총|합계|합쳐서|다\\s*해서|토탈)\\s*(' + MONEY_SRC + ')'));
    const part = body.match(new RegExp('(' + MONEY_SRC + ')\\s*중\\s*(선금|계약금|잔금|중도금|일부)?\\s*(' + MONEY_SRC + ')'));
    const perDay = body.match(new RegExp('(?:하루|일당|1일)\\s*(' + MONEY_SRC + ')\\s*(?:씩)?\\s*(\\d{1,3})\\s*일(?:간|치|동안)?'));
    if (part) { const whole = parseMoney(part[1]); const sub = parseMoney(body.slice(part.index + part[1].length)); if (sub != null) { amt = sub; memo = `총 ${Number(whole).toLocaleString()}원 중 ${part[2] || '일부'}`; ttl = ttl.replace(/\s중(?=\s)/, ' '); } }
    else if (perDay) { const one = parseMoney(perDay[1]); const n = +perDay[2]; if (one != null && n > 1) { amt = one * n; memo = `${one.toLocaleString()}원 × ${n}일`; ttl = ttl.replace(perDay[0], ' '); } }
    else if (tot) amt = parseMoney(tot[1]);
    else if (amt != null && !part && !perDay) { const first = body.match(new RegExp(MONEY_SRC)); const after = first ? body.slice(first.index + first[0].length) : ''; const mul = after.match(/^\s*(?:씩)?\s*(?:[xX×*]\s*(\d{1,3})(?:\s*(?:명|개|장|건|회|일|번|인|잔|박|권|세트|컷|편))?|씩\s*(\d{1,3})\s*(?:명|개|장|건|회|일|번|인|잔|박|권|세트|컷|편))/) || (/씩/.test(after.slice(0, 3)) ? null : null);
      const n = mul ? +(mul[1] || mul[2]) : 0; if (n > 1 && n <= 500) { memo = `${amt.toLocaleString()}원 × ${n}`; amt = amt * n; ttl = ttl.replace(mul[0], ' '); } }
    if (amt == null) { const ba = bareAmount(body); if (ba != null) { amt = ba; ttl = ttl.replace(new RegExp('(?<![\\d,])' + String(ba).replace(/\B(?=(\d{3})+(?!\d))/g, ',?') + '(?![\\d,])'), ' '); } }
    if (/3\.3\s*%/.test(body)) memo = [memo, '3.3% 원천징수'].filter(Boolean).join(' · ');
    if (/부가세\s*(포함|별도)/.test(body)) memo = [memo, '부가세 ' + body.match(/부가세\s*(포함|별도)/)[1]].filter(Boolean).join(' · ');
    ttl = strip(ttl.replace(MR, ' ').replace(/(?:총|합계|합쳐서|토탈)\s*(?=\s|$)/g, ' ').replace(/\(?\s*부가세\s*(포함|별도)\s*\)?/g, ' ').replace(/3\.3\s*%\s*(떼고|제외|공제)?/g, ' '), bw.hits).replace(/(법인\s*카드|회사\s*카드|개인\s*카드|법카|개카|카드로|카드|현금으로|현금|계좌\s*이체)/g, ' ').replace(/\s+/g, ' ').trim();
    return { amount: amt || 0, title: ttl, memo };
  }
  function strip(x, hits) {
    let r = x;
    for (const hh of hits || []) r = r.replace(hh, ' ');
    return r.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/^\s*(일정|약속|할\s*일|투두|메모|아이디어)\s*[:：]\s*/, '').replace(/(에|에서|부터|까지)\s*$/, '').replace(/\s*(으로|로)?\s*(잡자|잡아\s*줘|잡아줘|잡을게|정하자|추가해\s*줘|등록해\s*줘|넣어\s*줘|기록해\s*줘|저장해\s*줘|해줘|있음|있어|있다)\s*$/, '').replace(/\s+/g, ' ').trim().replace(/^(까지|부터|에서|으로|로|에|은|는|쯤|경)\s+/, '').trim();
  }
}
// "서충주 수집오빠랑 충주본색 전시 방문" → 누구랑 수집오빠 · 지역 서충주 · 장소 충주본색 · 제목 충주본색 전시 방문
const KIN = '오빠|언니|누나|형|형님|씨|님|쌤|선생님|교수님|대표님|팀장님|실장님|작가님|감독님|엄마|아빠|친구|동생|선배|후배|이모|삼촌|할머니|할아버지|사장님|피디님|PD님';
const AREA = /^((서|동|남|북)?[가-힣]{1,3}(시|군|구|동|읍|면|도)|서충주|충주|서울|홍대|강남|성수|합정|연남|망원|이태원|한남|을지로|종로|대학로|잠실|여의도|판교|분당|일산|부산|해운대|대전|대구|광주|인천|수원|청주|제주|전주|춘천|강릉|원주|천안|세종|울산|창원|포항|경주|여수|목포)$/;
const DOING = /(?:\s|^)((?:전시|공연|영화|팝업|박람회|페어|콘서트|축제|행사)?\s*(?:방문|관람|구경|보기|보러\s*가기|미팅|회의|촬영|답사|식사|점심|저녁|약속|모임|견학|투어|상담|인터뷰|수업|강의|워크숍|설치|철수|회식|데이트|나들이|여행|전시|공연|팝업))$/;
const FAMILY = '엄마|아빠|어머니|아버지|할머니|할아버지|이모|고모|삼촌|언니|오빠|누나|형|동생|친구|남친|여친|남자친구|여자친구|남편|아내|와이프';
const TITLE_SUF = '대표님?|팀장님?|실장님?|교수님?|선생님|쌤|작가님?|감독님?|피디님?|PD님?|사장님|주무관님?|대리님?|과장님?|차장님?|부장님?|매니저님?|님';
const PLACE_SUF = /(역|카페|센터|빌딩|학교|대학교|대학|캠퍼스|사무실|스튜디오|홀|관|시청|구청|도청|군청|청사|병원|치과|의원|미술관|박물관|도서관|공원|극장|갤러리|플라자|타워|식당|집|본점|지점|점|DDP|코엑스|킨텍스|벡스코)$/;
const MEET = '미팅|회의|상담|인터뷰|식사|점심|저녁|약속|통화|콜|회식|모임|촬영|수업';
const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function eventParts(title, people = []) {
  let t = String(title || '').replace(/\s+/g, ' ').trim(); if (!t) return null; let who = '', area = '', place = '';
  const cut = (m, keep = '') => { t = (t.slice(0, m.index) + ' ' + keep + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); };
  // 누구랑: 아는 이름(성 빼고 불러도), 호칭(오빠·대표님…), 가족
  const names = [...new Set(people.filter(Boolean).flatMap(n => /^[가-힣]{3,4}$/.test(n) ? [n, n.slice(1)] : [n]))].sort((a, b) => b.length - a.length).map(esc).join('|');
  const person = `(?:${names ? '(?:' + names + ')(?:이|님|씨)?|' : ''}[가-힣A-Za-z]{1,6}\\s?(?:${KIN})|${FAMILY})`;
  let m = t.match(new RegExp(`(^|\\s)(${person})(?:이랑|랑|하고|와|과)(?:\\s*(?:같이|함께|둘이))?(?=\\s|$)`)) || t.match(/(^|\s)([가-힣A-Za-z]{2,6})(?:이랑|랑|하고|와|과)\s*(?:같이|함께)(?=\s|$)/);
  if (m) { who = m[2]; cut(m); }
  else if ((m = t.match(new RegExp(`(^|\\s)([가-힣A-Za-z]{1,6}(?:${TITLE_SUF}))\\s+(?=(?:\\S+\\s)?(?:${MEET})$)`)))) { who = m[2]; }
  if (who && names) { const full = people.find(n => n && n !== who && n.slice(1) === who.replace(/(이|님|씨)$/, '')); if (full) who = full; else who = who.replace(/(?<=[가-힣]{2})이$/, ''); }
  // 온라인
  if ((m = t.match(/(^|\s)(줌|zoom|구글\s*밋|구글\s*미트|google\s*meet|팀즈|디스코드|온라인|화상|전화|통화)(으로|로)(?=\s|$)/i))) { place = /전화|통화/.test(m[2]) ? '전화' : `온라인 (${m[2]})`.replace(' (온라인)', '').replace(' (화상)', ''); cut(m); }
  // "○○에서"
  if (!place && (m = t.match(/(^|\s)((?:\S+\s)?\S+?)에서(?=\s|$)/))) { const ph = m[2].trim(); const ws = ph.split(' '); if (ws.length === 2 && AREA.test(ws[0])) area = ws[0]; if (AREA.test(ph)) area = ph; else place = ph; cut(m); }
  let words = t.split(' ');
  if (!area && words.length > 1 && AREA.test(words[0].replace(/(에서|에)$/, ''))) { area = words.shift().replace(/(에서|에)$/, ''); t = words.join(' '); }
  // 이름 끝이 장소 같은 말 (○○센터, ○○시청, ○○역…): 앞에 붙은 말까지 묶음
  if (!place) { words = t.split(' '); const k = words.findIndex(x => PLACE_SUF.test(x) && x.length >= 2); if (k >= 0 && k <= 2 && !(who && words.slice(0, k + 1).join(' ').includes(who))) { place = words.slice(0, k + 1).join(' '); const restT = words.slice(k + 1).join(' '); if (/^(에\s*)?(가야\s*\S*(\s*\S{1,2})?|가기|감|갈\s*\S*|들르\S*|다녀오\S*)$/.test(restT)) t = place; else if (restT.length >= 2) t = restT; } }
  // 보러 가는 일정이면 앞말이 장소
  const dm = t.match(DOING);
  if (!place && dm && dm.index > 0) { const head = t.slice(0, dm.index).trim().replace(/(에서|에|으로|로)$/, ''); if (head && head.split(' ').length <= 3 && !/(하|되)$/.test(head) && /(방문|관람|구경|보기|가기|견학|투어|답사|전시|공연|팝업|나들이|여행|데이트)$/.test(dm[1])) place = head; }
  if (!who && !area && !place) return null;
  if (t.length <= 3 && who && !t.includes(who)) { const c = who.charCodeAt(who.length - 1); const bat = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 > 0 : false; t = `${who}${bat ? '과' : '와'} ${t}`.trim(); } else if (t.length <= 3 && area) t = `${area} ${t}`.trim(); else if (!t) t = place || title;
  return { title: t || title, who, area, place };
}
function placeOf(s) { const m = s.match(/([가-힣A-Za-z0-9]+(?:역|카페|센터|빌딩|학교|대학교|캠퍼스|사무실|스튜디오|홀|관|층|호|점))(?:에서|서)?/); return m ? m[1] : ''; }
// 프로젝트는 이름 앞머리만 불러도 알아듣기: "카페 로우 브랜드 영상" ← "카페 로우 촬영"
const nsp = x => String(x || '').replace(/\s+/g, '');
export function projAliases(p) { const ws = String(p || '').trim().split(/\s+/); const out = [p]; if (ws.length >= 3) out.push(ws.slice(0, 2).join(' ')); if (ws.length >= 2 && ws[0].length >= 4 && !/^(브랜드|유튜브|인스타|프로젝트|캠페인)$/.test(ws[0])) out.push(ws[0]); return out.filter(a => nsp(a).length >= 3); }
export function projectMatch(s, projects = []) { const S = nsp(s).toLowerCase(); let best = null; for (const p of projects) if (p) for (const a of projAliases(p)) { const A = nsp(a).toLowerCase(); if (S.includes(A) && (!best || A.length > best.len)) best = { name: p, alias: a, len: A.length }; } return best; }
const NOPROJ = /(월세|관리비|부가세|세금\s*신고|종소세|주간\s*회의|휴가|반차|연차|병가|병원|치과|회고|급여|월급|보험|생일|개인|회식|사무실|워크숍|구독)/;
const PGEN = /^(팝업|프로젝트|캠페인|브랜드|영상|제안|행사|촬영|디자인|기획|운영|리뉴얼|채널|유튜브|인스타|콘텐츠|제작|패키지|이벤트|론칭|런칭|홍보|마케팅|광고|\d+차?|신규|새|굿즈|릴스|회의|미팅|시안|작업)$/;
const PADV = /^(제일|우리|이번|다음|지난|가을|겨울|봄|여름|오늘|내일|매일|하루|전체|모든|하나|새로)$/;
export function projectGuess(s, projects = [], cur = '') {
  const hit = projectMatch(s, projects); if (hit) return { name: hit.name };
  const words = String(s || '').split(/[\s,·/()\[\]:：]+/).filter(Boolean); const cands = new Map();
  for (const p of projects) for (const tk of String(p || '').split(/\s+/)) {
    if (tk.length < 2 || PGEN.test(tk) || AREA.test(tk)) continue;
    if (words.some(wd => wd.startsWith(tk) && (PADV.test(tk) ? wd.length >= tk.length + 2 : true))) cands.set(p, (cands.get(p) || 0) + tk.length);
  }
  if (!cands.size) return { name: '' };
  const top = [...cands.entries()].sort((a, b) => b[1] - a[1]);
  if (top.length === 1 || top[0][1] > top[1][1]) return { name: top[0][0] };
  const many = top.filter(x => x[1] === top[0][1]).map(x => x[0]);
  return { name: many.includes(cur) ? cur : '', many };
}
function projectOf(s, ctx) { const g = projectGuess(s, ctx.projects || [], ctx.project || ''); if (g.name) return g.name; const m = s.match(/\[([^\]]+)\]/); return m ? m[1] : ''; }
// 마지막 손질: 제목에 남은 조사·요일, 프로젝트 붙이기
const PROJ_KINDS = new Set(['event', 'task', 'expense', 'income', 'note', 'idea', 'reference', 'buy', 'sns', 'timelog']);
export function polish(r, ctx = {}) {
  const d = r && r.data; if (!d) return r; const src = String(r.src || '');
  if (['event', 'income', 'expense', 'task', 'buy'].includes(r.kind) && typeof d.title === 'string' && d.title) {
    let t = d.title.replace(/^[-*•·▪◦]\s+/, '').replace(/(?<=\S)\s+(까지|부터|에|으로|로|은|는|이랑|랑)(?=\s|$)/g, ' ');
    if (/\d\s*일|\d{1,2}[/.]\d{1,2}/.test(src)) t = t.replace(/(^|\s)\(?[월화수목금토일]요일\)?(이랑|랑|에)?(?=\s|$)/g, ' '); // 날짜를 말했으면 요일은 제목에서 뺌
    if (r.kind === 'event' || r.kind === 'income') t = t.replace(/^(\S{1,12}?)(은|는)(?=\s|$)/, (m0, a, j) => (new RegExp('^\\s*' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + j + '\\s+(\\d|오늘|내일|모레|다음|이번|팝업|[월화수목금토일]요일)').test(src) ? a : m0)); // "PT는 12월 9일 …" → "PT"
    t = t.replace(/\s+/g, ' ').trim(); if (t) d.title = t;
  }
  if (r.kind === 'event' && d.title) { const t2 = d.title.replace(/^(나|내가|저|제가|나는|저는)\s+/, '').replace(/(^|\s)(오전|오후|아침|저녁|밤|새벽)에?(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim(); if (t2 && t2 !== d.title) { if (d.place === d.title) d.place = t2; d.title = t2; } }
  if (r.kind === 'expense' && d.title) d.title = d.title.replace(/\s+(나감|나갔\S*|냄|냈\S*|씀|썼\S*|결제\S*|지출함?)$/, '').trim() || d.title;
  if (r.kind === 'reference' && d.title) d.title = d.title.replace(/^(레퍼런스|참고|레퍼)\s*[:：]?\s+/, '').trim() || d.title;
  if (r.kind === 'vendor' && /^(받음|받았\S*|옴|왔\S*)$/.test(d.memo || '')) d.memo = '';
  if (PROJ_KINDS.has(r.kind) && !d.project) { const s0 = src || d.title || ''; const pj = projectOf(s0, ctx);
    if (pj) d.project = pj;
    else if (ctx.project && !NOPROJ.test(s0) && d.scope !== 'personal' && !projectGuess(s0, ctx.projects || []).many) { d.project = ctx.project; r.byCtx = true; } }
  return r;
}
export function quarterOf(d = new Date()) { d = new Date(d); return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`; }

// ── 비슷한 기록 찾기 ─────────────────────────────────────────
export function similar(query, docs, k = 5) {
  const q = tokens(query);
  if (!q.length) return [];
  const qs = new Map(); q.forEach(w => qs.set(w, (qs.get(w) || 0) + 1));
  const df = new Map(); const dt = docs.map(d => { const ts = tokens(d.text); new Set(ts).forEach(w => df.set(w, (df.get(w) || 0) + 1)); return ts; });
  const N = docs.length + 1;
  return docs.map((d, i) => {
    const m = new Map(); dt[i].forEach(w => m.set(w, (m.get(w) || 0) + 1));
    let s = 0;
    qs.forEach((f, w) => { if (m.has(w)) s += f * m.get(w) * Math.log(1 + N / (df.get(w) || 1)); else for (const [x] of m) if (x.length >= 2 && (x.includes(w) || w.includes(x))) { s += 0.3; break; } });
    return { ...d, score: s / Math.sqrt(dt[i].length + 3) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// ── 학습 ────────────────────────────────────────────────────
// 하진이 확인 대기함에서 고친 내용을 보고 규칙을 기억
export function learn(kind, originalText, final) {
  if (kind === 'expense' && final.category) {
    const kw = keywords(originalText, 2).filter(x => !x.includes(' '))[0];
    if (kw && guessCategory(originalText) !== final.category) learned.cat[kw] = final.category;
  }
  if (final.who && final.who !== '나' && !learned.people.includes(final.who)) learned.people.push(final.who);
  return learned;
}
const GENERIC = /^(하루|이틀|포함|별도|오늘|내일|이번|다음|확인|정리|준비|작업|진행|관련|이거|그거|저거|우리|회의|미팅|촬영|편집|시안|수정|공유|전달|요청|완료|예정|필요|가능|부가세|견적|금액|비용|입금|결제|회사|팀|담당|일정|시간|장소|내용|자료|파일|링크|사진|영상|이미지|오전|오후|저녁|아침|점심|[0-9]+.*|.{1})$/;
export function learnKind(text, kind) { const kw = keywords(text, 6).filter(x => !x.includes(' ') && !GENERIC.test(x) && !isName(x) && !new RegExp(`(${KIN}|${FAMILY})$`).test(x) && !AREA.test(x)).pop(); if (kw) learned.kind[kw] = kind; return learned; }

// ── 레퍼런스 추천 (로컬 지식 사전) ───────────────────────────
// 키워드 → 스타일 태그 → 참고할 만한 사이트·검색어
const STYLE = [
  [/(게임|game|rpg|인게임|hud|ui)/i, ['Game UI', 'HUD', 'Interface In Game'], ['https://interfaceingame.com/?s=', 'https://www.gameuidatabase.com/index.php?scrn=1&search=']],
  [/(앱|모바일|app|온보딩|화면|ux)/i, ['Mobile UI', 'App flow'], ['https://mobbin.com/search/apps/ios?content_type=screens&q=', 'https://dribbble.com/search/']],
  [/(웹|랜딩|사이트|홈페이지|web)/i, ['Web design', 'Landing'], ['https://www.awwwards.com/search?text=', 'https://land-book.com/search?q=']],
  [/(포스터|타이포|편집|도록|브로슈어|책|레이아웃|그래픽)/, ['Editorial', 'Typography poster'], ['https://www.behance.net/search/projects?search=', 'https://www.pinterest.com/search/pins/?q=']],
  [/(캐릭터|일러|원화|컨셉아트|콘셉트아트|배경|환경)/, ['Character concept', 'Concept art'], ['https://www.artstation.com/search?query=', 'https://www.pinterest.com/search/pins/?q=']],
  [/(3d|3D|블렌더|blender|모델링|아트토이|렌더)/, ['3D render', 'Art toy'], ['https://www.artstation.com/search?query=', 'https://www.behance.net/search/projects?search=']],
  [/(모션|애니메이션|에펙|mv|뮤비|영상|트랜지션)/i, ['Motion graphics', 'Transition'], ['https://vimeo.com/search?q=', 'https://www.youtube.com/results?search_query=']],
  [/(브랜딩|로고|아이덴티티|bi|ci)/i, ['Brand identity', 'Logo system'], ['https://www.behance.net/search/projects?search=', 'https://www.brandnew.org/?s=']],
  [/(전시|부스|공간|팝업|설치)/, ['Exhibition design', 'Pop-up booth'], ['https://www.pinterest.com/search/pins/?q=', 'https://www.designboom.com/?s=']],
  [/(릴스|쇼츠|인스타|sns|썸네일|피드)/i, ['Reels editing', 'Thumbnail design'], ['https://www.pinterest.com/search/pins/?q=', 'https://www.youtube.com/results?search_query=']],
  [/(스타트업|피치|IR|사업계획|덱|deck)/i, ['Pitch deck', 'Startup'], ['https://www.pitch.com/search?q=', 'https://www.slideshare.net/search?searchfrom=header&q=']],
];
const MOOD = { 미니멀: 'minimal', 흑백: 'monochrome', 다크: 'dark', 밝은: 'bright', 파스텔: 'pastel', 레트로: 'retro', 빈티지: 'vintage', 사이버: 'cyberpunk', 아르데코: 'art deco', 귀여운: 'cute', 몽환: 'dreamy', 판타지: 'fantasy', 키치: 'kitsch', 네온: 'neon', 자연: 'nature', 하늘: 'sky', 장난감: 'toy', 감성: 'aesthetic', 고급: 'luxury', 모던: 'modern', 그리드: 'grid', 일본: 'japanese', 한국: 'korean' };
export function recommendRefs(text, ownDocs = []) {
  const kws = keywords(text, 6);
  const moods = Object.entries(MOOD).filter(([k]) => text.includes(k)).map(([, v]) => v);
  const styles = STYLE.filter(([re]) => re.test(text));
  const queries = [];
  const core = kws.slice(0, 3).join(' ');
  for (const [, tagsS, sites] of styles.length ? styles : [[null, ['Design inspiration'], ['https://www.pinterest.com/search/pins/?q=', 'https://www.behance.net/search/projects?search=']]]) {
    const q = [tagsS[0], ...moods.slice(0, 2)].join(' ');
    for (const site of sites) queries.push({ site: new URL(site).hostname.replace('www.', ''), q, url: site + encodeURIComponent(q) });
    queries.push({ site: 'pinterest.com', q: core + ' ' + moods.join(' '), url: 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(core + ' ' + moods.join(' ')) });
  }
  return {
    keywords: kws,
    moods,
    styleTags: [...new Set(styles.flatMap(s => s[1]))],
    links: uniqBy(queries, x => x.url).slice(0, 8),
    mine: similar(text, ownDocs, 5),
    checklist: refChecklist(text),
  };
}
function refChecklist(text) {
  const c = ['색: 주조색 1 + 보조색 1~2 + 포인트 1로 제한', '타이포: 제목/본문 2종 이내', '레퍼런스는 같은 축(색·구도·질감)끼리 묶어서 비교'];
  if (/(게임|ui|앱|웹)/i.test(text)) c.push('정보 우선순위: 1초 안에 읽혀야 하는 것 3개 정하기');
  if (/(영상|모션|릴스|쇼츠)/.test(text)) c.push('첫 1.5초 훅, 컷 길이 리듬, 자막 위치 통일');
  if (/(포스터|도록|편집)/.test(text)) c.push('그리드와 여백 비율 먼저 고정');
  return c;
}

// ── 하루 브리핑 ─────────────────────────────────────────────
export function briefing({ events = [], tasks = [], drafts = 0, people = [], expenses = [] }) {
  const lines = [];
  const now = new Date(); const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const next = events.filter(e => (e.start || '00:00') >= hhmm).sort((a, b) => (a.start || '').localeCompare(b.start || ''))[0];
  if (next) lines.push(`다음 일정은 ${next.start || '종일'} ${next.title}`);
  const overdue = tasks.filter(t => !t.done && t.due && t.due < ymd(now)).length;
  const due = tasks.filter(t => !t.done && t.due === ymd(now)).length;
  if (due) lines.push(`오늘 마감 ${due}개`);
  if (overdue) lines.push(`밀린 일 ${overdue}개`);
  if (drafts) lines.push(`확인할 임시 항목 ${drafts}개`);
  if (people.length) lines.push(`연락할 사람 ${people.length}명`);
  return lines.join(' · ') || '오늘은 여유로워요';
}
