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
  const t = ' ' + text + ' ';
  const b = new Date(base); b.setHours(0, 0, 0, 0);
  let date = null, time = null, end = null;
  const hits = [];
  const hit = m => { if (m) hits.push(m[0].trim()); return m; };
  let m;

  // 절대 날짜
  if ((m = hit(t.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/)))) date = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = hit(t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) || (m = hit(t.match(/(?<![\d:])(\d{1,2})[/.](\d{1,2})(?![\d:])/)))) {
    const mo = +m[1], da = +m[2];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      date = new Date(b.getFullYear(), mo - 1, da);
      if (date < addD(b, -60)) date.setFullYear(date.getFullYear() + 1);
    }
  }
  else if ((m = hit(t.match(/(\d{1,2})\s*월\s*(말|초|중순)/))) && +m[1] >= 1 && +m[1] <= 12) { date = m[2] === '말' ? new Date(b.getFullYear(), +m[1], 0) : new Date(b.getFullYear(), +m[1] - 1, m[2] === '초' ? 1 : 15); if (date < addD(b, -60)) date.setFullYear(date.getFullYear() + 1); }
  else if ((m = hit(t.match(/(다음\s*달|담달|이번\s*달|이달)\s*(\d{1,2})\s*일/))) && +m[2] >= 1 && +m[2] <= 31) date = new Date(b.getFullYear(), b.getMonth() + (/다음|담/.test(m[1]) ? 1 : 0), +m[2]);
  // 여러 날: 시작일 바로 뒤의 "6일", "~6일", "부터 6일까지"
  let endDate = null;
  if (date) { const last = hits.at(-1); const rest = t.slice(t.indexOf(last) + last.length); const em = rest.match(/^\s*(?:~|-|부터|,)?\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일(?:까지)?/); if (em && /일$/.test(last)) { const e = new Date(date.getFullYear(), em[1] ? +em[1] - 1 : date.getMonth(), +em[2]); if (e > date && e - date < 15 * 864e5) { endDate = e; hits.push(em[0].trim()); } } }
  // 상대 날짜
  if (!date) {
    if ((m = hit(t.match(/(오늘|금일)\s*(안에|안으로|중으로|중에|내로)/)))) date = b;
    else if ((m = hit(t.match(/(내일|낼)\s*(안에|안으로|중으로|중에|내로)/)))) date = addD(b, 1);
    else if ((m = hit(t.match(/(이번\s*주|금주)\s*(안에|안으로|내로|내에|중으로|중에|까지)/)))) { const fri = addD(b, -((b.getDay() + 6) % 7) + 4); date = fri < b ? addD(fri, 2) : fri; }
    else if ((m = hit(t.match(/((이번\s*달|이달)\s*말|월말|말일)/)))) date = new Date(b.getFullYear(), b.getMonth() + 1, 0);
    else if ((m = hit(t.match(/(오늘|금일)/)))) date = b;
    else if ((m = hit(t.match(/(내일|낼)(?!모레)/)))) date = addD(b, 1);
    else if ((m = hit(t.match(/(모레|내일모레)/)))) date = addD(b, 2);
    else if ((m = hit(t.match(/글피/)))) date = addD(b, 3);
    else if ((m = hit(t.match(/어제/)))) date = addD(b, -1);
    else if ((m = hit(t.match(/(\d+|한|두|세|네|다섯|여섯|일곱)\s*(일|주|달|개월)\s*(후|뒤|있다가)/)))) {
      const n = numOf(m[1]);
      date = m[2] === '일' ? addD(b, n) : m[2] === '주' ? addD(b, n * 7) : new Date(b.getFullYear(), b.getMonth() + n, b.getDate());
    }
    else if ((m = hit(t.match(/(이번\s*주|이번주|금주|다음\s*주|담주|다담주|다다음\s*주|저번\s*주|지난\s*주)?\s*(월|화|수|목|금|토|일)요일/)))) {
      const target = KDAY[m[2]];
      const mon = addD(b, -((b.getDay() + 6) % 7));
      let off = 0;
      const w = (m[1] || '').replace(/\s/g, '');
      if (/다다음주|다담주/.test(w)) off = 14; else if (/다음주|담주/.test(w)) off = 7; else if (/저번주|지난주/.test(w)) off = -7;
      // "다음주 중 작업 목요일까지"처럼 주 표현이 요일과 떨어져 있어도 같이 읽음
      let far = null; if (!w && (far = t.match(/(이번\s*주|이번주|금주|다음\s*주|다음주|담주|다담주|다다음\s*주|다다음주)\s*(중에|중으로|중|안에|안으로|내로|내에)?(?=\s|$)/))) { const fw = far[1].replace(/\s/g, ''); off = /다다음주|다담주/.test(fw) ? 14 : /다음주|담주/.test(fw) ? 7 : 0; hits.push(far[0].trim()); }
      date = addD(mon, off + ((target + 6) % 7));
      // 주를 말하지 않은 요일이 오늘이거나 지났으면 다음 주 그 요일 (오늘이면 보통 "오늘"이라고 하니까)
      if (!w && !far && date <= b) date = addD(date, 7);
    }
    else if ((m = hit(t.match(/(다다음\s*주|다담주)\s*(중에|중으로|중|안에|내로)?(?=\s|$)/)))) date = addD(addD(b, -((b.getDay() + 6) % 7)), 14);
    else if ((m = hit(t.match(/(다음\s*주|담주|다음주)\s*(중에|중으로|중|안에|내로)?(?=\s|$)/)))) date = addD(addD(b, -((b.getDay() + 6) % 7)), 7);
    else if ((m = hit(t.match(/(이번\s*주말|주말)/)))) date = addD(b, (6 - b.getDay() + 7) % 7);
    else if ((m = hit(t.match(/(이번\s*달|이달)\s*(말|안)/)))) date = new Date(b.getFullYear(), b.getMonth() + 1, 0);
    else if ((m = hit(t.match(/(다음\s*달|담달)\s*(초)?/)))) date = new Date(b.getFullYear(), b.getMonth() + 1, m[2] ? 1 : b.getDate());
    else if ((m = hit(t.match(/(?<![\d월/.])(\d{1,2})\s*일(?![\d간정])(?=\s|까지|에|날|$|,)/)))) {
      const da = +m[1];
      if (da >= 1 && da <= 31) { date = new Date(b.getFullYear(), b.getMonth(), da); if (date < b) date.setMonth(date.getMonth() + 1); }
    }
  }

  // 시간
  const ampm = s => /오후|저녁|밤|pm|PM/.test(s) ? 'pm' : /오전|아침|새벽|am|AM/.test(s) ? 'am' : /점심|낮/.test(s) ? 'noon' : '';
  const toH = (h, ap) => {
    h = +h;
    if (ap === 'pm' && h < 12) h += 12;
    else if (ap === 'am' && h === 12) h = 0;
    else if (ap === 'noon' && h < 6) h += 12;
    else if (!ap && h >= 1 && h <= 7) h += 12; // "3시 회의" → 보통 오후
    return h;
  };
  let tm;
  if ((tm = hit(t.match(/(오전|오후|아침|점심|저녁|밤|새벽|낮)?\s*(\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*시\s*(반|(\d{1,2})\s*분)?\s*(?:부터|~|-|에서)\s*(오전|오후|저녁|밤)?\s*(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/)))) {
    const ap = ampm(tm[1] || '');
    const h1 = toH(numOf(tm[2]), ap); const m1 = tm[3] === '반' ? 30 : +(tm[4] || 0);
    let h2 = toH(+tm[6], ampm(tm[5] || '') || (ap === 'am' && +tm[6] < numOf(tm[2]) ? 'pm' : ap)); const m2 = tm[7] === '반' ? 30 : +(tm[8] || 0);
    if (h2 < h1) h2 += 12;
    time = `${pad(h1)}:${pad(m1)}`; end = `${pad(Math.min(h2, 23))}:${pad(m2)}`;
  } else if ((tm = hit(t.match(/(\d{1,2}):(\d{2})\s*(?:~|-|부터)\s*(\d{1,2}):(\d{2})/)))) {
    time = `${pad(+tm[1])}:${tm[2]}`; end = `${pad(+tm[3])}:${tm[4]}`;
  } else if ((tm = hit(t.match(/(오전|오후|아침|점심|저녁|밤|새벽|낮|am|pm|AM|PM)?\s*(\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*시(?!간)\s*(반|(\d{1,2})\s*분)?/)))) {
    const h1 = toH(numOf(tm[2]), ampm(tm[1] || ''));
    if (h1 <= 24) time = `${pad(h1 % 24)}:${pad(tm[3] === '반' ? 30 : +(tm[4] || 0))}`;
  } else if ((tm = hit(t.match(/(?<![\d.])([01]?\d|2[0-3]):([0-5]\d)(?![\d])/)))) {
    time = `${pad(+tm[1])}:${tm[2]}`;
  } else if ((tm = hit(t.match(/정오/)))) time = '12:00';
  else if ((tm = hit(t.match(/자정/)))) time = '23:59';

  if (!date && time) date = b;
  // 기간(소요시간): "1시간", "30분 동안"
  let mins = null;
  if ((m = t.match(/(\d+(?:\.\d+)?|한|두|세)\s*시간(?:\s*(\d+)\s*분)?/))) mins = Math.round(numOf(m[1]) * 60 + +(m[2] || 0));
  else if ((m = t.match(/(\d+)\s*분\s*(동안|정도|간)?/)) && !time) mins = +m[1];
  if (time && !end && mins) { const [hh, mm] = time.split(':').map(Number); const e = hh * 60 + mm + mins; end = `${pad(Math.min(23, Math.floor(e / 60)))}:${pad(e % 60)}`; }

  return { date: date ? ymd(date) : null, time, end, mins, hits, endDate: endDate ? ymd(endDate) : null };
}

// "까지" → 마감일
export function isDeadline(text) { return /까지|마감|데드라인|due|제출일/.test(text); }

// ── 금액·전화·이메일 ─────────────────────────────────────────
export function parseMoney(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?\s*(?:(\d+)\s*백)?\s*원?/);
  if (m && /만/.test(m[0])) return Math.round(parseFloat(m[1]) * 10000 + (+(m[2] || 0)) * 1000 + (+(m[3] || 0)) * 100);
  m = text.match(/(\d+)\s*천\s*(?:(\d+)\s*백)?\s*원/);
  if (m) return +m[1] * 1000 + (+(m[2] || 0)) * 100;
  m = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(원|₩|krw)/i) || text.match(/₩\s*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (m) return +m[1].replace(/,/g, '');
  return null;
}
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
  const ss = sentences(text);
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
  for (let it = 0; it < 30; it++) {
    r = r.map((_, i) => 0.15 + 0.85 * W.reduce((acc, row, j) => { const sum = row.reduce((x, y) => x + y, 0); return acc + (sum ? (W[j][i] / sum) * r[j] : 0); }, 0));
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

export function findAssignee(s, people = []) {
  const names = [...(people || []), ...(learned.people || [])].filter(Boolean);
  for (const n of names) if (s.includes(n)) return n;
  // 성 빼고 이름만 불러도 알아듣기 (김민서 → 민서)
  for (const n of names) if (/^[가-힣]{3}$/.test(n) && new RegExp(n.slice(1) + '(님한테|님께|님에게|님이|님|씨|이|가|이가|한테|에게|께)?[\\s,]').test(s + ' ')) return n.slice(1);
  const m = s.match(/([가-힣]{2,4})(?:님|씨|이가|가|이)\s*(?:이|가)?\s*(?:맡|담당|하기로|해\s*주|준비|정리|만들|보내|작성|해오)/);
  if (m && !STOP.has(m[1]) && !/^(우리|저희|제가|내가|그게|이게|이거|그거|다음|이번)$/.test(m[1])) return m[1];
  if (/(제가|내가|저는|나는)\s*/.test(s) && ACTION.test(s)) return '나';
  return '';
}

export function cleanTask(s, who = '') {
  let r = tidy(s).replace(/(^|\s)(급하게|급히|빨리|꼭|반드시|무조건)(?=\s)/g, ' ').replace(/(이번\s*주|금주|오늘|내일|월말|말일|이번\s*달\s*말)\s*(안에|안으로|중으로|중에|내로|내에|까지)/g, ' ');
  { const end = { 겨: '기기', 려: '리기', 봐: '보기', 워: '우기', 와: '오기', 써: '쓰기', 줘: '주기', 꿔: '꾸기', 춰: '추기', 내: '내기', 해: '하기' }; r = r.replace(/(겨|려|봐|워|와|써|줘|꿔|춰|내|해)야\s*(해|돼|함|됨|겠다|한다|하는데|되는데|지)\S*\s*$/, (m0, a) => end[a]).replace(/([받찾닫믿얻])아야\s*(해|돼|함|됨|겠다|한다|지)\S*\s*$/, '$1기'); }
  if (who && who !== '나') r = r.replace(new RegExp(who + '(님|씨)?(이가|이|가|은|는|께서|한테|에게|께)?\\s*'), '');
  r = r.replace(/(다음\s*주|이번\s*주|담주|다다음\s*주)?\s*[월화수목금토일]요일/g, ' ')
    .replace(/(오늘|내일|모레|글피|다음\s*주|이번\s*주|\d+월\s*\d+일|\d{1,2}\/\d{1,2}|오전|오후|저녁|아침|\d+시(\s*반|\s*\d+분)?)(까지|에|부터)?/g, ' ')
    .replace(/\s(까지|에)\s/g, ' ')
    .replace(/(제가|내가|저는|나는|우리가|저희가)\s*/g, '')
    .replace(/[.!~]+$/, '').replace(/\s+/g, ' ').trim()
    .replace(/^(까지|부터|에)\s+/, '');
  // 끝말을 "~하기" 꼴로
  r = r.replace(/(\S+?)하?(해\s*주세요|해\s*줘|해\s*주라|하기로\s*\S*|해야\s*\S*|할\s*것|합시다|하자|할게요?|해요|했어요|합니다)$/, (m, a) => a + (/하$/.test(a) ? '기' : '하기'))
    .replace(/(\S+?)[어아]?\s*(주세요|줘|주라|드리기|드려요|드릴게요)$/, '$1기')
    .replace(/(\S+?)(기로\s*\S*|야\s*(해|돼|함|됨|겠다)\S*|ㄹ게요?)$/, '$1기')
    .replace(/(했음|했다|했어|함|됨|임)$/, '').trim();
  return r.replace(/^[,.\s]+|[,.\s]+$/g, '');
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
const uniq = a => [...new Set(a)];
const uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };

// ── 비용 카테고리 ────────────────────────────────────────────
export const EXP_CATS = {
  식비: /(점심|저녁|아침|밥|식사|식당|배달|커피|카페|스타벅스|음료|간식|회식|치킨|피자|빵|편의점|마라|국밥|떡볶이)/,
  교통: /(택시|버스|지하철|기차|ktx|KTX|srt|SRT|주유|기름|주차|톨게이트|카카오T|우버|항공|비행기|교통)/,
  재료비: /(재료|인쇄|출력|프린트|제본|원단|화방|문구|폼보드|아크릴|굿즈|샘플|목업|촬영소품|소품)/,
  소프트웨어: /(구독|어도비|adobe|피그마|figma|노션|notion|클로드|claude|chatgpt|gpt|구글|google|클라우드|서버|도메인|호스팅|앱스토어|플러그인|폰트|unity|유니티|언리얼)/i,
  장비: /(노트북|모니터|키보드|마우스|태블릿|아이패드|카메라|렌즈|조명|마이크|삼각대|하드|ssd|SSD|케이블|충전기)/,
  회의비: /(회의|미팅|대관|스터디룸|공간|장소)/,
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
  const base = ctx.base || new Date();
  const parts = splitCommands(input);
  const out = [];
  for (const p of parts) {
    const pre = (p.match(/^\s*(할\s*일|할일|투두|todo)\s*[:：]\s*/i) || [''])[0];
    const steps = splitSteps(p.slice(pre.length), base, ctx);
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
  return out;
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
    const seg = /^(다음|이번|다다음|지난)$/.test(c) && /^(주|달)$/.test(b) ? `${c} ${b} ${a}` : /^(다음\s*주|이번\s*주|다다음\s*주|담주|금주|다음\s*달|이번\s*달|\d{1,2}월|다음|이번)$/.test(b) ? `${b} ${a}` : a;
    const d = parseWhen(seg, base).date; if (d) found = d;
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

  // 질문/조회
  if ((/(누가|누구|어디가|어디까지|뭐\s*부터|뭐부터|뭘\s*먼저|몇\s*(개|명|건|번)|얼마(나)?\s|얼마$|제일\s*(싸|싼|급한)|가장\s*(싸|싼|급한))/.test(t) && !/(해야|하기$|하자|물어봐|정하|알아보|확인해|전해)/.test(t) && money == null) || (t.length <= 16 && /(번호|연락처|전화번호|가격|단가)$/.test(t) && !phone)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.8 }];
  if (/(보여\s*줘|알려\s*줘|뭐야|뭐\s*있(어|지|나)?|있어\?|있나|얼마(야|지|나|예요|에요|였지)?|몇\s*(개|번|명|시)?(야|지|이야)?|찾아\s*줘|검색|어디(야|지)?|언제(야|지|였지)?|정리해\s*줘|요약해\s*줘|뭐였지|있었나)\s*\??$/.test(t) || /\?$/.test(t)) {
    return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.8 }];
  }
  if (t.length <= 24 && /^(오늘|내일|모레|이번\s*주|다음\s*주|이번\s*달|지난\s*달|이번주|다음주|이번달)?\s*(남은\s*|밀린\s*)?(일정|스케줄|빈\s*시간|할\s*일|할일|지출|비용|작업\s*시간|대기함|확인할\s*것)\s*(은|는|좀)?\s*\??$/.test(t)) return [{ kind: 'query', data: { q: t, when: w }, label: '찾아보기', confidence: 0.9 }];
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
    if ((VWORD.test(t) && (vsig || /(추가|등록|저장|정리)/.test(t)) && !/(받기|받아|요청|보내|문의하|연락하|알아보)/.test(t)) || (vknown && vsig && !/(결제|샀|구매했|썼|냈|입금)/.test(t))) return 'vendor';
    if (urls.length && /(사야|살\s*거|살\s*것|구매\s*(목록|예정|할)|장바구니|주문해야|사자|사 ?줘)/.test(t)) return 'buy';
    if (phone || email) return 'contact';
    if (money != null && /(원|만원|천원|₩|결제|샀|구매|썼|지출|냈|비용|값|영수증|페이)/.test(t)) return 'expense';
    if (urls.length && /(레퍼런스|참고|ref|무드|영감|예시|느낌)/i.test(t)) return 'reference';
    if (urls.length) return 'reference';
    if (/(목표|OKR|KR|핵심\s*결과|분기)/i.test(t)) return 'okr';
    if (w.time && w.end && /(했음|했다|했어|했고|함$|작업함|편집함|완료)\s*$/.test(t)) return 'timelog';
    if ((w.date || w.time) && /(휴무|반차|연차|월차|휴가|출장|외근|재택|휴일|쉬는\s*날|대체\s*휴일|못\s*(온|와|옴|간|감|나온|나와)|불참|빠진대|빠질|안\s*온대)/.test(t) && !ACTION.test(t.replace(/까지/g, ''))) return 'event';
    if (w.time && /(설명회|간담회|세미나|미팅|회의|상담|행사|교육|워크숍|발표|면접|방문|관람)/.test(t)) return 'event';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) && isDeadline(t) && ACTION.test(t.replace(/까지|마감/g, ''))) return 'task';
    if (/(지원사업|공모전|공모|정부지원|창업지원|예비창업|초기창업|액셀러레이터|TIPS|팁스)/i.test(t) || (/(IR|투자\s*유치|데모데이)/.test(t) && !ACTION.test(t))) return 'grant';
    if (/(릴스|쇼츠|틱톡|유튜브|인스타|브이로그|썸네일|업로드|게시물|피드)/.test(t) && /(올리|찍|만들|편집|콘텐츠|아이디어|기획|업로드|예고|게시)/.test(t) && !isDeadline(t)) return 'sns';
    if ((/\d+(\.\d+)?\s*(시간|분)/.test(t) && /(했음|했다|했어|했고|함$|완료|끝냄|작업|공부|집중)/.test(t) && !w.time) || /작업\s*(했|함|기록)/.test(t)) return 'timelog';
    if ((w.time || w.date) && /(회의|미팅|약속|만나|만남|수업|면접|발표|전시|촬영|병원|저녁|점심|콜|통화|줌|zoom|meet|일정|스케줄|행사|세미나|오픈|마감식|파티|회식|생일|여행|공연|콘서트|(?<!업)데이트|식사|모임|스터디|레슨|강의|워크숍|휴가|설명회|간담회|관람|방문|상담|진료|치과|인터뷰|구경|팝업|나들이|답사|견학|투어|페어|박람회)/i.test(t) && !(isDeadline(t) && ACTION.test(t))) return 'event';
    if (w.time && !ACTION.test(t)) return 'event';
    if (/(회의|미팅|약속|만나|수업|면접|발표|행사|세미나|전시)/.test(t) && w.date && !(isDeadline(t) && /(기로|해야|야\s*(함|해|돼|됨|한다|겠)|제출|보내|넘기|넘겨|내야|내기)/.test(t))) return 'event';
    if (isDeadline(t) && /(해야|야\s*(함|해|돼|됨|한다|겠)|하기로|제출|끝내|완료|마쳐|넘겨|보내)/.test(t)) return 'task';
    if (IDEA.test(t) || /(떠올|생각났|영감|후보(는|가|로)?\s|후보\s*[:：])/.test(t)) return 'idea';
    if (/(달라고\s*(함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심|해\s*달라는|떨어짐|떨어졌|다\s*씀|다\s*썼|고장|망가졌|안\s*됨$|안\s*나옴$)/.test(t)) return 'task';
    if (ACTION.test(t) || w.date || /(하기|할것|사기|보내기|챙기기|만들기)$/.test(t)) return 'task';
    if (t.length > 120) return 'note';
    return 'talk'; // 분명한 신호가 없으면 만들지 않고 대화로 받음
  }

  function build(kind, body = t) {
    const bw = body === t ? w : parseWhen(body, base);
    const cleanTitle = strip(body, bw.hits);
    switch (kind) {
      case 'event': { const rep = /매일|날마다/.test(body) ? 'daily' : /평일마다|매\s*평일|평일\s*매일/.test(body) ? 'weekdays' : /매주|주마다/.test(body) ? 'weekly' : /매달|매월|달마다/.test(body) ? 'monthly' : ''; const r0 = { kind, label: rep ? '반복 일정' : '일정', confidence: bw.time ? 0.9 : 0.7, data: { repeat: rep, title: cleanTitle.replace(/(매일|날마다|평일마다|매\s*평일|매주|주마다|매달|매월|달마다)\s*/g, '').trim() || '일정', date: bw.date || ymd(base), start: bw.time || '', end: bw.end || '', place: '', tags } }; const ev = r0.data; if (bw.endDate) ev.endDate = bw.endDate; ev.title = ev.title.replace(/^(이틀|사흘|나흘|\d+박\s*\d+일|\d+일간)\s*/, '').trim() || ev.title;
        { const ab = body.match(/(\S{2,4}?)(?:이가|이|가|는|은)?\s+.*?(못\s*(?:온|와|옴|간|감|나온|나와)\S*|불참|빠진대|빠질\S*|안\s*온대)/); if (ab) { const nm = (ctx.people || []).find(n => n === ab[1] || n.slice(1) === ab[1] || n.slice(1) === ab[1].replace(/이$/, '')) || ab[1].replace(/이$/, ''); ev.title = `${nm.length > 2 ? nm.slice(1) : nm} 불참`; ev.who = nm; ev._allday = true; } }
        if (/(휴무|반차|연차|월차|휴가|출장|외근|재택|휴일)/.test(ev.title) && !ev.start) ev._allday = true;
        const pp = ev.who && /불참$/.test(ev.title) ? null : eventParts(ev.title, ctx.people || []); if (pp) { ev.title = String(pp.title || '').replace(/^(에서|에|이랑|랑|하고|와|과)\s+/, '').trim() || pp.title; if (pp.who) ev.who = pp.who; if (pp.place) ev.place = pp.place; if (pp.area) ev.area = pp.area; } if (!ev.place && !ev.area) ev.place = placeOf(body); ev.scope = guessScope(body, { who: ev.who || '', team: ctx.people || [] }); return r0; }
      case 'task': { let who0 = findAssignee(body, ctx.people || []); let ct = cleanTitle.replace(/(^|\s)(급함|급해|급한\s*건데|asap|ASAP)[,:：!\s]*/g, ' ').replace(/\s*마감(임|이야|입니다)?\s*$/, '').trim(); let memo = '';
        // "서연이한테 영상 편집 맡기기" → 담당 서연, 할 일 영상 편집
        { const hm = ct.match(/^(\S{1,6}?)(?:이)?(?:한테|에게|께)\s+(.+?)\s*(?:맡기기|맡기|맡김|맡겨|시키기|시키)\S*$/); if (hm) { const nm = (ctx.people || []).find(n => n === hm[1] || n.slice(1) === hm[1]); if (nm || /^[가-힣]{2,3}$/.test(hm[1])) { who0 = nm || hm[1]; ct = hm[2]; } } }
        // "클라이언트가 로고 색 바꿔달라고 함" → 로고 색 바꿔 주기 (클라이언트 요청)
        { const rm = ct.match(/^(?:(\S{1,8}?)(?:이|가|께서|님이)\s+)?(.+?)\s*(?:달라고\s*(?:함|했어|했음|하심|하셨어|한다|하네|해)|달래|달라심)$/); if (rm) { ct = rm[2].replace(/\s*(해|줘)$/, m0 => m0) + ' 주기'; ct = ct.replace(/해\s*주기$/, '해 주기').replace(/\s+/g, ' '); if (rm[1] && !(ctx.people || []).some(n => n === rm[1] || n.slice(1) === rm[1])) memo = rm[1] + ' 요청'; if (rm[1] && who0 === rm[1]) who0 = ''; } }
        const who = who0 === '나' ? '' : who0; return { kind, label: '할 일', confidence: 0.75, data: { who, ...(memo ? { memo } : {}), title: (/주기$/.test(ct) && memo ? ct : cleanTask(ct, who)) || ct || body, due: (() => { const dl = isDeadline(body) ? deadlineDate(body, base) : ''; return dl && !(bw.date && new Date(dl).getDay() === new Date(bw.date).getDay()) ? dl : (bw.date || dl || ''); })(), time: isDeadline(body) ? '' : (bw.time || ''), priority: /(급|급함|asap|ASAP|중요|빨리|꼭|반드시|!!)/.test(body) ? 'high' : 'normal', project: projectOf(body, ctx), tags } }; }
      case 'expense': { const amt = parseMoney(body) || 0; return { kind, label: '지출', confidence: 0.85, data: { title: strip(body.replace(/(\d+(?:\.\d+)?\s*만\s*(\d+\s*천)?\s*원?|\d[\d,]*\s*원|₩\s*[\d,]+)/g, ''), bw.hits).replace(/(법인\s*카드|회사\s*카드|개인\s*카드|카드|현금|계좌\s*이체)/g, '').replace(/\s*(내가|제가|우리가)?\s*(결제|샀다|샀어|샀음|삼|썼다|썼어|썼음|씀|지출|냈다|냈어|냈음|냄|했다|입금함|입금했어|입금|결제함|결제했어|긁음|긁었어)\s*$/, '').replace(/\s+/g, ' ').trim() || '지출', amount: amt, date: bw.date || ymd(base), category: guessCategory(body), project: projectOf(body, ctx), pay: /(법인|회사|팀)\s*카드/.test(body) ? '법인카드' : /(현금)/.test(body) ? '현금' : '개인카드' } }; }
      case 'contact': { const ph = parsePhone(body), em = parseEmail(body); const raw = body.replace(ph ? /(01[016789]|02|0[3-6]\d)[\s.-]?\d{3,4}[\s.-]?\d{4}/ : /$^/, ' ').replace(em || /$^/, ' ').replace(/(명함\s*(받음|받았어|받았음|교환)?|번호|전화|연락처|이메일|메일|저장|추가|해줘|해 줘|받음|받았어|알게\s*됨|소개\s*받음)/g, ' ').replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
        const ROLE = /^(.*?)(대표|이사|팀장|실장|부장|차장|과장|대리|주임|사원|주무관|매니저|PD|피디|교수|작가|감독|디자이너|개발자|기획자|마케터|에디터|사장|선생님|쌤|원장|담당자?)(님)?$/; const ws = raw.split(' ').filter(Boolean); let nm = '', role = '', org = '';
        const ti = ws.findIndex(x => ROLE.test(x) && x.match(ROLE)[1].length >= 1 && x.match(ROLE)[1].length <= 3); // "김대리", "박대표님"
        const ni = ws.findIndex(x => /^[가-힣]{2,4}$/.test(x) && !ROLE.test(x) && !PLACE_SUF.test(x) && !/(프린팅|디자인|스튜디오|컴퍼니|상사|기획|미디어|랩|웍스|코리아|주식회사|팀|부서|센터|회사|대학교|대학|학과|본부|지점|은행|병원|협회|재단)$/.test(x));
        if (ni >= 0) { nm = ws[ni]; const others = ws.filter((_, k) => k !== ni); role = others.find(x => ROLE.test(x) && !x.match(ROLE)[1]) || ''; org = others.filter(x => x !== role).join(' '); }
        else if (ti >= 0) { nm = ws[ti]; role = ws[ti].match(ROLE)[2]; org = ws.filter((_, k) => k !== ti).join(' '); }
        else { nm = (raw.match(/[가-힣]{2,4}|[A-Za-z]+(?:\s[A-Za-z]+)?/) || [''])[0]; org = raw.replace(nm, '').trim(); }
        return { kind, label: '연락처', confidence: 0.85, data: { name: nm, phone: ph || '', email: em || '', org, role, memo: '', tags } }; }
      case 'reference': return { kind, label: '레퍼런스', confidence: 0.8, data: { title: strip(body.replace(/https?:\/\/\S+/g, ''), []) || (parseUrls(body)[0] || '레퍼런스'), url: parseUrls(body)[0] || '', tags: tags.length ? tags : keywords(body.replace(/레퍼런스|참고/g, ''), 4) } };
      case 'vendor': { const v = vendorParts(body, ctx.vendors || []); return { kind, label: '업체', confidence: v.name && (v.phone || v.link || v.prices.length) ? 0.8 : 0.6, data: v }; }
      case 'buy': { const u = parseUrls(body)[0] || ''; return { kind, label: '살 것', confidence: 0.75, data: { title: strip(body.replace(/https?:\/\/\S+/g, '').replace(/\d[\d,]*\s*(만\s*)?(\d+\s*천\s*)?원/g, ' ').replace(/(사야\s*(돼|해|함|겠다)?|살\s*거|살\s*것|구매\s*(목록|예정|할\s*것)?(에)?\s*(추가|넣어)?(해\s*줘|줘)?|장바구니(에)?\s*(추가|넣어)?(해\s*줘|줘)?|주문해야\s*(돼|해)?)/g, ' '), []) || '(상품명을 적어 주세요)', url: u, price: parseMoney(body) || 0, qty: 1, need: 'must' } }; }
      case 'idea': return { kind, label: '아이디어', confidence: 0.7, data: { title: summarize(body, 1)[0]?.slice(0, 60) || body.slice(0, 60), body, tags: tags.length ? tags : keywords(body, 5) } };
      case 'note': return { kind, label: '메모', confidence: 0.6, data: { title: (summarize(body, 1)[0] || body).slice(0, 60), body, tags: tags.length ? tags : keywords(body, 6) } };
      case 'timelog': { const tw = parseWhen(body, base); const span = tw.time && tw.end ? (+tw.end.slice(0, 2) * 60 + +tw.end.slice(3)) - (+tw.time.slice(0, 2) * 60 + +tw.time.slice(3)) : 0; const m = span > 0 ? span : tw.mins || 60; body = span > 0 ? strip(body, tw.hits).replace(/^(부터|까지)\s*/, '') : body; return { kind, label: '작업 기록', confidence: 0.8, data: { title: strip(body, []).replace(/\d+\s*(시간|분)\s*(동안)?/g, '').replace(/\s*(작업)?\s*(했음|했다|했어|함|완료)$/, '').trim() || '작업', minutes: m, date: (span > 0 && tw.date) || ymd(base), project: projectOf(body, ctx) } }; }
      case 'sns': return { kind, label: 'SNS 아이디어', confidence: 0.75, data: { title: cleanTitle, platform: /(릴스|인스타)/.test(body) ? '인스타그램' : /(쇼츠|유튜브)/.test(body) ? '유튜브' : /틱톡/.test(body) ? '틱톡' : '인스타그램', status: '아이디어', date: bw.date || '', tags } };
      case 'okr': return { kind, label: '목표', confidence: 0.7, data: { title: cleanTitle.replace(/^(이번|다음|올해|\d분기)?\s*(분기|달|연도)?\s*(목표|OKR|okr)\s*(는|은|:|：)?\s*/, '').trim() || cleanTitle, quarter: quarterOf(base), krs: [] } };
      case 'grant': { const ek = body.match(/(?:최대\s*)?(\d+(?:\.\d+)?)\s*억\s*(?:(\d+)\s*천)?\s*(?:만\s*)?원?/); const amt = ek ? Math.round(parseFloat(ek[1]) * 1e8 + (+(ek[2] || 0)) * 1e7) : parseMoney(body) || null;
        return { kind, label: '지원사업', confidence: 0.7, data: { title: cleanTitle.replace(/(최대\s*)?\d+(\.\d+)?\s*억\s*(\d+\s*천)?\s*(만\s*)?원?/, ' ').replace(/(최대\s*)?\d[\d,]*\s*(만|천)?\s*원/, ' ').replace(/\s*(마감|접수\s*마감|신청\s*마감|지원금|최대)\s*/g, ' ').replace(/\s+/g, ' ').trim() || cleanTitle, deadline: bw.date || '', status: '검토', amount: amt, url: parseUrls(body)[0] || '' } }; }
      default: return { kind: 'note', label: '메모', confidence: 0.5, data: { title: body.slice(0, 60), body, tags } };
    }
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
  if (!place) { words = t.split(' '); const k = words.findIndex(x => PLACE_SUF.test(x) && x.length >= 2); if (k >= 0 && k <= 2 && !(who && words.slice(0, k + 1).join(' ').includes(who))) { place = words.slice(0, k + 1).join(' '); const restT = words.slice(k + 1).join(' '); if (restT.length >= 2) t = restT; } }
  // 보러 가는 일정이면 앞말이 장소
  const dm = t.match(DOING);
  if (!place && dm && dm.index > 0) { const head = t.slice(0, dm.index).trim().replace(/(에서|에|으로|로)$/, ''); if (head && head.split(' ').length <= 3 && !/(하|되)$/.test(head) && /(방문|관람|구경|보기|가기|견학|투어|답사|전시|공연|팝업|나들이|여행|데이트)$/.test(dm[1])) place = head; }
  if (!who && !area && !place) return null;
  if (t.length <= 3 && who && !t.includes(who)) { const c = who.charCodeAt(who.length - 1); const bat = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 > 0 : false; t = `${who}${bat ? '과' : '와'} ${t}`.trim(); } else if (t.length <= 3 && area) t = `${area} ${t}`.trim(); else if (!t) t = place || title;
  return { title: t || title, who, area, place };
}
function placeOf(s) { const m = s.match(/([가-힣A-Za-z0-9]+(?:역|카페|센터|빌딩|학교|대학교|캠퍼스|사무실|스튜디오|홀|관|층|호|점))(?:에서|서)?/); return m ? m[1] : ''; }
function projectOf(s, ctx) { for (const p of ctx.projects || []) if (p && s.includes(p)) return p; const m = s.match(/\[([^\]]+)\]/); return m ? m[1] : ''; }
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
export function learnKind(text, kind) { const kw = keywords(text, 6).filter(x => !x.includes(' ') && !new RegExp(`(${KIN}|${FAMILY})$`).test(x) && !AREA.test(x)).pop(); if (kw) learned.kind[kw] = kind; return learned; }

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
