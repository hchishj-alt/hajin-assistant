import { h, ic, clear, toast, todayStr, fmtDate, tile, ring, colorFor, facePic, won, countUp, KIND_RULE, busy } from '../js/ui.js';
import * as SC from '../js/scope.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { taskRow, sortTasks } from './tasks.js';
import { go, updateBadge, isGuest } from '../js/app.js';
import { draftCard } from '../js/draftcard.js';
import * as F from '../js/follow.js';
import * as Install from '../js/install.js';

export default {
  async render(root) {
    const now = new Date();
    const today = todayStr();
    const weekEnd = db.dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - (now.getDay() || 7))));   /* 이번 주 일요일 */
    const hour = now.getHours();
    const hi = hour < 6 ? '늦은 밤이에요' : hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '오늘도 수고했어요';
    const askName = await db.kvGet('askName', false);
    const name = (await db.kvGet('name', '')) || (askName ? '' : '하진');

    const [events, allTasks, drafts, reach, bdays, expenses, meetings] = await Promise.all([
      store.eventsOn(today), db.list('tasks'), store.drafts(), store.peopleToReach(), store.upcomingBirthdays(7), db.list('expenses'), db.list('meetings')]);
    // "오늘 할 일"과 숫자는 내 것만(할 일 화면과 같은 기준). 남이 맡은 팀 할 일은 "팀 할 일" 카드에
    const mineT = await store.mineFilter();
    const open = allTasks.filter(t => !t.done && mineT(t));
    const todays = open.filter(t => !t.due || t.due <= today).sort(sortTasks);
    const doneToday = allTasks.filter(t => t.done && mineT(t) && db.dayOf(t.doneAt || '') === today).length;
    const monthKey = today.slice(0, 7);
    const monthSpend = expenses.filter(e => (e.date || '').startsWith(monthKey)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budget = await db.kvGet('budget', 0);
    const overdue = open.filter(t => t.due && t.due < today).length;

    // 빠른 입력
    const qi = h('input', { placeholder: '생각나는 대로 적어 주세요', 'aria-label': '빠른 입력', enterkeyhint: 'send' });
    const qp = h('div.chips', { style: { padding: '4px 6px 0', minHeight: '20px' } });
    const qres = h('div.stack', { style: { marginTop: '6px' } });
    qi.addEventListener('input', () => { clear(qp); const v = qi.value.trim(); if (!v) return; for (const p of brain.interpretCapture(v).slice(0, 3)) qp.append(h('span.chip.acc', ic(store.KINDS[p.kind]?.icon || 'search', 12), p.kind === 'query' ? '찾아보기' : store.KINDS[p.kind]?.label || '')); });
    const addQuick = async () => {
      const v = qi.value.trim(); if (!v) return;
      qi.value = ''; clear(qp); /* 두 번 눌러도 한 번만 */
      const projects = await store.projects(), people = await store.peopleNames();
      let ps = brain.interpretCapture(v, { projects, people });
      if (ps.some(p => p.kind === 'query' || p.kind === 'nav')) { sessionStorage.setItem('assistant:prefill', v); go('assistant'); return; }
      { const AI = await import('../js/ai.js'); if (await AI.enabled()) { toast('AI가 읽고 있어요'); const d = new Date(); const got = await AI.refine(v, ps, { today: new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), people, projects, vendors: (await db.list('vendors')).map(x => x.name) }); if (got && got.length) ps = got; } }
      /* 적은 자리에서 바로 확인: 카드가 여기 뜨고, 그냥 두면 확인 대기함에 남음 */
      clear(qres); qres.dataset.live = '1';
      const ids = [];
      for (const p of ps) { const d = await store.draft(p.kind, p.data, { source: p.src || v, confidence: p.confidence, origin: 'quick' }); ids.push(d.id); qres.append(draftCard(d, () => updateBadge())); }
      qres.append(h('div.row.between', h('span.faint.tiny', '확정을 누르면 기록돼요. 그냥 두면 확인 대기함에 남아요.'), h('button.btn.sm.ghost', { type: 'button', onclick: () => { delete qres.dataset.live; this.render(clear(root)); } }, '닫기')));
      await F.remember(ids); updateBadge();
    };
    qi.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addQuick(); } });

    const hdr = h('div.page-head', h('div',
      h('p.faint.small', fmtDate(now, { year: true })),
      h('h1', name ? `${hi}, ${name}님` : hi),
      h('p.sub', brain.briefing({ events, tasks: open, drafts: drafts.length, people: reach }))),
      h('div.row', h('a.btn.sm.only-wide', { href: '#/assistant' }, ic('sparkles', 14), '비서'), h('a.btn.sm', { href: '#/meetings/new' }, ic('mic', 14), '회의 녹음'), h('button.btn.sm', { type: 'button', 'aria-label': '알림 설정', onclick: async () => (await import('../js/alarmui.js')).open() }, ic('bell', 14), '알림')));

    const tiles = h('div.tiles',
      tile('calendar', events.length, '오늘 일정', '', '#/calendar'),
      tile('check2', todays.length, overdue ? `할 일 · 밀림 ${overdue}` : '오늘 할 일', overdue ? 'bad' : '', '#/tasks'),
      tile('inbox', drafts.length, '확인 대기', drafts.length ? 'warn' : 'ok', '#/inbox'),
      isGuest() ? tile('clock', open.filter(t => t.due && t.due >= today && t.due <= weekEnd).length, '이번 주 마감', '', '#/tasks') : tile('wallet', shortWon(monthSpend), budget ? `이번 달 · 예산 ${Math.round(monthSpend / budget * 100)}%` : '이번 달 지출', budget && monthSpend > budget ? 'bad' : '', '#/money'));

    // 오늘 타임라인 (일정 + 빈 시간)
    const slots = await store.freeSlots(today);
    const nowHM = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const tl = h('div.timeline');
    const rows = [...events.map(e => ({ t: e.start || '00:00', e })), ...slots.map(s => ({ t: s.start, s }))].sort((a, b) => a.t.localeCompare(b.t));
    if (!rows.length) tl.append(h('div.faint.small', '오늘은 일정이 없어요'));
    for (const r of rows) {
      if (r.e) { const past = r.e.end ? r.e.end < nowHM : (r.e.start && r.e.start < nowHM); tl.append(h('div.tl-i', { style: { opacity: past ? .72 : 1 } }, h('div.mono.tiny.faint', r.e.start ? `${r.e.start}${r.e.end ? '–' + r.e.end : ''}` : '종일'), h('div.t.small', h('span.dot', { style: { background: colorFor(r.e.title), display: 'inline-block', marginRight: '6px' } }), r.e.title, r.e.place ? h('span.faint', ' · ' + r.e.place) : null, r.e.who ? h('span.faint', ' · ' + r.e.who) : null, ' ', h('span.chip.tiny' + (SC.of(r.e) === 'personal' ? '' : '.acc'), SC.LABEL[SC.of(r.e)])))); }
      else if (r.s.mins >= 30) tl.append(h('div.tl-i', { style: { opacity: .75 } }, h('div.mono.tiny.faint', `${r.s.start}–${r.s.end}`), h('div.small.faint', `빈 시간 ${Math.floor(r.s.mins / 60) ? Math.floor(r.s.mins / 60) + '시간 ' : ''}${r.s.mins % 60 ? (r.s.mins % 60) + '분' : ''}`)));
    }

    const tcard = h('div.card', h('div.card-h', h('h3', ic('check2'), '오늘 할 일', h('small', KIND_RULE.task)), h('div.row', ring((doneToday + todays.length) ? doneToday / (doneToday + todays.length) : 0, { size: 36, stroke: 4, label: `${doneToday}` }), h('a.btn.sm.ghost', { href: '#/tasks' }, '전체'))));
    if (!todays.length) tcard.append(h('div.empty', '오늘 할 일이 없어요'));
    todays.slice(0, 7).forEach(t => tcard.append(taskRow(t, () => this.render(clear(root)), () => go('tasks'))));

    // 사람
    const pc = h('div.card', h('div.card-h', h('h3', ic('users'), '챙길 사람'), h('a.btn.sm.ghost', { href: '#/people' }, '인맥')));
    if (!reach.length && !bdays.length) pc.append(h('div.empty', '연락 주기를 정해 두면 때 맞춰 알려 드려요'));
    bdays.forEach(c => pc.append(h('div.li', ic('cake'), h('div.grow', h('div.t.small', c.name), h('div.faint.tiny', c.inDays ? `${c.inDays}일 후 생일` : '오늘 생일!')), c.phone ? h('a.btn.sm', { href: 'sms:' + c.phone, 'aria-label': `${c.name}에게 문자` }, ic('msg', 14)) : null)));
    reach.slice(0, 4).forEach(c => pc.append(h('div.li', h('div.avatar', { style: { background: colorFor(c.name), width: '30px', height: '30px', fontSize: '12px' } }, c.name?.[0] || '?'), h('div.grow', h('div.t.small', c.name), h('div.faint.tiny', `${c.overdue + c.cadence}일째 연락 없음`)), c.phone ? h('a.btn.sm', { href: 'tel:' + c.phone, 'aria-label': `${c.name}에게 전화` }, ic('phone', 14)) : null)));

    // 최근 회의
    const mc = h('div.card', h('div.card-h', h('h3', ic('mic'), '최근 회의'), h('a.btn.sm.ghost', { href: '#/meetings' }, '전체')));
    const ms = meetings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    if (!ms.length) mc.append(h('div.empty', '회의를 녹음하면 요약이 여기 보여요'));
    ms.forEach(m => mc.append(h('div.li.click', { onclick: () => go('meetings/' + m.id) }, ic(m.summaryConfirmed ? 'check' : 'sparkles', 16), h('div.grow', h('div.t.small', m.title), h('div.faint.tiny', fmtDate(m.date || m.createdAt) + (m.summaryConfirmed ? ' · 요약 확정' : ' · 요약 확인 전'))))));

    const L = await (await import('../js/look.js')).get();
    const blocks = {
      quick: () => h('div.home-full', h('div.quick', ic('zap'), qi, h('button.btn.icon.ghost', { type: 'button', 'aria-label': '적기', onclick: addQuick }, ic('send')), h('a.btn.icon.ghost', { href: '#/assistant', 'aria-label': '말로 입력' }, ic('mic'))), qp, qres),
      tiles: () => h('div.home-full', tiles),
      flow: () => h('div.card', h('div.card-h', h('h3', ic('calendar'), '오늘 일정', h('small', KIND_RULE.event)), h('a.btn.sm.ghost', { href: '#/calendar' }, '캘린더')), tl),
      tasks: () => tcard, people: () => isGuest() ? null : pc, meetings: () => mc, sns: () => snsCard(), team: () => teamCard(allTasks, name), projects: () => projectCard(), activity: () => isGuest() ? null : activityCard(),   /* 단기 작업자는 인맥 화면과 팀 활동 기록을 못 보니 빈 카드를 안 둠 */
    };
    const grid = h('div.home-grid');
    for (const id of homeOrder(L)) if (!L.homeOff?.includes(id) && blocks[id]) { const el = await blocks[id](); if (el) grid.append(el); }
    root.append(hdr);
    { const H = await import('../js/helper.js'); const strip = await H.memberStrip().catch(() => null); if (strip) root.append(strip); const ss = await H.syncStrip().catch(() => null); if (ss) root.append(ss); const row = askName && !name ? null : await H.shortcutRow().catch(() => null); if (row) root.append(row); }   /* 처음 온 사람에게는 이름·코드부터 묻고, 역할은 그다음에 */   /* 단기 작업자 안내, 내 역할 바로가기 */
    { const nd = await Install.nudge().catch(() => null); if (nd) root.append(nd); }
    if (askName && !name) {
      /* 처음 켠 사람: 팀에서 받은 코드가 있으면 여기서 바로 들어감(이름·역할·맡은 일이 따라옴). 없으면 이름만 */
      const sync = await import('../js/sync.js'); const cfg = await sync.config().catch(() => ({})); const canCode = !!(cfg && cfg.url && cfg.key) && !sync.user();
      const ni = h('input.in', { placeholder: '이름 (예: 민서)', 'aria-label': '내 이름', style: { maxWidth: '200px', flex: '1 1 120px', minWidth: 0 } });
      const saveName = async () => { const v = ni.value.trim(); if (!v) return toast('이름을 적어 주세요'); await db.kvSet('name', v); await db.kvSet('askName', false); this.render(clear(root)); };
      ni.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) saveName(); });
      const nameRow = h('div.row', ni, h('button.btn' + (canCode ? '' : '.pri'), { type: 'button', onclick: saveName }, canCode ? '이름 저장' : '저장'));
      if (!canCode) root.append(h('div.card.first-card', { style: { marginBottom: '14px' } }, h('h3', '처음 오셨네요. 뭐라고 부를까요?'), h('p.faint.small', { style: { margin: '4px 0 10px' } }, '팀에서 받은 멤버 코드가 있으면 ', h('a', { href: '#/settings' }, '설정'), '에서 로그인해 주세요. 이름과 팀 할 일이 자동으로 맞춰져요.'), nameRow));
      else {
        const ci = h('input.in', { placeholder: '코드', 'aria-label': '멤버 코드', maxlength: 5, autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, style: { textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 700, maxWidth: '150px', flex: '1 1 100px', minWidth: 0 } });
        const msg = h('p.small', { role: 'status', style: { margin: '8px 0 0', color: 'var(--bad)', display: 'none' } });
        const login = async btn => { if (!ci.value.trim()) { ci.focus(); return toast('받은 코드를 적어 주세요'); } busy(btn, true, '들어가는 중'); msg.style.display = 'none';
          try { await sync.loginWithCode(ci.value); await db.kvSet('askName', false); location.reload(); }   /* 메뉴·역할·맡은 프로젝트를 처음부터 다시 맞추려고 새로 엶 */
          catch (e) { busy(btn, false); msg.textContent = /Failed to fetch|NetworkError|network/i.test(e.message) ? '인터넷 연결을 확인하고 다시 눌러 주세요.' : e.message; msg.style.display = ''; } };
        const lb = h('button.btn.pri', { type: 'button', style: { flex: 'none' }, onclick: e => login(e.currentTarget) }, '코드로 들어가기');
        ci.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) login(lb); });
        root.append(h('div.card.first-card', { style: { marginBottom: '14px' } }, h('h3', '처음 오셨네요'),
          h('p.faint.small', { style: { margin: '4px 0 10px' } }, '팀에서 받은 코드가 있으면 적어 주세요. 이름과 역할, 맡은 일이 알아서 맞춰져요.'), h('div.row', ci, lb), msg,
          h('p.faint.small', { style: { margin: '14px 0 8px', paddingTop: '12px', borderTop: '1px solid var(--line)' } }, '코드가 없으면 이름만 알려 주세요. 이 기기에서 혼자 쓸 수 있어요.'), nameRow));
      }
    }
    root.append(grid);
    if (!grid.children.length) grid.append(h('div.card.home-full', h('div.empty', '메인 화면 카드를 모두 껐어요. 꾸미기 › 메인 화면에서 다시 켤 수 있어요.', h('a.btn.sm', { href: '#/look', style: { marginTop: '10px' } }, '꾸미기 열기'))));
  },
};
export const HOME = { quick: '빠른 입력', tiles: '숫자 요약', team: '팀 할 일 (담당자별)', projects: '프로젝트 (진행·마감·받을 돈)', flow: '오늘 일정', tasks: '내 할 일', activity: '팀 최근 활동', meetings: '최근 회의', sns: 'SNS 예정', people: '챙길 사람' };
export const homeOrder = L => [...(L.home || []).filter(k => HOME[k]), ...Object.keys(HOME).filter(k => !(L.home || []).includes(k))];
const shortWon = n => n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString() + '만' : n.toLocaleString();
async function snsCard() {
  const xs = (await db.list('sns')).filter(s => s.status !== '게시').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const c = h('div.card', h('div.card-h', h('h3', ic('film'), 'SNS 예정'), h('a.btn.sm.ghost', { href: '#/studio' }, '스튜디오')));
  if (!xs.length) c.append(h('div.empty', '"릴스로 전시 비하인드 올리기"처럼 말하면 쌓여요'));
  const st = ['아이디어', '촬영', '편집', '예약', '게시'];
  xs.slice(0, 4).forEach(s => c.append(h('div.li', ic('film', 16), h('div.grow', h('div.t.small', s.title), h('div.faint.tiny', `${s.platform} · ${s.status}${s.date ? ' · ' + s.date.slice(5) : ''}`)), h('div.row', { style: { gap: '2px' } }, st.map((x, i) => h('i', { style: { width: '6px', height: '6px', borderRadius: '50%', background: i <= st.indexOf(s.status) ? 'var(--acc)' : 'var(--line2)', display: 'inline-block' } }))))));
  return c;
}

