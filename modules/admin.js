// 관리자 화면: 수정 기록 · 통계 · 폴더 관리 · 멤버 (관리자 코드로 들어온 사람만)
import { h, ic, clear, toast, head, modal, form, tile, seg, rel, fmtDate, confirmBox, colorFor, won } from '../js/ui.js';
import * as db from '../js/db.js';
import * as A from '../js/admin.js';
import { go } from '../js/app.js';
import { TEAM_ROLES } from '../js/prompts.js';
const ROLE_NAMES = TEAM_ROLES.map(r => r.name);

let tab = 'log';
const F = { by: '', col: '', q: '' };
const TONE = { 만듦: 'ok', 지움: 'bad', 완료: 'ok' };
const KLABEL = { title: '제목', name: '이름', date: '날짜', start: '시작', end: '끝', due: '마감', who: '담당', done: '완료', status: '상태', amount: '금액', memo: '메모', note: '메모', team: '공유', project: '폴더', sub: '하위 폴더', tags: '태그', link: '링크', url: '링크', phone: '전화', email: '메일', color: '색', deleted: '지움', members: '멤버', place: '장소', category: '분류', moods: '느낌', colors: '색', priority: '중요도' };

export default {
  async render(root, params) {
    if (!(await A.isAdmin())) {
      root.append(head('관리자', '관리자 코드로 들어온 사람만 볼 수 있어요.'), h('div.card', h('div.empty', ic('shield', 28), h('p', '폴더·통계·멤버 관리와 수정 기록은 관리자 코드 전용이에요.'))));
      return;
    }
    if (params[0]) tab = params[0];
    const box = h('div');
    root.append(head('관리자', '누가 무엇을 어떻게 바꿨는지, 팀 통계와 폴더·멤버를 여기서만 관리해요.'),
      seg([['log', '수정 기록'], ['stat', '통계'], ['folder', '폴더'], ['member', '멤버']], tab, v => { tab = v; go('admin/' + v); }), box);
    box.style.marginTop = '14px';
    await ({ log, stat, folder, member }[tab] || log)();

    // ── 수정 기록 ──
    async function log() {
      const all = (await db.list('audit')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const people = [...new Set(all.map(a => a.by).filter(Boolean))];
      const cols = [...new Set(all.map(a => a.refCol))];
      const today = new Date().toISOString().slice(0, 10);
      const listEl = h('div.card');
      const sel = (k, opts, first) => h('select.in', { style: { width: 'auto' }, onchange: e => { F[k] = e.target.value; draw(); } }, h('option', { value: '' }, first), opts.map(([v, l]) => h('option', { value: v, selected: F[k] === v }, l)));
      box.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('edit', all.filter(a => (a.createdAt || '').slice(0, 10) === today).length, '오늘 바뀐 것'),
        tile('clock', all.filter(a => Date.now() - new Date(a.createdAt) < 7 * 864e5).length, '최근 7일'),
        tile('users', people.length, '기록 남긴 사람'),
        tile('trash', all.filter(a => a.action === '지움').length, '지워진 것', all.some(a => a.action === '지움') ? 'warn' : '')),
        h('div.row', { style: { marginBottom: '10px', flexWrap: 'wrap', gap: '8px' } },
          sel('by', people.map(p => [p, p]), '모든 사람'), sel('col', cols.map(c => [c, A.LABEL[c] || c]), '모든 종류'),
          h('input.in.grow', { placeholder: '제목·내용 찾기', value: F.q, oninput: e => { F.q = e.target.value; draw(); } })), listEl);
      draw();
      function draw() {
        clear(listEl);
        const q = F.q.trim().toLowerCase();
        const rows = all.filter(a => (!F.by || a.by === F.by) && (!F.col || a.refCol === F.col) && (!q || JSON.stringify([a.title, a.changes]).toLowerCase().includes(q)));
        if (!rows.length) { listEl.append(h('div.empty', all.length ? '조건에 맞는 기록이 없어요.' : '아직 기록이 없어요. 팀에 공유된 항목을 누가 만들거나 고치면 여기에 쌓여요.')); return; }
        let day = '';
        for (const a of rows.slice(0, 300)) {
          const d = (a.createdAt || '').slice(0, 10);
          if (d !== day) { day = d; listEl.append(h('div.tiny.faint', { style: { padding: '10px 4px 2px', fontWeight: 700 } }, fmtDate(d, { year: true }))); }
          const det = h('div.audit-d.hide', (a.changes || []).length ? a.changes.map(c => h('div.audit-c', h('b', KLABEL[c.k] || c.k), h('span.from', c.from), h('span.faint', '→'), h('span.to', c.to))) : h('span.faint.small', a.action === '만듦' ? '새로 만든 항목이에요.' : '바뀐 칸 기록 없음'));
          listEl.append(h('div.li.audit', { onclick: () => det.classList.toggle('hide') },
            h('span.av', { style: { background: colorFor(a.by || '?') } }, (a.by || '?').slice(0, 1)),
            h('div.grow', h('div.t', a.title), h('div.faint.small', `${a.by} · ${A.LABEL[a.refCol] || a.refCol} · ${rel(a.createdAt)} · ${a.device || ''}`), det),
            h('span.chip' + (TONE[a.action] ? '.' + TONE[a.action] : ''), a.action),
            a.action === '지움' ? h('button.btn.sm', { onclick: async e => { e.stopPropagation(); await db.patch(a.ref, { deleted: false }); toast('되살렸어요'); } }, '되살리기') : null));
        }
        if (rows.length > 300) listEl.append(h('p.faint.small', `최근 300개만 보여요 (전체 ${rows.length}개)`));
      }
    }

    // ── 통계 ──
    async function stat() {
      const items = (await db.allItems()).filter(i => !i.deleted && i.col !== '_kv' && i.col !== 'audit');
      const audit = await db.list('audit');
      const roster = await db.kvGet('sync:roster', []);
      const meName = await db.kvGet('name', '하진');
      const names = [...new Set([meName, ...roster.map(r => r.name?.length === 3 ? r.name.slice(1) : r.name), ...audit.map(a => a.by), ...items.map(i => i.by)].filter(Boolean))];
      const shared = items.filter(i => i.team || i.space);
      const tasks = items.filter(i => i.col === 'tasks');
      const same = (a, b) => a && b && (a === b || a.endsWith(b) || b.endsWith(a));
      const rows = names.map(n => {
        const mine = tasks.filter(t => same(t.who, n) || (!t.who && same(t.by || meName, n)));
        const acts = audit.filter(a => a.by === n);
        const last = acts.map(a => a.createdAt).sort().pop();
        return { n, open: mine.filter(t => !t.done).length, done: mine.filter(t => t.done).length, late: mine.filter(t => !t.done && t.due && t.due < new Date().toISOString().slice(0, 10)).length,
          refs: items.filter(i => i.col === 'refs' && i.by === n).length, made: acts.filter(a => a.action === '만듦').length, edits: acts.filter(a => a.action !== '만듦').length,
          spend: items.filter(i => i.col === 'expenses' && (i.by || meName) === n).reduce((s, e) => s + (Number(e.amount) || 0), 0), last };
      });
      box.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('users', names.length, '멤버'), tile('users', shared.length, '팀 공유 항목'),
        tile('check2', tasks.filter(t => t.done).length + '/' + tasks.length, '할 일 완료'),
        tile('image', items.filter(i => i.col === 'refs').length, '레퍼런스')),
        h('div.card', h('div.card-h', h('h3', ic('users'), '멤버별')), h('div.tbl-wrap', h('table.tbl',
          h('thead', h('tr', ['이름', '남은 할 일', '완료', '밀림', '레퍼런스', '만든 것', '고친 것', '쓴 비용', '마지막 활동'].map(t => h('th', t)))),
          h('tbody', rows.map(r => h('tr', h('td', h('b', r.n)), h('td', r.open), h('td', r.done), h('td', r.late ? h('span.chip.bad', r.late) : '0'), h('td', r.refs), h('td', r.made), h('td', r.edits), h('td', won(r.spend)), h('td.faint', r.last ? rel(r.last) : '기록 없음'))))))));
      const byCol = {}; for (const i of items) (byCol[i.col] = byCol[i.col] || { n: 0, s: 0 }, byCol[i.col].n++, (i.team || i.space) && byCol[i.col].s++);
      const max = Math.max(1, ...Object.values(byCol).map(v => v.n));
      box.append(h('div.card', { style: { marginTop: '14px' } }, h('div.card-h', h('h3', ic('grid'), '종류별 (전체 · 공유)')),
        Object.entries(byCol).filter(([c]) => A.LABEL[c]).sort((a, b) => b[1].n - a[1].n).map(([c, v]) => h('div.statbar', h('span.sl', A.LABEL[c]), h('span.sb', h('i', { style: { width: v.n / max * 100 + '%' } }), h('i.s', { style: { width: v.s / max * 100 + '%' } })), h('span.sn', `${v.n} · ${v.s}`)))));
      // 주간 활동 (최근 14일)
      const days = [...Array(14)].map((_, k) => { const d = new Date(Date.now() - (13 - k) * 864e5).toISOString().slice(0, 10); return { d, n: audit.filter(a => (a.createdAt || '').slice(0, 10) === d).length }; });
      const dm = Math.max(1, ...days.map(d => d.n));
      box.append(h('div.card', { style: { marginTop: '14px' } }, h('div.card-h', h('h3', ic('clock'), '최근 14일 활동')),
        h('div.daybars', days.map(d => h('div.db', { title: `${d.d} · ${d.n}건` }, h('i', { style: { height: Math.max(4, d.n / dm * 100) + '%' } }), h('span', d.d.slice(8)))))));
    }

    // ── 폴더 관리 ──
    async function folder() {
      const [projects, subs, all] = await Promise.all([db.list('projects'), db.list('reffolders'), db.allItems()]);
      const live = all.filter(i => !i.deleted);
      const cnt = (p, s) => live.filter(i => i.project === p && (s == null || i.sub === s) && i.col !== 'reffolders').length;
      const teamId = (await db.get('team-main')) ? 'team-main' : '';
      const rename = (it, isSub) => modal('이름 바꾸기', close => form([{ k: 'name', label: '이름', full: true }], it, async v => {
        const nn = v.name?.trim(); if (!nn || nn === it.name) { close(); return; }
        for (const x of live) {
          if (isSub ? x.project === it.project && x.sub === it.name : x.project === it.name && x.id !== it.id) await db.patch(x.id, isSub ? { sub: nn } : { project: nn });
        }
        await db.patch(it.id, { name: nn }); close(); toast('안에 든 것까지 함께 바꿨어요'); go('admin/folder');
      }));
      const del = async (it, isSub) => {
        const n = isSub ? cnt(it.project, it.name) : cnt(it.name);
        if (!(await confirmBox(`"${it.name}" 폴더를 지울까요?${n ? ` 안에 든 ${n}개는 지워지지 않고 '분류 안 됨'으로 가요.` : ''}`, '지우기'))) return;
        for (const x of live) {
          if (isSub ? x.project === it.project && x.sub === it.name : x.project === it.name && x.id !== it.id) { if (x.col === 'reffolders') await db.remove(x.id); else await db.patch(x.id, isSub ? { sub: '' } : { project: '', sub: '' }); }
        }
        await db.remove(it.id); go('admin/folder');
      };
      const add = sub => modal(sub ? '하위 폴더' : '새 폴더 (프로젝트)', close => form([{ k: 'name', label: '이름', full: true }], {}, async v => {
        const nn = v.name?.trim(); if (!nn) return toast('이름을 적어 주세요');
        if (sub) await db.put('reffolders', { project: sub, name: nn, team: teamId }); else await db.put('projects', { name: nn, status: '진행', color: colorFor(nn), team: teamId });
        close(); go('admin/folder');
      }, { submitLabel: '만들기' }));
      box.append(h('div.card', h('div.card-h', h('h3', ic('folder'), '폴더 (대분류 = 프로젝트)'), h('div.row', h('button.btn.sm.pri', { onclick: () => add() }, ic('plus', 14), '새 폴더'))),
        projects.length ? projects.map(p => h('div',
          h('div.li', h('span.dot', { style: { background: p.color || colorFor(p.name) } }), h('div.grow', h('div.t', p.name), h('div.faint.small', `${cnt(p.name)}개 · ${p.team ? '팀 공유' : '나만 보기'}`)),
            h('button.btn.sm', { title: p.team ? '나만 보기로' : '팀에 공유', onclick: async () => { await db.patch(p.id, { team: p.team ? '' : teamId }); go('admin/folder'); } }, ic('users', 14), p.team ? '공유 중' : '공유'),
            h('button.btn.sm', { onclick: () => add(p.name) }, ic('plus', 14), '하위'), h('button.btn.sm', { 'aria-label': '이름 바꾸기', onclick: () => rename(p) }, ic('edit', 14)), h('button.btn.sm', { 'aria-label': '지우기', onclick: () => del(p) }, ic('trash', 14))),
          subs.filter(s => s.project === p.name).map(s => h('div.li', { style: { paddingLeft: '28px' } }, ic('folder', 14), h('div.grow.small', s.name, h('span.faint', ` · ${cnt(p.name, s.name)}개`)),
            h('button.btn.sm', { 'aria-label': '이름 바꾸기', onclick: () => rename(s, true) }, ic('edit', 14)), h('button.btn.sm', { 'aria-label': '지우기', onclick: () => del(s, true) }, ic('trash', 14)))))) : h('div.empty', '폴더가 없어요.')));
    }

    // ── 멤버 ──
    async function member() {
      const sync = await import('../js/sync.js');
      if (!(await sync.me())) { box.append(h('div.card', h('div.empty', ic('users', 28), h('p', '멤버 코드로 로그인하면 여기서 멤버를 추가하고 코드를 관리할 수 있어요.'), h('a.btn.pri', { href: '#/settings' }, '설정에서 로그인')))); return; }
      let ms = []; try { ms = await sync.listMembers(); } catch (e) { box.append(h('p.faint.small', '멤버 목록을 못 불러왔어요: ' + e.message)); return; }
      const edit = (m = { active: true }) => modal(m.id ? '멤버 고치기' : '멤버 추가', close => form([{ k: 'name', label: '이름' }, { k: 'code', label: '멤버 코드 (5자 이내)', default: m.code || sync.newCode() }, { k: 'role', label: '역할 (화면 구성이 역할을 따라가요)', type: 'select', options: [...(m.role && !ROLE_NAMES.includes(m.role) ? [[m.role, m.role + ' (지금 값)']] : []), ...(m.role ? [] : [['', '고르기']]), ...TEAM_ROLES.map(r => [r.name, `${r.name} · ${r.about}`])], default: m.role || '' }, { k: 'email', label: '지메일 (선택)', default: m.gmail || '' }, { k: 'is_admin', label: '권한', type: 'select', options: [['', '멤버'], ['1', '관리자']], default: m.is_admin ? '1' : '' }, { k: 'active', label: '상태', type: 'select', options: [['1', '사용 중'], ['', '정지']], default: m.active === false ? '' : '1' }], { ...m, is_admin: m.is_admin ? '1' : '', active: m.active === false ? '' : '1', email: m.gmail || '', code: m.code || sync.newCode() }, async v => {
        if (!v.role) { toast('역할을 골라 주세요'); return; }
        try { await sync.saveMember({ id: m.id, name: v.name, code: String(v.code || '').toUpperCase().slice(0, 5), gmail: v.email || '', role: v.role, is_admin: !!v.is_admin, active: !!v.active }); close(); toast('저장했어요'); go('admin/member'); } catch (e) { toast(e.message); }
      }));
      box.append(h('div.card', h('div.card-h', h('h3', ic('users'), `멤버 ${ms.length}`), h('div.row', h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '멤버 추가'))),
        ms.map(m => h('div.li', h('span.av', { style: { background: colorFor(m.name) } }, m.name.slice(-2, -1) || m.name[0]), h('div.grow', h('div.t', m.name, m.is_admin ? h('span.chip', { style: { marginLeft: '6px' } }, '관리자') : null, m.active === false ? h('span.chip.bad', { style: { marginLeft: '6px' } }, '정지') : null), h('div.faint.small', [m.role || '역할 없음', m.gmail, m.joined ? '로그인함' : '아직 로그인 안 함'].filter(Boolean).join(' · '))),
          h('code.code', m.code || '•••••'), h('button.btn.sm', { 'aria-label': '코드 복사', onclick: () => { navigator.clipboard?.writeText(m.code || ''); toast('코드를 복사했어요'); } }, ic('copy', 14)), h('button.btn.sm', { 'aria-label': '고치기', onclick: () => edit(m) }, ic('edit', 14))))));
    }
  },
};
