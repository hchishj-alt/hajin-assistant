// 하진 정리 (Hajin Tidy) — 피그마 파일 정리용 자체 플러그인
// 설치: Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → 이 폴더의 manifest.json
figma.showUI(__html__, { width: 360, height: 620, themeColors: true });

const DEFAULT_RE = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Text|Image|Component|Instance|Union|Subtract|Intersect|Exclude|Section|Slice)( \d+)?$/;

function scope(useSel) {
  if (useSel && figma.currentPage.selection.length) return figma.currentPage.selection;
  return figma.currentPage.children;
}
function walk(nodes, fn) { for (const n of nodes) { fn(n); if ('children' in n) walk(n.children, fn); } }

function guessName(n) {
  if (n.type === 'TEXT') { const t = n.characters.replace(/\s+/g, ' ').trim().slice(0, 24); return t ? `Text/${t}` : 'Text'; }
  if (n.type === 'INSTANCE' && n.mainComponent) return n.mainComponent.name;
  if ('children' in n) {
    const texts = n.findAll ? n.findAll(c => c.type === 'TEXT') : [];
    const label = texts[0] ? texts[0].characters.replace(/\s+/g, ' ').trim().slice(0, 18) : '';
    const hasFill = 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.visible !== false);
    const radius = 'cornerRadius' in n && typeof n.cornerRadius === 'number' ? n.cornerRadius : 0;
    const w = n.width, h = n.height;
    if (texts.length === 1 && hasFill && radius > 0 && h <= 72) return `Button/${label}`;
    if (n.layoutMode === 'HORIZONTAL' && h <= 80 && texts.length <= 6 && n.parent && n.parent.type === 'PAGE') return `Nav/${label || 'Bar'}`;
    if (texts.length >= 1 && w < 520 && h < 520 && hasFill) return `Card/${label || 'Card'}`;
    if (n.layoutMode && n.layoutMode !== 'NONE') return `${n.layoutMode === 'HORIZONTAL' ? 'Row' : 'Stack'}${label ? '/' + label : ''}`;
    if (n.parent && n.parent.type === 'PAGE') return `Screen/${label || 'Untitled'}`;
    return label ? `Group/${label}` : 'Group';
  }
  if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE') {
    const img = 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE');
    if (img) return 'Image';
    if (n.width > 300 && n.height > 300) return 'Background';
    if (n.height <= 2 || n.width <= 2) return 'Divider';
    return n.type === 'ELLIPSE' ? 'Dot' : 'Shape';
  }
  if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') return n.width <= 48 && n.height <= 48 ? 'Icon' : 'Vector';
  return n.name;
}