// 팀 할 일: 담당자별로 남은 일·밀린 일 (팀 앱의 첫 화면)
// 프로젝트가 둘 이상 굴러갈 때만 보임: 진행, 다음 마감, 받을 돈
async function projectCard() {
  const ps = (await store.projectStats()).filter(p => (p.status || '진행') !== '완료' && (p.left || p.nextEv || p.due)); if (ps.length < 2) return null;
  const md2 = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '';
  const c = h('div.card', h('div.card-h', h('h3', ic('folder'), '프로젝트'), h('a.btn.sm.ghost', { href: '#/plan/projects' }, '전체')));
  for (const p of ps.sort((a, b) => (b.late - a.late) || ((a.next?.due || a.nextEv?.date || '9').localeCompare(b.next?.due || b.nextEv?.date || '9'))).slice(0, 6)) {
    const sub = p.next ? `다음 마감 ${md2(p.next.due)} · ${p.next.title}${p.next.who ? ' (' + p.next.who + ')' : ''}` : p.nextEv ? `다음 일정 ${md2(p.nextEv.date)} · ${p.nextEv.title}` : '마감이 정해진 일이 없어요';
    c.append(h('div.li.click', { onclick: () => go('plan/projects') }, h('span.dot', { style: { background: p.color || colorFor(p.name), width: '10px', height: '10px', flex: 'none' } }),
      h('div.grow', { style: { minWidth: 0 } }, h('div.t.small', p.name), h('div.faint.tiny', sub + (p.due ? ` · 받을 돈 ${shortWon(p.due)}` : ''))),
      p.late ? h('span.chip.bad', `밀림 ${p.late}`) : null, h('span.chip', { title: '끝낸 일 / 전체 할 일' }, `${p.done}/${p.all}`)));
  }
  return c;
}
async function teamCard(allTasks, me) {
  const today = todayStr();
  const mine = w => !w || w === '나' || (me && store.sameName(w, me));
  const shared = allTasks.filter(t => !t.done && (t.team || (t.who && !mine(t.who))));
  const c = h('div.card', h('div.card-h', h('h3', ic('users'), '팀 할 일'), h('a.btn.sm.ghost', { href: '#/tasks/team' }, '담당자별')));
  if (!shared.length) { c.append(h('div.empty', '담당이 정해진 할 일이 없어요. “민서 금요일까지 썸네일 시안”처럼 적으면 담당자별로 모여요.')); return c; }
  const canon = await store.nameCanon();
  const by = {}; for (const t of shared) { const k = t.who ? (mine(t.who) ? (canon(me) || me || '나') : canon(t.who) || t.who) : '담당 미정'; (by[k] = by[k] || []).push(t); }
  for (const [who, ts] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    const late = ts.filter(t => t.due && t.due < today).length, soon = ts.filter(t => t.due && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
    c.append(h('div.li.click', { onclick: () => go('tasks/team') }, facePic(who, h('div.avatar', { style: { background: colorFor(who), width: '30px', height: '30px', fontSize: '12px' } }, who === '담당 미정' ? '?' : who.slice(-2, -1) || who[0])),
      h('div.grow', h('div.t.small', who), h('div.faint.tiny', soon ? `다음 마감 ${fmtDate(soon.due)} · ${soon.title}` : ts[0].title)),
      late ? h('span.chip.bad', `밀림 ${late}`) : null, h('span.chip', `${ts.length}개`)));
  }
  return c;
}
async function activityCard() {
  const au = (await db.list('audit')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
  const c = h('div.card', h('div.card-h', h('h3', ic('clock'), '팀 최근 활동')));
  if (!au.length) c.append(h('div.empty', '팀원이 공유 항목을 만들거나 고치면 여기 보여요'));
  const LB = { tasks: '할 일', events: '일정', meetings: '회의록', refs: '레퍼런스', buys: '구매 목록', expenses: '비용', bnodes: '마인드맵', boards: '마인드맵 회의', figmafiles: '피그마', contacts: '연락처', grants: '지원사업' };
  au.forEach(a => c.append(h('div.li', facePic(a.by, h('div.avatar', { style: { background: colorFor(a.by || '?'), width: '26px', height: '26px', fontSize: '11px' } }, (a.by || '?').slice(0, 1))), h('div.grow', h('div.small', h('b', a.by), ` ${LB[a.refCol] || ''} ${a.action}`), h('div.faint.tiny', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.title)), h('span.faint.tiny', relShort(a.createdAt)))));
  return c;
}
const relShort = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; };
