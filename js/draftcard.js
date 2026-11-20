import { h, ic, modal, form, toast, md, KIND_RULE } from './ui.js';
import * as store from './store.js';
import * as db from './db.js';
import { FIELDS, describe } from './fields.js';

export function confBars(c) {
  const n = Math.round((c || 0.5) * 4);
  return h('span.conf', { title: `확신도 ${Math.round((c || .5) * 100)}%` }, [0, 1, 2, 3].map(i => h('i' + (i < n ? '.on' : ''))));
}

// 확인 대기함 카드 하나. onDone(status) 호출
function placeRow(e) { const q = [e.area && !(e.place || '').includes(e.area) ? e.area : '', e.place].filter(Boolean).join(' '); const a = (href, t) => h('a.chip', { href, target: '_blank', rel: 'noopener' }, ic('pin', 12), t);
  return h('div.chips', { style: { marginTop: '6px' } }, e.addr ? h('span.faint.tiny', `${e.placeBy || '지도'}에서 찾은 주소예요`) : h('span.faint.tiny', '주소는 못 찾았어요. 지도에서 확인해 주세요'), e.mapUrl ? a(e.mapUrl, '장소 정보') : null, a('https://map.naver.com/p/search/' + encodeURIComponent(q), '네이버 지도'), a('https://map.kakao.com/?q=' + encodeURIComponent(q), '카카오맵')); }
