// 대외활동(공모전·서포터즈): 종류·상태·단계, 글에서 읽기, 우리 팀 매칭률, 캘린더 연결, 마감 알림
// 화면(modules/acts.js)과 모으는 스크립트(scripts/fetch-acts.mjs)가 같이 써요. 여기서는 화면(DOM)을 건드리지 않아요.
import * as db from './db.js';

export const TYPES = [['contest', '공모전'], ['supporters', '서포터즈']];
export const typeName = t => (TYPES.find(x => x[0] === t) || TYPES[0])[1];
export const STATUS = [['want', '관심'], ['prep', '준비 중'], ['sent', '제출 완료'], ['second', '2차 진행'], ['won', '붙음'], ['lost', '떨어짐'], ['drop', '안 나감']];
export const statusName = s => (STATUS.find(x => x[0] === s) || STATUS[0])[1];
export const LIVE = new Set(['want', 'prep', 'second']);   /* 아직 챙겨야 하는 상태 */
export const PART = [['', '모름'], ['solo', '개인만'], ['both', '팀 가능'], ['team', '팀 필수']];
export const WHO = [['', '모름'], ['anyone', '누구나'], ['univ', '대학생만'], ['youth', '청년(나이 제한)'], ['teen', '청소년만'], ['etc', '그 밖의 조건']];
/* 단계: cal = 캘린더에 넣는 방식. task(마감이 있는 할 일) · event(시간 약속) · day(하루 표시) · 빈칸(항목 안에만 적어 둠) */
export const STAGES = { docs: ['서류 제출', 'task'], r1: ['1차 발표', 'day'], interview: ['면접', 'event'], extra: ['추가 서류 제출', 'task'], second: ['2차 심사·발표', 'event'], final: ['최종 발표', 'day'], ceremony: ['발대식', ''], ot: ['OT·교육', ''], etc: ['기타', ''] };
export const stageName = s => s.label || (STAGES[s.kind] || STAGES.etc)[0];
export const stageCal = s => s.cal === undefined || s.cal === null ? (STAGES[s.kind] || STAGES.etc)[1] : s.cal;