const ACTIONS = {
  rename({ useSel }) {
    let c = 0;
    walk(scope(useSel), n => { if (DEFAULT_RE.test(n.name)) { const nn = guessName(n); if (nn && nn !== n.name) { n.name = nn; c++; } } });
    return `레이어 ${c}개 이름을 정리했어요`;
  },
  arrange({ useSel, gap = 120, perRow = 6, sort = true }) {
    let frames = scope(useSel).filter(n => n.parent.type === 'PAGE' && 'x' in n && n.type !== 'SECTION');
    if (sort) frames = frames.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    if (!frames.length) return '정렬할 프레임이 없어요';
    let x0 = Math.min(...frames.map(f => f.x)), y0 = Math.min(...frames.map(f => f.y)), x = x0, y = y0, rowH = 0;
    frames.forEach((f, i) => { if (i && i % perRow === 0) { x = x0; y += rowH + gap; rowH = 0; } f.x = x; f.y = y; x += f.width + gap; rowH = Math.max(rowH, f.height); });
    return `프레임 ${frames.length}개를 ${perRow}개씩 정렬했어요`;
  },
  cleanup({ useSel, removeHidden = false }) {
    let empty = 0, hidden = 0; const del = [];
    walk(scope(useSel), n => { if ((n.type === 'GROUP' || n.type === 'FRAME') && 'children' in n && n.children.length === 0 && n.parent.type !== 'PAGE') del.push(n); if (removeHidden && n.visible === false) del.push(n); });
    for (const n of del) { try { if (!n.removed) { n.visible === false ? hidden++ : empty++; n.remove(); } } catch (e) { } }
    return `빈 그룹 ${empty}개${removeHidden ? `, 숨긴 레이어 ${hidden}개` : ''}를 지웠어요`;
  },
  async pages({ names }) {
    const want = names && names.length ? names : ['📌 Cover', '🧭 Flow', '🎨 Design', '🧩 Components', '🧪 Playground', '🗂 Archive'];
    let made = 0;
    for (const nm of want) if (!figma.root.children.some(p => p.name === nm)) { const p = figma.createPage(); p.name = nm; made++; }
    // 순서 맞추기
    want.forEach((nm, i) => { const p = figma.root.children.find(pp => pp.name === nm); if (p) figma.root.insertChild(i, p); });
    return `페이지 ${made}개를 만들고 순서를 맞췄어요`;
  },
  async cover({ title, status, author, accent = '#4b5bff' }) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const f = figma.createFrame(); f.name = 'Cover'; f.resize(1920, 960); f.fills = [{ type: 'SOLID', color: { r: .965, g: .96, b: .95 } }];
    const hex = accent.replace('#', ''); const col = { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255 };
    const bar = figma.createRectangle(); bar.resize(160, 16); bar.x = 120; bar.y = 340; bar.cornerRadius = 8; bar.fills = [{ type: 'SOLID', color: col }]; f.appendChild(bar);
    const t = figma.createText(); t.fontName = { family: 'Inter', style: 'Bold' }; t.characters = title || figma.root.name; t.fontSize = 120; t.x = 120; t.y = 380; f.appendChild(t);
    const m = figma.createText(); m.fontName = { family: 'Inter', style: 'Regular' }; m.characters = `${status || 'In progress'}  ·  ${author || ''}  ·  ${new Date().toISOString().slice(0, 10)}`; m.fontSize = 36; m.x = 120; m.y = 560; m.fills = [{ type: 'SOLID', color: { r: .35, g: .35, b: .38 } }]; f.appendChild(m);
    const page = figma.root.children.find(p => /cover/i.test(p.name)) || figma.currentPage;
    page.appendChild(f);
    try { figma.setFileThumbnailNodeAsync && await figma.setFileThumbnailNodeAsync(f); } catch (e) { }
    figma.currentPage = page; figma.viewport.scrollAndZoomIntoView([f]);
    return '커버를 만들고 파일 썸네일로 지정했어요';
  },
  status({ useSel, tag }) {
    const tags = ['✅ ', '🛠 ', '👀 ', '⏸ ', '🗑 '];
    let c = 0;
    for (const n of figma.currentPage.selection) { let nm = n.name; for (const t of tags) if (nm.startsWith(t)) nm = nm.slice(t.length); n.name = (tag ? tag + ' ' : '') + nm; c++; }
    return c ? `${c}개에 상태 표시` : '프레임을 먼저 선택해 주세요';
  },
  section({ useSel }) {
    const frames = scope(useSel).filter(n => n.parent.type === 'PAGE' && n.type !== 'SECTION');
    const groups = {};
    for (const f of frames) { const key = (f.name.split(/[\/_\-]/)[0] || 'Etc').trim(); (groups[key] = groups[key] || []).push(f); }
    let made = 0;
    for (const [k, fs] of Object.entries(groups)) {
      if (fs.length < 2) continue;
      const s = figma.createSection(); s.name = k;
      const minX = Math.min(...fs.map(f => f.x)) - 80, minY = Math.min(...fs.map(f => f.y)) - 120;
      const maxX = Math.max(...fs.map(f => f.x + f.width)) + 80, maxY = Math.max(...fs.map(f => f.y + f.height)) + 80;
      s.x = minX; s.y = minY; s.resizeWithoutConstraints(maxX - minX, maxY - minY);
      for (const f of fs) { const ax = f.x, ay = f.y; s.appendChild(f); f.x = ax - minX; f.y = ay - minY; }
      made++;
    }
    return made ? `이름 앞부분 기준으로 섹션 ${made}개를 만들었어요` : '묶을 만한 프레임이 없어요 (이름 앞부분이 같은 2개 이상)';
  },
  audit() {
    const fills = {}, fonts = {}; let noStyleText = 0, noStyleFill = 0, total = 0;
    walk(figma.currentPage.children, n => {
      total++;
      if ('fills' in n && Array.isArray(n.fills) && n.fills.length) { const f = n.fills[0]; if (f.type === 'SOLID') { const k = rgbHex(f.color); fills[k] = (fills[k] || 0) + 1; if (!n.fillStyleId) noStyleFill++; } }
      if (n.type === 'TEXT') { const fn = n.fontName; if (fn && typeof fn === 'object' && fn.family) { const k = `${fn.family} ${fn.style} ${typeof n.fontSize === 'number' ? n.fontSize : ''}`; fonts[k] = (fonts[k] || 0) + 1; } if (!n.textStyleId) noStyleText++; }
    });
    return { kind: 'audit', total, fills: Object.entries(fills).sort((a, b) => b[1] - a[1]).slice(0, 16), fonts: Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 12), noStyleText, noStyleFill };
  },
  summary() {
    const pages = figma.root.children.map(p => {
      let frames = 0, comps = 0, texts = 0;
      for (const n of p.children) if (n.type === 'FRAME') frames++;
      try { comps = p.findAllWithCriteria ? p.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] }).length : 0; texts = p.findAllWithCriteria ? p.findAllWithCriteria({ types: ['TEXT'] }).length : 0; } catch (e) { }
      return { name: p.name, frames, comps, texts, topFrames: p.children.filter(n => n.type === 'FRAME').slice(0, 40).map(n => n.name) };
    });
    return { kind: 'summary', app: 'hajin-figma', file: figma.root.name, fileKey: figma.fileKey || '', at: new Date().toISOString(), pages };
  },
};
function rgbHex(c) { const t = v => Math.round(v * 255).toString(16).padStart(2, '0'); return '#' + t(c.r) + t(c.g) + t(c.b); }

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'init') { await figma.loadAllPagesAsync?.(); figma.ui.postMessage({ type: 'init', file: figma.root.name, page: figma.currentPage.name, sel: figma.currentPage.selection.length }); return; }
    const fn = ACTIONS[msg.type];
    if (!fn) return;
    if (msg.type === 'summary' && figma.loadAllPagesAsync) await figma.loadAllPagesAsync();
    const r = await fn(msg.opts || {});
    figma.ui.postMessage({ type: 'done', action: msg.type, result: r });
    if (typeof r === 'string') figma.notify(r);
  } catch (e) { figma.ui.postMessage({ type: 'error', message: String(e && e.message || e) }); figma.notify('문제가 생겼어요: ' + (e && e.message), { error: true }); }
};
figma.on('selectionchange', () => figma.ui.postMessage({ type: 'sel', sel: figma.currentPage.selection.length, page: figma.currentPage.name }));