export function draftCard(d, onDone) {
  const k = store.KINDS[d.kind] || { label: d.kind, icon: 'file' };
  const el = h('div.draft', { 'data-did': d.id, 'data-kind': d.kind });
  const swapTo = d.kind === 'event' ? 'task' : d.kind === 'task' ? 'event' : '';
  const swap = async () => { const cur = await fresh(); if (!cur) return; const nd = await store.changeKind(cur, swapTo); toast(`${store.KINDS[swapTo].label}(으)로 바꿨어요. 다음부터 비슷한 말은 이렇게 알아들을게요.`); el.replaceWith(draftCard(nd, onDone)); };
  const why = swapTo ? h('div.why', h('span', d.kind === 'event' ? `${KIND_RULE.event}이라 일정이에요. 확정하면 캘린더에 들어가요.` : `${KIND_RULE.task}이라 할 일이에요. 끝내면 체크해요.`), h('button', { type: 'button', onclick: swap }, d.kind === 'event' ? '할 일로 바꾸기' : '일정으로 바꾸기')) : null;
  // 말로 고친 뒤일 수 있으니, 누르는 순간의 최신 내용으로 처리
  const fresh = async () => { const cur = await db.get(d.id); if (!cur || cur.status !== 'pending') { finish(cur?.status === 'approved' ? 'approved' : 'rejected', true); return null; } d = cur; return cur; };
  const title = d.kind === 'summary' ? (d.data.title || '요약') : (d.data.title || d.data.name || '(제목 없음)');
  const body = h('div.grow',
    h('div.row.nowrap', h('span.chip' + (d.kind === 'task' ? '.ok' : '.acc'), k.label), confBars(d.confidence), h('span.faint.tiny', d.origin === 'meeting' ? '회의에서' : d.origin === 'voice' ? '음성에서' : d.origin === 'palette' ? '빠른 입력' : '')),
    h('div.t', { style: { marginTop: '4px', fontWeight: 650 } }, title),
    d.kind === 'summary' ? summaryView(d.data) : h('div.faint.small', describe(d.kind, d.data)),
    d.kind === 'event' && (d.data.place || d.data.area) ? placeRow(d.data) : null,
    why,
    d.source && d.kind !== 'summary' ? h('div.faint.tiny.src', { style: { marginTop: '4px' } }, '“' + d.source.slice(0, 120) + (d.source.length > 120 ? '…' : '') + '”') : null,
    h('div.row', { style: { marginTop: '8px', gap: '6px' } },
      h('button.btn.sm.pri', { onclick: async () => { const cur = await fresh(); if (!cur) return; finish('approved', false, await store.approve(cur)); } }, ic('check', 14), '확정'),
      d.kind !== 'summary' ? h('button.btn.sm', { onclick: () => edit() }, ic('edit', 14), '고치기') : null,
      d.kind !== 'summary' ? kindMenu() : null,
      h('button.btn.sm.ghost', { onclick: async () => { const cur = await fresh(); if (!cur) return; await store.reject(cur); finish('rejected'); toast('버렸어요', { label: '되살리기', fn: async () => { await db.patch(cur.id, { status: 'pending' }); const nd = await db.get(cur.id); el.replaceWith(draftCard(nd, onDone)); onDone && onDone('pending'); } }); } }, '버리기')));
  el.append(h('div.k', ic(k.icon)), body);

  function finish(st, quiet, saved) {
    el.classList.add(st === 'approved' ? 'done' : 'gone');
    el.querySelectorAll('button, select').forEach(b => (b.disabled = true));
    // 확정하면 어디에 들어갔는지 알려 주고, 바로 가 볼 수 있게 함
    if (st === 'approved' && saved && saved.col) { const kk = Object.values(store.KINDS).find(x => x.col === saved.col && x === k) || Object.values(store.KINDS).find(x => x.col === saved.col) || k;
      import('./where.js').then(W => W.placeOf(d.kind, saved)).then(at => { body.append(h('a.small', { href: '#/' + at.route, style: { display: 'inline-block', marginTop: '6px', fontWeight: 650 } }, `${at.where}에 넣었어요 · 보기`)); if (!quiet) toast(`${at.where}에 넣었어요`, { label: '보기', fn: () => { location.hash = '#/' + at.route; } }); }).catch(() => { if (!quiet) toast(`${kk.label} 확정했어요`); }); }
    else if (st === 'approved' && !quiet) toast(`${k.label} 확정했어요`);
    onDone && onDone(st, el);
  }
  function edit() {
    const fields = FIELDS[d.kind] || FIELDS.note;
    modal(`${k.label} 고치기`, close => form(fields, d.data, async vals => {
      const cur = await fresh(); if (!cur) { close(); return; }
      const merged = { ...cur.data, ...vals };
      const saved = await store.approve(cur, merged);
      close(); finish('approved', false, saved);
    }, { submitLabel: '고쳐서 확정' }));
  }
  function kindMenu() {
    const sel = h('select.in', { 'aria-label': '종류 바꾸기', style: { width: 'auto', padding: '4px 8px', fontSize: '13px' }, onchange: async () => { const cur = await fresh(); if (!cur) return; const nd = await store.changeKind(cur, sel.value); toast(`${store.KINDS[sel.value].label}(으)로 바꿨어요. 다음부터 비슷한 말은 이렇게 알아들을게요.`); const repl = draftCard(nd, onDone); el.replaceWith(repl); } },
      Object.entries(store.KINDS).filter(([key, v]) => v.col && key !== 'meeting').map(([key, v]) => h('option', { value: key, selected: key === d.kind }, v.label)));
    return sel;
  }
  return el;
}

export function summaryView(s) {
  const sec = (t, arr, icn) => arr && arr.length ? h('div', { style: { marginTop: '8px' } }, h('div.small', { style: { fontWeight: 650, display: 'flex', gap: '6px', alignItems: 'center' } }, ic(icn, 14), t, h('span.faint', arr.length)), h('ul', { style: { margin: '4px 0', paddingLeft: '18px' } }, arr.map(x => h('li.small', typeof x === 'string' ? x : x.title)))) : null;
  return h('div',
    s.keywords?.length ? h('div.chips', { style: { marginTop: '6px' } }, s.keywords.map(k => h('span.chip', '#' + k))) : null,
    sec('요약', s.summary, 'sparkles'), sec('결정', s.decisions, 'check'), sec('할 일', s.actions, 'check2'), sec('질문·고민', s.questions, 'msg'), sec('아이디어', s.ideas, 'bulb'));
}