const pad = n => String(n).padStart(2, '0');
export const dday = (due, today = db.dayOf(new Date())) => due ? Math.round((new Date(due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5) : null;
export const ddayText = n => n == null ? '마감 모름' : n < 0 ? '마감 지남' : n === 0 ? '오늘 마감' : `D-${n}`;

/* 참가 방식 한 줄 ("개인만", "팀 가능 · 최대 4명", "팀 필수 · 2~4명") */
export function partTag(a) {
  if (!a.part) return '';
  const lo = Number(a.teamMin) || 0, hi = Number(a.teamMax) || 0;
  const size = lo && hi && lo !== hi ? `${lo}~${hi}명` : hi ? `최대 ${hi}명` : lo ? `${lo}명 이상` : '';
  if (a.part === 'solo') return '개인만';
  return (a.part === 'team' ? '팀 필수' : '팀 가능') + (size ? ' · ' + size : '');
}
export const whoTag = a => a.who === 'univ' ? '대학생만' : a.who === 'anyone' ? '누구나' : a.who === 'youth' ? '청년' + (a.whoNote ? ` ${a.whoNote}` : '') : a.who === 'teen' ? '청소년만' : a.who === 'etc' ? (a.whoNote || '조건 있음') : '';
export const regionTag = a => !a.region || /^전국$/.test(a.region.trim()) ? (a.region ? '전국' : '') : `${a.region.trim()}만`;

// ── 우리 팀 조건 ──
/* 사는 곳은 시 이름과 그 시가 속한 도 이름을 같이 봐요 (충주 → 충북, 평택 → 경기) */
const UP = { 충주: '충북 충청북도 충청', 평택: '경기 경기도', 서울: '서울특별시 수도권', 대구: '대구광역시', 부산: '부산광역시', 인천: '인천광역시 수도권', 대전: '대전광역시 충청', 광주: '광주광역시', 울산: '울산광역시', 수원: '경기 경기도', 성남: '경기 경기도', 청주: '충북 충청북도 충청', 천안: '충남 충청남도 충청', 전주: '전북 전라북도', 춘천: '강원 강원도', 창원: '경남 경상남도', 제주: '제주도' };
export const PROFILE = { regions: ['서울', '대구', '충주', '평택'], univ: true, size: 3, likes: '' };
export async function profile() { const p = await db.get('act-profile'); return { ...PROFILE, ...(p && !p.deleted ? { regions: p.regions || PROFILE.regions, univ: p.univ !== false, size: p.size || PROFILE.size, likes: p.likes || '' } : {}) }; }
export async function saveProfile(patch) { const team = (await db.get('team-main')) ? 'team-main' : ''; return db.put('acts', { id: 'act-profile', kind: 'profile', team, ...(await profile()), ...patch }); }
/* 지역 제한이 있을 때 우리 중 되는 곳. 제한이 없으면 '전국' */
export function regionFit(a, prof = PROFILE) {
  const r = String(a.region || '').trim();
  if (!r || /전국|제한\s*없|무관/.test(r)) return { ok: true, by: '' };
  for (const mine of prof.regions || []) { const keys = [mine, ...(UP[mine] || '').split(' ')].filter(Boolean); if (keys.some(k => r.includes(k) || (k.length >= 2 && r.replace(/(특별시|광역시|도|시)$/, '') === k))) return { ok: true, by: mine }; }
  return { ok: false, by: '' };
}
export function whoFit(a, prof = PROFILE) { if (a.who === 'teen') return false; if (a.who === 'univ') return prof.univ !== false; return true; }
export function canJoin(a, prof = PROFILE) { const r = regionFit(a, prof); return { ok: r.ok && whoFit(a, prof), region: r, who: whoFit(a, prof) }; }

// ── 매칭률 ── 우리 팀(기획·UX/UI, 아트 디렉션, 경영 셋이 하는 작은 콘텐츠 기획사)에 맞는 정도 0~100
const FIT = [
  [/디자인|브랜딩|브랜드|로고|\bbi\b|\bci\b|패키지|포스터|캐릭터|일러스트|굿즈|이모티콘|ux|ui|웹\s*디자인|앱\s*디자인|편집\s*디자인|타이포|그래픽/i, 30, '디자인'],
  [/영상|숏폼|릴스|쇼츠|ucc|유튜브|모션\s*그래픽|애니메이션|광고\s*영상|뮤직\s*비디오|촬영/i, 28, '영상'],
  [/콘텐츠|크리에이터|sns|인스타|틱톡|블로그|카드\s*뉴스|홍보|마케팅|광고|캠페인|서포터즈|기자단|앰배서더|에디터/i, 26, '콘텐츠·홍보'],
  [/기획|아이디어|네이밍|슬로건|스토리|세계관|게임|서비스\s*기획|창업|비즈니스\s*모델|사업\s*계획/i, 18, '기획·아이디어'],
  [/ai\b|생성형|인공지능|메타버스|\bxr\b|가상\s*전시/i, 10, 'AI'],
  [/뷰티|화장품|패션|라이프\s*스타일|전시|문화|예술|관광|로컬/i, 10, '관심 분야'],
];
const MISFIT = [/논문|학술|수학|물리|화학|과학\s*탐구|코딩\s*테스트|알고리즘|프로그래밍\s*경진|해커톤|데이터\s*분석|빅데이터|수기|독후감|백일장|시\s*낭송|문학|웅변|토론|콩쿠르|성악|국악|무용|체육|마라톤|바둑|요리|제과|건축\s*설계|토목|기계|로봇\s*경진|발명|특허|법률|모의\s*재판|통번역|번역|어린이|유아|초등/i];
export function match(a, prof = PROFILE) {
  const text = `${a.title || ''} ${a.field || ''} ${a.body || ''} ${a.host || ''} ${typeName(a.type)}`;
  /* 분야: 가장 잘 맞는 분야 하나의 점수에, 더 걸리는 분야마다 5점씩 */
  let fit = 0; const why = [];
  for (const [re, w, name] of FIT) if (re.test(text)) { fit = why.length ? fit + 5 : w; why.push(name); }
  for (const w of String(prof.likes || '').split(/[,\s]+/).filter(x => x.length >= 2)) if (text.includes(w)) { fit += 8; why.push(w); }
  if (MISFIT.some(re => re.test(text))) fit -= 26;
  fit = Math.max(0, Math.min(40, fit));
  const j = canJoin(a, prof); const size = prof.size || 3;
  let team = 8, teamWhy = '';
  if (a.part === 'solo') { team = 5; teamWhy = '개인만'; }
  else if (a.part === 'both' || a.part === 'team') { const hi = Number(a.teamMax) || 0, lo = Number(a.teamMin) || 0; if (lo > size) { team = 1; teamWhy = `${lo}명 이상 필요`; } else if (!hi || hi >= size) { team = 15; teamWhy = `${size}명이 같이 가능`; } else { team = 9; teamWhy = `팀 ${hi}명까지`; } }
  let elig = 0; if (j.ok) elig = (a.who ? 7 : 5) + (a.region ? 8 : 5);
  const prize = a.prize ? (/억|천만|[5-9]\d{2}만|\d{4,}만|\d,\d{3}만/.test(a.prize) ? 10 : 6) : 3;
  let pct = Math.round(Math.min(100, (fit > 0 ? 20 : 8) + fit + team + elig + prize));
  if (!j.ok) pct = Math.min(pct, 12);
  const first = why.slice(0, 2).join('·');
  const line = !j.ok ? (!j.region.ok ? `${String(a.region).trim()} 사는 사람만 돼요` : a.who === 'teen' ? '청소년만 나갈 수 있어요' : '대학생만 나갈 수 있어요')
    : [first ? first + ' 분야' : '우리 분야와는 조금 멀어요', teamWhy, j.region.by ? `${j.region.by} 거주 가능` : '', a.who === 'univ' ? '대학생 가능' : ''].filter(Boolean).join(', ');
  return { pct, ok: j.ok, why: [...new Set(why)], line, region: j.region };
}
/* 추천 순서: 매칭률에 마감이 가까울수록 점수를 더해요. 안 맞아도 마감이 코앞이면 위로 올라와요 */
export function rank(a, prof = PROFILE, today = db.dayOf(new Date())) {
  const m = match(a, prof); const d = dday(a.due, today);
  const urg = d == null ? 6 : d < 0 ? -999 : d <= 3 ? 34 : d <= 7 ? 26 : d <= 14 ? 18 : d <= 30 ? 9 : 2;
  return { ...m, dday: d, total: m.pct * 0.75 + urg + (m.ok ? 0 : -8) };
}

// ── 글에서 읽기 ── 공고 글이나 "○○ 공모전 12월 20일 마감 팀 4명까지" 같은 한 줄에서 칸을 채움
const REGION_RE = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|경기도|강원도|[가-힣]{2,4}(?:시|군|구))\s*(?:특별시|광역시|특별자치시|특별자치도)?\s*(?:지역\s*)?(?:에\s*)?(?:거주|소재|주소|시민|도민|구민|군민|재학|재직|활동)/;
function dateIn(s, base) {
  { const nm = s.match(/(내달|다음\s*달|익월)\s*(\d{1,2})\s*일/); if (nm) { const d = new Date(base.getFullYear(), base.getMonth() + 1, +nm[2]); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    const tm = s.match(/(이달|이번\s*달|오는)\s*(\d{1,2})\s*일/); if (tm && !/월/.test(s.slice(0, tm.index))) { const d = new Date(base.getFullYear(), base.getMonth() + (/오는/.test(tm[1]) && +tm[2] < base.getDate() ? 1 : 0), +tm[2]); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; } }
  let m = s.match(/(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(?:^|[^\d])(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?!\d)/); if (m && +m[2] <= 12 && +m[3] <= 31 && +m[1] >= 24) return `20${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/) || s.match(/(?:^|[^\d.])(\d{1,2})\s*[.\/]\s*(\d{1,2})(?![\d.]*\d\s*(?:명|인|원|만|%))/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) { let y = base.getFullYear(); if (+m[1] < base.getMonth() + 1 - 5) y++; return `${y}-${pad(m[1])}-${pad(m[2])}`; }
  return '';
}
export function parse(text, base = new Date()) {
  const t = String(text || '').replace(/\r/g, ''); const o = {};
  o.type = /서포터즈|기자단|홍보\s*대사|앰배서더|체험단|마케터\s*\d*\s*기|에디터\s*\d*\s*기|크루\s*모집|대외\s*활동|\d+\s*기\s*모집/.test(t) && !/공모전|경진\s*대회|콘테스트|공모\s*합니다/.test(t) ? 'supporters' : 'contest';
  /* 기간: "접수 11.01 ~ 12.20", "12월 20일 마감", "~12/20", "12월 20일까지" */
  const span = t.match(/(?:접수|모집|응모|신청|지원|제출)\s*(?:기간|일정|기한)?\s*[:：]?\s*([^\n~\-–]{0,24}?)\s*[~\-–]\s*([^\n]{0,26})/);
  if (span && dateIn(span[2], base)) { o.due = dateIn(span[2], base); const s = dateIn(span[1], base); if (s && s <= o.due) o.start = s; }
  if (!o.due) { const m = t.match(/([^\n]{0,18})\s*(?:까지|마감)/) || t.match(/(?:마감|기한)\s*[:：]?\s*([^\n]{0,20})/) || t.match(/~\s*([^\n]{0,16})/); const d = m && dateIn(m[1], base); if (d) o.due = d; }
  if (!o.due) { const all = [...t.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)]; if (all.length === 1) o.due = dateIn(all[0][0], base); }
  /* 참가 방식 */
  const rng = t.match(/(\d{1,2})\s*(?:인|명)?\s*[~\-–]\s*(\d{1,2})\s*(?:인|명)/); const max = t.match(/(?:최대|팀\s*당|팀원)\s*(\d{1,2})\s*(?:인|명)|(\d{1,2})\s*(?:인|명)\s*(?:이내|이하|까지)|팀\s*(\d{1,2})\s*(?:인|명)/); const min = t.match(/(\d{1,2})\s*(?:인|명)\s*이상/);
  const solo = /개인\s*(?:만|전|참가만|부문만|응모만)|1인\s*(?:1|한)\s*작|개인\s*단위|팀\s*(?:참가|응모|지원)\s*(?:불가|안\s*됨)/.test(t), both = /개인\s*(?:또는|혹은|및|이나|\/|·|,)\s*팀|팀\s*(?:또는|혹은|및|이나|\/|·|,)\s*개인|개인\s*,?\s*팀\s*(?:모두|전부)|팀\s*(?:참가|응모|지원)?\s*가능/.test(t), must = /팀\s*(?:필수|만|단위로만|으로만)|반드시\s*팀|개인\s*(?:참가|응모|지원)\s*(?:불가|안\s*됨)/.test(t);
  if (must) o.part = 'team'; else if (both) o.part = 'both'; else if (solo) o.part = 'solo'; else if (rng || max || /\d\s*인\s*1\s*팀|팀\s*(?:구성|단위)/.test(t)) o.part = min && !rng ? 'team' : 'both';
  if (o.part && o.part !== 'solo') { if (rng && +rng[1] <= +rng[2] && +rng[2] <= 30) { o.teamMin = +rng[1]; o.teamMax = +rng[2]; if (+rng[1] >= 2) o.part = 'team'; } else { if (max) o.teamMax = +(max[1] || max[2] || max[3]); if (min) o.teamMin = +min[1]; } }
  /* 대상 */
  const open = /누구나|제한\s*(?:이\s*)?없|전\s*국민|남녀노소|일반인|관심\s*있는\s*(?:모든|누구)/.test(t.replace(/(대학\s*\(?원?\)?\s*생|재학생|휴학생|청년|청소년)\s*(?:이라면|이면|은|는|이)?\s*누구나/g, '$1'));
  if (/청소년|중·?고등학생|초·?중·?고|고등학생|중학생|초등학생|어린이/.test(t) && !/대학|일반|청년|성인/.test(t)) o.who = 'teen';
  else if (/대학\s*\(?원?\)?\s*생|재학생|휴학생|대학교\s*(?:재학|소속)/.test(t) && !open) o.who = 'univ';
  else if (open) o.who = 'anyone';
  else if (/청년|만\s*\d{2}\s*세\s*[~\-–]\s*(?:만\s*)?\d{2}\s*세/.test(t)) { o.who = 'youth'; const ag = t.match(/만\s*(\d{2})\s*세?\s*[~\-–]\s*(?:만\s*)?(\d{2})\s*세/); if (ag) o.whoNote = `만 ${ag[1]}~${ag[2]}세`; }
  /* 지역 */
  const rg = t.match(REGION_RE) || t.match(/(?:^|[^가-힣])(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]{2,3}?)(?:특별자치|특별|광역)?\s*(?:시|군|구|도)?\s*(?:시민|도민|군민|구민)(?!\s*참여\s*예산)/); if (rg) o.region = rg[1].replace(/충청북도/, '충북').replace(/충청남도/, '충남').replace(/전라북도/, '전북').replace(/전라남도/, '전남').replace(/경상북도/, '경북').replace(/경상남도/, '경남').replace(/경기도/, '경기').replace(/강원도/, '강원'); else if (/전국/.test(t)) o.region = '전국';
  /* 상금·혜택, 주최 */
  const pz = t.match(/(총\s*상금|상금\s*총액|대상|최우수상|시상\s*내역|상금|활동비)\s*[:：]?\s*([^\n\d]{0,10})(\d[\d,.]*\s*(?:억|천만|백만|만)?\s*원)/);
  if (pz) { const gap = pz[2].replace(/[^가-힣A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim(); let lab = pz[1].replace(/\s+/g, ''); if (/총\s*상금/.test(pz[2])) lab = '총상금'; else if (lab === '시상내역') lab = (gap.match(/(대상|최우수상|우수상|1등|1위)/) || [])[1] || '시상'; else if (lab === '상금총액') lab = '총상금';   /* "시상 내역 (총상금 150만 원" → "총상금 150만 원" */
    o.prize = `${lab} ${pz[3].replace(/\s+/g, ' ').trim()}`.slice(0, 40); }
  const ho = t.match(/주최\s*(?:\/|·|및)?\s*(?:주관)?\s*[:：]\s*([^\n,\/|]{2,30})/); if (ho) o.host = ho[1].trim();
  return o;
}
/* 한 줄로 말했을 때 이름만 남기기: 날짜·인원·조건·사이트 이름을 걷어 냄 */
export function titleOf(text) {
  let s = String(text || '').split('\n')[0].split(/\s*(?:접수|모집|응모|신청)\s*(?:기간|일정)|\s*주최\s*[:：]|\s*참가\s*(?:대상|자격)|\s*시상\s*내역/)[0];
  s = s.replace(/https?:\/\/\S+/g, ' ').replace(/^(링커리어|위비티|씽굿|캠퍼스픽|올콘|대티즌|콘테스트코리아|요즘것들)\s*(에서|에|의)?\s*/, '')
    .replace(/(20\d{2}\s*[.\-\/년]\s*)?\d{1,2}\s*(월|[.\/])\s*\d{1,2}\s*일?\s*(까지|마감|부터)?/g, ' ').replace(/(오늘|내일|모레|이번\s*주|다음\s*주)?\s*[월화수목금토일]요일\s*(까지|마감)?/g, ' ')
    .replace(/(개인\s*(또는|및|\/|·|,)\s*)?팀\s*(최대\s*)?\d{0,2}\s*(명|인)?\s*(까지|이내|이하|가능|필수)?|최대\s*\d{1,2}\s*(명|인)|\d{1,2}\s*[~\-–]\s*\d{1,2}\s*(명|인)|개인만|개인전/g, ' ')
    .replace(/(대학생|청소년|청년)\s*(만|대상|누구나)|누구나|전국|[가-힣]{2,4}\s*거주(자)?\s*(만)?/g, ' ')
    .replace(/(총\s*상금|상금|대상|최우수상)\s*\d[\d,.]*\s*(억|천만|백만|만)?\s*원/g, ' ').replace(/[~\-–]\s*$/, ' ').replace(/(서울|부산|대구|인천|광주|대전|울산|세종|[가-힣]{2,3})\s*(시민|도민|군민|구민)(\s*(만|누구나))?/g, ' ')
    .replace(/(마감|접수\s*중|모집\s*중|나가자|나가볼까|해보자|하자|있대|있음|떴음|떴다|올라옴|관심|등록해\s*줘|추가해\s*줘|넣어\s*줘|적어\s*줘)\s*$/g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/^[\s,·:\-]+|[\s,·:\-]+$/g, '').slice(0, 60);
}

// ── 캘린더·할 일 연결 ── 팀 목표로 등록한 것은 단계마다 각자 캘린더에 들어가요. 이름표가 정해져 있어 두 기기에서 해도 둘이 되지 않아요.
const sig = o => JSON.stringify(o);
const short = (s, n = 24) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export function linked(a, { roster = [] } = {}) {
  if (!a || a.deleted || !a.goal || ['drop', 'lost'].includes(a.status)) return [];
  const members = (a.members || []).filter(Boolean); const all = !members.length || (roster.length && roster.every(n => members.includes(n)));
  const who = all ? '' : members.join(', '); const name = short(a.title); const tag = typeName(a.type);
  const base = { team: a.team || '', by: a.by || '', act: a.id, scope: a.team ? 'work' : '' };
  const out = []; const task = (key, title, due, done, memo) => { if (!due) return; const ws = all ? [''] : members; ws.forEach((w, i) => out.push({ col: 'tasks', id: `act-${a.id}-${key}${all ? '' : '-' + i}`, data: { ...base, title, due, who: w, priority: 'high', memo: memo || `${tag} · 대외활동에서 같이 관리해요` }, done })); };
  const sent = ['sent', 'second', 'won'].includes(a.status);
  if (!(a.stages || []).some(s => s.kind === 'docs' && (s.endDate || s.date))) task('due', `${name} 제출`, a.due, sent);
  for (const s of a.stages || []) {
    const how = stageCal(s); const d = s.date || '', e = s.endDate && s.endDate >= d ? s.endDate : ''; if (!how || !(d || e)) continue; const label = stageName(s);
    if (how === 'task') task('s' + s.id, `${name} ${label}`, e || d, s.kind === 'docs' ? sent : false, d && e && d !== e ? `${d.slice(5).replace('-', '/')}부터 받아요` : '');
    else out.push({ col: 'events', id: `act-${a.id}-s${s.id}`, data: { ...base, title: `${name} ${label}`, date: d || e, endDate: e && e !== d ? e : '', start: how === 'event' ? (s.time || '') : '', allDay: how === 'day' || !s.time, who, place: s.place || '', memo: `${tag} · 대외활동에서 같이 관리해요` } });
  }
  return out;
}
/* 항목을 고칠 때마다 부름. 단계를 고친 것만 다시 쓰고, 없어진 단계의 일정은 지워요. 캘린더에서 따로 고친 것은 단계를 다시 고치기 전까지 그대로 둬요 */
export async function syncLinks(a) {
  const roster = (await db.kvGet('sync:roster', [])).map(m => m.name).filter(Boolean);
  const want = linked(a, { roster }); const keep = new Set(want.map(w => w.id)); let n = 0;
  for (const w of want) { const cur = await db.get(w.id); const s = sig(w.data); if (cur && !cur.deleted && cur.actSig === s && (w.done === undefined || !!cur.done === !!w.done || cur.actDone === w.done)) continue; const rec = { ...w.data, id: w.id, actSig: s, deleted: false }; if (w.col === 'tasks') { rec.done = w.done ? true : cur && !cur.deleted && cur.actDone === w.done ? !!cur.done : false; rec.actDone = !!w.done; } await db.put(w.col, rec); n++; }
  for (const col of ['tasks', 'events']) for (const it of await db.list(col)) if (it.act === a.id && !keep.has(it.id)) { await db.remove(it.id); n++; }
  return n;
}

// ── 알림 ── 내는 날(마감·서류)은 2주 전, 7일 전, 3일 전부터 매일 아침. 면접은 7일 전·3일 전·전날·당일, 발표는 당일만. 제출 완료로 바꾸면 내는 날 알림은 그치고 뒤 단계만 남아요.
export const RING = new Set([14, 7, 3, 2, 1, 0]);
const RING_BY = { due: RING, task: RING, event: new Set([7, 3, 1, 0]), day: new Set([0]) };
export function alarmsOn(acts, date, me = '') {
  const hit = [];
  for (const a of acts) {
    const st = a.status || 'want'; const after = st === 'sent' || st === 'second';
    if (a.kind === 'profile' || a.deleted || !(LIVE.has(st) || after) || (a.mute || []).includes(me)) continue;
    if (me && a.goal && (a.members || []).length && !(a.members || []).some(n => n === me || (me.length === 3 && me.slice(1) === n) || (n.length === 3 && n.slice(1) === me))) continue;
    const docs = (a.stages || []).some(s => s.kind === 'docs' && (s.endDate || s.date));
    const pts = !after && !docs ? [[a.due, '마감', 'due']] : []; for (const s of a.stages || []) { const how = stageCal(s); if (!how || (after && s.kind === 'docs')) continue; pts.push([s.endDate || s.date, stageName(s), how]); }
    const seen = new Set();
    for (const [d, label, how] of pts) { const n = dday(d, date); if (n == null || !RING_BY[how].has(n) || seen.has(n + label)) continue; if (n > 3 && st === 'want' && !a.goal) continue; /* 관심만 눌러 둔 것은 3일 전부터 */ seen.add(n + label); hit.push({ a, n, label, how }); }
  }
  return hit.sort((x, y) => x.n - y.n);
}
export function alarmText(hit) {
  if (!hit.length) return null; const f = hit[0]; const when = n => n === 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`;
  if (hit.length === 1) return { title: `${short(f.a.title, 20)} ${f.label} ${when(f.n)}`, body: `${typeName(f.a.type)} · ${statusName(f.a.status || 'want')}${f.a.status === 'want' ? ' · 나갈 거면 준비 중으로 바꿔 두세요' : ''}` };
  return { title: `챙길 대외활동 ${hit.length}건, 가장 가까운 건 ${when(f.n)}`, body: hit.slice(0, 4).map(h => `${short(h.a.title, 16)} ${h.label} ${h.n === 0 ? '오늘' : 'D-' + h.n}`).join(' · ') };
}

// ── 같은 것 알아보기 ── 같은 공모전이 여러 사이트·기사에 올라와도 하나로. 수집 스크립트와 화면이 같이 써요.
/* 이름에서 꾸밈을 뺀 뼈대: 짧은 괄호 말([제3회], (Be My Agent)), 연도, 회차, "참가자 모집" 같은 말, 띄어쓰기·기호 */
export const actKey = t => String(t || '').toLowerCase()
  .replace(/[\[(【〔][^\])】〕]{0,16}[\])】〕]/g, ' ').replace(/20\d\d\s*(년|학년도)?/g, ' ').replace(/제?\s*\d+\s*(회|차|th|rd|nd|st)/g, ' ')
  .replace(/(참가자|참여자|지원자|단원|작품|신규)?\s*(모집\s*공고|모집|공고|안내|개최|접수\s*중|접수)/g, ' ').replace(/[^가-힣a-z0-9]/g, '');
const grams2 = s => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
export const nameSim = (x, y) => { const a = grams2(x), b = grams2(y); if (!a.size || !b.size) return x === y ? 1 : 0; let n = 0; for (const g of a) if (b.has(g)) n++; return 2 * n / (a.size + b.size); };
const hostKey = h => String(h || '').toLowerCase().replace(/\(주\)|㈜|주식회사|재단법인|사단법인|\(재\)|\(사\)/g, '').split(/[,\/·]| 외 /)[0].replace(/[^가-힣a-z0-9]/g, '');
const linkKey = u => String(u || '').replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[?#].*$/, m => (/[?&](ix|str_no|id|seq|no)=\w+/.test(m) ? '?' + m.match(/[?&]((?:ix|str_no|id|seq|no)=\w+)/)[1] : '')).replace(/\/$/, '');
export function sameAct(a, b) {
  if (a.link && b.link && linkKey(a.link) === linkKey(b.link)) return true;
  const x = actKey(a.title), y = actKey(b.title); if (x.length < 4 || y.length < 4) return false;
  const gap = a.due && b.due ? Math.abs(dday(a.due, b.due)) : null;
  if (gap != null && gap > 45) return false;   /* 이름이 같아도 마감이 한 달 반 넘게 다르면 다른 회차 */
  const s = nameSim(x, y), inside = Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x));
  const hx = hostKey(a.host), hy = hostKey(b.host), both = hx.length >= 2 && hy.length >= 2, hostNear = both && (hx.includes(hy) || hy.includes(hx) || nameSim(hx, hy) >= 0.6);
  const clash = both && !hostNear;   /* 주최가 둘 다 적혀 있는데 서로 다름: "대학생 아이디어 공모전"처럼 흔한 이름은 다른 대회일 수 있음 */
  const loose = !!(a.news || b.news);   /* 기사는 주최를 줄여 쓰는 때가 많아(과기정통부) 주최가 달라 보여도 이름이 같으면 같은 것으로. 틀려도 기사 쪽이 사이트 항목에 묻힐 뿐 */
  if (x === y) return !clash || loose || (gap != null && gap <= 1 && x.length >= 12);
  if (s >= 0.85 && (gap == null || gap <= 3) && !(clash && gap == null && !loose)) return true;
  if ((s >= 0.7 || inside) && gap != null && gap <= 1 && (hostNear || inside || s >= 0.78)) return true;
  if ((inside || s >= 0.75) && hostNear && (gap == null || gap <= 3)) return true;
  return false;
}

