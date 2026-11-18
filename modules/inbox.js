import { h, ic, clear, toast, head, seg, rel, tile } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import { draftCard } from '../js/draftcard.js';
import { updateBadge } from '../js/app.js';

let filter = 'all';
export default {
  async render(root) {
    const body = h('div');
    const approveAllBtn = h('button.btn.sm', { onclick: approveAll }, ic('check', 14), '높은 확신도 모두 확정');
    root.append(head('확인 대기함', '비서가 만든 임시 항목이에요. 확정해야 실제 기록이 돼요.', approveAllBtn), body);
    await draw();

    async function draw() {
      const ds = await store.drafts();
      clear(body);
      const counts = {}; ds.forEach(d => (counts[d.kind] = (counts[d.kind] || 0) + 1));
      const hist = (await db.list('drafts')).filter(d => d.status !== 'pending');
      const okN = hist.filter(d => d.status === 'approved').length;
      body.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('inbox', ds.length, '기다리는 중', ds.length ? 'warn' : 'ok'),
        tile('check', okN, '확정함', 'ok'),
        tile('x', hist.length - okN, '버림', ''),
        tile('sparkles', hist.length ? Math.round(okN / hist.length * 100) + '%' : '–', '비서 정확도', '')));
      const opts = [['all', `전체 ${ds.length}`], ...Object.entries(counts).map(([k, n]) => [k, `${store.KINDS[k]?.label || k} ${n}`])];
      if (!counts[filter] && filter !== 'all') filter = 'all';
      body.append(h('div', { style: { marginBottom: '12px', overflowX: 'auto' } }, seg(opts, filter, v => { filter = v; draw(); })));
      const shown = ds.filter(d => filter === 'all' || d.kind === filter);
      if (!shown.length) { body.append(h('div.card', h('div.empty', ic('check', 28), h('p', { style: { marginTop: '8px' } }, '확인할 게 없어요. 다 정리됐어요.')))); return; }
      // 날짜별로 묶기
      let last = '';
      const wrap = h('div.stack');
      for (const d of shown) {
        const day = d.createdAt.slice(0, 10);
        if (day !== last) { last = day; wrap.append(h('div.faint.tiny', { style: { marginTop: '8px', fontWeight: 650 } }, rel(day) + ' · ' + day.slice(5).replace('-', '/'))); }
        wrap.append(draftCard(d, (st, el) => { updateBadge(); setTimeout(() => { el.classList.add('leaving'); setTimeout(() => draw(), 300); }, 500); }));
      }
      body.append(wrap);
    }
    async function approveAll() {
      const ds = (await store.drafts()).filter(d => (d.confidence || 0) >= 0.8 && d.kind !== 'summary');
      if (!ds.length) { toast('확신도 높은 항목이 없어요'); return; }
      for (const d of ds) await store.approve(d);
      toast(`${ds.length}개 확정했어요`); updateBadge(); draw();
    }
  },
};
