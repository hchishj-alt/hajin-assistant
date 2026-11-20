// "할 일로 쓴 거 왜 할 일에 없어?" 같은 물음에, 앱 안의 기록을 직접 보고 답함
// 최근에 비서로 적은 것이 지금 어디에 있는지: 대기함(확정 전), 어느 목록·어느 탭, 버렸는지, 지워졌는지
import * as db from './db.js';
import * as store from './store.js';

const KW = [['task', /할\s*일|투두|todo/i], ['event', /일정|캘린더|달력|약속/], ['idea', /아이디어/], ['note', /메모|노트/], ['expense', /지출|쓴\s*돈|영수증/], ['income', /받을\s*돈|입금/], ['contact', /연락처|인맥/], ['buy', /살\s*것|장바구니/]];
const kindOf = t => (KW.find(([, re]) => re.test(t)) || [''])[0];

export function isWhere(text) {
  const t = String(text || '').trim(); if (!t || t.length > 70 || /\n/.test(t)) return false;
  if (/(야\s*(해|돼|함|됨|지|겠\S*)|해야\S*|하기|해\s*줘|주세요)\s*[.!]?$/.test(t)) return false; // 할 일을 적는 말
  const gone = /(안\s*보[여이]|안\s*떠|안\s*뜨|안\s*나[와오]|안\s*들어[가갔]|사라[졌지]|없어졌|못\s*찾)/.test(t);
  const where = /(어디\s*(갔|있|로|에|서)|어딨|어디야|어디지)/.test(t);
  const none = /없(어|지|는|네|음|냐|나|다|던데|잖아)/.test(t);
  const made = /(쓴|적은|말한|넣은|만든|추가한|저장한|확정한|등록한|입력한)\s*(거|것|게|건|걸)|(썼|적었|말했|넣었|만들었|추가했|저장했|확정했|등록했|입력했)(는데|었는데|잖아|어도|어)|방금|아까/.test(t);
  const list = !!kindOf(t) || /대기함|목록|리스트/.test(t);
  if (/왜/.test(t) && (gone || none) && (list || made)) return true;
  if (gone && (list || made)) return true;
  if ((where || none) && made) return true;
  if (/(저장|확정)\s*(이|은|가)?\s*(안\s*)?(됐|된|됨|돼|되)\S*\s*\??$/.test(t) && /(\?|[어나지야니]$|건가$|거야$|거지$|맞아$)/.test(t)) return true; // "저장 됐어?", "확정 안 됐나?"
  return false;
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const md = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '';
const ro = w => { const c = String(w).charCodeAt(String(w).length - 1); const f = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0; return f > 0 && f !== 8 ? '으로' : '로'; };
const jo = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0 ? a : b; };

// 저장된 기록이 어느 화면 어디에 보이는지
export async function placeOf(kind, rec, today = ymd(new Date())) {
  const k = Object.values(store.KINDS).find(x => x.col === rec.col && x === store.KINDS[kind]) || Object.values(store.KINDS).find(x => x.col === rec.col) || store.KINDS[kind] || {};
  if (rec.col === 'tasks') {
    const mine = await store.mineFilter();
    if (rec.done) return { where: '할 일 › 완료 탭', why: '끝낸 일로 표시돼 있어요', route: 'tasks', label: '할 일' };
    if (!mine(rec)) return { where: '할 일 › 담당자별 탭', why: `담당이 ${rec.who}라서 내 목록에는 안 보여요`, route: 'tasks', label: '할 일' };
    if (rec.due && rec.due > today) return { where: '할 일 › 예정 탭', why: `마감이 ${md(rec.due)}이라 오늘 탭에는 안 보여요`, route: 'tasks', label: '할 일' };
    return { where: '할 일 › 오늘 탭', why: rec.due === today ? '오늘 마감' : rec.due ? `마감 ${md(rec.due)}이 지났어요` : '마감 없음', route: 'tasks', label: '할 일' };
  }
  if (rec.col === 'events') return { where: `캘린더 ${md(rec.date)}${rec.start ? ' ' + rec.start : ''}`, why: '', route: 'calendar', label: '일정' };
  return { where: `${k.label || '기록'} 목록`, why: '', route: k.route || 'today', label: k.label || '기록' };
}

