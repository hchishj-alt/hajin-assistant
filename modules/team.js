import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, addDays, ymd, colorFor, confirmBox, tile, wd } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import { go } from '../js/app.js';
import { avatar } from './people.js';
import * as sync from '../js/sync.js';

export default {
  async render(root, params) {
    if (params[0] === 'poll' && params[1]) return poll(root, params[1]);
    const teams = await db.list('teams');
    const polls = await db.list('polls');
    const votes = await db.list('pollvotes');
    const answered = p => p.shared ? new Set(votes.filter(v => v.poll === p.id && v.slots?.length).map(v => v.user)).size : Object.keys(p.avail || {}).filter(k => p.avail[k]?.length).length;
    const evs = (await db.list('events')).filter(e => e.team);
    root.append(head('팀 · 일정 조율', '팀별 멤버·일정·할 일, 그리고 모두 되는 시간 찾기.',
      h('button.btn.sm', { onclick: () => joinTeam() }, ic('link', 14), '코드로 참여'),
      h('button.btn.sm', { onclick: () => newPoll() }, ic('grid', 14), '시간 조율'),
      h('button.btn.sm.pri', { onclick: () => editTeam() }, ic('plus', 14), '팀')),
      sync.enabled() ? '' : h('div.card.flat', { style: { marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center' } }, ic('cloud', 18), h('p.small.muted.grow', '지금은 이 기기에만 저장돼요. 동기화에 로그인하면 팀을 공유하고, 팀원이 참여 코드로 들어와 직접 가능 시간을 칠할 수 있어요.'), h('a.btn.sm', { href: '#/settings/sync' }, '동기화 켜기')),
      h('div.tiles', { style: { marginBottom: '14px' } }, tile('grid', teams.length, '팀'), tile('users', new Set(teams.flatMap(t => t.space ? (t.sharedMembers || []).map(m => m.user) : (t.members || []))).size, '팀원'), tile('calendar', evs.filter(e => e.date >= todayStr()).length, '예정된 팀 일정'), tile('clock', polls.filter(p => !p.decided).length, '조율 중', polls.some(p => !p.decided) ? 'warn' : '')));
    if (polls.filter(p => !p.decided).length) root.append(h('div.card', { style: { marginBottom: '14px' } }, h('div.card-h', h('h3', ic('clock'), '조율 중인 시간')), polls.filter(p => !p.decided).map(p => h('div.li.click', { onclick: () => go('team/poll/' + p.id) }, ic('grid', 16), h('div.grow', h('div.t.small', p.title), h('div.faint.tiny', `${(p.dates || []).length}일 · ${p.from}–${p.to} · 응답 ${answered(p)}/${p.members.length}`))))));
    if (sync.enabled()) root.append(await membersCard());
    const g = h('div.grid.g2');
    if (!teams.length) g.append(h('div.card', h('div.empty', '팀을 만들고 인맥에서 멤버를 골라 보세요')));
    const contacts = await db.list('contacts');
    const tasks = await db.list('tasks');
    for (const t of teams) {
      const ms = (t.members || []).map(id => contacts.find(c => c.id === id)).filter(Boolean);
      const te = evs.filter(e => e.team === t.id && e.date >= todayStr()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4);
      const tt = tasks.filter(x => !x.done && (x.project === t.name || ms.some(m => m.name === x.who)));
      const sm = t.space ? (t.sharedMembers || []) : null;
      g.append(h('div.card', h('div.card-h', h('h3', h('span.dot', { style: { background: t.color || colorFor(t.name) } }), t.name, t.space ? h('span.chip.ok', { title: '팀원과 실시간 공유 중' }, '공유') : null), h('div.row', h('button.btn.sm', { onclick: () => newPoll(t) }, '시간 조율'), t.main ? null : h('button.btn.sm.ghost', { title: t.space ? '참여 코드' : '팀원과 공유', onclick: () => shareTeam(t) }, ic('link', 14)), h('button.btn.sm.ghost', { onclick: () => editTeam(t) }, ic('edit', 14)))),
        sm ? h('div.row', { style: { gap: '4px', marginBottom: '10px', flexWrap: 'wrap' } }, sm.map(m => h('span.chip' + (m.user === sync.userId() ? '.acc' : ''), m.name + (m.user === sync.userId() ? ' (나)' : ''))), t.main ? null : h('span.faint.tiny', `코드 ${t.code || ''}`))
          : h('div.row', { style: { gap: '4px', marginBottom: '10px' } }, ms.map(m => h('div', { title: m.name, onclick: () => go('people/' + m.id), style: { cursor: 'pointer' } }, avatar(m, 32))), !ms.length ? h('span.faint.small', '멤버 없음') : null),
        h('div.small', { style: { fontWeight: 650 } }, '다가오는 팀 일정'),
        te.length ? h('div.list', te.map(e => h('div.li', ic('calendar', 14), h('div.grow.small', e.title), h('span.faint.tiny', `${e.date.slice(5).replace('-', '/')} ${e.start || ''}`)))) : h('p.faint.small', '없음'),
        h('div.small', { style: { fontWeight: 650, marginTop: '8px' } }, `팀 할 일 ${tt.length}`),
        tt.slice(0, 5).map(x => h('div.li', ic('check2', 14), h('div.grow.small', x.title), h('span.chip', x.who || '미정'))),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: () => modal('팀 일정', close => form([{ k: 'title', label: '제목', full: true }, { k: 'date', label: '날짜', type: 'date', default: todayStr() }, { k: 'start', label: '시작', type: 'time' }, { k: 'end', label: '끝', type: 'time' }, { k: 'place', label: '장소' }], {}, async v => { await db.put('events', { ...v, team: t.id, color: t.color }); close(); go('team'); })) }, ic('plus', 14), '팀 일정'))));
    }
    root.append(g);

    async function editTeam(t = { members: [], color: '#2f6fdd' }) {
      const cs = (await db.list('contacts')).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      const sel = new Set(t.members || []);
      const list = h('div', { style: { maxHeight: '260px', overflow: 'auto', border: '1px solid var(--line)', borderRadius: '10px', padding: '4px 8px' } }, cs.length ? cs.map(c => h('label.li.chk', h('input', { type: 'checkbox', checked: sel.has(c.id), onchange: e => e.target.checked ? sel.add(c.id) : sel.delete(c.id) }), avatar(c, 26), h('span.small', c.name), h('span.faint.tiny', c.org || ''))) : h('p.faint.small', '인맥에 먼저 사람을 추가해 주세요'));
      modal(t.id ? '팀 고치기' : '새 팀', close => {
        const f = form([{ k: 'name', label: '팀 이름' }, { k: 'color', label: '색', type: 'color' }], t, async v => { await db.put('teams', { ...t, ...v, members: [...sel] }); close(); go('team'); }, { extra: h('div', h('div.small', { style: { fontWeight: 600, margin: '6px 0' } }, '멤버'), list) });
        if (t.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('팀을 지울까요?', '지우기')) { await db.remove(t.id); close(); go('team'); } } }, ic('trash', 14)));
        return f;
      });
    }
    async function shareTeam(t) {
      if (!sync.enabled()) { toast('먼저 동기화에 로그인해 주세요', { label: '설정', fn: () => go('settings/sync') }); return; }
      let code = t.code;
      if (!t.space) {
        if (!(await confirmBox(`"${t.name}" 팀을 공유할까요? 팀 일정·시간 조율·팀 할 일이 참여한 팀원에게 보여요. 내 다른 기록은 안 보여요.`, '공유하기'))) return;
        try { code = await sync.shareTeam(t); } catch (e) { toast(e.message); return; }
      }
      const link = `${location.origin}${location.pathname}#/team/join/${code}`;
      modal('팀원 초대', close => h('div',
        h('p.small.muted', '팀원은 이 앱에서 동기화에 로그인한 뒤 아래 코드나 링크로 들어오면 돼요.'),
        h('div', { style: { fontSize: '34px', fontWeight: 800, letterSpacing: '.18em', textAlign: 'center', margin: '14px 0' } }, code),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn.sm.pri', { onclick: async () => { try { await navigator.clipboard.writeText(`[소머스튜디오] "${t.name}" 팀 참여 코드: ${code}\n${link}`); toast('초대 문구를 복사했어요'); } catch { toast('복사 권한이 없어요. 코드를 직접 알려 주세요'); } } }, ic('copy', 14), '초대 문구 복사'),
          navigator.share ? h('button.btn.sm', { onclick: () => navigator.share({ title: t.name + ' 팀 참여', text: `참여 코드 ${code}`, url: link }).catch(() => { }) }, '공유') : null,
          h('button.btn.sm.ghost', { onclick: close }, '닫기'))));
    }
    async function joinTeam(code = '') {
      if (!sync.enabled()) { toast('먼저 동기화에 로그인해 주세요', { label: '설정', fn: () => go('settings/sync') }); return; }
      modal('코드로 팀 참여', close => form([{ k: 'code', label: '참여 코드 (6자리)', default: code }], {}, async v => {
        try { const s = await sync.joinTeam(v.code); toast(`"${s.name}" 팀에 들어왔어요`); close(); go('team'); } catch (e) { toast(e.message); }
      }, { submitLabel: '참여' }));
    }
    if (params[0] === 'join' && params[1]) joinTeam(params[1]);
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
          const shared = !!team?.space;
          const members = shared ? (team.sharedMembers || []).map(m => m.user) : ['me', ...(team?.members || [])];
          const p = await db.put('polls', { title: v.title || '회의', team: v.team || '', shared, members, dates, from: v.from, to: v.to, mins: v.mins || 60, avail: {} });
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
  // 공유 팀의 조율: 각자 자기 칸만 칠하고, 응답은 사람마다 따로 저장 (동시에 칠해도 안 덮어씀)
  const team = p.team ? await db.get(p.team) : null;
  const shared = !!p.shared;
  const myId = sync.userId();
  if (shared) {
    (team?.sharedMembers || []).forEach(m => (names[m.user] = m.name + (m.user === myId ? ' (나)' : '')));
    const vs = (await db.list('pollvotes')).filter(v => v.poll === p.id);
    p.avail = {}; vs.forEach(v => { p.avail[v.user] = v.slots || []; names[v.user] ||= v.name; });
    // 나중에 들어온 팀원도 조율에 포함
    const all = new Set([...(p.members || []), ...(team?.sharedMembers || []).map(m => m.user), ...vs.map(v => v.user)]);
    p.members = [...all];
    who = myId || p.members[0];
  }
  const toM = s => { const [a, b] = String(s || '0:0').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  const slots = []; for (let m = toM(p.from); m < toM(p.to); m += 30) slots.push(m);
  const lab = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  p.avail = p.avail || {};
  // 내 캘린더 바쁜 시간 자동 반영 제안
  const myBusy = new Set();
  for (const d of p.dates) for (const e of await store.eventsOn(d)) if (e.start) { const a = toM(e.start), b = toM(e.end || store.addMins(e.start, 60)); slots.forEach(s => s >= a - 29 && s < b && myBusy.add(d + '|' + s)); }
  const memSel = h('div.chips');
  const grid = h('div');
  const best = h('div');
  const drawMem = () => { clear(memSel); p.members.forEach(m => memSel.append(h('button.chip' + (m === who ? '.acc' : ''), { onclick: () => { if (shared && m !== myId) { toast('공유 조율에서는 각자 자기 시간만 칠해요'); return; } who = m; drawMem(); drawGrid(); } }, (p.avail[m]?.length ? '● ' : '○ ') + (names[m] || '팀원')))); };
  const isMe = () => who === 'me' || (shared && who === myId);
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
        if (isMe() && myBusy.has(key)) c.style.boxShadow = 'inset 0 0 0 2px var(--bad)';
        g.append(c);
      }
    }
    const paint = el => { if (!el?.dataset?.k) return; const k = el.dataset.k; const arr = new Set(p.avail[who] || []); painting ? arr.add(k) : arr.delete(k); p.avail[who] = [...arr]; el.classList.toggle('on', painting); };
    g.addEventListener('pointerdown', e => { const el = e.target.closest('.c'); if (!el) return; painting = !el.classList.contains('on'); g.classList.add('painting'); paint(el); g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e => { if (painting === null) return; paint(document.elementFromPoint(e.clientX, e.clientY)?.closest('.c')); });
    const end = async () => {
      if (painting === null) return; painting = null; g.classList.remove('painting');
      if (shared) { if (!myId) { toast('동기화에 로그인해야 칠할 수 있어요'); return; } await db.put('pollvotes', { id: p.id + '~' + myId, poll: p.id, team: p.team, user: myId, name: (await db.kvGet('name', '하진')), slots: p.avail[myId] || [] }); }
      else await db.patch(id, { avail: p.avail });
      drawMem(); drawBest(); drawGrid();
    };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    grid.append(h('div', { style: { overflowX: 'auto' } }, g), h('p.faint.tiny', { style: { marginTop: '6px' } }, `${shared ? (sync.enabled() ? '내' : '로그인 후 내') : names[who]} 칸을 드래그해서 되는 시간을 칠하세요.${shared ? ' 팀원이 칠한 건 초록색 진하기로 보여요.' : ''}${isMe() ? ' 빨간 테두리는 내 캘린더에 이미 일정이 있는 시간이에요.' : ''}`));
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
    top.forEach(r => best.append(h('div.li', h('div.grow', h('div.t.small', `${fmtDate(r.d)} ${lab(r.s)}–${lab(r.s + p.mins)}`), h('div.faint.tiny', `${r.ok.length}/${p.members.length}명 가능 · ${r.ok.map(m => names[m] || '팀원').join(', ')}`)),
      h('button.btn.sm.pri', { onclick: async () => { const t = (await db.list('teams')).find(x => x.id === p.team); await db.put('events', { title: p.title, date: r.d, start: lab(r.s), end: lab(r.s + p.mins), team: p.team || '', color: t?.color }); await db.patch(id, { decided: { d: r.d, s: r.s } }); toast('캘린더에 확정했어요'); go('calendar/' + r.d); } }, '확정'))));
  }
  root.append(h('div.row', { style: { marginBottom: '6px' } }, h('a.btn.sm.ghost', { href: '#/team' }, ic('left', 14), '팀')),
    head(p.title, `${p.dates.length}일 · ${p.from}–${p.to} · ${p.mins}분 필요`, h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('조율을 지울까요?', '지우기')) { await db.remove(id); go('team'); } } }, ic('trash', 14))),
    h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }, class: 'editor-grid' }, h('div.card', h('div', { style: { marginBottom: '10px' } }, h('div.small', { style: { fontWeight: 650, marginBottom: '6px' } }, '누구의 시간을 칠할까요'), memSel), grid), h('div.card', best)));
  drawMem(); drawGrid(); drawBest();
}

