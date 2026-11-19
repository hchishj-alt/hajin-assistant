import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, colorFor, confirmBox, download, tile, ring, won, COLORS } from '../js/ui.js';
import * as db from '../js/db.js';
import * as brain from '../js/brain.js';
import { FIELDS, EXP_CAT_LIST } from '../js/fields.js';

let month = todayStr().slice(0, 7), stF = '';
const ST = { todo: ['정산 전', 'warn'], submitted: ['결재 요청', 'acc'], approved: ['승인됨', 'ok'], done: ['정산 완료', 'ok'] };
export default {
  async render(root) {
    const body = h('div');
    const quick = h('input', { placeholder: '“택시 12,300원 법인카드”, “오로라 계약금 300만원 25일 입금 예정”처럼 적고 Enter', 'aria-label': '지출이나 받을 돈 추가', enterkeyhint: 'done' });
    let adding = false;
    const addQuick = async () => {
      const v = quick.value.trim(); if (!v || adding) return;
      adding = true; setTimeout(() => (adding = false), 800); /* 두 번 눌러도 한 번만 */
      const ctx = { projects: (await db.list('projects')).map(x => x.name).filter(Boolean), vendors: (await db.list('vendors')).map(x => x.name).filter(Boolean) };
      let p = brain.interpret(v, ctx)[0]; if (!p || (p.kind !== 'expense' && p.kind !== 'income')) p = brain.interpret('지출: ' + v, ctx)[0];
      const tags = brain.parseTags(v);
      if (!p.data.amount) { toast('금액을 못 찾았어요. “12000원”처럼 적어 주세요'); return; }
      const income = p.kind === 'income';
      const saved = await db.put(income ? 'incomes' : 'expenses', { ...p.data, title: String(p.data.title || '').replace(/^지출\s*[:：]\s*/, '').replace(/#\S+/g, '').trim() || (income ? '받을 돈' : '지출'), project: p.data.project || tags[0] || '', ...(income ? {} : { status: 'todo' }), team: 'auto' });
      quick.value = ''; toast(`${income ? (saved.status === 'got' ? '받은 돈' : '받을 돈') : '지출'} · ${saved.title} ${Number(saved.amount).toLocaleString()}원${income ? '' : ' · ' + saved.category}`, { label: '되돌리기', fn: async () => { await db.remove(saved.id); draw(); } }); draw();
    };
    quick.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) addQuick(); });
    root.append(head('비용 처리', '쓰자마자 적고, 정산 상태까지 한눈에.',
      h('button.btn.sm.ghost', { onclick: setBudget }, ic('target', 14), '예산'),
      h('button.btn.sm.ghost', { onclick: exportCsv }, ic('download', 14), '엑셀(CSV)'),
      h('button.btn.sm.ghost', { onclick: printReport }, ic('file', 14), '지출결의서'),
      h('button.btn.sm', { onclick: () => editIncome() }, ic('plus', 14), '받을 돈'),
      h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '지출')),
      h('div.quick', { style: { marginBottom: '12px' } }, ic('receipt'), quick, h('button.btn.icon.ghost', { 'aria-label': '추가', onclick: addQuick }, ic('right', 18))), body);
    await draw();

    async function draw() {
      clear(body);
      const all = await db.list('expenses');
      const xs = all.filter(e => (e.date || '').startsWith(month));
      const sum = xs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const pendSum = all.filter(e => e.status !== 'done' && e.pay !== '법인카드').reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const budget = await db.kvGet('budget', 0);
      const prevM = new Date(month + '-01'); prevM.setMonth(prevM.getMonth() - 1);
      const prevKey = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}`;
      const prev = all.filter(e => (e.date || '').startsWith(prevKey)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const diff = prev ? Math.round((sum - prev) / prev * 100) : null;
      body.append(h('div.row.between', { style: { marginBottom: '12px' } },
        h('div.row', h('button.btn.icon.ghost', { 'aria-label': '이전 달', onclick: () => shift(-1) }, ic('left')), h('h2', `${+month.slice(0, 4)}년 ${+month.slice(5)}월`), h('button.btn.icon.ghost', { 'aria-label': '다음 달', onclick: () => shift(1) }, ic('right'))),
        seg([['', '전체'], ['todo', '정산 전'], ['submitted', '결재 요청'], ['approved', '승인'], ['done', '완료']], stF, v => { stF = v; draw(); })));
      body.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('wallet', shortWon(sum), diff == null ? '이번 달 지출' : `지난달 대비 ${diff > 0 ? '+' : ''}${diff}%`, diff > 20 ? 'warn' : ''),
        tile('receipt', xs.length, '건수'),
        tile('clock', shortWon(pendSum), '돌려받을 돈 (개인 결제)', pendSum ? 'warn' : 'ok'),
        tile('target', budget ? Math.round(sum / budget * 100) + '%' : '–', budget ? `예산 ${shortWon(budget)}` : '예산 미설정', budget && sum > budget ? 'bad' : 'ok')));
      // 팀 결재: 팀원이 '결재 요청'으로 올린 팀 비용 → 관리자가 승인/반려
      const sync = await import('../js/sync.js');
      const admin = await sync.isAdmin(); const member = !!(await sync.me());
      const waiting = all.filter(e => e.team && e.status === 'submitted');
      if (waiting.length) body.append(h('div.card', { style: { marginBottom: '14px', borderColor: 'var(--acc)' } },
        h('div.card-h', h('h3', ic('inbox'), `결재 ${admin ? '대기' : '요청 중'} ${waiting.length}건`), h('span.mono.small', waiting.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString() + '원')),
        h('div.list', waiting.map(e => h('div.li', h('div.grow', h('div.t.small', e.title), h('div.faint.tiny', [e.by, e.date, e.category, e.pay].filter(Boolean).join(' · '))), h('span.mono.small', (Number(e.amount) || 0).toLocaleString()),
          admin ? h('button.btn.sm.ghost', { onclick: async () => { await db.patch(e.id, { status: 'todo', reviewed: '반려', reviewedBy: await db.kvGet('name', '') }); toast('반려했어요'); draw(); } }, '반려') : null,
          admin ? h('button.btn.sm.pri', { onclick: async () => { await db.patch(e.id, { status: 'approved', reviewed: '승인', reviewedBy: await db.kvGet('name', '') }); toast('승인했어요'); draw(); } }, '승인') : null)))));
      // 받을 돈: 계약금·잔금처럼 들어올 돈. 받으면 한 번 눌러 '받음'으로
      const incomes = (await db.list('incomes')).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
      const dueIn = incomes.filter(x => x.status !== 'got'), gotIn = incomes.filter(x => x.status === 'got' && (x.date || '').startsWith(month));
      if (incomes.length) { const t0 = todayStr(); const row = x => h('div.li', h('div.grow', { style: { cursor: 'pointer' }, onclick: () => editIncome(x) }, h('div.t.small', x.title), h('div.faint.tiny', [x.status === 'got' ? '받음' : x.date ? (x.date < t0 ? '받기로 한 날 지남 · ' : '') + fmtDate(x.date) : '날짜 미정', x.from, x.project, x.memo].filter(Boolean).join(' · '))),
          h('span.mono', { style: { fontWeight: 650 } }, (Number(x.amount) || 0).toLocaleString()),
          x.status === 'got' ? h('span.chip.ok', '받음') : h('button.btn.sm', { onclick: async () => { await db.patch(x.id, { status: 'got', gotAt: todayStr(), date: x.date && x.date <= todayStr() ? x.date : todayStr(), dueDate: x.date || '' }); toast('받음으로 바꿨어요', { label: '되돌리기', fn: async () => { await db.patch(x.id, { status: 'due', date: x.date || '' }); draw(); } }); draw(); } }, ic('check', 14), '받았어요'));
        body.append(h('div.card', { style: { marginBottom: '14px' } },
          h('div.card-h', h('h3', ic('wallet'), '받을 돈'), h('span.mono.small', dueIn.length ? `남은 ${dueIn.reduce((s, x) => s + (Number(x.amount) || 0), 0).toLocaleString()}원 · ${dueIn.length}건` : '다 받았어요')),
          dueIn.length ? h('div.list', dueIn.map(row)) : null,
          gotIn.length ? h('details', { style: { marginTop: '6px' } }, h('summary.small.muted', `이번 달 받은 돈 ${gotIn.reduce((s, x) => s + (Number(x.amount) || 0), 0).toLocaleString()}원 · ${gotIn.length}건`), h('div.list', gotIn.map(row))) : null)); }
      // 분류별
      const byCat = {}; xs.forEach(e => (byCat[e.category || '기타'] = (byCat[e.category || '기타'] || 0) + (Number(e.amount) || 0)));
      const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const stack = h('div', { style: { display: 'flex', height: '14px', borderRadius: '99px', overflow: 'hidden', background: 'var(--bg2)', margin: '4px 0 12px' } }, cats.map(([c, v], i) => h('div', { title: `${c} ${v.toLocaleString()}원`, style: { width: (v / sum * 100) + '%', background: COLORS[i % COLORS.length], transition: 'width .6s var(--spring)' } })));
      const byProj = {}; xs.forEach(e => e.project && (byProj[e.project] = (byProj[e.project] || 0) + (Number(e.amount) || 0)));
      body.append(h('div.grid.g2', { style: { marginBottom: '14px' } },
        h('div.card', h('div.card-h', h('h3', ic('grid'), '분류별')), sum ? stack : null, cats.length ? h('div.list', cats.map(([c, v], i) => h('div.li', h('span.dot', { style: { background: COLORS[i % COLORS.length] } }), h('div.grow.small', c), h('span.mono.small', v.toLocaleString() + '원'), h('span.faint.tiny.mono', { style: { width: '38px', textAlign: 'right' } }, Math.round(v / sum * 100) + '%')))) : h('div.empty', '이번 달 지출이 없어요')),
        h('div.card', h('div.card-h', h('h3', ic('briefcase'), '프로젝트별')), Object.keys(byProj).length ? h('div.stack', Object.entries(byProj).sort((a, b) => b[1] - a[1]).map(([p, v]) => h('div', h('div.row.between.small', h('span', p), h('span.mono', v.toLocaleString() + '원')), h('div.bar', h('i', { style: { width: (v / sum * 100) + '%', background: colorFor(p) } }))))) : h('div.empty', '#프로젝트를 붙이면 여기서 모여요'))));
      // 목록
      const list = xs.filter(e => !stF || (e.status || 'todo') === stF).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
      const c = h('div.card');
      const sel = new Set();
      const bulk = h('div.row.hide', { style: { marginBottom: '8px' } }, h('span.small.muted.grow'), ...Object.entries(ST).filter(([k]) => admin || !member || k === 'todo' || k === 'submitted').map(([k, [l]]) => h('button.btn.sm', { onclick: async () => { for (const id of sel) await db.patch(id, { status: k }); toast(`${sel.size}건 → ${l}`); draw(); } }, l)));
      c.append(bulk);
      let d0 = '';
      if (!list.length) c.append(h('div.empty', '해당하는 지출이 없어요'));
      for (const e of list) {
        if (e.date !== d0) { d0 = e.date; c.append(h('div.faint.tiny', { style: { padding: '8px 4px 2px', fontWeight: 650 } }, fmtDate(e.date))); }
        const cb = h('input', { type: 'checkbox', 'aria-label': '선택', onchange: () => { cb.checked ? sel.add(e.id) : sel.delete(e.id); bulk.classList.toggle('hide', !sel.size); bulk.firstChild.textContent = `${sel.size}건 선택`; } });
        const [sl, st] = ST[e.status || 'todo'];
        c.append(h('div.li', cb, h('div.ti', { style: { width: '32px', height: '32px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: 'var(--bg2)' } }, ic(catIcon(e.category), 16)),
          h('div.grow', { style: { cursor: 'pointer' }, onclick: () => edit(e) }, h('div.t.small', e.title), h('div.faint.tiny', [e.team ? '팀' + (e.by ? ' · ' + e.by : '') : '', e.category, e.pay, e.project, e.reviewed === '반려' ? '반려됨' : ''].filter(Boolean).join(' · '))),
          e.receiptKey ? ic('image', 14) : null, h('span.chip.' + st, sl), h('span.mono', { style: { fontWeight: 650, minWidth: '86px', textAlign: 'right' } }, (Number(e.amount) || 0).toLocaleString())));
      }
      body.append(c);
    }
    function shift(n) { const d = new Date(month + '-01'); d.setMonth(d.getMonth() + n); month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; draw(); }
    async function edit(e = { date: todayStr(), status: 'todo', pay: '개인카드', category: '기타' }) {
      const rec = h('div.row', { style: { marginTop: '6px' } });
      let receiptKey = e.receiptKey || null;
      const drawRec = async () => { clear(rec); if (receiptKey) { const b = await db.getBlob(receiptKey); if (b) rec.append(h('img', { src: URL.createObjectURL(b), style: { width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px' } })); } rec.append(h('label.btn.sm', ic('camera', 14), receiptKey ? '영수증 바꾸기' : '영수증 사진', h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' }, onchange: async ev => { const f = ev.target.files[0]; if (f) { receiptKey = await db.putBlob(await shrink(f)); drawRec(); } } }))); };
      drawRec();
      // 팀 비용의 승인·정산 완료는 관리자만 (로그인한 팀원이 자기 것을 스스로 승인하지 못하게)
      const S = await import('../js/sync.js'); const limited = !!(await S.me()) && !(await S.isAdmin());
      modal(e.id ? '지출 고치기' : '새 지출', close => {
        const f = form(FIELDS.expense.map(x => x.k === 'status' && limited ? { ...x, options: x.options.filter(o => ['todo', 'submitted', e.status].includes(o[0])) } : x), e, async v => { if (!v.category || v.category === '기타') v.category = brain.guessCategory(v.title); await db.put('expenses', { ...e, ...v, receiptKey }); close(); draw(); }, { extra: rec });
        if (e.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { await db.remove(e.id); close(); toast('지웠어요', { label: '되돌리기', fn: async () => { await db.put('expenses', { ...e, deleted: false }); draw(); } }); draw(); } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function editIncome(x = { date: '', status: 'due', team: 'auto' }) {
      modal(x.id ? '받을 돈 고치기' : '새 받을 돈', close => {
        const f = form(FIELDS.income, x, async v => { await db.put('incomes', { ...x, ...v }); close(); toast('저장했어요'); draw(); });
        if (x.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { await db.remove(x.id); close(); toast('지웠어요', { label: '되돌리기', fn: async () => { await db.put('incomes', { ...x, deleted: false }); draw(); } }); draw(); } }, ic('trash', 14), '지우기'));
        return f;
      });
    }
    async function setBudget() { const cur = await db.kvGet('budget', 0); modal('한 달 예산', close => form([{ k: 'budget', label: '예산(원)', type: 'number' }], { budget: cur }, async v => { await db.kvSet('budget', v.budget || 0); close(); draw(); })); }
    async function exportCsv() {
      const xs = (await db.list('expenses')).filter(e => (e.date || '').startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
      const rows = [['날짜', '내용', '분류', '금액', '결제수단', '프로젝트', '상태', '메모'], ...xs.map(e => [e.date, e.title, e.category, e.amount, e.pay, e.project || '', ST[e.status || 'todo'][0], (e.memo || '').replace(/\n/g, ' ')])];
      download(`지출_${month}.csv`, '﻿' + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv');
    }
    async function printReport() {
      const xs = (await db.list('expenses')).filter(e => (e.date || '').startsWith(month) && e.status !== 'done').sort((a, b) => a.date.localeCompare(b.date));
      const sum = xs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const name = await db.kvGet('name', '하진');
      const imgs = [];
      for (const e of xs) if (e.receiptKey) { const b = await db.getBlob(e.receiptKey); if (b) imgs.push([e, await db.blobToDataURL(b)]); }
      const w = window.open('', '_blank');
      if (!w) { toast('팝업이 막혔어요'); return; }
      w.document.write(`<!doctype html><meta charset="utf-8"><title>지출결의서 ${month}</title><style>body{font-family:Pretendard,system-ui,sans-serif;padding:32px;color:#111}h1{font-size:22px;text-align:center;letter-spacing:.3em}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}td,th{border:1px solid #999;padding:6px 8px}th{background:#f2f2f2}.r{text-align:right}.sign{display:flex;justify-content:flex-end;gap:0;margin-top:10px}.sign div{border:1px solid #999;width:80px;height:70px;text-align:center;font-size:12px;padding-top:4px}.imgs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}.imgs img{width:100%}@media print{button{display:none}}</style>
<button onclick="print()">인쇄 / PDF 저장</button><h1>지 출 결 의 서</h1><div class="sign"><div>작성</div><div>검토</div><div>승인</div></div>
<p>기간: ${month} · 신청자: ${name} · 합계: <b>${sum.toLocaleString()}원</b></p><table><tr><th>날짜</th><th>내용</th><th>분류</th><th>결제</th><th>프로젝트</th><th class="r">금액</th></tr>${xs.map(e => `<tr><td>${e.date}</td><td>${esc(e.title)}</td><td>${e.category}</td><td>${e.pay}</td><td>${esc(e.project || '')}</td><td class="r">${(+e.amount).toLocaleString()}</td></tr>`).join('')}<tr><th colspan="5">합계</th><th class="r">${sum.toLocaleString()}</th></tr></table>
${imgs.length ? `<h3>영수증</h3><div class="imgs">${imgs.map(([e, src]) => `<figure><img src="${src}"><figcaption>${e.date} ${esc(e.title)}</figcaption></figure>`).join('')}</div>` : ''}`);
      w.document.close();
    }
  },
};
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const shortWon = n => n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString() + '만' : n.toLocaleString();
const catIcon = c => ({ 식비: 'cake', 교통: 'right', 재료비: 'palette', 소프트웨어: 'cloud', 장비: 'camera', 회의비: 'users', 마케팅: 'trend', 교육: 'book', 인건비: 'user' }[c] || 'receipt');
// 영수증 사진은 1600px로 줄여서 저장 (용량 절약)
export async function shrink(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k;
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  } catch { return file; }
}