export async function find(text, { days = 3, max = 3 } = {}) {
  const kind = kindOf(text); const label = store.KINDS[kind]?.label || '기록'; const today = ymd(new Date()); const since = Date.now() - days * 864e5;
  const recent = x => Date.parse(x.createdAt || 0) > since; const newest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  const all = (await db.list('drafts')).filter(d => d.kind !== 'summary' && recent(d)).sort(newest);
  // 날짜가 없어서 할 일로 들어간 일정도 "할 일"로 침
  const isKind = async d => { if (!kind || d.kind === kind) return true; if (d.status === 'approved' && d.resultId) { const r = await db.get(d.resultId); return !!r && r.col === store.KINDS[kind]?.col; } return false; };
  const same = []; for (const d of all) if (await isKind(d)) same.push(d);
  // 물음에 제목 낱말이 있으면("견적서 왜 없어?") 그 낱말이 든 것을 먼저, 임시 기록에 없으면 저장된 목록에서도 찾음
  const words = String(text).replace(/[?？!.,]/g, ' ').split(/\s+/).map(w => w.replace(/(은|는|이|가|을|를|에|도|로|으로|에서|랑|이랑|한테)$/, '')).filter(w => w.length >= 2 && !/^(왜|어디|어딨|방금|아까|안|못|없|있|보여|보이|떠|뜨|나와|갔|사라|저장|확정|목록|리스트|대기함|쓴|적은|말한|넣은|만든|거|것|건|게|걸|할|일|할일|일정|캘린더|달력|약속|메모|노트|아이디어|지출|연락처)/.test(w));
  const hit = t => words.some(w => String(t || '').replace(/\s/g, '').includes(w));
  const named = words.length ? all.filter(d => hit(d.data.title || d.data.name)) : [];
  const pick = (named.length ? named : same.length ? same : all).slice(0, max);
  const extra = []; if (words.length) { const tied = new Set(pick.map(d => d.resultId).filter(Boolean)); for (const col of kind && store.KINDS[kind]?.col ? [store.KINDS[kind].col] : ['tasks', 'events']) for (const rec of await db.list(col)) if (hit(rec.title || rec.name) && !tied.has(rec.id)) extra.push(rec); }
  // "적어 둘까요?"에 아직 답하지 않은 말
  const asked = (await db.list('chat')).filter(m => m.role === 'bot' && recent(m) && !m.chipDone && m.q && (m.chips || []).some(c => c.make)).sort(newest).slice(0, 1);

  const lines = [], items = [], draftIds = [], chips = [];
  for (const d of pick) {
    const title = d.data.title || d.data.name || '(제목 없음)'; const kl = store.KINDS[d.kind]?.label || '기록';
    if (d.status === 'pending') { lines.push(`“${title}”${jo(title, '은', '는')} 아직 확정 전이라 대기함에 있어요. 아래에서 확정하면 ${kl} 목록에 들어가요.`); draftIds.push(d.id); continue; }
    if (d.status === 'rejected') { lines.push(`“${title}”${jo(title, '은', '는')} 버린 걸로 돼 있어요.`); chips.push({ label: `“${title.slice(0, 12)}” 되살리기`, follow: { op: 'revive', items: [{ id: d.id }] } }); continue; }
    const rec = d.resultId ? await db.get(d.resultId) : null;
    if (!rec) { lines.push(`“${title}”${jo(title, '은', '는')} 확정은 됐는데 저장된 기록을 못 찾았어요. 다시 말해 주면 새로 적어 둘게요.`); if (d.source) chips.push({ label: '다시 적기', say: d.source }); continue; }
    const rt = rec.title || rec.name || title;
    if (rec.deleted) { lines.push(`“${rt}”${jo(rt, '은', '는')} 확정한 뒤에 지워졌어요.`); chips.push({ label: `“${rt.slice(0, 12)}” 되살리기`, act: { op: 'restore', prev: rec } }); continue; }
    const p = await placeOf(d.kind, rec, today);
    lines.push(`“${rt}”${jo(rt, '은', '는')} 확정돼서 ${p.where}에 있어요${p.why ? ` (${p.why})` : ''}.`);
    items.push({ icon: store.KINDS[d.kind]?.icon || 'file', title: rt, sub: `${p.where}${p.why ? ' · ' + p.why : ''}`, route: p.route });
  }
  if (extra.length) { if (!named.length) { lines.length = 0; items.length = 0; draftIds.length = 0; chips.length = 0; }
    for (const rec of extra.slice(0, max)) { const kd = Object.keys(store.KINDS).find(k => store.KINDS[k].col === rec.col) || 'task'; const p = await placeOf(kd, rec, today); const rt = rec.title || rec.name;
      lines.push(`“${rt}”${jo(rt, '은', '는')} ${p.where}에 있어요${p.why ? ` (${p.why})` : ''}.`); items.push({ icon: store.KINDS[kd]?.icon || 'file', title: rt, sub: `${p.where}${p.why ? ' · ' + p.why : ''}`, route: p.route }); } }
  if (!extra.length) for (const m of asked) { lines.push(`“${m.q.slice(0, 30)}”${jo(m.q, '은', '는')} 어떻게 적을지 아직 고르지 않아서 어디에도 안 들어갔어요. 위에서 “할 일로”를 누르거나 다시 말해 주세요.`); }
  if (!lines.length) {
    const n = kind === 'task' ? (await db.list('tasks')).filter(t => !t.done).length : 0;
    return { text: `최근 ${days}일 동안 비서로 적은 ${label}${jo(label, '을', '를')} 못 찾았어요.${n ? ` 지금 남은 할 일은 모두 ${n}개예요.` : ''} 다시 말해 주면 바로 적어 둘게요.`, items: n ? [{ icon: 'check2', title: '할 일 열기', sub: `남은 일 ${n}개`, route: 'tasks' }] : [], draftIds: [], chips: [] };
  }
  const lead = kind && !same.length && pick.length ? `최근에 ${label}${ro(label)} 적힌 건 없고, 가장 최근에 적은 건 이래요. ` : '';
  return { text: lead + lines.join(' '), items, draftIds, chips };
}
