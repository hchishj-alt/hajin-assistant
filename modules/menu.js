import { h, ic, head, clear, toast } from '../js/ui.js';
import * as db from '../js/db.js';
import { MODULES, openPalette, buildNav, canOpen } from '../js/app.js';
import { pinned, setPin, who, rolePicker } from '../js/helper.js';
// 메뉴: 내 역할에서 주로 쓰는 것과 자주 연 것만 먼저. 나머지는 "더보기"에 접어 둠. "고르기"로 직접 넣고 뺄 수 있음
export default {
  async render(root) {
    const body = h('div'); let edit = false;
    const editBtn = h('button.btn.sm.ghost.ps-tap', { type: 'button', onclick: () => { edit = !edit; draw(); } }, ic('edit', 14), '고르기');
    root.append(head('메뉴', null, h('button.btn.sm.ghost.ps-tap', { type: 'button', onclick: async () => (await import('../js/helper.js')).openSheet('menu', '뭐 할 수 있어?') }, ic('bulb', 14), '쓰는 법'), editBtn, h('button.btn.sm.ps-tap', { type: 'button', onclick: openPalette }, ic('search', 14), '검색')), body);
    await draw();
    async function draw() {
      const adm = await (await import('../js/admin.js')).isAdmin(); const hid = (await db.kvGet('look', null))?.hidden || [];
      const pins = await pinned(); const more = await db.kvGet('menu:more', false); const site = await (await import('../js/logo.js')).siteUrl();
      const all = MODULES.filter(m => !m.hidden && !m.tab && !hid.includes(m.id) && canOpen(m, adm));
      const top = all.filter(m => pins.has(m.id)), rest = all.filter(m => !pins.has(m.id));
      const cell = (m, on) => edit
        ? h('button.menu-pick' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': String(on), 'aria-label': `${m.title} ${on ? '빼기' : '넣기'}`, onclick: async () => { await setPin(m.id, !on); await buildNav(); draw(); } }, ic(m.icon, 26), m.short || m.title, h('i', ic(on ? 'check' : 'plus', 12)))
        : h('a', m.out ? { href: site, target: '_blank', rel: 'noopener' } : { href: '#/' + m.id }, ic(m.icon, 26), m.short || m.title);
      clear(body); editBtn.lastChild.textContent = edit ? '다 골랐어요' : '고르기'; editBtn.classList.toggle('pri', edit); editBtn.classList.toggle('ghost', !edit);
      if (edit) body.append(h('p.small.muted', { style: { margin: '0 2px 10px' } }, '누르면 "자주 쓰는 것"에 넣거나 뺄 수 있어요. 빼도 "더보기"에 그대로 있어요.'));
      if (edit) { const me = await who(); if (me.local) body.append(rolePicker(me, async () => { await buildNav(); toast('역할에 맞춰 메뉴를 다시 골랐어요'); draw(); })); }   /* 로그인 안 한 기기에서는 역할을 여기서 고름 */
      body.append(h('div.faint.small.menu-h', '자주 쓰는 것'), h('div.menu-grid', top.map(m => cell(m, true))));
      if (!rest.length) return;
      const open = edit || more;
      const grid = h('div.menu-grid', rest.map(m => cell(m, false)));
      body.append(h('button.menu-more', { type: 'button', 'aria-expanded': String(open), onclick: async () => { if (edit) return; await db.kvSet('menu:more', !more); draw(); } }, h('span', `더보기 ${rest.length}개`), h('small', open ? '' : rest.slice(0, 4).map(m => m.short || m.title).join(' · ') + (rest.length > 4 ? ' …' : '')), ic(open ? 'up' : 'down', 16)));
      if (open) body.append(grid);
    }
  },
};
