import { h, ic, clear, toast, todayStr, fmtDate, tile, ring, colorFor, won, countUp } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { taskRow, sortTasks } from './tasks.js';
import { go, updateBadge } from '../js/app.js';

export default {
  async render(root) {
    const now = new Date();
    const today = todayStr();
    const hour = now.getHours();
    const hi = hour < 6 ? '늦은 밤이에요' : hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '오늘도 수고했어요';
    const name = await db.kvGet('name', '하진');

    const [events, allTasks, drafts, reach, bdays, expenses, logs, meetings] = await Promise.all([
      store.eventsOn(today), db.list('tasks'), store.drafts(), store.peopleToReach(), store.upcomingBirthdays(7), db.list('expenses'), db.list('timelogs'), db.list('meetings')]);
    const open = allTasks.filter(t => !t.done);
    const todays = open.filter(t => !t.due || t.due <= today).sort(sortTasks);
    const doneToday = allTasks.filter(t => t.done && (t.doneAt || '').slice(0, 10) === today).length;
    const monthKey = today.slice(0, 7);
    const monthSpend = expenses.filter(e => (e.date || '').startsWith(monthKey)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budget = await db.kvGet('budget', 0);
    const mins = logs.filter(l => l.date === today).reduce((s, l) => s + (l.minutes || 0), 0);
    const overdue = open.filter(t => t.due && t.due < today).length;

    // 빠른 입력
    const qi = h('input', { placeholder: '생각나는 대로 적기 — 일정·할 일·지출 무엇이든', 'aria-label': '빠른 입력' });
    const qp = h('div.chips', { style: { padding: '4px 6px 0', minHeight: '20px' } });
    qi.addEventListener('input', () => { clear(qp); const v = qi.value.trim(); if (!v) return; for (const p of brain.interpret(v).slice(0, 3)) qp.append(h('span.chip.acc', ic(store.KINDS[p.kind]?.icon || 'search', 12), p.kind === 'query' ? '찾아보기' : store.KINDS[p.kind]?.label || '')); });
    qi.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || e.isComposing || !qi.value.trim()) return;
      const v = qi.value.trim();
      const ps = brain.interpret(v, { projects: await store.projects(), people: [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean) });
      if (ps.some(p => p.kind === 'query' || p.kind === 'nav')) { sessionStorage.setItem('assistant:prefill', v); go('assistant'); return; }
      for (const p of ps) await store.draft(p.kind, p.data, { source: p.src || v, confidence: p.confidence, origin: 'quick' });
      qi.value = ''; clear(qp); updateBadge();
      toast(`${ps.map(p => p.label).join(', ')} → 확인 대기함`, { label: '보기', fn: () => go('inbox') });
    });

    const hdr = h('div.page-head', h('div',
      h('p.faint.small', fmtDate(now, { year: true })),
      h('h1', `${hi}, ${name}님`),
      h('p.sub', brain.briefing({ events, tasks: open, drafts: drafts.length, people: reach }))),
      h('div.row', h('a.btn.sm', { href: '#/assistant' }, ic('sparkles', 14), '비서'), h('a.btn.sm', { href: '#/meetings/new' }, ic('mic', 14), '회의 녹음')));

    const tiles = h('div.tiles',
      tile('calendar', events.length, '오늘 일정', '', '#/calendar'),
      tile('check2', todays.length, overdue ? `할 일 · 밀림 ${overdue}` : '오늘 할 일', overdue ? 'bad' : '', '#/tasks'),
      tile('inbox', drafts.length, '확인 대기', drafts.length ? 'warn' : 'ok', '#/inbox'),
      tile('wallet', shortWon(monthSpend), budget ? `이번 달 · 예산 ${Math.round(monthSpend / budget * 100)}%` : '이번 달 지출', budget && monthSpend > budget ? 'bad' : '', '#/money'));

    // 오늘 타임라인 (일정 + 빈 시간)
    const slots = await store.freeSlots(today);
    const nowHM = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const tl = h('div.timeline');
    const rows = [...events.map(e => ({ t: e.start || '00:00', e })), ...slots.map(s => ({ t: s.start, s }))].sort((a, b) => a.t.localeCompare(b.t));
    if (!rows.length) tl.append(h('div.faint.small', '오늘은 일정이 없어요'));
    for (const r of rows) {
      if (r.e) { const past = r.e.end ? r.e.end < nowHM : (r.e.start && r.e.start < nowHM); tl.append(h('div.tl-i', { style: { opacity: past ? .5 : 1 } }, h('div.mono.tiny.faint', r.e.start ? `${r.e.start}${r.e.end ? '–' + r.e.end : ''}` : '종일'), h('div.t.small', h('span.dot', { style: { background: colorFor(r.e.title), display: 'inline-block', marginRight: '6px' } }), r.e.title, r.e.place ? h('span.faint', ' · ' + r.e.place) : null))); }
      else if (r.s.mins >= 30) tl.append(h('div.tl-i', { style: { opacity: .75 } }, h('div.mono.tiny.faint', `${r.s.start}–${r.s.end}`), h('div.small.faint', `빈 시간 ${Math.floor(r.s.mins / 60) ? Math.floor(r.s.mins / 60) + '시간 ' : ''}${r.s.mins % 60 ? (r.s.mins % 60) + '분' : ''}`)));
    }

    const tcard = h('div.card', h('div.card-h', h('h3', ic('check2'), '오늘 할 일'), h('div.row', ring((doneToday + todays.length) ? doneToday / (doneToday + todays.length) : 0, { size: 36, stroke: 4, label: `${doneToday}` }), h('a.btn.sm.ghost', { href: '#/tasks' }, '전체'))));
    if (!todays.length) tcard.append(h('div.empty', '오늘 할 일이 없어요'));
    todays.slice(0, 7).forEach(t => tcard.append(taskRow(t, () => this.render(clear(root)), () => go('tasks'))));

    // 사람
    const pc = h('div.card', h('div.card-h', h('h3', ic('users'), '챙길 사람'), h('a.btn.sm.ghost', { href: '#/people' }, '인맥')));
    if (!reach.length && !bdays.length) pc.append(h('div.empty', '연락 주기를 정해 두면 때 맞춰 알려 드려요'));
    bdays.forEach(c => pc.append(h('div.li', ic('cake'), h('div.grow', h('div.t.small', c.name), h('div.faint.tiny', c.inDays ? `${c.inDays}일 후 생일` : '오늘 생일!')), c.phone ? h('a.btn.sm', { href: 'sms:' + c.phone }, ic('msg', 14)) : null)));
    reach.slice(0, 4).forEach(c => pc.append(h('div.li', h('div.avatar', { style: { background: colorFor(c.name), width: '30px', height: '30px', fontSize: '12px' } }, c.name?.[0] || '?'), h('div.grow', h('div.t.small', c.name), h('div.faint.tiny', `${c.overdue + c.cadence}일째 연락 없음`)), c.phone ? h('a.btn.sm', { href: 'tel:' + c.phone }, ic('phone', 14)) : null)));

    // 최근 회의
    const mc = h('div.card', h('div.card-h', h('h3', ic('mic'), '최근 회의'), h('a.btn.sm.ghost', { href: '#/meetings' }, '전체')));
    const ms = meetings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    if (!ms.length) mc.append(h('div.empty', '회의를 녹음하면 요약이 여기 보여요'));
    ms.forEach(m => mc.append(h('div.li.click', { onclick: () => go('meetings/' + m.id) }, ic(m.summaryConfirmed ? 'check' : 'sparkles', 16), h('div.grow', h('div.t.small', m.title), h('div.faint.tiny', fmtDate(m.date || m.createdAt) + (m.summaryConfirmed ? ' · 요약 확정' : ' · 요약 확인 전'))))));

    const focus = h('div.card', h('div.card-h', h('h3', ic('timer'), '오늘 집중'), h('a.btn.sm.ghost', { href: '#/tasks' }, '타이머')),
      h('div.row', h('div.stat', `${Math.floor(mins / 60)}`, h('span.small.muted', '시간 '), `${mins % 60}`, h('span.small.muted', '분'))),
      h('div.bar', { style: { marginTop: '8px' } }, h('i', { style: { width: Math.min(100, mins / ((await db.kvGet('focusGoal', 240)) || 240) * 100) + '%' } })),
      h('p.faint.tiny', { style: { marginTop: '4px' } }, `목표 ${Math.round((await db.kvGet('focusGoal', 240)) / 60)}시간`));

    const L = await (await import('../js/look.js')).get();
    const blocks = {
      quick: () => h('div.home-full', h('div.quick', ic('zap'), qi, h('a.btn.icon.ghost', { href: '#/assistant', 'aria-label': '말로 입력' }, ic('mic'))), qp),
      tiles: () => h('div.home-full', tiles),
      flow: () => h('div.card', h('div.card-h', h('h3', ic('clock'), '오늘 흐름'), h('a.btn.sm.ghost', { href: '#/calendar' }, '캘린더')), tl),
      tasks: () => tcard, people: () => pc, meetings: () => mc, sns: () => snsCard(), team: () => teamCard(allTasks, name), activity: () => activityCard(),
    };
    const grid = h('div.home-grid');
    for (const id of homeOrder(L)) if (!L.homeOff?.includes(id) && blocks[id]) grid.append(await blocks[id]());
    root.append(hdr, grid);
    if (!grid.children.length) grid.append(h('div.card.home-full', h('div.empty', '메인 화면 카드를 모두 껐어요. 꾸미기 › 메인 화면에서 다시 켤 수 있어요.', h('a.btn.sm', { href: '#/look', style: { marginTop: '10px' } }, '꾸미기 열기'))));
  },
};
export const HOME = { quick: '빠른 입력', tiles: '숫자 요약', team: '팀 할 일 (담당자별)', flow: '오늘 흐름(일정)', tasks: '내 할 일', activity: '팀 최근 활동', meetings: '최근 회의', sns: 'SNS 예정', people: '챙길 사람' };
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
async function teamCard(allTasks, me) {
  const today = todayStr();
  const shared = allTasks.filter(t => t.team && !t.done);
  const c = h('div.card', h('div.card-h', h('h3', ic('users'), '팀 할 일'), h('a.btn.sm.ghost', { href: '#/tasks' }, '전체')));
  if (!shared.length) { c.append(h('div.empty', '팀에 공유된 할 일이 없어요. “민서 금요일까지 썸네일 시안”처럼 적으면 담당자에게 보여요.')); return c; }
  const by = {}; for (const t of shared) (by[t.who || '담당 미정'] = by[t.who || '담당 미정'] || []).push(t);
  for (const [who, ts] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    const late = ts.filter(t => t.due && t.due < today).length, soon = ts.filter(t => t.due && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
    c.append(h('div.li.click', { onclick: () => go('tasks') }, h('div.avatar', { style: { background: colorFor(who), width: '30px', height: '30px', fontSize: '12px' } }, who.slice(-2, -1) || who[0]),
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
  au.forEach(a => c.append(h('div.li', h('div.avatar', { style: { background: colorFor(a.by || '?'), width: '26px', height: '26px', fontSize: '11px' } }, (a.by || '?').slice(0, 1)), h('div.grow', h('div.small', h('b', a.by), ` ${LB[a.refCol] || ''} ${a.action}`), h('div.faint.tiny', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.title)), h('span.faint.tiny', relShort(a.createdAt)))));
  return c;
}
const relShort = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; };
