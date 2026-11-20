// 프롬프트 스튜디오의 두뇌: 기본 틀, 빈칸({{이름}}) 채우기, 프롬프트 점검, 조립, 분류, 팀원별 작업 방식 요약.
// 화면(modules/prompts.js)과 따로 둬서 시험할 수 있게 함. AI 없이도 다 돌아감.
import * as db from './db.js';

export const ROLES = { pm: 'PM·리더', art: '아트·디자인', biz: '경영·운영', all: '공통' };
export const CATS = ['기획', '글쓰기', '디자인·이미지', '회의·정리', '돈·계약', '조사', '일정', '기타'];
export const TOOLS = ['Claude', '앱 AI', '이미지 생성', '기타'];

// 멤버의 역할 글("리더·PM·UX/UI", "아트디렉터", "경영")에서 어느 쪽 일인지 읽음. 여러 개일 수 있음.
// 관리자가 새로 만든 파트(예: "3D", "개발")는 그 파트가 닮았다고 고른 쪽을 따름 (setParts).
let PARTS = [];   /* [{ name, about, keys: ['art', …] }] 팀 기록(team-main.parts)에서 옴 */
export function setParts(list) { PARTS = (Array.isArray(list) ? list : []).filter(p => p && p.name).map(p => ({ name: String(p.name).trim(), about: String(p.about || ''), keys: (p.keys || []).filter(k => ['pm', 'art', 'make', 'biz'].includes(k)), was: (Array.isArray(p.was) ? p.was : []).map(w => String(w).trim()).filter(Boolean) })); }   /* was: 이 파트가 전에 쓰던 이름 (이름을 바꿔도 예전 역할 글을 알아봄) */
export const parts = () => PARTS.slice();
export function roleKeys(role) {
  const r = String(role || ''), out = [];
  if (/PM|피엠|리더|기획|매니저|팀장|대표/i.test(r)) out.push('pm');
  if (/아트|디자인|디렉|UX|UI|일러/i.test(r)) out.push('art');
  if (/콘텐츠|제작|영상|촬영|편집|SNS|마케팅|에디터/i.test(r)) out.push('make');
  if (/경영|회계|정산|재무|서기|총무|운영|세무/i.test(r)) out.push('biz');
  for (const p of PARTS) if (r.includes(p.name) || p.was.some(w => r.includes(w))) for (const k of p.keys) if (!out.includes(k)) out.push(k);
  return out;
}

