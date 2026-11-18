import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, addDays, ymd, colorFor, confirmBox, tile, wd } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import { go } from '../js/app.js';
import { avatar } from './people.js';

export default {
  async render(root, params) {
    if (params[0] === 'poll' && params[1]) return poll(root, params[1]);
    const teams = await db.list('teams');
    const polls = await db.list('polls');
    const evs = (await db.list('events')).filter(e => e.team);
    root.append(head('팀 · 일정 조율', '팀별 멤버·일정·할 일, 그리고 모두 되는 시간 찾기.',
      h('button.btn.sm', { onclick: () => newPoll() }, ic('grid', 14), '시간 조율'),
      h('button.btn.sm.pri', { onclick: () => editTeam() }, ic('plus', 14), '팀')),
      h('div.card.flat', { style: { marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center' } }, ic('cloud', 18), h('p.small.muted', '지금은 이 기기에만 저장돼요. 나중에 동기화를 켜면 팀원이 링크로 들어와 직접 가능 시간을 칠할 수 있게 돼요.')),
      h('div.tiles', { style: { marginBottom: '14px' } }, tile('grid', teams.length, '팀'), tile('users', new Set(teams.flatMap(t => t.members || [])).size, '팀원'), tile('calendar', evs.filter(e => e.date >= todayStr()).length, '예정된 팀 일정'), tile('clock', polls.filter(p => !p.decided).length, '조율 중', polls.some(p => !p.decided) ? 'warn' : '')));
    if (polls.filter(p => !p.decided).length) root.append(h('div.card', { style: { marginBottom: '14px' } }, h('div.card-h', h('h3', ic('clock'), '조율 중인 시간')), polls.filter(p => !p.decided).map(p => h('div.li.click', { onclick: () => go('team/poll/' + p.id) }, ic('grid', 16), h('div.grow', h('div.t.small', p.title), h('div.faint.tiny', `${p.dates.length}일 · ${p.from}–${p.to} · 응답 ${Object.keys(p.avail || {}).length}/${p.members.length}`))))));
    const g = h('div.grid.g2');
    if (!teams.length) g.append(h('div.card', h('div.empty', '팀을 만들고 인맥에서 멤버를 골라 보세요')));
    const contacts = await db.list('contacts');
    const tasks = await db.list('tasks');
    for (const t of teams) {
      const ms = (t.members || []).map(id => contacts.find(c => c.id === id)).filter(Boolean);
      const te = evs.filter(e => e.team === t.id && e.date >= todayStr()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4);
      const tt = tasks.filter(x => !x.done && (x.project === t.name || ms.some(m => m.name === x.who)));
      g.append(h('div.card', h('div.card-h', h('h3', h('span.dot', { style: { background: t.color || colorFor(t.name) } }), t.name), h('div.row', h('button.btn.sm', { onclick: () => newPoll(t) }, '시간 조율'), h('button.btn.sm.ghost', { onclick: () => editTeam(t) }, ic('edit', 14)))),
        h('div.row', { style: { gap: '4px', marginBottom: '10px' } }, ms.map(m => h('div', { title: m.name, onclick: () => go('people/' + m.id), style: { cursor: 'pointer' } }, avatar(m, 32))), !ms.length ? h('span.faint.small', '멤버 없음') : null),
        h('div.small', { style: { fontWeight: 650 } }, '다가오는 팀 일정'),
        te.length ? h('div.list', te.map(e => h('div.li', ic('calendar', 14), h('div.grow.small', e.title), h('span.faint.tiny', `${e.date.slice(5).replace('-', '/')} ${e.start || ''}`)))) : h('p.faint.small', '없음'),
        h('div.small', { style: { fontWeight: 650, marginTop: '8px' } }, `팀 할 일 ${tt.length}`),
        tt.slice(0, 5).map(x => h('div.li', ic('check2', 14), h('div.grow.small', x.title), h('span.chip', x.who || '미정'))),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: () => modal('팀 일정', close => form([{ k: 'title', label: '제목', full: true }, { k: 'date', label: '날짜', type: 'date', default: todayStr() }, { k: 'start', label: '시작', type: 'time' }, { k: 'end', label: '끝', type: 'time' }, { k: 'place', label: '장소' }], {}, async v => { await db.put('events', { ...v, team: t.id, color: t.color }); close(); go('team'); })) }, ic('plus', 14), '팀 일정'))));
    }
    root.append(g);

    async function editTeam(t = { members: [], color: '#4b5bff' }) {
      const cs = (await db.list('contacts')).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      const sel = new Set(t.members || []);
      const list = h('div', { style: { maxHeight: '260px', overflow: 'auto', border: '1px solid var(--line)', borderRadius: '10px', padding: '4px 8px' } }, cs.length ? cs.map(c => h('label.li.chk', h('input', { type: 'checkbox', checked: sel.has(c.id), onchange: e => e.target.checked ? sel.add(c.id) : sel.delete(c.id) }), avatar(c, 26), h('span.small', c.name), h('span.faint.tiny', c.org || ''))) : h('p.faint.small', '인맥에 먼저 사람을 추가해 주세요'));
      modal(t.id ? '팀 고치기' : '새 팀', close => {
        const f = form([{ k: 'name', label: '팀 이름' }, { k: 'color', label: '색', type: 'color' }], t, async v => { await db.put('teams', { ...t, ...v, members: [...sel] }); close(); go('team'); }, { extra: h('div', h('div.small', { style: { fontWeight: 600, margin: '6px 0' } }, '멤버'), list) });
        if (t.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('팀을 지울까요?', '지우기')) { await db.remove(t.id); close(); go('team'); } } }, ic('trash', 14)));
        return f;
      });
    }
    async function newPoll(t) {
      const teamsL = await db.list('teams');
      modal('시간 조율 만들기', close => form([
        { k: 'title', label: '무엇을 위한 시간인가요', full: true, default: t ? `${t.name} 회의` : '' },
        { k: 'team', label: '팀', type: 'select', options: [['', '직접 고르기'], ...teamsL.map(x => [x.id, x.name])], default: t?.id || '' },
        { k: 'start', label: '시작 날짜', type: 'date', default: todayStr() }, { k: 'days', label: '며칠 동안', type: 'number', default: 7 },
        { k: 'from', label: '하루 시작', type: 'time', default: '10:00' }, { k: 'to', label: '하루 끝', type: 'time', default: '22:00' },
        { k: 'mins', label: '필요한 시간(분)', type: 'number', default: 60 }], {}, async v => {
          const team = teamsL.find(x => x.id === v.team);
          const dates = [...Array(Math.max(1, Math.min(14, v.days || 7)))].map((_, i) => ymd(addDays(new Date(v.start), i)));
          const p = await db.put('polls', { title: v.title || '회의', team: v.team, members: ['me', ...(team?.members || [])], dates, from: v.from, to: v.to, mins: v.mins || 60, avail: {} });
          close(); go('team/poll/' + p.id);
        }, { submitLabel: '만들기' }));
    }
  },
};

