// 구매 목록: 프로젝트에 필요한 물건을 링크로 담고, 고른 것만 합계 보고, 산 것은 구매완료로 (가계부가 아니라 준비물·비품 정리용)
import { h, ic, clear, toast, head, modal, form, tile, seg, won, todayStr, fmtDate, confirmBox, colorFor, download, busy } from '../js/ui.js';
import * as db from '../js/db.js';
import * as P from '../js/product.js';
import { go } from '../js/app.js';
import { nameCanon } from '../js/store.js';
import { canEdit } from '../js/admin.js';

const F = { tab: 'todo', folder: '', q: '' };
const sum = xs => xs.reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
const fields = folders => [
  { k: 'title', label: '상품명', full: true }, { k: 'price', label: '가격(원)', type: 'number', inputmode: 'numeric' }, { k: 'qty', label: '수량', type: 'number', default: 1, inputmode: 'numeric' },
  { k: 'folder', label: '폴더 (프로젝트)', datalist: folders }, { k: 'store', label: '구매처' },
  { k: 'link', label: '상품 링크', full: true }, { k: 'img', label: '이미지 링크 (자동으로 안 뜨면 이미지 주소를 붙여넣기)', full: true },
  { k: 'need', label: '필요도', type: 'select', options: [['must', '꼭 필요'], ['nice', '있으면 좋음'], ['later', '나중에']], default: 'must' }, { k: 'place', label: '보관 위치 (산 뒤)' },
  { k: 'memo', label: '메모 (옵션·색·사이즈)', type: 'textarea', rows: 2 },
  { k: 'team', label: '공유', type: 'select', options: [['auto', '알아서 (내용 보고 정함)'], ['', '나만 보기'], ['team-main', '팀에 공유']], default: 'auto' }];
const NEED = { must: ['꼭 필요', 'bad'], nice: ['있으면 좋음', 'warn'], later: ['나중에', ''] };

const ph = () => h('div.buy-ph', ic('image', 20));
const short = n => n >= 100000 ? (Math.round(n / 1000) / 10).toLocaleString() + '만' : n.toLocaleString();