// ── 빈칸 ──
const VAR = /\{\{\s*([^{}\n]{1,30}?)\s*\}\}/g;
export function vars(body) { const out = []; for (const m of String(body || '').matchAll(VAR)) if (!out.includes(m[1])) out.push(m[1]); return out; }
// 내 역할: 로그인한 멤버면 서버에 적힌 역할, 아니면 이 기기에서 직접 고른 역할(kv me:role)
// 팀 역할은 이 네 가지로 고정. 관리자가 멤버를 넣을 때 하나를 고르고, 바로가기·앞에 두는 메뉴·권하는 말이 역할을 따라감 (helper.js QUICK·CORE·BY_ROLE)
export const TEAM_ROLES = [{ key: 'pm', name: 'PM·리더', about: '일정, 팀, 회의, 진행 상황' }, { key: 'art', name: '아트·디자인', about: '시안, 레퍼런스, 피그마' }, { key: 'make', name: '콘텐츠 제작', about: '촬영, 편집, SNS 게시' }, { key: 'biz', name: '경영·운영', about: '비용, 구매, 업체, 정산' }];
export const MY_ROLES = TEAM_ROLES.map(r => r.name);
// 고를 수 있는 역할 전부: 기본 네 가지 + 관리자가 만든 파트
export const teamRoles = () => [...TEAM_ROLES, ...PARTS.filter(p => !TEAM_ROLES.some(r => r.name === p.name)).map(p => ({ key: 'part', name: p.name, about: p.about || TEAM_ROLES.filter(r => p.keys.includes(r.key)).map(r => r.name).join(', ') + ' 쪽', keys: p.keys, custom: true }))];
export async function myRole() { const m = await db.kvGet('me:member', null); return (m && m.role) || await db.kvGet('me:role', '') || ''; }
// 앱이 알아서 채울 수 있는 빈칸
export const AUTO = ['오늘', '내 이름', '내 역할', '팀', '팀 소개', '프로젝트', '오늘 일정', '남은 할 일'];
export async function autoValues(now = new Date()) {
  const pad = n => String(n).padStart(2, '0'), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const me = await db.kvGet('me:member', null), roster = await db.kvGet('sync:roster', []), name = (me && me.name) || await db.kvGet('name', '');
  const out = { '오늘': `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`, '내 이름': name || '', '내 역할': await myRole() };
  out['팀'] = roster.filter(r => r.name).map(r => r.role ? `${r.name}(${r.role})` : r.name).join(', ');
  out['팀 소개'] = await db.kvGet('prompts:about', '');
  const cur = await db.kvGet('chat:project', null); out['프로젝트'] = (cur && (cur.name || cur.project)) || '';
  try {
    const store = await import('./store.js');
    out['오늘 일정'] = (await store.eventsOn(today)).filter(e => e.kind !== 'focus').sort((a, b) => (a.start || '').localeCompare(b.start || '')).slice(0, 12).map(e => `${e.start || '종일'} ${e.title}`).join(', ');
    out['남은 할 일'] = (await store.openTasks()).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 15).map(t => t.title + (t.due ? ` (${+t.due.slice(5, 7)}/${+t.due.slice(8, 10)}까지)` : '')).join(', ');
  } catch { }
  return out;
}
// 사람이 채우는 빈칸 중에 앱 기록으로 미리 적어 줄 수 있는 것 (고칠 수 있게 칸에 넣어 줌): { 빈칸 이름: 값 }
const payer = e => e.paidBy || ((String(e.memo || '').match(/([가-힣]{2,4})\s*(?:님)?\s*결제/) || [])[1]) || '';   /* "굿즈 샘플비 15만원 서연이가 냄" → 메모 "안서연 결제" */
export async function seeds(now = new Date()) {
  const pad = n => String(n).padStart(2, '0'), ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const today = ymd(now), mon = new Date(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); const from = ymd(mon), month = today.slice(0, 7);
  const out = {};
  try {
    const roster = await db.kvGet('sync:roster', []); if (roster.length) out['나눌 사람'] = roster.map(r => r.name).filter(Boolean).join(', ');
    const cur = await db.kvGet('chat:project', null); if (cur && (cur.name || cur.project)) out['프로젝트 이름'] = cur.name || cur.project;
    const tasks = (await db.list('tasks')).filter(t => !t.deleted);
    const done = tasks.filter(t => t.done && db.dayOf(t.doneAt || t.updatedAt || '') >= from).slice(0, 20);
    if (done.length) out['한 일'] = done.map(t => t.title + (t.project ? ` (${t.project})` : '')).join(', ');
    const open = tasks.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 20);
    if (open.length) out['해야 할 일 목록'] = open.map(t => '- ' + t.title + ((t.due || t.who) ? ` (${[t.due ? md(t.due) + '까지' : '', t.who || ''].filter(Boolean).join(', ')})` : '')).join('\n');
    const late = open.filter(t => t.due && t.due < today).slice(0, 5); if (late.length) out['막힌 것'] = '마감이 지난 일: ' + late.map(t => t.title).join(', ');
    const ex = (await db.list('expenses')).filter(e => !e.deleted && (e.date || '').startsWith(month)).sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 60);
    if (ex.length) out['지출 내역'] = ex.map(e => `${md(e.date)} ${e.title} ${Number(e.amount || 0).toLocaleString()}원${e.category ? ' (' + e.category + ')' : ''}${payer(e) ? ' · 낸 사람 ' + payer(e) : ''}`).join('\n');
    const due = (await db.list('incomes')).filter(i => !i.deleted && i.status !== 'got' && Number(i.amount) > 0).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];   /* 가장 오래 기다린 받을 돈 */
    if (due) { out['어떤 일'] = due.title || ''; out['금액'] = Number(due.amount).toLocaleString() + '원'; if (due.from) out['받는 사람'] = due.from; if (due.date) out['지급 약속일'] = `${+due.date.slice(0, 4)}년 ${+due.date.slice(5, 7)}월 ${+due.date.slice(8, 10)}일`; }
  } catch { }
  return out;
}
// 빈칸을 채움. 알아서 채우는 빈칸이 비어 있으면 그 줄을 통째로 뺌(예: "우리 팀: {{팀 소개}}"). 사람이 채울 빈칸이 비면 [이름]으로 남김
export function fill(body, values = {}) {
  const out = [];
  for (const line of String(body || '').split('\n')) {
    // 앱이 채울 칸(팀 소개, 오늘 일정 등)이 비어 있으면: 이름표뿐인 줄은 줄째로 빼고, 다른 말이 섞인 줄은 그 토막만 뺌
    const empty = [...line.matchAll(VAR)].map(m => m[1]).filter(k => AUTO.includes(k) && !String(values[k] ?? '').trim());
    let src = line;
    if (empty.length) {
      if (/^\s*(?:[-•*]\s*)?[^:：.!?]{0,16}[:：]?\s*$/.test(line.replace(VAR, ''))) continue;
      for (const k of empty) { const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); src = src.replace(new RegExp(`[^.!?:：,\\n]{0,14}[:：]\\s*\\{\\{\\s*${esc}\\s*\\}\\}|\\{\\{\\s*${esc}\\s*\\}\\}`), ''); }
      src = src.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trimEnd();
    }
    out.push(src.replace(VAR, (_, k) => { const v = String(values[k] ?? '').trim(); return v || `[${k}]`; }));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── 점검: 좋은 프롬프트에 들어가는 것 여섯 가지 ──
export const CHECKS = [
  { id: 'goal', label: '무엇을 해 달라는지', re: /해\s?줘|해\s?주세요|만들어|써\s?줘|써\s?주세요|정리|요약|뽑아|찾아|비교|분석|검토|추천|제안|고쳐|다듬|번역|알려|설명|짜\s?줘|점검|작성|바꿔|봐\s?줘|골라|확인해|질문해|세워|나눠|줄여|늘려|적어\s?줘|그려/, tip: '끝에 "…해 줘"처럼 할 일을 한 문장으로 적어요.', add: '\n\n해 줄 일: ' },
  { id: 'context', label: '배경·상황', re: /우리|저는|나는|상황|배경|고객|클라이언트|브랜드|프로젝트|타깃|대상|목적|때문|위해|회사|팀/, tip: '누가, 왜, 어떤 상황인지 한두 줄 적으면 답이 맞아져요.', add: '\n\n상황: ' },
  { id: 'format', label: '받고 싶은 모양', re: /표로|목록|번호|글머리|개\s?로|줄로|문단|글자|자\s?(이내|안|내외)|형식|순서로|제목|항목|칸|단계|마크다운|JSON|\d+\s?(개|가지|줄|안|문장)|(한|두|세|네|다섯|여섯)\s?(줄|개|가지|문장|문단)|^\s*(\d+\.|[-•])\s|\S \| \S/im, tip: '표, 목록, 몇 개, 몇 자처럼 모양을 정해요.', add: '\n\n형식: ' },
  { id: 'tone', label: '말투·받는 사람', re: /말투|톤|존댓말|반말|정중|친근|캐주얼|공손|담백|읽는 사람|받는 사람|에게 보낼|독자|어조/, tip: '누가 읽는지, 어떤 말투인지 적어요.', add: '\n\n말투: ' },
  { id: 'limit', label: '하지 말 것·기준', re: /하지\s?마|하지\s?말|빼고|빼\s?줘|금지|않게|없이|제외|반드시|꼭|기준|조건|이내|넘지|만\s?써|만\s?사용|지\s?마(?![가-힣])|말고|확실하지 않|모르면|추측|그대로 두/, tip: '빼야 할 것, 꼭 지킬 기준을 적어요.', add: '\n\n지킬 것: ' },
  { id: 'material', label: '자료·예시', re: /아래|다음|붙여|첨부|예시|예를 들|참고|원문|내용:|자료|"""|```|\{\{/, tip: '바탕이 될 글이나 예시를 붙여요.', add: '\n\n자료:\n' },
];
export function review(body) {
  const t = String(body || '');
  const items = CHECKS.map(c => ({ id: c.id, label: c.label, ok: c.re.test(t), tip: c.tip, add: c.add }));
  const hit = items.filter(i => i.ok).length, len = t.replace(/\s/g, '').length;
  let score = Math.round(hit / CHECKS.length * 85) + (len >= 40 ? 10 : len >= 15 ? 5 : 0) + (len >= 120 ? 5 : 0);
  if (len < 8) score = 0;
  const word = score >= 85 ? '아주 좋아요' : score >= 65 ? '좋아요' : score >= 40 ? '조금만 더' : '많이 비어 있어요';
  return { score: Math.min(100, score), word, items, missing: items.filter(i => !i.ok), len };
}
// 칸을 채우면 프롬프트 한 편으로 조립
export function compose({ role = '', goal = '', context = '', material = '', format = '', tone = '', limit = '', ask = false } = {}) {
  const P = [];
  if (role.trim()) P.push(`너는 ${role.trim().replace(/[.。]$/, '')}${/(야|이야|다|요)$/.test(role.trim()) ? '' : '야'}.`);
  if (context.trim()) P.push(`상황: ${context.trim()}`);
  if (goal.trim()) P.push(`해 줄 일: ${goal.trim()}`);
  if (material.trim()) P.push(`자료:\n"""\n${material.trim()}\n"""`);
  if (format.trim()) P.push(`형식: ${format.trim()}`);
  if (tone.trim()) P.push(`말투: ${tone.trim()}`);
  if (limit.trim()) P.push(`지킬 것: ${limit.trim()}`);
  if (ask) P.push('정보가 모자라면 추측하지 말고, 시작하기 전에 나한테 먼저 질문해 줘.');
  return P.join('\n\n');
}

// ── 분류·제목 ──
const CAT_RE = [
  ['돈·계약', /견적|정산|계약|세금|부가세|비용|예산|단가|인보이스|청구|입금|미수|지원사업|공고|급여|원가/],
  ['디자인·이미지', /디자인|이미지|일러|로고|무드|컬러|색|타이포|폰트|레이아웃|시안|썸네일|포스터|미드저니|midjourney|렌더|사진|촬영 콘셉트|컨셉 ?아트|피그마/i],
  ['회의·정리', /회의록|회의|미팅|요약|정리해|받아쓰|결정사항|액션 ?아이템/],
  ['일정', /일정|스케줄|타임라인|마감|역산|마일스톤|간트|언제까지/],
  ['조사', /조사|리서치|사례|레퍼런스|벤치마크|경쟁사|트렌드|시장|비교해|찾아/],
  ['글쓰기', /메일|이메일|카피|슬로건|문구|글|초안|다듬|번역|공지|보도자료|캡션|인스타|블로그|답장|문자/],
  ['기획', /기획|제안서|아이디어|콘셉트|컨셉|전략|목차|구성|브리프|팝업|캠페인|이벤트|프로그램/],
];
export function classify(text) { const t = String(text || ''); for (const [c, re] of CAT_RE) if (re.test(t)) return c; return '기타'; }
export function titleOf(text) {
  const t = String(text || '').replace(/\{\{[^}]*\}\}/g, '').split('\n').map(s => s.trim()).filter(s => s && !/^(너는|당신은|you are)/i.test(s))[0] || String(text || '').trim();
  const s = t.replace(/^(상황|해 줄 일|자료|형식|말투)\s*[:：]\s*/, '').replace(/["'`*#]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 26 ? s.slice(0, 25) + '…' : s || '이름 없는 프롬프트';
}

// ── 팀원별 작업 방식 ──
// logs: [{ by, pid, title, cat, tool, len, sig: {goal,context,...}, at }], prompts: 저장된 프롬프트
export const samePerson = (a, b) => !!a && !!b && (a === b || (a.length === 3 && a.slice(1) === b) || (b.length === 3 && b.slice(1) === a));
export function style(logs = [], prompts = [], names = []) {
  // "하진"과 "김하진"은 같은 사람으로 묶음 (로그인 전에 이름만 적고 쓴 기록)
  const raw = [...new Set([...names, ...logs.map(l => l.by), ...prompts.map(p => p.by)].filter(Boolean))];
  const canon = n => (n && n.length === 2 && raw.find(x => x.length === 3 && x.slice(1) === n)) || n;
  const people = [...new Set(raw.map(canon))];
  return people.map(name => {
    const L = logs.filter(l => canon(l.by) === name), made = prompts.filter(p => canon(p.by) === name);
    const count = (arr, key) => { const m = {}; for (const x of arr) { const k = typeof key === 'function' ? key(x) : x[key]; if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const cats = count(L, 'cat'), tools = count(L, 'tool'), top = count(L, l => l.title).slice(0, 3);
    const n = L.length, pct = id => n ? Math.round(L.filter(l => l.sig && l.sig[id]).length / n * 100) : 0;
    const avg = n ? Math.round(L.reduce((s, l) => s + (l.len || 0), 0) / n) : 0;
    const hours = count(L, l => { const h = new Date(l.at).getHours(); return h < 6 ? '새벽' : h < 12 ? '오전' : h < 18 ? '오후' : '저녁'; });
    const habits = [];
    if (n >= 3) {
      if (avg >= 300) habits.push('길고 자세하게 시키는 편'); else if (avg && avg < 90) habits.push('짧게 툭 시키는 편');
      if (pct('format') >= 60) habits.push('받을 모양을 꼭 정함');
      if (pct('material') >= 60) habits.push('자료를 붙여서 시킴');
      if (pct('limit') >= 50) habits.push('하지 말 것을 분명히 함');
      if (pct('tone') >= 50) habits.push('말투까지 챙김');
      if (pct('context') < 35) habits.push('배경 설명은 자주 빠짐');
      if (hours[0] && hours[0][1] / n >= 0.6) habits.push(`주로 ${hours[0][0]}에 씀`);
    }
    const since = Date.now() - 7 * 864e5;
    return { name, uses: n, week: L.filter(l => Date.parse(l.at) > since).length, made: made.length, cats: cats.slice(0, 4), tools, top, avg, habits, last: L.map(l => l.at).sort().pop() || '' };
  }).sort((a, b) => b.uses - a.uses || b.made - a.made);
}

// ── 기본 틀 (역할별). 저장된 것이 아니라 앱에 들어 있는 것. "내 것으로" 하면 복사해 고칠 수 있음 ──
const T = (id, role, cat, title, body, tool = 'Claude') => ({ id: 'builtin:' + id, builtin: true, role, cat, title, body, tool });
export const BUILTIN = [
  // PM·기획
  T('pm-minutes', 'pm', '회의·정리', '회의 내용 → 결정·할 일 표', `우리 팀: {{팀 소개}}
팀원: {{팀}}

아래 회의 내용을 정리해 줘.

1. 결정된 것 (한 줄씩)
2. 할 일 표: 할 일 | 담당 | 마감 | 비고
3. 아직 안 정해진 것과, 누가 정해야 하는지

담당이나 마감이 회의에서 안 나왔으면 지어내지 말고 "미정"이라고 적어 줘.

회의 내용:
"""
{{회의 내용}}
"""`),
  T('pm-proposal', 'pm', '기획', '제안서 목차 잡기', `우리 팀: {{팀 소개}}

{{고객사}}에 낼 제안서 목차를 잡아 줘.

과제: {{과제 한 줄}}
예산: {{예산}}
기간: {{기간}}

- 장 제목과, 장마다 꼭 들어갈 내용 두세 줄
- 고객이 가장 궁금해할 질문 다섯 개와 어느 장에서 답하는지
- 우리가 작은 팀이라는 점이 약점으로 보이지 않게 풀 방법 한 가지

모르는 정보는 추측하지 말고 맨 끝에 "확인할 것"으로 모아 줘.`),
  T('pm-backplan', 'pm', '일정', '마감에서 거꾸로 일정 짜기', `오늘은 {{오늘}}이야. 팀원: {{팀}}

{{프로젝트 이름}}의 마감은 {{마감일}}이야. 마감에서 거꾸로 일정을 짜 줘.

해야 할 일:
{{해야 할 일 목록}}

- 표로: 날짜 | 할 일 | 담당 | 끝났다고 볼 기준
- 고객 확인이 필요한 날은 따로 표시하고, 답이 늦을 때를 대비한 여유를 하루 이상 둬
- 주말은 비워 둬
- 일정이 빠듯해서 위험한 구간을 맨 위에 먼저 알려 줘`),
  T('pm-mail', 'pm', '글쓰기', '고객에게 보낼 메일', `{{메일 받을 사람}}에게 보낼 메일을 써 줘.

상황: {{상황}}
부탁할 것: {{부탁할 것}}
답 받고 싶은 날: {{기한}}

- 정중하지만 길지 않게, 여섯 문장 안쪽
- 첫 문장에 용건, 마지막에 답해 줄 것 한 가지
- "혹시", "죄송하지만"은 한 번만
- 제목도 같이 써 줘`),
  T('pm-risk', 'pm', '기획', '계획에서 빠진 것 찾기', `아래 계획을 까다로운 선배 PM의 눈으로 봐 줘.

1. 빠진 일 (누가 봐도 필요한데 없는 것)
2. 일정·돈·사람에서 터질 수 있는 것 세 가지와 미리 할 일
3. 고객에게 지금 물어봐야 하는 질문

칭찬은 빼고, 고칠 것만 짧게.

계획:
"""
{{계획}}
"""`),
  T('pm-weekly', 'pm', '글쓰기', '이번 주 보고 쓰기', `우리 팀 주간 보고를 써 줘. 오늘은 {{오늘}}.

이번 주에 한 일: {{한 일}}
남은 할 일: {{남은 할 일}}
막힌 것: {{막힌 것}}

- 프로젝트별로 "한 일 / 다음 주 할 일 / 도움 필요한 것" 세 칸
- 한 칸에 세 줄 넘기지 마
- 숫자와 날짜는 그대로 살려`),
  // 아트·디자인
  T('art-concept', 'art', '디자인·이미지', '콘셉트 방향 세 가지', `우리 팀: {{팀 소개}}

{{브랜드}}의 {{만들 것}} 콘셉트 방향을 서로 확실히 다른 세 가지로 제안해 줘.

타깃: {{타깃}}
꼭 담을 느낌: {{키워드}}
피할 것: {{피할 것}}

방향마다:
- 한 줄 이름과 한 문장 설명
- 색 (메인 1, 보조 2, 헥스 코드)
- 글꼴 느낌, 그래픽 요소, 사진·일러스트 톤
- 레퍼런스를 찾을 때 쓸 검색어 다섯 개 (영어 포함)
- 이 방향의 위험한 점 한 가지`),
  T('art-image', 'art', '디자인·이미지', '이미지 생성용 프롬프트 만들기', `아래 장면을 이미지 생성 AI에 넣을 영어 프롬프트로 바꿔 줘.

장면: {{장면 설명}}
쓰임: {{어디에 쓸지}}
비율: {{비율}}

- 주제, 구도, 빛, 색, 재질, 화풍 순서로 한 문단
- 빼야 할 것(네거티브)은 따로 한 줄
- 서로 느낌이 다른 버전 세 개
- 버전마다 한국어로 한 줄 설명
- 실제 브랜드 이름, 로고, 특정 작가 이름은 넣지 마`, '이미지 생성'),
  T('art-feedback', 'art', '디자인·이미지', '받은 피드백 → 수정 목록', `아래는 시안에 대해 받은 피드백이야. 수정 목록으로 바꿔 줘.

- 표로: 고칠 곳 | 무엇을 어떻게 | 급한 정도(상·중·하) | 걸릴 시간 어림
- 서로 부딪히는 피드백은 따로 모으고, 누구에게 물어 정할지 적어
- 뜻이 애매한 말("좀 더 세련되게" 같은)은 되물을 질문으로 바꿔
- 피드백에 없는 수정은 보태지 마

피드백:
"""
{{피드백 원문}}
"""`),
  T('art-selfcheck', 'art', '디자인·이미지', '시안 내보내기 전 점검', `{{만든 것}} 시안을 내보내기 전에 점검하려고 해. 내가 설명하는 화면을 듣고 아래 기준으로 질문해 줘.

기준: 위계(가장 먼저 읽힐 것이 하나인지), 여백(답답한 곳), 정렬(어긋난 곳), 줄 나눔(어색하게 끊긴 말), 겹침, 화질, 받는 사람 눈높이

- 기준마다 내가 확인할 질문 한두 개씩
- 내가 답하면 고칠 순서를 정해 줘

화면 설명: {{화면 설명}}`),
  T('art-copy', 'art', '글쓰기', '카피·슬로건 열 개', `{{브랜드}}의 {{쓰일 곳}}에 들어갈 카피를 열 개 써 줘.

전하고 싶은 것: {{전할 말}}
말투: {{말투}}
길이: {{글자 수}}자 안쪽

- 뻔한 광고 말투("특별한", "완벽한", "새로운 경험")는 쓰지 마
- 열 개가 서로 다른 각도에서 시작하게
- 가장 좋은 세 개에 별표를 하고 이유를 한 줄씩`),
  T('art-ref', 'art', '조사', '레퍼런스에서 배울 점 뽑기', `아래 레퍼런스를 우리 작업에 어떻게 쓸지 정리해 줘.

우리 작업: {{우리 작업}}
레퍼런스: {{레퍼런스 설명이나 링크}}

- 잘된 점 세 가지 (색, 구성, 글, 동선 가운데 무엇 때문인지)
- 그대로 따라 하면 안 되는 점
- 우리 작업에 가져올 것 두 가지와 바꿔야 할 점`),
  // 경영·돈
  T('biz-quote', 'biz', '돈·계약', '견적서 항목 뽑기', `우리 팀: {{팀 소개}}

아래 일의 견적서 항목을 뽑아 줘.

일의 내용: {{과업 내용}}
기간: {{기간}}
참여 인원: {{인원}}

- 표로: 항목 | 포함되는 일 | 단위 | 수량 | 단가 칸(비워 둠) | 비고
- 견적에 포함되지 않는 것도 따로 적어 (수정 횟수, 출장비, 인쇄비 같은 것)
- 나중에 다툼이 생기기 쉬운 항목에 표시
- 금액은 네가 지어내지 말고 칸만 만들어`),
  T('biz-contract', 'biz', '돈·계약', '계약서 보기 전 점검', `아래 계약 조항을 우리(일을 받는 쪽) 입장에서 봐 줘.

1. 우리에게 불리한 조항과 이유
2. 빠져 있는 것 (대금 지급일, 수정 범위, 저작권, 해지, 지연 책임)
3. 상대에게 물어볼 질문

법률 자문이 아니라 미리 살펴보는 용도야. 확실하지 않은 건 "전문가 확인 필요"라고 적어 줘.

조항:
"""
{{계약 조항}}
"""`),
  T('biz-settle', 'biz', '돈·계약', '지출 내역 정산하기', `아래 지출 내역을 정산해 줘.

나눌 사람: {{나눌 사람}}

- 항목별 합계 표
- 누가 얼마 냈고, 누가 누구에게 얼마 보내면 되는지
- 계산 과정을 한 줄씩 보여 줘 (검산할 수 있게)
- 금액이 이상하거나 겹쳐 보이는 줄은 따로 표시
- 숫자는 내역에 있는 것만 써. 모르는 금액은 추측하지 말고 물어봐

내역:
"""
{{지출 내역}}
"""`),
  T('biz-grant', 'biz', '조사', '지원사업 공고 요약', `우리 팀: {{팀 소개}}

아래 공고를 요약해 줘.

- 표로: 지원 대상 | 금액 | 마감 | 낼 서류 | 자부담
- 우리 팀이 낼 수 있는지 (되는 이유, 걸리는 조건)
- 준비에 가장 오래 걸릴 서류와 지금 시작할 일
- 공고에 없는 내용은 추측하지 말고 "문의 필요"

공고:
"""
{{공고 내용}}
"""`),
  T('biz-dunning', 'biz', '글쓰기', '안 들어온 돈 정중히 묻기', `{{받는 사람}}에게 아직 들어오지 않은 대금을 묻는 메시지를 써 줘.

건: {{어떤 일}}
금액: {{금액}}
약속한 날: {{지급 약속일}}

- 관계가 상하지 않게, 하지만 날짜는 분명하게
- 네 문장 안쪽, 카톡용과 메일용 두 가지
- 언제까지 답을 달라는 말로 끝내`),
  T('biz-fixed', 'biz', '돈·계약', '이번 달 챙길 돈 일정', `오늘은 {{오늘}}이야. 작은 콘텐츠 기획사의 경영 담당이 이번 달에 챙겨야 할 돈 관련 일을 점검표로 만들어 줘.

우리 상황: {{사업자 형태와 상황}}

- 날짜순 점검표 (세금 신고·납부, 급여·정산, 고정비)
- 항목마다 준비할 자료
- 우리 상황을 몰라서 확실하지 않은 항목은 "확인 필요"로 표시하고, 무엇을 확인하면 되는지 적어`),
  // 공통
  T('all-summary', 'all', '회의·정리', '긴 글 세 줄 요약', `아래 글을 요약해 줘.

- 핵심 세 줄
- 내가 해야 할 일이 있으면 따로
- 글에 없는 내용은 보태지 마

글:
"""
{{글}}
"""`),
  T('all-polish', 'all', '글쓰기', '내 말투 그대로 다듬기', `아래 글을 다듬어 줘. 내 말투와 내용은 그대로 두고, 읽기 불편한 곳만 고쳐.

- 뜻이 안 통하는 문장, 겹치는 말, 맞춤법만
- AI가 쓴 것 같은 말투("~할 수 있습니다", "다양한", "혁신적인")는 넣지 마
- 고친 곳을 끝에 목록으로 알려 줘

글:
"""
{{글}}
"""`),
  T('all-ask', 'all', '기획', '질문부터 받고 시작하기', `{{하려는 일}}을 도와줘.

바로 시작하지 말고, 좋은 결과에 꼭 필요한 질문을 다섯 개 안쪽으로 먼저 해 줘. 내가 답하면 그때 시작해.

내 역할: {{내 역할}}
우리 팀: {{팀 소개}}`),
  T('all-compare', 'all', '조사', '두 가지 비교해서 고르기', `{{선택지 A}}와 {{선택지 B}} 가운데 무엇이 나은지 정해야 해.

우리 상황: {{상황}}
가장 중요한 기준: {{기준}}

- 표로 비교 (기준별)
- 네 추천 하나와 이유 세 줄
- 추천이 틀릴 수 있는 경우`),
];
export const byRole = keys => { const first = BUILTIN.filter(t => keys.includes(t.role)), rest = BUILTIN.filter(t => !keys.includes(t.role) && t.role !== 'all'); return [...first, ...BUILTIN.filter(t => t.role === 'all'), ...rest]; };
