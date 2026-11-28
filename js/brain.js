// ─────────────────────────────────────────────────────────────
import { guess as guessScope } from './scope.js';
import { parse as actParse, titleOf as actTitle, isActLink } from './acts.js';
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
    else if (!/(내일|낼|모레|글피|요일|욜|\d\s*일)/.test(t) && (m = t.match(/(퇴근\s*전|자기\s*전|점심\s*전|오전\s*중|오후\s*중)(에|까지|으로)?(?=\s|$)/))) date = b;
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
export const MONEY_SRC = '(?:\\d+(?:\\.\\d+)?\\s*억\\s*)?(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*만\\s*(?:\\d+\\s*천)?\\s*(?:\\d+\\s*백)?\\s*원?|\\d+(?:\\.\\d+)?\\s*억\\s*원?|\\d+(?:\\.\\d+)?\\s*천\\s*(?:\\d+\\s*백)?\\s*원|(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:원|\\s+원(?![가-힣]))|₩\\s*[\\d,]+';
export function parseMoney(text) {
  const num = x => parseFloat(String(x).replace(/,/g, ''));
  let m = text.match(/(\d+(?:\.\d+)?)\s*억\s*(?:(\d{1,3}(?:,\d{3})+|\d+)\s*만)?\s*(?:(\d+)\s*천)?/);
  if (m) return Math.round(num(m[1]) * 1e8 + (m[2] ? num(m[2]) * 1e4 : 0) + (m[3] && m[2] ? +m[3] * 1000 : m[3] ? +m[3] * 1e7 : 0));
  m = text.match(/(\d+(?:\.\d+)?)\s*(천|백|십)\s*만\s*원?/);   /* 3천만원, 5백만원 */
  if (m) return Math.round(num(m[1]) * { 천: 1e7, 백: 1e6, 십: 1e5 }[m[2]]);
  m = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?\s*(?:(\d+)\s*백)?\s*원?/);
  if (m) return Math.round(num(m[1]) * 10000 + (+(m[2] || 0)) * 1000 + (+(m[3] || 0)) * 100);
  m = text.match(/(\d+(?:\.\d+)?)\s*천\s*(?:(\d+)\s*백)?\s*원/);
  if (m) return Math.round(parseFloat(m[1]) * 1000) + (+(m[2] || 0)) * 100;
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
const STOP = new Set('개를 개가 개는 가지를 번을 어떨까 어떨까요 가기 가면 정리 결정 하기 했어요 했습니다 같아요 다음주 이번주 지난주 저번주 담주 월요일 화요일 수요일 목요일 금요일 토요일 일요일 오늘은 내일은 그리고 그래서 그런데 근데 하지만 그러면 그럼 이제 일단 약간 진짜 정말 너무 아주 좀 조금 많이 그냥 막 뭔가 이런 저런 그런 이거 저거 그거 여기 저기 거기 우리 저희 제가 내가 나는 저는 너는 이번 다음 지난 오늘 내일 모레 어제 때문 정도 부분 경우 관련 대해 대한 위해 통해 가지 하나 하는 있는 없는 있다 없다 있어 없어 있고 없고 같다 같은 되다 하다 것 거 수 등 및 또 더 다 안 못 잘 왜 뭐 어떻게 언제 어디 누구 오전 오후 저녁 아침 점심 시간 분 시 월 일 주 년 요일 해야 하기로 하면 해서 그거는 이거는 저거는 the a an and or to of in on for is are be it this that we i you 음 어 아 네 예 응 오케이 ok 넵 넹 감사합니다 수고 했습니다 합니다'.split(' '));

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
const ACTION = /((주|쓰|보내|만들|올리|넘기|챙기|알아보)기로|비교해|골라야|해야|야\s*(함|해|돼|됨|한다|하는데|겠)|끝내|넘기|넘겨|받아|받기|신고|할\s*것|하기로|해\s*주세요|해주세요|해\s*줘|해줘|부탁|맡|담당|준비|보내|제출|전달|공유하|정리하|만들|작성|수정|체크|확인하|확인해|예약|연락|요청|업로드|올리|뽑|찾아|알아보|검토|리뷰|컨펌|피드백|까지|마감|todo|TODO|할\s*일|챙기|구매|주문|결제|신청|발송|출력|인쇄)/;
const QUESTION = /(\?|인가요|일까(?!지)|할까(?!지)|될까(?!지)|[^끝]나요$|는지\s|궁금|고민|문제|이슈|리스크|걱정|애매|미정|모르겠)/;
const IDEAQ = /(💡|갑자기\s*생각난|생각난\s*(건데|거|게|김에)|생각났는데|떠올랐는데|(면|로|으로|는\s*거|는\s*것도|도)\s*(어때|어떰|어떨까|어떨지|좋겠\S*|좋을\s*듯|좋을듯|괜찮을\s*듯|괜찮을듯|괜찮겠\S*)\s*[?？]*\s*$)/;
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
  { const end = { 겨: '기기', 려: '리기', 봐: '보기', 워: '우기', 와: '오기', 써: '쓰기', 줘: '주기', 꿔: '꾸기', 춰: '추기', 내: '내기', 해: '하기', 쳐: '치기', 져: '지기', 켜: '키기', 여: '이기', 둬: '두기', 놔: '놓기', 돼: '되기' }; r = r.replace(/(겨|려|봐|워|와|써|줘|꿔|춰|내|해|쳐|져|켜|여|둬|놔|돼)야\s*(해|돼|함|됨|겠다|한다|하는데|되는데|지)\S*\s*$/, (m0, a) => end[a]).replace(/([받찾닫믿얻])아야\s*(해|돼|함|됨|겠다|한다|지)\S*\s*$/, '$1기'); }
  r = r.replace(/^(나|저)(는|도)?\s+(?=\S)/, '').replace(/\s*(아직|여태|결국)?\s*(못|안)\s*(함|했어요?|했음|했다|끝냄|끝냈어요?|보냄|보냈어요?|한\s*상태)\s*$/, '').replace(/(봐|와|써|꿔|춰|겨|려|워|져|쳐|여|켜)\s*(주세요|줘|주라|줄래)\s*$/, (m0, a) => ({ 봐: '보', 와: '오', 써: '쓰', 꿔: '꾸', 춰: '추', 겨: '기', 려: '리', 워: '우', 져: '지', 쳐: '치', 여: '이', 켜: '키' }[a]) + '기');
  if (who && who !== '나') r = r.replace(new RegExp('(^|\\s)' + who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(팀장|실장|선배|후배|대리|과장|피디|PD|대표|감독|작가)?(님|씨)?(이가|이는|이|가|은|는|께서|한테|에게|께)?\\s*[:：]?\\s*'), ' ').trim().replace(/([가-힣])(은|는)\s+(하기로\S*|하기|맡기로\S*|담당)\s*$/, '$1');
  r = r.replace(/(다음\s*주|이번\s*주|담주|다담주|다다음\s*주)?\s*[월화수목금토일](요일|욜)(까지|에|부터)?/g, ' ')
    .replace(/(?<![가-힣])(오늘|내일|모레|글피|오전|오후|저녁|아침)(까지|에|부터)?(?![가-힣])(?!\s*(?:먹|식사))|(다음\s*주|이번\s*주|\d+월\s*\d+일|\d{1,2}\/\d{1,2}|\d+시(\s*반|\s*\d+분)?)(까지|에|부터)?/g, ' ')
    .replace(/(^|\s)(밤|새벽|낮|점심)(까지|부터)(?=\s|$)/g, ' ')
    .replace(/\s(까지|에)\s/g, ' ')
    .replace(/(제가|내가|저는|나는|우리가|저희가)\s*/g, '')
    .replace(/[.!~]+$/, '').replace(/\s+/g, ' ').trim()
    .replace(/^(까지였던|까지인|까지였는데|까지|부터|에)\s+/, '');
  // 끝말을 "~하기" 꼴로
  r = r.replace(/(\S+?)하?(해\s*주세요|해\s*줘|해\s*주라|하기로\s*\S*|해야\s*\S*|할\s*것|합시다|하자|할게요?|해요|했어요|합니다)$/, (m, a) => a + (/하$/.test(a) ? '기' : '하기'))
    .replace(/(\S+?)[어아]?\s*(주세요|줘|주라|드리기|드려요|드릴게요)$/, '$1기')
    .replace(/(\S+?)(기로\s*\S*|야\s*(해|돼|함|됨|겠다)\S*|ㄹ게요?)$/, (m0, a, b) => (/^야/.test(b) && /[가-힣][어아]$/.test(a) ? a.slice(0, -1) : a) + '기') /* 만들어야 해 → 만들기, 받아야 해 → 받기 */
    .replace(/\s+(할게요?|하겠음|하겠습니다|맡을게요?|맡음|달래|해\s*달래|해달래)$/, '').replace(/(했음|했다|했어|(?<!명|보관|우편|사서|수거|투표|응모|건의|편지|메일|구급|경|군)함|(?<!안|작)됨|(?<!프레|게|타|모|라|클레|책|담|선|후|부|취|위|역|해|분|디|퍼|패러다|맥|헬|스트)임)$/, '').trim();
  return r.replace(/^[,.:：\s]+|[,.\s]+$/g, '');
}

// 메신저로 받은 "~ 가능해?", "~ 갈 수 있어?" 같은 물음에서 약속 이름만 남김 ("내일 3시에 루미에 미팅 가능해?" → "루미에 미팅")
export function askTitle(text, base = new Date()) {
  const w = parseWhen(text, base); let r = (w.hits || []).reduce((x, hh) => x.replace(hh, ' '), text).replace(/[?？!~.]+\s*$/, '').replace(/(^|\s)(에|에는|엔|까지|부터)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = c => { const k = c.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 && k % 28 === 8 ? String.fromCharCode(c.charCodeAt(0) - 8) : ''; };   /* 갈 → 가, 볼 → 보 */
  r = r.replace(/\s*시간\s*(돼|되|괜찮|있|어때|어떠)[가-힣]*$/, '').replace(/\s*\S*[가-힣]도\s*(될까|되나|돼|되|괜찮)[가-힣]*$/, '')
    .replace(/\s*(?:참석\s*)?(가능|괜찮|되나|되세|되시|될까|돼|어때|어떠|어떨)[가-힣]*$/, '')
    .replace(/([가-힣])을\s*수\s*있[가-힣]*$/, '$1기').replace(/([가-힣])\s*수\s*있[가-힣]*$/, (m, c) => stem(c) ? stem(c) + '기' : m)
    .replace(/([가-힣])을(래|까)요?$/, '$1기').replace(/([가-힣])(래|까)요?$/, (m, c) => stem(c) ? stem(c) + '기' : m)
    .replace(/\s+(있어요?|있음|있습니다|있대요?|잡혔어요?|잡혔대요?|갑니다|가요|갈게요|갈\s*예정\S*)$/, '');
  r = cleanTask(r).replace(/(^|\s)(같이|혹시|다들|우리)(?=\s)/g, ' ').replace(/\s+/g, ' ').trim().replace(/([가-힣]{2,})하기$/, '$1');
  return /^(만나기|보기|가기|오기|하기|되기|같이\s*\S{2}기)$/.test(r) ? '' : r;
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
const INCOME = /(세금\s*계산서\s*발행|계산서\s*발행|계산서\s+\S.{0,24}발행|청구서\s*(발행|보냄|보냈)|받기로|받아야|받을\s*(돈|거|게|예정)|빌려\s*준|빌려\s*줬|빌려\s*줌|들어온대|들어온다|들어올|입금\s*된대|입금\s*(됨|됐|받|예정|확인|완료)|들어옴|들어왔|안\s*들어|미수금|계약금|선금|착수금|잔금|중도금|수금|매출|받음|받았)/;
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
// 화면 이름 → 주소. "회의록", "프롬프트 스튜디오 열어 줘"처럼 화면 이름만 말해도 그리로 감
export const NAV = { 오늘: 'today', 홈: 'today', 비서: 'assistant', 캘린더: 'calendar', 일정: 'calendar', '할 일': 'tasks', 회의: 'meetings', 회의록: 'meetings', 마인드맵: 'board', '마인드맵 회의': 'board', 기획: 'plan', '기획 보드': 'plan',
  프롬프트: 'prompts', '프롬프트 스튜디오': 'prompts', SNS: 'studio', 'SNS 스튜디오': 'studio', 스튜디오: 'studio', 레퍼런스: 'archive', 피그마: 'figma', '피그마 정리': 'figma', 메신저: 'talk', 인맥: 'people', 연락처: 'people', 팀: 'team',
  비용: 'money', '비용 처리': 'money', 지출: 'money', 구매: 'shop', '구매 목록': 'shop', 업체: 'vendors', '업체 목록': 'vendors', 랭킹: 'radar', 지원사업: 'radar', 스타트업: 'startup', 꾸미기: 'look', 설정: 'settings', '자가 점검': 'health',
  대기함: 'inbox', '확인 대기함': 'inbox', 메뉴: 'menu' };
const NAV_RE = new RegExp('^(' + Object.keys(NAV).sort((a, b) => b.length - a.length).map(k => k.replace(/ /g, '\\s*')).join('|') + ')\\s*((?:(?:화면|메뉴|페이지|탭|창)(?:을|를)?)?\\s*(?:으로|로)?\\s*(?:좀\\s*)?(?:열어|가자|가\\s*줘|가\\s*볼래|가고\\s*싶어|들어가|이동|켜|띄워|보여)?\\s*(?:해\\s*)?(?:줘|주세요|줄래)?)\\s*[.!?~]*$', 'i');
const NAV_NOREC = /^(설정|꾸미기|자가점검|메뉴|캘린더|메신저|마인드맵|마인드맵회의|기획보드|프롬프트|프롬프트스튜디오|SNS스튜디오|스튜디오|SNS|피그마|피그마정리|랭킹|스타트업|홈|비서)$/i;   // 기록을 찾는 말일 리 없는 화면 이름
// 화면으로 가자는 말이 분명하면 그 화면 주소, 아니면 null. "설정 화면 보여줘"는 찾는 말이 아니라 가자는 말
export function navPhrase(text) { const t = String(text || '').replace(/\s+/g, ' ').trim(); const m = t.match(NAV_RE); if (!m || !m[2]) return null;
  if (/(화면|메뉴|페이지|탭|창)/.test(m[2]) || /(열어|가자|가\s*줘|가\s*볼래|가고\s*싶어|들어가|이동|켜|띄워)/.test(m[2]) || NAV_NOREC.test(m[1].replace(/\s+/g, ''))) return navTo(m[1]);
  return null; }
// 글 안에 "○○ 화면"이라고 나온 화면들 (비서 답에 "설정 화면에서 바꿀 수 있어요"가 있으면 여는 단추를 붙이려고)
export function screensIn(text) { const out = []; const re = new RegExp('(' + Object.keys(NAV).sort((a, b) => b.length - a.length).map(k => k.replace(/ /g, '\\s*')).join('|') + ')\\s*(?:화면|메뉴|페이지|탭)', 'gi'); let m;
  while ((m = re.exec(String(text || '')))) { const to = navTo(m[1]); if (!out.some(x => x.to === to)) out.push({ name: m[1].replace(/\s+/g, ' '), to }); }
  return out.slice(0, 2); }
const NAV_SHY = /^(오늘|홈|비서|메뉴|구매|업체|랭킹|지원사업)$/;   // 이름만으로는 다른 뜻일 수 있어서 "열어 줘" 같은 말이 붙어야 이동
export function navTo(to) { const k = String(to || '').replace(/\s+/g, ' ').trim(); const hit = Object.keys(NAV).find(x => x.replace(/ /g, '').toLowerCase() === k.replace(/ /g, '').toLowerCase()); return hit ? NAV[hit] : 'today'; }
export function interpret(input, ctx = {}) {
  input = String(input == null ? '' : input).replace(/[ \t]{3,}/g, '  '); input = korMoney(input); input = input.replace(/([월화수목금토일]요일)(?:하고|이랑|랑|과|와|\s*,)\s*(?=[월화수목금토일]요일)/g, '$1 ');
  { const b0 = ctx.base || new Date(); const nm = (b0.getMonth() + 1) % 12 + 1, tm = b0.getMonth() + 1;   // 때를 가리키는 말 가운데 날짜 읽기가 모르는 것들을 아는 꼴로
    input = input.replace(/다음\s*달\s*(?=(첫|둘|셋|넷|다섯|마지막)\s*째?\s*주)/g, nm + '월 ').replace(/이번\s*달\s*(?=(첫|둘|셋|넷|다섯|마지막)\s*째?\s*주)/g, tm + '월 ').replace(/(달|월)\s*말일/g, '$1 말'); if (!/\d\s*월|\d{1,2}[/.]\d{1,2}|\d\s*일(?![가-힣])/.test(input)) { const HD = [['크리스마스\\s*이브|성탄절\\s*전날', '12월 24일'], ['크리스마스|성탄절', '12월 25일'], ['새해\\s*첫날|신정', '1월 1일'], ['삼일절', '3월 1일'], ['어린이날', '5월 5일'], ['현충일', '6월 6일'], ['광복절', '8월 15일'], ['개천절', '10월 3일'], ['한글날', '10월 9일']];
      // 때로 쓴 것만 날짜로 ("크리스마스에 …", "크리스마스 이브 7시 …"). "크리스마스 파티"·"크리스마스 선물"은 그대로
      for (const [k, d] of HD) { const re = new RegExp('(^|\\s)(' + k + ')(?=(에|에는|날|당일|까지)(\\s|$)|\\s+(오전|오후|아침|점심|저녁|밤|낮|\\d{1,2}\\s*시))'); if (re.test(input)) { const [mm, dd] = d.match(/\d+/g).map(Number); const past = mm < b0.getMonth() + 1 || (mm === b0.getMonth() + 1 && dd < b0.getDate()); input = input.replace(re, '$1' + (past ? (b0.getFullYear() + 1) + '년 ' : '') + d); break; } } }
    { const md = n => { const d = new Date(b0); d.setDate(d.getDate() + n); return `${d.getMonth() + 1}월 ${d.getDate()}일`; }; const OFF = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
      input = input.replace(/(^|\s)(오늘|내일|모레)부터\s*(내일|모레|글피)까지(?=\s|$)/g, (m0, pre, a1, b1) => (OFF[b1] > OFF[a1] ? `${pre}${md(OFF[a1])}부터 ${md(OFF[b1])}까지` : m0));   // "내일부터 모레까지 워크숍"
      const dow = (b0.getDay() + 6) % 7;   // 월=0
      input = input.replace(/(^|\s)다음\s*주\s*내내(?=\s|$)/g, (m0, pre) => `${pre}${md(7 - dow)}부터 ${md(11 - dow)}까지`).replace(/(^|\s)이번\s*주\s*내내(?=\s|$)/g, (m0, pre) => (dow < 4 ? `${pre}${md(0)}부터 ${md(4 - dow)}까지` : m0));
      if (/\d{1,2}\s*시(?!간)|오전|오후|아침|저녁|마다|매주/.test(input) && !/(시간당|일당|장당|회당|건당|개당)/.test(input)) input = input.replace(/(^|\s)(평일|주중)(마다|에|엔)?(?=\s)/g, '$1월화수목금').replace(/(^|\s)주말(마다|에도)(?=\s)/g, '$1매주 토일'); }
    input = input.replace(/(^|\s)내년\s*(?=\d{1,2}\s*월)/g, '$1' + (b0.getFullYear() + 1) + '년 ').replace(/(^|\s)(올해|금년)\s*(?=\d{1,2}\s*월)/g, '$1'); }   // 올해 것이 지났으면 내년
  const base = ctx.base || new Date();
  const blk = noticeBlock(input, base, ctx) || bulletBlock(input, base, ctx); if (blk) return blk.map(r => polish({ src: input, ...r }, ctx));
  { const EN = { mon: '월', tues: '화', tue: '화', wednes: '수', wed: '수', thurs: '목', thu: '목', fri: '금', satur: '토', sat: '토', sun: '일' };
    input = input.replace(/\b(by|on|this|next)?\s*(mon|tues|wednes|thurs|fri|satur|sun)day\b/gi, (m0, pre, d) => ` ${/next/i.test(pre || '') ? '다음주 ' : ''}${EN[d.toLowerCase()]}요일${/by/i.test(pre || '') ? '까지' : ''} `).replace(/\s{2,}/g, ' ').trim(); }
  input = input.replace(/^(.*견적\s*(?:받음|받았\S*|나옴|나왔\S*|옴|왔\S*))\s*\(([^)]{2,12})\)\s*$/, '$2 $1');   /* "… 견적 받음 (프린트잇)" */
  /* "포스터 A2 100장 견적 프린트킹 18만원 한솔 16만5천원 대성 15만원 …" → 업체마다 값 하나씩 */
  { const MP = '\\d[\\d,.]*\\s*(?:만\\s*\\d*\\s*천?|천)?\\s*원'; const qm = !/\n/.test(input) && input.match(new RegExp('^(.{2,30}?)\\s*견적\\s*[:：]?\\s+((?:[가-힣A-Za-z]{2,10}(?:은|는)?\\s+' + MP + '\\s*){2,})(.*)$'));
    if (qm) { const item = qm[1].trim(); const outQ = [...qm[2].matchAll(new RegExp('([가-힣A-Za-z]{2,10}?)(?:은|는)?\\s+(' + MP + ')', 'g'))].map(pm => { const nm = (ctx.vendors || []).find(v => v && (v === pm[1] || v.startsWith(pm[1]))) || pm[1]; const v = vendorParts(`${nm} ${item} ${pm[2]}`, ctx.vendors || []); v.name = nm; v.memo = ''; v.prices = [{ item, price: String(parseMoney(pm[2]) || ''), note: '', at: ymd(base) }]; return polish({ kind: 'vendor', label: '업체', confidence: 0.75, src: `${pm[1]} ${item} ${pm[2]}`, data: v }, ctx); });
      const tail = qm[3].trim(); if (tail.length >= 3) outQ.push(polish({ kind: 'note', label: '메모', confidence: 0.55, src: tail, data: { title: tail.slice(0, 60), body: `${item} 견적: ${tail}`, tags: keywords(tail, 4) } }, ctx));
      if (outQ.length >= 2) return outQ; } }
  /* "쿠팡 장바구니: 삼각대, 조명" → 살 것 하나씩 */
  { const bl = !/\n/.test(input) && input.match(/^\s*(?:(쿠팡|다이소|이케아|올리브영|마켓컬리|컬리|네이버|무신사|오늘의집|알리|테무)\s*)?(?:장바구니|살\s*(?:것|거)|사야\s*할\s*(?:것|거)|구매\s*(?:목록|할\s*것)|쇼핑\s*(?:목록|리스트))\s*[:：]\s*(.+)$/);
    if (bl) { const its = bl[2].split(/\s*[,、]\s*|\s+(?:이랑|랑|하고|그리고)\s+/).map(x => x.trim()).filter(x => x.length >= 1 && !/^https?:/.test(x));
      if (its.length >= 2) return its.map(x => { const q = x.match(/\s*(\d+)\s*(개|장|부|세트|박스|롤|통|권|매|팩|봉|병|캔|묶음)\s*$/); const pr = parseMoney(x) || 0; return polish({ kind: 'buy', label: '살 것', confidence: 0.75, src: x, data: { title: (q ? x.slice(0, q.index) : x).replace(/\d[\d,]*\s*(만\s*)?(\d+\s*천\s*)?원/g, ' ').replace(/\s+/g, ' ').trim() || x, url: '', price: pr, qty: q ? +q[1] : 1, need: 'must', ...(bl[1] ? { memo: bl[1] } : {}) } }, ctx); }); } }
  /* "오늘 작업: 포스터 3시간, 영상편집 2시간" → 작업 기록 하나씩 */
  { const wl = !/\n/.test(input) && input.match(/^\s*(오늘|어제|그저께)?\s*(?:작업|한\s*일|작업\s*(?:시간|기록))\s*[:：]\s*(.+)$/);
    if (wl) { const its = wl[2].split(/\s*[,、]\s*/).map(x => x.trim()).filter(Boolean);
      if (its.length >= 2 && its.every(x => /\d+(\.\d+)?\s*(시간|분)/.test(x))) return its.flatMap(x => interpretParts(`${wl[1] || '오늘'} ${x} 작업함`, base, ctx)).map(r => (r.kind === 'timelog' ? r : null)).filter(Boolean); } }
  /* 이어 쓴 말은 토막마다 따로 읽음. 예전 읽기가 이미 그만큼 나눠 읽었으면 예전 것을 씀 */
  const whole = interpretParts(input, base, ctx);
  if (ctx._noDump || (whole.length === 1 && /^(query|nav)$/.test(whole[0].kind) && input.length < 40)) return whole;
  if (whole.length === 1 && whole[0].kind === 'act' && !/\n/.test(input.trim()) && input.length < 160) return whole;   /* 공고 한 줄은 조건(인원·지역)까지 한 항목 */
  let dm = null; try { dm = dump(input, base, ctx); } catch { dm = null; }
  const junk = rs => rs.filter(r => { const tt = String((r.data && (r.data.title || r.data.name)) || ''); return /(니까|는데|다가|[았었였했]고|하고)\s|야됨|야함|했음|었음|그리고|그래서/.test(tt) || tt.length > 30 || (r.kind === 'expense' && tt.replace(/\s/g, '').length <= 2) || r.kind === 'talk'; }).length;
  const fixed = (dm && (dm.strong || dm.length > whole.length || dm.length >= 3 || junk(whole) > junk(dm)) ? dm : whole).flatMap(fixup);
  /* 살 것을 말하던 흐름에서 값만 붙은 물건("… 사야함 그리고 애플펜슬 팁도 쿠팡 8900원")은 쓴 돈이 아니라 살 것 */
  for (let i = 1; i < fixed.length; i++) { const a = fixed[i - 1], b = fixed[i]; if (a.kind === 'buy' && b.kind === 'expense' && b.src && !/(썼|씀|결제|샀|삼$|구매했|구매함|냈|냄$|긁|지출|이체|송금)/.test(b.src) && !parseWhen(b.src, base).hits.length) { let b2 = []; try { b2 = interpretParts(b.src.replace(/^(그리고|또|글고)\s+/, '') + ' 사야함', base, ctx); } catch { b2 = []; } if (b2.length === 1 && b2[0].kind === 'buy') fixed[i] = fixup({ ...b2[0], src: b.src })[0]; } }
  return fixed;
}
/* 뒷손질: "폼보드 5개 마스킹테이프 3개 사야함"은 살 것 둘, 업체 품목 이름의 토씨 떼기 */
function fixup(r) {
  if (r && r.kind === 'vendor' && r.data && Array.isArray(r.data.prices)) for (const pr of r.data.prices) if (pr && typeof pr.item === 'string') pr.item = pr.item.replace(/(^|\s)(인쇄소|사장님|대표님|번호|저장|연락처)(?=\s|$)/g, ' ').replace(/([가-힣])(은|는)(?=\s|$)/g, '$1').replace(/(^|\s)(에서|에|으로|로|같은\s*거|같은거)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() || pr.item;
  if (r && r.kind === 'vendor' && r.data && typeof r.data.memo === 'string' && /^(에\s*)?(하기로\s*(했음|함)|이래|래|이고|이라\s*함)$/.test(r.data.memo.trim())) r.data.memo = '';
  if (r && r.kind === 'expense' && r.data && typeof r.data.title === 'string') { let a = r.data.title, b; do { b = a; a = a.replace(/\s*(에서|긁었음|긁음|(계좌\s*)?이체\s*(했음|함|했어|완료)?|결제\s*(했음|함)|썼음|냈음|주문함|주문했음|구매함|구매했음|샀음|나감|나갔음)\s*$/, '').trim(); } while (a !== b && a); if (a) r.data.title = a; }
  if (r && r.kind === 'contact' && r.data && typeof r.data.org === 'string') r.data.org = r.data.org.replace(/^(어제|오늘|그저께|지난주|저번에)?\s*(\S+에서\s*)?받은\s*/, '').trim();
  if (r && r.kind === 'task' && r.data && /^(그거|이거|저거|그것|이것)$/.test(String(r.data.title || '').trim())) return [];
  if (r && r.kind === 'contact' && r.data) { const TT = /^[가-힣]{1,2}\s*(대리|과장|차장|부장|팀장|실장|대표|이사|사원|주임|매니저|피디|PD|작가|감독|선생)(님)?$/; if (typeof r.data.org === 'string' && TT.test(r.data.org.trim()) && r.data.name && !TT.test(r.data.name)) { const o = r.data.org.trim(); r.data.org = r.data.name; r.data.name = o; } }
  if (r && r.kind === 'task' && r.data && typeof r.data.title === 'string' && r.data.title.length > 3) r.data.title = r.data.title.replace(/(하|가|맡기|당기|미루|옮기|바꾸|보내|만들|잡|정하|올리|넘기)자$/, '$1기').replace(/(끝내|보내|만들|올리|정리하|넘기)고$/, '$1기').replace(/\s*(한대|준대|한다고\s*함|하기로\s*함)$/, '').replace(/([가-힣]{2,})(은|는)$/, (m0, a) => (/(하|되|있|없|같|좋)$/.test(a) ? m0 : a)).replace(/(원|개|장|부)(은|는)(?=\s)/, '$1');
  if (r && r.kind === 'buy' && r.data && typeof r.data.title === 'string') { const SHOP = /(^|\s)(쿠팡|다이소|이케아|올리브영|마켓컬리|컬리|네이버|무신사|오늘의집|알리|테무)(에서|에)?(?=\s|$)/; const sm = r.data.title.match(SHOP); if (sm && r.data.title.replace(SHOP, ' ').trim().length >= 2) { r.data.title = r.data.title.replace(SHOP, ' ').replace(/\s+/g, ' ').trim(); if (!r.data.memo) r.data.memo = sm[2]; }
    const qm = r.data.title.match(/^(.+?)\s*(\d+)\s*(개|장|부|세트|박스|롤|통|권|매|팩|봉|병|캔|묶음)$/); if (qm && (!r.data.qty || r.data.qty === 1)) { r.data.title = qm[1].trim(); r.data.qty = +qm[2]; }
    r.data.title = r.data.title.replace(/([가-힣]{2,})도$/, '$1'); }
  if (!r || r.kind !== 'buy' || !r.data) return [r];
  const src = String(r.src || r.data.title || ''), re = /([가-힣A-Za-z][가-힣A-Za-z0-9 ]*?)\s*(\d+)\s*(개|장|부|세트|박스|롤|통|권|매|팩|봉|병|캔|묶음)(?=\s|,|$)/g, items = []; let m;
  while ((m = re.exec(src))) items.push({ title: m[1].trim(), qty: +m[2] });
  { const lastEnd = (() => { let e = 0, mm; const r2 = new RegExp(re.source, 'g'); while ((mm = r2.exec(src))) e = r2.lastIndex; return e; })(); const tail = src.slice(lastEnd).replace(/(사야\S*|구매\S*|살\s*(거|것)\S*|주문\S*|필요\S*)\s*$/, '').replace(/^[\s,]+|[\s,]+$/g, ''); if (items.length && tail && tail.length <= 14 && !/\d/.test(tail) && !/(에서|쿠팡|다이소)/.test(tail)) items.push({ title: tail, qty: 1 }); }
  if (items.length < 2) return [r];
  return items.map(it => ({ ...r, data: { ...r.data, title: it.title, qty: it.qty, price: 0 } }));
}
function interpretParts(input, base, ctx) {
  const parts = splitCommands(input).flatMap(p => splitChain(p, base, ctx)).flatMap(p => splitList(p, base, ctx)).flatMap(p => splitPeople(p, base, ctx));
  const out = [];
  for (const p of parts) {
    const pre = (p.match(/^\s*(할\s*일|할일|투두|todo)\s*[:：]\s*/i) || [''])[0];
    const days = pre ? null : weekdayList(p);
    if (days) { // "릴스 화목 저녁 7시 업로드" → 요일마다 하나씩. 이어진 날의 휴가는 한 줄로
      const mk = d => interpretOne(p.replace(days.raw, ` ${days.week || (days.repeat && !days.span ? '매주' : '')} ${d}요일 `).replace(/\s+/g, ' '), base, ctx)[0];
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
// ── 이어 쓴 말 나누기 ──
// "…썼고 …해야하고 아 그리고 …"처럼 쉼표도 줄바꿈도 없이 쭉 쓴 말을 토막으로 나눠 토막마다 종류를 가림.
// 토막이 둘 이상 나올 때만 쓰고, 아니면 null(예전 읽기 그대로).
const D_LEAD = /^(?:(?:아|음|어|참)\s+)?(?:그리고|그래서|그러니까|글고|그담에|그\s*다음에?는?|그\s*담에|또|아\s*맞다|아\s*참|참고로|일단|우선|근데|그런데|마지막으로|추가로|아무튼|암튼)(?:\s+|$)/;
const D_FILL = /^(?:아+|음+|어+|흠+|헐|와|아\s*진짜|진짜|아\s*정신\s*없다|정신\s*없다|아\s*몰라|ㅇㅇ|ㅁㅊ|[ㅋㅎㅠㅜ]+)(?:\s+|$)/;
const D_FEEL = /(기분\s*(좋|나쁘|별로)|최악|별로였|망함|개판|힘들|피곤|졸리|졸려|짜증|하기\s*싫|귀찮|미안하|망했|우울|속상|답답|정신\s*없|배고프|배고파|죽겠|행복|신난|신나|뿌듯|다행)/;
const D_DAY = /^(오늘|내일|낼|모레|어제|그저께|(이번|다음|담|지난)\s*주\s*[월화수목금토일]요일|[월화수목금토일](요일|욜)|\d{1,2}월\s*\d{1,2}일|\d{1,2}[/.]\d{1,2})(은|는|에|엔|에는)?$/;
const D_WD = /^([월화수목금토일])(요일|욜)(에|엔|은|는)?$/;
const D_CLOCK = /^(\d{1,2}시(반|\d{1,2}분)?|\d{1,2}:\d{2})(에|엔|부터)?$/;
const D_AMPM = /^(오전|오후|아침|저녁|밤|낮|새벽)$/;
const D_MONEYTOK = /\d[\d,.]*\s*(만|천)?\s*\d*\s*(천)?\s*원(쯤|정도)?$/;
const D_FINAL = /(했음|됐음|있음|없음|썼음|냈음|샀음|받았음|보냈음|줬음|먹었음|갔음|왔음|들어옴|들어왔음|받음|보냄|끝남|끝냄|예정임|[가-힣]야함|[가-힣]야됨|[가-힣]야돼|[가-힣]야해|기로함|기로했음|할거임|갈거임|볼거임|할듯|좋을듯|괜찮을듯|같음|싶음|좋겠음|어떨까|들어온대|온대|간대|한대|된대|준대|이래|했어|됐어|했다|됐다|했어요|해요|입니다|습니다|부탁해|부탁함|부탁드려요|하자|가자|좋다|싫다|[가-힣]{2,}(?<!명|보관|우편|사서|수거|해야|야)함|었음|았음|였음|(?:반차|연차|월차|휴가|출장|외근|재택|휴무)(?:래|이래)|었다|았다|였다|같다|겠다|야지|하네|구나|더라|됨)$/;
const D_FINAL1 = /^(함|했음|했어|했다|됨|됐음|씀|냄|삼|긁음|결제함|이체함|계좌이체함|받음|들어옴|못감|못갔음|못함|못했음)$/;
const D_NOCONT = /^(쯤|정도|이라|라고|라는|해서|때문|인데|이라서|하면|되면|근처|쪽)/;
function dumpClauses(line, base, ctx) {
  const nm = x => { const y = x.replace(/이$/, ''); return known(x, ctx) || known(y, ctx) || isName(x, true) || isName(y, true); };
  // 머리말: "오늘 한거 정리", "내일 일정", "이번주 할거", "… 정리하면", "생각나는대로 적음", "회의 끝 결정된거"
  let headDay = '', headPj = '';
  line = line.replace(/^(.{0,24}?)\s*(관련해서|관련)?\s*정리하면\s+/, (m0, a) => { const pj = (ctx.projects || []).find(n => a.includes(n) || (n.length >= 3 && a.includes(n.split(/\s/)[0]))); if (pj) headPj = pj; return pj ? '' : (a.trim() ? a.trim() + ' ' : ''); })
    .replace(/^(생각나는\s*대로|생각나는대로|떠오르는\s*대로)\s*(적음|적어\s*봄|적을게|씀|메모)\s+/, '').replace(/^(회의|미팅)\s*(끝|끝남|끝났음|결과)\s*(결정된\s*(거|것)|정리)?\s*[:：]?\s+/, '').replace(/^결정된\s*(거|것)\s*[:：]?\s+/, '').replace(/^(.{0,10}?)\s*(준비물|살\s*것|살\s*거|장\s*볼\s*것|쇼핑\s*목록|구매\s*목록)\s*(정리|목록)?\s*[:：]?\s+(?=\S)/, '');
  let todoHead = false, headWeek = '';
  line = line.replace(/^(오늘|어제)?\s*(회의|미팅)\s*(내용|결과)?\s*정리\s+(?=\S)/, '');
  { const xm = line.match(/^(오늘|어제|그저께|이번\s*주|지난\s*주|이번\s*달)?\s*(지출|쓴\s*돈|쓴\s*거|가계부|고정비)\s*(총\s*정리|정리|내역|목록)?\s*[:：]?\s+(?=\S)/); if (xm && /\d/.test(line.slice(xm[0].length))) { if (xm[1] && /^(오늘|어제|그저께)$/.test(xm[1])) headDay = xm[1]; if (xm[1] && /^(이번|지난)\s*주$/.test(xm[1])) headWeek = xm[1].replace(/\s/g, ''); line = line.slice(xm[0].length); } }
  { const hm = line.match(/^(오늘|내일|낼|모레|어제|이번\s*주|다음\s*주|담주|이번\s*달|다음\s*달)?\s*(한\s*(?:거|것|일)|할\s*(?:거|것|일)|할일|투두|일정|스케줄)\s*(정리|목록|대충)?\s*[:：]?\s+(?=\S)/); if (hm && line.length - hm[0].length >= 8 && !/^(이|은|는|도|이랑|뭐|다|너무|많)/.test(line.slice(hm[0].length))) { if (hm[1] && /^(오늘|내일|낼|모레|어제)$/.test(hm[1]) && /^(일정|스케줄|할|투두)/.test(hm[2])) headDay = hm[1]; if (hm[1] && /^(다음\s*주|담주)$/.test(hm[1])) headWeek = '다음주'; todoHead = /^(할|투두)/.test(hm[2]) && !/[,、]/.test(line); line = line.slice(hm[0].length); } }
  let toks = line.split(/\s+/).filter(Boolean); if (toks.length < 3) return { parts: [line], headDay };
  /* "월 클라이언트 미팅 화 촬영 수 편집": 한 글자 요일이 차례대로 셋 이상이면 요일로 */
  { const one = toks.map(x => (/^[월화수목금토일]$/.test(x) ? '월화수목금토일'.indexOf(x) : -1)).filter(x => x >= 0); if (one.length >= 3 && one.every((x, i) => !i || x > one[i - 1])) toks = toks.map(x => (/^[월화수목금토일]$/.test(x) ? x + '요일' : x)); }
  /* "1 작업실 브이로그 2 제작과정 3 현장 스케치": 번호만 붙여 늘어놓은 것 */
  let numHead = '';
  { const ni = toks.map((x, i) => (/^\d[.)]?$/.test(x) ? i : -1)).filter(i => i >= 0); const seq = ni.map(i => parseInt(toks[i], 10)); if (ni.length >= 2 && seq.every((x, i) => x === i + 1) && ni[0] <= 4 && ni.every((x, i) => (ni[i + 1] ?? toks.length) - x >= 2)) { numHead = toks.slice(0, ni[0]).join(' '); const ps = ni.map((x, i) => toks.slice(x + 1, ni[i + 1] ?? toks.length).join(' ')); return { parts: ps.map(x => (numHead ? numHead + ' ' : '') + x), headDay, numbered: true }; } }
  const CF = /^(메일|이메일|전화|번호|연락처|폰|핸드폰|카톡|주소)(은|는|이|가)?$/;   /* 연락처 칸 이름: 여기서는 안 끊음 */
  const isPh = x => /^(01[016789]|02|0[3-6]\d)[-.\s]?\d{3,4}[-.\s]?\d{4}$/.test(x) || /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(x);
  // 늘어놓은 꼴 찾기: 시각이 셋 이상, 요일이 셋 이상, 금액이 둘 이상
  const clockAt = toks.map((x, i) => D_CLOCK.test(x) && !/부터$/.test(x) && !/[~\-]$/.test(toks[i - 1] || '')), nClock = clockAt.filter(Boolean).length;
  const wdAt = toks.map(x => (D_WD.exec(x) || [])[1] || ''); const wdSeq = wdAt.filter(Boolean).map(x => '월화수목금토일'.indexOf(x)); const nWd = wdSeq.every((x, i) => !i || x > wdSeq[i - 1]) ? new Set(wdSeq).size : 0;
  const bare = x => /^\d{1,3}(,\d{3})+$|^\d{4,7}$/.test(x) && !/^(19|20)\d\d$/.test(x);
  const monAt = toks.map(x => D_MONEYTOK.test(x) || bare(x)), nMon = monAt.filter(Boolean).length;
  const moneyList = nMon >= 2 && !/\d\s*(장|개|부|매|권|세트|박스|롤|통|ea)(?![가-힣])|업체|거래처|견적|단가|예산|총|합계|합쳐|부가세|시간당|일당|장당|회당|건당|개당|[+*x×]/i.test(line) && !parsePhone(line);
  const dayAt = toks.map((x, i) => /^\d{1,2}일(에|엔|은|는)?$/.test(x) && !/부터$/.test(toks[i - 1] || '') && !/^(이틀|\d+박)$/.test(toks[i - 1] || '')), nDay = dayAt.filter(Boolean).length;
  const topicAt = toks.map((x, i) => /^[가-힣A-Za-z0-9]{2,8}(은|는)$/.test(x) && !/^(오늘은|내일은|모레는|나는|저는|이건|그건|저건|이번에는|다음에는|다음은|지금은|요즘은|원래는|사실은|일단은|우선은|같은|좋은|많은|작은|높은|낮은|없는|있는|하는|되는|가는|오는|주는|받는)$/.test(x) && !D_DAY.test(x) && !CF.test(x));
  const nTopic = topicAt.filter(Boolean).length;
  if (nWd >= 3 || nClock >= 2) todoHead = false;
  const pAt = toks.map((x, i) => { if (/^(나는|내가)$/.test(x)) return 'me'; const b = x.replace(/(이는|는|은)$/, ''); const nm = (ctx.people || []).find(n => n === b || n.slice(1) === b); return nm && toks[i + 1] && !/^(이랑|랑|하고|한테|에게|와|과)/.test(toks[i + 1]) ? nm : ''; });
  const fP = pAt.findIndex(Boolean); const nP = fP >= 0 && nTopic < 2 && nClock === 0 && parseMoney(toks.slice(fP).join(' ')) == null && !monAt.slice(fP).some(Boolean) && !LEAVE.test(line) && !parsePhone(line) ? pAt.filter(Boolean).length : 0;
  const out = []; let cur = [];
  const content = a => a.filter(x => !D_DAY.test(x) && !D_AMPM.test(x) && !D_CLOCK.test(x)).join('').length;
  const cut = () => { if (cur.length) out.push(cur.join(' ')); cur = []; };
  const R = right => parseWhen(right, base).hits.length > 0 || parseMoney(right) != null || /(해야|야\s*(됨|함|돼|해)|하기|부탁|보내|사야|올리|만들|받아야|받아보|알아보|가야|맡기|들르|정리|수정|확인|예약|준비)/.test(right);
  for (let i = 0; i < toks.length; i++) {
    let tk = toks[i]; const rest = toks.slice(i + 1), right = rest.join(' '), more = rest.length >= 1 && right.replace(/\s/g, '').length >= 3;
    // 앞에서 끊기: 이음말, 늘어놓은 시각·요일·주제
    if (cur.length && content(cur) >= 2) {
      if (D_LEAD.test(toks.slice(i).join(' ')) && !/^(또|일단|우선)$/.test(tk)) cut();
      else if (nClock >= 3 && ((clockAt[i] && !D_AMPM.test(toks[i - 1] || '')) || (D_AMPM.test(tk) && clockAt[i + 1]))) cut();
      else if (nWd >= 3 && wdAt[i] && !wdAt[i - 1] && !/(로|으로)$/.test(toks[i + 1] || '')) cut();
      else if (nTopic >= 2 && topicAt[i] && topicAt.slice(0, i).some(Boolean) && cur.length >= 2) cut();
      else if (nP >= 2 && pAt[i]) cut();
      else if (/^(다음|담)$/.test(tk) && /^(회의|미팅)(는|은)?$/.test(toks[i + 1] || '') && cur.length >= 2) cut();
      else if (topicAt[i] && cur.some(x => D_CLOCK.test(x)) && /까지\s*$/.test(right) && parseWhen(right, base).hits.length) { const carry = cur.filter(x => !D_DAY.test(x) && !D_AMPM.test(x) && !D_CLOCK.test(x) && !/^\d{1,2}(월|일)$/.test(x) && !/^(다음|이번|담)\s*주$/.test(x)).slice(-3); cut(); cur.push(...carry); tk = tk.replace(/(은|는)$/, ''); }   /* "… 설명회 참석 | 신청은 12월 5일까지" */
      else if (/^(이번|다음|담)\s*주\s*목표/.test(toks.slice(i).join(' ')) && cur.length >= 2) cut();
      else if (cur.some(x => D_CLOCK.test(x)) && content(cur) >= 4 && /까지$/.test(toks[i + 1] || '') && parseWhen(toks[i + 1], base).hits.length && !topicAt[i] && /[가-힣]{2,}$/.test(tk) && !D_DAY.test(tk)) cut();   /* "… 3시 최종 PT | 발표자료 월요일까지 완성" */
      else if (topicAt[i] && cur.some(x => /까지$/.test(x)) && cur.length >= 3) cut();   /* "… 월요일까지 완성 | 리허설은 화요일 저녁" */
      else if (wdAt[i] && cur.some(x => /부터$/.test(x)) && cur.some(x => /까지$/.test(x)) && content(cur) >= 2) cut();   /* "월요일부터 수요일까지 제주도 출장 | 화요일 2시에 현지 미팅" */
      else if (nDay >= 3 && /^\d{1,2}일부터$/.test(tk) && !/^\d{1,2}월$/.test(toks[i - 1] || '')) cut();
      else if (nDay >= 3 && ((dayAt[i] && !/^\d{1,2}월$/.test(toks[i - 1] || '')) || (/^\d{1,2}월$/.test(tk) && dayAt[i + 1]))) cut();   /* "12월 5일 팝업 오픈 12일 룩북 촬영 20일 송년회" */
      else if (nClock >= 2 && /^\d{1,2}시(반|\d{1,2}분)?까지$/.test(tk) && cur.some(x => D_CLOCK.test(x))) cut();
      else if (/^(그전에|그전까지)$/.test(tk) || (tk === '그' && /^(전에|전까지)$/.test(toks[i + 1] || ''))) cut();
      else if (nClock >= 2 && /^(아침|점심|저녁|밤)(에|엔|은|는)?$/.test(tk) && !clockAt[i + 1] && rest.length >= 1) cut();
      else if (cur.some(isPh) && (D_DAY.test(tk) || /^(다음|담|이번|다다음)\s*주|^(다음|담|이번)$/.test(tk)) && parseWhen(toks.slice(i).join(' '), base).hits.length && rest.length >= 1) cut();   /* "… 010-2222-3333 | 다음주 수요일 미팅 잡기로 함" */
    }
    let end = false;
    if (more && !D_NOCONT.test(rest[0])) {
      let m;
      if ((m = tk.match(/^(.*?)(썼|냈|샀|긁었|결제했|이체했|보냈|받았|들어왔|입금됐|입금했|먹었|마셨|갔|왔|잡았|정했|줬|끝냈|했|됐)고$/))) { tk = m[1] + m[2] + '음'; end = true; }
      else if ((m = tk.match(/^(.*야)\s*(되|하|돼)고$/))) { tk = m[1] + (m[2] === '하' ? '함' : '됨'); end = true; }
      else if ((m = tk.match(/^(.*야)\s*(되|하)는데$/)) && !/(알려|까먹|잊|모르겠|시간이)/.test(right)) { tk = m[1] + (m[2] === '하' ? '함' : '됨'); end = true; }
      else if ((m = tk.match(/^(.*?)(있|없)고$/)) && !/(재미|맛|멋|관심)$/.test(m[1])) { tk = m[1] + m[2] + '음'; end = true; }
      else if ((m = tk.match(/^(.*)하고$/)) && /\d+(\.\d+)?\s*(시간|분)/.test(cur.join(' ')) && /\d+(\.\d+)?\s*(시간|분)/.test(right)) { tk = m[1] + '함'; end = true; }   /* "4시간 포스터 작업하고 2시간 영상 편집함" */
      else if ((m = tk.match(/^(.*(?:왔|갔|했|봤|받았|만났|끝났))(는데|다가)$/))) { tk = m[1] + '음'; end = true; }
      else if ((m = tk.match(/^(.*[았었였했냈갔왔썼샀])으니까$/))) { tk = m[1] + '음'; end = true; }
      else if ((m = tk.match(/^(\d{1,2}일|[월화수목금토일]요일|내일|오늘|모레)(?:이)?니까$/))) { tk = m[1]; end = true; }
      else if ((m = tk.match(/^(반차|연차|월차|휴가|출장|외근|재택)(?:이)?고$/))) { tk = m[1]; end = true; }
      else if ((m = tk.match(/^(.*(?:생일|휴가|출장|회의|미팅|마감|촬영|행사|휴무))이라(?:서)?$/)) && !/(안\s*됨|못\s*함|못\s*감|불가|바쁨|힘듦|안\s*돼|못\s*해)/.test(right)) { tk = m[1]; end = true; }
      else if ((m = tk.match(/^(.*까지)니까$/))) { tk = m[1]; end = true; }
      else if (tk === '확정' && cur.length >= 2 && rest.length >= 2) end = true;
      else if (moneyList && /^(결제|납부|출금)$/.test(tk) && parseMoney(cur.join(' ')) != null) end = true;
      else if (tk === '들렀다가' && cur.length) { tk = '들르기'; end = true; }
      else if (cur.some(x => D_CLOCK.test(x)) && /(미팅|회의|촬영|답사|발표|PT|면담|상담)$/.test(tk) && rest.length >= 2 && TASKEND.test(rest[rest.length - 1]) && !parseWhen(right, base).hits.length) end = true;   /* "2시에 현지 미팅 | 숙소 예약 필요" */
      else if (moneyList && monAt[i] && topicAt[i + 1]) end = true;
      else if (tk === '이고') { tk = ''; end = !CF.test(rest[0]); }
      else if ((m = tk.match(/^(.*(?:\d\s*(?:만|천)?\s*(?:원|개|장|부|명|시|분|일)|담당자|담당|대리|과장|팀장|실장|대표|작가|감독|님))(?:이)?고$/)) && m[1].length >= 2 && !/^(창고|광고|참고|보고|경고|원고|공고|최고|사고|재고)$/.test(tk)) { tk = m[1]; end = !CF.test(rest[0]); }
      else if ((m = tk.match(/^(.*(?:겠|같|싶))고$/)) && m[1].length >= 2) { tk = m[1] + '음'; end = true; }
      else if (todoHead && (TASKEND.test(tk) || /(편집|촬영|미팅|회의|연락|전화|결제|주문|구매|청소|운동|공부|연습|완성|마무리)$/.test(tk)) && !/^(하기|해야|하고|및|관련|까지)/.test(rest[0])) end = true;
      else if ((m = tk.match(/^(.*[가-힣A-Za-z0-9]{2,})하고$/)) && !nm(m[1]) && !/^(광고|참고|보고|경고)/.test(tk.slice(-4)) && R(right)) { tk = parseWhen(cur.concat(tk).join(' '), base).time ? m[1] : m[1] + '하기'; end = true; }
      else if ((m = tk.match(/^(가|들르|올리|보내|만들|받|찍|챙기|맡기|먹)고$/)) && R(right) && cur.length) { tk = m[1] + '기'; end = true; }
      else if (/^(쓰고|내고)$/.test(tk) && parseMoney(cur.join(' ')) != null) { tk = tk === '쓰고' ? '썼음' : '냈음'; end = true; }
      else if (D_FINAL.test(tk) || (D_FINAL1.test(tk) && cur.length)) end = true;
      else if (/^(했|됐)(음|어|다)$/.test(tk)) end = true;
      else if (moneyList && monAt[i] && monAt.slice(i + 1).some(Boolean) && !/^(중|중에|가운데|매달|매월|매주|매년|법카|법인카드|개인카드|개카|카드|현금|계좌이체|이체|결제|긁|썼|씀|쓰고|냈|냄|내고|샀|삼|사고|지출|들었|나옴|나왔|줬|줌|보냈|보냄)/.test(rest[0])) end = true;
    }
    if (nP >= 2 && pAt[i] && !cur.length) { cur.push('할일:'); tk = pAt[i] === 'me' ? '' : `${pAt[i].length === 3 ? pAt[i].slice(1) : pAt[i]}${(pAt[i].charCodeAt(pAt[i].length - 1) - 0xac00) % 28 ? '이' : ''}는`; }
    if (end && rest.length <= 2 && parseMoney(right) != null && parseMoney(cur.concat(tk).join(' ')) == null && !/(사야|살\s*거)/.test(cur.concat(tk).join(' '))) end = false;   /* "… 주문함 4만7천원": 값만 남는 토막은 떼지 않음 */
    if (tk && moneyList && bare(tk)) tk += '원';
    if (tk && headWeek && D_WD.test(tk)) tk = headWeek + ' ' + tk;
    if (tk) cur.push(tk);
    if (end) cut();
  }
  cut();
  return { parts: todoHead ? out.map(x => '할일: ' + x) : out, headDay, moneyList, todoHead, headPj };
}
export function clauses(input, ctx = {}) { return dumpClauses(korMoney(String(input || '')), ctx.base || new Date(), ctx).parts; }
function dump(input, base, ctx) {
  if (/https?:\/\//.test(input) && input.length < 80) return null;
  if (/^\s*(회의록|회의\s*(내용|정리|메모)|미팅\s*(내용|정리|메모))\s*[:：)]/.test(input)) return null;
  if (isBlock(input)) return null;
  if (/^\s*(오늘|어제)?\s*(완료한|끝낸|마친|다\s*한)\s*(거|것|일)\s*[:：]?\s+\S/.test(input)) return null;
  const lines = input.split(/\n+/).map(x => x.trim()).filter(Boolean); if (lines.length > 12 || input.length > 900) return null;
  let parts = [], headDay = '', payAll = '', strong = false, headPj = '', rewrote = false;
  for (let ln of lines) {
    // 맨 끝의 "다 개인카드", "전부 법카로"는 모든 금액 토막에
    const pa = ln.match(/\s+(?:다|전부|모두|둘\s*다|셋\s*다)\s+(개인\s*카드|법인\s*카드|법카|개카|현금|계좌\s*이체)(?:로|으로)?(?:\s*(?:씀|결제|결제함|긁음|냄))?\s*$/); if (pa) { payAll = pa[1]; ln = ln.slice(0, pa.index); }
    if (lines.length > 1 && D_DAY.test(ln.replace(/\s+/g, '')) ) { headDay = ln.trim(); strong = true; continue; }   /* 날짜만 있는 줄은 아래 줄들의 날짜 */
    if (strong) ln = ln.replace(/^(아침|점심|저녁)\s+([가-힣]{2,4})$/, (m0, meal, nm) => !(known(nm, ctx) || isName(nm, true)) ? m0 : `${nm}${(nm.charCodeAt(nm.length - 1) - 0xac00) % 28 ? '이' : ''}랑 ${meal}`);
    const c = dumpClauses(ln, base, ctx); if (c.headDay) headDay = c.headDay; if (c.todoHead && c.parts.length >= 2) strong = true; if (c.headPj) headPj = c.headPj;
    parts.push(...c.parts);
  }
  // 다듬기: 이음말·군말 떼기, 날짜뿐인 토막은 다음 토막 앞에
  const clean = x => { let y = x.trim(), z; do { z = y; y = y.replace(D_LEAD, '').replace(D_FILL, '').trim(); } while (y !== z); y = y.replace(/\s+(아|음|어)$/, '').replace(/(^|\s)(귀찮다|귀찮음|하기\s*싫다|하기싫다|짜증난다|힘들다)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/면\s*되고$/, '면 됨').replace(/(보러\s*갈|갈|할|볼)\s*거임$/, (m0, a) => (a === '할' ? '하기' : a === '볼' ? '보기' : a === '갈' ? '가기' : '보러 가기'));
    if (/까지/.test(y)) y = y.replace(/([가-힣])으면\s*(됨|돼|된다|됩니다)$/, '$1기').replace(/([가-힣])면\s*(됨|돼|된다|됩니다)$/, '$1기').replace(/(^|\s)(이쪽|그쪽|여기|거기)(으로|로)(?=\s)/, '$1');
    /* "서연이한테 견적서 금요일까지 보내라고 해야함" → 서연 할 일 */
    { const tm = y.match(/^([가-힣]{2,4}?)(이)?(?:한테|에게)\s+(.+?)(?:으)?라고\s*(?:해야\S*|말해야\S*|전해야\S*|시켜야\S*|하기|함|해야겠\S*)$/); if (tm && (known(tm[1], ctx) || isName(tm[1], true))) y = `할일: ${tm[1]}${(tm[1].charCodeAt(tm[1].length - 1) - 0xac00) % 28 ? '이' : ''}는 ${/달$/.test(tm[3].trim()) ? tm[3].trim().replace(/\s*달$/, '').replace(/(^|\s)좀(?=\s)/g, '$1').replace(/\s+/g, ' ') + ' 주기' : tm[3].trim() + '기'}`; }
    /* 번호·메일이 든 토막: 칸 이름과 토씨를 뗌 */
    if (parsePhone(y) || parseEmail(y)) y = y.replace(/(^|\s)(메일|이메일|전화|번호|연락처|폰|핸드폰)(은|는|이|가)?(?=\s)/g, ' ').replace(/([가-힣])(은|는)(?=\s)/g, '$1').replace(/\s+/g, ' ');
    else if (y.split(/\s+/).length >= 3) y = y.replace(/^([가-힣A-Za-z0-9]{2,10}|[가-힣A-Za-z0-9]{1,9}[^로에을를가이도와과의\s]\s[가-힣A-Za-z0-9]{2,8})(은|는)(\s+)(?=\S)/, (m0, a, b, c) => (/(같|좋|많|작|높|낮|없|있|하|되|가|오|주|받|쓰|보|드|리|르|우|내|이)$/.test(a) || known(a.replace(/이$/, ''), ctx) || isName(a.replace(/이$/, ''), true) ? m0 : a + c));
    return y.trim(); };
  parts = parts.map(clean).filter(x => x.replace(/\s/g, '').length >= 2);
  { const mg = []; let hold = ''; for (const x of parts) {
      const bare = parseWhen(x, base).hits.reduce((a, hh) => a.replace(hh, ' '), x).replace(/(까지|안에|중에|에|엔)(?=\s|$)/g, ' ').trim();
      if (mg.length && !hold && (/^\([^)]*\)$/.test(x.trim()) || (!bare && /(까지|안에|중으로|내로)\s*$/.test(x)))) { mg[mg.length - 1] += ' ' + x; continue; }
      if (mg.length && !hold && parseWhen(x, base).hits.length && bare && bare.split(/\s+/).length === 1 && !parseWhen(mg[mg.length - 1], base).hits.length && /(야함|야됨|야해|야돼|하기|가기)$/.test(mg[mg.length - 1]) && PLACE_RE.test(bare)) { mg[mg.length - 1] = `${x}에서 ${mg[mg.length - 1]}`; strong = true; rewrote = true; continue; }   /* "… 가야함 | 금요일 오전 10시 서울대병원" */
      if (mg.length && !hold && !/\s/.test(x.trim()) && !parseWhen(x, base).hits.length && parseMoney(x) == null && ((ctx.vendors || []).some(v => v === x.trim()) || PLACE_RE.test(x.trim()))) { mg[mg.length - 1] += ' ' + x.trim(); continue; }   /* "… 찾으러 가야함 | 한솔인쇄" */
      { const hs = parseWhen(x, base).hits; if (mg.length && !hold && hs.length && /^(해야지|해야함|해야됨|하기|할\s*거|할거임|할\s*예정|할게)$/.test(bare) && !parseWhen(mg[mg.length - 1], base).hits.length) { mg[mg.length - 1] += ' ' + hs.join(' ') + '까지'; continue; } }   /* "… 받아야함 | 12월 말까지", "… 받음 | (프린트잇)" */
      if (x.split(/\s+/).every(t => D_DAY.test(t) || D_AMPM.test(t))) { hold = (hold + ' ' + x).trim(); continue; } mg.push((hold ? hold + ' ' : '') + x); hold = ''; } if (hold && mg.length) mg[mg.length - 1] += ' ' + hold; parts = mg; }
  if (parts.length < 2 && !(headDay && parts.length) && !payAll && !rewrote) return null;
  if (parts.length < 2 && lines.length < 2 && !payAll && !rewrote) return null;
  // 날짜 물려주기
  let lastDay = '', lastWasMoney = false, lastMonth = ''; const feel = [];
  parts = parts.map(x => {
    { const mm = x.match(/(\d{1,2})월/); if (mm) lastMonth = mm[1] + '월'; else if (lastMonth && /^\d{1,2}일/.test(x)) x = lastMonth + ' ' + x; }
    const w = parseWhen(x, base); const dayHit = w.hits.find(h => !isTimeHit(h)); const hasMoney = parseMoney(x) != null;
    let y = x.replace(/(^|\s)그\s*전에(?=\s|$)/, '$1그전까지').replace(/(^|\s)그\s*(전|때)까지(?=\s|$)/, (m0, pre) => (lastDay ? `${pre}${lastDay.replace(/(에|엔|은|는|에는)$/, '')}까지` : m0));
    if (!dayHit && y === x) { if (headDay && !/까지/.test(x)) y = headDay + ' ' + x; else if (lastDay && w.hits.length && w.hits.every(isTimeHit)) y = lastDay + ' ' + x; else if (lastDay && hasMoney && lastWasMoney && !w.hits.length) y = lastDay + ' ' + x; }
    if (dayHit) lastDay = dayHit; lastWasMoney = hasMoney;
    if (payAll && hasMoney && !/(카드|법카|현금|이체)/.test(y)) y += ' ' + payAll;
    return y;
  });
  const out = [];
  for (const x of parts) {
    let rs; try { rs = interpretParts(x, base, ctx); } catch { rs = []; }
    // 값 정보뿐인 토막("4만원쯤 하더라 쿠팡에서")은 앞의 살 것에 붙임
    if (out.length && out[out.length - 1].kind === 'buy' && parseMoney(x) != null && /(쯤|정도|하더라|이래|한대)/.test(x) && !/(썼|냈|샀|결제|긁)/.test(x)) { const b = out[out.length - 1]; if (!b.data.price) b.data.price = parseMoney(x); b.src = (b.src + ' ' + x).trim(); continue; }
    if (D_FEEL.test(x) && parseMoney(x) == null && !/(해야|야지|부탁|까지|하기로|\d\s*시)/.test(x)) { feel.push(x); continue; }
    if (/(으로|로)\s*(당기자|미루자|옮기자|바꾸자)\s*$/.test(x)) { out.push(polish({ kind: 'task', label: '할 일', confidence: 0.6, src: x, data: { title: x.replace(/자\s*$/, '기').replace(/^([가-힣A-Za-z0-9 ]{2,12}?)(은|는)\s+/, '$1 ').slice(0, 60), due: '', who: '', tags: [] } }, ctx)); continue; }
    if (rs.length === 1 && rs[0].kind === 'expense' && out.some(o => o.kind === 'buy') && !/(썼|씀|결제|샀|삼$|구매했|구매함|냈|냄$|긁|지출|이체|송금)/.test(x) && !parseWhen(x, base).hits.length) { let b2; try { b2 = interpretParts(x + ' 사야함', base, ctx); } catch { b2 = []; } if (b2.length === 1 && b2[0].kind === 'buy') { out.push({ ...b2[0], src: x }); continue; } }
    if (rs.length === 1 && rs[0].kind === 'task' && !rs[0].data.due && /(있음|없음|왔음|나옴|나왔음|됐음|이래)$/.test(x) && !/(해야|하기|부탁|까지|달래|필요|요청)/.test(x)) { out.push(polish({ kind: 'note', label: '메모', confidence: 0.55, src: x, data: { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue; }
    if (parseMoney(x) == null && /(가|이)\s*(삼|샀음|쏨|쐈음|냄|냈음|사줌|사\s*줬음|계산함)$/.test(x)) { out.push(polish({ kind: 'note', label: '메모', confidence: 0.55, src: x, data: { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue; }
    if (rs.length > 1 && RATE.test(x) && !/(썼|씀|결제|샀|냈|긁|이체|송금)/.test(x)) { out.push(polish({ kind: 'note', label: '메모', confidence: 0.6, src: x, data: { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue; }   /* "평일 시간당 4만원 주말 6만원": 값 안내는 메모 하나 */
    if (rs.length === 1 && rs[0].kind === 'contact' && (!rs[0].data.name || /(하면|하기|해서|됨|함|예약|문의|연락)$/.test(rs[0].data.name))) { out.push(polish({ kind: 'note', label: '메모', confidence: 0.55, src: x, data: { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue; }
    if (rs.length === 1 && /^(event|task)$/.test(rs[0].kind) && /(통화했음|다녀왔음|했음|갔음|왔음|봤음|만났음|받아왔음)$/.test(x) && !/\d\s*시|까지|해야|기로\s*했음/.test(x)) { out.push(polish({ kind: 'note', label: '메모', confidence: 0.55, src: x, data: { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue; }
    if (rs.length === 1 && rs[0].kind === 'task' && /^(꼭\s*)?(보내주기|보내기|주기|하기|끝내기|해두기|해놓기)$/.test(rs[0].data.title || '') && rs[0].data.due && out.length && out[out.length - 1].kind === 'task' && !out[out.length - 1].data.due) { out[out.length - 1].data.due = rs[0].data.due; continue; }   /* "… 달라고 함 | 오늘 안에 보내주기" */
    /* "오늘 운동 못감 | 내일은 꼭 가기": 움직씨만 남은 할 일은 앞 토막의 이름씨를 물려받음 */
    if (rs.length === 1 && rs[0].kind === 'task' && /^(꼭\s*)?(가기|하기|보내기|내기|받기|오기|끝내기)$/.test(rs[0].data.title || '') && parts.indexOf(x) > 0) { const pv = parts[parts.indexOf(x) - 1]; const ob = parseWhen(pv, base).hits.reduce((a, hh) => a.replace(hh, ' '), pv).trim().split(/\s+/).slice(0, -1).join(' ').replace(/(은|는|을|를|이|가|도)$/, ''); if (ob && ob.length <= 12) rs[0].data.title = ob + ' ' + rs[0].data.title.replace(/^꼭\s*/, ''); }
    for (const r of rs) {
      if (r.kind === 'talk' || r.kind === 'query') {
        if (D_FEEL.test(x) || x.replace(/\s/g, '').length < 5 || /^[ㄱ-ㅎㅏ-ㅣ\s.!?~]+$/.test(x)) { feel.push(x); continue; }
        if (r.kind === 'query' && /[?？]\s*$/.test(x) && !/(어떨까|좋을까|할까|괜찮을까)\s*[?？]*$/.test(x)) { out.push(r); continue; }
        const idea = /(어떨까|좋을\s*듯|좋을듯|괜찮을\s*듯|괜찮을듯|좋겠|하면\s*좋|면\s*어때|는\s*거\s*어때|아이디어)/.test(x);
        out.push(polish({ kind: idea ? 'idea' : 'note', label: idea ? '아이디어' : '메모', confidence: 0.55, src: x, data: idea ? { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } : { title: x.slice(0, 60), body: x, tags: keywords(x, 4) } }, ctx)); continue;
      }
      out.push(r);
    }
  }
  if (!out.length) return null;
  // 거의 다 느낌을 적은 글이면 통째로 메모 하나
  const diary = parts.filter(x => /(었다|았다|였다|같다|겠다|야지|하네|구나|더라|했다)$/.test(x)).length;
  if (feel.length && (feel.length >= out.length || diary * 2 >= parts.length)) return Object.assign([polish({ kind: 'note', label: '메모', confidence: 0.5, src: input, data: { title: input.trim().slice(0, 40), body: input.trim(), tags: keywords(input, 4) } }, ctx), ...out.filter(r => r.kind === 'task' && r.data.due).slice(0, 2)], { strong: true });
  if (headPj) for (const r of out) if (r.data && !r.data.project && /^(task|event|expense|income|note|idea|sns|timelog)$/.test(r.kind)) r.data.project = headPj;
  /* "프린트킹은 같은거 14만원이래": 앞 업체와 같은 품목 */
  for (let i = 1; i < out.length; i++) { const a = out[i - 1], b = out[i]; if (a.kind === 'vendor' && b.kind === 'vendor' && /같은/.test(b.src || '') && a.data.prices && a.data.prices[0] && b.data.prices && b.data.prices[0]) b.data.prices[0].item = a.data.prices[0].item; }
  if (strong || payAll) out.strong = true;
  return out;
}
// 뒤 조각에 시각만 있으면 앞 조각의 날짜를 물려줌: "내일 10시 미팅하고 3시에 답사" → 답사도 내일
// 시각만 있는 조각, 날짜 없는 금액 조각("어제 점심 9000원, 커피 4500원")은 앞 조각의 날짜를 따라감
function carryDate(prev, cur, base) { const cw = parseWhen(cur, base); if (cw.hits.length ? !cw.hits.every(isTimeHit) : parseMoney(cur) == null) return cur; const dh = parseWhen(prev, base).hits.find(x => !isTimeHit(x)); return dh ? `${dh} ${cur}` : cur; }
const known = (w, ctx) => (ctx.people || []).some(n => n && (n === w || n.slice(1) === w));
// 쉼표로 늘어놓은 여러 건: 조각마다 날짜·시각·금액이 있거나, 조각마다 사람으로 시작할 때만 나눔
function splitList(p, base, ctx) {
  if (p.length > 200 || /https?:\/\//.test(p) || /^\s*(업체|거래처)\s*[:：]/.test(p)) return [p];
  p = p.replace(/(\d\s*원)\s*(?:썼고|냈고|샀고|긁었고|결제했고|결제하고|쓰고|내고)\s+(?=[^,]{1,24}?\d[\d,]*\s*(?:만\s*)?(?:천\s*)?원)/g, '$1 결제, ').replace(/(\d\s*원)(?:이랑|하고|이고)\s+(?=[^,]{1,20}?\d[\d,]*\s*(?:만\s*)?(?:천\s*)?원)/g, '$1, ');   // "점심 9000원이랑 커피 4500원"
  // "인건비 민서 80만원 서연 80만원", "소품 대여 5만원 보증금 10만원": 쉼표 없이 이어 쓴 금액들
  if (!/,/.test(p) && (p.match(new RegExp(MONEY_SRC, 'g')) || []).filter(z => /\d/.test(z) && /원/.test(z)).length >= 2 && !/\d\s*(장|개|부|매|권|세트|박스|롤|통|ea)(?![가-힣])|업체|거래처|견적|단가|인쇄|제작|예산|총|합계|합쳐|부가세|[+\-*x×]/i.test(p))
    p = p.replace(new RegExp('(' + MONEY_SRC + ')\\s+(?=[가-힣A-Za-z]{2,8}\\s+\\d[\\d,.]*\\s*(?:만\\s*)?(?:\\d+\\s*천\\s*)?원)', 'g'), (m0, a) => (/\d/.test(a) && /원$/.test(a.trim()) ? a.trim() + ', ' : m0));
  // "할 일: 로고 수정, 포스터 인쇄, 견적서 발송", "내일 할 일 로고 수정이랑 포스터 인쇄": 늘어놓은 할 일은 하나씩 (앞의 때와 맨 뒤 마감은 모두에게)
  p = p.replace(/^\s*(할\s*일|할일|투두)\s*(추가|등록|넣어\s*줘|적어\s*줘)\s*[:：]\s*/, '할 일: ');   // "할 일 추가: 견적서"
  { const ow = p.match(/^\s*([가-힣]{2,3}?)(이|의)?\s+(?:할\s*일|할일)\s*[:：]\s*(.+)$/);   // "민서 할 일: 포스터, 리플렛" → 민서 할 일 둘
    if (ow && (known(ow[1], ctx) || isName(ow[1], true))) { const its = ow[3].split(/\s*,\s*|\s+그리고\s+/).map(x => x.trim()).filter(x => x.length >= 2); const jong = (ow[1].charCodeAt(ow[1].length - 1) - 0xac00) % 28; if (its.length >= 1 && its.length <= 8) return its.map(x => `할일: ${ow[1]}${jong ? '이' : ''}는 ${x}`); } }
  { const tl = p.match(/^\s*((?:\S+\s+){0,3}?)(?:할\s*일|할일|투두|todo|해야\s*할\s*(?:일|것))(?:은|는|이|들)?\s*(?:[:：]\s*|\s+)(.+)$/i); const pre = tl ? tl[1].trim() : '';
    const wk = /^(이번\s*주|다음\s*주|금주|담주|이번\s*달|다음\s*달)$/.test(pre);
    if (tl && (!pre || wk || (parseWhen(pre, base).hits.join('').replace(/\s/g, '').length >= pre.replace(/[\s에은는]/g, '').length - 1 && parseWhen(pre, base).hits.length))) {
      const bare = x => parseWhen(x, base).hits.reduce((y, hh) => y.replace(hh, ' '), x).replace(/까지|부터/g, ' ').replace(/\s/g, '');
      let its = tl[2].split(/\s*,\s*|\s+그리고\s+|\s*\/\s*/).flatMap(x => { const m2 = x.match(/^(.{2,}?)(?:이랑|랑|하고)\s+(.{2,})$/); return m2 && !known(m2[1], ctx) && !isName(m2[1], true) ? [m2[1], m2[2]] : [x]; }).map(x => x.trim()).filter(Boolean);
      if (its.length >= 2 && its.length <= 8 && its.every(x => bare(x).length >= 2) && parseMoney(p) == null) { const dl = its[its.length - 1].match(/(?:\S+\s+)?\S+까지\s*$/); const dh = dl && parseWhen(dl[0], base).date ? parseWhen(dl[0], base).hits.join(' ') + '까지' : '';
        return its.map(x => '할일: ' + (pre && !parseWhen(x, base).hits.length && !(wk && dh) ? pre + (wk ? '까지 ' : ' ') : '') + x + (dh && !parseWhen(x, base).hits.length && (!pre || wk) ? ' ' + dh : '')); } } }
  // "회의록: 로고 B안 확정, 포스터 민서 금요일까지": 회의에서 나온 것을 쉼표로 늘어놓은 것은 하나씩 따로
  { const mh = p.match(/^\s*(?:회의록|회의\s*결과|회의\s*정리|회의\s*내용|결정\s*사항|정한\s*것)\s*[:：]\s*(.+)$/s);
    if (mh) { const ms = mh[1].split(/\s*,\s+|\s+\/\s+|\s*;\s*/).map(x => x.trim()).filter(x => x.length >= 2); if (ms.length >= 2 && ms.length <= 8) return ms.map(x => x.replace(/([가-힣A-Za-z0-9])\s+(확정|결정)$/, (m0, c, v) => { const k = c.charCodeAt(0); const j = k >= 0xAC00 && k <= 0xD7A3 ? (k - 0xAC00) % 28 : 0; return c + (j && j !== 8 ? '으로 ' : '로 ') + v; })); } }
  const segs = p.split(/\s*,\s+|\s+\/\s+/).map(x => x.trim()).filter(Boolean); if (segs.length < 2 || segs.length > 6) return [p];
  const lead = x => /^(나|저|내가|제가)(는|은)?\s+\S/.test(x) || (() => { const m = x.match(/^([가-힣]{2,3}?)(이는|는|은|이가|가|이)\s+\S/); return !!m && (known(m[1], ctx) || isName(m[1])); })();
  if (segs.every(lead)) { // 마지막에만 붙은 마감("…, 서연이는 견적서 금요일까지")은 앞사람 것에도
    const dl = segs[segs.length - 1].match(/(?:\S+\s+)?\S+까지\s*$/); const dh = dl && parseWhen(dl[0], base).date ? parseWhen(dl[0], base).hits.join(' ') + '까지' : '';
    return segs.map(x => '할일: ' + (dh && !parseWhen(x, base).hits.length ? x + ' ' + dh : x)); }
  // "점심 9000원, 커피 4500원"처럼 수량·업체 말이 없는 짧은 것들은 따로 쓴 돈 (가격표는 한 업체의 품목들이라 그대로 둠)
  { const MR = () => new RegExp(MONEY_SRC, 'g'); const bare = x => x.replace(MR(), ' ').trim(); const SPENT = /(썼|결제|샀|냈|긁|지출)/, INC = /받기로|입금|들어올|계약금|잔금|선금|착수금/;
    let ss = segs; const payer = segs[segs.length - 1].match(/\s([가-힣]{2,4}(?:이가|가|이)\s*(?:냄|냈어요?|냈음|결제|계산|결제함|결제했어요?|계산함|계산했어요?))$/);
    if (payer) ss = segs.map((x, k) => (k < segs.length - 1 && !/(냄|냈|결제|계산)/.test(x) ? x + ' ' + payer[1] : x));           // "…서연이가 냄"은 앞의 것에도
    if (INC.test(p) && bare(ss[0]).split(/\s+/).length >= 2) { const cl = bare(ss[0]).split(/\s+/)[0]; ss = ss.map((x, k) => (k && bare(x).split(/\s+/).length === 1 && INC.test(x) ? cl + ' ' + x : x)); } // "오로라 계약금 300만원, 잔금 200만원"
    { const hb = bare(ss[0]).split(/\s+/).filter(w0 => !parseWhen(w0, base).hits.length); const hw = parseWhen(bare(ss[0]), base).hits;   // 앞 조각의 머리말("인건비 민서 …, 서연 …")은 뒤에도
      const hd = hb.filter(w0 => !hw.some(x => x.includes(w0)));
      if (!INC.test(p) && hd.length >= 2) ss = ss.map((x, k) => { const b1 = bare(x).split(/\s+/); return k && b1.length === 1 && (known(b1[0], ctx) || isName(b1[0], true) || /^(보증금|부가세|배송비|수수료|팁|추가금|연장료)$/.test(b1[0])) ? hd.slice(0, -1).join(' ') + ' ' + x : x; }); }
    if (ss.every((x, k) => x.length <= 28 && (x.match(MR()) || []).filter(z => /\d/.test(z)).length === 1 && (!parseWhen(bare(x), base).hits.length || (!k && !parseWhen(bare(x), base).hits.some(isTimeHit))))
      && !/\d\s*(장|개|부|매|권|세트|박스|롤|통|ea)(?![가-힣])|업체|거래처|견적|단가|인쇄|제작|예산/i.test(p) && (!INC.test(p) || ss.every(x => bare(x).split(/\s+/).length >= 2)))
      return ss.map((x, k) => (k ? carryDate(ss[0], x, base) : x).replace(/\s*(썼어요?|썼음|씀)$/, '') + (SPENT.test(p) && !SPENT.test(x) ? ' 결제' : '')); }
  const sig = x => parseWhen(x, base).hits.length > 0 || parseMoney(x) != null;
  if (!segs.every(x => sig(x) && x.replace(/\s/g, '').length >= 3) || segs.filter(x => parseWhen(x, base).hits.length).length < 1) return [p];
  if (segs.every(x => parseMoney(x) != null && !parseWhen(x, base).hits.length) && !/(썼|결제|샀|냈|긁|지출)/.test(p)) return [p]; // 가격표는 한 업체의 품목들
  return segs.map((x, i) => (i ? carryDate(segs.slice(0, i).reverse().find(y => parseWhen(y, base).hits.some(h => !isTimeHit(h))) || '', x, base) : x));
}
// "만이천원", "오천원", "삼만원"처럼 한글로 적은 금액을 숫자로 ("사원"·"병원" 같은 낱말은 단위 글자가 없어서 그대로)
const KD = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 }, KU = { 십: 10, 백: 100, 천: 1000 };
export function korMoney(text) {
  const sec = x => { let tot = 0, cur = 0; for (const ch of x) { if (KD[ch]) cur = KD[ch]; else { tot += (cur || 1) * KU[ch]; cur = 0; } } return tot + cur; };
  return String(text).replace(/(^|[\s(])([일이삼사오육칠팔구십백천만억]{1,12})\s?원(?=$|[^가-힣]|이랑|하고|이고|짜리|씩|을|은|이|에|으로|도|만|쯤|정도|입|인데|어치|밖에|부터|까지|과|와|랑)/g, (m0, pre, k) => {
    if (!/[십백천만억]/.test(k) || /(억.*억|만.*만|만.*억)/.test(k) || /[일이삼사오육칠팔구]{2}/.test(k)) return m0;
    const [eok, rest] = k.includes('억') ? k.split('억') : ['', k]; const [man, low] = rest.includes('만') ? rest.split('만') : ['', rest];
    const v = (k.includes('억') ? (sec(eok) || 1) * 1e8 : 0) + (rest.includes('만') ? (sec(man) || 1) * 1e4 : 0) + sec(low);
    return v >= 100 ? `${pre}${v.toLocaleString('en-US')}원` : m0; });
}
// "내일 3시에 미팅 있고 금요일까지 견적서 보내야 해", "민서한테 … 달라고 하고 서연이한테는 …": '~고'로 이은 두 건
function splitChain(p, base, ctx) {
  if (p.length > 120 || /https?:\/\//.test(p)) return [p];
  const toks = p.trim().split(/\s+/); if (toks.length < 4) return [p];
  const nm = x => { const y = x.replace(/이$/, ''); return known(x, ctx) || known(y, ctx) || isName(x, true) || isName(y, true); };
  for (let k = 1; k < toks.length - 1; k++) {
    const tk = toks[k]; let tail;
    if (/^(있고|하고|잡혔고|잡혀있고)$/.test(tk)) tail = '';
    else if (/^[가-힣]{1,4}고$/.test(tk) && !/^(광고|참고|보고|경고|원고|공고|그리고|최고|사고|재고|창고|하고|있고)$/.test(tk) && /(오전|아침|점심)/.test(toks.slice(0, k).join(' ')) && /^(오후|저녁|밤)(에|엔|에는)?$/.test(toks[k + 1])) { const l2 = [...toks.slice(0, k), /[가-힣]{2,}하고$/.test(tk) ? tk.replace(/하고$/, '') : tk.replace(/고$/, '기')].join(' '), r2 = toks.slice(k + 1).join(' '); const dh = parseWhen(p, base).hits.find(x => !isTimeHit(x) && !/^(오전|오후|아침|점심|저녁|밤)/.test(x)) || '오늘';   // 날짜 말이 없으면 오늘 일
      return [l2.includes(dh) ? l2 : dh + ' ' + l2, r2.includes(dh) ? r2 : dh + ' ' + r2]; }
    else if (/^[가-힣]{2,}(하고|있고)$/.test(tk) && !nm(tk.replace(/(하고|있고)$/, '')) && !/^(광고|참고|보고|경고)/.test(tk.slice(-4))) tail = tk.replace(/(하고|있고)$/, '');
    else if (/^[가-힣]{1,4}고$/.test(tk) && !/^(광고|참고|보고|경고|원고|공고|그리고|최고|사고|재고|창고)$/.test(tk) && /^(오전|오후|저녁|밤)?\s*\d{1,2}\s*시/.test(toks.slice(k + 1, k + 3).join(' ')) && parseWhen(toks.slice(0, k).join(' '), base).time && toks.length - k >= 3) {   // "내일 10시 치과 가고 2시 오로라 미팅"
      const lp = toks.slice(0, k).join(' '); const dh = parseWhen(lp, base).hits.find(x => !isTimeHit(x)) || ''; const l2 = lp + (/^(가고|갔다가|들르고|들렀다가)$/.test(tk) ? '' : ' ' + tk.replace(/하고$/, '').replace(/고$/, '기')); return [l2.trim(), (dh ? dh + ' ' : '') + toks.slice(k + 1).join(' ')]; }
    else continue;
    let left = [...toks.slice(0, k), tail].filter(Boolean).join(' '); const right = toks.slice(k + 1).join(' ');
    if (tk === '하고' && /[가-힣A-Za-z0-9](으로|로)$/.test(toks[k - 1]) && /(은|는)(\s|$)/.test(left) && /(하기로|가기로|맡기로|까지)/.test(right)) return [left.replace(/^(오늘|어제|방금|아까)?\s*(회의|미팅|통화|회의\s*결과)(에서|때|결과)?\s+/, '') + ' 확정', ...splitChain(right, base, ctx)];   // "회의에서 로고는 B안으로 하고 포스터는 …"의 앞은 정한 것
    const lw = parseWhen(left, base), rw = parseWhen(right, base); let rest = left; for (const hh of lw.hits) rest = rest.replace(hh, ' ');
    const to = /^([가-힣]{2,4}?)(이)?(한테|에게)(는|도)?$/.exec(toks[k + 1]);
    if (to && nm(to[1]) && /[가-힣](한테|에게)(\s|$)/.test(left)) { if (/(달라고|라고)$/.test(left)) left += ' 해줘'; return [left, ...splitChain(right.replace(/^(\S+?(?:한테|에게))(는|도)(?=\s)/, '$1'), base, ctx)]; }
    { const dl = right.match(/(?:^|\s)((?:\S+\s+)?\S+까지)(?=\s|$)/);   // "회의실 예약하고 금요일까지 자료 준비": 둘 다 그때까지 할 일
      if (!lw.hits.length && tail && tk.endsWith('하고') && left.replace(/\s/g, '').length >= 3 && dl && parseWhen(dl[1], base).date && !rw.time && parseMoney(p) == null && !/[?？]/.test(p)) return ['할일: ' + left + ' ' + parseWhen(dl[1], base).hits.join(' ') + '까지', '할일: ' + right]; }
    if (lw.hits.length && rest.replace(/[\s에은는]/g, '').length >= 2 && rw.hits.some(h => !isTimeHit(h)) && right.replace(/\s/g, '').length >= 4 && parseMoney(p) == null) return [left, ...splitChain(right, base, ctx)];
  }
  return [p];
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
  if (!list && (m = p.match(new RegExp(`(?:^|\\s)(?:${wk}\\s*)?((?:[월화수목금토일](?:요일|욜)?(?:\\s*[,·]\\s*|\\s+)){1,4}[월화수목금토일](?:요일|욜)?)(?=\\s|마다|에\\s|$)`)))) { const ds = m[2].replace(/요일|욜/g, ' ').match(/[월화수목금토일]/g) || []; if (ds.length >= 2 && new Set(ds).size === ds.length && (/요일|욜/.test(m[2]) || m[1] || ds.length >= 3)) { list = ds; raw = m[0]; } }
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
  { const one = String(input || '').trim(); const mh = !/\n/.test(one) && one.match(/^(회의록|회의\s*(?:결과|정리|내용|메모|요약)|미팅\s*(?:결과|정리|내용|메모|요약))\s*[:：]\s*(.+)$/);   // "회의록: A 확정, B 민서 금요일까지" 한 줄도 줄마다 읽음
    if (mh) { const ms = mh[2].split(/\s*,\s+|\s+\/\s+|\s*;\s*/).map(x => x.trim()).filter(x => x.length >= 2); if (ms.length >= 2 && ms.length <= 12) input = [mh[1], ...ms].join('\n'); } }
  const ls = String(input || '').split(/\n+/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return null;
  const head = ls[0]; if (head.length > 40 || !/(회의록|회의\s*(내용|정리|메모|결과|요약)|미팅\s*(내용|정리|메모|결과|요약|노트))/.test(head)) return null;
  const base = ctx.base || new Date(); const people = ctx.people || []; const mine = [].concat(ctx.me || []).filter(Boolean);
  let title = head.replace(/[:：]\s*$/, '').replace(/^[#\[\]\s]+|[\]\s]+$/g, '').trim(); const hw = parseWhen(head, base);
  if (/^(회의록|회의\s*(내용|정리|메모|결과|요약)|미팅\s*(내용|정리|메모|결과|요약|노트))$/.test(title)) title = `${base.getMonth() + 1}월 ${base.getDate()}일 회의`;   // 머리말이 그냥 "회의록"이면 날짜로 이름을 붙임
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
  // 한 줄에 번호를 매겨 쓴 것("1. 로고 수정 2. 포스터 인쇄 3. 발송")과 차례를 화살표로 이은 것("로고 수정 → 인쇄 → 납품")은 하나씩
  if (/^\s*1[.)]\s+\S/.test(input) && /\s2[.)]\s+\S/.test(input)) { const ns = input.split(/(?:^|\s+)\d{1,2}[.)]\s+/).map(x => x.trim()).filter(x => x.length > 1); if (ns.length >= 2) return ns; }
  if (/\s(?:→|->|=>|➡)\s/.test(input) && !/https?:\/\//.test(input)) { const as = input.split(/\s+(?:→|->|=>|➡)\s+/).map(x => x.trim()).filter(Boolean); if (as.length >= 2 && as.every(x => x.replace(/\s/g, '').length >= 2 && x.length <= 40)) return as.map(x => '할일: ' + x); }
  return input.split(/\s*(?:그리고|,\s*그리고|;\s*|\s+또\s+|\s+그 다음에\s+)\s*/).filter(s => s.trim().length > 1);
}
// 업체: "레드프린팅 인쇄 업체 02-123-4567 A3 포스터 100장 45000원" → 이름·분야·전화·링크·품목별 가격
const VCAT = [['인쇄', /인쇄|프린팅|출력|명함|포스터|리플렛|전단|책자/], ['굿즈 제작', /굿즈|키링|아크릴|스티커|뱃지|에코백|머그|티셔츠/], ['현수막·실사', /현수막|배너|실사/], ['촬영·스튜디오', /촬영|스튜디오|사진관/], ['대관·장소', /대관|공간\s*대여|장소\s*대여/], ['영상·편집', /영상|편집/], ['포장·배송', /포장|택배|퀵|박스/], ['케이터링', /케이터링|다과|도시락/]];
const VWORD = /(업체|거래처|인쇄소|제작소|공방|견적)/;
const VSKIP = /^(업체|거래처|견적|추가|등록|새|새로|저장|정리|목록|리스트|사장님|대표님|번호|연락처|:|：)$/;
const bareUrl = t => (t.match(/https?:\/\/[^\s<>"']+/) || t.match(/(?:www\.)?[a-z0-9][a-z0-9-]*\.(?:co\.kr|com|kr|net|shop|store|io)(?:\/[^\s]*)?/i) || [''])[0];
export function vendorParts(t, known = []) {
  const phone = parsePhone(t) || (t.match(/\b1[5-9]\d{2}[-\s]?\d{4}\b/) || [''])[0]; const link = bareUrl(t);
  const vem = parseEmail(t); if (vem) { const l2 = bareUrl(t.replace(vem, ' ')); if (l2 !== link) return vendorParts(t.replace(vem, ' ').replace(/\s+/g, ' ').trim(), known); }
  let rest = t.replace(/^(업체|거래처)\s*[:：]\s*/, ''); if (phone) rest = rest.replace(phone, ' '); if (link) rest = rest.replace(link, ' ');
  rest = rest.replace(/(\d{2,4})[-\s]?(\d{3,4})[-\s]?(\d{4})/g, m => (phone && m.replace(/\D/g, '') === String(phone).replace(/\D/g, '') ? ' ' : m));
  const kakao = (rest.match(/(?:카톡|카카오톡|담당자?)\s*[:：]?\s*([가-힣A-Za-z0-9_]{2,12}(?:\s?(?:대리|과장|팀장|실장|사장|대표)님?)?)/) || [])[1] || '';
  if (kakao) rest = rest.replace(/(?:카톡|카카오톡|담당자?)\s*[:：]?\s*[가-힣A-Za-z0-9_]{2,12}(?:\s?(?:대리|과장|팀장|실장|사장|대표)님?)?/, ' ');
  const hit = known.filter(Boolean).sort((a, b) => b.length - a.length).find(n => t.replace(/\s/g, '').includes(n.replace(/\s/g, '')));
  const toks = rest.split(/[\s,·/]+/).filter(Boolean);
  const bizTok = toks.find(x => x.length >= 4 && /(프린팅|프린트|렌탈|컴퍼니|상사|공방|인쇄|미디어|픽처스|필름|웍스|조명|사운드|상회|프로덕션|스토어|스튜디오|기획|디자인)$/.test(x) && !/^(인쇄|스튜디오|디자인|기획)$/.test(x));
  let name = hit || bizTok || toks.find(x => !VSKIP.test(x) && !/^\d/.test(x) && !VCAT.some(([c, re]) => x === c || (re.test(x) && x.length <= 3))) || '';
  { const after = rest.match(/^\s*([가-힣A-Za-z·]{2,8})\s*(?:업체|거래처)(?:는|은)?\s+([가-힣A-Za-z0-9]{2,})/); if (!hit && after && !VSKIP.test(after[2]) && !/^(견적|가격|단가|연락|전화|번호)/.test(after[2])) name = after[2]; }
  name = name.replace(/(은|는|이|가|에서|에|한테|의)$/, m => (name.length - m.length >= 2 ? '' : m));
  const explicit = (rest.match(/([가-힣·]+)\s*(?:업체|거래처)/) || [])[1] || '';
  const cat = (VCAT.find(([c, re]) => re.test(explicit)) || (hit ? [''] : null) || VCAT.find(([c, re]) => re.test(name)) || VCAT.find(([c, re]) => re.test(rest)) || ['기타'])[0];
  // 품목 + 가격 쌍
  const prices = []; let body = rest; if (name) body = body.replace(name, ' '); { const lead = body.match(/^.*?(업체|거래처|견적)(는|은|가|이)?\s*/); if (lead && /\d/.test(body.slice(lead[0].length))) body = ' ' + body.slice(lead[0].length); else body = body.replace(/견적\s*(받음|받았\S*|받아\s*봄|나옴|나왔\S*|옴|왔\S*)?/g, ' '); }   /* 값이 '견적' 앞에 있으면("… 15만원 견적 받음") 지우지 않음 */
  body = body.replace(/(추가|등록|저장)(해\s*줘|해줘|해|요)?\s*$/, ' ');
  const re = /(\d[\d,]*(?:\.\d+)?\s*만\s*(?:\d+\s*천)?\s*원?|\d[\d,]*\s*천\s*원|\d[\d,]{2,}\s*원?)(?!\s*(장|개|매|부|권|세트|박스|ea|mm|cm|g|ml))/gi;
  let last = 0, m; const today = ymd(new Date()); let memoBits = [];
  while ((m = re.exec(body))) { let item = body.slice(last, m.index).replace(/[,·:：/]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^((추가|등록|저장|견적|그리고|또)\s+)+/, '').replace(/\s*(은|는|이|가|에|으로|로)$/, ''); const price = parseMoney(m[0].includes('원') ? m[0] : m[0] + '원');
    const after = (body.slice(re.lastIndex).match(/^\s*\(([^)]{1,30})\)/) || [])[1] || ''; if (after) re.lastIndex += body.slice(re.lastIndex).indexOf(')') + 1;
    if (item.length >= 2 && price) prices.push({ item: item.slice(0, 40), price: String(price), note: after, at: today }); else if (item) memoBits.push(item); last = re.lastIndex; }
  const tail = body.slice(last).replace(/^\s*(으로|로)?\s*(올랐|내렸|바뀌|바꼈|변경|인상|인하)\S*/, ' ').replace(/\s+/g, ' ').trim().replace(/^[,·]+|[,·]+$/g, '');
  const memo = [...(prices.length ? [] : memoBits), tail].filter(x => x && x.length > 1 && !VSKIP.test(x) && !VCAT.some(([c]) => x === c)).join(' ').slice(0, 120);
  return { name, cat, phone: phone || '', kakao, link, memo, prices };
}
function interpretOne(s, base, ctx) {
  // "서연이한테 견적서 보내달라고 해줘": (메신저로 못 전하는 상태면) 서연 담당 할 일로
  { const rq = s.trim().match(/^([가-힣]{2,4}?)(?:이)?(?:님|씨)?\s*(?:한테|에게|께)\s+(.+?)\s*달라고\s*(?:좀\s*)?(?:전해|말해|해|부탁해|얘기해)\s*(?:줘|주세요|줄래|주라)?\s*[.!]?$/);
    if (rq && rq[2].trim().length >= 2) s = `${rq[1]} ${rq[2].trim()}${/(해|내|써|봐|둬|놔|워|려|겨|쳐|춰|꿔|켜|들어|올려|바꿔|고쳐|넣어|찾아|잡아|뽑아)$/.test(rq[2].trim()) ? '줘' : ' 주기'}`; }
  // "민서야 내일까지 시안 좀 부탁해": 부른 사람의 할 일로
  { const vq = s.trim().match(/^([가-힣]{2,3})(아|야)[,\s]+(.{2,50}?(?:부탁\s*(?:해요?|할게요?|드려요?)?|줘요?|줄래요?|주라|놔|둬))((?:\s+\S+){0,2}?\s+\S+까지)?\s*[.!~?？]*$/);
    if (vq && (known(vq[1], ctx) || isName(vq[1], true))) s = `할일: ${vq[1]}${(vq[1].charCodeAt(vq[1].length - 1) - 0xac00) % 28 ? '이' : ''}는 ${vq[3].trim().replace(/(^|\s)좀(?=\s)/g, '$1').replace(/\s*부탁\s*(해요?|할게요?|드려요?)?$/, '').replace(/\s*해\s*줄래요?$/, '').replace(/\s+/g, ' ').trim().replace(/(을|를)$/, '')}${vq[4] || ''}`; }
  // "서연이한테 견적서 부탁해줘": 그 사람 할 일로
  { const bq = s.trim().match(/^([가-힣]{2,4}?)(?:이)?(?:님|씨)?\s*(?:한테|에게|께)\s+(.{2,40}?)\s*(?:좀\s*)?부탁\s*(?:해\s*(?:줘|주세요|줄래)|할게요?|드려요?|한다고\s*(?:해|전해)\s*줘)\s*[.!]?$/);
    if (bq && (known(bq[1], ctx) || isName(bq[1], true)) && !/[?？]/.test(bq[2])) s = `할일: ${bq[1]}${/[가-힣]/.test(bq[1].slice(-1)) && (bq[1].charCodeAt(bq[1].length - 1) - 0xac00) % 28 ? '이' : ''}는 ${bq[2].trim().replace(/(을|를)$/, '')}`; }
  s = s.replace(/^\s*((ㅇㅋ|ㅇㅇ|오키|오케이|넵|넹|콜)\s+)+((그럼|그러면)\s+)?(?=\S)/, '');
  s = s.replace(/(^|\s)(이번|다음|담)\s*주\s*목표\s*(는|은|:|：)?\s*(?=\S)/g, '$1$2주까지 ');
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

  // "10분 뒤에 알려줘", "30분 뒤에 전화하라고 알려줘": 그때 울리는 알림을 일정으로 (알림은 정각에 울림)
  { const tm = t.match(/^(?:지금부터\s*)?(\d{1,3})\s*(분|시간)(\s*반)?\s*(?:뒤|후|있다가?|이따가?)(?:에)?\s*(.*?)\s*(?:하라고|라고|하게|좀)?\s*(?:알려|알림|알람|깨워|말해|리마인드)\s*(?:해\s*)?(?:줘|주세요|줄래|주라)?$/);
    if (tm && money == null && !phone && !urls.length) { const at = new Date(base.getTime() + (Number(tm[1]) * (tm[2] === '시간' ? 60 : 1) + (tm[3] ? 30 : 0)) * 60000);
      const title = tm[4].replace(/\s*(하라고|라고|하기|을|를|좀)$/, '').trim();
      return [{ kind: 'event', label: '일정', confidence: 0.85, data: { title: title || '알림', date: ymd(at), start: `${pad(at.getHours())}:${pad(at.getMinutes())}`, remind: 0, scope: 'personal', _dated: true } }]; } }
  // "회의록 정리해야 되는데 까먹지 않게 내일 아침에 알려줘", "내일 9시에 약 먹으라고 알려줘": 그때 울리는 알림
  { const dm = w.date && t.length <= 60 && t.match(/^(.*?)\s*(?:알려|알림|알람|리마인드|깨워|말해)\s*(?:해\s*)?(?:줘|주세요|줄래|주라)[.!]*$/);
    const mark = /(까먹|잊어버리|잊지|잊으|해야\s*(?:되|하|돼)는데|해야\s*(?:돼|해|됨|함)|(?:으라고|하라고|라고)(?=\s|$))/;
    if (dm && mark.test(dm[1]) && money == null && !phone && !urls.length && !/[?？]|(뭐|뭘|어디|언제|누가|누구|얼마|몇)/.test(dm[1])) {
      let ttl = dm[1]; for (const hh of w.hits) ttl = ttl.replace(hh, ' ');
      const part = /(아침)/.test(dm[1]) ? '09:00' : /(점심)/.test(dm[1]) ? '12:00' : /(저녁)/.test(dm[1]) ? '18:00' : /(밤)/.test(dm[1]) ? '21:00' : '09:00';
      ttl = ttl.replace(/(안\s*)?(까먹|잊어버리|잊)(지\s*않게|지\s*않도록|지\s*말라고|으면\s*안\s*되니까|을까\s*봐|으니까|지\s*말고)/g, ' ').replace(/(^|\s)(아침|점심|저녁|밤|오전|오후)(에|엔)?(?=\s|$)/g, ' ').replace(/(^|\s)에(?=\s|$)/g, ' ')
        .replace(/([가-힣])으라고(?=\s|$)/g, '$1기').replace(/\s*(해야\s*(되|하|돼)는데|해야\s*(돼|해|됨|함)|하라고|라고|좀|꼭|나한테|저한테)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/(을|를)$/, '');
      if (ttl.length >= 2) return [{ kind: 'event', label: '일정', confidence: 0.8, data: { title: ttl, date: w.date, start: w.time || part, remind: 0, scope: 'personal', _dated: true } }]; } }
  // "10분 뒤 미팅", "30분 뒤에 출발": 지금부터 그만큼 뒤의 일정 (곧이라 알림은 정각에)
  { const rm = t.length <= 40 && t.match(/^(\d{1,3})\s*(분|시간)(\s*반)?\s*(?:뒤|후|있다가?|이따가?)(?:에)?\s+(.{2,})$/);
    if (rm && money == null && !phone && !urls.length && !/[?？]$|(뭐|뭘|어디|언제|누구|있어|없어|될까|할까)/.test(rm[4])) { const at = new Date(base.getTime() + (Number(rm[1]) * (rm[2] === '시간' ? 60 : 1) + (rm[3] ? 30 : 0)) * 60000);
      return [{ kind: 'event', label: '일정', confidence: 0.8, data: { title: rm[4].replace(/\s*(하기|해야\s*해|해야\s*함|할게|하자)$/, '').trim(), date: ymd(at), start: `${pad(at.getHours())}:${pad(at.getMinutes())}`, remind: 0, _dated: true } }]; } }
  // "수요일 오전은 비워둬": 그 시간을 비워 둔 일정으로 잡아 둠
  { const bm = t.length <= 30 && t.match(/(오전|오후|저녁|하루|종일)?\s*(?:은|는|엔|에는|에)?\s*(?:일정\s*)?(?:비워\s*(?:둬|놔|줘|두기|놓기|두자)|잡지\s*마)(?:\s*줘)?$/);
    if (bm && w.date && money == null) { const span = bm[1] === '오전' ? ['09:00', '12:00'] : bm[1] === '오후' ? ['13:00', '18:00'] : bm[1] === '저녁' ? ['18:00', '21:00'] : null;
      return [{ kind: 'event', label: '일정', confidence: 0.8, data: { title: '비워 둔 시간', date: w.date, ...(span ? { start: span[0], end: span[1] } : { _allday: true }), scope: 'personal', _dated: true } }]; } }
  // "오늘 뭐 했는지 정리": 적어 둘 일이 아니라 한 일을 묻는 말
  // "오로라 계약금 아직 안 들어왔어": 적어 둘 말이 아니라 받을 돈 상태를 보는 말
  if (t.length <= 40 && money == null && /(아직|여태|계속)?\s*(안|못)\s*(들어왔|들어옴|받았|받음|입금\s*됐|입금됨)\S*\s*[.!?]*$/.test(t) && /(계약금|선금|착수금|잔금|중도금|대금|입금|돈|비용|정산|페이)/.test(t)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];
  if (t.length <= 24 && money == null && /^((오늘|어제|이번\s*주|지난\s*주|이번\s*달|지난\s*달)(에)?\s*)?(\S{2,4}(이|가)\s*)?(끝낸|완료한|끝난|마친|다\s*한)\s*(일|것|거|할\s*일)(\s*(뭐\S*|보여\s*줘|알려\s*줘|정리해\s*줘|있어\??))?\s*[?？]?$/.test(t)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];   /* "이번 주에 끝낸 일" */
  if (t.length <= 30 && /(뭐|뭘|무엇을?|무슨\s*일)\s*했는지\s*(좀\s*)?(정리|알려|보여|말해|요약)/.test(t)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];
  if (t.length <= 24 && money == null && /^(오늘\s*|이번\s*주\s*)?(해야\s*)?할\s*(일|거)(이|은|는|도|들)?\s*(다\s*(했|끝냈|끝났)\S*|(너무\s*|진짜\s*|엄청\s*)?(많아|많다|많네|많음|쌓였\S*|밀렸\S*)|\d+\s*개\s*남았\S*)\s*[.!~ㅠㅜ]*$/.test(t)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];   // "할 일 다 했어", "할 일이 너무 많아"는 적을 말이 아님
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
    if (IDEAQ.test(t) && !w.date && !w.time && money == null) return false;   /* "굿즈로 키링 어때?"는 아이디어 */
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
      const m = t.match(/^(.*?)\s*(할\s*일|할일|마감|일정|스케줄|지출|지출\s*내역|수입|매출|받을\s*돈|들어온\s*돈|진행\s*상황|진행상황|진행\s*현황|현황|회의\s*내용|휴가자?|빈\s*시간|작업\s*시간|대기함|확인할\s*것)\s*(은|는|좀)?$/);
      if (m && m[2] === '휴가' && /(^|\s)(오늘|내일|모레)(\s|$)/.test(m[1])) return false; // "내일 휴가", "민서 내일 휴가"는 묻는 말이 아니라 쉬는 날
      if (m) { const rest = m[1].trim().split(/\s+/).filter(Boolean); const bare = x => x.replace(/(이|의|님)$/, '');
        const okW = x => /^(오늘|내일|모레|어제|이번|다음|지난|주|달|이번주|다음주|지난주|이번달|금주|담주|팀|팀원|개인|내|우리|전체|남은|밀린|끝난|나|저|프로젝트|프로젝트별)$/.test(x) || known(bare(x), ctx) || isName(bare(x));
        if (rest.length <= 4 && (rest.every(okW) || (rest.length && (g => !!(g.name || g.many))(projectGuess(m[1], ctx.projects || [])) && !w.date))) return true; }
    }
    return false;
  })();
  // "견적 프롬프트 보여줘": 프롬프트 스튜디오에서 그 말로 찾아 줌
  { const p2 = t.length <= 40 && t.match(/^프롬프트(?:\s*스튜디오)?에서\s*(.{1,20}?)\s*(?:틀|프롬프트|양식|거)?\s*(?:좀\s*)?(?:찾아|보여|열어|꺼내)\s*(?:줘|주세요)?$/); if (p2 && p2[1].trim()) return [{ kind: 'nav', data: { to: '프롬프트', q: p2[1].trim() }, label: '이동', confidence: 0.85 }]; }
  { const pm = t.length <= 40 && t.match(/^(.{1,24}?)\s*프롬프트\s*(?:좀\s*)?(?:찾아|열어|보여|꺼내|골라|쓸래|쓰자|써|줘|주세요|\s)*$/); const q = pm ? pm[1].replace(/(용|관련|쓰는|하는|에\s*쓸)$/, '').trim() : '';
    if (q && !NAV_RE.test(t) && !/(만들|저장|고쳐|고치|지워)/.test(t) && money == null && !phone) return [{ kind: 'nav', data: { to: '프롬프트', q }, label: '이동', confidence: 0.85 }]; }
  if (/^(새\s*)?프롬프트\s*(하나\s*)?(새로\s*)?(만들|짜)/.test(t) && t.length <= 20) return [{ kind: 'nav', data: { to: '프롬프트', make: true }, label: '이동', confidence: 0.85 }];
  if (HELPQ.test(t) && !phone && !urls.length && money == null) return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.6 }];
  if (navPhrase(t) && money == null && !phone && !w.date) { const nv = t.match(NAV_RE); return [{ kind: 'nav', data: { to: nv[1] }, label: '이동', confidence: 0.9 }]; }
  if (isQ) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.85 }];
  // 이동
  const nav = t.match(NAV_RE);
  if (nav && (nav[2] || !NAV_SHY.test(nav[1]))) return [{ kind: 'nav', data: { to: nav[1] }, label: '이동', confidence: 0.9 }];

  const gk = guessKind();
  if (gk === 'talk') return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.5 }];
  const made = build(gk);
  // 제목에 남은 군말 다듬기: "영수증 정리 하자" → "영수증 정리", "사무실 월세 매달" → "사무실 월세", "깨워줘" → "일어나기"
  if (made.data && typeof made.data.title === 'string') { let tt = made.data.title;
    if ((made.kind === 'task' || made.kind === 'event') && !/(같이|함께)\s+(하자|합시다)$/.test(tt)) tt = tt.replace(/\s+(하자|합시다|할게|할래|해야지)$/, '');
    if (made.kind === 'event') { tt = tt.replace(/^우리\s+(?=\S)/, '').replace(/([가-힣]{2,})(하자|합시다|할까요?|하기로\s*함)$/, '$1');   // "우리 회식하자" → "회식"
      const lead = tt.match(/^([가-힣]{2,3}?)(이가|가|이|는|은)\s+(.+?)\s*(감|간다|가요|가기로\s*함|참석|참석함)?$/); const lw = lead && (ctx.people || []).find(n => n === lead[1] || n.slice(1) === lead[1]);   // "하진이 내일 3시 오로라 미팅 감" → 누구: 하진, 제목: 오로라 미팅
      if (lw && lead[3].length >= 2 && (lead[4] || !made.data.who)) { tt = lead[3]; if (!made.data.who) made.data.who = lw; }
      if (made.data.place) { const pl = made.data.place.match(/^([가-힣]{2,3}?)(이가|가|이|는|은)\s+(.+)$/); const pw = pl && (ctx.people || []).find(n => n === pl[1] || n.slice(1) === pl[1]); if (pw) { made.data.place = pl[3]; if (!made.data.who) made.data.who = pw; } } }   // "민서가 내일 2시 치과"의 곳은 "치과"
    for (const pn of (ctx.projects || [])) if (typeof pn === 'string' && pn.length >= 3 && t.includes(pn) && !tt.includes(pn) && tt.includes(pn.slice(0, -1))) tt = tt.replace(pn.slice(0, -1), pn);   /* "루미에"처럼 조사로 끝나는 프로젝트 이름이 잘린 것 되살림 */
    if (made.kind === 'expense') tt = tt.replace(/\s*(매달|매월|매주|매년)\s*$/, '');
    if (made.kind === 'expense') { const pm = tt.match(/^(.+?)\s+(\S{2,4}?)(이가|가|이)$/); const who = pm && (ctx.people || []).find(n => n === pm[2] || n.slice(1) === pm[2]);   /* "굿즈 샘플비 15만원 서연이가 냄": 낸 사람은 제목이 아니라 메모로 */
      if (who) { tt = pm[1]; made.data.memo = [made.data.memo, `${who} 결제`].filter(Boolean).join(' · '); } }
    if (made.kind === 'event' && /^(나\s*)?(좀\s*)?(깨워|알려|알람|알림)\s*(해\s*)?(줘|주세요|줄래)?$/.test(tt.trim())) tt = /깨워/.test(t) ? '일어나기' : '알림';
    if (tt.trim()) made.data.title = tt.trim(); }
  // 날짜·시간을 빼고 나니 남는 말이 없으면("금요일로 하자", "오늘 다 했어") 만들지 않고 대화로 받음
  if ((made.kind === 'task' || made.kind === 'event') && /^(으로|로)?\s*(다|전부|모두)?\s*(하자|하기|해|함|했어|했다|했음|할게|하다|되기|끝|끝내기|일정)?$/.test((made.data.title || '').trim())) return [{ kind: 'talk', data: { text: t }, label: '대화', confidence: 0.5 }];
  return [made];

  function guessKind() {
    const vknown = (ctx.vendors || []).some(n => n && n.length >= 2 && t.replace(/\s/g, '').includes(n.replace(/\s/g, '')));
    const vsig = phone || urls.length || bareUrl(t) || money != null || /\b1[5-9]\d{2}[-\s]?\d{4}\b/.test(t);
    const dl = isDeadline(t), biz = BIZ.test(t);
    const OBLIG = /(해야|야\s*(함|해|돼|됨|한다|겠|지)|하기로|줘야|필요|부탁)/;
    if (/(^|\s)(비|눈|소나기|태풍|황사|미세먼지)\s*(가\s*)?(온대|온다|온대요|올\s*듯|와요?|많대|심하대|심하다)\s*[.!~]*$/.test(t) || /(덥대|춥대|덥다|춥다|더워|추워)\s*[.!~]*$/.test(t)) { if (money == null && !w.time) return 'talk'; }   // "내일 비 온대"는 그냥 하는 말
    // 일정 낱말로 세면 안 되는 것: 회의록·발표 자료 같은 '물건', 때를 가리키는 저녁·점심
    const T = t.replace(/(회의록|회의\s*자료|회의\s*준비|미팅\s*자료|미팅\s*준비|발표\s*자료|발표\s*준비|촬영\s*콘티|촬영본|촬영분|행사\s*준비|전시\s*준비|촬영\s*준비|촬영\s*허가|촬영\s*소품|촬영\s*장비|촬영\s*순서)/g, '□').replace(/(오늘|내일|모레|요일|욜)\s*(저녁|점심|아침)(에)?(?=\s|$)/g, '$1');
    if (/(뵙겠습니다|수고하셨습니다|고생하셨습니다|수고했어요?|고생했어요?|감사합니다|고마워요?|들어가세요)\s*[.!~ㅎㅋ^]*$/.test(t) && money == null && !dl) return 'talk';
    const tail = (w.hits || []).reduce((x, hh) => x.replace(hh, ' '), t).replace(/(오전|오후|아침|저녁|밤|점심)(에)?\s*$/, '').replace(/\s+/g, ' ').trim(); // 날짜·시간 말을 뺀 나머지
    const doit = ACTION.test(t) || TASKEND.test(tail);
    /* 웃음·느낌뿐인 말은 적지 않음 */
    if (/[ㅋㅎ]{2,}|ㅠㅠ|ㅜㅜ/.test(t) && money == null && !phone && !OBLIG.test(t) && !dl && !w.time && /(웃겼|웃김|웃기|웃겨|재밌|재미있|피곤|힘들|졸려|졸리|배고|짜증|귀찮|싫|대박|레전드)/.test(t)) return 'talk';
    if (/목표/.test(t) && /(분기|올해|연간|이번\s*달|다음\s*달)/.test(t) && !/원/.test(t) && !/(현재|지금)/.test(t) && !SPENT.test(t) && !dl) return 'okr';
    if (w.date && money == null && !dl && /(^|\s)(아침|점심|저녁)\s+\S{2,5}(랑|이랑|하고|와|과)\s*$/.test(t)) return 'event';   /* "내일 점심 서연이랑" */
    if (/(못\s*감|못\s*갔\S*|못\s*함|못\s*했\S*)\s*$/.test(t) && money == null && !OBLIG.test(t) && !(ctx.people || []).some(n => n && (t.includes(n) || t.includes(n.slice(1))))) return 'talk';   /* "오늘 운동 못감"은 누가 빠진다는 말이 아님 */
    if (/^(오늘|어제)?\s*(완료한|끝낸|마친|다\s*한)\s*(거|것|일)\s*[:：]?\s+\S/.test(t) && money == null) return 'note';   /* "오늘 완료한거 A B C"는 새 할 일이 아님 */
    if (/^메모\s+\S/.test(t) && money == null && !phone) return 'note';
    if (/(비번|비밀번호|와이파이|wifi|도어락|공동\s*현관|현관\s*번호)/i.test(t) && /[A-Za-z0-9#*!@]{4,}/.test(t.replace(/wifi/ig, '')) && !OBLIG.test(t) && !/[?？]\s*$/.test(t) && !/(뭐|알려|몇)/.test(t)) return 'note';
    if (/(라고\s*(함|했음|했어|하심|하셨음)|라더라|라던데|이래|래요?)\s*$/.test(t) && /(무료|유료|주차|와이파이|반입|흡연|금연)/.test(t) && money == null && !OBLIG.test(t) && !w.time) return 'note';
    /* "화요일이나 수요일 중에 회의 잡자": 날이 아직 안 정해진 약속은 할 일 */
    if (/[월화수목금토일](요일|욜)\s*(이나|아니면|또는)\s/.test(t) && /(잡자|잡아야|잡기|정하자|정해야|조율)/.test(t)) return 'task';
    /* 공모전·서포터즈 공고는 대외활동으로. "공모전 기획서 금요일까지 쓰기"처럼 해야 할 일은 그대로 할 일 */
    if ((/(공모전|서포터즈|기자단|홍보\s*대사|앰배서더|체험단|대외\s*활동|경진\s*대회|콘테스트)/.test(t) || isActLink(t)) && !/(지원사업|창업\s*패키지|바우처|정부지원)/.test(t) && !SPENT.test(t) && !w.time && !ACTION.test(t.replace(/까지|마감|신청|접수|모집|받아|받기/g, '')) && (isActLink(t) || /(마감|접수|모집|공고|떴|올라옴|나가자|나가\s*볼까|나갈까|관심|있대|있음)/.test(t) || /(팀|개인)\s*(만|가능|필수|\d)|\d\s*(명|인)\s*(까지|이내|이하|이상)/.test(t) || !!w.date)) return 'act';
    /* 지원사업 공고: 금액이 있어도 쓴 돈이 아님 */
    if (/(지원사업|공모전|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스|사관학교|창업\s*패키지|바우처)/i.test(t) && /(마감|접수|모집|최대|선정|공고)/.test(t) && !SPENT.test(t) && !/(입금|들어옴|들어왔|받음|받았)/.test(t) && !w.time && !(dl && ACTION.test(t.replace(/까지|마감|신청|접수/g, '')))) return 'grant';
    if (/(^|\s)사기(\s|$)/.test(t) && /(쿠팡|다이소|이케아|올리브영|컬리|네이버|무신사|오늘의집|알리|테무|마트|편의점|장바구니)/.test(t) && !dl && !w.time) return 'buy';
    if (NOTELABEL.test(t) || /(저장해\s*놔|적어\s*놔|기억해\s*(둬|놔|줘)|메모해)/.test(t)) return 'note';
    if (/^.{0,14}(피드백|회고|후기|조건|원칙|규칙|결론|결정\s*사항)\s*[:：]/.test(t)) return 'note'; // "수정 3차 피드백: …", "회고: …"
    if (/(익월|익일\s*지급|지급\s*조건|결제\s*조건|정산\s*조건)/.test(t) && !/(해야|보내|요청)/.test(t)) return 'note'; // 거래 조건
    if (/(으면|면)\s/.test(t) && /(하기로|청구하기로|받기로)\s*(함|했\S*)?\s*$/.test(t) && !w.date) return 'note'; // "~하면 ~하기로 함"은 약속한 규칙
    if (/(선금|계약금|잔금|중도금|대금|시공비|인건비|외주비|대관료)\s*[\d,.]+\s*(만|천|억)?\s*원?\s*(을|를)?\s*(보냄|보냈\S*|송금\S*|이체\S*|지급함|지급했\S*|입금함|입금했\S*)\s*$/.test(t)) return 'expense';
    if (/\d{3,}\s*[xX×*]\s*\d{3,}/.test(t) && /(발주|주문|인쇄|출력|제작)/.test(t) && (OBLIG.test(t) || /(하기|할\s*것)\s*$/.test(t))) return 'task'; // 치수는 금액이 아님
    if (METRIC.test(t) && /\d/.test(t) && !dl && !OBLIG.test(t)) return 'note';
    const sentQuote = /(견적|제안)/.test(t) && /(보냄|보냈|보내드|발송|제출함|제출했)/.test(t);
    if (!sentQuote && (((/(업체|거래처|인쇄소|제작소|공방)/.test(t) || (/견적/.test(t) && (biz || vknown || phone || urls.length))) && (vsig || /(추가|등록|저장|정리)/.test(t)) && !/(받기|받아|요청|보내|문의하|연락하|알아보)/.test(t)) || (vknown && vsig && !/(결제|샀|구매했|썼|냈|입금|이체|송금|카드|법카|긁|현금|지급함|지급했|보냄|보냈)/.test(t)))) return 'vendor';
    if (urls.length && /(사야|살\s*거|살\s*것|구매\s*(목록|예정|할)|장바구니|주문해야|사자|사 ?줘)/.test(t)) return 'buy';
    if ((/(사야|살\s*거|살\s*것|구매해야|사\s*와야|사\s*놔야|사\s*둬야|뭐\s*사지|뭘\s*사지|뭐\s*살까)/.test(t) || /[가-힣]\s*(에서|서)\s*사기\s*$/.test(t)) && !w.date && !dl) return 'buy';
    if (phone || email) { if (money != null || RATE.test(t) || vknown) return 'vendor'; if ((dl || OBLIG.test(t)) && ACTION.test(t.replace(/담당|까지/g, ''))) return 'task'; if (phone && /(전화|연락|문의|예약|확인)\s*(하기|해야\s*\S*|할\s*것|드리기|해\s*보기|하자)(\s|$)/.test(t)) return 'task';   /* "세무사 상담 예약 전화하기 02-…": 번호가 있어도 할 일 */ return 'contact'; }
    if (/목표/.test(t) && /(분기|올해|연간|이번\s*달|다음\s*달)/.test(t) && !/원/.test(t) && !/(현재|지금)/.test(t) && !SPENT.test(t)) return 'okr';
    if (money != null) {
      const out = /(외주비|외주|페이|인건비|알바|사례비|대관|렌탈|대여|모델료|출연료|수수료|월세|구독|광고비|원천세|급여|월급)/.test(t);
      if ((dl || OBLIG.test(t) || /(요청|하기|할\s*것)\s*$/.test(t)) && /(입금|발행|정산|지급|송금|보내|이체|결제|납부|청구|줘야|드려야|내야|갚아야|주기로)/.test(t) && !/(입금\s*(됨|됐|완료|확인)|받음|받았)/.test(t)) return 'task';
      if (/견적\s*(받음|받았\S*|받아\s*봄|나옴|나왔\S*|옴|왔\S*)/.test(t) && !/(계약금|선금|잔금|입금)/.test(t)) return 'vendor';
      if (/(매출\s*목표|목표\s*(매출|금액))/.test(t)) return 'note';
      if (INCOME.test(t) && !out) return 'income';
      if (sentQuote) return 'note';
      if (/(예산|잔액|잔고|남은\s*돈|목표\s*(매출|금액)|매출\s*목표)/.test(t) && !SPENT.test(t)) return 'note';   // "통장 잔액 320만원"은 쓴 돈이 아님
      if (SPENT.test(t) || (out && /(입금|보냄|보냈|지급)/.test(t))) return 'expense';
      if (RATE.test(t) || vknown || biz) return vknown || biz || /(업체|거래처)/.test(t) || urls.length ? 'vendor' : 'note';
      if (/(쿠팡|다이소|이케아|올리브영|컬리|네이버|무신사|오늘의집|알리|테무)/.test(t) && /(원대|쯤|정도)\s*$/.test(t) && !w.date) return 'buy';
      if (/(추가래|든대|이래|라던데|라고\s*함|정도래|한대|그대로)\s*$/.test(t) && !w.date) return 'note';
      if (/(원|만|천|억|₩)/.test(t)) return 'expense';
    }
    if (money == null && bareAmount(t) != null && (SPENT.test(t) || guessCategory(t) !== '기타') && !w.time && !dl) return 'expense';
    if (/\$\s*\d/.test(t) && /(구매|구독|결제|갱신|샀|플러그인|라이선스)/.test(t)) return 'expense';
    if (urls.length && w.time && /(줌|zoom|meet|미팅|회의|웨비나|화상)/i.test(t) && !RATE.test(t) && money == null) return 'event';   /* 회의 링크가 붙은 약속 */
    if (urls.length && RATE.test(t)) return 'vendor';
    if (urls.length && /(레퍼런스|참고|ref|무드|영감|예시|느낌)/i.test(t)) return 'reference';
    if (urls.length) return 'reference';
    if (/(OKR|KR\b|핵심\s*결과)/i.test(t) || (/목표/.test(t) && /(분기|올해|이번\s*(달|분기)|달성|세우|잡)/.test(t) && !/(현재|지금)/.test(t))) return 'okr';
    if (/목표/.test(t) && /\d/.test(t) && !dl) return 'note';
    if (w.time && w.end && /(했음|했다|했어|했고|함$|작업함|편집함|완료)\s*$/.test(t)) return 'timelog';
    if ((w.date || w.time) && LEAVE.test(t) && !ACTION.test(t.replace(/까지/g, ''))) return 'event';
    if (/(된대|안\s*된대|가능하대|만\s*가능|가능함|불가능|나온대|걸린대)\s*$/.test(t) && !OBLIG.test(t)) return 'note';
    if (w.endDate && !OBLIG.test(t)) return 'event';
    if (/(매일|날마다|매주|격주|매달|매월|평일마다)/.test(t) && !dl && (w.time || /(매달|매월)\s*\d{1,2}\s*일/.test(t) || /(매주|격주)\s*[월화수목금토일](요일|욜)/.test(t)) && money == null) return 'event'; // "매주 화요일 요가"처럼 시간이 없어도 되풀이 일정
    if (w.time && /(설명회|간담회|세미나|미팅|회의|상담|면담|행사|교육|워크숍|발표|면접|방문|관람)/.test(T)) return 'event';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) && dl && ACTION.test(t.replace(/까지|마감/g, ''))) return 'task';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) || (/(IR|투자\s*유치|데모데이)/.test(t) && !ACTION.test(t))) return 'grant';
    const upload = /(릴스|쇼츠|틱톡|유튜브|인스타|브이로그|썸네일|게시물|피드|스토리|카드뉴스|라이브|라방)/.test(t) && /(업로드|예약|게시|공개|올리|라이브|라방)/.test(t);
    if (upload && w.time && !dl) return 'event'; // 올리는 시각이 정해진 건 캘린더에 보여야 함
    if (upload && w.date && !dl && /(올리기|올려야|업로드해야|예약)/.test(t)) return 'sns';
    if (/(릴스|쇼츠|틱톡|유튜브|인스타|브이로그|썸네일|업로드|게시물|피드)/.test(t) && /(올리|찍|만들|편집|콘텐츠|아이디어|기획|업로드|예고|게시|주제|소재|시리즈|컨셉|올릴|올려)/.test(t) && !dl) return 'sns';
    if (IDEAQ.test(t) && !OBLIG.test(t) && !dl && !w.time && !w.date && money == null) return 'idea';
    if ((/\d+(\.\d+)?\s*(시간|분)/.test(t) && /(했음|했다|했어|했고|함$|완료|끝냄|작업|공부|집중|걸림|걸렸)/.test(t) && !w.time && !/(라고|이라고)\s*함$/.test(t)) || /작업\s*(했|함|기록)/.test(t)) return 'timelog';
    // 한 일을 알리는 말은 새 할 일이 아님
    if (/(처리함|처리했\S*|보냈어요?|보냈음|보냈습니다|끝냄|끝냈\S*|완료함|완료했\S*|올랐음|나옴|나왔\S*|왔음|떨어짐$)/.test(t) && !dl && !OBLIG.test(t) && !w.date && !/(떨어짐|떨어졌)/.test(t)) return /\d/.test(t) ? 'note' : 'talk';
    if ((w.time || /(오전|오후|아침|저녁|점심)(에)?(\s|$)/.test(t)) && w.date && !dl && /(보고|리뷰|시사|피칭|PT|피티|리허설|답사|로케|집합|콜\s*타임|슛|픽업|반납|녹음|합주|회식|컨펌\s*콜|킥오프|브리핑|워크숍|오티|OT)/.test(T) && !OBLIG.test(t)) return 'event';
    if ((w.time || w.date) && /(회의|미팅|약속|만나|만남|수업|면접|발표|전시|촬영|병원|저녁|점심|콜|통화|줌|zoom|meet|일정|스케줄|행사|세미나|오픈(?!채팅|톡|카톡|소스)|마감식|파티|회식|생일|생신|결혼식|송년회|신년회|기념일|돌잔치|제사|엠티|런칭|론칭|페스티벌|여행|공연|콘서트|(?<!업)데이트|식사|모임|스터디|레슨|강의|워크숍|휴가|설명회|간담회|관람|방문|상담|진료|치과|인터뷰|구경|팝업|나들이|답사|견학|투어|페어|박람회)/i.test(T) && !(dl && ACTION.test(t)) && !(OBLIG.test(t) && !w.time && /(짜|준비|섭외|확정|정리|예약)/.test(t))) return 'event';
    if (w.time && w.end && !dl) return 'event';
    if (w.time && !doit) return 'event';
    // "인쇄 감리 목요일 2시 파주": 시각이 있고, 시키는 말(~하기, ~해야)이 아니라 이름씨로 끝나면 약속. '인쇄·예약·주문' 같은 낱말이 들어 있다는 것만으로 할 일로 보지 않음
    if (w.time && w.date && !dl && !OBLIG.test(t) && !TASKEND.test(tail) && money == null && !ACTION.test(t.replace(/(인쇄|출력|주문|결제|구매|신청|발송|예약|피드백|리뷰|컨펌|검토|준비|담당|확인|공유|전달|제출|수정|작성|체크)(?![하해할한됐되])/g, '□'))) return 'event';
    if (/(오전|오후|아침|저녁|밤)(에)?(\s|$)/.test(t) && w.date && !doit && !dl) return 'event';
    if (/(회의|미팅|약속|만나|수업|면접|발표|행사|세미나|전시)/.test(T) && w.date && !(dl && /(기로|해야|야\s*(함|해|돼|됨|한다|겠)|제출|보내|넘기|넘겨|내야|내기|공유|정리|작성)/.test(t))) return 'event';
    if (dl && w.date && !/(어떨까|하면\s*좋|해볼까)/.test(t)) return 'task';
    if (dl && /(해야|야\s*(함|해|돼|됨|한다|겠)|하기로|제출|끝내|완료|마쳐|넘겨|보내)/.test(t)) return 'task';
    if (/(미룸|미뤄짐|밀림|바뀜|변경됨|취소됨|확정됨|정해짐|결정됨|하기로\s*했음)\s*$/.test(t) && !OBLIG.test(t)) return 'note';
    if (DECIDED.test(t) && !w.date && !w.time && !OBLIG.test(t) && money == null) return 'note';   /* "포스터 시안 B안으로 확정", "색상은 파스텔로 결정": 정한 것은 메모로 남김 */
    if (/(아이디어|컨셉|콘셉트|제안서?)\S*\s+(\S+\s+)?\S*(해야|야\s*(함|해|돼|됨|한다|겠))\S*\s*$/.test(t) && !/(어떨까|하면\s*좋|해볼까|하는 건 어때)/.test(t)) return 'task'; /* "아이디어 정리해야 해"는 아이디어가 아니라 할 일 */
    if (IDEA.test(t) || /(떠올|생각났|영감|후보(는|가|로)?\s|후보\s*[:：]|후보$)/.test(t)) return 'idea';
    if (/(달라고\s*(함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심|해\s*달라는|떨어짐|떨어졌|다\s*씀|다\s*썼|고장|망가졌|안\s*됨$|안\s*나옴$)/.test(t)) return 'task';
    if (/[가-힣]기로(\s*(함|했\S*))?\s*$/.test(t) && findAssignee(t, ctx.people || [])) return 'task';
    if (ACTION.test(t) || w.date || TASKEND.test(t)) return 'task';
    if (/^(send|call|email|mail|check|finish|submit|review|prepare|make|write|update|fix|book|pay|order|upload|post|schedule|reply|follow\s*up|ask|remind|draft|design|edit|print|buy)\b/i.test(t)) return /^buy\b/i.test(t) ? 'buy' : 'task';
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
      case 'event': { const rep = /매일|날마다/.test(body) ? 'daily' : /평일마다|매\s*평일|평일\s*매일/.test(body) ? 'weekdays' : /격주|2주마다|이주마다|2주에\s*한\s*번/.test(body) ? 'biweekly' : /매주|주마다/.test(body) ? 'weekly' : /매달|매월|달마다/.test(body) ? 'monthly' : ''; const r0 = { kind, label: rep ? '반복 일정' : '일정', confidence: bw.time ? 0.9 : 0.7, data: { repeat: rep, title: cleanTitle.replace(/(매일|날마다|평일마다|매\s*평일|격주|2주마다|이주마다|2주에\s*한\s*번|매주|주마다|매달|매월|달마다)\s*/g, '').trim() || '일정', date: bw.date || ymd(base), start: bw.time || '', end: bw.end || '', place: '', tags } }; const ev = r0.data; if (bw.endDate) ev.endDate = bw.endDate;
        // 날을 말하지 않았는데 그 시각이 이미 30분 넘게 지났으면 내일로 ("3시 미팅"을 저녁에 말함). 지난 일을 적는 말("3시에 미팅했어")은 그대로 오늘
        { const eu = parseUrls(body)[0]; if (eu) { ev.memo = eu; ev.title = ev.title.replace(/https?:\/\/\S+/g, ' ').replace(/(^|\s)링크(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() || ev.title; } }
        ev.title = ev.title.replace(/(^|\s)(이따가?|있다가)(?=\s)/, '$1').replace(/^\s*에\s+/, '').replace(/고\s*가야\s*(됨|함|돼|해|한다|된다)\s*$/, '고 가기').replace(/(에|도)?\s*가야\s*(됨|함|돼|해|한다|된다|지|하고|되고)\s*$/, '').replace(/\s*(잡기로\s*(함|했\S*)|잡음|잡았\S*|잡힘|잡혔\S*)\s*$/, '').replace(/\s*보러\s*갈\s*거임$/, ' 보러 가기').replace(/\s*(할|갈)\s*거임$/, '').trim() || ev.title;
        if (bw.time && bw.date === ymd(base) && !rep && !bw.endDate && (bw.hits || []).length && bw.hits.every(h => /\d\s*시|^(오전|오후|아침|저녁|밤|새벽|낮|점심)$/.test(h) && !/(오늘|내일|모레|요일|\d\s*일)/.test(h)) && !/(오늘|금일|방금|아까|지금)/.test(body) && !/(했|갔|왔|봤|났|쳤|었|았|였|렸)(어|음|다|습니다|어요|네|지|는데)|(함|옴|끝남|마침|완료)\s*$/.test(body)) { const hm = bw.time.split(':').map(Number), now = base.getHours() * 60 + base.getMinutes(); if (hm[0] * 60 + hm[1] + 30 < now) { if (/(이따|있다가|좀\s*있다|저녁|밤)/.test(body) && hm[0] < 12 && (hm[0] + 12) * 60 + hm[1] > now) ev.start = String(hm[0] + 12).padStart(2, '0') + ':' + String(hm[1]).padStart(2, '0'); else { const d1 = new Date(base); d1.setDate(d1.getDate() + 1); ev.date = ymd(d1); } } }
 ev.title = ev.title.replace(/^(이틀|사흘|나흘|\d+박\s*\d+일|\d+일간)\s*/, '').trim() || ev.title;
        { const AB = /(못\s*(?:온|와|옴|간|감|나온|나와)\S*|불참|빠진대|빠질\S*|안\s*온대)/; const am = ev.title.match(AB); if (am) { const ws0 = ev.title.slice(0, am.index).trim().split(/\s+/).filter(Boolean); const bareN = x => x.replace(/(이가|이는|이|가|는|은|님)$/, ''); const isP = x => (ctx.people || []).some(n => n === x || n.slice(1) === x) || isName(x); let k = ws0.length - 1; while (k >= 0 && !isP(bareN(ws0[k]))) k--; if (k < 0 && ws0.length) k = ws0.findIndex(x => /^[가-힣]{2,4}$/.test(bareN(x)) && !/(회의|미팅|촬영|회식|모임|행사)$/.test(x)); if (k >= 0) { const nm0 = bareN(ws0[k]); const nm = (ctx.people || []).find(n => n === nm0 || n.slice(1) === nm0) || nm0; const others = ws0.filter((_, q) => q !== k).join(' '); ev.title = `${nm.length > 2 && /^[가-힣]{3}$/.test(nm) && (ctx.people || []).includes(nm) ? nm.slice(1) : nm} ${others ? others + ' ' : ''}불참`.replace(/\s+/g, ' '); ev.who = nm; ev._allday = !ev.start; } } }
        { const lv = ev.title.match(/^(\S{2,4}?)(?:이가|이는|이|가|는|은|님)?\s+(?:.*\s)?(휴무|반차|연차|월차|휴가|출장|외근|재택|병가|조퇴|지각|결근)/); if (lv && !ev.who) { const nm = (ctx.people || []).find(n => n === lv[1] || n.slice(1) === lv[1]) || (isName(lv[1]) ? lv[1] : ''); if (nm) ev.who = nm; } }
        ev.title = ev.title.replace(/(휴무|반차|연차|월차|휴가|출장|외근|재택|병가)(이래|래|라고\s*함|이라고\s*함|임|이야)$/, '$1').replace(/^([가-힣]{2,3})이\s+(?=(휴무|반차|연차|월차|휴가|출장|외근|재택|병가))/, '$1 ');
        if (/(휴무|반차|연차|월차|휴가|출장|외근|재택|휴일|병가|결근)/.test(ev.title) && !ev.start) ev._allday = true;
        ev.title = String(ev.title || '').replace(TOPIC_RE, '$1').replace(/\s+/g, ' ').trim() || ev.title;   /* "다음 회의는 …", "킥오프 미팅은 … 성수": 제목에서 은/는을 뗌 */
        const pp = ev.who && /불참$/.test(ev.title) ? null : eventParts(ev.title, ctx.people || []); if (pp) { ev.title = String(pp.title || '').replace(/^(에서|에|이랑|랑|하고|와|과)\s+/, '').trim() || pp.title; if (pp.who) ev.who = pp.who; if (pp.place) ev.place = pp.place; if (pp.area) ev.area = pp.area; if (pp.who) ev.title = ev.title.replace(/(^|\s)(아침|저녁)$/, '$1$2식사');   /* "민서랑 저녁"의 저녁이 때를 뜻하는 말로 지워지지 않게 */ } if (!ev.place && !ev.area) ev.place = placeOf(body); ev.scope = guessScope(body, { who: ev.who || '', team: ctx.people || [] }); return r0; }
      case 'task': { let who0 = findAssignee(body, ctx.people || []); let ct = cleanTitle.replace(/^(오전|오후)?\s*중(에|으로)\s+/, '').replace(/\s+(오전|오후|아침|저녁|밤)(에|까지|중)?$/, '').replace(/(^|\s)(급함|급해|급한\s*건데|asap|ASAP)[,:：!\s]*/g, ' ').replace(/\s*마감(임|이야|입니다)?\s*$/, '').trim(); let memo = '';
        { const orm = body.match(/([월화수목금토일])(?:요일|욜)\s*(?:이나|아니면|또는)\s*(?:(?:다음|이번|담)\s*주\s*)?([월화수목금토일])(?:요일|욜)/); if (orm) ct = (ct.replace(/(^|\s)(이나|아니면|또는)(?=\s)/g, ' ').replace(/(^|\s)(중에?|쯤)(?=\s)/g, ' ').replace(/\s*(잡자|잡기|정하자|정하기)$/, '').replace(/\s+/g, ' ').trim() || '약속') + ` 잡기 (${orm[1]}·${orm[2]} 중 하루)`; }
        // "서연이한테 영상 편집 맡기기" → 담당 서연, 할 일 영상 편집
        { const hm = ct.match(/^(\S{1,6}?)(?:이)?(?:한테|에게|께)\s+(.+?)\s*(?:맡기기|맡기|맡김|맡겨|시키기|시키)\S*$/); if (hm) { const nm = (ctx.people || []).find(n => n === hm[1] || n.slice(1) === hm[1]); if (nm || /^[가-힣]{2,3}$/.test(hm[1])) { who0 = nm || hm[1]; ct = hm[2]; } } }
        // "클라이언트가 로고 색 바꿔달라고 함" → 로고 색 바꿔 주기 (클라이언트 요청)
        { const rm = ct.match(/^(?:(\S{1,8}?)(?:이|가|께서|님이)\s+)?(.+?)\s*(?:달라고\s*(?:함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심)$/); if (rm) { ct = rm[2].replace(/\s*(해|줘)$/, m0 => m0) + ' 주기'; ct = ct.replace(/해\s*주기$/, '해 주기').replace(/\s+/g, ' '); if (rm[1] && !(ctx.people || []).some(n => n === rm[1] || n.slice(1) === rm[1])) memo = rm[1] + ' 요청'; if (rm[1] && who0 === rm[1]) who0 = ''; } }
        const who = who0 === '나' ? '' : who0; return { kind, label: '할 일', confidence: 0.75, data: { who, ...(memo ? { memo } : {}), title: (/주기$/.test(ct) && memo ? ct : cleanTask(ct, who)) || ct || body, due: (() => { const dl = isDeadline(body) ? deadlineDate(body, base) : ''; return dl && !(bw.date && new Date(dl).getDay() === new Date(bw.date).getDay()) ? dl : (bw.date || dl || ''); })(), time: isDeadline(body) && !/(\d\s*시|\d:\d\d)\s*(반\s*)?(까지|전까지)/.test(body) && !/마감/.test(body) ? '' : (bw.time || ''), priority: /(급|급함|asap|ASAP|중요|빨리|꼭|반드시|!!)/.test(body) ? 'high' : 'normal', project: projectOf(body, ctx), tags } }; }
      case 'expense': { const X = moneyParts(body, bw); return { kind, label: '지출', confidence: X.amount ? 0.85 : 0.6, data: { title: X.title.replace(/\s*(내가|제가|우리가)?\s*(결제|샀다|샀어|샀음|삼|썼다|썼어|썼음|씀|지출|냈다|냈어|냈음|냄|했다|입금함|입금했어|입금|결제함|결제했어|긁음|긁었어|송금함|송금했어|보냄|보냈어)\s*$/, '').trim() || '지출', amount: X.amount, date: bw.date || ymd(base), category: guessCategory(body), project: projectOf(body, ctx), pay: /(법인|회사|팀)\s*카드|법카/.test(body) ? '법인카드' : /현금/.test(body) ? '현금' : /(계좌\s*이체|이체|송금|입금)/.test(body) ? '계좌이체' : '개인카드', ...(X.memo ? { memo: X.memo } : {}) } }; }
      case 'income': { const X = moneyParts(body, bw); const got = /(입금\s*(됨|됐|받|확인|완료)|들어옴|들어왔|받음|받았|수금\s*(함|완료))/.test(body) && !/(안\s*들어|아직|예정|받기로|받을)/.test(body);
        const from = (ctx.vendors || []).find(n => n && body.includes(n)) || (X.title.match(/^([가-힣A-Za-z0-9]{2,12}?)(?:에서|한테서|에게서|한테|이|가)?\s+(?:.*\s)?(?:계약금|선금|착수금|잔금|중도금|미수금|매출|대금|제작비|입금)/) || [])[1] || (X.title.match(/^(?:세금\s*)?계산서\s+(?:발행\s+)?([가-힣A-Za-z0-9]{2,12})(?=\s|$)/) || [])[1] || (X.title.match(/^([가-힣A-Za-z0-9]{2,12}?)(?:이)?(?:한테서|에게서|한테|에게)\s/) || [])[1] || '';
        return { kind, label: got ? '받은 돈' : '받을 돈', confidence: X.amount ? 0.8 : 0.6, data: { title: X.title.replace(/(^|\s)(은|는|에)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s*(입금\s*(됨|됐어요?|됐음|받음|받았어요?|예정|확인|완료|된대)|들어옴|들어왔어요?|들어온대|들어온다|들어올\s*(예정|거)?|받기로\s*(함|했어요?|했음)?|받아야\s*(함|됨|해|돼|한다)?|받음|받았어요?|받을\s*(돈|거|게|예정)|안\s*들어왔?\S*|아직)\s*$/, '').replace(/(이)?(한테|에게)\s+빌려\s*(준|줬\S*|줌)(\s*(돈|거))?\s*$/, ' 빌려준 돈').replace(/^([가-힣A-Za-z0-9]{2,12}?)(한테서|에게서|한테|에게)\s+/, '$1 ').replace(/\s*발행\s*(완료|함|했어요?|했음|됨)\s*$/, '').replace(from ? new RegExp('^' + esc(from) + '(에서|한테서|에게서|한테)(?=\\s)') : /$^/, from).replace(/\s+/g, ' ').trim() || '받을 돈', amount: X.amount, date: bw.date || (got ? ymd(base) : ''), from, project: projectOf(body, ctx), status: got ? 'got' : 'due', ...(X.memo ? { memo: X.memo } : {}) } }; }
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
      case 'reference': return { kind, label: '레퍼런스', confidence: 0.8, data: { title: strip(body.replace(/https?:\/\/\S+/g, '').replace(/(레퍼런스|참고)?\s*(으로|로|에)?\s*(저장|추가|넣어|담아)\s*(해\s*)?(줘|주세요|둬|놔)?\s*$/, ' '), []) || (parseUrls(body)[0] || '레퍼런스'), url: parseUrls(body)[0] || '', tags: tags.length ? tags : keywords(body.replace(/레퍼런스|참고/g, ''), 4) } };
      case 'vendor': { const v = vendorParts(body, ctx.vendors || []); return { kind, label: '업체', confidence: v.name && (v.phone || v.link || v.prices.length) ? 0.8 : 0.6, data: v }; }
      case 'buy': { const u = parseUrls(body)[0] || ''; return { kind, label: '살 것', confidence: 0.75, data: { title: strip(body.replace(/https?:\/\/\S+/g, '').replace(/\d[\d,]*\s*(만\s*)?(\d+\s*천\s*)?원/g, ' ').replace(/(쯤|정도)?\s*하더라/g, ' ').replace(/(^|\s)사기(?=\s|$)/g, ' ').replace(/(뭐|뭘)\s*(사지|살까)/g, ' ').replace(/(^|\s)(이하|이내|선에서|안쪽)(으로|로)?(?=\s|$)/g, ' ').replace(/\d원?대(?=\s|$)/g, ' ').replace(/(^|\s)(쯤|정도|대|에서)(?=\s|$)/g, ' ').replace(/(사야\s*(되는데|하는데|되고|하고|됨|돼|해|함|겠다)?|살\s*거|살\s*것|구매\s*(목록|예정|할\s*것)?(에)?\s*(추가|넣어)?(해\s*줘|줘)?|장바구니(에)?\s*(추가|넣어)?(해\s*줘|줘)?|주문해야\s*(돼|해)?)/g, ' '), []) || '(상품명을 적어 주세요)', url: u, price: parseMoney(body) || 0, qty: 1, need: 'must' } }; }
      case 'idea': body = body.replace(/^\s*(아이디어\s*(메모)?\s*[:：]?|💡|(지금\s*|갑자기\s*)?생각난\s*(거|건데|게)|생각났는데)\s+(?=\S)/, ''); return { kind, label: '아이디어', confidence: 0.7, data: { title: summarize(body, 1)[0]?.slice(0, 60) || body.slice(0, 60), body, tags: tags.length ? tags : keywords(body, 5) } };
      case 'note': { body = body.replace(/^\s*메모\s+(?=\S)/, ''); const dec = DECIDED.test(' ' + body.trim()); return { kind, label: '메모', confidence: dec ? 0.75 : 0.6, data: { title: dec ? '결정: ' + body.trim().replace(/\s*(으로|로)\s*(최종\s*)?(확정|결정|정함|정했어요?|정했음|가기로\s*(함|했\S*)|하기로\s*(함|했\S*))\s*[.!]*\s*$/, '').replace(/(은|는)\s+/, ' → ').slice(0, 60) : (/^\d[\d,.]*\s*(만|천|억|원|개|명|장|시|분|%|년|월|일|주|번|차)/.test(body.trim()) ? body.trim() : summarize(body, 1)[0] || body).slice(0, 60), body, tags: tags.length ? (dec && !tags.includes('결정') ? ['결정', ...tags] : tags) : [...(dec ? ['결정'] : []), ...keywords(body, 6)].slice(0, 6) } }; }
      case 'timelog': { const tw = parseWhen(body, base); const span = tw.time && tw.end ? (+tw.end.slice(0, 2) * 60 + +tw.end.slice(3)) - (+tw.time.slice(0, 2) * 60 + +tw.time.slice(3)) : 0; const m = span > 0 ? span : tw.mins || 60; body = span > 0 ? strip(body, tw.hits).replace(/^(부터|까지)\s*/, '') : body; return { kind, label: '작업 기록', confidence: 0.8, data: { title: strip(body, tw.hits).replace(/\d+\s*(시간|분)\s*(동안)?/g, '').replace(/\s*(작업)?\s*(했음|했다|했어|함|완료)$/, '').trim() || '작업', minutes: m, date: tw.date && tw.date <= ymd(base) ? tw.date : ymd(base), project: projectOf(body, ctx) } }; }
      case 'sns': return { kind, label: 'SNS 아이디어', confidence: 0.75, data: { title: cleanTitle.replace(/(^|\s)올릴\s*(거|것)(?=\s)/, '$1').replace(/^(인스타그램|인스타|틱톡|유튜브|블로그)(에는|에|는|은)\s+/, '').replace(/(^|\s)에(?=\s)/g, ' ').replace(/^((릴스|쇼츠|틱톡|유튜브|인스타)\s*)?아이디어\s*(생각났는데|떠올랐는데|생각난\s*건데|인데)\s*/, '$1').replace(/\s+/g, ' ').trim() || cleanTitle, platform: /(릴스|인스타)/.test(body) ? '인스타그램' : /(쇼츠|유튜브)/.test(body) ? '유튜브' : /틱톡/.test(body) ? '틱톡' : '인스타그램', status: '아이디어', date: bw.date || '', tags } };
      case 'okr': return { kind, label: '목표', confidence: 0.7, data: { title: cleanTitle.replace(/^(이번|다음|올해|\d분기)?\s*(분기|달|연도)?\s*(목표|OKR|okr)\s*(는|은|:|：)?\s*/, '').trim() || cleanTitle, quarter: quarterOf(base), krs: [] } };
      case 'act': { const ap = actParse(body, base); return { kind, label: '대외활동', confidence: 0.75, data: { title: actTitle(body) || cleanTitle, type: ap.type || 'contest', due: ap.due || bw.date || '', link: parseUrls(body)[0] || '', body: '', part: ap.part || '', teamMin: ap.teamMin || null, teamMax: ap.teamMax || null, who: ap.who || '', whoNote: ap.whoNote || '', region: ap.region || '', host: ap.host || '', prize: ap.prize || '', start: ap.start || '', status: 'want' } }; }
      case 'grant': { const ek = body.match(/(?:최대\s*)?(\d+(?:\.\d+)?)\s*억\s*(?:(\d+)\s*천)?\s*(?:만\s*)?원?/); const amt = ek ? Math.round(parseFloat(ek[1]) * 1e8 + (+(ek[2] || 0)) * 1e7) : parseMoney(body) || null;
        return { kind, label: '지원사업', confidence: 0.7, data: { title: cleanTitle.replace(/(최대\s*)?\d+(\.\d+)?\s*억\s*(\d+\s*천)?\s*(만\s*)?원?/, ' ').replace(/(최대\s*)?\d[\d,]*\s*(천만|백만|만|천)?\s*원/, ' ').replace(/^(지원사업|공모전|공고)\s*(떴다|떴음|뜸|나옴|나왔\S*|올라옴)\s*/, '').replace(/\s*(마감|접수\s*마감|신청\s*마감|지원금|최대)\s*/g, ' ').replace(/\s+/g, ' ').trim() || cleanTitle, deadline: bw.date || '', status: '검토', amount: amt, url: parseUrls(body)[0] || '' } }; }
      default: return { kind: 'note', label: '메모', confidence: 0.5, data: { title: body.slice(0, 60), body, tags } };
    }
  }
  // 금액 읽기: "20만 x 3", "8천원씩 5명", "총 60만", 단위 없는 "12800", 3.3% 메모
  function moneyParts(body, bw) {
    body = body.replace(/(\d\s*원)(짜리|어치)(?=\s|$)/g, '$1 ').replace(new RegExp('(^|\\s)(월|연|매월|매달|한\\s*달에)\\s+(?=' + MONEY_SRC + ')'), '$1');   // "구독 월 6만2천원"의 "월"   // "5천원짜리 커피", "3만원어치 간식"
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
    ttl = strip(ttl.replace(MR, ' ').replace(/(?:총|합계|합쳐서|토탈)\s*(?=\s|$)/g, ' ').replace(/\(?\s*부가세\s*(포함|별도)\s*\)?/g, ' ').replace(/3\.3\s*%\s*(떼고|제외|공제)?/g, ' '), bw.hits).replace(/(법인\s*카드|회사\s*카드|개인\s*카드|법카|개카|카드로|카드|현금으로|현금|계좌\s*이체)(으로|로)?(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
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
const AREA = /^((서|동|남|북)?[가-힣]{1,3}(시|군|구|동|읍|면|도)|서충주|충주|서울|홍대|강남|성수|합정|연남|망원|이태원|한남|을지로|종로|대학로|잠실|여의도|판교|분당|일산|부산|해운대|대전|대구|광주|인천|수원|청주|제주|전주|춘천|강릉|원주|천안|세종|울산|창원|포항|경주|여수|목포|파주|용산|신촌|건대|압구정|청담|마포|상수|문래|서촌|북촌|선릉|역삼|고양|김포|하남|구리|안양|부천|성남|용인|평택|안산|화성|의정부|남양주|양평|가평|속초|양양|통영|거제|순천|군산|안동|구미|김해)$/;
// "전시", "운동", "화면"처럼 끝 글자만 지역 같은 흔한 말은 지역이 아님
const NOT_AREA = /^(전시|도시|임시|잠시|동시|일시|수시|역시|즉시|다시|표시|무시|당시|게시|공시|제시|명시|개시|상시|감시|응시|출시|고시|활동|행동|운동|이동|감동|자동|수동|노동|진동|변동|작동|연동|공동|합동|아동|협동|화면|장면|측면|방면|정면|표면|전면|국면|수면|라면|냉면|가면|태도|정도|지도|제도|용도|속도|온도|강도|진도|각도|시도|의도|유도|보도|주도|과도|구도|농도|빈도|고도|포도|기도|효도|검도)$/;
const isArea = x => AREA.test(x) && !NOT_AREA.test(x);
const DOING = /(?:\s|^)((?:전시|공연|영화|팝업|박람회|페어|콘서트|축제|행사)?\s*(?:방문|관람|구경|보기|보러\s*가기|미팅|회의|촬영|답사|식사|점심|저녁|약속|모임|견학|투어|상담|인터뷰|수업|강의|워크숍|설치|철수|회식|데이트|나들이|여행|전시|공연|팝업))$/;
const FAMILY = '엄마|아빠|어머니|아버지|할머니|할아버지|이모|고모|삼촌|언니|오빠|누나|형|동생|친구|남친|여친|남자친구|여자친구|남편|아내|와이프';
const TITLE_SUF = '대표님?|팀장님?|실장님?|교수님?|선생님|쌤|작가님?|감독님?|피디님?|PD님?|사장님|주무관님?|대리님?|과장님?|차장님?|부장님?|매니저님?|님';
const DECIDED = /[가-힣A-Za-z0-9]\s*(으로|로)\s*(최종\s*)?(확정|결정|정함|정했어요?|정했음|가기로\s*(함|했\S*)|하기로\s*(함|했\S*))\s*[.!]*\s*$/;
const PLACE_RE = /(역|카페|센터|빌딩|학교|대학교|대학|캠퍼스|사무실|스튜디오|홀|관|시청|구청|도청|군청|청사|병원|치과|의원|미술관|박물관|도서관|공원|극장|갤러리|플라자|타워|식당|집|본점|지점|점|DDP|코엑스|킨텍스|벡스코)$/;
// 끝 글자만 같고 곳이 아닌 낱말 ("편집 회의"의 편집, "번역 미팅"의 번역 …)
const NOTPLACE = /^(편집|수집|모집|채집|소집|결집|특집|문집|시집|전집|선집|화집|고집|밀집|응집|촬영편집|영상편집|주관|보관|입관|개관|휴관|세관|습관|기관|주역|통역|번역|지역|영역|구역|현역|용역|무역|교역|악역|배역|단역|대역|시점|관점|초점|요점|중점|장점|단점|강점|약점|문제점|개선점|차이점|공통점|쟁점|논점|거점|정점|종점|기점|득점|감점|가산점|학점|평점|총점|만점|오점|맹점|접점|원점|시작점|출발점|도착점|진단|이의원|의원|국회의원|시의원|구의원)$/;
const PLACE_SUF = { test: x => PLACE_RE.test(x) && !NOTPLACE.test(x) };
const MEET = '미팅|회의|상담|인터뷰|식사|점심|저녁|약속|통화|콜|회식|모임|촬영|수업';
const TAILACT = new RegExp(`(${MEET}|감리|답사|리허설|워크숍|세미나|행사|시사회|설치|철수|납품|수령|픽업|출장|견학|면접|발표|공연|전시)$`);
const TOPIC_RE = new RegExp(`((?:${MEET}|행사|발표|마감|리허설|답사|감리|워크숍|세미나|시사회))(?:은|는)(?=\\s|$)`, 'g');
const SHOP = /^(스타벅스|스벅|투썸|투썸플레이스|이디야|할리스|메가커피|컴포즈|폴바셋|블루보틀|커피빈|파스쿠찌|빽다방|탐앤탐스|엔제리너스)$/;
const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function eventParts(title, people = []) {
  let t = String(title || '').replace(/\s+/g, ' ').trim().replace(/\s*하기로\s*(했어요?|했음|함|했다|했습니다|했지|했거든)[.!]*$/, '').replace(/([가-힣])기로\s*(했어요?|했음|함|했다|했습니다|했지|했거든)[.!]*$/, '$1기').trim(); if (!t) return null; let who = '', area = '', place = '';
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
  if (!place && (m = t.match(/(^|\s)((?:\S+\s)?\S+?)에서(?:\s+(?:하는|열리는|있는|진행하는|진행되는|한다는))?(?=\s|$)/))) { /* "서충주에서 하는 전시" → 곳 서충주, 제목 전시 */ const ph = m[2].trim(); const ws = ph.split(' '); if (ws.length === 2 && isArea(ws[0])) area = ws[0]; if (isArea(ph)) area = ph; else place = ph; cut(m); }
  let words = t.split(' ');
  if (!area && words.length > 1 && isArea(words[0].replace(/(에서|에)$/, '')) && !(words.length > 2 && /^(스튜디오|카페|사무실|센터|갤러리|극장|식당|공원)$/.test(words[1]))) {   /* "성수 스튜디오 촬영"은 곳이 "성수 스튜디오" */ area = words.shift().replace(/(에서|에)$/, ''); t = words.join(' '); }
  // 곳이 맨 뒤에 온 말: "촬영 성수 스튜디오" → 곳 성수 스튜디오, "인쇄 감리 파주" → 곳 파주
  if (!place) { words = t.split(' '); const L = words.length - 1;
    if (L >= 1 && PLACE_SUF.test(words[L]) && words[L].length >= 2 && !(who && words[L].includes(who))) {
      if (L >= 2 && isArea(words[L - 1])) { place = words.slice(L - 1).join(' '); t = words.slice(0, L - 1).join(' '); }
      else if (TAILACT.test(words[L - 1])) { place = words[L]; t = words.slice(0, L).join(' '); } }
    else if (L >= 1 && !area && isArea(words[L]) && TAILACT.test(words[L - 1])) { area = words[L]; t = words.slice(0, L).join(' '); } }
  // 이름 끝이 장소 같은 말 (○○센터, ○○시청, ○○역…): 앞에 붙은 말까지 묶음. 바로 뒤가 가게 이름이면 같이 묶음 ("강남역 스타벅스")
  if (!place) { words = t.split(' '); let k = words.findIndex(x => (PLACE_SUF.test(x) && x.length >= 2) || SHOP.test(x)); while (k >= 0 && k < words.length - 2 && k <= 2 && (SHOP.test(words[k + 1]) || (PLACE_SUF.test(words[k + 1]) && words[k + 1].length >= 3))) k++; if (k >= 0 && k <= 2 && !(who && words.slice(0, k + 1).join(' ').includes(who))) { place = words.slice(0, k + 1).join(' '); const restT = words.slice(k + 1).join(' '); if (/^(에\s*)?(가야\s*\S*(\s*\S{1,2})?|가기|감|갈\s*\S*|들르\S*|다녀오\S*)$/.test(restT)) t = place; else if (restT.length >= 2) t = restT; } }
  // 보러 가는 일정이면 앞말이 장소
  const dm = t.match(DOING);
  if (!place && dm && dm.index > 0) { const head = t.slice(0, dm.index).trim().replace(/(에서|에|으로|로)$/, ''); if (head && head.split(' ').length <= 3 && !/(하|되)$/.test(head) && /(방문|관람|구경|보기|가기|견학|투어|답사|전시|공연|팝업|나들이|여행|데이트)$/.test(dm[1])) place = head; }
  if (!who && !area && !place) return null;
  if (t.length <= 3 && who && !t.includes(who)) { const c = who.charCodeAt(who.length - 1); const bat = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 > 0 : false; t = `${who}${bat ? '과' : '와'} ${t}`.trim(); } else if (t.length <= 3 && area) t = `${area} ${t}`.trim(); else if (!t) t = place || title;
  if (place && /^(보러\s*가기|보러\s*감|가기|가야\s*\S*|예약하기|예약|방문하기|방문|구경|관람|들르기|다녀오기|답사)$/.test(t) && !t.includes(place)) t = `${place} ${t}`;   /* "전시 보러 가기"가 "보러 가기"만 남지 않게 */
  return { title: t || title, who, area, place };
}
function placeOf(s) { const re = /([가-힣A-Za-z0-9]+(?:역|카페|센터|빌딩|학교|대학교|캠퍼스|사무실|스튜디오|홀|관|층|호|점))(?:에서|서)?(?=\s|$)/g; let m; while ((m = re.exec(s))) if (!NOTPLACE.test(m[1]) && !/^\d+호$|^(번호|신호|기호|보호|선호|암호|구호|간호|상호|부호|애호|옹호|수호|단층|고층|계층|상층|하층)$/.test(m[1])) return m[1]; return ''; }
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
    if (tk.length < 2 || PGEN.test(tk) || isArea(tk)) continue;
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
    if (/\d\s*일|\d{1,2}[/.]\d{1,2}/.test(src)) t = t.replace(/(^|\s)(내년|올해|금년)(에)?(?=\s|$)/, ' ');   // "내년 1월 2일 시무식" → "시무식"
    if (/\d\s*일|\d{1,2}[/.]\d{1,2}|\d\s*주\s*(뒤|후)/.test(src)) t = t.replace(/(^|\s)\(?[월화수목금토일]요일\)?(이랑|랑|에)?(?=\s|$)/g, ' '); // 날짜를 말했으면 요일은 제목에서 뺌
    if (r.kind === 'event' || r.kind === 'income') t = t.replace(/^(\S{1,12}?)(은|는)(?=\s|$)/, (m0, a, j) => (new RegExp('^\\s*' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + j + '\\s+(\\d|오늘|내일|모레|다음|이번|팝업|[월화수목금토일]요일)').test(src) ? a : m0)); // "PT는 12월 9일 …" → "PT"
    t = t.replace(/^(까지|부터)(?=[가-힣A-Za-z])/, '');   // 붙여 쓴 "수욜까지시안"
    if (r.kind === 'task') t = t.replace(/^(.{2,}?)(은|는)\s+(하기|맡기|담당하기|담당)$/, '$1').replace(/^([가-힣A-Za-z0-9]{2,10})(은|는)\s+([가-힣]{1,4}기)$/, '$1 $3');   // "포스터는 … 민서가 하기로 했어" → "포스터"
    t = t.replace(/\s+/g, ' ').trim(); if (t) d.title = t;
  }
  if (r.kind === 'event' && d.title) { const t2 = d.title.replace(/^(나|내가|저|제가|나는|저는)\s+/, '').replace(/(^|\s)(오전|오후|밤|새벽)에?(?=\s|$)/g, ' ').replace(/(?<!(?:이랑|랑|하고|와|과)\s)(?<=^|\s)(아침|저녁)에?(?=\s|$)(?!\s*(?:약속|식사|먹|모임|회식))/g, ' ').replace(/\s+/g, ' ').trim();   /* "민서랑 저녁", "저녁 약속"의 저녁은 때가 아니라 밥이라 남김 */ if (t2 && t2 !== d.title) { if (d.place === d.title) d.place = t2; d.title = t2; } }
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
export function learnKind(text, kind) { const kw = keywords(text, 6).filter(x => !x.includes(' ') && !GENERIC.test(x) && !isName(x) && !new RegExp(`(${KIN}|${FAMILY})$`).test(x) && !isArea(x)).pop(); if (kw) learned.kind[kw] = kind; return learned; }

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
