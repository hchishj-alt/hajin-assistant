import { h, ic, clear, toast, head, seg, rel, tile, confirmBox } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import { draftCard } from '../js/draftcard.js';
import { updateBadge } from '../js/app.js';

let filter = 'all';
export default {
  async render(root) {
    const body = h('div');
    const approveAllBtn = h('button.btn.sm', { onclick: approveAll }, ic('check', 14), '모두 확정');
    root.append(head('확인 대기함', '소머AI가 만든 임시 항목이에요. 확정해야 실제 기록이 돼요.', approveAllBtn), body);
    await draw();

    async function draw() {
      const ds = await store.drafts();
      clear(body);
      const allN = ds.filter(d => d.kind !== 'summary').length;
      approveAllBtn.lastChild.textContent = allN ? `모두 확정 (${allN})` : '모두 확정'; approveAllBtn.disabled = !allN;
      if (!(await db.kvGet('hint:inbox', false))) body.append(h('div.card.flat', { style: { marginBottom: '12px' } }, h('div.row.between', { style: { alignItems: 'flex-start', gap: '10px' } },
        h('div.small', h('b', '이렇게 써요'), h('div.faint', { style: { marginTop: '4px', lineHeight: 1.6 } }, '확정: 실제 기록으로 저장', h('br'), '고치기: 고쳐서 저장 (소머AI가 배워요)', h('br'), '종류 바꾸기: 다음부터 비슷한 말은 그 종류로', h('br'), '버리기: 없던 일로')),
        h('button.btn.sm.ghost', { type: 'button', onclick: async () => { await db.kvSet('hint:inbox', true); draw(); } }, '알겠어요'))));
      const counts = {}; ds.forEach(d => (counts[d.kind] = (counts[d.kind] || 0) + 1));
      const hist = (await db.list('drafts')).filter(d => d.status !== 'pending');
      const okN = hist.filter(d => d.status === 'approved').length;
      body.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('inbox', ds.length, '기다리는 중', ds.length ? 'warn' : 'ok'),
        tile('check', okN, '확정함', 'ok'),
        tile('x', hist.length - okN, '버림', '')));
      const opts = [['all', `전체 ${ds.length}`], ...Object.entries(counts).map(([k, n]) => [k, `${store.KINDS[k]?.label || k} ${n}`])];
      if (!counts[filter] && filter !== 'all') filter = 'all';
      body.append(h('div', { style: { marginBottom: '12px', overflowX: 'auto' } }, seg(opts, filter, v => { filter = v; draw(); })));
      const shown = ds.filter(d => filter === 'all' || d.kind === filter);
      if (!shown.length) { body.append(h('div.card', h('div.empty', ic('check', 28), h('p', { style: { marginTop: '8px' } }, '확인할 게 없어요. 다 정리됐어요.')))); return; }
      // 날짜별로 묶기
      let last = '';
      const wrap = h('div.stack');
      for (const d of shown) {
        const day = db.dayOf(d.createdAt);
        if (day !== last) { last = day; wrap.append(h('div.faint.tiny', { style: { marginTop: '8px', fontWeight: 650 } }, rel(day) + ' · ' + day.slice(5).replace('-', '/'))); }
        wrap.append(draftCard(d, (st, el) => { updateBadge(); setTimeout(() => { el.classList.add('leaving'); setTimeout(() => draw(), 300); }, 500); }));
      }
      body.append(wrap);
    }
    async function approveAll() {
      const ds = (await store.drafts()).filter(d => d.kind !== 'summary' && (filter === 'all' || d.kind === filter));
      if (!ds.length) { toast('확정할 항목이 없어요'); return; }
      if (!await confirmBox(`${ds.length}개를 한 번에 확정할까요? 확정한 뒤에도 각 화면에서 고칠 수 있어요.`, '모두 확정')) return;
      const done = [];
      for (const d of ds) { try { await store.approve(d); done.push(d.id); } catch (e) { store.logError(e, 'approveAll'); } }
      updateBadge(); draw();
      toast(`${done.length}개 확정했어요`, { label: '되돌리기', fn: async () => { for (const id of done) { const d = await db.get(id); if (d && d.status === 'approved') await store.unapprove(d); } updateBadge(); draw(); } });
    }
  },
};
