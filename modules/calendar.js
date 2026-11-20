import { h, ic, clear, toast, head, seg, modal, form, todayStr, addDays, ymd, startOfWeek, fmtDate, colorFor, confirmBox, download, pickFile, wd, kindPair } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';
import * as LB from '../js/labels.js';
import * as G from '../js/gcal.js';
import * as SC from '../js/scope.js';
const evColor = e => LB.colorOf(e.label) || e.color || colorFor((e.title || '').replace(/^◆ /, ''));
let labF = '', scopeF = 'mine', peopleF = [];

let mode = matchMedia('(max-width:900px)').matches ? 'agenda' : 'month', cursor = new Date();
export default {
  async render(root, params) {
    if (params[0] === 'phone') setTimeout(() => gcalModal(), 400);   /* 알림 설정에서 넘어온 경우: 폰 캘린더 연결 창을 바로 엶 */
    else if (params[0]) cursor = new Date(params[0]);
    const body = h('div');
    const quick = h('input', { placeholder: '일정 바로 추가: "다음 주 수요일 2시~4시 홍대 촬영"', 'aria-label': '일정 추가', enterkeyhint: 'done' });
    const ctx = { people: await store.peopleNames().catch(() => []), projects: await store.projects().catch(() => []) };
    const addQuick = async () => {
      const v = quick.value.trim(); if (!v) return;
      quick.value = ''; /* 두 번 눌러도 한 번만 */
      const p = brain.interpret('일정: ' + v, ctx)[0];
      const noDate = !p.data.date;
      const ev = await db.put('events', { ...p.data, date: p.data.date || todayStr() });
      cursor = new Date(ev.date); toast(`${fmtDate(ev.date)} ${ev.start || '종일'} · ${ev.title}${noDate ? ' (날짜가 없어서 오늘로 넣었어요)' : ''}`, { label: '되돌리기', fn: async () => { await db.remove(ev.id); draw(); } }); draw();
      // 바로 넣어 두고, AI가 읽은 뒤 날짜·시간·사람이 다르면 조용히 고침
      import('../js/ai.js').then(AI => AI.polishSaved('event', v, p, ev, { patch: (id, a) => db.patch(id, a), add: d => db.put('events', d) })).then(async ch => { if (!ch) return; const now = await db.get(ev.id); toast(`AI가 다시 읽고 다듬었어요: ${fmtDate(now.date)} ${now.start || '종일'}`); if (location.hash.startsWith('#/calendar')) { cursor = new Date(now.date); draw(); } }).catch(() => { });
    };
    quick.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addQuick(); } });
    root.append(kindPair('event'), head('캘린더', '할 일도 마감 날짜에 체크 표시로 같이 보여요.',
      h('button.btn.sm.ghost', { onclick: importIcs, title: '구글·애플 캘린더에서 내보낸 .ics 파일 가져오기' }, ic('upload', 14), '.ics 가져오기'),
      h('button.btn.sm.ghost', { onclick: gcalModal, title: '폰 기본 캘린더와 위젯에 내 일정을 보이게 하고 알람을 받아요' }, ic('calendar', 14), '폰 캘린더·위젯'),
      h('button.btn.sm.pri', { onclick: () => edit({ date: ymd(cursor) }) }, ic('plus', 14), '일정')),
      h('div.quick', { style: { marginBottom: '14px' } }, ic('zap'), quick, h('button.btn.icon.ghost', { type: 'button', 'aria-label': '추가', onclick: addQuick }, ic('send'))), body);
    await draw();

    async function draw() {
      clear(body);
      const me = await db.kvGet('name', ''); const team = await store.teammateNames();
      const sc = e => SC.of(e, { team });
      // 내 일정 = 개인 일정 + 내가 낀 팀 업무 / 팀 업무 = 팀 전체 업무 일정
      const pass = e => scopeF === 'all' ? true : scopeF === 'work' ? sc(e) === 'work' : scopeF === 'personal' ? sc(e) === 'personal' : (sc(e) === 'personal' || SC.involves(e, me));
      // 사람: 나 + 팀원. 일정의 주인 = 만든 사람과 '누구랑'에 적힌 팀원 ('팀 전체'면 모두)
      const members = [me || '나', ...team]; const short = n => /^[가-힣]{3,4}$/.test(n) ? n.slice(1) : n;
      const owners = x => { const ppl = [x.who, x.attendees].filter(Boolean).join(' '); if (/팀\s*전체|전원|모두/.test(ppl)) return members; const o = new Set([x.by || members[0]]); for (const m of members) if (ppl.includes(m) || ppl.includes(short(m))) o.add(m); return [...o]; };
      const passP = x => !peopleF.length || owners(x).some(o => peopleF.includes(o));
      const events = (await db.list('events')).filter(pass).filter(passP).map(e => ({ ...e, _sc: sc(e) }));
      const tasks = (await db.list('tasks')).filter(t => t.due && !t.done).filter(t => scopeF === 'all' ? true : scopeF === 'work' ? sc(t) === 'work' : scopeF === 'personal' ? sc(t) === 'personal' : (sc(t) === 'personal' || !t.who || SC.involves({ who: t.who, by: t.by }, me))).filter(t => !peopleF.length || peopleF.some(n => (t.who || t.by || members[0]).includes(short(n))));
      const nav = h('div.row.between', { style: { marginBottom: '12px' } },
        h('div.row', h('button.btn.icon.ghost', { 'aria-label': '이전', onclick: () => move(-1) }, ic('left')), h('h2', { style: { minWidth: '150px', textAlign: 'center' } }, title()), h('button.btn.icon.ghost', { 'aria-label': '다음', onclick: () => move(1) }, ic('right')), h('button.btn.sm', { onclick: () => { cursor = new Date(); draw(); } }, '오늘')),
        seg([['month', '월'], ['week', '주'], ['agenda', '목록'], ['people', '사람별']], mode, v => { mode = v; draw(); }));
      if (members.length > 1) body.append(h('div.chips.cal-people', h('span.faint.tiny', '사람'), ...members.map(n => h('button.chip' + (peopleF.includes(n) ? '.acc' : ''), { onclick: () => { peopleF = peopleF.includes(n) ? peopleF.filter(x => x !== n) : [...peopleF, n]; draw(); } }, h('span.avatar.xs', { style: { background: colorFor(n) } }, n[0]), n === me ? n + ' (나)' : n)), peopleF.length ? h('button.chip', { onclick: () => { peopleF = []; draw(); } }, '모두 보기') : null));
      body.append(nav, h('div.row.between', { style: { marginBottom: '10px', gap: '8px', flexWrap: 'wrap' } }, seg([['mine', '내 일정'], ['work', '팀 업무'], ['personal', '개인만'], ['all', '전체']], scopeF, v => { scopeF = v; draw(); }), h('span.faint.tiny', { mine: '개인 일정과 내가 낀 팀 업무를 같이 봐요', work: '팀 전체가 보는 업무 일정이에요', personal: '나만 보는 일정이에요', all: '개인과 팀 업무 전부예요' }[scopeF])), h('div.labels', { style: { marginBottom: '10px' } }, [{ id: '', name: '전체', color: 'var(--line2)' }, ...LB.all()].map(l => h('button.lab' + (labF === l.id ? '.on' : ''), { style: { '--lc': l.color }, onclick: () => { labF = l.id; draw(); } }, h('i'), l.name))));
      const on = d => events.filter(e => (!labF || e.label === labF) && store.occursOn(e, d)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      if (mode === 'month') body.append(month(on, tasks));
      else if (mode === 'week') body.append(week(on));
      else if (mode === 'people') body.append(await byPeople(on, tasks, members, owners, short));
      else body.append(agenda(on, tasks));
    }
    function title() {
      if (mode === 'month') return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
      if (mode === 'week' || mode === 'people') { const s = startOfWeek(cursor); return `${s.getMonth() + 1}/${s.getDate()} – ${addDays(s, 6).getMonth() + 1}/${addDays(s, 6).getDate()}`; }
      return `${cursor.getMonth() + 1}월 ${cursor.getDate()}일부터`;
    }
    function move(n) {
      if (mode === 'people') { cursor = addDays(cursor, n * 7); return draw(); }
      if (mode === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
      else cursor = addDays(cursor, n * (mode === 'week' ? 7 : 14));
      draw();
    }
    // 사람별: 이번 주를 사람마다 접었다 폈다 하며 봄 (접은 상태는 기억)
    async function byPeople(on, tasks, members, owners, short) {
      const s = startOfWeek(cursor); const days = [...Array(7)].map((_, i) => ymd(addDays(s, i))); const fold = await db.kvGet('cal:fold', {});
      const wrap = h('div.stack');
      for (const n of members.filter(m => !peopleF.length || peopleF.includes(m))) {
        const evs = days.flatMap(d => on(d).filter(e => owners(e).includes(n)).map(e => ({ ...e, _d: d })));
        const tks = tasks.filter(t => days.includes(t.due) && (t.who ? t.who.includes(short(n)) : (t.by || members[0]) === n));
        const open = fold[n] !== true;
        const bodyEl = h('div.pp-body', days.map(d => { const de = evs.filter(e => e._d === d), dt = tks.filter(t => t.due === d); if (!de.length && !dt.length) return null; return h('div.pp-day', h('div.pp-d' + (d === todayStr() ? '.today' : ''), fmtDate(d)), h('div.list', de.map(e => evRow(e)), dt.map(t => h('div.li', ic('check2', 16), h('div.grow', h('div.small', t.title), h('div.faint.tiny', '마감' + (t.handoffs?.length ? ' · ' + t.handoffs[t.handoffs.length - 1].from + '에게서 넘겨받음' : '')))))));
        }), !evs.length && !tks.length ? h('div.faint.small', { style: { padding: '4px 2px 10px' } }, '이번 주에 잡힌 게 없어요') : null);
        const head = h('button.pp-h', { 'aria-expanded': String(open), onclick: async () => { const now = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(now)); sec.classList.toggle('open', now); const f = await db.kvGet('cal:fold', {}); f[n] = !now; await db.kvSet('cal:fold', f); } },
          h('span.avatar', { style: { background: colorFor(n) } }, n[0]), h('b.grow', n), h('span.chip', `일정 ${evs.length}`), h('span.chip', `할 일 ${tks.length}`), ic('down', 14));
        const sec = h('div.card.pp' + (open ? '.open' : ''), head, h('div.pp-wrap', bodyEl)); wrap.append(sec);
      }
      return wrap;
    }
    function month(on, tasks) {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = startOfWeek(first);
      const g = h('div.cal');
      ['월', '화', '수', '목', '금', '토', '일'].forEach(d => g.append(h('div.dh', d)));
      for (let i = 0; i < 42; i++) {
        const d = addDays(start, i), ds = ymd(d);
        if (i === 35 && d.getMonth() !== cursor.getMonth()) break;
        const evs = on(ds), tk = tasks.filter(t => t.due === ds);
        const cell = h('div.d' + (d.getMonth() !== cursor.getMonth() ? '.out' : '') + (ds === todayStr() ? '.today' : ''), { onclick: () => dayModal(ds, on) },
          h('div.row.between', h('span.n', d.getDate()), tk.length ? h('span.tiny.faint', `✓${tk.length}`) : null),
          evs.slice(0, 3).map(e => h('div.ev' + (e._sc === 'personal' ? '.mine' : ''), { style: { background: evColor(e), '--ec': evColor(e) }, title: SC.LABEL[e._sc] }, (e.start ? e.start + ' ' : '') + e.title)),
          evs.length > 3 ? h('div.tiny.faint', `+${evs.length - 3}`) : null);
        g.append(cell);
      }
      return h('div.card.pad0', { style: { overflow: 'hidden' } }, g);
    }
    function week(on) {
      const s = startOfWeek(cursor);
      const H0 = 7, H1 = 24, PX = 44;
      const g = h('div.week');
      g.append(h('div'));
      for (let i = 0; i < 7; i++) { const d = addDays(s, i); g.append(h('div.wh' + (ymd(d) === todayStr() ? '.today' : ''), `${wd(d)} ${d.getDate()}`)); }
      const hours = h('div'); for (let hh = H0; hh < H1; hh++) hours.append(h('div.hr', String(hh).padStart(2, '0')));
      g.append(hours);
      for (let i = 0; i < 7; i++) {
        const ds = ymd(addDays(s, i));
        const col = h('div.col', { onclick: e => { if (e.target !== col) return; const y = e.offsetY; const hh = Math.floor(y / PX) + H0; edit({ date: ds, start: `${String(hh).padStart(2, '0')}:00`, end: `${String(Math.min(23, hh + 1)).padStart(2, '0')}:00` }); } });
        for (let hh = H0; hh < H1; hh++) col.append(h('div.hr', { style: { pointerEvents: 'none' } }));
        for (const e of on(ds)) {
          if (!e.start) { col.prepend(h('div.blk', { style: { top: '0', height: '18px', background: evColor(e), opacity: .8 }, onclick: () => edit(e) }, e.title)); continue; }
          const [a, b] = [e.start, e.end || store.addMins(e.start, 60)].map(t => { const [x, y] = t.split(':').map(Number); return x + y / 60; });
          col.append(h('div.blk', { style: { top: ((a - H0) * PX) + 'px', height: Math.max(20, (b - a) * PX - 2) + 'px', background: e.kind === 'focus' ? 'var(--ink2)' : evColor(e), '--ec': evColor(e) }, class: 'blk' + (e._sc === 'personal' ? ' mine' : ''), onclick: () => edit(e) }, h('b', e.start), ' ', e.title));
        }
        if (ds === todayStr()) { const n = new Date(); const y = (n.getHours() + n.getMinutes() / 60 - H0) * PX; if (y > 0) col.append(h('div.nowline', { style: { top: y + 'px' } })); }
        g.append(col);
      }
      return h('div.card.pad0', { style: { overflow: 'auto', maxHeight: '72vh' } }, g);
    }
    function agenda(on, tasks) {
      const wrap = h('div.stack');
      let any = false;
      for (let i = 0; i < 21; i++) {
        const d = addDays(cursor, i), ds = ymd(d);
        const evs = on(ds), tk = tasks.filter(t => t.due === ds);
        if (!evs.length && !tk.length && ds !== todayStr()) continue;
        any = true;
        wrap.append(h('div.card', h('div.card-h', h('h3', ds === todayStr() ? h('span.chip.acc', '오늘') : null, fmtDate(ds)), h('button.btn.sm.ghost', { 'aria-label': `${fmtDate(ds)} 일정 추가`, onclick: () => edit({ date: ds }) }, ic('plus', 14))),
          evs.length || tk.length ? h('div.list', evs.map(e => evRow(e)), tk.map(t => h('div.li', ic('check2', 16), h('div.grow', h('div.small', t.title), h('div.faint.tiny', '마감'))))) : h('div.faint.small', '일정 없음')));
      }
      if (!any) wrap.append(h('div.card', h('div.empty', '앞으로 3주간 일정이 없어요')));
      return wrap;
    }
    function evRow(e, before) {
      return h('div.li.click', { onclick: () => { before && before(); edit(e); } }, h('span.dot', { style: { background: evColor(e) } }),
        h('div.mono.small', { style: { width: '92px' } }, e.start ? `${e.start}${e.end ? '–' + e.end : ''}` : '종일'),
        h('div.grow', h('div.t.small', e.title), e.place || e.who ? h('div.faint.tiny', [e.place, e.who && (w => w + (((w.charCodeAt(w.length - 1) - 0xAC00) % 28) > 0 && /[가-힣]$/.test(w) ? '과' : '와') + ' 함께')(e.who)].filter(Boolean).join(' · ')) : null), h('span.chip.tiny' + (e._sc === 'personal' ? '' : '.acc'), SC.LABEL[e._sc || 'work']), e.repeat ? ic('refresh', 14) : null);
    }
    async function dayModal(ds, on) {
      const slots = await store.freeSlots(ds);
      modal(fmtDate(ds), close => h('div',
        on(ds).length ? h('div.list', on(ds).map(e => evRow(e, close))) : h('p.faint', '일정이 없어요'),
        slots.length ? h('div', { style: { marginTop: '12px' } }, h('div.small', { style: { fontWeight: 650 } }, '비는 시간'), h('div.chips', { style: { marginTop: '6px' } }, slots.map(s => h('button.chip', { onclick: () => { close(); edit({ date: ds, start: s.start, end: store.addMins(s.start, 60) }); } }, `${s.start}–${s.end}`)))) : null,
        h('div.modal-f', h('button.btn.pri', { onclick: () => { close(); edit({ date: ds }); } }, ic('plus', 14), '일정 추가'))));
    }
    function edit(e = {}) {
      modal(e.id ? '일정 고치기' : '새 일정', close => {
        const f = form(FIELDS.event, e, async v => { const ch = await store.changedSince(e); if (ch && !await confirmBox(`창을 연 사이에 ${ch.cur.by && ch.cur.by !== e.by ? ch.cur.by + ' 님이' : '다른 곳에서'} 이 일정을 고쳤어요. 내 내용으로 저장할까요?`, '내 내용으로 저장')) return; const saved = await db.put('events', { ...(ch ? ch.cur : e), ...v }); close(); if (saved.date) cursor = new Date(saved.date); draw(); toast(`${e.id ? '고쳤어요' : '넣었어요'} · ${fmtDate(saved.date)} ${saved.start || '종일'} ${saved.title}`); });
        if (e.id && e.date) f.querySelector('.modal-f').prepend(h('a.btn.ghost', { href: G.addUrl(e), target: '_blank', rel: 'noopener', title: '구글 캘린더에 이 일정을 넣어요 (구글 알림이 울려요)' }, ic('calendar', 14), '구글에 추가'));
        if (e.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (e.repeat && !await confirmBox('반복 일정이에요. 앞으로의 반복까지 모두 지울까요?', '모두 지우기')) return; await db.remove(e.id); close(); draw(); toast(`지웠어요 · ${e.title}`, { label: '되돌리기', fn: async () => { await db.put('events', { ...e, deleted: false }); draw(); } }); } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function exportIcs() { download('hajin-calendar.ics', await G.ics(), 'text/calendar'); }
    async function gcalModal() {
      modal('폰 캘린더·위젯에 연결', close => {
        const box = h('div.gcal');
        const paint = async () => {
          const st = await G.state(); clear(box);
          box.append(h('p.small.faint', '폰에 원래 있는 캘린더 앱이 내 일정을 가져가요. 그러면 홈 화면의 캘린더 위젯에 일정이 보이고, 앱을 닫아 둬도 폰 알람이 울려요. 무료예요.'));
          const sw = h('button.switch' + (st.on ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!st.on), 'aria-label': '구독 주소 켜기', onclick: async () => { sw.disabled = true; try { if (st.on) await G.off(); else await G.publish(true); } catch (e) { toast(e.message); } paint(); } });
          box.append(h('div.gcal-row', h('div.grow', h('b', '자동 연동 (구독)'), h('div.faint.tiny', st.on ? `마지막으로 보낸 때 ${fmtDate(st.at, { time: true })}. 일정을 고치면 알아서 다시 보내요.` : '한 번만 연결해 두면 새 일정도 알아서 넘어가요.')), sw));
          if (st.on) {
            const inp = h('input.in', { readOnly: true, value: st.url, 'aria-label': '구독 주소', onfocus: e => e.target.select() });
            box.append(h('div.gcal-url', inp, h('button.btn.sm', { onclick: async () => { try { await navigator.clipboard.writeText(st.url); toast('주소를 복사했어요'); } catch { inp.select(); } } }, ic('copy', 14), '복사')),
              h('div.gcal-go', h('a.btn.pri', { href: G.appleUrl(st.url) }, ic('calendar', 14), '아이폰·아이패드 캘린더에 연결'), h('a.btn', { href: G.subscribeUrl(st.url), target: '_blank', rel: 'noopener' }, ic('calendar', 14), '구글 캘린더에 연결 (안드로이드)')),
              h('label.gcal-row', { style: { marginTop: '10px' } }, h('span.grow.small', '마감 있는 할 일도 함께 보내기'), h('input', { type: 'checkbox', checked: st.tasks !== false, onchange: async e => { await db.kvSet('gcal', { ...st, tasks: e.target.checked }); await G.publish().catch(x => toast(x.message)); paint(); } })),
              h('div.gcal-wd', h('b', ic('grid', 15), '아이폰·아이패드 홈 화면 전용 위젯'), h('p.small.faint', '오늘·내일 일정과 마감만 크게 보여 주는 하진 비서 위젯이에요. 무료 앱 Scriptable이 대신 그려 줘요. 15분쯤마다 새로 고쳐져요.'),
                h('ol.gcal-steps', h('li', '앱스토어에서 ', h('b', 'Scriptable'), '을 받아요 (무료).'), h('li', '아래 단추로 위젯 코드를 복사해요.'), h('li', 'Scriptable을 열고 오른쪽 위 ', h('b', '+'), '를 눌러 붙여 넣은 뒤, 이름을 "하진 비서"로 바꾸고 완료를 눌러요.'), h('li', '홈 화면을 길게 눌러 ', h('b', '+ › Scriptable'), ' 위젯을 올리고, 위젯을 길게 눌러 ', h('b', '위젯 편집 › Script'), '에서 "하진 비서"를 골라요.')),
                h('button.btn', { type: 'button', onclick: async () => { const W = await import('../js/widget.js'); const code = W.script(st.url, location.origin + location.pathname); try { await navigator.clipboard.writeText(code); toast('위젯 코드를 복사했어요. Scriptable에 붙여 넣어 주세요.'); } catch { download('hajin-widget.js', code, 'text/javascript'); toast('복사가 안 돼서 파일로 내려받았어요.'); } } }, ic('copy', 14), '위젯 코드 복사'),
                h('p.tiny.faint', '코드 안에 내 일정 주소가 들어 있어요. 다른 사람에게 보내지 마세요. 안드로이드는 구글 캘린더 위젯을 써 주세요.')),
              h('ul.gcal-note', h('li', h('b', '아이폰·아이패드: '), '구독 창에서 "알림 제거"를 꺼야 알람이 울려요. 연결한 뒤 홈 화면을 길게 눌러 캘린더 위젯을 올리면 일정이 보여요.'), h('li', h('b', '안드로이드: '), '구글 캘린더에 연결한 뒤, 그 캘린더의 "일정 알림"을 한 번 정해 두면 모든 일정에 울려요. 홈 화면에 구글 캘린더 위젯을 올리면 일정이 보여요.'), h('li', '폰 캘린더가 새 일정을 가져가는 간격은 애플·구글이 정해요. 아이폰은 보통 한 시간 안, 구글은 몇 시간에서 길면 하루예요. 급한 알림은 이 앱의 알림(설정 › 알림)이 더 빨라요.'), h('li', '주소를 아는 사람은 일정을 볼 수 있어요. 끄면 주소가 사라져요.')));
          }
          box.append(h('div.gcal-row', { style: { marginTop: '14px' } }, h('div.grow', h('b', '급한 일정은 바로 넣기'), h('div.faint.tiny', '일정을 열고 "구글에 추가"를 누르면 그 일정만 바로 들어가요.'))),
            h('div.row', { style: { marginTop: '10px', gap: '8px', flexWrap: 'wrap' } }, h('button.btn.sm.ghost', { onclick: exportIcs }, ic('download', 14), '파일로 내보내기 (.ics)'), h('button.btn.sm.ghost', { onclick: () => { close(); importIcs(); } }, ic('upload', 14), '구글 일정 가져오기')));
        };
        paint(); return box;
      });
    }
    async function importIcs() {
      const f = await pickFile('.ics,text/calendar'); if (!f) return;
      const txt = (await f.text()).replace(/\r?\n[ \t]/g, '');
      let n = 0;
      for (const blk of txt.split('BEGIN:VEVENT').slice(1)) {
        const g = k => (blk.match(new RegExp('^' + k + '(?:;[^:]*)?:(.*)$', 'm')) || [])[1]?.trim();
        const ds = g('DTSTART'); if (!ds) continue;
        const de = g('DTEND');
        const toLocal = s => { if (/Z$/.test(s)) { const d = new Date(s.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')); return [ymd(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`]; } return [`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, s.length > 8 ? `${s.slice(9, 11)}:${s.slice(11, 13)}` : '']; };
        const [date, start] = toLocal(ds); const [, end] = de ? toLocal(de) : ['', ''];
        const uidv = g('UID');
        await db.put('events', { id: uidv ? 'ics-' + uidv.replace(/[^\w-]/g, '').slice(0, 40) : undefined, title: (g('SUMMARY') || '일정').replace(/\\([,;])/g, '$1'), date, start, end: start ? end : '', place: g('LOCATION') || '', memo: (g('DESCRIPTION') || '').replace(/\\n/g, '\n').slice(0, 500) });
        n++;
      }
      toast(`${n}개 일정을 가져왔어요`); draw();
    }
  },
};