// ── 멤버 (멤버 코드 로그인) ──
async function membersCard() {
  const card = h('div.card', { style: { marginBottom: '14px' } });
  const admin = await sync.isAdmin();
  let ms = [];
  try { ms = await sync.listMembers(); } catch (e) { card.append(h('p.faint.small', '멤버 목록을 못 불러왔어요: ' + e.message)); return card; }
  const appUrl = location.origin + location.pathname;
  const invite = m => `[소머스튜디오] ${m.name} 님 멤버 코드: ${m.code}\n앱 주소: ${appUrl}\n열고 → 설정 → 폰·PC 동기화 → 코드 입력 → 로그인\n(폰은 홈 화면에 추가하면 앱처럼 쓸 수 있어요)`;
  card.append(h('div.card-h', h('h3', ic('users'), `멤버 ${ms.filter(m => m.active && !m.ended).length}명`), admin ? h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '멤버') : null),
    h('div.list', ms.filter(m => admin || (m.active && !m.ended)).map(m => h('div.li' + (m.active && !m.ended ? '' : '.done'),   /* 끝났거나 멈춘 사람은 관리자에게만 보임 */ h('span.dot', { style: { background: m.joined ? 'var(--ok)' : 'var(--line)' }, title: m.joined ? '로그인함' : '아직 로그인 전' }),
      h('div.grow', h('div.t.small', m.name, m.is_admin ? h('span.chip.acc', { style: { marginLeft: '6px' } }, '관리자') : null, m.kind === 'guest' ? h('span.chip.tiny.guest-chip', { style: { marginLeft: '6px' } }, '단기') : null, m.active ? (m.ended ? h('span.chip.bad', { style: { marginLeft: '6px' } }, '기간 끝남') : null) : h('span.chip', { style: { marginLeft: '6px' } }, '비활성')),
        h('div.faint.tiny', [m.role, m.gmail, m.joined ? '로그인함' : '로그인 전'].filter(Boolean).join(' · '))),
      admin && m.code ? h('span.mono', { style: { fontWeight: 750, letterSpacing: '.12em' } }, m.code) : null,
      admin ? h('button.btn.sm.ghost', { title: '초대 문구 복사', onclick: async () => { try { await navigator.clipboard.writeText(invite(m)); toast(`${m.name} 님 초대 문구를 복사했어요`); } catch { toast('복사 권한이 없어요'); } } }, ic('copy', 14)) : null,
      admin ? h('button.btn.sm.ghost', { title: '고치기', onclick: () => edit(m) }, ic('edit', 14)) : null))),
    admin ? h('p.faint.tiny', { style: { marginTop: '6px' } }, '코드는 관리자에게만 보여요. 멤버는 코드 하나로 폰·PC 어디서든 로그인하고, 모든 기능을 자기 기록으로 써요. 팀에 공유한 것만 서로 보여요.') : null);
  function edit(m = { code: sync.newCode(), active: true }) {
    modal(m.id ? '멤버 고치기' : '새 멤버', close => {
      const f = form([
        { k: 'name', label: '이름' }, { k: 'role', label: '역할 (예: 개발, 디자인)' },
        { k: 'gmail', label: '지메일 (캘린더 초대·연락용, 선택)', type: 'email', full: true },
        { k: 'code', label: '멤버 코드 (영문·숫자 5자리 이내)' },
        { k: 'is_admin', label: '권한', type: 'select', options: [['', '멤버'], ['1', '관리자']] },
        { k: 'active', label: '상태', type: 'select', options: [['1', '사용'], ['', '비활성 (로그인·팀 공간 차단)']] },
      ], { ...m, is_admin: m.is_admin ? '1' : '', active: m.active === false ? '' : '1' }, async v => {
        const code = String(v.code || '').trim().toUpperCase();
        if (!v.name?.trim()) { toast('이름을 적어 주세요'); return; }
        if (!/^[A-Z0-9]{3,5}$/.test(code)) { toast('코드는 영문·숫자 3~5자리예요'); return; }
        if (m.id && m.code !== code && m.joined && !(await confirmBox(`코드를 바꾸면 ${m.name} 님은 새 코드로 다시 로그인해야 해요.`, '바꾸기'))) return;
        try { await sync.saveMember({ ...m, ...v, code, is_admin: !!v.is_admin, active: !!v.active }); toast('저장했어요'); close(); go('team'); } catch (e) { toast(e.message); }
      }, { submitLabel: '저장' });
      f.querySelector('input[name=code]')?.after(h('button.btn.sm.ghost', { type: 'button', style: { marginTop: '6px' }, onclick: () => { f.querySelector('input[name=code]').value = sync.newCode(); } }, ic('refresh', 12), '새 코드'));
      return f;
    });
  }
  return card;
}
