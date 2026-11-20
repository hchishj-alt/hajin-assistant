import { h, ic, clear, toast, head, seg, modal, form, rel, todayStr, tile, ring, confirmBox, fmtDate, kindPair } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';

let view = 'today', proj = '';
export default {
  async render(root, params) {
    const body = h('div');
    if (params?.[0] === 'team') view = 'team';
    if (view === 'log') view = 'today';
    const ctx = { people: await store.peopleNames().catch(() => []), projects: await store.projects().catch(() => []) };
    const read = v => brain.interpret('할일: ' + v, ctx)[0];
    const quick = h('input', { placeholder: '할 일 추가: "민서 금요일까지 도록 표지 시안"', 'aria-label': '할 일 추가', enterkeyhint: 'done' });
    const hint = h('div.chips', { style: { padding: '4px 6px 0', minHeight: '20px' } });
    quick.addEventListener('input', () => { clear(hint); const v = quick.value.trim(); if (!v) return; const p = read(v); if (p.data.due) hint.append(h('span.chip.acc', ic('calendar', 12), rel(p.data.due))); if (p.data.time) hint.append(h('span.chip.acc', ic('clock', 12), p.data.time)); if (p.data.who) hint.append(h('span.chip.acc', ic('user', 12), p.data.who)); if (p.data.project) hint.append(h('span.chip.acc', '#' + p.data.project)); if (p.data.priority === 'high') hint.append(h('span.chip.bad', '중요')); });
    const addQuick = async () => {
      const v = quick.value.trim(); if (!v) return;
      quick.value = ''; clear(hint); /* 두 번 눌러도 한 번만 */
      const p = read(v);
      const tags = brain.parseTags(v);
      const tidy = t => String(t || '').replace(/#\S+/g, '').replace(/[!！]?중요/g, '').trim();
      const first = await store.commit('task', { ...p.data, title: tidy(p.data.title) || p.data.title, project: p.data.project || tags[0] || proj || '' });
      // 오늘 탭에서 넣었는데 마감이 뒤면 목록에서 안 보이니, 어디로 갔는지 알려 줌
      const say = (t, lead) => { const far = t.due && t.due > todayStr() && view === 'today'; toast(`${far ? (lead ? lead + ' · 예정 탭' : '예정 탭에 넣었어요') : (lead || '추가했어요')} · ${t.title}${t.who ? ` · 담당 ${t.who}` : ''}${t.due ? ` · 마감 ${fmtDate(t.due)}` : ''}`, { label: '되돌리기', fn: async () => { await db.remove(t.id); draw(); } }); };
      say(first); draw();
      // 바로 넣어 두고, AI가 읽은 뒤 마감·제목이 다르면 조용히 고침. 여러 가지를 한 줄에 썼으면 나눠 줌
      const fix = d => ({ ...d, ...(d.title !== undefined ? { title: tidy(d.title) || first.title } : {}) });
      import('../js/ai.js').then(AI => AI.polishSaved('task', v, p, first, { fix, patch: (id, a) => store.commit('task', { id, ...a }), add: d => store.commit('task', { ...d, project: d.project || first.project || '' }) })).then(async ch => { if (!ch) return; say((await db.get(first.id)) || first, 'AI가 다시 읽고 다듬었어요'); if (location.hash.startsWith('#/tasks')) draw(); }).catch(() => { });
    };
    quick.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addQuick(); } });
    root.append(kindPair('task'), head('할 일', '끝내면 체크해요. 약속은 일정에 있어요.',
      h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '할 일')),
      h('div.quick', { style: { marginBottom: '6px' } }, ic('plus'), quick, h('button.btn.icon.ghost', { type: 'button', 'aria-label': '추가', onclick: addQuick }, ic('send'))), hint, body);
    await draw();

    async function draw() {
      clear(body);
      const every = await db.list('tasks');
      const mine = await store.mineFilter();
      const all = every.filter(mine);
      const hasTeam = every.some(t => t.team || t.who);
      const today = todayStr();
      const open = all.filter(t => !t.done);
      const doneToday = all.filter(t => t.done && db.dayOf(t.doneAt || '') === today).length;
      const overdue = open.filter(t => t.due && t.due < today).length;
      const dueToday = open.filter(t => t.due === today).length;
      body.append(h('div.tiles', { style: { margin: '14px 0' } },
        tile('check2', open.length, '남은 할 일'), tile('flag', dueToday, '오늘 마감', dueToday ? 'warn' : ''), tile('clock', overdue, '밀린 일', overdue ? 'bad' : 'ok'), tile('check', doneToday, '오늘 끝낸 일', 'ok')));
      const projects = [...new Set(all.map(t => t.project).filter(Boolean))];
      body.append(h('div.row.between', { style: { marginBottom: '10px' } },
        seg([['today', '오늘'], ['upcoming', '예정'], ['all', '전체'], ['done', '완료'], ...(hasTeam ? [['team', '담당자별']] : [])], view, v => { view = v; draw(); }),
        projects.length ? h('select.in', { 'aria-label': '프로젝트 고르기', style: { width: 'auto' }, onchange: e => { proj = e.target.value; draw(); } }, h('option', { value: '' }, '모든 프로젝트'), projects.map(p => h('option', { value: p, selected: p === proj }, p))) : null));
      if (view === 'team' && !hasTeam) view = 'today';
      if (view === 'team') return body.append(teamView(every.filter(t => (t.team || t.who) && (!proj || t.project === proj)), draw, edit, await store.nameCanon()));
      let xs = all.filter(t => !proj || t.project === proj);
      if (view === 'today') xs = xs.filter(t => !t.done && (!t.due || t.due <= today));
      if (view === 'upcoming') xs = xs.filter(t => !t.done && t.due && t.due > today);
      if (view === 'all') xs = xs.filter(t => !t.done);
      if (view === 'done') xs = xs.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 100);
      else xs.sort(sortTasks);
      if (view === 'today') {
        const total = xs.length + doneToday;
        body.append(h('div.card.flat', { style: { marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px' } }, ring(total ? doneToday / total : 0, { size: 52, label: `${doneToday}/${total}` }), h('div', h('h3', total && doneToday === total ? '오늘 할 일 끝! 수고했어요' : '오늘의 진행'), h('p.faint.small', overdue ? `밀린 일 ${overdue}개가 포함돼 있어요` : '마감 없는 할 일도 오늘 목록에 보여요'))));
      }
      const card = h('div.card');
      if (!xs.length) card.append(h('div.empty', view === 'done' ? '완료한 일이 아직 없어요' : '할 일이 없어요'));
      // 마감일로 묶기
      let g = null;
      xs.forEach((t, i) => {
        const grp = view === 'upcoming' ? t.due : view === 'done' ? null : (t.due && t.due < today ? '밀림' : null);
        if (grp !== g && grp) { g = grp; card.append(h('div.faint.tiny', { style: { padding: '8px 4px 2px', fontWeight: 650 } }, grp === '밀림' ? '밀린 일' : `${rel(grp)} · ${fmtDate(grp)}`)); }
        const r = taskRow(t, draw, edit); r.classList.add('anim'); r.style.animationDelay = Math.min(i, 12) * 25 + 'ms'; card.append(r);
      });
      body.append(card);
    }
    function edit(t = {}) {
      modal(t.id ? '할 일 고치기' : '새 할 일', close => {
        const f = form(FIELDS.task, t, async v => { const ch = await store.changedSince(t); if (ch && !await confirmBox(`창을 연 사이에 ${ch.cur.by && ch.cur.by !== t.by ? ch.cur.by + ' 님이' : '다른 곳에서'} 이 할 일을 고쳤어요. 내 내용으로 저장할까요?`, '내 내용으로 저장')) return; await store.commit('task', { ...(ch ? ch.cur : t), ...v }); close(); draw(); });
        if (t.id) f.querySelector('.modal-f').prepend(h('button.btn', { type: 'button', onclick: () => { close(); handoff(t); } }, ic('share', 14), '넘기기'));
        if (t.handoffs?.length) f.querySelector('.modal-f').before(h('div.hand-log', h('div.small', { style: { fontWeight: 650 } }, '인수인계 기록'), t.handoffs.map(x => h('div.faint.tiny', `${x.at.slice(5, 10).replace('-', '/')} ${x.from} → ${x.to}${x.note ? ' · ' + x.note : ''}`))));
        if (t.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { await db.remove(t.id); close(); draw(); toast(`지웠어요 · ${t.title}`, { label: '되돌리기', fn: async () => { await db.put('tasks', { ...t, deleted: false }); draw(); } }); } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function handoff(t) {
      const names = [...new Set([...(await store.teammateNames()), ...(await db.list('contacts')).filter(c => c.team || c.tags?.includes('팀')).map(c => c.name)])].filter(n => n && n !== t.who);
      modal('할 일 넘기기', close => { const to = h('input.in', { placeholder: '받을 사람', list: 'hand-names', 'aria-label': '받을 사람' }); const note = h('textarea.in', { rows: 3, placeholder: '어디까지 했는지, 파일은 어디 있는지 한두 줄 (받는 사람이 바로 이어갈 수 있게)' });
        return h('div', h('p.small.muted', `“${t.title}”의 담당을 바꿔요. 담당은 늘 한 사람이고, 넘긴 기록이 남아요.`), h('datalist#hand-names', names.map(n => h('option', { value: n }))), names.length ? h('div.chips', { style: { margin: '8px 0' } }, names.slice(0, 8).map(n => h('button.chip', { type: 'button', onclick: () => (to.value = n) }, n))) : null, h('label.f', '받을 사람', to), h('label.f', '넘기는 메모', note),
          h('div.modal-f', h('button.btn.pri', { onclick: async () => { if (!to.value.trim()) return toast('받을 사람을 적어 주세요'); await store.handoff(t, to.value.trim(), note.value.trim()); close(); draw(); toast(`${to.value.trim()} 님에게 넘겼어요`); } }, '넘기기'))); });
    }
  },
};

// 팀 보기: 담당자별 진행률과 남은 일
function teamView(ts, redraw, edit, canon = w => w) {
  const by = {};
  ts.forEach(t => { const k = (t.who && canon(t.who)) || t.who || '담당 없음'; (by[k] ||= []).push(t); });
  const today = todayStr();
  const g = h('div.grid.g2');
  if (!ts.length) g.append(h('div.card', h('div.empty', '담당이 정해진 할 일이 없어요. “민서 금요일까지 썸네일 시안”처럼 이름을 넣어 적으면 담당자별로 모여요.')));
  Object.entries(by).sort((a, b) => b[1].filter(t => !t.done).length - a[1].filter(t => !t.done).length).forEach(([who, xs]) => {
    const open = xs.filter(t => !t.done).sort(sortTasks), done = xs.length - open.length;
    const late = open.filter(t => t.due && t.due < today).length;
    g.append(h('div.card', h('div.card-h', h('h3', ic('user'), who), h('div.row', late ? h('span.chip.bad', `밀림 ${late}`) : null, ring(xs.length ? done / xs.length : 0, { size: 38, label: `${done}/${xs.length}` }))),
      open.length ? h('div.list', open.slice(0, 8).map(t => taskRow(t, redraw, edit)), open.length > 8 ? h('p.faint.tiny', { style: { padding: '6px 4px 0' } }, `외 ${open.length - 8}개`) : null) : h('p.faint.small', '남은 일 없음')));
  });
  return g;
}
const PRI = { high: 0, normal: 1, low: 2 };
export const sortTasks = (a, b) => (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99');

export function taskRow(t, onChange, onEdit) {
  const cb = h('input', { type: 'checkbox', checked: !!t.done, 'aria-label': '완료' });
  const row = h('div.li' + (t.done ? '.done' : ''), cb,
    h('div.grow', { 'data-kb': '1', 'aria-label': `${t.title} 고치기`, style: { cursor: 'pointer' }, onclick: () => onEdit && onEdit(t) },
      h('div.t', t.priority === 'high' ? h('span', { style: { color: 'var(--bad)', marginRight: '4px' } }, '●') : null, t.title),
      h('div.chips', { style: { marginTop: '2px' } },
        t.due ? h('span.chip' + (t.due < todayStr() && !t.done ? '.bad' : t.due === todayStr() ? '.warn' : ''), ic('calendar', 11), rel(t.due)) : null,
        t.time ? h('span.chip', ic('clock', 11), t.time) : null,
        t.who ? h('span.chip', ic('user', 11), t.handoffs?.length ? `${t.handoffs[t.handoffs.length - 1].from} → ${t.who}` : t.who) : null,
        t.project ? h('span.chip.acc.cut', { title: t.project }, '#' + t.project) : null)));
  cb.addEventListener('change', async () => {
    cb.classList.add('check-anim');
    await db.patch(t.id, { done: cb.checked, doneAt: cb.checked ? db.now() : null });
    row.classList.toggle('done', cb.checked);
    if (cb.checked) toast('완료!', { label: '되돌리기', fn: async () => { await db.patch(t.id, { done: false, doneAt: null }); onChange && onChange(); } });
    setTimeout(() => onChange && onChange(), 450);
  });
  return row;
}
