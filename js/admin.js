// 관리자 권한 + 수정 기록
// · 로그인 안 한 기기(혼자 쓰기)는 그 기기 주인이 관리자.
// · 로그인하면 관리자 코드로 들어온 사람만: 폴더·팀·멤버 관리, 통계, 남이 올린 공유 항목 고치기·지우기.
// · 팀에 공유된 항목은 누가·언제·무엇을·어떻게 바꿨는지 전부 기록 (관리자 화면에서 봄).
import * as db from './db.js';

const FREE = new Set(['tasks', 'pollvotes', 'polls', 'leadmarks', 'leadfb', 'events', 'audit', 'drafts', '_kv', 'buys', 'boards', 'dms', 'feedback', 'accts', 'posts', 'devreqs']); // 누구나 고칠 수 있는 공유 항목
const ADMIN_ONLY_COLS = new Set(['teams', 'projects', 'reffolders', 'labelsets']);                                   // 만들기부터 관리자만
const SKIP = new Set(['updatedAt', 'createdAt', 'dirty', 'id', 'col', 'sharedMembers', 'code', 'space']);
const BIG = new Set(['snap', 'comments', 'versions', 'history', 'transcript', 'body', 'avail', 'summary', 'summaryDraft', 'pages']);
export const LABEL = { tasks: '할 일', events: '일정', meetings: '회의록', expenses: '비용', refs: '레퍼런스', contacts: '연락처', reffolders: '하위 폴더', projects: '폴더(프로젝트)', teams: '팀', polls: '시간 조율', pollvotes: '가능 시간', docs: '문서', notes: '메모', figmafiles: '피그마 파일', grants: '지원사업', leads: '랭킹 링크', leadmarks: '찜', labelsets: '중요도 색', buys: '구매 목록', boards: '마인드맵 회의', dms: '메시지', feedback: 'AI 피드백' };

let cache = null;
export async function who() {
  if (cache && Date.now() - cache.at < 3000) return cache;
  const m = await db.kvGet('me:member', null);
  const loggedIn = !!m;
  cache = { at: Date.now(), name: await db.kvGet('name', '하진'), loggedIn, admin: !loggedIn || !!m.is_admin };
  return cache;
}
export const isAdmin = async () => (await who()).admin;
export const clearCache = () => { cache = null; };

const short = (v, k) => { if (k === 'team') return v ? '팀 공유' : '나만 보기';  if (v == null || v === '') return '없음'; if (typeof v === 'boolean') return v ? '예' : '아니오'; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 70 ? s.slice(0, 70) + '…' : s; };
export function diff(prev, item) {
  const out = [];
  for (const k of new Set([...Object.keys(prev || {}), ...Object.keys(item)])) {
    if (SKIP.has(k)) continue;
    const a = prev?.[k], b = item[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out.push(BIG.has(k) ? { k, from: a == null ? '없음' : '(이전 내용)', to: b == null ? '없음' : `(내용 바뀜${typeof b === 'string' ? ` · ${b.length}자` : ''})` } : { k, from: short(a, k), to: short(b, k) });
  }
  return out;
}

async function guard(prev, item) {
  if (item.col === 'audit' || item.col === '_kv' || item.col === 'drafts') return;
  if (prev && item.team === 'auto') item.team = prev.team || '';
  if (!item.deleted) { const A = await import('./auto.js'); if (!prev) await A.fill(item, { hasTeam: !!(await db.get('team-main')), projects: (await db.list('projects')).map(p => p.name), teamNames: (await db.kvGet('sync:roster', [])).map(r => r.name).filter(Boolean) }); else await A.learn(prev, item); }
  const shared = !!(item.team || prev?.team || item.space || prev?.space);
  const me = await who();
  if (!prev && shared && !item.by) item.by = me.name;
  if (me.loggedIn && !me.admin) {
    if (ADMIN_ONLY_COLS.has(item.col) && (shared || !prev)) throw new Error('폴더·팀 관리는 관리자만 할 수 있어요');
    if (shared && prev && !FREE.has(item.col) && prev.by && prev.by !== me.name) throw new Error(`${prev.by} 님이 올린 항목이에요. 고치기·지우기는 올린 사람과 관리자만 할 수 있어요`);
  }
  // 공유 → 나만 보기로 바꾸면 팀 공간에서는 빼기 (내 기록은 그대로)
  if (prev?.team && !item.team && me.loggedIn) import('./sync.js').then(s => s.unshare(prev)).catch(() => { });
  if (!shared || !me.loggedIn || item.col === 'bnodes' || item.col === 'pollvotes' || item.col === 'leadmarks' || item.col === 'leadfb') return;
  const changes = diff(prev, item);
  if (prev && !changes.length) return;
  const action = !prev ? '만듦' : item.deleted && !prev.deleted ? '지움' : changes.length === 1 && changes[0].k === 'done' ? (item.done ? '완료' : '완료 취소') : '고침';
  queueMicrotask(() => db.put('audit', { team: 'team-main', by: me.name, action, refCol: item.col, ref: item.id, title: item.title || item.name || prev?.title || '(제목 없음)', changes: !prev ? [] : changes.slice(0, 12), device: /iPad|Macintosh.*Mobile/.test(navigator.userAgent) ? '아이패드' : /iPhone|Android.*Mobile/.test(navigator.userAgent) ? '폰' : /Android/.test(navigator.userAgent) ? '태블릿' : 'PC' }).catch(() => { }));
}
export function install() { db.setGuard(guard); }