// ── 링크에서 읽기 ── 공고 주소를 읽어 이름·마감·인원·자격·포스터를 채움. 읽어 온 것은 임시이고, 사람이 확인하고 고쳐서 담아요.
export const isActLink = u => /(linkareer\.com|wevity\.com|thinkcontest\.com|campuspick\.com|all-con\.co\.kr|detizen\.com|contestkorea\.com|allforyoung\.com|onoffmix\.com|event-us\.kr)/i.test(String(u || ''));
const SITE = /\s*[|\-–:·]\s*(링커리어|위비티|씽굿|캠퍼스픽|올콘|대티즌|콘테스트\s*코리아|요즘것들|온오프믹스|이벤터스|linkareer|wevity|네이버\s*블로그|공모전\s*대외활동)[^|]*$/i;
export async function fromLink(url, extra = '') {
  let page = null, pv = {};
  try { page = await (await import('./ai.js')).readPage(url); } catch { page = null; }
  if (!page || !(page.images || []).length || !page.title) { try { pv = await (await import('./linkpreview.js')).preview(url); } catch { pv = {}; } }
  const title0 = String((page && page.title) || pv.title || '').replace(SITE, '').replace(SITE, '').trim();
  const text = [title0, page && page.desc, pv.desc, page && page.text ? page.text.slice(0, 6000) : '', extra].filter(Boolean).join('\n');
  const p = parse(text);
  const posters = [...new Set([pv.kind === 'image' ? pv.thumb : pv.thumb, ...((page && page.images) || [])].filter(u => u && /^https?:/.test(u) && !/logo|icon|sprite|favicon|btn_|button|profile|avatar|emoji|blank\.|spacer|banner_s|\.svg(\?|$)/i.test(u)))].slice(0, 8);
  const lines = String((page && page.text) || '').split('\n').map(s => s.trim()).filter(s => s.length >= 12 && s.length <= 220 && !/로그인|회원가입|개인정보|copyright|©|메뉴|바로가기/i.test(s));
  const body = (extra.trim() || (page && page.desc) || pv.desc || lines.slice(0, 4).join('\n') || '').slice(0, 600);
  return { ...p, title: title0 || titleOf(extra) || '', link: url, poster: posters[0] || '', posters, body, status: 'want', read: !!(page || pv.title) };
}

