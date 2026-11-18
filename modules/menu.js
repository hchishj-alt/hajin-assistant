import { h, ic, head } from '../js/ui.js';
import { MODULES, openPalette } from '../js/app.js';
export default {
  async render(root) {
    root.append(head('메뉴', null, h('button.btn.sm', { onclick: openPalette }, ic('search', 14), '검색')));
    let g = '';
    let grid;
    for (const m of MODULES.filter(m => !m.hidden && !m.tab)) {
      if (m.group !== g) { g = m.group; root.append(h('div.faint.small', { style: { fontWeight: 700, margin: '14px 2px 8px' } }, g)); grid = h('div.menu-grid'); root.append(grid); }
      grid.append(h('a', { href: '#/' + m.id }, ic(m.icon, 26), m.short || m.title));
    }
  },
};
