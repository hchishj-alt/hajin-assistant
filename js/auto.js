// 알아서 분류: 새 항목의 공유 여부·중요도 색·폴더를 글 내용으로 정하고, 사람이 고치면 그 단어를 배워 다음부터 반영.
// (팀을 위한 앱이라 기본은 "팀에 공유", 개인적인 내용만 나만 보기)
import * as db from './db.js';
import * as brain from './brain.js';
import * as SC from './scope.js';

const COLS = { contacts: [], events: ['share', 'label', 'project'], tasks: ['share', 'project'], meetings: ['share', 'label', 'project'], refs: ['share'], buys: ['share'], notes: ['share', 'project'], docs: ['share'], grants: ['share'] };
const PRIVATE = /병원|치과|약국|진료|검진|개인|사적|가족|엄마|아빠|부모님|동생|언니|오빠|누나|형\b|남친|여친|애인|데이트|소개팅|친구|생일|기념일|집\s|이사|월세|관리비|은행|대출|적금|운동|헬스|필라테스|요가|pt\b|미용실|네일|휴가|여행|결혼식|장례|과외|알바|면접|수업|학교|과제|시험|동아리|종강|개강|자취|택배|약속/i;
const TEAMY = /팀|회의|미팅|킥오프|클라이언트|고객|외주|납품|시안|피드백|촬영|편집|업로드|발표|제안서|견적|계약|정산|공유|리뷰|스프린트|마감|전시|부스|워크숍|회식/;
const LABEL = [['urgent', /긴급|급함|급해|급하게|당장|오늘\s*까지|내일\s*까지|asap|지금\s*바로|마감\s*임박|데드라인/i], ['important', /중요|발표|클라이언트|고객|계약|제출|납품|마감|심사|면접|킥오프|최종|결정|보고/], ['idea', /아이디어|브레인스토밍|구상|컨셉|콘셉트|레퍼런스\s*찾|리서치/], ['easy', /여유|천천히|시간\s*날\s*때|언젠가|나중에|가볍게/]];

let L = null;
async function learned() { if (!L) L = (await db.kvGet('auto:learned', null)) || { share: {}, label: {}, project: {} }; return L; }
const words = t => [...new Set(brain.tokens(String(t || '')).filter(w => w.length >= 2))].slice(0, 12);
const textOf = i => [i.title, i.name, i.memo, i.place, i.attendees, i.project, i.folder].filter(Boolean).join(' ');
function vote(map, ws) { const sc = {}; for (const w of ws) for (const [k, n] of Object.entries(map[w] || {})) sc[k] = (sc[k] || 0) + n; const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0]; return top && top[1] >= 1 ? top[0] : null; }

// 새 항목: 비어 있는 칸만 채움 (사람이 고른 값은 건드리지 않음)
export async function fill(item, { hasTeam, projects = [], loggedIn, teamNames = [] }) {
  if (item.team === 'auto') item.team = undefined;
  const want = COLS[item.col]; if (!want || item.autoOff) { if (item.team === undefined) item.team = ''; return; }
  const text = textOf(item), ws = words(text), lr = await learned(); const auto = {};
  const scoped = item.col === 'events' || item.col === 'tasks';
  // 개인 / 팀 업무: 사람이 고른 값이 있으면 그대로, 없으면 배운 것 → 글의 맥락 순으로
  let scope = item.scope || (item.team === 'team-main' ? 'work' : item.team === '' ? 'personal' : '');
  if (!scope) { const v = vote(lr.share, ws); scope = v ? (v === 'priv' ? 'personal' : 'work') : scoped ? SC.guess(text, { who: item.who || item.attendees || '', team: teamNames }) : (PRIVATE.test(text) && !TEAMY.test(text) ? 'personal' : 'work'); auto.team = true; }
  if (scoped) item.scope = scope;
  item.team = scope === 'work' && want.includes('share') && hasTeam ? 'team-main' : '';
  if (want.includes('label') && !item.label) {
    let id = vote(lr.label, ws) || (LABEL.find(([, re]) => re.test(text)) || [])[0];
    if (!id && item.date) { const d = Math.round((new Date(item.date) - new Date(new Date().toISOString().slice(0, 10))) / 864e5); if (d >= 0 && d <= 1 && TEAMY.test(text)) id = 'important'; }
    if (id) { item.label = id; auto.label = true; }
  }
  if (want.includes('project') && !item.project && projects.length) {
    const p = projects.find(p => p && text.replace(/\s/g, '').toLowerCase().includes(p.replace(/\s/g, '').toLowerCase())) || vote(lr.project, ws);
    if (p && projects.includes(p)) { item.project = p; auto.project = true; }
  }
  if (Object.keys(auto).length) item.auto = auto;
}
// 사람이 고쳤을 때: 그 글의 단어들에 새 값을 +2, 틀렸던 값은 −1
export async function learn(prev, item) {
  const want = COLS[item.col]; if (!want || !prev) return;
  const lr = await learned(); const ws = words(textOf(item)); let changed = false;
  const bump = (map, key, was) => { for (const w of ws) { map[w] = map[w] || {}; map[w][key] = (map[w][key] || 0) + 2; if (was != null) map[w][was] = (map[w][was] || 0) - 1; } changed = true; };
  // 구분을 고치면(개인 ↔ 팀 업무) 공유도 같이 따라가고, 그 낱말을 배움
  if ((item.col === 'events' || item.col === 'tasks') && item.team === 'auto') item.team = prev.team || '';
  const ps = prev.scope || (prev.team ? 'work' : 'personal'); let ns = item.scope || ps;
  if ((prev.team || '') !== (item.team || '') && ns === ps) ns = item.team ? 'work' : 'personal';
  if ((item.col === 'events' || item.col === 'tasks') && !item.deleted) { item.scope = ns; if (ns !== ps) { item.team = ns === 'work' && (await db.get('team-main')) ? 'team-main' : ''; bump(lr.share, ns === 'work' ? 'team' : 'priv', ps === 'work' ? 'team' : 'priv'); } }
  else if (want.includes('share') && (prev.team || '') !== (item.team || '') && !item.deleted) bump(lr.share, item.team ? 'team' : 'priv', prev.team ? 'team' : 'priv');
  if (want.includes('label') && (prev.label || '') !== (item.label || '') && item.label) bump(lr.label, item.label, prev.label || null);
  if (want.includes('project') && (prev.project || '') !== (item.project || '') && item.project) bump(lr.project, item.project, prev.project || null);
  if (changed) { if (item.auto) { item.auto = { ...item.auto }; for (const k of ['team', 'label', 'project']) if ((prev[k] || '') !== (item[k] || '')) delete item.auto[k]; } await db.kvSet('auto:learned', lr); }
}
export async function stats() { const lr = await learned(); return { share: Object.keys(lr.share).length, label: Object.keys(lr.label).length, project: Object.keys(lr.project).length }; }
export async function forget() { L = { share: {}, label: {}, project: {} }; await db.kvSet('auto:learned', L); }