// ── 찾아온 목록 ── 매일 아침 모아 둔 data/acts.json. 새로 온 것 중 잘 맞는 것은 그날 한 번 묶어서 알려요.
export async function loadFeed() {
  try { const r = await fetch('data/acts.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); return { updatedAt: j.updatedAt || null, items: Array.isArray(j.items) ? j.items : [], sites: Array.isArray(j.sites) ? j.sites : [], manual: Array.isArray(j.manual) ? j.manual : [] }; } } catch { }
  return { updatedAt: null, items: [], sites: [], manual: [] };
}
export const GOOD = 75;   /* 뉴스에서 온 것은 인원·자격이 비어 있는 때가 많아, 분야 하나만 맞은 것(70 안팎)은 알림까지는 안 보냄 */
export async function refreshNew(feedData, now = new Date()) {
  const items = ((feedData && feedData.items) || []).filter(i => i && i.id); if (!items.length) return null;
  const seen = new Set(await db.kvGet('acts:seen', [])); const fresh = items.filter(i => !seen.has(i.id)); if (!fresh.length) return null;
  await db.kvSet('acts:seen', items.map(i => i.id).slice(0, 2000));
  const prof = await profile(); const today = db.dayOf(now);
  const good = fresh.map(a => ({ a, r: rank(a, prof, today) })).filter(x => x.r.ok && x.r.pct >= GOOD && !(x.r.dday < 0)).sort((x, y) => y.r.pct - x.r.pct);
  if (!good.length) return null;
  const note = { date: today, at: now.toISOString(), n: good.length, title: good[0].a.title, pct: good[0].r.pct };
  await db.kvSet('acts:new', note); return note;
}
