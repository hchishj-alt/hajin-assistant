// 어느 화면에서든 비서 부르기 + 메뉴 줄이기.
//  · 비서 창: 지금 보는 화면 위에 비서를 띄움. 그 화면과 내 역할에 맞는 말을 먼저 권하고, AI에게도 어느 화면인지 알려 줌
//  · 메뉴: 내 역할에서 주로 쓰는 것 + 실제로 자주 연 것만 앞에 두고, 나머지는 "더보기"로 접음 (없애지 않음. 직접 고정·해제 가능)
import { h, ic, modal } from './ui.js';
import * as db from './db.js';
import { roleKeys } from './prompts.js';

// 화면마다: say = 그 화면에서 바로 통하는 말(앱 규칙만으로도 답함), about = AI에게 알려 줄 화면 설명
export const SCREENS = {
  today: { say: ['뭐부터 할까?', '오늘 빈 시간', '밀린 할 일', '내일 일정'], about: '오늘 일정·할 일·대기함을 한눈에 보는 첫 화면' },
  calendar: { say: ['이번 주 일정', '이번 주 빈 시간', '다음 주 일정', '내일 오후 3시 팀 회의'], about: '일정을 달력으로 보고 넣는 화면' },
  tasks: { say: ['뭐부터 할까?', '밀린 할 일', '이번 주 마감', '금요일까지 견적서 보내기'], about: '할 일을 오늘·예정·전체·완료·담당자별로 보는 화면' },
  inbox: { say: ['오늘 할 일', '오늘 일정', '뭐부터 할까?'], about: '비서가 읽어 만든 임시 항목을 확정하거나 버리는 화면' },
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
  startup: { say: ['프로젝트 진행 상황', '이번 주 마감'], about: '사업 계획과 지표를 정리하는 화면' },
  _: { say: ['뭐부터 할까?', '오늘 일정', '밀린 할 일'], about: '' },
};
const BY_ROLE = { pm: ['누가 바빠?', '프로젝트 진행 상황'], art: ['오늘 마감', '이번 주 마감'], biz: ['이번 달 지출', '받을 돈 얼마야?'] };

export async function who() {
  const m = await db.kvGet('me:member', null); const role = (m && m.role) || '';
  return { name: (m && m.name) || await db.kvGet('name', '') || '', role, keys: roleKeys(role) };
}
// 그 화면에서 권할 말: 화면 것 먼저, 그다음 내 역할 것, 팀원 이름이 있으면 "○○ 할 일"도. 겹치는 건 빼고 6개까지
export async function suggestFor(id, me) {
  me = me || await who(); const sc = SCREENS[id] || SCREENS._; const out = [...sc.say];
  for (const k of me.keys) for (const s of (BY_ROLE[k] || [])) out.push(s);
  if (['team', 'talk', 'tasks', 'plan'].includes(id)) { const roster = await db.kvGet('sync:roster', []); const other = roster.map(r => r.name).filter(n => n && n !== me.name)[0]; if (other) out.splice(2, 0, `${other.length > 2 ? other.slice(1) : other} 할 일`); }
  return [...new Set(out)].slice(0, 6);
}

let opened = false;
export async function openSheet(id) {
  if (opened || document.querySelector('.modal-bg')) return; opened = true;
  const { MODULES, go, refresh } = await import('./app.js'); const m = MODULES.find(x => x.id === id) || {}; const sc = SCREENS[id] || SCREENS._;
  const me = await who(); const suggest = await suggestFor(id, me);
  const box = h('div.aisheet'); let cleanup = null, changed = false, shut = false;
  const off = db.onChange(col => { if (col !== 'chat') changed = true; });
  const close = modal('비서', c => h('div',
    h('div.aisheet-top', h('span.chip', ic(m.icon || 'sparkles', 13), `지금 화면: ${m.short || m.title || '앱'}`),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => { c(); go('assistant'); } }, ic('right', 14), '크게 보기')),
    box), { wide: true, nofocus: true, onClose: () => { shut = true; opened = false; try { off && off(); } catch { } try { cleanup && cleanup(); } catch { }
      if (changed && location.hash.replace(/^#\//, '').split('/')[0] === id && !document.querySelector('.modal-bg')) refresh(); } });   /* 비서가 뭔가 넣었으면 뒤 화면을 새로 그림 */
  box.closest('.modal')?.classList.add('ai-modal');
  try { const mod = (await import('../modules/assistant.js')).default; const c2 = await mod.render(box, [], { sheet: { suggest, screen: `${m.title || ''}${sc.about ? ' (' + sc.about + ')' : ''}`, role: me.role } }); if (shut) { try { c2 && c2(); } catch { } } else cleanup = c2; }
  catch (e) { box.append(h('p.small.muted', '비서를 열지 못했어요. 아래 "비서" 화면에서 다시 해 주세요.')); console.error(e); }
  return close;
}

// 화면 아래 가운데 "비서" 탭(폰)과 오른쪽 아래 단추(넓은 화면): 비서 화면이 아닌 곳에서 누르면 그 화면 위에 띄움
export function start() {
  const cur = () => (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'today';
  document.getElementById('tabbar')?.addEventListener('click', e => { const a = e.target.closest('a[data-nav="assistant"]'); if (!a || cur() === 'assistant' || e.metaKey || e.ctrlKey) return; e.preventDefault(); openSheet(cur()); });
  const fab = h('button#ai-fab', { type: 'button', 'aria-label': '비서 부르기', title: '이 화면에서 비서 부르기', onclick: () => openSheet(cur()) }, ic('sparkles', 22), h('span', '비서'));
  document.body.append(fab);
  const sync = () => fab.classList.toggle('hide', cur() === 'assistant');
  window.addEventListener('hashchange', sync); sync();
}

// ── 메뉴 줄이기 ──
const CORE = { all: ['plan', 'meetings', 'talk', 'prompts', 'team', 'settings'], pm: ['board', 'people'], art: ['archive', 'studio', 'figma'], biz: ['money', 'shop', 'vendors', 'radar'], none: ['money', 'archive', 'people'] };
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
