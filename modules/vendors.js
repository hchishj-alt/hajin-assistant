// 업체 목록: 인쇄·굿즈·대관처럼 필요한 분야별로 업체 전화·링크를 모으고, 같은 품목을 업체끼리 가격 비교 (가격은 자주 바뀌니 메모 중심)
import { h, ic, clear, toast, head, modal, seg, tile, confirmBox, colorFor, won, debounce } from '../js/ui.js';
import * as db from '../js/db.js';

const F = { tab: 'list', cat: '', q: '' };
const CATS = ['인쇄', '굿즈 제작', '현수막·실사', '촬영·스튜디오', '대관·장소', '영상·편집', '포장·배송', '케이터링', '기타'];
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return n || 0; };
const keyOf = s => String(s || '').replace(/\s+/g, '').toLowerCase();

export default {
  async render(root) {
    const body = h('div');
    root.append(head('업체 목록', '분야별로 업체 연락처와 링크를 모으고, 같은 품목은 업체끼리 가격을 나란히 봐요.',
      h('button.btn.sm.pri', { onclick: () => edit({}) }, ic('plus', 14), '업체 추가')), body);
    await draw();

    async function draw() {
      clear(body);
      const all = (await db.list('vendors')).sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || (a.name || '').localeCompare(b.name || ''));
      const cats = [...new Set([...all.map(v => v.cat || '기타')])];
      const fold = await db.kvGet('vendors:fold', {});
      const items = all.flatMap(v => (v.prices || []).map(p => ({ ...p, v })));
      body.append(h('div.tiles', { style: { marginBottom: '14px' } }, tile('briefcase', all.length, '업체'), tile('grid', cats.length, '분야'), tile('receipt', new Set(items.map(i => keyOf(i.item))).size, '가격 적어 둔 품목')));
      const search = h('input.in', { placeholder: '찾기 (업체, 품목, 메모)', value: F.q, style: { maxWidth: '260px' }, oninput: debounce(e => { F.q = e.target.value; draw().then(() => { const i = body.querySelector('input.in'); i.focus(); i.setSelectionRange(F.q.length, F.q.length); }); }, 250) });
      body.append(h('div.row.between', { style: { marginBottom: '10px', gap: '10px', flexWrap: 'wrap' } }, seg([['list', '업체'], ['compare', '가격 비교']], F.tab, v => { F.tab = v; draw(); }), search));
      body.append(h('div.chips', { style: { marginBottom: '12px' } }, [['', '전체'], ...cats.map(c => [c, c])].map(([v, l]) => h('button.chip' + (F.cat === v ? '.acc' : ''), { style: { cursor: 'pointer', border: 0 }, onclick: () => { F.cat = v; draw(); } }, l))));
      const match = v => (!F.cat || (v.cat || '기타') === F.cat) && (!F.q || `${v.name} ${v.cat || ''} ${v.memo || ''} ${(v.prices || []).map(p => p.item + ' ' + (p.note || '')).join(' ')}`.toLowerCase().includes(F.q.toLowerCase()));
      const shown = all.filter(match);
      if (!all.length) { body.append(h('div.card', h('div.empty', ic('briefcase', 28), h('p', '자주 쓰는 인쇄소, 굿즈 업체, 대관처를 넣어 두면 전화·링크를 바로 찾고 가격도 비교할 수 있어요.'), h('button.btn.pri', { style: { marginTop: '10px' }, onclick: () => edit({}) }, ic('plus', 14), '첫 업체 추가')))); return; }
      if (F.tab === 'compare') return body.append(compare(shown));
      for (const c of cats.filter(c => !F.cat || c === F.cat)) {
        const vs = shown.filter(v => (v.cat || '기타') === c); if (!vs.length) continue;
        const open = fold[c] !== true;
        const head2 = h('button.pp-h', { 'aria-expanded': String(open), onclick: async () => { const now = head2.getAttribute('aria-expanded') !== 'true'; head2.setAttribute('aria-expanded', String(now)); sec.classList.toggle('open', now); const f = await db.kvGet('vendors:fold', {}); f[c] = !now; await db.kvSet('vendors:fold', f); } }, h('b.grow', c), h('span.chip', `${vs.length}곳`), ic('down', 14));
        const sec = h('div.card.pp' + (open ? '.open' : ''), head2, h('div.pp-wrap', h('div.pp-body', h('div.vd-grid', vs.map(card)))));
        body.append(sec, h('div', { style: { height: '12px' } }));
      }
      if (!shown.length) body.append(h('div.card', h('div.empty', '조건에 맞는 업체가 없어요')));
    }
    function card(v) {
      const tel = (v.phone || '').replace(/[^\d+]/g, '');
      return h('div.vd', h('div.row.nowrap', { style: { gap: '10px' } }, h('span.avatar', { style: { background: colorFor(v.name || '?') } }, (v.name || '?')[0]),
        h('button.vd-n.grow', { onclick: () => edit(v) }, h('b', v.name), v.memo ? h('div.faint.tiny', v.memo) : null)),
        h('div.row', { style: { gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
          tel ? h('a.btn.sm', { href: 'tel:' + tel }, ic('phone', 14), v.phone) : null,
          v.link ? h('a.btn.sm.ghost', { href: /^https?:/.test(v.link) ? v.link : 'https://' + v.link, target: '_blank', rel: 'noopener' }, ic('link', 14), '사이트') : null,
          v.kakao ? h('span.chip', '카톡 ' + v.kakao) : null),
        (v.prices || []).length ? h('div.vd-p', v.prices.slice(0, 4).map(p => h('div.row.between.nowrap', h('span.small', p.item), h('span.small', h('b', p.price ? (num(p.price) ? won(num(p.price)) : p.price) : ''), p.note ? h('span.faint', ' · ' + p.note) : null))), v.prices.length > 4 ? h('div.faint.tiny', `외 ${v.prices.length - 4}개`) : null) : null);
    }
    // 같은 품목을 파는 업체끼리 나란히. 가장 싼 곳에 표시
    function compare(vs) {
      const rows = new Map();
      for (const v of vs) for (const p of v.prices || []) { if (!p.item) continue; const k = keyOf(p.item); if (!rows.has(k)) rows.set(k, { item: p.item, cells: new Map() }); rows.get(k).cells.set(v.id, p); }
      const cols = vs.filter(v => (v.prices || []).some(p => p.item));
      if (!rows.size) return h('div.card', h('div.empty', '업체에 품목과 가격을 적어 두면 여기서 나란히 비교돼요. 업체를 눌러 “품목·가격”에 적어 주세요.'));
      const t = h('table.vd-t', h('thead', h('tr', h('th', '품목'), cols.map(v => h('th', h('button.vd-n', { onclick: () => edit(v) }, v.name), h('div.faint.tiny', v.cat || ''))))));
      const tb = h('tbody');
      for (const r of [...rows.values()].sort((a, b) => b.cells.size - a.cells.size || a.item.localeCompare(b.item))) {
        const ns = [...r.cells.values()].map(p => num(p.price)).filter(Boolean); const min = ns.length > 1 ? Math.min(...ns) : 0;
        tb.append(h('tr', h('td', h('b', r.item), r.cells.size > 1 ? h('div.faint.tiny', `${r.cells.size}곳 비교`) : null), cols.map(v => { const p = r.cells.get(v.id); if (!p) return h('td.faint', '–'); const n = num(p.price); return h('td' + (min && n === min ? '.best' : ''), h('div', n ? won(n) : (p.price || ''), min && n === min ? h('span.chip.ok.tiny', '가장 저렴') : null), p.note ? h('div.faint.tiny', p.note) : null, p.at ? h('div.faint.tiny', p.at.slice(2).replace(/-/g, '.') + ' 기준') : null); })));
      }
      t.append(tb);
      return h('div.card.pad0', h('div.vd-scroll', t), h('p.faint.tiny', { style: { padding: '10px 14px' } }, '가격은 적어 둔 날 기준이에요. 수량·옵션에 따라 달라지니 메모를 같이 봐 주세요.'));
    }
    async function edit(v) {
      const all = await db.list('vendors'); const cats = [...new Set([...all.map(x => x.cat).filter(Boolean), ...CATS])];
      const itemsKnown = [...new Set(all.flatMap(x => (x.prices || []).map(p => p.item)).filter(Boolean))];
      const st = { ...v, prices: (v.prices || []).map(p => ({ ...p })) };
      modal(v.id ? '업체 고치기' : '업체 추가', close => {
        const inp = (label, k, ph = '', attrs = {}) => { const i = h('input.in', { value: st[k] || '', placeholder: ph, ...attrs, oninput: () => (st[k] = i.value) }); return h('label.f', label, i); };
        const list = h('div.stack');
        const drawP = () => { clear(list); st.prices.forEach((p, i) => { const mk = (k, ph, w, attrs = {}) => { const x = h('input.in', { value: p[k] || '', placeholder: ph, style: { flex: w, minWidth: 0, padding: '7px 9px' }, 'aria-label': ph, ...attrs, oninput: () => { p[k] = x.value; p.at = db.dayOf(new Date()); } }); return x; };
          list.append(h('div.row.nowrap', { style: { gap: '4px' } }, mk('item', '품목 (예: A3 포스터 100장)', 3, { list: 'vd-items' }), mk('price', '가격', 1.4, { inputmode: 'numeric' }), mk('note', '메모 (수량·옵션·배송)', 2.4), h('button.btn.sm.ghost', { type: 'button', 'aria-label': '지우기', onclick: () => { st.prices.splice(i, 1); drawP(); } }, ic('x', 12)))); });
          if (!st.prices.length) list.append(h('div.faint.small', '품목 이름을 다른 업체와 똑같이 적으면 가격 비교에 나란히 나와요')); };
        drawP();
        return h('div', h('datalist#vd-cats', cats.map(c => h('option', { value: c }))), h('datalist#vd-items', itemsKnown.map(c => h('option', { value: c }))),
          h('div.grid.g2', inp('업체 이름', 'name'), inp('분야', 'cat', '인쇄, 굿즈 제작, 대관…', { list: 'vd-cats' }), inp('전화', 'phone', '02-123-4567', { inputmode: 'tel' }), inp('카톡·담당자', 'kakao', '김대리 / 카톡 채널 이름')),
          inp('링크', 'link', '사이트나 견적 페이지 주소'), inp('메모', 'memo', '배송 기간, 최소 수량, 응대가 어땠는지'),
          h('div.row.between', { style: { margin: '12px 0 6px' } }, h('b.small', '품목 · 가격'), h('button.btn.sm', { type: 'button', onclick: () => { st.prices.push({ item: '', price: '', note: '' }); drawP(); list.lastChild?.querySelector('input')?.focus(); } }, ic('plus', 14), '품목')), list,
          h('div.modal-f', v.id ? h('button.btn.danger', { onclick: async () => { if (await confirmBox('이 업체를 지울까요?', '지우기')) { await db.remove(v.id); close(); draw(); } } }, ic('trash', 14)) : null,
            h('button.btn.pri', { onclick: async () => { if (!(st.name || '').trim()) return toast('업체 이름을 적어 주세요'); st.prices = st.prices.filter(p => (p.item || '').trim()); await db.put('vendors', { ...st, name: st.name.trim(), cat: (st.cat || '').trim() || '기타', team: v.team ?? ((await db.get('team-main')) ? 'team-main' : '') }); close(); draw(); } }, '저장')));
      }, { wide: true });
    }
  },
};
