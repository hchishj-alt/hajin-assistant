// 피그마 실시간 연동 (무료 Figma REST API + 각자 개인 토큰)
// · 파일 구조 읽기 → 자동 정리 화면 (카테고리·상태·정리 점수·할 일)
// · 버전 기록·댓글 → 활동 피드, 댓글 → 확인 대기함 할 일
// · 역방향: 앱에서 섹션에 할 일 남기면 피그마 댓글로 핀, 완료하면 댓글로 ✅ 답장
// 토큰은 이 기기에만 저장 (백업·동기화 안 됨). 분석 결과는 팀에 공유돼서 토큰 없는 팀원도 봄.
import * as db from './db.js';
import * as store from './store.js';

const API = 'https://api.figma.com/v1';
const TOKEN_KEY = 'secret:figma';
export const getToken = () => db.kvGet(TOKEN_KEY, '');
export const setToken = t => db.kvSetRaw(TOKEN_KEY, (t || '').trim());

export function parseKey(url) {
  const m = String(url || '').match(/figma\.com\/(?:design|file|proto|board)\/([0-9a-zA-Z]{22,128})(?:\/branch\/([0-9a-zA-Z]{22,128}))?/);
  if (m) return m[2] || m[1];
  return /^[0-9a-zA-Z]{22,128}$/.test(String(url || '').trim()) ? String(url).trim() : '';
}
export const nodeLink = (key, nodeId) => `https://www.figma.com/design/${key}/?node-id=${String(nodeId || '').replace(':', '-')}`;
export const fileLink = key => `https://www.figma.com/design/${key}/`;

