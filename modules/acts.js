// 대외활동: 공모전·서포터즈를 팀이 같이 모아 두고, 포스터로 훑어보고, 팀 목표로 등록하면 단계가 각자 캘린더에 들어가요
import { h, ic, clear, toast, head, modal, form, confirmBox, seg, busy, debounce, colorFor, facePic, pickFile } from '../js/ui.js';
import * as db from '../js/db.js';
import * as A from '../js/acts.js';
import { nameCanon, sameName } from '../js/store.js';

const F = { tab: 'mine', view: 'grid', type: '', part: '', who: '', region: '', status: '', due: '', ok: false, q: '', sort: 'due', open: false };
const DUE = [['', '전체'], ['7', '이번 주'], ['14', '2주 안'], ['30', '한 달 안'], ['past', '지난 것도']];
const SORTS = [['due', '마감 가까운 순'], ['match', '우리와 맞는 순'], ['new', '새로 담은 순']];
const blobUrls = new Map();
const teamOf = async () => ((await db.get('team-main')) ? 'team-main' : '');
const meName = () => db.kvGet('name', '');
const today = () => db.dayOf(new Date());
const mmdd = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '';
const face = name => facePic(name, h('span.av', { style: { background: colorFor(name || '?') } }, (name || '?').slice(-2, -1) || (name || '?')[0]));

