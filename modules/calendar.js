import { h, ic, clear, toast, head, seg, modal, form, todayStr, addDays, ymd, startOfWeek, fmtDate, colorFor, confirmBox, download, pickFile, wd } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';
import * as LB from '../js/labels.js';
import * as G from '../js/gcal.js';
const evColor = e => LB.colorOf(e.label) || e.color || colorFor((e.title || '').replace(/^◆ /, ''));
let labF = '';

let mode = matchMedia('(max-width:900px)').matches ? 'agenda' : 'month', cursor = new Date();
export default {
  async render(root, params) {
    if (params[0]) cursor = new Date(params[0]);
    const body = h('div');
    const quick = h('input', { placeholder: '일정 바로 추가: "다음 주 수요일 2시~4시 홍대 촬영"', 'aria-label': '일정 추가' });
    quick.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || e.isComposing || !quick.value.trim()) return;
      const p = brain.interpret('일정: ' + quick.value.trim())[0];
      const ev = await db.put('events', p.data);
      quick.value = ''; cursor = new Date(ev.date); toast(`${fmtDate(ev.date)} ${ev.start || '종일'} 추가`); draw();
    });
    root.append(head('캘린더', null,
      h('button.btn.sm.ghost', { onclick: importIcs, title: '구글·애플 캘린더에서 내보낸 .ics 파일 가져오기' }, ic('upload', 14), '.ics 가져오기'),
      h('button.btn.sm.ghost', { onclick: gcalModal, title: '구글 캘린더에서 알림 받기' }, ic('calendar', 14), '구글 캘린더'),
      h('button.btn.sm.pri', { onclick: () => edit({ date: ymd(cursor) }) }, ic('plus', 14), '일정')),
      h('div.quick', { style: { marginBottom: '14px' } }, ic('zap'), quick), body);
    await draw();

    async function draw() {
      clear(body);
      const events = await db.list('events');
      const tasks = (await db.list('tasks')).filter(t => t.due && !t.done);
      const nav = h('div.row.between', { style: { marginBottom: '12px' } },
        h('div.row', h('button.btn.icon.ghost', { 'aria-label': '이전', onclick: () => move(-1) }, ic('left')), h('h2', { style: { minWidth: '150px', textAlign: 'center' } }, title()), h('button.btn.icon.ghost', { 'aria-label': '다음', onclick: () => move(1) }, ic('right')), h('button.btn.sm', { onclick: () => { cursor = new Date(); draw(); } }, '오늘')),
        seg([['month', '월'], ['week', '주'], ['agenda', '목록']], mode, v => { mode = v; draw(); }));
      body.append(nav, h('div.labels', { style: { marginBottom: '10px' } }, [{ id: '', name: '전체', color: 'var(--line2)' }, ...LB.all()].map(l => h('button.lab' + (labF === l.id ? '.on' : ''), { style: { '--lc': l.color }, onclick: () => { labF = l.id; draw(); } }, h('i'), l.name))));
      const on = d => events.filter(e => (!labF || e.label === labF) && (e.date === d || store.repeatsOn(e, d))).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      if (mode === 'month') body.append(month(on, tasks));
      else if (mode === 'week') body.append(week(on));
      else body.append(agenda(on, tasks));
    }
    function title() {
      if (mode === 'month') return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
      if (mode === 'week') { const s = startOfWeek(cursor); return `${s.getMonth() + 1}/${s.getDate()} – ${addDays(s, 6).getMonth() + 1}/${addDays(s, 6).getDate()}`; }
      return `${cursor.getMonth() + 1}월 ${cursor.getDate()}일부터`;
    }
    function move(n) {
      if (mode === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
      else cursor = addDays(cursor, n * (mode === 'week' ? 7 : 14));
      draw();
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
          evs.slice(0, 3).map(e => h('div.ev', { style: { background: evColor(e) } }, (e.start ? e.start + ' ' : '') + e.title)),
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
          col.append(h('div.blk', { style: { top: ((a - H0) * PX) + 'px', height: Math.max(20, (b - a) * PX - 2) + 'px', background: e.kind === 'focus' ? 'var(--ink2)' : evColor(e) }, onclick: () => edit(e) }, h('b', e.start), ' ', e.title));
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
        wrap.append(h('div.card', h('div.card-h', h('h3', ds === todayStr() ? h('span.chip.acc', '오늘') : null, fmtDate(ds)), h('button.btn.sm.ghost', { onclick: () => edit({ date: ds }) }, ic('plus', 14))),
          evs.length || tk.length ? h('div.list', evs.map(e => evRow(e)), tk.map(t => h('div.li', ic('check2', 16), h('div.grow', h('div.small', t.title), h('div.faint.tiny', '마감'))))) : h('div.faint.small', '일정 없음')));
      }
      if (!any) wrap.append(h('div.card', h('div.empty', '앞으로 3주간 일정이 없어요')));
      return wrap;
    }
    function evRow(e) {
      return h('div.li.click', { onclick: () => edit(e) }, h('span.dot', { style: { background: evColor(e) } }),
        h('div.mono.small', { style: { width: '92px' } }, e.start ? `${e.start}${e.end ? '–' + e.end : ''}` : '종일'),
        h('div.grow', h('div.t.small', e.title), e.place ? h('div.faint.tiny', e.place) : null), e.repeat ? ic('refresh', 14) : null);
    }
    async function dayModal(ds, on) {
      const slots = await store.freeSlots(ds);
      modal(fmtDate(ds), close => h('div',
        on(ds).length ? h('div.list', on(ds).map(e => { const r = evRow(e); r.onclick = () => { close(); edit(e); }; return r; })) : h('p.faint', '일정이 없어요'),
        slots.length ? h('div', { style: { marginTop: '12px' } }, h('div.small', { style: { fontWeight: 650 } }, '비는 시간'), h('div.chips', { style: { marginTop: '6px' } }, slots.map(s => h('button.chip', { onclick: () => { close(); edit({ date: ds, start: s.start, end: store.addMins(s.start, 60) }); } }, `${s.start}–${s.end}`)))) : null,
        h('div.modal-f', h('button.btn.pri', { onclick: () => { close(); edit({ date: ds }); } }, ic('plus', 14), '일정 추가'))));
    }
    function edit(e = {}) {
      modal(e.id ? '일정 고치기' : '새 일정', close => {
        const f = form(FIELDS.event, e, async v => { await db.put('events', { ...e, ...v }); close(); draw(); });
        if (e.id && e.date) f.querySelector('.modal-f').prepend(h('a.btn.ghost', { href: G.addUrl(e), target: '_blank', rel: 'noopener', title: '구글 캘린더에 이 일정을 넣어요 (구글 알림이 울려요)' }, ic('calendar', 14), '구글에 추가'));
        if (e.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('이 일정을 지울까요?', '지우기')) { await db.remove(e.id); close(); draw(); } } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function exportIcs() { download('hajin-calendar.ics', await G.ics(), 'text/calendar'); }
    async function gcalModal() {
      modal('구글 캘린더 연동', close => {
        const box = h('div.gcal');
        const paint = async () => {
          const st = await G.state(); clear(box);
          box.append(h('p.small.faint', '구글 캘린더가 내 일정을 가져가서, 폰의 구글 캘린더 알림으로 울리게 해요. 구글 로그인이나 비용은 필요 없어요.'));
          const sw = h('button.switch' + (st.on ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!st.on), 'aria-label': '구독 주소 켜기', onclick: async () => { sw.disabled = true; try { if (st.on) await G.off(); else await G.publish(true); } catch (e) { toast(e.message); } paint(); } });
          box.append(h('div.gcal-row', h('div.grow', h('b', '자동 연동 (구독)'), h('div.faint.tiny', st.on ? `마지막으로 보낸 때 ${fmtDate(st.at, { time: true })}. 일정을 고치면 알아서 다시 보내요.` : '한 번만 연결해 두면 새 일정도 알아서 넘어가요.')), sw));
          if (st.on) {
            const inp = h('input.in', { readOnly: true, value: st.url, 'aria-label': '구독 주소', onfocus: e => e.target.select() });
            box.append(h('div.gcal-url', inp, h('button.btn.sm', { onclick: async () => { try { await navigator.clipboard.writeText(st.url); toast('주소를 복사했어요'); } catch { inp.select(); } } }, ic('copy', 14), '복사')),
              h('a.btn.pri', { href: G.subscribeUrl(st.url), target: '_blank', rel: 'noopener', style: { marginTop: '8px' } }, ic('calendar', 14), '구글 캘린더에 연결하기'),
              h('label.gcal-row', { style: { marginTop: '10px' } }, h('span.grow.small', '마감 있는 할 일도 함께 보내기'), h('input', { type: 'checkbox', checked: st.tasks !== false, onchange: async e => { await db.kvSet('gcal', { ...st, tasks: e.target.checked }); await G.publish().catch(x => toast(x.message)); paint(); } })),
              h('ul.gcal-note', h('li', '구글이 이 주소를 다시 읽는 간격은 구글이 정해요. 보통 몇 시간, 길면 하루예요.'), h('li', '알림 시간은 구글 캘린더에서 이 캘린더의 "일정 알림"을 한 번 정해 두면 모든 일정에 적용돼요.'), h('li', '주소를 아는 사람은 일정을 볼 수 있어요. 끄면 주소가 사라져요.')));
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