export default {
  async render(root) {
    const box = h('div'); const bar = h('div.cartbar.hide');
    root.append(head('구매 목록', '링크만 걸면 이미지·상품명·가격을 채워요. 고른 것끼리 합계를 보고, 산 건 구매완료로 넘겨요.',
      h('button.btn.sm', { onclick: excel }, ic('download', 14), '엑셀'),
      h('button.btn.sm', { onclick: () => edit({}) }, ic('plus', 14), '직접 추가'),
      h('button.btn.sm.pri', { onclick: addLink }, ic('link', 14), '링크로 추가')), box, bar);
    const onPaste = e => { if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('.modal-bg')) return; const t = e.clipboardData?.getData('text') || ''; if (/^https?:\/\/\S+$/.test(t.trim())) { e.preventDefault(); addLink(t.trim()); } };
    document.addEventListener('paste', onPaste);
    await draw();
    return () => document.removeEventListener('paste', onPaste);

    async function draw() {
      clear(box);
      const all = await db.list('buys');
      const teamId = (await db.get('team-main')) ? 'team-main' : '';
      const projects = (await db.list('projects')).map(p => p.name).filter(Boolean);
      const folders = [...new Set([...projects, ...all.map(b => b.folder).filter(Boolean)])];
      const inF = all.filter(b => (!F.folder || (F.folder === '_none' ? !b.folder : b.folder === F.folder)) && (!F.q || `${b.title} ${b.store || ''} ${b.memo || ''}`.toLowerCase().includes(F.q.toLowerCase())));
      const todo = inF.filter(b => !b.bought).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt || '').localeCompare(b.createdAt || ''));
      const done = inF.filter(b => b.bought).sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || ''));
      // 고르기는 이 기기에서 합계를 보려는 것이라 팀과 나누지 않음 (전에는 한 사람이 고르면 다른 사람 화면에도 골라져, 남이 고른 것까지 구매완료로 넘어갔음)
      const pk = new Set(await db.kvGet('shop:picked', [])); for (const id of [...pk]) if (!all.some(b => b.id === id && !b.bought)) pk.delete(id);
      const savePk = () => db.kvSet('shop:picked', [...pk]);
      const picked = todo.filter(b => pk.has(b.id));
      const canon = await nameCanon();
      // 예산: 프로젝트 폴더면 프로젝트에 적어 팀이 같이 봄, 그 밖(전체·직접 적은 폴더)은 이 기기에만
      const proj = F.folder && F.folder !== '_none' ? (await db.list('projects')).find(p => p.name === F.folder) : null;
      const teamBudget = proj && proj.buyBudget != null && (proj.team || proj.space) ? Number(proj.buyBudget) || 0 : null;
      const budget = teamBudget != null ? teamBudget : Number((await db.kvGet('shop:budget', {}))[F.folder || '_all']) || 0;
      const budgetMine = !proj || await canEdit(proj);
      box.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('inbox', todo.length, '살 것'), tile('wallet', short(sum(todo)), '살 것 합계'),
        tile('check2', short(sum(picked)), `고른 것 ${picked.length}개`, picked.length ? 'ok' : ''), tile('check', short(sum(done)), `구매완료 ${done.length}개`)),
        ...(budget ? [h('div.card', { style: { marginBottom: '14px' } }, h('div.row.between', h('span.small', { style: { fontWeight: 650 } }, `예산 ${won(budget)}`, teamBudget != null ? h('span.faint', { style: { fontWeight: 500 } }, ' · 팀이 같이 봐요') : null), h('span.small.muted', `쓴 돈 ${won(sum(done))} · 남은 예산 ${won(budget - sum(done))}${sum(todo) > budget - sum(done) ? ' · 살 것이 남은 예산을 넘어요' : ''}`)),
          h('div.bar', { style: { marginTop: '8px' } }, h('i', { style: { width: Math.min(100, sum(done) / budget * 100) + '%' } }))) ] : []),
        h('div.chips', { style: { marginBottom: '10px' } },
          [['', '전체', all.length], ...folders.map(f => [f, f, all.filter(b => b.folder === f).length]), ...(all.some(b => !b.folder) && folders.length ? [['_none', '분류 안 됨', all.filter(b => !b.folder).length]] : [])].map(([id, name, n]) => h('button.chip' + (F.folder === id ? '.acc' : ''), { onclick: () => { F.folder = id; draw(); } }, id && id !== '_none' ? h('span.dot', { style: { background: colorFor(name) } }) : null, name, h('span.faint', ' ' + n))),
          budgetMine || teamBudget == null ? h('button.chip', { onclick: setBudget }, ic('wallet', 12), budget ? '예산 바꾸기' : '예산 정하기') : null),
        h('div.row', { style: { gap: '10px', marginBottom: '10px', flexWrap: 'wrap' } }, seg([['todo', `살 것 ${todo.length}`], ['done', `구매완료 ${done.length}`]], F.tab, v => { F.tab = v; draw(); }),
          h('input.in.grow', { placeholder: '상품명·구매처 찾기', value: F.q, style: { minWidth: '140px' }, onchange: e => { F.q = e.target.value; draw(); } })));
      const list = h('div.card.buys');
      const rows = F.tab === 'todo' ? todo : done;
      if (!rows.length) list.append(h('div.empty', F.tab === 'todo' ? '살 것이 없어요. 상품 링크를 복사해 이 화면에 붙여넣기(Ctrl+V) 하거나 “링크로 추가”를 눌러 보세요.' : '아직 구매완료한 게 없어요.'));
      if (F.tab === 'todo' && rows.length) list.append(h('label.li.chk.small', h('input', { type: 'checkbox', checked: picked.length === todo.length, onchange: async e => { for (const b of todo) e.target.checked ? pk.add(b.id) : pk.delete(b.id); await savePk(); draw(); } }), h('span.muted', '전체 고르기')));
      for (const b of rows) list.append(row(b));
      box.append(list);
      if (F.tab === 'todo') enableDrag(list);
      // 장바구니 합계 바
      clear(bar); bar.classList.toggle('hide', !(F.tab === 'todo' && picked.length));
      if (picked.length) bar.append(h('div', h('b', `고른 것 ${picked.length}개`), h('div.cart-sum', won(sum(picked)))),
        h('button.btn.pri', { onclick: async () => { for (const b of picked) { await db.patch(b.id, { bought: true, checked: false, boughtAt: todayStr(), buyer: await db.kvGet('name', '하진') }); pk.delete(b.id); } await savePk(); toast(`${picked.length}개를 구매완료로 옮겼어요`, { label: '보기', fn: () => { F.tab = 'done'; draw(); } }); draw(); } }, ic('check', 16), '구매완료'));

      function row(b) {
        const qty = Number(b.qty) || 1;
        const img = b.img ? h('img', { src: b.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.replaceWith(ph()) }) : ph();
        return h('div.buy' + (pk.has(b.id) ? '.on' : ''), { 'data-id': b.id },
          F.tab === 'todo' ? h('label.buy-pick', h('input.buy-chk', { type: 'checkbox', 'aria-label': '고르기', checked: pk.has(b.id), onchange: async e => { e.target.checked ? pk.add(b.id) : pk.delete(b.id); await savePk(); draw(); } })) : h('span.buy-ok', ic('check', 14)),
          h('div.buy-img', { onclick: () => edit(b) }, img),
          h('div.buy-b', b.link ? h('a.buy-t', { href: b.link, target: '_blank', rel: 'noopener' }, b.title || '(이름 없음)') : h('div.buy-t', b.title || '(이름 없음)'),
            h('div.faint.tiny', [b.store, b.folder, b.memo, b.bought && `${fmtDate(b.boughtAt)} 구매${b.buyer ? ' · ' + canon(b.buyer) : ''}`, b.bought && b.place && '보관: ' + b.place, b.by && b.team && canon(b.by) + ' 올림'].filter(Boolean).join(' · ')),
            h('div.row', { style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
              !b.price ? h('button.chip.warn', { onclick: () => edit(b) }, '가격 넣기') : h('span.buy-p', won(b.price)),
              F.tab === 'todo' ? h('span.stepper', h('button', { 'aria-label': '수량 줄이기', onclick: async () => { if (qty > 1) { await db.patch(b.id, { qty: qty - 1 }); draw(); } } }, '−'), h('b', qty), h('button', { 'aria-label': '수량 늘리기', onclick: async () => { await db.patch(b.id, { qty: qty + 1 }); draw(); } }, '+')) : h('span.faint.small', `× ${qty}`),
              qty > 1 && b.price ? h('span.small', { style: { fontWeight: 700 } }, '= ' + won(b.price * qty)) : null,
              b.need && b.need !== 'must' || F.tab === 'todo' ? h('span.chip' + (NEED[b.need || 'must'][1] ? '.' + NEED[b.need || 'must'][1] : ''), NEED[b.need || 'must'][0]) : null)),
          h('div.buy-act', h('button.btn.sm.icon.ghost', { 'aria-label': '고치기', onclick: () => edit(b) }, ic('edit', 14)),
            F.tab === 'done' ? h('button.btn.sm.ghost', { onclick: async () => { await db.patch(b.id, { bought: false, boughtAt: '' }); draw(); } }, '되돌리기') : h('span.grip', { 'aria-label': '순서 바꾸기', title: '끌어서 순서 바꾸기' }, ic('menu', 18))));
      }
      function enableDrag(list) {
        list.querySelectorAll('.grip').forEach(g => g.addEventListener('pointerdown', e => {
          e.preventDefault(); const el = g.closest('.buy'); el.classList.add('drag');
          const mv = ev => { const sibs = [...list.querySelectorAll('.buy:not(.drag)')]; const after = sibs.find(s => ev.clientY < s.getBoundingClientRect().top + s.offsetHeight / 2); if (after) list.insertBefore(el, after); else list.append(el); const y = ev.clientY; if (y < 90) scrollBy(0, -12); else if (y > innerHeight - 110) scrollBy(0, 12); };
          const up = async () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); el.classList.remove('drag'); const ids = [...list.querySelectorAll('.buy')].map(x => x.dataset.id); for (let i = 0; i < ids.length; i++) { const it = todo.find(t => t.id === ids[i]); if (it && it.order !== i) await db.patch(it.id, { order: i }); } draw(); };
          addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        }));
      }
      async function setBudget() { const shared = !!(proj && (proj.team || proj.space) && budgetMine); modal('예산', close => form([{ k: 'v', label: `${F.folder && F.folder !== '_none' ? F.folder : '전체'} 예산 (원, 0이면 없앰) · ${shared ? '팀이 같이 봐요' : '이 기기에서만 보여요'}`, type: 'number', default: budget, full: true }], {}, async v => { if (shared) await db.patch(proj.id, { buyBudget: Number(v.v) || 0 }); else { const m = await db.kvGet('shop:budget', {}); m[F.folder || '_all'] = v.v || 0; await db.kvSet('shop:budget', m); } close(); draw(); })); }
    }

    async function folderList() { const all = await db.list('buys'); return [...new Set([...(await db.list('projects')).map(p => p.name), ...all.map(b => b.folder)].filter(Boolean))]; }
    async function edit(b) {
      const fl = await folderList(); const teamId = (await db.get('team-main')) ? 'team-main' : '';
      modal(b.id ? '상품 고치기' : '상품 추가', close => {
        const f = form(fields(fl), { folder: F.folder && F.folder !== '_none' ? F.folder : '', ...b }, async v => {
          if (!v.title) return toast('상품명을 적어 주세요');
          await db.put('buys', { ...b, ...v, qty: v.qty || 1, by: b.by || await db.kvGet('name', '하진') }); close(); draw();
        });
        const pv = h('img.buy-pv', { alt: '', referrerpolicy: 'no-referrer' }); const upd = () => { pv.src = f.inputs.img.value.trim(); pv.style.display = f.inputs.img.value.trim() ? '' : 'none'; };
        pv.onerror = () => { pv.style.display = 'none'; }; f.inputs.img.addEventListener('input', upd); upd(); f.prepend(pv);
        if (b.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { if (await confirmBox('목록에서 지울까요?', '지우기')) { await db.remove(b.id); close(); draw(); } } }, ic('trash', 14)),
          h('button.btn', { type: 'button', onclick: async e => { const btn = e.currentTarget; if (!f.inputs.link.value.trim()) return toast('상품 링크를 먼저 넣어 주세요'); busy(btn, true, '불러오는 중'); const p = await P.lookup(f.inputs.link.value); busy(btn, false); if (p.title) f.inputs.title.value = p.title; if (p.img) { f.inputs.img.value = p.img; upd(); } if (p.price) f.inputs.price.value = p.price; toast(p.auto.length ? `${p.auto.join('·')}을 다시 채웠어요` : '이 사이트는 자동으로 못 읽어요. 직접 적어 주세요'); } }, ic('refresh', 14), '링크에서 다시 읽기'));
        return f;
      });
    }
    function addLink(pre = '') {
      modal('링크로 추가', close => {
        const ta = h('textarea.in', { rows: 4, placeholder: '상품 링크를 붙여넣어요. 여러 개면 줄마다 하나씩.' }, pre);
        const go2 = h('button.btn.pri', { onclick: async e => {
          const btn = e.currentTarget; const urls = [...new Set((ta.value.match(/https?:\/\/[^\s<>"']+/g) || []))]; if (!urls.length) return toast('링크를 찾지 못했어요');
          const by = await db.kvGet('name', '하진'); const team = (await db.get('team-main')) ? 'team-main' : ''; const folder = F.folder && F.folder !== '_none' ? F.folder : ''; const Q = await import('../js/queue.js');
          for (const u of urls) Q.add('상품 읽기', u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), async () => { const p = await P.lookup(u); const { auto, ...rest } = p; const it = await db.put('buys', { ...rest, title: rest.title || '(상품명을 적어 주세요)', qty: 1, need: 'must', folder, by, team, autoFilled: auto }); if (urls.length === 1 && auto.length < 3 && box.isConnected && !document.querySelector('.modal')) { toast('자동으로 못 읽은 칸이 있어요. 확인해 주세요'); edit(it); } }, () => draw());
          close(); F.tab = 'todo'; toast(`${urls.length}개를 대기열에 넣었어요. 못 읽은 칸은 담긴 뒤에 눌러서 채워 주세요`);
        } }, ic('plus', 14), '담기');
        return h('div.stack', ta, h('p.faint.tiny', '이미지·상품명·가격을 자동으로 읽어요. 쇼핑몰이 막아 둔 경우엔 빈 칸으로 담기고, 눌러서 직접 고치거나 이미지 주소만 따로 붙일 수 있어요.'), h('div.modal-f', go2));
      });
    }
    async function excel() {
      const { xlsx } = await import('../js/xlsx.js');
      const all = (await db.list('buys')).sort((a, b) => (a.folder || '').localeCompare(b.folder || '', 'ko') || (a.order ?? 1e9) - (b.order ?? 1e9));
      const headRow = ['폴더', '상품명', '단가', '수량', '합계', '상태', '필요도', '구매일', '산 사람', '구매처', '보관 위치', '메모', '상품 링크', '이미지 링크', '올린 사람'];
      const line = b => [b.folder || '', b.title || '', Number(b.price) || 0, Number(b.qty) || 1, (Number(b.price) || 0) * (Number(b.qty) || 1), b.bought ? '구매완료' : '살 것', NEED[b.need || 'must'][0], b.boughtAt || '', b.buyer || '', b.store || '', b.place || '', b.memo || '', b.link || '', b.img || '', b.by || ''];
      const widths = [14, 38, 11, 7, 12, 10, 12, 12, 10, 14, 14, 26, 40, 40, 10];
      const sheet = (name, xs) => ({ name, widths, rows: [headRow, ...xs.map(line), [], ['', '합계', '', xs.reduce((s, b) => s + (Number(b.qty) || 1), 0), sum(xs)]] });
      const fs = [...new Set(all.map(b => b.folder || '분류 안 됨'))];
      const sums = { name: '폴더별 합계', widths: [20, 14, 14, 14], rows: [['폴더', '살 것', '구매완료', '전체'], ...fs.map(f => { const xs = all.filter(b => (b.folder || '분류 안 됨') === f); return [f, sum(xs.filter(b => !b.bought)), sum(xs.filter(b => b.bought)), sum(xs)]; }), ['합계', sum(all.filter(b => !b.bought)), sum(all.filter(b => b.bought)), sum(all)]] };
      download(`구매목록_${todayStr()}.xlsx`, xlsx([sheet('전체', all), sheet('살 것', all.filter(b => !b.bought)), sheet('구매완료', all.filter(b => b.bought)), sums]));
      toast('엑셀 파일로 내려받았어요');
    }
  },
};