// when2meet 방식 가능 시간 칠하기
async function poll(root, id) {
  const p = await db.get(id);
  if (!p) { root.append(h('div.empty', '조율을 찾을 수 없어요')); return; }
  const contacts = await db.list('contacts');
  const names = { me: '나' }; contacts.forEach(c => (names[c.id] = c.name));
  let who = 'me';
  const toM = s => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  const slots = []; for (let m = toM(p.from); m < toM(p.to); m += 30) slots.push(m);
  const lab = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  p.avail = p.avail || {};
  // 내 캘린더 바쁜 시간 자동 반영 제안
  const myBusy = new Set();
  for (const d of p.dates) for (const e of await store.eventsOn(d)) if (e.start) { const a = toM(e.start), b = toM(e.end || store.addMins(e.start, 60)); slots.forEach(s => s >= a - 29 && s < b && myBusy.add(d + '|' + s)); }
  const memSel = h('div.chips');
  const grid = h('div');
  const best = h('div');
  const drawMem = () => { clear(memSel); p.members.forEach(m => memSel.append(h('button.chip' + (m === who ? '.acc' : ''), { onclick: () => { who = m; drawMem(); drawGrid(); } }, (p.avail[m]?.length ? '● ' : '○ ') + (names[m] || '?')))); };
  let painting = null;
  function drawGrid() {
    clear(grid);
    const mine = new Set(p.avail[who] || []);
    const N = p.members.length;
    const g = h('div.avail', { style: { gridTemplateColumns: `44px repeat(${p.dates.length}, minmax(34px,1fr))` } });
    g.append(h('div'));
    p.dates.forEach(d => g.append(h('div.lbl', { style: { justifyContent: 'center', fontWeight: 650 } }, `${+d.slice(8)}(${wd(d)})`)));
    for (const s of slots) {
      g.append(h('div.lbl', s % 60 ? '' : lab(s)));
      for (const d of p.dates) {
        const key = d + '|' + s;
        const cnt = p.members.filter(m => (p.avail[m] || []).includes(key)).length;
        const c = h('div.c' + (mine.has(key) ? '.on' : ''), { 'data-k': key, title: `${d} ${lab(s)} · ${cnt}/${N}명` });
        if (!mine.has(key) && cnt) c.style.background = `color-mix(in srgb, var(--ok) ${Math.round(cnt / N * 70)}%, var(--bg2))`;
        if (who === 'me' && myBusy.has(key)) c.style.boxShadow = 'inset 0 0 0 2px var(--bad)';
        g.append(c);
      }
    }
    const paint = el => { if (!el?.dataset?.k) return; const k = el.dataset.k; const arr = new Set(p.avail[who] || []); painting ? arr.add(k) : arr.delete(k); p.avail[who] = [...arr]; el.classList.toggle('on', painting); };
    g.addEventListener('pointerdown', e => { const el = e.target.closest('.c'); if (!el) return; painting = !el.classList.contains('on'); paint(el); g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e => { if (painting === null) return; paint(document.elementFromPoint(e.clientX, e.clientY)?.closest('.c')); });
    const end = async () => { if (painting === null) return; painting = null; await db.patch(id, { avail: p.avail }); drawMem(); drawBest(); drawGrid(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    grid.append(h('div', { style: { overflowX: 'auto' } }, g), h('p.faint.tiny', { style: { marginTop: '6px' } }, `${names[who]} 칸을 드래그해서 되는 시간을 칠하세요.${who === 'me' ? ' 빨간 테두리는 내 캘린더에 이미 일정이 있는 시간이에요.' : ''}`));
  }
  function drawBest() {
    clear(best);
    const need = Math.ceil(p.mins / 30);
    const res = [];
    for (const d of p.dates) for (let i = 0; i + need <= slots.length; i++) {
      const keys = slots.slice(i, i + need).map(s => d + '|' + s);
      const ok = p.members.filter(m => keys.every(k => (p.avail[m] || []).includes(k)));
      if (ok.length) res.push({ d, s: slots[i], ok });
    }
    res.sort((a, b) => b.ok.length - a.ok.length || a.d.localeCompare(b.d) || a.s - b.s);
    const top = res.filter((r, i) => i === 0 || !(r.d === res[i - 1].d && r.s - res[i - 1].s === 30)).slice(0, 5);
    best.append(h('div.card-h', h('h3', ic('star'), '가장 좋은 시간')));
    if (!top.length) best.append(h('p.faint.small', '아직 겹치는 시간이 없어요'));
    top.forEach(r => best.append(h('div.li', h('div.grow', h('div.t.small', `${fmtDate(r.d)} ${lab(r.s)}–${lab(r.s + p.mins)}`), h('div.faint.tiny', `${r.ok.length}/${p.members.length}명 가능 · ${r.ok.map(m => names[m]).join(', ')}`)),
      h('button.btn.sm.pri', { onclick: async () => { const t = (await db.list('teams')).find(x => x.id === p.team); await db.put('events', { title: p.title, date: r.d, start: lab(r.s), end: lab(r.s + p.mins), team: p.team || '', color: t?.color }); await db.patch(id, { decided: { d: r.d, s: r.s } }); toast('캘린더에 확정했어요'); go('calendar/' + r.d); } }, '확정'))));
  }
  root.append(h('div.row', { style: { marginBottom: '6px' } }, h('a.btn.sm.ghost', { href: '#/team' }, ic('left', 14), '팀')),
    head(p.title, `${p.dates.length}일 · ${p.from}–${p.to} · ${p.mins}분 필요`, h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('조율을 지울까요?', '지우기')) { await db.remove(id); go('team'); } } }, ic('trash', 14))),
    h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }, class: 'editor-grid' }, h('div.card', h('div', { style: { marginBottom: '10px' } }, h('div.small', { style: { fontWeight: 650, marginBottom: '6px' } }, '누구의 시간을 칠할까요'), memSel), grid), h('div.card', best)));
  drawMem(); drawGrid(); drawBest();
}
