// 알림 설정 화면 조각: 설정의 "알림"과 오늘 화면의 종 모양에서 같이 씀
import { h, ic, clear, toast, modal } from './ui.js';
import * as A from './alarm.js';
import * as P from './push.js';
import * as Install from './install.js';

const LEADS = [[0, '정각'], [5, '5분 전'], [10, '10분 전'], [15, '15분 전'], [30, '30분 전'], [60, '1시간 전']];
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayWord = (d, now = new Date()) => { const a = new Date(d); a.setHours(0, 0, 0, 0); const b = new Date(now); b.setHours(0, 0, 0, 0); const n = Math.round((a - b) / 864e5); return n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : `${d.getMonth() + 1}/${d.getDate()}`; };

export function panel() {
  const box = h('div.alarm-set');
  let busy = false, turn = 0;
  const draw = async () => {
    const my = ++turn;
    const cfg = await A.get(), ps = await P.status(), w = Install.where(), perm = A.perm(), up = cfg.on ? await A.upcoming(5) : [];
    if (my !== turn) return;   /* 그리는 사이에 또 바뀌었으면 나중 것만 그림 */
    const sw = (on, label, fn) => h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: fn });
    const row = (icon, title, sub, ctl) => h('div.as-row', ic(icon, 18), h('div.grow', h('b', title), sub ? h('small', sub) : null), ctl);
    const time = (v, key) => h('input.in.as-time', { type: 'time', value: v, 'aria-label': '시각', onchange: async e => { if (e.target.value) { await A.set({ [key]: e.target.value }); draw(); } } });
    clear(box);

    /* 1) 이 기기에서 알림이 울릴 수 있는지 */
    const state = h('div.as-state');
    if (perm === 'none' || (w.ios && !w.installed)) {
      state.append(h('span.chip.warn', ic('bell', 14), w.ios ? '설치한 앱에서만 알림이 와요' : '이 브라우저는 알림이 안 돼요'), w.ios || w.android ? h('button.btn.sm.pri', { type: 'button', onclick: () => Install.guide() }, '홈 화면에 설치하기') : null);
    } else if (perm === 'denied') {
      state.append(h('span.chip.bad', ic('bell', 14), '알림이 막혀 있어요'), h('small.faint', w.ios ? '아이폰 설정 › 알림 › 소머스튜디오에서 허용해 주세요.' : w.android ? '폰 설정 › 애플리케이션 › 소머스튜디오(없으면 Chrome) › 알림에서 허용해 주세요.' : '주소창의 자물쇠 › 알림에서 허용해 주세요.'));
    } else if (ps.on) {
      state.append(h('span.chip.ok', ic('check', 14), '앱을 닫아도 알림이 와요'), h('button.btn.sm.ghost', { type: 'button', onclick: async () => { await P.disable(); toast('이 기기의 닫힌 앱 알림을 껐어요'); draw(); } }, '끄기'));
    } else {
      state.append(h('span.chip' + (perm === 'granted' ? '.acc' : ''), ic('bell', 14), perm === 'granted' ? '앱을 켜 둔 동안만 울려요' : '알림이 꺼져 있어요'),
        h('button.btn.sm.pri', { type: 'button', disabled: busy, onclick: async () => {
          if (busy) return; busy = true;
          try { if (ps.signedIn) { await P.enable(); toast('이제 앱을 닫아도 알림이 와요'); } else { const r = await A.ask(); toast(r === 'granted' ? '알림을 켰어요. 멤버 코드로 로그인하면 앱을 닫아도 와요.' : '알림이 막혀 있어요. 폰 설정에서 허용해 주세요.'); } }
          catch (e) { toast(e.message); }
          busy = false; draw();
        } }, ps.signedIn ? '앱을 닫아도 알림 받기' : '알림 켜기'));
      if (!ps.signedIn && perm === 'granted') state.append(h('small.faint', '멤버 코드로 로그인하면 앱을 닫아도 알림이 와요.'));
    }
    box.append(state);

    /* 2) 무엇을 알릴지 */
    box.append(row('bell', '알림 받기', '끄면 아래 알림이 모두 멈춰요.', sw(cfg.on, '알림 받기', async () => { await A.set({ on: !cfg.on }); draw(); })));
    if (cfg.on) {
      const lead = h('select.in.as-sel', { 'aria-label': '일정 알림 시간', onchange: async e => { await A.set({ lead: Number(e.target.value) }); draw(); } }, LEADS.map(([v, l]) => h('option', { value: v, selected: Number(cfg.lead) === v }, l)));
      box.append(
        row('calendar', '일정 시작 전', '일정마다 따로 정한 시간이 있으면 그걸 따라요.', lead),
        row('check2', '오늘 마감인 할 일', cfg.tasks ? null : '꺼짐', h('div.as-ctl', cfg.tasks ? time(cfg.taskAt, 'taskAt') : null, sw(cfg.tasks, '오늘 마감 알림', async () => { await A.set({ tasks: !cfg.tasks }); draw(); }))),
        row('flag', '내일 마감 미리 알림', cfg.eve ? null : '꺼짐', h('div.as-ctl', cfg.eve ? time(cfg.eveAt, 'eveAt') : null, sw(cfg.eve, '내일 마감 알림', async () => { await A.set({ eve: !cfg.eve }); draw(); }))),
        row('sun', '아침 브리핑', cfg.brief ? '오늘 일정과 마감을 한 번에 알려요.' : '꺼짐', h('div.as-ctl', cfg.brief ? time(cfg.briefAt, 'briefAt') : null, sw(cfg.brief, '아침 브리핑', async () => { await A.set({ brief: !cfg.brief }); draw(); }))),
        'setAppBadge' in navigator ? row('hash', '앱 아이콘에 숫자', '오늘 남은 일정과 할 일 개수를 아이콘에 보여요.', sw(cfg.badge, '앱 아이콘 숫자', async () => { await A.set({ badge: !cfg.badge }); A.badge(); draw(); })) : null);

      /* 3) 곧 울릴 알림 */
      box.append(h('div.as-h', '곧 울릴 알림'));
      if (!up.length) box.append(h('p.faint.small', '사흘 안에 울릴 알림이 없어요. 시간이 있는 일정이나 마감 있는 할 일을 적으면 여기 보여요.'));
      else box.append(h('div.as-list', up.map(a => h('div.as-item', h('span.as-when', h('b', hm(a.at)), h('small', dayWord(a.at))), h('div.grow', h('b', a.title), a.body ? h('small', a.body) : null)))));
    }
    box.append(h('a.as-row.as-link', { href: '#/calendar/phone' }, ic('calendar', 18), h('div.grow', h('b', '폰 캘린더·위젯에 연결'), h('small', '홈 화면 캘린더 위젯에 일정이 보이고, 폰 알람이 울려요.')), ic('right', 16)));
    box.append(h('div.row', { style: { marginTop: '10px' } }, h('button.btn.sm', { type: 'button', onclick: async () => {
      if (ps.on) { const sent = await P.test(15); toast(sent ? '15초쯤 뒤부터 1분 안에 폰 알림이 와요. 지금 앱을 닫고 기다려 보세요.' : '서버에 시험 알림을 부탁하지 못했어요. 인터넷과 로그인을 확인해 주세요.'); if (sent) return; }
      const ok = await A.test(); if (!ok && perm !== 'granted') toast('화면 안 알림만 보였어요. 폰 알림은 위에서 켜 주세요.');
    } }, ic('bell', 14), ps.on ? '닫힌 앱 알림 시험하기' : '시험 알림 보내기')));
  };
  const off = A.onChange(() => { if (!document.body.contains(box)) { off(); return; } draw(); });
  draw();
  return box;
}
export function open() { return modal('알림', () => panel()); }
