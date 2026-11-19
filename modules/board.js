// 마인드맵 회의: 여러 명이 실시간으로 노드를 그리고, 말하면 노드로 쌓이고, 끝나면 AI가 정리해 회의록으로 보관
import { h, ic, clear, toast, head, modal, form, tile, todayStr, fmtDate, confirmBox, colorFor, busy, rel } from '../js/ui.js';
import * as db from '../js/db.js';
import * as brain from '../js/brain.js';
import * as store from '../js/store.js';
import * as LB from '../js/labels.js';
import * as FB from '../js/feedback.js';
import { createRecorder, hasSpeech, waveEl, fmtSec } from '../js/voice.js';
import { summaryView } from '../js/draftcard.js';
import { go, updateBadge } from '../js/app.js';

const NW = 200, GAPX = 250, GAPY = 62;
const me = () => db.kvGet('name', '하진');
const teamId = async () => ((await db.get('team-main')) ? 'team-main' : '');

export default {
  async render(root, params) { return params[0] ? canvas(root, params[0]) : list(root); },
};

async function list(root) {
  const boards = (await db.list('boards')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const nodes = await db.list('bnodes');
  root.append(head('마인드맵 회의', '같이 노드를 그리며 회의해요. 말로 한 내용도 노드로 쌓이고, 끝나면 정리해서 회의록으로 보관돼요.',
    h('a.btn.sm.ghost', { href: '#/meetings' }, ic('mic', 14), '회의록'),
    h('button.btn.sm.pri', { onclick: create }, ic('plus', 14), '새 마인드맵')));
  root.append(h('div.tiles', { style: { marginBottom: '14px' } }, tile('grid', boards.length, '마인드맵'), tile('layers', nodes.filter(n => n.kind !== 'msg').length, '노드'), tile('mic', nodes.filter(n => n.note).length, '음성 설명'), tile('check', boards.filter(b => b.meetingId).length, '회의록으로 보관')));
  const g = h('div.grid.g3');
  if (!boards.length) root.append(h('div.card', h('div.empty', '아직 마인드맵이 없어요. 새 마인드맵을 만들고 팀원과 같이 열어 보세요.')));
  for (const b of boards) {
    const ns = nodes.filter(n => n.board === b.id && n.kind !== 'msg'); const who = [...new Set(nodes.filter(n => n.board === b.id).map(n => n.by).filter(Boolean))];
    g.append(h('div.card.click.mm-card', { onclick: () => go('board/' + b.id) },
      h('div.mm-thumb', thumb(ns)),
      h('div.t', LB.find(b.label) ? h('span.dot', { style: { background: LB.colorOf(b.label), display: 'inline-block', marginRight: '6px' } }) : null, b.title),
      h('div.faint.tiny', [fmtDate(b.date || b.createdAt), `노드 ${ns.length}`, b.team ? '팀 공유' : '나만 보기', b.meetingId && '회의록 보관됨'].filter(Boolean).join(' · ')),
      h('div.row', { style: { marginTop: '8px', gap: '2px' } }, who.slice(0, 6).map(w => h('span.av', { title: w, style: { background: colorFor(w) } }, w.slice(0, 1))))));
  }
  root.append(g);
  function create() {
    modal('새 마인드맵 회의', close => form([{ k: 'title', label: '주제 (가운데 노드가 돼요)', full: true }, { k: 'label', label: '중요도 색', type: 'label', full: true }, { k: 'team', label: '공유', type: 'select', options: [['auto', '알아서 (내용 보고 정함)'], ['', '나만 보기'], ['team-main', '팀에 공유']], default: 'auto' }], {}, async v => {
      const title = v.title || `${fmtDate(new Date())} 회의`;
      const b = await db.put('boards', { title, date: todayStr(), label: v.label, team: v.team, by: await me(), voiceAuto: false });
      await db.put('bnodes', { board: b.id, kind: 'node', text: title, x: 0, y: 0, parent: '', root: true, by: await me(), team: b.team });
      close(); go('board/' + b.id);
    }, { submitLabel: '시작' }));
  }
}
// 목록용 작은 미리보기
function thumb(ns) {
  if (!ns.length) return h('div');
  const xs = ns.map(n => n.x), ys = ns.map(n => n.y); const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + NW + 40, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 60;
  const byId = new Map(ns.map(n => [n.id, n]));
  const svg = `<svg viewBox="${x0} ${y0} ${Math.max(200, x1 - x0)} ${Math.max(120, y1 - y0)}" preserveAspectRatio="xMidYMid meet">${ns.filter(n => byId.has(n.parent)).map(n => { const p = byId.get(n.parent); return `<path d="M${p.x + NW} ${p.y + 18} C${p.x + NW + 40} ${p.y + 18} ${n.x - 40} ${n.y + 18} ${n.x} ${n.y + 18}" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="3"/>`; }).join('')}${ns.map(n => `<rect x="${n.x}" y="${n.y}" width="${NW}" height="36" rx="18" fill="${n.root ? 'currentColor' : (LB.colorOf(n.label) || 'var(--card)')}" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/>`).join('')}</svg>`;
  return h('div', { html: svg });
}

async function canvas(root, id) {
  const board = await db.get(id);
  if (!board || board.deleted) { root.append(head('마인드맵을 찾을 수 없어요', null, h('a.btn', { href: '#/board' }, '목록'))); return; }
  const myName = await me();
  let nodes = new Map(), msgs = [], sel = null, view = { x: 0, y: 0, k: 1 }, auto = !!board.voiceAuto, lastAuto = null, recorder = null, peers = new Map(), pendingDraw = false;
  const world = h('div.mm-world'); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'mm-lines'); world.append(svg);
  const stage = h('div.mm-stage', world);
  const tools = h('div.mm-tools.hide');
  tools.addEventListener('pointerdown', e => { if (document.activeElement?.isContentEditable) e.preventDefault(); }); // 글 고치는 중에 도구를 눌러도 편집이 안 끊기게
  const chatList = h('div.mm-chat-list'); const chatIn = h('input', { placeholder: '말하거나 적어요', 'aria-label': '대화 입력' });
  const live = h('div.mm-live.hide');
  const peersEl = h('div.mm-peers');
  const micBtn = h('button.mm-mic', { 'aria-label': '음성 대화', title: '음성 대화 (말한 내용이 대화에 쌓여요)', onclick: toggleVoice }, ic('mic', 18));
  const autoBtn = h('button.mm-switch' + (auto ? '.on' : ''), { role: 'switch', 'aria-checked': auto, title: '켜면 말하거나 적은 내용이 알맞은 자리에 노드로 그려져요. 이상하게 그려지면 꺼 두세요.', onclick: async () => { auto = !auto; autoBtn.classList.toggle('on', auto); autoBtn.setAttribute('aria-checked', auto); await db.patch(id, { voiceAuto: auto }); toast(auto ? '이제 대화가 노드로 그려져요' : '대화는 기록만 하고 노드는 직접 그려요'); } }, h('i'), h('span', '대화 → 노드'));
  const chatPane = h('aside.mm-chat', h('div.mm-chat-h', h('b', '대화'), h('span.faint.tiny', '눌러서 노드로'), h('button.btn.sm.icon.ghost', { 'aria-label': '대화 접기', onclick: () => wrap.classList.toggle('chat-off') }, ic('x', 14))), chatList);
  const dock = h('div.mm-dock', micBtn, autoBtn, h('div.mm-in', chatIn, h('button', { 'aria-label': '보내기', onclick: () => sendChat() }, ic('send', 16))),
    h('button.mm-ib', { 'aria-label': '대화 보기', title: '대화', onclick: () => wrap.classList.toggle('chat-off') }, ic('msg', 18)));
  const zoomEl = h('div.mm-zoom', h('button', { 'aria-label': '확대', onclick: () => zoom(1.2) }, ic('plus', 16)), h('button', { 'aria-label': '축소', onclick: () => zoom(1 / 1.2) }, ic('minus', 16)), h('button', { 'aria-label': '전체 보기', title: '전체 보기', onclick: fit }, ic('grid', 16)), h('button', { 'aria-label': '자동 정리', title: '가지런히 정리', onclick: tidy }, ic('sparkles', 16)));
  const addBtn = h('button.mm-add', { 'aria-label': '노드 추가', title: '고른 노드 아래에 추가', onclick: () => addChild(sel || rootNode()?.id) }, ic('plus', 20));
  const wrap = h('div.mm' + (innerWidth < 900 ? '.chat-off' : ''), stage, live, tools, zoomEl, addBtn, peersEl, dock, chatPane);
  root.append(h('div.mm-head', h('a.btn.sm.ghost.icon', { href: '#/board', 'aria-label': '목록' }, ic('left', 16)), h('h1', board.title), LB.find(board.label) ? h('span.chip', { style: { background: `color-mix(in srgb, ${LB.colorOf(board.label)} 18%, var(--card))` } }, LB.find(board.label).name) : null, h('span.grow'),
    (await teamId()) ? h('button.btn.sm' + (board.team ? '.pri' : ''), { onclick: async () => { const t = board.team ? '' : 'team-main'; await db.patch(id, { team: t }); for (const n of [...nodes.values(), ...msgs]) await db.patch(n.id, { team: t }); toast(t ? '팀에 공유했어요' : '나만 보기로 바꿨어요'); go('board/' + id); } }, ic('users', 14), board.team ? '팀 공유 중' : '나만 보기') : null,
    h('button.btn.sm.pri', { onclick: summarize }, ic('sparkles', 14), 'AI 정리'),
    h('button.btn.sm.ghost.icon', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('이 마인드맵을 지울까요?', '지우기')) { for (const n of [...nodes.values(), ...msgs]) await db.remove(n.id); await db.remove(id); go('board'); } } }, ic('trash', 14))), wrap);

  await load(); fit();
  // 실시간: 즉시 전달(방) + 저장 동기화(변경 알림) 둘 다
  const sync = await import('../js/sync.js');
  const room = board.team ? sync.room('board-' + id, onRoom) : null;
  const hi = () => room?.send({ t: 'hi', name: myName, sel });
  hi(); const hiT = setInterval(() => { hi(); const now = Date.now(); for (const [k, v] of peers) if (now - v.at > 45000) peers.delete(k); drawPeers(); }, 15000);
  const offDb = db.onChange((col, item) => { if (col !== 'bnodes' || item.board !== id) return; applyRemote(item); });
  const onKey = e => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable || document.querySelector('.modal-bg')) return;
    if (!sel) return;
    if (e.key === 'Tab') { e.preventDefault(); addChild(sel); } else if (e.key === 'Enter') { e.preventDefault(); const n = nodes.get(sel); n.root ? addChild(sel) : addChild(n.parent, n); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNode(sel); } else if (e.key === 'F2') { e.preventDefault(); edit(sel); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) edit(sel); // 그냥 글자를 치면 바로 고치기
  };
  document.addEventListener('keydown', onKey);
  wire();
  return () => { clearInterval(hiT); offDb(); room?.close(); document.removeEventListener('keydown', onKey); if (recorder?.running) recorder.stop(); };

  // ── 데이터 ──
  async function load() {
    const all = (await db.list('bnodes')).filter(n => n.board === id);
    nodes = new Map(all.filter(n => n.kind !== 'msg').map(n => [n.id, n])); msgs = all.filter(n => n.kind === 'msg').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (!rootNode()) { const r = await db.put('bnodes', { board: id, kind: 'node', text: board.title, x: 0, y: 0, parent: '', root: true, by: myName, team: board.team }); nodes.set(r.id, r); }
    draw(); drawChat();
  }
  function rootNode() { return [...nodes.values()].find(n => n.root) || [...nodes.values()].find(n => !n.parent); }
  function kids(pid) { return [...nodes.values()].filter(n => n.parent === pid).sort((a, b) => a.y - b.y); }
  async function save(n, patch) { const it = await db.put('bnodes', { ...n, ...patch }); nodes.set(it.id, it); room?.send({ t: 'n', item: it }); return it; }
  function applyRemote(item) {
    if (item.kind === 'msg') { const i = msgs.findIndex(m => m.id === item.id); if (item.deleted) { if (i >= 0) msgs.splice(i, 1); } else if (i >= 0) msgs[i] = item; else msgs.push(item); drawChat(); return; }
    const cur = nodes.get(item.id);
    if (cur && (cur.updatedAt || '') >= (item.updatedAt || '')) return;
    if (item.deleted) nodes.delete(item.id); else nodes.set(item.id, item);
    if (document.activeElement?.isContentEditable && stage.contains(document.activeElement)) { pendingDraw = true; return; } // 내가 글을 고치는 중이면 끝난 뒤에 그림
    draw();
  }
  function onRoom(p) {
    if (p.t === 'n' && p.item?.board === id) applyRemote(p.item);
    else if (p.t === 'hi') { const isNew = !peers.has(p.name); peers.set(p.name, { at: Date.now(), sel: p.sel }); drawPeers(); if (isNew) { hi(); toast(`${p.name} 님이 들어왔어요`); } draw(); }
    else if (p.t === 'live') { live.classList.toggle('hide', !p.text); live.textContent = p.text ? `${p.name}: ${p.text}` : ''; }
  }
  function drawPeers() { clear(peersEl).append(h('span.av.me', { title: myName + ' (나)', style: { background: colorFor(myName) } }, myName.slice(0, 1)), ...[...peers.keys()].map(n => h('span.av', { title: n, style: { background: colorFor(n) } }, n.slice(0, 1)))); }

  // ── 그리기 ──
  function draw() {
    world.querySelectorAll('.mm-n').forEach(e => e.remove());
    let paths = '';
    for (const n of nodes.values()) {
      const p = nodes.get(n.parent);
      if (p) paths += `<path d="${elbow(p.x + nodeW(p), p.y + 20, n.x, n.y + 20)}"/>`;
      const lc = LB.colorOf(n.label);
      const peer = [...peers.entries()].find(([, v]) => v.sel === n.id);
      const el = h('div.mm-n' + (n.root ? '.root' : '') + (sel === n.id ? '.sel' : '') + (lc ? '.lab' : '') + (n.hint ? '.hint' : '') + (n.todo ? '.todo' : ''), { 'data-id': n.id, style: { left: n.x + 'px', top: n.y + 'px', '--lc': lc || 'transparent', outline: peer ? `2px solid ${colorFor(peer[0])}` : '' }, title: n.by ? `${n.by} · ${rel((n.updatedAt || '').slice(0, 10))}` : '' },
        lc ? h('i.mm-dot') : null, h('span.mm-t', n.text || '새 노드'),
        n.note || n.hasAudio ? h('button.mm-note', { 'aria-label': '음성 설명 보기', onclick: e => { e.stopPropagation(); showNote(n.id); } }, ic('mic', 12)) : null,
        peer ? h('span.mm-peer', { style: { background: colorFor(peer[0]) } }, peer[0]) : null);
      world.append(el);
    }
    svg.innerHTML = paths;
    placeTools();
    drawPeers();
  }
  function nodeW(n) { return (world.querySelector(`.mm-n[data-id="${n.id}"]`)?.offsetWidth) || Math.min(260, 40 + (n.text || '').length * 14); }
  function elbow(x1, y1, x2, y2) {
    if (x2 < x1 + 24) return `M${x1} ${y1} C${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`;
    const mx = x1 + Math.min(40, (x2 - x1) / 2), r = Math.min(14, Math.abs(y2 - y1) / 2), d = y2 > y1 ? 1 : -1;
    if (Math.abs(y2 - y1) < 2) return `M${x1} ${y1} H${x2}`;
    return `M${x1} ${y1} H${mx - r} Q${mx} ${y1} ${mx} ${y1 + r * d} V${y2 - r * d} Q${mx} ${y2} ${mx + r} ${y2} H${x2}`;
  }
  function applyView() { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; placeTools(); }
  function zoom(f, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) { const k = Math.max(.3, Math.min(2.2, view.k * f)); view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; applyView(); }
  function fit() {
    const ns = [...nodes.values()]; if (!ns.length) return;
    const x0 = Math.min(...ns.map(n => n.x)) - 40, x1 = Math.max(...ns.map(n => n.x + NW)) + 40, y0 = Math.min(...ns.map(n => n.y)) - 40, y1 = Math.max(...ns.map(n => n.y)) + 80;
    const W = stage.clientWidth || 800, H = (stage.clientHeight || 500) - 90;
    view.k = Math.max(.35, Math.min(1.1, Math.min(W / (x1 - x0), H / (y1 - y0))));
    view.x = (W - (x1 - x0) * view.k) / 2 - x0 * view.k; view.y = (H - (y1 - y0) * view.k) / 2 - y0 * view.k + 10; applyView();
  }
  // 색은 글을 고치는 중에도 바로 보이게 (전체를 다시 그리지 않고 그 노드만)
  function paintLabel(nid) {
    const n = nodes.get(nid), el = world.querySelector(`.mm-n[data-id="${nid}"]`); if (!n || !el) return;
    const lc = LB.colorOf(n.label); el.classList.toggle('lab', !!lc); el.style.setProperty('--lc', lc || 'transparent');
    const dot = el.querySelector('.mm-dot'); if (lc && !dot) el.prepend(h('i.mm-dot')); if (!lc && dot) dot.remove();
  }
  function placeTools() {
    const n = nodes.get(sel); if (!n) { tools.classList.add('hide'); return; }
    const el = world.querySelector(`.mm-n[data-id="${n.id}"]`); if (!el) return;
    clear(tools).append(
      h('button', { title: '하위 노드 (Tab)', onclick: () => addChild(n.id) }, ic('plus', 15), '하위'),
      n.root ? null : h('button', { title: '옆 노드 (Enter)', onclick: () => addChild(n.parent, n) }, ic('plus', 15), '옆'),
      h('button', { title: '글 고치기', 'aria-label': '글 고치기', onclick: () => edit(n.id) }, ic('edit', 15)),
      h('button', { title: '음성으로 설명 달기', 'aria-label': '음성 설명', onclick: () => recordNote(n.id) }, ic('mic', 15)),
      h('span.mm-colors', [{ id: '', color: 'var(--line2)', name: '색 없음' }, ...LB.all()].map(l => h('button.c' + ((n.label || '') === l.id ? '.on' : ''), { title: l.name, 'aria-label': l.name, style: { background: l.color }, onclick: async () => { const cur = nodes.get(n.id) || n; await save(cur, { label: l.id }); paintLabel(n.id); placeTools(); } }))),
      n.root ? null : h('button.danger', { title: '지우기 (Delete)', 'aria-label': '지우기', onclick: () => removeNode(n.id) }, ic('trash', 15)));
    tools.classList.remove('hide');
    const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const tw = tools.offsetWidth || 300;
    tools.style.left = Math.max(8, Math.min(stage.clientWidth - tw - 8, r.left - w.left + r.width / 2 - tw / 2)) + 'px';
    tools.style.top = Math.max(8, r.top - w.top - 52) + 'px';
  }
  function select(nid) { sel = nid; { const hn = nodes.get(nid); if (hn?.hint) save(hn, { hint: false }).then(() => world.querySelector(`.mm-n[data-id="${nid}"]`)?.classList.remove('hint')); } world.querySelectorAll('.mm-n').forEach(e => e.classList.toggle('sel', e.dataset.id === nid)); placeTools(); hi(); }

  // ── 편집 ──
  function freeY(parent, x) { const ks = kids(parent.id); let y = ks.length ? Math.max(...ks.map(k => k.y)) + GAPY : parent.y; const hit = () => [...nodes.values()].some(n => Math.abs(n.x - x) < NW && Math.abs(n.y - y) < GAPY - 8); let guard = 0; while (hit() && guard++ < 200) y += GAPY; return y; }
  async function addChild(pid, after, text = '', extra = {}) {
    const p = nodes.get(pid) || rootNode(); if (!p) return null;
    const x = p.x + Math.max(GAPX, nodeW(p) + 60);
    // 먼저 화면에 그리고(바로 글을 칠 수 있게) 저장은 뒤에서
    const n = { id: db.uid(), board: id, kind: 'node', parent: p.id, x, y: after ? after.y + GAPY : freeY(p, x), text, by: myName, team: board.team, ...extra };
    const shift = after ? kids(p.id).filter(k => k.y >= n.y) : [];
    for (const k of shift) k.y += GAPY;
    nodes.set(n.id, n); draw(); select(n.id); if (!text) edit(n.id);
    save(n, {}).then(async () => { for (const k of shift) await save(k, {}); });
    return n;
  }
  function edit(nid) {
    const el = world.querySelector(`.mm-n[data-id="${nid}"] .mm-t`); const n0 = nodes.get(nid); if (!el || !n0) return; const n = n0;
    el.contentEditable = 'true'; el.focus(); document.getSelection().selectAllChildren(el);
    const done = async () => { el.contentEditable = 'false'; el.removeEventListener('blur', done); const t = el.textContent.trim().slice(0, 120); const n = nodes.get(nid) || n0; pendingDraw = false; if (!t && !n.root && !kids(nid).length && !n.label && !n.note) return removeNode(nid, true); if (t !== n.text) await save(n, { text: t || n.text || '새 노드' }); draw(); };
    el.addEventListener('blur', done);
    el.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = n.text; el.blur(); } e.stopPropagation(); };
  }
  async function removeNode(nid, quiet) {
    const n = nodes.get(nid); if (!n || n.root) return;
    const sub = []; const walk = i => { sub.push(i); kids(i).forEach(k => walk(k.id)); }; walk(nid);
    if (!quiet && sub.length > 1 && !(await confirmBox(`아래 노드 ${sub.length - 1}개도 같이 지울까요?`, '지우기'))) return;
    for (const i of sub) { const it = await db.put('bnodes', { ...nodes.get(i), deleted: true }); nodes.delete(i); room?.send({ t: 'n', item: it }); }
    sel = n.parent; draw();
  }
  async function tidy() {
    const r = rootNode(); if (!r) return; let row = 0;
    const lay = async (n, depth) => { const ks = kids(n.id); const x = r.x + depth * GAPX; let y; if (!ks.length) { y = r.y + row * GAPY; row++; } else { const ys = []; for (const k of ks) ys.push(await lay(k, depth + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; } if (n.x !== x || n.y !== y) await save(n, { x, y }); return y; };
    await lay(r, 0); draw(); fit(); toast('가지런히 정리했어요');
  }

  // ── 포인터: 노드 끌기, 배경 끌어 이동, 두 손가락 확대 ──
  function wire() {
    const pts = new Map(); let drag = null, pinch = null;
    stage.addEventListener('pointerdown', e => {
      if (e.target.isContentEditable || e.target.closest('.mm-note')) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k: view.k }; drag = null; return; }
      const el = e.target.closest('.mm-n');
      if (el) { const n = nodes.get(el.dataset.id); const sub = []; const walk = i => { sub.push(nodes.get(i)); kids(i).forEach(k => walk(k.id)); }; walk(n.id); drag = { n, sub: sub.map(s => ({ s, x: s.x, y: s.y })), sx: e.clientX, sy: e.clientY, moved: false }; }
      else drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, e);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); const r = stage.getBoundingClientRect(); const f = (pinch.k * d / pinch.d) / view.k; zoom(f, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); return; }
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return; drag.moved = true;
      if (drag.pan) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); return; }
      for (const { s, x, y } of drag.sub) { s.x = Math.round(x + dx / view.k); s.y = Math.round(y + dy / view.k); const el = world.querySelector(`.mm-n[data-id="${s.id}"]`); if (el) { el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; } }
      let paths = ''; for (const n of nodes.values()) { const p = nodes.get(n.parent); if (p) paths += `<path d="${elbow(p.x + nodeW(p), p.y + 20, n.x, n.y + 20)}"/>`; } svg.innerHTML = paths; placeTools();
    });
    const up = async e => {
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      const d = drag; drag = null; if (!d) return;
      if (d.pan) { if (!d.moved) select(null); return; }
      if (!d.moved) { if (sel === d.n.id && e.detail >= 2) edit(d.n.id); else select(d.n.id); return; }
      for (const { s } of d.sub) await save(s, { x: s.x, y: s.y });
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', e => { const el = e.target.closest('.mm-n'); if (el) edit(el.dataset.id); });
    stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40) zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); } }, { passive: false });
    chatIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendChat(); } });
  }

  // ── 대화 (글·음성) → 기록, 켜져 있으면 노드로 ──
  async function sendChat(text = chatIn.value, origin = 'text') {
    text = String(text).trim(); if (!text) return; if (origin === 'text') chatIn.value = '';
    { const lastM = msgs[msgs.length - 1]; if (lastM && lastM.by === myName && lastM.text === text && Date.now() - new Date(lastM.createdAt) < 8000) return; } // 같은 말이 두 번 들어오는 것 막기
    const m = await db.put('bnodes', { board: id, kind: 'msg', text, by: myName, origin, team: board.team }); if (!msgs.some(x => x.id === m.id)) msgs.push(m); room?.send({ t: 'n', item: m });
    if (auto) { const made = await toNodes(text, m.id); if (made.length) { await db.patch(m.id, { nodeIds: made.map(n => n.id) }); m.nodeIds = made.map(n => n.id); } }
    drawChat();
  }
  // 말한 문장을 알맞은 가지에 붙이기: 겹치는 낱말이 많은 노드 아래 → 없으면 방금 붙인 노드 옆 → 고른 노드 → 가운데
  async function toNodes(text, msgId) {
    const O = await import('../js/outline.js'); const made = [];
    const norm = t => (t || '').replace(/\s+/g, '').toLowerCase();
    const findTopic = t => { const k = norm(t); let hit = [...nodes.values()].find(n => !n.hint && norm(n.text) === k); if (hit) return hit;
      const toks = new Set(brain.tokens(t)); let best = null, bs = 0; for (const n of nodes.values()) { if (n.hint) continue; let sc = 0; const nt = brain.tokens(n.text || ''); for (const w of nt) if (toks.has(w)) sc += 1; sc = sc / Math.max(1, Math.max(nt.length, toks.size)); if (n.root) sc *= .5; if (sc > bs) { bs = sc; best = n; } } return bs >= .6 ? best : null; };
    const childOf = (p, t) => [...nodes.values()].find(n => n.parent === p.id && norm(n.text) === norm(t));
    for (const g of O.structure(text)) {
      let parent, fresh = false;
      if (g.topic) { parent = findTopic(g.topic); if (!parent) { parent = await addChildQuiet(rootNode(), g.topic, { fromMsg: msgId, autoMade: true }); made.push(parent); fresh = true; } }
      else parent = (lastAuto && nodes.has(lastAuto.id) && Date.now() - lastAuto.at < 25000) ? nodes.get(lastAuto.id) : (nodes.get(sel) || rootNode());
      for (const pt of g.points) { const ex = childOf(parent, pt.text); if (ex) { if (ex.hint) await save(ex, { hint: false }); continue; } made.push(await addChildQuiet(parent, pt.text, { label: pt.label, todo: pt.todo, note: text.length > 40 ? text : '', fromMsg: msgId, autoMade: true })); }
      // 말하지 않았어도 이 주제에서 보통 챙기는 것들을 흐리게 제안 (누르면 진짜 노드가 됨)
      // 주제를 꺼낸 말("○○ 회의를 할 거야")이면 기본 가지를 한 번에 깔아 줌
      for (const hn of g.set || []) if (!childOf(parent, hn)) made.push(await addChildQuiet(parent, hn, { fromMsg: msgId, autoMade: true, preset: true }));
      if (fresh) for (const hn of g.hints) if (!childOf(parent, hn)) await addChildQuiet(parent, hn, { hint: true, fromMsg: msgId, autoMade: true });
      lastAuto = { id: parent.id, at: Date.now() };
    }
    if (made.length) { draw(); made.forEach(n => world.querySelector(`.mm-n[data-id="${n.id}"]`)?.classList.add('pop')); follow(made[made.length - 1]); }
    return made;
  }
  // 새로 생긴 노드가 화면 밖이면 그쪽으로 살짝 옮겨 줌
  function follow(n) { const el = world.querySelector(`.mm-n[data-id="${n.id}"]`); if (!el) return; const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); const dx = r.right > s.right - 40 ? s.right - 40 - r.right : r.left < s.left + 20 ? s.left + 20 - r.left : 0, dy = r.bottom > s.bottom - 110 ? s.bottom - 110 - r.bottom : r.top < s.top + 70 ? s.top + 70 - r.top : 0; if (dx || dy) { view.x += dx; view.y += dy; applyView(); } }
  async function addChildQuiet(p, text, extra) { const x = p.x + Math.max(GAPX, nodeW(p) + 60); return save({ board: id, kind: 'node', parent: p.id, x, y: freeY(p, x), text, by: myName, team: board.team, ...extra }, {}); }
  function drawChat() {
    clear(chatList);
    if (!msgs.length) chatList.append(h('p.faint.small', { style: { padding: '10px' } }, '마이크를 켜고 말하거나 아래에 적으면 여기에 쌓여요. “대화 → 노드”를 켜면 알아서 가지에 붙어요.'));
    for (const m of msgs.slice(-80)) chatList.append(h('div.mm-msg' + (m.by === myName ? '.mine' : ''), h('span.av', { style: { background: colorFor(m.by || '?') } }, (m.by || '?').slice(0, 1)),
      h('div.grow', h('div.tiny.faint', `${m.by || ''} · ${(m.createdAt || '').slice(11, 16)}${m.origin === 'voice' ? ' · 음성' : ''}`), h('div.small', m.text)),
      m.nodeIds?.length ? h('span.chip.ok', { title: '노드로 그려짐' }, ic('check', 10)) : h('button.btn.sm.icon.ghost', { title: '노드로 만들기', 'aria-label': '노드로 만들기', onclick: async () => { const made = await toNodes(m.text, m.id); if (made.length) { await db.patch(m.id, { nodeIds: made.map(n => n.id) }); m.nodeIds = made.map(n => n.id); drawChat(); } } }, ic('plus', 14))));
    chatList.scrollTop = chatList.scrollHeight;
  }
  async function toggleVoice() {
    if (recorder?.running) { await recorder.stop(); recorder = null; micBtn.classList.remove('rec'); live.classList.add('hide'); room?.send({ t: 'live', name: myName, text: '' }); return; }
    if (!hasSpeech()) { toast('이 브라우저는 실시간 받아쓰기를 지원하지 않아요. 크롬·사파리에서 열거나, 아래 칸에 적어 주세요.'); return; }
    recorder = createRecorder({ record: false, onInterim: t => { live.classList.toggle('hide', !t); live.textContent = t ? `${myName}: ${t}` : ''; room?.send({ t: 'live', name: myName, text: t.slice(-60) }); }, onText: (_full, piece) => { if (piece) sendChat(piece, 'voice'); } });
    try { await recorder.start(); micBtn.classList.add('rec'); toast(auto ? '듣고 있어요. 말한 내용이 노드로 그려져요' : '듣고 있어요. 말한 내용이 대화에 쌓여요'); } catch (e) { toast(e.message); recorder = null; }
  }

  // ── 노드에 음성 설명 ──
  function recordNote(nid) {
    const n = nodes.get(nid); let rec = null, sec = 0, timer = 0;
    modal(`“${n.text}” 설명 달기`, close => {
      const ta = h('textarea.in', { rows: 5, placeholder: '녹음하면 말한 내용이 여기 글로 적혀요. 직접 적어도 돼요.' }, n.note || '');
      const wave = waveEl(26); const tm = h('span.mono.small', '0:00');
      const btn = h('button.btn.pri', { type: 'button', onclick: async () => {
        if (rec?.running) { const r = await rec.stop(); clearInterval(timer); btn.lastChild.textContent = ' 다시 녹음'; if (r.blob) { await db.putBlob(r.blob, 'bn:' + nid); await save(nodes.get(nid), { hasAudio: true, audioSec: r.seconds, audioBy: myName }); } if (r.text && !ta.value.includes(r.text)) ta.value = (ta.value ? ta.value + '\n' : '') + r.text; if (!r.text && r.blob) toast('녹음은 저장했어요. 이 브라우저는 실시간 받아쓰기가 안 돼서 “글로 바꾸기”를 눌러 주세요'); return; }
        const base = ta.value; rec = createRecorder({ onLevel: v => wave.level(v), onInterim: t => { ta.value = (base ? base + '\n' : '') + (rec._full || '') + ' ' + t; }, onText: full => { rec._full = full; ta.value = (base ? base + '\n' : '') + full; } });
        try { await rec.start(); btn.lastChild.textContent = ' 녹음 끝'; sec = 0; timer = setInterval(() => (tm.textContent = fmtSec(++sec)), 1000); } catch (e) { toast(e.message); }
      } }, ic('mic', 14), ' 녹음 시작');
      const stt = h('button.btn', { type: 'button', onclick: async e => { const b = e.currentTarget; const blob = await db.getBlob('bn:' + nid); if (!blob) return toast('먼저 녹음해 주세요'); const ext = await import('../js/ext.js'); if (!(await ext.isReady('stt'))) { toast('설정 → 확장 두뇌에서 음성인식 모델을 먼저 받아 주세요'); return; } busy(b, true, '글로 바꾸는 중'); try { const r = await ext.transcribe(blob); ta.value = (ta.value ? ta.value + '\n' : '') + r.text; } catch (er) { toast('받아쓰기 실패: ' + er.message); } busy(b, false); } }, ic('wave', 14), '글로 바꾸기');
      return h('div.stack', h('div.row', btn, stt, wave, tm), ta, h('div.modal-f', h('button.btn.pri', { onclick: async () => { if (rec?.running) await rec.stop(); clearInterval(timer); await save(nodes.get(nid), { note: ta.value.trim() }); close(); draw(); toast('설명을 달았어요. 노드의 마이크를 누르면 글로 보여요'); } }, '저장')));
    }, { onClose: () => { if (rec?.running) rec.stop(); clearInterval(timer); } });
  }
  async function showNote(nid) {
    const n = nodes.get(nid); const blob = await db.getBlob('bn:' + nid);
    modal(n.text, close => h('div.stack',
      blob ? h('audio', { controls: true, src: URL.createObjectURL(blob), style: { width: '100%' } }) : n.hasAudio ? h('p.faint.tiny', `녹음 원본은 ${n.audioBy || '녹음한 사람'} 님 기기에 있어요. 글로 바뀐 내용은 아래에서 볼 수 있어요.`) : null,
      h('div.mm-notebox', n.note || '아직 글로 바뀐 내용이 없어요.'),
      h('div.faint.tiny', [n.by, n.audioSec ? fmtSec(n.audioSec) : ''].filter(Boolean).join(' · ')),
      h('div.modal-f', h('button.btn', { onclick: () => { close(); recordNote(nid); } }, ic('edit', 14), '고치기·다시 녹음'))));
  }

  // ── AI 정리 → 회의록으로 보관 ──
  function outline() {
    const lines = []; const walk = (n, d) => { lines.push(`${'  '.repeat(d)}${d ? '- ' : '■ '}${n.text}${LB.find(n.label) ? ` [${LB.find(n.label).name}]` : ''}${n.note ? ` (${n.note.replace(/\n/g, ' ')})` : ''}`); kids(n.id).forEach(k => walk(k, d + 1)); };
    const r = rootNode(); if (r) walk(r, 0); return lines.join('\n');
  }
  async function summarize() {
    const ns = [...nodes.values()].filter(n => !n.root && !n.hint);
    if (!ns.length && !msgs.length) return toast('노드나 대화가 있어야 정리할 수 있어요');
    const speak = msgs.map(m => m.text).join('. ');
    const pathOf = n => { const p = []; let c = n; while (c && !c.root) { p.unshift(c.text); c = nodes.get(c.parent); } return p.join(' › '); };
    const text = [...ns.map(n => (n.note || n.text).replace(/\n/g, ' ')), speak].filter(Boolean).join('. ');
    const people = [...new Set([...ns, ...msgs].map(n => n.by).filter(Boolean)), ...(await store.teammateNames())];
    let a = brain.analyzeNotes(text, { people });
    // 마인드맵 구조를 요약에 반영: 큰 가지별 한 줄, 색 라벨로 결정·아이디어 보강
    const r = rootNode(); const branches = kids(r.id).map(b => { const sub = []; const walk = i => kids(i).forEach(k => { sub.push(k.text); walk(k.id); }); walk(b.id); return `${b.text}${sub.length ? ': ' + sub.slice(0, 5).join(', ') + (sub.length > 5 ? ` 외 ${sub.length - 5}` : '') : ''}`; });
    a.summary = [...branches.slice(0, 8), ...a.summary.filter(s => !branches.some(b => b.includes(s.slice(0, 10)))).slice(0, 3)];
    a.decisions = [...new Set([...ns.filter(n => n.label === 'important' || n.label === 'urgent').map(pathOf), ...a.decisions])];
    a.ideas = [...new Set([...ns.filter(n => n.label === 'idea').map(pathOf), ...a.ideas])];
    a = await FB.refine(a, text);
    await db.patch(id, { summary: a, summaryAt: db.now() });
    modal('AI 정리', close => h('div',
      summaryView(a),
      a.learnedUsed?.length ? h('div.learned-used', ic('sparkles', 12), '지난 피드백 반영:', a.learnedUsed.map(x => h('span.chip', x))) : null,
      FB.widget({ kind: 'board', ref: id, source: text.slice(0, 300), shared: !!board.team, onLearn: () => { close(); summarize(); } }),
      h('div.modal-f', h('button.btn.pri', { onclick: async () => {
        const transcript = `${outline()}\n\n[대화]\n${msgs.map(m => `${m.by}: ${m.text}`).join('\n')}`;
        const cur = board.meetingId && (await db.get(board.meetingId));
        const m = await db.put('meetings', { ...(cur && !cur.deleted ? cur : {}), title: board.title, date: board.date || todayStr(), attendees: people.slice(0, 12).join(', '), transcript, boardId: id, label: board.label, team: board.team, seconds: 0 });
        await db.patch(id, { meetingId: m.id }); board.meetingId = m.id;
        const { analyze } = await import('./meetings.js'); await analyze(m);
        const d = (await store.drafts()).find(x => x.sourceRef === m.id && x.kind === 'summary'); if (d) await db.patch(d.id, { data: { ...d.data, ...a, title: `${board.title} 요약` } }); await db.patch(m.id, { summaryDraft: a });
        updateBadge(); close(); toast('회의록으로 보관했어요. 할 일·일정은 확인 대기함에 있어요', { label: '회의록 보기', fn: () => go('meetings/' + m.id) });
      } }, ic('file', 14), board.meetingId ? '회의록 다시 보관' : '회의록으로 보관'))), { wide: true });
  }
}
