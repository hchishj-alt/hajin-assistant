import { h, ic, clear, toast, head, seg, modal, form, rel, todayStr, addDays, ymd, tile, ring, confirmBox, fmtDate } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';

let view = 'today', proj = '';
export default {
  async render(root, params) {
    const body = h('div');
    const quick = h('input', { placeholder: '할 일 추가: "금요일까지 도록 표지 시안 #이터니아 !중요"', 'aria-label': '할 일 추가' });
    const hint = h('div.chips', { style: { padding: '4px 6px 0', minHeight: '20px' } });
    quick.addEventListener('input', () => { clear(hint); const v = quick.value.trim(); if (!v) return; const p = brain.interpret('할일: ' + v)[0]; if (p.data.due) hint.append(h('span.chip.acc', ic('calendar', 12), rel(p.data.due))); if (p.data.time) hint.append(h('span.chip.acc', ic('clock', 12), p.data.time)); if (p.data.priority === 'high') hint.append(h('span.chip.bad', '중요')); });
    quick.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || e.isComposing || !quick.value.trim()) return;
      const v = quick.value.trim();
      const p = brain.interpret('할일: ' + v)[0];
      const tags = brain.parseTags(v);
      await store.commit('task', { ...p.data, title: p.data.title.replace(/[!！]?중요/g, '').trim(), project: p.data.project || tags[0] || proj || '', est: 30 });
      quick.value = ''; clear(hint); toast('추가했어요'); draw();
    });
    root.append(head('할 일 · 집중', '직접 적은 할 일은 바로 확정돼요. 비서가 뽑은 건 확인 대기함으로 가요.',
      h('button.btn.sm', { onclick: autoPlan }, ic('sparkles', 14), '오늘 빈 시간에 배치'),
      h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '할 일')),
      h('div.quick', { style: { marginBottom: '6px' } }, ic('plus'), quick), hint, body);
    await draw();

    async function draw() {
      clear(body);
      const all = await db.list('tasks');
      const today = todayStr();
      const open = all.filter(t => !t.done);
      const doneToday = all.filter(t => t.done && (t.doneAt || '').slice(0, 10) === today).length;
      const overdue = open.filter(t => t.due && t.due < today).length;
      const dueToday = open.filter(t => t.due === today).length;
      const logs = await db.list('timelogs');
      const mins = logs.filter(l => l.date === today).reduce((s, l) => s + (l.minutes || 0), 0);
      body.append(h('div.tiles', { style: { margin: '14px 0' } },
        tile('check2', open.length, '남은 할 일'), tile('flag', dueToday, '오늘 마감', dueToday ? 'warn' : ''), tile('clock', overdue, '밀린 일', overdue ? 'bad' : 'ok'), tile('timer', `${Math.floor(mins / 60)}h ${mins % 60}m`, '오늘 작업 시간', 'ok')));
      const projects = [...new Set(all.map(t => t.project).filter(Boolean))];
      body.append(h('div.row.between', { style: { marginBottom: '10px' } },
        seg([['today', '오늘'], ['upcoming', '예정'], ['all', '전체'], ['done', '완료'], ['focus', '집중'], ['log', '시간 기록']], view, v => { view = v; draw(); }),
        projects.length && !['focus', 'log'].includes(view) ? h('select.in', { style: { width: 'auto' }, onchange: e => { proj = e.target.value; draw(); } }, h('option', { value: '' }, '모든 프로젝트'), projects.map(p => h('option', { value: p, selected: p === proj }, p))) : null));
      if (view === 'focus') return body.append(await focusView());
      if (view === 'log') return body.append(await logView(logs));
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
        const f = form(FIELDS.task, t, async v => { await store.commit('task', { ...t, ...v }); close(); draw(); });
        if (t.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('이 할 일을 지울까요?', '지우기')) { await db.remove(t.id); close(); draw(); } } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function autoPlan() {
      const today = todayStr();
      const ts = (await store.openTasks()).filter(t => !t.time && (!t.due || t.due <= addDaysStr(3))).sort(sortTasks);
      let slots = await store.freeSlots(today);
      const planned = [];
      for (const t of ts) {
        const need = t.est || 30;
        const s = slots.find(s => s.mins >= need);
        if (!s) continue;
        planned.push({ t, start: s.start, end: store.addMins(s.start, need) });
        s.start = store.addMins(s.start, need + 10); s.mins -= need + 10;
        slots = slots.filter(x => x.mins >= 15);
      }
      if (!planned.length) { toast('배치할 빈 시간이나 할 일이 없어요'); return; }
      modal('오늘 이렇게 배치할까요?', close => h('div',
        h('p.muted.small', '빈 시간에 중요도와 마감 순으로 넣었어요. 확정하면 캘린더에 집중 블록이 생겨요.'),
        h('div.timeline', { style: { marginTop: '12px' } }, planned.map(p => h('div.tl-i', h('div.small.mono.faint', `${p.start} – ${p.end}`), h('div.t', p.t.title)))),
        h('div.modal-f', h('button.btn', { onclick: close }, '취소'), h('button.btn.pri', { onclick: async () => { for (const p of planned) { await db.put('events', { title: '◆ ' + p.t.title, date: today, start: p.start, end: p.end, taskId: p.t.id, kind: 'focus' }); await db.patch(p.t.id, { time: p.start, due: p.t.due || today }); } close(); toast(`${planned.length}개를 캘린더에 넣었어요`); draw(); } }, '확정'))));
    }
  },
};
const addDaysStr = n => ymd(addDays(new Date(), n));
const PRI = { high: 0, normal: 1, low: 2 };
export const sortTasks = (a, b) => (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99');

export function taskRow(t, onChange, onEdit) {
  const cb = h('input', { type: 'checkbox', checked: !!t.done, 'aria-label': '완료' });
  const row = h('div.li' + (t.done ? '.done' : ''), cb,
    h('div.grow', { style: { cursor: 'pointer' }, onclick: () => onEdit && onEdit(t) },
      h('div.t', t.priority === 'high' ? h('span', { style: { color: 'var(--bad)', marginRight: '4px' } }, '●') : null, t.title),
      h('div.chips', { style: { marginTop: '2px' } },
        t.due ? h('span.chip' + (t.due < todayStr() && !t.done ? '.bad' : t.due === todayStr() ? '.warn' : ''), ic('calendar', 11), rel(t.due)) : null,
        t.time ? h('span.chip', ic('clock', 11), t.time) : null,
        t.who ? h('span.chip', ic('user', 11), t.who) : null,
        t.project ? h('span.chip.acc', '#' + t.project) : null,
        t.est ? h('span.chip', `${t.est}분`) : null)));
  cb.addEventListener('change', async () => {
    cb.classList.add('check-anim');
    await db.patch(t.id, { done: cb.checked, doneAt: cb.checked ? db.now() : null });
    row.classList.toggle('done', cb.checked);
    if (cb.checked) toast('완료!', { label: '되돌리기', fn: async () => { await db.patch(t.id, { done: false, doneAt: null }); onChange && onChange(); } });
    setTimeout(() => onChange && onChange(), 450);
  });
  return row;
}

// 집중 타이머 (뽀모도로) — 끝나면 작업 기록 자동 저장
let focusState = null;
async function focusView() {
  const open = (await store.openTasks()).sort(sortTasks);
  const sel = h('select.in', h('option', { value: '' }, '무엇에 집중할까요? (선택)'), open.map(t => h('option', { value: t.id }, t.title)));
  const mins = h('div.seg');
  let len = 25;
  [15, 25, 50, 90].forEach(m => mins.append(h('button' + (m === len ? '.on' : ''), { type: 'button', onclick: e => { len = m; mins.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target)); if (!focusState) draw(len * 60, len * 60); } }, m + '분')));
  const R = 100, C = 2 * Math.PI * R;
  const ringEl = h('div.focus-ring', { html: `<svg width="220" height="220"><circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--bg2)" stroke-width="10"/><circle id="fr" cx="110" cy="110" r="${R}" fill="none" stroke="var(--acc)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="transition:stroke-dashoffset 1s linear"/></svg>` });
  const tm = h('div.tm', '25:00'); ringEl.append(tm);
  const btn = h('button.btn.pri', { style: { minWidth: '140px' } }, ic('play', 16), '시작');
  const draw = (left, total) => { tm.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; const c = ringEl.querySelector('#fr'); if (c) c.style.strokeDashoffset = C * (1 - left / total); };
  draw(len * 60, len * 60);
  if (focusState) { sel.value = focusState.taskId || ''; btn.innerHTML = ''; btn.append(ic('stop', 16), '그만'); }
  btn.onclick = async () => {
    if (focusState) { const spent = Math.round((Date.now() - focusState.t0) / 60000); clearInterval(focusState.iv); await saveLog(focusState, spent); focusState = null; btn.innerHTML = ''; btn.append(ic('play', 16), '시작'); draw(len * 60, len * 60); return; }
    const task = open.find(t => t.id === sel.value);
    focusState = { t0: Date.now(), total: len * 60, taskId: sel.value, title: task?.title || '집중', project: task?.project || '' };
    btn.innerHTML = ''; btn.append(ic('stop', 16), '그만');
    try { Notification?.permission === 'default' && Notification.requestPermission(); } catch { }
    focusState.iv = setInterval(async () => {
      if (!document.body.contains(tm)) return;
      const left = Math.max(0, focusState.total - Math.round((Date.now() - focusState.t0) / 1000));
      draw(left, focusState.total);
      if (left === 0) { clearInterval(focusState.iv); await saveLog(focusState, Math.round(focusState.total / 60)); focusState = null; btn.innerHTML = ''; btn.append(ic('play', 16), '다시'); try { navigator.vibrate?.([200, 100, 200]); new Notification('집중 끝! 5분 쉬어요'); } catch { } }
    }, 1000);
  };
  async function saveLog(s, m) { if (m < 1) return; await db.put('timelogs', { title: s.title, minutes: m, date: todayStr(), project: s.project, taskId: s.taskId }); toast(`${m}분 작업으로 기록했어요`); }
  return h('div.card', { style: { textAlign: 'center' } }, h('div.stack', { style: { alignItems: 'center', gap: '16px', padding: '10px 0' } }, sel, mins, ringEl, btn, h('p.faint.small', '끝나면 작업 시간이 자동으로 기록돼요')));
}
async function logView(logs) {
  const days = [...Array(7)].map((_, i) => ymd(addDays(new Date(), i - 6)));
  const byDay = days.map(d => logs.filter(l => l.date === d).reduce((s, l) => s + (l.minutes || 0), 0));
  const max = Math.max(60, ...byDay);
  const byP = {}; logs.filter(l => l.date >= days[0]).forEach(l => (byP[l.project || l.title] = (byP[l.project || l.title] || 0) + l.minutes));
  const tot = byDay.reduce((a, b) => a + b, 0);
  const add = h('button.btn.sm', { onclick: () => modal('작업 기록 추가', close => form(FIELDS.timelog, { date: todayStr(), minutes: 60 }, async v => { await db.put('timelogs', v); close(); location.reload(); })) }, ic('plus', 14), '기록 추가');
  return h('div.grid.g2',
    h('div.card', h('div.card-h', h('h3', ic('trend'), '최근 7일'), h('span.mono.muted', `${Math.floor(tot / 60)}시간 ${tot % 60}분`)),
      h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px' } }, byDay.map((m, i) => h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' } },
        h('span.tiny.faint.mono', m ? Math.round(m / 6) / 10 + 'h' : ''),
        h('div', { style: { width: '100%', maxWidth: '28px', height: Math.max(3, m / max * 100) + '%', background: 'var(--acc)', borderRadius: '6px', transition: 'height .6s var(--spring)' } }),
        h('span.tiny.faint', fmtDate(days[i]).split('(')[1]?.replace(')', '') || ''))))),
    h('div.card', h('div.card-h', h('h3', ic('grid'), '프로젝트별'), add),
      Object.keys(byP).length ? h('div.stack', Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([p, m]) => h('div', h('div.row.between.small', h('span', p), h('span.mono.muted', `${Math.floor(m / 60)}h ${m % 60}m`)), h('div.bar', h('i', { style: { width: (m / tot * 100) + '%' } }))))) : h('div.empty', '집중 타이머를 쓰거나 "피그마 정리 2시간 작업"처럼 말하면 쌓여요')));
}
