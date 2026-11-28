// 어느 화면에서든 비서 부르기 + 메뉴 줄이기.
//  · 비서 창: 지금 보는 화면 위에 비서를 띄움. 그 화면과 내 역할에 맞는 말을 먼저 권하고, AI에게도 어느 화면인지 알려 줌
//  · 메뉴: 내 역할에서 주로 쓰는 것 + 실제로 자주 연 것만 앞에 두고, 나머지는 "더보기"로 접음 (없애지 않음. 직접 고정·해제 가능)
import { h, ic, modal } from './ui.js';
import * as db from './db.js';
import { roleKeys, myRole, teamRoles } from './prompts.js';

// 화면마다: say = 그 화면에서 바로 통하는 말(앱 규칙만으로도 답함), about = AI에게 알려 줄 화면 설명
export const SCREENS = {
  today: { say: ['뭐부터 할까?', '오늘 빈 시간', '밀린 할 일', '내일 일정'], about: '오늘 일정·할 일·대기함을 한눈에 보는 첫 화면' },
  calendar: { say: ['이번 주 일정', '이번 주 빈 시간', '다음 주 일정', '내일 오후 3시 팀 회의'], about: '일정을 달력으로 보고 넣는 화면' },
  tasks: { say: ['뭐부터 할까?', '밀린 할 일', '이번 주 마감', '금요일까지 견적서 보내기'], about: '할 일을 오늘·예정·전체·완료·담당자별로 보는 화면' },
  inbox: { say: ['오늘 할 일', '오늘 일정', '뭐부터 할까?'], about: '소머AI가 읽어 만든 임시 항목을 확정하거나 버리는 화면' },
  meetings: { say: ['팀 일정', '이번 주 일정', '내일 오전 10시 주간 회의', '누가 바빠?'], about: '회의를 녹음·기록하고 요약과 할 일을 뽑는 화면' },
  board: { say: ['팀 일정', '프로젝트 진행 상황', '이번 주 마감'], about: '회의하면서 생각을 마인드맵으로 펼치는 화면' },
  plan: { say: ['프로젝트 진행 상황', '이번 주 마감', '누가 바빠?', '뭐부터 할까?'], about: '프로젝트별 기획과 진행을 보는 화면' },
  prompts: { say: ['프로젝트 진행 상황', '오늘 할 일', '이번 주 마감'], about: 'AI에게 일 시키는 말(프롬프트)을 모아 두고 빈칸만 채워 쓰는 화면' },
  studio: { say: ['이번 주 마감', '오늘 할 일', '이번 주 일정'], about: 'SNS 영상·피드 게시글을 만드는 화면' },
  archive: { say: ['이번 주 마감', '오늘 할 일'], about: '레퍼런스 이미지·링크를 모아 두는 화면' },
  figma: { say: ['이번 주 마감', '오늘 할 일'], about: '피그마 파일을 읽어 정리해 보여 주는 화면' },
  talk: { say: ['누가 바빠?', '팀 일정', '오늘 일정'], about: '팀원과 메시지를 주고받는 화면' },
  people: { say: ['이번 주 일정', '홍길동 010-1234-5678 디자이너'], about: '연락처와 만난 기록을 모아 두는 화면' },
  team: { say: ['누가 바빠?', '팀 일정', '이번 주 빈 시간', '프로젝트 진행 상황'], about: '팀원 일정을 맞추고 역할을 보는 화면' },
  money: { say: ['이번 달 지출', '받을 돈 얼마야?', '점심 9000원', '어도비 구독 3만7천원 결제'], about: '지출과 받을 돈을 적고 정산하는 화면' },
  shop: { say: ['이번 달 지출', '받을 돈 얼마야?'], about: '살 물건 목록과 가격을 정리하는 화면' },
  vendors: { say: ['이번 달 지출', '이번 주 일정'], about: '거래하는 업체를 모아 두는 화면' },
  radar: { say: ['이번 주 마감', '프로젝트 진행 상황'], about: '지원사업 공고와 정보를 모아 순위를 보는 화면' },
  acts: { say: ['이번 주 마감', '○○ 공모전 12월 20일 마감 팀 4명까지', '오늘 할 일'], about: '공모전·서포터즈를 팀이 같이 모아 두고 마감과 단계를 챙기는 화면' },
  startup: { say: ['프로젝트 진행 상황', '이번 주 마감'], about: '사업 계획과 지표를 정리하는 화면' },
  _: { say: ['뭐부터 할까?', '오늘 일정', '밀린 할 일'], about: '' },
};
const BY_ROLE = { pm: ['누가 바빠?', '프로젝트 진행 상황'], art: ['오늘 마감', '이번 주 마감'], make: ['오늘 일정', '이번 주 마감'], biz: ['이번 달 지출', '받을 돈 얼마야?'] };