const normLink = u => String(u || '').replace(/#.*$/, '').replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
const sameLink = (a, b) => !!a && !!b && normLink(a) === normLink(b);

export default {
  async render(root, params) {
    const box = h('div'); const titleEl = h('h1', '대외활동'), subEl = h('p.sub', '');
    let prof = A.PROFILE, canon = w => w, me = '', rec = { items: [] }, roster = [];
    const saved = await db.kvGet('acts:view', null); if (saved) { F.view = saved.view || F.view; F.sort = saved.sort || F.sort; }
    if (params[0] === 'rec') F.tab = 'rec';
    root.append(h('div.page-head', h('div', titleEl, subEl), h('div.row',
      h('button.btn.sm', { type: 'button', onclick: () => editProfile() }, ic('users', 14), '우리 팀 조건'),
      h('button.btn.sm', { type: 'button', onclick: () => addByLink() }, ic('link', 14), '링크로 담기'),
      h('button.btn.sm.pri', { type: 'button', onclick: () => edit({}) }, ic('plus', 14), '직접 적기'))), box);
    const off = db.onChange(col => { if (col === 'acts' && document.body.contains(box) && !document.querySelector('.modal-bg')) draw(); });
    A.loadFeed().then(async f => { rec = f; await A.refreshNew(f).catch(() => null); if (document.body.contains(box)) draw(); });
    await draw();
    if (params[0] && params[0] !== 'rec') { const it = await db.get(params[0]); if (it && !it.deleted && it.col === 'acts') detail(it); }
    return off;

    async function draw() {
      const y = scrollY;
      const [all, p, cn, nm, hide, ros] = await Promise.all([db.list('acts'), A.profile(), nameCanon(), meName(), db.kvGet('acts:hide', []), db.kvGet('sync:roster', [])]);
      prof = p; canon = cn; me = nm; roster = [...new Set(ros.filter(m => m && m.name && m.kind !== 'guest').map(m => m.name))]; if (nm && !roster.some(n => sameName(n, nm))) roster.push(nm);   /* 단기 작업자는 빼고, 내 이름이 명단과 같은 사람이면 한 번만 */
      const t = today(); const mine = all.filter(a => a.kind !== 'profile');
      const recs = (rec.items || []).filter(r => !mine.some(a => sameLink(a.link, r.link) || (a.srcId && a.srcId === r.id)) && !hide.includes(r.link) && !(A.dday(r.due, t) < 0));
      const live = mine.filter(a => A.LIVE.has(a.status || 'want') && !(A.dday(a.due, t) < 0));
      const near = live.map(a => A.dday(a.due, t)).filter(n => n != null).sort((a, b) => a - b)[0];
      titleEl.textContent = live.length ? `챙기는 대외활동 ${live.length}개${near != null ? `, 가장 가까운 마감은 ${near === 0 ? '오늘' : 'D-' + near}` : ''}` : mine.length ? '대외활동, 지금 챙기는 건 없어요' : '대외활동, 아직 담은 게 없어요';
      subEl.textContent = '공모전과 서포터즈를 팀이 같이 모아요. 팀 목표로 등록하면 제출·면접 날짜가 각자 캘린더에 들어가요.';
      clear(box);
      const src = F.tab === 'mine' ? mine : recs;
      const rows = src.map(a => ({ a, r: A.rank(a, prof, t) })).filter(({ a, r }) =>
        (!F.type || (a.type || 'contest') === F.type) && (!F.part || a.part === F.part) && (!F.who || a.who === F.who)
        && (!F.region || (F.region === 'all' ? !a.region || /전국/.test(a.region) : F.region === 'ours' ? !!a.region && !/전국/.test(a.region) && r.region.ok : true))
        && (!F.status || F.tab !== 'mine' || (a.status || 'want') === F.status) && (!F.ok || r.ok)
        && (F.due === 'past' ? true : F.due ? (r.dday != null && r.dday >= 0 && r.dday <= +F.due) : F.tab === 'mine' ? true : !(r.dday < 0))
        && (!F.q || `${a.title} ${a.host || ''} ${a.field || ''} ${a.body || ''}`.toLowerCase().includes(F.q.toLowerCase())));
      const past = x => (x.r.dday != null && x.r.dday < 0 ? 2 : 0) + (['sent', 'won', 'lost', 'drop'].includes(x.a.status) ? 1 : 0);
      const by = { due: (x, z) => past(x) - past(z) || (x.r.dday ?? 9999) - (z.r.dday ?? 9999), match: (x, z) => past(x) - past(z) || z.r.total - x.r.total, new: (x, z) => (z.a.createdAt || z.a.date || '').localeCompare(x.a.createdAt || x.a.date || '') };
      rows.sort(by[F.tab === 'rec' && F.sort === 'new' ? 'match' : F.sort] || by.due);

      const keep = () => db.kvSet('acts:view', { view: F.view, sort: F.sort });
      const q = h('input.in', { type: 'search', placeholder: '이름·주최·분야 찾기', 'aria-label': '대외활동 찾기', value: F.q, oninput: debounce(e => { F.q = e.target.value; draw().then(() => { const i = box.querySelector('.ac-q input'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch { } } }); }, 250) });
      const pick = (key, opts) => h('div.chips', opts.map(([v, l]) => h('button.chip.ac-pick' + (F[key] === v ? '.acc' : ''), { type: 'button', 'aria-pressed': String(F[key] === v), onclick: () => { F[key] = v; draw(); } }, l)));
      const n = (F.part ? 1 : 0) + (F.who ? 1 : 0) + (F.region ? 1 : 0) + (F.status && F.tab === 'mine' ? 1 : 0) + (F.due ? 1 : 0) + (F.ok ? 1 : 0);
      const viewBtn = (v, icon, label) => h('button' + (F.view === v ? '.on' : ''), { type: 'button', 'aria-label': label, 'aria-pressed': String(F.view === v), onclick: () => { F.view = v; keep(); draw(); } }, ic(icon, 16));
      box.append(
        h('div.ac-tabs', seg([['mine', `우리가 담은 것 ${mine.length}`], ['rec', `찾아온 것 ${recs.length}`]], F.tab, v => { F.tab = v; if (v === 'rec' && F.sort === 'new') F.sort = 'match'; draw(); })),
        h('div.card.ac-filter',
          h('div.row', { style: { gap: '10px', flexWrap: 'wrap' } }, h('div.ac-q.grow', q), seg([['', '전체'], ...A.TYPES], F.type, v => { F.type = v; draw(); }), h('div.seg.ac-view', viewBtn('grid', 'grid', '포스터로 보기'), viewBtn('list', 'menu', '목록으로 보기'))),
          h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } },
            h('button.btn.sm' + (n ? '.pri' : ''), { type: 'button', 'aria-expanded': String(!!F.open), onclick: () => { F.open = !F.open; draw(); } }, ic(F.open ? 'up' : 'down', 14), `조건으로 거르기${n ? ' ' + n : ''}`),
            h('select.in.ac-sort', { 'aria-label': '정렬', onchange: e => { F.sort = e.target.value; keep(); draw(); } }, SORTS.filter(s => F.tab === 'mine' || s[0] !== 'new').map(([k, l]) => h('option', { value: k, selected: F.sort === k }, l))),
            n ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { F.part = F.who = F.region = F.status = F.due = ''; F.ok = false; draw(); } }, '조건 지우기') : null),
          F.open ? h('div.ac-detail',
            h('div.ac-frow', h('span.lbl', '참가'), pick('part', [['', '전체'], ['solo', '개인만'], ['both', '팀 가능'], ['team', '팀 필수']])),
            h('div.ac-frow', h('span.lbl', '대상'), pick('who', [['', '전체'], ['anyone', '누구나'], ['univ', '대학생만'], ['youth', '청년']])),
            h('div.ac-frow', h('span.lbl', '지역'), pick('region', [['', '전체'], ['all', '전국'], ['ours', `우리 지역 (${prof.regions.join('·')})`]])),
            h('div.ac-frow', h('span.lbl', '마감'), pick('due', DUE)),
            F.tab === 'mine' ? h('div.ac-frow', h('span.lbl', '상태'), pick('status', [['', '전체'], ...A.STATUS])) : null,
            h('div.ac-frow', h('span.lbl', '자격'), h('div.chips', h('button.chip.ac-pick' + (F.ok ? '.acc' : ''), { type: 'button', 'aria-pressed': String(F.ok), onclick: () => { F.ok = !F.ok; draw(); } }, '우리가 나갈 수 있는 것만')))) : null));
      if (F.tab === 'rec') box.append(h('div.faint.small.ac-note', rec.updatedAt ? `${mmdd(db.dayOf(rec.updatedAt))} 아침에 새로 찾았어요. 맞는 순서와 마감을 같이 봐서 늘어놓아요.` : '아직 찾아온 게 없어요. 매일 아침 새로 찾아 둘게요. 그 전에는 “링크로 담기”로 넣을 수 있어요.'));
      if (!rows.length) box.append(h('div.card', h('div.empty', src.length ? '조건에 맞는 게 없어요. 조건을 지워 보세요.' : F.tab === 'mine' ? '공고 링크를 “링크로 담기”에 붙이거나 “직접 적기”로 넣어 보세요. 비서에게 “○○ 공모전 12월 20일 마감 팀 4명까지”라고 말해도 들어와요.' : '지금은 보여 줄 추천이 없어요.')));
      else if (F.view === 'grid') { const g = h('div.ac-grid'); for (const x of rows) g.append(await cardOf(x)); box.append(g); }
      else { const l = h('div.card.pad0.ac-list'); for (const x of rows) l.append(await rowOf(x)); box.append(l); }
      box.append(h('div.faint.tiny.ac-count', `${rows.length}개`));
      if (y && Math.abs(scrollY - y) > 4) scrollTo(0, y);
    }

    async function posterOf(a) { if (a.posterKey) { if (!blobUrls.has(a.posterKey)) { const b = await db.getBlob(a.posterKey); if (b) blobUrls.set(a.posterKey, URL.createObjectURL(b)); } if (blobUrls.get(a.posterKey)) return blobUrls.get(a.posterKey); } return a.poster || ''; }
    function tagsOf(a, r, { max = 4 } = {}) {
      const out = []; const pt = A.partTag(a), wt = A.whoTag(a), rt = A.regionTag(a);
      if (pt) out.push(h('span.chip' + (a.part === 'solo' ? '' : '.acc'), ic(a.part === 'solo' ? 'user' : 'users', 12), pt));
      if (wt) out.push(h('span.chip' + (a.who === 'teen' || (a.who === 'univ' && !prof.univ) ? '.bad' : ''), wt));
      if (rt) out.push(h('span.chip' + (rt === '전국' ? '' : r.region.ok ? '.ok' : '.bad'), ic('pin', 12), rt === '전국' ? rt : r.region.ok ? `${rt} · 우리 가능` : rt));
      if (a.prize) out.push(h('span.chip', a.prize.length > 18 ? a.prize.slice(0, 17) + '…' : a.prize));
      return out.slice(0, max);
    }
    function dchip(r) { return h('span.ac-d' + (r.dday == null ? '.none' : r.dday < 0 ? '.past' : r.dday <= 3 ? '.hot' : r.dday <= 7 ? '.warm' : ''), A.ddayText(r.dday)); }
    function stchip(a) { return h('span.chip' + ({ prep: '.acc', sent: '.ok', second: '.acc', won: '.ok', lost: '', drop: '' }[a.status] || ''), A.statusName(a.status || 'want')); }
    function ph(a) { return h('div.ac-ph' + ((a.type || 'contest') === 'supporters' ? '.sup' : ''), h('small', A.typeName(a.type)), h('b', a.title || '')); }
    function img(src, a) { const im = h('img', { src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }); im.onerror = () => im.replaceWith(ph(a)); return im; }

    async function cardOf({ a, r }) {
      const src = await posterOf(a); const isRec = F.tab === 'rec';
      return h('article.ac-card' + (r.dday != null && r.dday < 0 ? '.gone' : ''), { tabindex: 0, role: 'button', 'aria-label': `${a.title} ${A.ddayText(r.dday)}`, onclick: () => detail(a, isRec), onkeydown: e => { if (e.key === 'Enter') detail(a, isRec); } },
        h('div.ac-poster', src ? img(src, a) : ph(a), dchip(r), a.goal ? h('span.ac-goal', ic('flag', 12), '팀 목표') : null),
        h('div.ac-b',
          h('div.ac-t', a.title || '(이름 없음)'),
          h('div.ac-sub', [A.typeName(a.type), a.host, a.due ? `${mmdd(a.due)} 마감` : ''].filter(Boolean).join(' · ')),
          h('div.chips', isRec ? h('span.chip' + (r.ok ? (r.pct >= 70 ? '.ok' : '.acc') : '.bad'), r.ok ? `맞음 ${r.pct}%` : '자격 안 맞음') : stchip(a), ...tagsOf(a, r, { max: 2 })),
          isRec ? h('div.ac-why', r.line) : null));
    }
    async function rowOf({ a, r }) {
      const src = await posterOf(a); const isRec = F.tab === 'rec';
      return h('button.ac-row' + (r.dday != null && r.dday < 0 ? '.gone' : ''), { type: 'button', onclick: () => detail(a, isRec) },
        h('span.ac-thumb', src ? img(src, a) : ic('image', 18)),
        h('span.ac-rb', h('b', a.title || '(이름 없음)'), h('small', [A.typeName(a.type), a.host, a.due ? `${mmdd(a.due)} 마감` : '', isRec ? r.line : ''].filter(Boolean).join(' · ')), h('span.chips', isRec ? h('span.chip' + (r.ok ? (r.pct >= 70 ? '.ok' : '.acc') : '.bad'), r.ok ? `맞음 ${r.pct}%` : '자격 안 맞음') : stchip(a), a.goal ? h('span.chip.acc', ic('flag', 12), '팀 목표') : null, ...tagsOf(a, r, { max: 3 }))),
        dchip(r));
    }

    // 자세히 보기
    async function detail(a0, isRec = false) {
      let a = a0; const t = today();
      const close = modal(a.title || '대외활동', c => { const wrap = h('div.ac-detail-m'); paint(); return wrap;
        async function paint() {
          if (!isRec) { const cur = await db.get(a.id); if (!cur || cur.deleted) return c(); a = cur; }
          const r = A.rank(a, prof, t); const src = await posterOf(a); clear(wrap);
          const info = (label, v) => v ? h('div.ac-info', h('span', label), h('b', v)) : null;
          const side = h('div.ac-side', src ? h('a.ac-big', { href: src, target: '_blank', rel: 'noopener', 'aria-label': '포스터 크게 보기' }, img(src, a)) : ph(a));
          const main = h('div.ac-main',
            h('div.chips', dchip(r), isRec ? null : stchip(a), ...tagsOf(a, r, { max: 6 })),
            h('div.ac-fit' + (r.ok ? '' : '.no'), h('b', r.ok ? `우리와 맞는 정도 ${r.pct}%` : '우리는 나가기 어려워요'), h('span', r.line)),
            h('div.ac-infos', info('종류', A.typeName(a.type)), info('주최', a.host), info('분야', a.field), info(a.start ? '접수' : '마감', a.start ? `${mmdd(a.start)} ~ ${a.due ? mmdd(a.due) : ''}` : a.due ? `${mmdd(a.due)} (${A.ddayText(r.dday)})` : ''), info('상금·혜택', a.prize), info('담당', a.owner), info('올린 사람', a.by)),
            a.body ? h('p.ac-body', a.body) : null,
            a.memo ? h('p.ac-body.memo', a.memo) : null);
          if (!isRec) {
            const stages = (a.stages || []).slice().sort((x, y) => (x.date || x.endDate || '9').localeCompare(y.date || y.endDate || '9'));
            main.append(h('div.ac-sec', h('h3', '단계'), stages.length ? h('ul.ac-steps', stages.map(s => { const how = A.stageCal(s); const d = [s.date ? mmdd(s.date) : '', s.endDate && s.endDate !== s.date ? mmdd(s.endDate) : ''].filter(Boolean).join(' ~ '); return h('li', h('b', A.stageName(s)), h('span', [d || '날짜 아직', s.time, s.place].filter(Boolean).join(' · ')), h('small', a.goal && how ? (how === 'task' ? '할 일에 들어감' : '캘린더에 들어감') : how ? '팀 목표로 등록하면 캘린더에' : '여기에만 적어 둠')); })) : h('p.faint.small', '서류 제출 기간, 면접, 발표 날짜를 “고치기”에서 적어 두면 같이 챙겨요.')));
            const mem = new Set((a.members || []).map(canon));
            const goalBox = h('div.ac-sec.ac-goalbox' + (a.goal ? '.on' : ''),
              h('div.row', { style: { justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' } }, h('div', h('h3', a.goal ? '팀 목표로 등록했어요' : '팀 목표로 등록하기'), h('p.faint.small', a.goal ? '제출과 면접 날짜가 나가는 사람 캘린더·할 일에 들어가 있어요.' : '등록하면 마감과 단계 날짜가 나가는 사람 캘린더·할 일에 자동으로 들어가요.')),
                h('button.btn' + (a.goal ? '' : '.pri'), { type: 'button', onclick: async e => { busy(e.currentTarget, true, '맞추는 중'); const next = await db.patch(a.id, { goal: !a.goal, status: !a.goal && (a.status || 'want') === 'want' ? 'prep' : a.status || 'want', team: a.team || await teamOf() }); const n = await A.syncLinks(next); toast(next.goal ? `팀 목표로 등록했어요. 캘린더·할 일 ${n}개를 넣었어요` : '팀 목표에서 뺐어요. 넣어 둔 일정도 거뒀어요'); paint(); } }, a.goal ? '등록 풀기' : '등록')),
              roster.length > 1 ? h('div.ac-members', h('span.lbl', '나가는 사람'), h('div.chips', h('button.chip.ac-pick' + (!mem.size ? '.acc' : ''), { type: 'button', 'aria-pressed': String(!mem.size), onclick: () => setMembers([]) }, '팀 전체'), roster.map(nm => h('button.chip.ac-pick' + (mem.has(canon(nm)) ? '.acc' : ''), { type: 'button', 'aria-pressed': String(mem.has(canon(nm))), onclick: () => { const s = new Set(mem); s.has(canon(nm)) ? s.delete(canon(nm)) : s.add(canon(nm)); setMembers([...s]); } }, face(nm), nm)))) : null);
            main.append(goalBox);
            const muted = (a.mute || []).includes(me);
            main.append(h('div.ac-sec', h('h3', '진행 상태'), h('div.chips.ac-status', A.STATUS.map(([v, l]) => h('button.chip.ac-pick' + ((a.status || 'want') === v ? '.acc' : ''), { type: 'button', 'aria-pressed': String((a.status || 'want') === v), onclick: async () => { const next = await db.patch(a.id, { status: v }); await A.syncLinks(next); if (v === 'sent') toast('제출 완료로 바꿨어요. 마감 알림은 이제 안 울려요'); paint(); } }, l))),
              h('label.chk.ac-mute', h('input', { type: 'checkbox', checked: muted, onchange: async e => { const s = new Set(a.mute || []); e.target.checked ? s.add(me) : s.delete(me); await db.patch(a.id, { mute: [...s] }); toast(e.target.checked ? '이 항목은 내 폰에서 안 울려요' : '다시 알려 드릴게요'); } }), '이 항목 알림은 나는 안 받기')));
          }
          const foot = h('div.modal-f');
          if (a.link) foot.append(h('a.btn', { href: a.link, target: '_blank', rel: 'noopener' }, ic('link', 14), '공고 열기'));
          if (isRec) foot.append(h('button.btn', { type: 'button', onclick: async () => { const hide = await db.kvGet('acts:hide', []); await db.kvSet('acts:hide', [...new Set([...hide, a.link])].slice(-400)); c(); toast('이건 다시 안 보여 드릴게요'); draw(); } }, '관심 없어요'),
            h('button.btn.pri', { type: 'button', onclick: async () => { const it = await keepRec(a); c(); F.tab = 'mine'; toast('담았어요. 나갈 거면 팀 목표로 등록해 보세요'); await draw(); detail(it); } }, ic('plus', 14), '담기'));
          else foot.append(h('button.btn', { type: 'button', onclick: async () => { if (!(await confirmBox(`“${a.title}”을(를) 지울까요? 캘린더에 넣어 둔 일정도 같이 지워요.`, '지우기'))) return; await A.syncLinks({ ...a, goal: false }); await db.remove(a.id); c(); toast('지웠어요'); draw(); } }, ic('trash', 14), '지우기'),
            h('button.btn.pri', { type: 'button', onclick: () => { c(); edit(a); } }, ic('edit', 14), '고치기'));
          wrap.append(h('div.ac-two', side, main), foot);
          async function setMembers(list) { const next = await db.patch(a.id, { members: list }); if (next.goal) await A.syncLinks(next); paint(); }
        }
      }, { wide: true, nofocus: true, onClose: () => draw() });
      return close;
    }
    async function keepRec(r) {
      const { id, source, date, ...rest } = r;
      return db.put('acts', { ...rest, srcId: id || '', src: source || '', status: 'want', stages: [], team: await teamOf(), by: await meName() });
    }

    // 링크로 담기: 미리보기에서 이름·포스터·설명을 가져오고, 글에서 마감·인원·자격을 읽어 채운 뒤 고치는 창을 띄워요
    function addByLink(url0 = '') {
      modal('링크로 담기', close => {
        const u = h('input.in', { type: 'url', placeholder: 'https://… 공고 주소', value: url0, 'aria-label': '공고 주소' });
        const txt = h('textarea.in', { rows: 5, placeholder: '공고 글을 같이 붙이면 마감·인원·자격을 더 정확히 읽어요 (안 붙여도 돼요)', 'aria-label': '공고 글' });
        const go = h('button.btn.pri', { type: 'submit' }, '읽어 오기');
        return h('form.stack', { novalidate: '', onsubmit: async e => {
          e.preventDefault(); const url = u.value.trim(); if (!/^https?:\/\/\S+\.\S+/.test(url) && !txt.value.trim()) { toast('공고 주소나 글을 넣어 주세요'); u.focus(); return; }
          busy(go, true, '읽는 중'); let got;
          if (/^https?:/.test(url)) { try { got = await A.fromLink(url, txt.value); } catch { got = null; } }
          if (!got) got = { ...A.parse(txt.value), title: A.titleOf(txt.value), link: /^https?:/.test(url) ? url : '', body: txt.value.trim().slice(0, 600), posters: [] };
          const { read: ok, ...pre } = got; close(); if (/^https?:/.test(url) && !ok) toast('이 링크는 내용을 읽지 못했어요. 주소만 넣어 뒀으니 나머지를 적어 주세요');
          edit(pre, { read: true });
        } }, h('label.f', '공고 주소', u), h('label.f', '공고 글 (선택)', txt), h('p.faint.small', '읽어 온 내용은 바로 저장하지 않고, 고칠 수 있는 창으로 먼저 보여 드려요.'), h('div.modal-f', go));
      });
    }

    // 적기·고치기
    function edit(a, { read = false } = {}) {
      const isNew = !a.id; let stages = (a.stages || []).map(s => ({ ...s })); let poster = a.poster || '', posterKey = a.posterKey || ''; const cands = (a.posters || []).filter(Boolean);
      modal(isNew ? '대외활동 담기' : '대외활동 고치기', close => {
        const fields = [
          { k: 'type', label: '종류', type: 'select', options: A.TYPES, default: 'contest' },
          { k: 'title', label: '이름', req: true },
          { k: 'due', label: '마감', type: 'date' },
          { k: 'link', label: '공고 링크', type: 'url' },
          { k: 'body', label: '내용', type: 'textarea', rows: 3, placeholder: '무엇을 내는지, 공고 글을 그대로 붙여도 돼요' },
          { k: 'part', label: '참가 (개인·팀)', type: 'select', options: A.PART, default: '', more: true },
          { k: 'teamMin', label: '팀 최소 인원', type: 'number', inputmode: 'numeric', more: true },
          { k: 'teamMax', label: '팀 최대 인원', type: 'number', inputmode: 'numeric', more: true },
          { k: 'who', label: '대상', type: 'select', options: A.WHO, default: '', more: true },
          { k: 'whoNote', label: '대상 조건 (나이·학년 등)', more: true },
          { k: 'region', label: '지역 제한 (없으면 비워 두기)', placeholder: '예: 서울, 충북', more: true },
          { k: 'host', label: '주최', more: true },
          { k: 'prize', label: '상금·혜택', more: true },
          { k: 'start', label: '접수 시작', type: 'date', more: true },
          { k: 'field', label: '분야', placeholder: '예: 영상, 디자인', more: true },
          { k: 'status', label: '진행 상태', type: 'select', options: A.STATUS, default: 'want', more: true },
          { k: 'owner', label: '담당', more: true },
          { k: 'memo', label: '메모', type: 'textarea', rows: 2, more: true },
        ];
        // 포스터
        const pv = h('div.ac-pv'); const purl = h('input.in', { type: 'url', placeholder: '포스터 이미지 주소 (선택)', value: poster, 'aria-label': '포스터 이미지 주소', oninput: e => { poster = e.target.value.trim(); posterKey = ''; showP(); } });
        async function showP() { clear(pv); const src = posterKey ? await posterOf({ posterKey }) : poster; pv.append(src ? img(src, { title: '', type: 'contest' }) : h('span.faint.small', '포스터 없음')); }
        const up = h('button.btn.sm', { type: 'button', onclick: async () => { const f = await pickFile('image/*'); const file = [].concat(f || [])[0]; if (!file) return; busy(up, true, '올리는 중'); try { const small = await shrink(file); const pub = await (await import('../js/sync.js')).uploadImage(small).catch(() => null); if (pub) { poster = pub; posterKey = ''; purl.value = pub; } else { posterKey = await db.putBlob(small); poster = ''; purl.value = ''; toast('이 기기에만 담았어요. 로그인하면 팀과 같이 볼 수 있어요'); } } finally { busy(up, false); } showP(); } }, ic('upload', 14), '포스터 올리기');
        showP();
        /* 읽어 온 그림이 여럿이면 그중에 포스터를 고름 */
        const pick = cands.length > 1 ? h('div.ac-cands', cands.map(u => { const bt = h('button' + (u === poster ? '.on' : ''), { type: 'button', 'aria-label': '이 그림을 포스터로', onclick: () => { poster = u; posterKey = ''; purl.value = u; showP(); pick.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === bt)); } }, h('img', { src: u, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })); bt.firstChild.onerror = () => bt.remove(); return bt; })) : null;
        // 단계
        const stBox = h('div.ac-stages');
        function drawStages() {
          clear(stBox);
          stages.forEach((s, i) => stBox.append(h('div.ac-stage',
            h('select.in', { 'aria-label': '단계 종류', onchange: e => { s.kind = e.target.value; s.cal = undefined; drawStages(); } }, Object.entries(A.STAGES).map(([k, v]) => h('option', { value: k, selected: s.kind === k }, v[0]))),
            h('input.in', { type: 'date', value: s.date || '', 'aria-label': `${A.stageName(s)} 날짜`, onchange: e => { s.date = e.target.value; } }),
            A.STAGES[s.kind]?.[1] === 'task' || s.kind === 'ot' ? h('input.in', { type: 'date', value: s.endDate || '', 'aria-label': `${A.stageName(s)} 끝나는 날`, title: '끝나는 날', onchange: e => { s.endDate = e.target.value; } }) : h('input.in', { type: 'time', value: s.time || '', 'aria-label': `${A.stageName(s)} 시간`, onchange: e => { s.time = e.target.value; } }),
            h('label.chk', h('input', { type: 'checkbox', checked: !!A.stageCal(s), onchange: e => { s.cal = e.target.checked ? (A.STAGES[s.kind]?.[1] || 'day') : ''; } }), '캘린더에'),
            h('button.btn.sm.ghost.icon', { type: 'button', 'aria-label': `${A.stageName(s)} 지우기`, onclick: () => { stages.splice(i, 1); drawStages(); } }, ic('x', 14)))));
          stBox.append(h('button.btn.sm', { type: 'button', onclick: () => { const used = new Set(stages.map(s => s.kind)); const next = ['docs', 'r1', 'interview', 'final', 'ceremony'].find(k => !used.has(k)) || 'etc'; stages.push({ id: db.uid().slice(-6), kind: next, date: '' }); drawStages(); } }, ic('plus', 14), '단계 더하기'));
        }
        drawStages();
        const fill = h('button.btn.sm', { type: 'button', onclick: () => { const p = A.parse(`${f.inputs.title.value}\n${f.inputs.body.value}`); let n = 0; for (const [k, v] of Object.entries(p)) { const i = f.inputs[k]; if (!i || k === 'type' || String(i.value || '').trim()) continue; i.value = v; n++; } const g2 = f.querySelector('.more-g'); if (n && g2) { g2.classList.remove('hide'); f.querySelector('.more-f')?.remove(); } toast(n ? `글에서 ${n}칸을 채웠어요. 맞는지 봐 주세요` : '글에서 더 읽어 낼 게 없었어요'); } }, ic('sparkles', 14), '글에서 채우기');
        const extra = h('div.stack', h('div.ac-fillrow', fill, h('span.faint.small', '내용에 붙인 공고 글에서 마감·인원·자격을 읽어요')),
          h('div.ac-sec', h('h3', '포스터'), h('div.ac-prow', pv, h('div.stack', purl, up)), pick ? h('p.faint.small', '공고에서 가져온 그림이에요. 포스터를 골라 주세요.') : null, pick),
          h('div.ac-sec', h('h3', '단계'), h('p.faint.small', '서류 제출, 면접, 추가 서류처럼 챙겨야 하는 날짜를 적어요. 발대식·OT는 여기에만 적어 두고, 원하면 “캘린더에”를 켜요.'), stBox));
        const f = form(fields, { status: 'want', type: 'contest', ...a }, async v => {
          const lo = v.teamMin, hi = v.teamMax; if (lo && hi && lo > hi) { toast('팀 최소 인원이 최대 인원보다 커요'); return; }
          if (v.start && v.due && v.start > v.due) { toast('접수 시작이 마감보다 늦어요'); return; }
          const { posters: _c, ...keepA } = a; const rec = { ...(a.id ? keepA : {}), ...v, stages: stages.filter(s => s.kind), poster, posterKey, team: a.team || await teamOf(), by: a.by || await meName(), goal: !!a.goal, members: a.members || [], srcId: a.srcId || '', src: a.src || '' };
          const savedIt = await db.put('acts', rec); const n = await A.syncLinks(savedIt);
          close(); toast(isNew ? '담았어요' : n ? `고쳤어요. 캘린더·할 일 ${n}개도 맞췄어요` : '고쳤어요'); F.tab = 'mine'; await draw(); if (isNew) detail(savedIt);
        }, { submitLabel: isNew ? '담기' : '저장', extra });
        if (read) f.prepend(h('p.ac-read', '읽어 온 내용이에요. 틀린 데가 있으면 고친 뒤 담아 주세요.'));
        return f;
      }, { wide: true });
    }

    function editProfile() {
      modal('우리 팀 조건', close => form([
        { k: 'regions', label: '우리가 사는 곳 (쉼표로)', full: true, req: true },
        { k: 'size', label: '같이 나가는 인원', type: 'number', inputmode: 'numeric' },
        { k: 'univ', label: '대학생이 있어요', type: 'checkbox' },
        { k: 'likes', label: '더 보고 싶은 분야 (쉼표로)', full: true, placeholder: '예: 뷰티, 게임, 캐릭터' },
      ], { ...prof, regions: prof.regions.join(', ') }, async v => {
        const regions = String(v.regions).split(/[,\s·]+/).map(s => s.trim().replace(/(특별시|광역시|시)$/, '')).filter(Boolean).slice(0, 12);
        await A.saveProfile({ regions, size: Math.max(1, Math.min(20, v.size || 3)), univ: !!v.univ, likes: v.likes }); close(); toast('고쳤어요. 맞는 정도를 다시 계산했어요'); draw();
      }, { extra: h('p.faint.small', '지역 제한이 있는 공고는 여기 적힌 곳이면 “우리 가능”으로 보여요. 충주는 충북, 평택은 경기 공고도 같이 봐요.') }));
    }
  },
};

async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(res => c.toBlob(res, 'image/webp', 0.86)); return out && out.size < file.size ? out : file;
  } catch { return file; }
}