async function api(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  if (!token) throw new Error('피그마 토큰을 먼저 넣어 주세요');
  const r = await fetch(API + path, { method, headers: { 'X-Figma-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 403) throw new Error('토큰이 맞지 않거나 이 파일 권한이 없어요');
  if (r.status === 404) throw new Error('파일을 찾을 수 없어요. 링크를 확인해 주세요');
  if (r.status === 429) throw new Error('피그마 요청이 많아요. 잠시 뒤 자동으로 다시 해요');
  if (!r.ok) throw new Error('피그마 연결 오류 ' + r.status);
  return r.json();
}
export async function me() { return api('/me'); }

// ── 분석 규칙 ──
const DEFAULT_NAME = /^(Frame|Rectangle|Group|Vector|Ellipse|image|Image|Line|Polygon|Star|Union|Subtract|Intersect|Exclude|Component|Instance|Text|Layer|Section|Mask group|Slide 16:9 -|A4 -|Desktop -|iPhone[^-]*-|Android[^-]*-)\s*\d*$/i;
export const STATUS = [
  { k: 'done', label: '확정', emoji: '✅', re: /^(✅|\[(확정|완료|done|final)\])/i, color: 'var(--ok)' },
  { k: 'review', label: '검토', emoji: '👀', re: /^(👀|\[(검토|리뷰|review)\])/i, color: 'var(--acc)' },
  { k: 'wip', label: '작업 중', emoji: '🛠', re: /^(🛠|\[(작업|wip|진행)\])/i, color: 'var(--warn)' },
  { k: 'hold', label: '보류', emoji: '⏸', re: /^(⏸|\[(보류|hold)\])/i, color: 'var(--ink3)' },
];
export const statusOf = name => STATUS.find(s => s.re.test(name || ''))?.k || 'none';
// 이름으로 분류 (이터니아 파일 기준으로 만들고, 다른 파일도 같은 규칙)
export const CATS = [
  { k: 'screen', label: '화면 흐름', icon: 'phone', re: /(^|_)SEC_\d|화면|screen|메인|타이틀|title|main|설정|setting|로비|lobby|맵|map|선택|select|npc|팝업|popup|상점|shop|셔틀|홈/i },
  { k: 'ui', label: 'UI 시트', icon: 'grid', re: /ui|인벤|inventory|아이콘|icon|버튼|button|전투|퀘스트|노트|제작|무기|화폐|컴포넌트|component|스프라이트|sprite/i },
  { k: 'art', label: '아트·배경·이펙트', icon: 'image', re: /배경|background|bg|이펙트|effect|vfx|잔해|캐릭터|character|나린|트랜지션|transition|애니|anim|일러/i },
  { k: 'brand', label: '브랜딩·인쇄·굿즈', icon: 'tag', re: /브랜딩|brand|로고|logo|패키지|package|굿즈|goods|포스터|poster|현수막|배너|banner|초대장|명함|리플렛|인쇄|print|키링|스티커/i },
  { k: 'plan', label: '기획·발표', icon: 'bulb', re: /기획|발표|slide|목차|개요|분석|전략|제안|계획|시장|타깃|pitch|deck|ir|전시/i },
  { k: 'ref', label: '레퍼런스', icon: 'link', re: /ref|레퍼|참고|reference|비교|무드|mood|자료/i },
];
export const catOf = name => (DEFAULT_NAME.test(name || '') ? 'etc' : CATS.find(c => c.re.test(name || ''))?.k || 'etc');

export function analyze(file) {
  const pages = [];
  let score = 100;
  const todo = [];
  let totalTop = 0, totalLoose = 0, totalDefault = 0, totalSections = 0, totalFrames = 0;
  const names = new Map();
  for (const pg of file.document?.children || []) {
    const kids = pg.children || [];
    const sections = kids.filter(n => n.type === 'SECTION');
    const frames = kids.filter(n => ['FRAME', 'COMPONENT', 'COMPONENT_SET'].includes(n.type));
    const loose = kids.filter(n => !['SECTION', 'FRAME', 'COMPONENT', 'COMPONENT_SET'].includes(n.type));
    const deflt = kids.filter(n => DEFAULT_NAME.test(n.name || ''));
    [...sections, ...frames].forEach(n => { const k = n.name.replace(/^(✅|🛠|👀|⏸)\s*/, ''); names.set(k, (names.get(k) || 0) + 1); });
    const archive = /옛날|old|archive|아카이브|보관|backup|백업/i.test(pg.name);
    const groups = {};
    for (const n of [...sections, ...frames]) {
      const c = archive ? 'archive' : catOf(n.name);
      (groups[c] ||= []).push({ id: n.id, name: n.name, type: n.type, status: statusOf(n.name), w: Math.round(n.absoluteBoundingBox?.width || 0), h: Math.round(n.absoluteBoundingBox?.height || 0), kids: (n.children || []).length, defaultName: DEFAULT_NAME.test(n.name || '') });
    }
    pages.push({ id: pg.id, name: pg.name, archive, top: kids.length, sections: sections.length, frames: frames.length, loose: loose.length, looseImages: loose.filter(n => n.type === 'RECTANGLE' && (n.fills || []).some(f => f.type === 'IMAGE')).length, looseTexts: loose.filter(n => n.type === 'TEXT').length, defaultNamed: deflt.length, groups });
    totalTop += kids.length; totalLoose += loose.length; totalDefault += deflt.length; totalSections += sections.length; totalFrames += frames.length;
    if (archive) continue;
    if (loose.length >= 10) todo.push({ page: pg.name, level: loose.length > 100 ? 'bad' : 'warn', text: `"${pg.name}" 페이지에 섹션·프레임 밖에 흩어진 요소 ${loose.length}개`, how: '플러그인 "흩어진 것 모으기" → 겹치는 섹션 안으로 자동, 나머지는 「📥 정리 대기」 섹션에 모이니 알맞은 섹션으로 끌어 옮기기', action: 'gather' });
    if (deflt.length >= 5) todo.push({ page: pg.name, level: 'warn', text: `"${pg.name}" 맨 위 레이어 중 기본 이름(Frame 12, image 3…) ${deflt.length}개`, how: '플러그인 "섹션 이름으로 이름 붙이기" (예: image 6767 → 전투UI_01), 화면 프레임은 "레이어 이름 정리"', action: 'nameBySection' });
    if (kids.length > 30 && sections.length < 3) todo.push({ page: pg.name, level: 'warn', text: `"${pg.name}" 페이지에 섹션이 ${sections.length}개뿐이에요`, how: '종류별로 섹션 만들기 (예: SEC_01_Title, UI_인벤토리, ART_배경). 이름 앞부분이 같으면 플러그인 "이름별 섹션 묶기"', action: 'section' });
  }
  const dups = [...names].filter(([n, c]) => c > 1 && !DEFAULT_NAME.test(n));
  if (dups.length) todo.push({ page: '', level: 'warn', text: `같은 이름의 프레임·섹션 ${dups.length}종 (${dups.slice(0, 3).map(([n, c]) => `${n} ×${c}`).join(', ')}${dups.length > 3 ? ' …' : ''})`, how: '최신본만 남기고 옛 버전은 "옛날자료" 페이지로, 또는 이름 끝에 v1·v2', action: 'audit' });
  const statusTotal = pages.flatMap(p => Object.values(p.groups).flat()).filter(n => n.status !== 'none').length;
  if (totalSections + totalFrames > 10 && statusTotal === 0) todo.push({ page: '', level: 'info', text: '상태 표시(✅ 👀 🛠 ⏸)가 아직 없어요', how: '섹션·프레임을 고르고 플러그인 "상태 표시" 버튼으로 섹션·프레임 이름 앞에 붙이면 앱에서 진행률로 보여요', action: 'status' });
  if (!(file.document?.children || []).some(p => /cover|커버|표지/i.test(p.name))) todo.push({ page: '', level: 'info', text: '커버 페이지가 없어요', how: '플러그인 "페이지 구조 + 커버" → 커버 (파일 썸네일이 깔끔해져요)', action: 'cover' });
  const live = pages.filter(p => !p.archive);
  const top = live.reduce((s, p) => s + p.top, 0) || 1;
  score -= Math.min(45, Math.round(live.reduce((s, p) => s + p.loose, 0) / top * 60));
  score -= Math.min(25, Math.round(live.reduce((s, p) => s + p.defaultNamed, 0) / top * 30));
  score -= dups.length ? Math.min(10, dups.length) : 0;
  score -= statusTotal ? 0 : 10;
  return { name: file.name, lastModified: file.lastModified, version: file.version, thumbnailUrl: file.thumbnailUrl, pages, todo, score: Math.max(0, score), totals: { top: totalTop, loose: totalLoose, defaultNamed: totalDefault, sections: totalSections, frames: totalFrames, status: statusTotal } };
}

// ── 파일 읽기 ──
export async function refresh(item, { force = false } = {}) {
  const key = item.key;
  const meta = await api(`/files/${key}?depth=1`);
  const changed = force || !item.snap || meta.version !== item.snap.version;
  let snap = item.snap;
  if (changed) {
    const full = await api(`/files/${key}?depth=2`);
    snap = { ...analyze(full), checkedAt: new Date().toISOString() };
  } else snap = { ...snap, checkedAt: new Date().toISOString() };
  let versions = item.versions || [], comments = item.comments || [];
  try { versions = ((await api(`/files/${key}/versions`)).versions || []).slice(0, 30).map(v => ({ id: v.id, at: v.created_at, who: v.user?.handle || '', label: v.label || '', desc: v.description || '' })); } catch { }
  try { comments = ((await api(`/files/${key}/comments`)).comments || []).slice(0, 200).map(c => ({ id: c.id, parent: c.parent_id || '', at: c.created_at, who: c.user?.handle || '', msg: c.message || '', resolved: !!c.resolved_at, node: c.client_meta?.node_id || '' })); } catch { }
  const hist = [...(item.history || [])];
  if (changed) hist.push({ at: snap.checkedAt, score: snap.score, loose: snap.totals.loose, frames: snap.totals.frames + snap.totals.sections, status: snap.totals.status });
  const out = await db.put('figmafiles', { ...item, name: snap.name, snap, versions, comments, history: hist.slice(-60) });
  if (changed && item.snap) out._changed = true;
  await commentsToDrafts(out);
  await sendDoneReplies(out);
  return out;
}

export async function addFile(url, share = false) {
  const key = parseKey(url);
  if (!key) throw new Error('피그마 파일 링크가 아니에요');
  const ex = (await db.list('figmafiles')).find(f => f.key === key);
  const item = ex || await db.put('figmafiles', { key, url, team: share && (await db.get('team-main')) ? 'team-main' : '', by: await db.kvGet('name', '하진'), name: '불러오는 중…' });
  return refresh(item, { force: true });
}

// 새 댓글 → 확인 대기함 (팀원 이름·할 일 말투가 있으면 할 일로)
async function commentsToDrafts(f) {
  const seen = new Set(await db.kvGet('figma:seen:' + f.key, []));
  const first = !seen.size;
  const mine = await store.myNames();
  const people = [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames()), ...mine.filter(n => n !== '나')];
  const { findAssignee, cleanTask, parseWhen } = await import('./brain.js');
  for (const c of f.comments || []) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (first || c.resolved || c.parent || /^\[(하진 비서|소머스튜디오)\]/.test(c.msg)) continue; // 처음 연결 때 옛 댓글은 건너뜀
    const who0 = findAssignee(c.msg, people);
    const isMe = mine.some(n => store.sameName(n, who0));
    const w = parseWhen(c.msg);
    const where = findNode(f, c.node);
    await store.draft('task', { title: cleanTask(c.msg, who0).replace(/\s*부탁(해요|합니다|드려요)?$/, '') || c.msg.slice(0, 60), who: isMe || who0 === '나' ? '' : who0, due: w.date || '', project: f.name, figma: { key: f.key, node: c.node, comment: c.id }, memo: `피그마 댓글 (${c.who})${where ? ' · ' + where : ''}\n${c.msg}` }, { source: `피그마 댓글: ${c.msg}`, confidence: 0.6, origin: 'figma' });
  }
  await db.kvSetRaw('figma:seen:' + f.key, [...seen].slice(-1000));
}
export function findNode(f, id) {
  if (!id) return '';
  for (const p of f.snap?.pages || []) for (const g of Object.values(p.groups)) for (const n of g) if (n.id === id) return `${p.name} › ${n.name}`;
  return '';
}

// ── 역방향: 앱 → 피그마 ──
export async function postTask(f, node, task) {
  const msg = `[소머스튜디오] ${task.who ? task.who + ': ' : ''}${task.title}${task.due ? ` (마감 ${task.due.slice(5).replace('-', '/')})` : ''}`;
  const body = { message: msg };
  if (node?.id) body.client_meta = { node_id: node.id, node_offset: { x: 24, y: 24 } };
  const c = await api(`/files/${f.key}/comments`, { method: 'POST', body });
  return c.id;
}
async function sendDoneReplies(f) {
  if (!(await getToken())) return;
  const ts = (await db.list('tasks')).filter(t => t.figma?.key === f.key && t.figma.comment && t.done && !t.figma.doneSent);
  for (const t of ts) {
    try { await api(`/files/${f.key}/comments`, { method: 'POST', body: { message: `[소머스튜디오] ✅ 완료${t.who ? ' · ' + t.who : ''}`, comment_id: t.figma.comment } }); await db.patch(t.id, { figma: { ...t.figma, doneSent: true } }); } catch { }
  }
}

// ── 실시간 감시: 인터넷 되고 화면 켜져 있으면 1분마다 바뀐 것만 확인 ──
let timer = null;
export function watch(onChange) {
  if (timer) return;
  const tick = async () => {
    if (!navigator.onLine || document.visibilityState !== 'visible' || !(await getToken())) return;
    for (const f of await db.list('figmafiles')) {
      try { const r = await refresh(f); if (r._changed) onChange && onChange(r); } catch (e) { if (/429/.test(e.message)) break; }
    }
  };
  timer = setInterval(tick, 60 * 1000);
  setTimeout(tick, 4000);
}

export const GUIDE = [
  ['섹션으로 나누기', '페이지 맨 위에는 섹션과 프레임만 두기. 흩어진 이미지·텍스트는 섹션 안으로. 화면은 SEC_번호_이름 (예: SEC_03_Workbench), 시트는 UI_인벤토리, ART_배경, BRAND_패키지처럼 앞에 종류.'],
  ['이름 규칙', '기본 이름(Frame 12, image 6767, Slide 16:9 - 133) 금지. 화면은 "화면이름/상태" (예: 인벤토리/열림), 이미지는 "섹션이름_번호". 같은 이름 두 개면 v1·v2 붙이기.'],
  ['상태 표시', '섹션·프레임 이름 앞에 ✅ 확정, 👀 검토, 🛠 작업 중, ⏸ 보류 (또는 [확정] [검토] [작업] [보류]). 앱에서 진행률·팀 보드로 바로 보여요.'],
  ['옛날 자료 분리', '안 쓰는 시안은 "옛날자료" 페이지로. 그 페이지는 점수 계산과 할 일에서 빠져요.'],
  ['일 맡기기는 댓글로', '피그마 댓글에 "민서 금요일까지 버튼 상태 3종" 처럼 쓰면 앱 확인 대기함에 할 일로 들어와요. 앱에서 섹션에 할 일을 남기면 거꾸로 피그마 댓글로 핀이 꽂히고, 완료하면 ✅ 답장이 달려요.'],
  ['커버 페이지', '맨 앞에 Cover 페이지 하나 (플러그인 "커버 만들기"). 파일 목록 썸네일이 정리돼요.'],
  ['내보내기 프레임', '인쇄·제출용은 "내보내기" 페이지에 따로 두고 이름에 규격 (예: 현수막_2992x1683mm).'],
];