export async function who() {
  const m = await db.kvGet('me:member', null); const role = await myRole();
  return { name: (m && m.name) || await db.kvGet('name', '') || '', role, keys: roleKeys(role), local: !(m && m.role) };   /* local = 이 기기에서 직접 고른(고를 수 있는) 역할 */
}
// 그 화면에서 권할 말: 화면 것 먼저, 그다음 내 역할 것, 팀원 이름이 있으면 "○○ 할 일"도. 겹치는 건 빼고 6개까지
export async function suggestFor(id, me) {
  me = me || await who(); const sc = SCREENS[id] || SCREENS._; const out = [...sc.say];
  for (const k of me.keys) for (const s of (BY_ROLE[k] || [])) out.push(s);
  if (['team', 'talk', 'tasks', 'plan'].includes(id)) { const roster = await db.kvGet('sync:roster', []); const other = roster.map(r => r.name).filter(n => n && n !== me.name)[0]; if (other) out.splice(2, 0, `${other.length > 2 ? other.slice(1) : other} 할 일`); }
  return [...new Set(out)].slice(0, 6);
}

let opened = false;
export async function openSheet(id, say = '') {
  if (opened || document.querySelector('.modal-bg')) return; opened = true;
  const { MODULES, go, refresh } = await import('./app.js'); const m = MODULES.find(x => x.id === id) || {}; const sc = SCREENS[id] || SCREENS._;
  const me = await who(); const suggest = await suggestFor(id, me);
  const box = h('div.aisheet'); let cleanup = null, changed = false, shut = false;
  const off = db.onChange(col => { if (col !== 'chat') changed = true; });
  const close = modal('소머AI', c => h('div',
    h('div.aisheet-top', h('span.chip', ic(m.icon || 'sparkles', 13), `지금 화면: ${m.short || m.title || '앱'}`),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => { c(); go('assistant'); } }, ic('right', 14), '크게 보기')),
    box), { wide: true, nofocus: true, onClose: () => { shut = true; opened = false; try { off && off(); } catch { } try { cleanup && cleanup(); } catch { }
      if (changed && location.hash.replace(/^#\//, '').split('/')[0] === id && !document.querySelector('.modal-bg')) refresh(); } });   /* 비서가 뭔가 넣었으면 뒤 화면을 새로 그림 */
  box.closest('.modal')?.classList.add('ai-modal');
  try { const mod = (await import('../modules/assistant.js')).default; const c2 = await mod.render(box, [], { sheet: { suggest, screen: `${m.title || ''}${sc.about ? ' (' + sc.about + ')' : ''}`, role: me.role, say } }); if (shut) { try { c2 && c2(); } catch { } } else cleanup = c2; }
  catch (e) { box.append(h('p.small.muted', '소머AI를 열지 못했어요. 아래 "소머AI" 화면에서 다시 해 주세요.')); console.error(e); }
  return close;
}

// 화면 아래 가운데 "비서" 탭(폰)과 오른쪽 아래 단추(넓은 화면): 비서 화면이 아닌 곳에서 누르면 그 화면 위에 띄움
export function start() {
  const cur = () => (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'today';
  document.getElementById('tabbar')?.addEventListener('click', e => { const a = e.target.closest('a[data-nav="assistant"]'); if (!a || cur() === 'assistant' || e.metaKey || e.ctrlKey) return; e.preventDefault(); openSheet(cur()); });
  const fab = h('button#ai-fab', { type: 'button', 'aria-label': '소머AI 부르기', title: '이 화면에서 소머AI 부르기', onclick: () => openSheet(cur()) }, ic('sparkles', 22), h('span', '소머AI'));
  document.body.append(fab);
  const sync = () => fab.classList.toggle('hide', cur() === 'assistant');
  window.addEventListener('hashchange', sync); sync();
}

// 오늘 화면의 "내 역할 바로가기": 역할마다 자주 하는 일 네 가지. to = 화면으로, say = 비서 창을 열고 그 말을 바로 물음
const QUICK = {
  pm: [{ icon: 'users', label: '누가 바빠?', say: '누가 바빠?' }, { icon: 'trend', label: '진행 상황', say: '프로젝트 진행 상황' }, { icon: 'type', label: '회의 정리 프롬프트', to: 'prompts/find/회의' }, { icon: 'bulb', label: '기획 보드', to: 'plan' }],
  art: [{ icon: 'check2', label: '이번 주 마감', say: '이번 주 마감' }, { icon: 'image', label: '레퍼런스', to: 'archive' }, { icon: 'type', label: '피드백 정리 프롬프트', to: 'prompts/find/피드백' }, { icon: 'film', label: 'SNS 만들기', to: 'studio' }],
  make: [{ icon: 'calendar', label: '오늘 일정', say: '오늘 일정' }, { icon: 'film', label: 'SNS 만들기', to: 'studio' }, { icon: 'bulb', label: '기획 보드', to: 'plan' }, { icon: 'image', label: '레퍼런스', to: 'archive' }],
  biz: [{ icon: 'wallet', label: '이번 달 지출', say: '이번 달 지출' }, { icon: 'trend', label: '받을 돈', say: '받을 돈 얼마야?' }, { icon: 'type', label: '견적 프롬프트', to: 'prompts/find/견적' }, { icon: 'cart', label: '구매 목록', to: 'shop' }],
};
export async function shortcuts(me) {
  me = me || await who(); const out = [], seen = new Set();
  const { isGuest, GUEST_OK } = await import('./app.js'); const g = isGuest();
  for (const k of me.keys) for (const q of (QUICK[k] || [])) { if (seen.has(q.label)) continue; if (g && (q.to ? !GUEST_OK.has(q.to.split('/')[0]) : /지출|받을 돈|누가 바빠/.test(q.say || ''))) continue; seen.add(q.label); out.push(q); }   /* 단기 작업자에게는 못 여는 화면·돈 이야기를 권하지 않음 */
  return out.slice(0, me.keys.length > 1 ? 6 : 4);
}
// 로그인하지 않았거나 멤버에 역할이 안 적혀 있으면 이 기기에서 직접 고름 (여러 개 가능). 고르면 바로가기·메뉴·프롬프트가 그 역할에 맞춰짐
export function rolePicker(me, done, { later = false } = {}) {
  const had = roleKeys(me.role || ''), all = teamRoles(); const picked = new Set(all.filter(r => (r.custom ? String(me.role || '').includes(r.name) : had.includes(r.key) && !all.some(c => c.custom && String(me.role || '').includes(c.name) && c.keys.includes(r.key)))).map(r => r.name));
  const chip = r => { const b = h('button.chip' + (picked.has(r) ? '.on' : ''), { type: 'button', 'aria-pressed': String(picked.has(r)), onclick: () => { picked.has(r) ? picked.delete(r) : picked.add(r); b.classList.toggle('on', picked.has(r)); b.setAttribute('aria-pressed', String(picked.has(r))); } }, r); return b; };
  return h('div.role-row.pick', { 'aria-label': '내 역할 고르기' }, h('span.role-tag', '내 역할은?'), all.map(r => chip(r.name)),
    h('button.chip.go', { type: 'button', onclick: async () => { await db.kvSet('me:role', [...picked].join(', ')); await db.kvSet('me:roleskip', !picked.size); await done(); } }, ic('check', 14), '완료'),
    later ? h('button.chip.ghost', { type: 'button', onclick: async () => { await db.kvSet('me:roleskip', true); await done(); } }, '나중에') : null);
}
// 오늘 화면 맨 위 한 줄: 단기 작업자에게는 맡은 프로젝트와 남은 날, 기간이 끝났거나 멈춘 코드면 그 사실
export async function memberStrip() {
  const m = await db.kvGet('me:member', null); if (!m) return null;
  if (await db.kvGet('me:ended', false)) return h('div.guest-strip.end', ic('clock', 16), h('div.grow', h('b', '이 코드는 지금 쓸 수 없어요'), h('span', '쓸 수 있는 기간이 끝났거나 멈춘 코드예요. 팀 기록은 더 받아 오지 않아요. 관리자에게 물어봐 주세요.')));
  if (m.kind !== 'guest') return null;
  const left = m.until ? Math.round((new Date(m.until + 'T00:00') - new Date(db.dayOf(new Date()) + 'T00:00')) / 864e5) : null;
  const ps = m.projects || [];
  return h('div.guest-strip' + (left != null && left <= 3 ? '.soon' : ''), ic('briefcase', 16), h('div.grow', h('b', ps.length ? ps.join(', ') : '맡은 프로젝트가 아직 없어요'),
    h('span', [ps.length ? '이 프로젝트의 할 일·일정·회의록·레퍼런스를 팀과 같이 봐요. 그 밖에 적는 것은 나만 봐요.' : '관리자가 프로젝트를 맡기면 그 일이 여기 보여요.', m.until ? `${m.until.slice(5).replace('-', '/')}까지${left === 0 ? ' (오늘까지)' : left > 0 ? ` (${left}일 남음)` : ''}` : ''].filter(Boolean).join(' '))));
}
// 오늘 화면: 다른 기기·팀과 맞추지 못하고 있을 때만 보이는 한 줄 (평소에는 없음)
export async function syncStrip() {
  const S = await import('./sync.js'); const tr = S.trouble(); if (!tr) return null;
  const n = (await db.dirtyItems()).filter(x => x.col !== '_kv').length;
  const box = h('div.guest-strip.end.sync-strip', ic('cloud', 16), h('div.grow', h('b', '다른 기기와 맞추지 못하고 있어요'), h('span', tr.replace(/[.\s]*$/, '.') + (n ? ` 아직 못 올린 기록 ${n}개는 이 기기에 그대로 있어요.` : ' 기록은 이 기기에 그대로 있어요.'))),
    h('button.btn.sm', { style: { flex: 'none', alignSelf: 'center' }, onclick: async e => { const b = e.currentTarget; b.disabled = true; b.textContent = '맞추는 중'; const st = await S.syncNow(); if (st.status === 'idle') box.remove(); else { b.disabled = false; b.textContent = '다시 맞추기'; } } }, '다시 맞추기'));
  return box;
}
export async function shortcutRow() {
  const me = await who(); const { go, refresh, buildNav } = await import('./app.js');
  const redo = async () => { await buildNav(); refresh(); };
  if (!me.role) return (await db.kvGet('me:roleskip', false)) ? null : rolePicker(me, redo, { later: true });   /* 역할을 모르면 한 번 물어봄. "나중에"를 누르면 메뉴 → 고르기에서 다시 고를 수 있음 */
  const qs = await shortcuts(me); if (!qs.length) return null;
  const short = me.role.length > 8 ? me.role.split(/[·,\/]/)[0] : me.role;
  const row = h('div.role-row', { 'aria-label': '내 역할 바로가기' },
    me.local ? h('button.role-tag', { type: 'button', 'aria-label': `내 역할 ${me.role} 바꾸기`, onclick: () => row.replaceWith(rolePicker(me, redo)) }, short) : h('span.role-tag', short),
    qs.map(q => h('button.chip', { type: 'button', onclick: () => (q.say ? openSheet('today', q.say) : go(q.to)) }, ic(q.icon, 14), q.label)));
  return row;
}

// 다른 화면에서 프롬프트 스튜디오로 넘기기: 그 화면의 내용을 들고 가서 빈칸에 넣어 줌
export async function toStudio(id, values = {}) {
  try { sessionStorage.setItem('ps:prefill', JSON.stringify(values)); } catch { }
  (await import('./app.js')).go('prompts/use/' + id);
}

// ── 메뉴 줄이기 ──
const CORE = { all: ['plan', 'meetings', 'talk', 'prompts', 'team', 'acts', 'site', 'settings'], pm: ['board', 'people', 'radar'], art: ['archive', 'figma', 'studio'], make: ['studio', 'archive'], biz: ['money', 'shop', 'vendors', 'radar'], none: ['money', 'archive', 'people'] };
// 앞에 둘 메뉴: 역할 기본 + 최근 3주 안에 3번 넘게 연 것, 그리고 직접 고정한 것(끄면 뺌)
export async function pinned(now = Date.now()) {
  const me = await who(); const use = await db.kvGet('nav:use', {}); const pin = await db.kvGet('nav:pin', {});
  const set = new Set(CORE.all); for (const k of (me.keys.length ? me.keys : ['none'])) for (const id of (CORE[k] || [])) set.add(id);
  for (const [id, u] of Object.entries(use)) if (u && u.n >= 3 && now - (u.at || 0) < 21 * 864e5) set.add(id);
  for (const [id, on] of Object.entries(pin)) { if (on) set.add(id); else set.delete(id); }
  return set;
}
export async function setPin(id, on) { const pin = await db.kvGet('nav:pin', {}); pin[id] = !!on; await db.kvSet('nav:pin', pin); }
export async function visit(id) {
  if (!id || ['today', 'assistant', 'inbox', 'calendar', 'menu'].includes(id)) return false;
  const use = await db.kvGet('nav:use', {}); const u = use[id] || { n: 0, at: 0 }; const was = u.n;
  use[id] = { n: Math.min(99, u.n + 1), at: Date.now() }; await db.kvSet('nav:use', use);
  return was < 3 && use[id].n >= 3;   /* 방금 "자주 쓰는 것"이 됐는지 (메뉴를 다시 그리라고) */
}
