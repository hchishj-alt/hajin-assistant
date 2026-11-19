// 메신저: 팀원과 1:1. 비서가 가운데에서 전하고, 받은 내용을 판단해 일정·할 일로 바꿔 줌
import { h, ic, clear, toast, head, colorFor, fmtDate } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as DM from '../js/dm.js';
import { go, updateBadge } from '../js/app.js';

let open = '';
export default {
  async render(root, params) {
    const sync = await import('../js/sync.js');
    const meM = await sync.me();
    root.append(head('메신저', '비서가 전해 주고, 받은 말은 읽어서 일정·할 일로 바꿔 드려요. 두 사람만 볼 수 있어요.'));
    if (!meM) { root.append(h('div.card', h('div.empty', ic('msg', 28), h('p', '멤버 코드로 로그인하면 팀원과 메시지를 주고받을 수 있어요.'), h('a.btn.pri', { href: '#/settings/sync', style: { marginTop: '10px' } }, '로그인하러 가기')))); return; }
    if (params[0]) open = params[0];
    const roster = (await db.kvGet('sync:roster', [])).filter(r => r.id && r.id !== meM.id);
    const wrap = h('div.talk' + (open ? '.open' : '')); const listEl = h('div.talk-list'); const pane = h('div.talk-pane');
    wrap.append(listEl, pane); root.append(wrap);
    const onDm = () => draw(false); window.addEventListener('hajin:dm', onDm);
    await draw(true);
    return () => window.removeEventListener('hajin:dm', onDm);

    async function draw(scroll) {
      const all = (await db.list('dms')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      clear(listEl);
      if (!roster.length) listEl.append(h('div.empty', '아직 다른 멤버가 없어요.'));
      const rows = roster.map(r => { const ms = all.filter(d => d.other === r.id); return { r, last: ms[ms.length - 1], unread: ms.filter(d => !d.mine && !d.readAt).length }; }).sort((a, b) => (b.last?.createdAt || '').localeCompare(a.last?.createdAt || ''));
      for (const { r, last, unread } of rows) listEl.append(h('button.talk-p' + (open === r.id ? '.on' : ''), { onclick: () => { open = r.id; go('talk/' + r.id); } },
        h('span.avatar', { style: { background: colorFor(r.name), width: '38px', height: '38px' } }, r.name.slice(-2, -1) || r.name[0]),
        h('span.grow', h('b', r.name), h('span.faint.tiny', last ? `${last.mine ? '나: ' : ''}${last.body}` : (r.user ? '아직 대화가 없어요' : '아직 로그인 전이에요'))),
        unread ? h('span.badge', unread) : last ? h('span.faint.tiny', (last.createdAt || '').slice(11, 16)) : null));
      clear(pane);
      const other = roster.find(r => r.id === open);
      if (!other) { pane.append(h('div.empty', ic('msg', 26), h('p', '왼쪽에서 대화할 사람을 골라요.'))); return; }
      wrap.classList.add('open');
      const ms = all.filter(d => d.other === other.id);
      const log = h('div.talk-log');
      let day = '';
      for (const d of ms) {
        const ds = (d.createdAt || '').slice(0, 10); if (ds !== day) { day = ds; log.append(h('div.talk-day', fmtDate(ds))); }
        const b = h('div.talk-b' + (d.mine ? '.mine' : ''), h('div.talk-t', d.body), h('span.talk-tm', new Date(d.createdAt).toTimeString().slice(0, 5)));
        log.append(b);
        if (!d.mine && !d.handled) log.append(await assist(d, other));
      }
      if (!ms.length) log.append(h('div.empty', `${other.name} 님에게 전할 말을 아래에 적어 보세요.`));
      const ta = h('textarea', { rows: 1, placeholder: `${other.name} 님에게 전할 말`, 'aria-label': '메시지' });
      const send = async (text = ta.value) => { text = text.trim(); if (!text) return; ta.value = ''; try { await sync.dmSend(other.id, text); await draw(true); } catch (e) { toast(e.message); ta.value = text; } };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
      pane.append(h('div.talk-h', h('button.btn.sm.icon.ghost.talk-back', { 'aria-label': '목록', onclick: () => { open = ''; wrap.classList.remove('open'); go('talk'); } }, ic('left', 16)), h('span.avatar', { style: { background: colorFor(other.name), width: '30px', height: '30px', fontSize: '12px' } }, other.name.slice(-2, -1) || other.name[0]), h('b', other.name), h('span.faint.tiny', other.role || '')),
        log, h('div.talk-in', ta, h('button.btn.pri.icon', { 'aria-label': '보내기', onclick: () => send() }, ic('send', 16))));
      if (scroll !== false || true) log.scrollTop = log.scrollHeight;
      if (ms.some(d => !d.mine && !d.readAt)) { await sync.dmRead(other.id); updateBadge(); }

      // 비서의 판단: 메시지 아래에 한 줄 + 누르면 처리
      async function assist(d, other) {
        const j = await DM.judge(d.body, other.name);
        const done = async () => { await db.putRaw({ ...(await db.get(d.id)), handled: true }); draw(false); };
        return h('div.talk-ai', h('div.talk-ai-h', ic('sparkles', 12), '비서', j.note ? h('span', j.note) : null),
          h('div.chips', j.actions.map(a => h('button.chip.acc', { onclick: async () => { await store.draft(a.kind, a.data, { source: d.body, origin: 'dm', confidence: .75 }); updateBadge(); toast(`${store.KINDS[a.kind]?.label || ''} 임시 항목을 만들었어요`, { label: '확인 대기함', fn: () => go('inbox') }); done(); } }, ic('plus', 12), a.label)),
            j.replies.map(r => h('button.chip', { title: '이 말로 답장', onclick: async () => { await send(r); done(); } }, ic('send', 12), r)),
            h('button.chip', { onclick: done }, '넘기기')));
      }
    }
  },
};
