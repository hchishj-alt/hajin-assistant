// SNS 피드 미리보기 + 게시글: 올리기 전에 피드에 먼저 놓아 보고, 비율에 맞게 자르고, 글을 써 둠
import { h, ic, clear, toast, modal, seg, confirmBox, download, pickFile, todayStr, fmtDate, colorFor } from '../js/ui.js';
import * as db from '../js/db.js';

// 플랫폼별 규격. ratios: [이름, 가로, 세로]. 'orig'는 사진 비율 그대로
export const PLATFORMS = {
  instagram: { name: '인스타그램', max: 2200, tags: 30, ratios: [['4:5', 1080, 1350], ['3:4', 1080, 1440], ['1:1', 1080, 1080], ['1.91:1', 1080, 566], ['9:16', 1080, 1920]], grids: ['3:4', '1:1'] },
  x: { name: 'X (트위터)', max: 280, weighted: true, tags: 3, ratios: [['16:9', 1600, 900], ['1:1', 1200, 1200], ['3:4', 1200, 1600], ['orig', 0, 0]] },
  youtube: { name: '유튜브', max: 5000, titleMax: 100, tags: 15, ratios: [['16:9', 1280, 720], ['1:1', 1080, 1080], ['9:16', 1080, 1920]] },
  tiktok: { name: '틱톡', max: 2200, tags: 10, ratios: [['9:16', 1080, 1920]] },
};
const STATUS = ['초안', '예정', '게시'];
const ratioNum = r => { if (!r || r === 'orig') return 0; const [a, b] = r.split(':').map(Number); return a / b; };
// X는 한글·한자·일본어를 2글자로 셈, 링크는 23글자
export function countChars(text, weighted) {
  if (!weighted) return [...text].length;
  let n = 0; const t = text.replace(/https?:\/\/\S+/g, () => { n += 23; return ''; });
  for (const ch of t) n += ch.codePointAt(0) >= 0x1100 ? 2 : 1;
  return n;
}
export const tagsOf = text => [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []))];

const cache = new Map(); // 이미지 키 → HTMLImageElement
async function loadImg(im) {
  const k = im.key || im.url; if (cache.has(k)) return cache.get(k);
  const b = im.key ? await db.getBlob(im.key) : null;
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = b ? URL.createObjectURL(b) : im.url;
  try { await img.decode(); } catch { return null; }
  cache.set(k, img); return img;
}
// 사진 한 장을 정해진 비율 캔버스에 그리기. fit: cover(채우기) / blur(흐린 여백) / color(색 여백)
export function paint(cv, img, im, W, H) {
  cv.width = W; cv.height = H; const c = cv.getContext('2d'); const z = im.z || 1;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const place = s => { const w = iw * s, hh = ih * s; const ox = (W - w) / 2 + (im.x || 0) * Math.abs(W - w) / 2, oy = (H - hh) / 2 + (im.y || 0) * Math.abs(H - hh) / 2; c.drawImage(img, ox, oy, w, hh); };
  if (im.fit === 'blur' || im.fit === 'color') {
    if (im.fit === 'blur') { c.filter = `blur(${Math.round(W / 28)}px) saturate(1.1)`; const s = Math.max(W / iw, H / ih) * 1.15; c.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s); c.filter = 'none'; c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 0, W, H); }
    else { c.fillStyle = im.bg || '#ffffff'; c.fillRect(0, 0, W, H); }
    place(Math.min(W / iw, H / ih) * z);
  } else place(Math.max(W / iw, H / ih) * z);
}
function sizeFor(plat, im, img) {
  const r = PLATFORMS[plat].ratios.find(x => x[0] === im.ratio) || PLATFORMS[plat].ratios[0];
  if (r[0] === 'orig') { const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); return [Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s)]; }
  return [r[1], r[2]];
}
async function thumb(plat, im, w = 360) {
  const img = await loadImg(im); const cv = h('canvas.fd-cv'); if (!img) return cv;
  const [W, H] = sizeFor(plat, im, img); paint(cv, img, im, w, Math.round(w * H / W)); return cv;
}
// 넣는 사진은 긴 쪽 2000px로 줄여 기기에 저장, 로그인돼 있으면 팀 저장소에도 올려 다른 기기에서 보이게
async function ingest(file) {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const cv = h('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/webp', .9));
  const key = await db.putBlob(blob); let url = '';
  try { url = (await (await import('../js/sync.js')).uploadImage(blob)) || ''; } catch { }
  return { key, url, x: 0, y: 0, z: 1, fit: 'cover' };
}

let cur = '', swap = false, picked = '';
export async function feedView(redraw) {
  const wrap = h('div.fd');
  const accts = (await db.list('accts')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (!accts.find(a => a.id === cur)) cur = accts[0]?.id || '';
  const acct = accts.find(a => a.id === cur);
  wrap.append(h('div.fd-accts', accts.map(a => h('button.chip' + (a.id === cur ? '.acc' : ''), { onclick: () => { cur = a.id; swap = false; redraw(); } }, a.name, h('span.faint.tiny', PLATFORMS[a.platform]?.name))),
    h('button.chip', { onclick: () => editAcct({}, redraw) }, ic('plus', 12), '계정 추가'),
    acct ? h('button.chip', { onclick: () => editAcct(acct, redraw), 'aria-label': '계정 고치기' }, ic('edit', 12)) : null));
  if (!acct) { wrap.append(h('div.card', h('div.empty', ic('grid', 28), h('p', '키울 계정을 하나 추가해 보세요. 인스타그램, X, 유튜브, 틱톡 피드를 올리기 전에 미리 놓아 볼 수 있어요.'), h('button.btn.pri', { style: { marginTop: '10px' }, onclick: () => editAcct({}, redraw) }, ic('plus', 14), '계정 추가')))); return wrap; }
  const P = PLATFORMS[acct.platform];
  const posts = (await db.list('posts')).filter(p => p.acct === acct.id).sort((a, b) => (b.order || 0) - (a.order || 0));
  const openPost = p => editPost(acct, p, posts, redraw);
  const tap = async p => {
    if (!swap) return openPost(p);
    if (!picked) { picked = p.id; redraw(); return; }
    if (picked !== p.id) { const ids = posts.map(x => x.id); const from = ids.indexOf(picked), to = ids.indexOf(p.id); ids.splice(to, 0, ids.splice(from, 1)[0]); let n = ids.length; for (const id of ids) await db.patch(id, { order: n-- }); }
    picked = ''; redraw();
  };
  const bar = h('div.fd-bar',
    h('button.btn.sm.pri', { onclick: () => openPost({ acct: acct.id, status: '초안', imgs: [], caption: '', order: (posts[0]?.order || 0) + 1 }) }, ic('plus', 14), '새 게시글'),
    posts.length > 1 ? h('button.btn.sm' + (swap ? '.pri' : ''), { onclick: () => { swap = !swap; picked = ''; redraw(); }, title: '하나를 누르고, 옮길 자리를 누르면 순서가 바뀌어요' }, ic('grid', 14), swap ? '순서 바꾸기 끝' : '순서 바꾸기') : null,
    P.grids ? seg(P.grids.map(g => [g, '격자 ' + g]), acct.grid || P.grids[0], async v => { await db.patch(acct.id, { grid: v }); redraw(); }) : null,
    h('span.faint.tiny', `초안 ${posts.filter(p => p.status !== '게시').length} · 게시 ${posts.filter(p => p.status === '게시').length}`));
  const phone = h('div.fd-phone.' + acct.platform);
  const av = () => h('span.avatar', { style: { background: colorFor(acct.name) } }, acct.name[0]);
  const badge = p => p.status !== '게시' ? h('span.fd-st', p.status || '초안') : null;
  if (swap) phone.append(h('div.fd-hint', picked ? '옮길 자리를 눌러요' : '옮길 게시글을 눌러요'));
  if (acct.platform === 'instagram' || acct.platform === 'tiktok') {
    phone.append(h('div.fd-prof', av(), h('div.grow', h('b', acct.handle || acct.name), h('div.faint.tiny', `게시물 ${posts.length}`)), h('span.fd-follow', '팔로우')));
    const grid = h('div.fd-grid', { style: { '--gr': (acct.platform === 'tiktok' ? '9/16' : (acct.grid || '3:4').replace(':', '/')) } });
    for (const p of posts) { const t = h('button.fd-tile' + (picked === p.id ? '.pick' : ''), { onclick: () => tap(p), 'aria-label': p.caption?.slice(0, 30) || '게시글' }, p.imgs?.[0] ? await thumb(acct.platform, p.imgs[0]) : h('span.fd-txt', p.caption || '글'), badge(p), (p.imgs?.length || 0) > 1 ? h('span.fd-multi', ic('layers', 13)) : null); grid.append(t); }
    for (let i = posts.length; i < Math.max(9, Math.ceil(posts.length / 3) * 3); i++) grid.append(h('span.fd-tile.empty'));
    phone.append(grid);
  } else if (acct.platform === 'x') {
    phone.append(h('div.fd-prof', av(), h('div.grow', h('b', acct.name), h('div.faint.tiny', '@' + (acct.handle || 'handle').replace(/^@/, '')))));
    for (const p of posts) {
      const media = h('div.fd-media.n' + Math.min(4, p.imgs?.length || 0));
      for (const im of (p.imgs || []).slice(0, 4)) media.append(await thumb('x', (p.imgs.length > 1 ? { ...im, ratio: p.imgs.length === 2 ? 'orig' : '16:9' } : im), 420));
      phone.append(h('button.fd-tw' + (picked === p.id ? '.pick' : ''), { onclick: () => tap(p) }, av(), h('div.grow', h('div', h('b', acct.name), h('span.faint.tiny', ` @${(acct.handle || 'handle').replace(/^@/, '')} · ${p.date ? p.date.slice(5).replace('-', '/') : '초안'}`), badge(p)), h('div.fd-tx', p.caption || ''), p.imgs?.length ? media : null, h('div.fd-acts', ic('msg', 14), ic('refresh', 14), ic('star', 14), ic('share', 14)))));
    }
    if (!posts.length) phone.append(h('div.empty', '새 게시글을 눌러 타임라인에 놓아 보세요'));
  } else {
    phone.append(h('div.fd-prof', av(), h('div.grow', h('b', acct.name), h('div.faint.tiny', `동영상 ${posts.length}`))));
    const list = h('div.fd-yt');
    for (const p of posts) list.append(h('button.fd-ytc' + (picked === p.id ? '.pick' : ''), { onclick: () => tap(p) }, h('div.fd-ytt', p.imgs?.[0] ? await thumb('youtube', { ...p.imgs[0], ratio: '16:9' }, 480) : h('span.fd-txt', '썸네일 없음'), badge(p)), h('div.fd-ytn', av(), h('div.grow', h('b', p.title || (p.caption || '').split('\n')[0] || '제목 없음'), h('div.faint.tiny', acct.name)))));
    if (!posts.length) list.append(h('div.empty', '새 게시글을 눌러 채널에 놓아 보세요'));
    phone.append(list);
  }
  wrap.append(bar, h('div.fd-stage', phone));
  return wrap;
}

function editAcct(a, redraw) {
  modal(a.id ? '계정 고치기' : '계정 추가', close => {
    const name = h('input.in', { value: a.name || '', placeholder: '예: 하진 그림계정', 'aria-label': '이름' });
    const handle = h('input.in', { value: a.handle || '', placeholder: '아이디 (없어도 돼요)', 'aria-label': '아이디', autocapitalize: 'off' });
    let plat = a.platform || 'instagram';
    const sg = h('div'); const ps = () => { clear(sg); sg.append(seg(Object.entries(PLATFORMS).map(([k, v]) => [k, v.name]), plat, v => { plat = v; ps(); })); }; ps();
    return h('div.fd-form', h('label', '어디에 올리나요'), sg, h('label', '계정 이름'), name, h('label', '아이디'), handle,
      h('div.modal-f', a.id ? h('button.btn.danger', { onclick: async () => { if (!await confirmBox('이 계정과 게시글 미리보기를 지울까요?', '지우기')) return; for (const p of (await db.list('posts')).filter(p => p.acct === a.id)) await db.remove(p.id); await db.remove(a.id); close(); redraw(); } }, ic('trash', 14), '지우기') : null,
        h('button.btn.pri', { onclick: async () => { if (!name.value.trim()) return toast('계정 이름을 적어 주세요'); const s = await db.put('accts', { ...a, name: name.value.trim(), handle: handle.value.trim().replace(/^@/, ''), platform: plat }); cur = s.id; close(); redraw(); } }, '저장')));
  });
}

function editPost(acct, p0, posts, redraw) {
  const P = PLATFORMS[acct.platform]; const p = JSON.parse(JSON.stringify(p0)); p.imgs = p.imgs || []; let sel = 0;
  modal(p.id ? '게시글' : '새 게시글', close => {
    const box = h('div.fd-edit'); const cv = h('canvas.fd-crop'); const stage = h('div.fd-cropbox', cv); const strip = h('div.fd-strip'); const tools = h('div.fd-tools');
    const cap = h('textarea.in', { rows: 5, placeholder: acct.platform === 'x' ? '무슨 일이 일어나고 있나요?' : '글을 적어요. #태그도 여기에', 'aria-label': '글' }); cap.value = p.caption || '';
    const title = P.titleMax ? h('input.in', { value: p.title || '', placeholder: '영상 제목', maxLength: P.titleMax, 'aria-label': '제목' }) : null;
    const cnt = h('span.fd-cnt'); const sugg = h('div.chips');
    const date = h('input.in', { type: 'date', value: p.date || '', 'aria-label': '올릴 날' });
    let st = p.status || '초안'; const stEl = h('div'); const drawSt = () => { clear(stEl); stEl.append(seg(STATUS.map(s => [s, s]), st, v => { st = v; drawSt(); })); }; drawSt();
    const count = () => { const n = countChars(cap.value, P.weighted), t = tagsOf(cap.value).length; cnt.textContent = `${n} / ${P.max}자 · 태그 ${t}${P.tags ? ' / ' + P.tags : ''}`; cnt.classList.toggle('over', n > P.max || t > P.tags); };
    cap.addEventListener('input', () => { count(); drawSugg(); });
    // 이 계정에서 자주 쓴 태그를 알아서 추천
    const freq = new Map(); for (const q of posts) for (const t of tagsOf(q.caption || '')) freq.set(t, (freq.get(t) || 0) + 1);
    const drawSugg = () => { clear(sugg); const has = new Set(tagsOf(cap.value)); [...freq].sort((a, b) => b[1] - a[1]).filter(([t]) => !has.has(t)).slice(0, 8).forEach(([t]) => sugg.append(h('button.chip', { onclick: () => { cap.value = cap.value.replace(/\s*$/, '') + (cap.value.trim() ? ' ' : '') + t; count(); drawSugg(); } }, t))); };
    const im = () => p.imgs[sel];
    const repaint = async () => {
      clear(tools); stage.classList.toggle('none', !im());
      if (!im()) { tools.append(h('p.faint.small', acct.platform === 'x' ? '글만 올려도 돼요. 사진은 4장까지 넣을 수 있어요.' : '사진을 넣으면 비율에 맞게 잘라 볼 수 있어요.')); return; }
      const img = await loadImg(im()); if (!img) { tools.append(h('p.faint.small', '이 기기에는 이 사진이 없어요.')); return; }
      im().ratio = im().ratio || P.ratios[0][0];
      const [W, H] = sizeFor(acct.platform, im(), img); paint(cv, img, im(), W, H); stage.style.aspectRatio = `${W}/${H}`;
      // 인스타 격자에서 잘려 보이는 부분 표시
      stage.querySelector('.fd-guide')?.remove();
      if (acct.platform === 'instagram' && sel === 0) { const g = ratioNum(acct.grid || '3:4'), r = W / H; if (Math.abs(g - r) > .01) stage.append(h('div.fd-guide', { style: g > r ? { left: 0, right: 0, top: `${(1 - r / g) * 50}%`, bottom: `${(1 - r / g) * 50}%` } : { top: 0, bottom: 0, left: `${(1 - g / r) * 50}%`, right: `${(1 - g / r) * 50}%` } }, h('span', '격자에 보이는 부분'))); }
      const zoom = h('input', { type: 'range', min: 1, max: 3, step: .01, value: im().z || 1, 'aria-label': '확대', oninput: e => { im().z = +e.target.value; paint(cv, img, im(), W, H); } });
      tools.append(h('div.fd-row', h('span.lbl', '비율'), seg(P.ratios.map(r => [r[0], r[0] === 'orig' ? '원본' : r[0]]), im().ratio, v => { im().ratio = v; repaint(); })),
        h('div.fd-row', h('span.lbl', '맞춤'), seg([['cover', '꽉 채우기'], ['blur', '흐린 여백'], ['color', '색 여백']], im().fit || 'cover', v => { im().fit = v; im().x = im().y = 0; repaint(); }), im().fit === 'color' ? h('input', { type: 'color', value: im().bg || '#ffffff', 'aria-label': '여백 색', oninput: e => { im().bg = e.target.value; paint(cv, img, im(), W, H); } }) : null),
        h('div.fd-row', h('span.lbl', '확대'), zoom, h('button.btn.sm.ghost', { onclick: () => { Object.assign(im(), { x: 0, y: 0, z: 1 }); repaint(); } }, '처음으로')),
        h('p.faint.tiny', `사진을 끌어서 위치를 맞춰요. 저장하면 ${W}×${H} 크기로 나와요.`));
    };
    const drawStrip = async () => {
      clear(strip);
      for (let i = 0; i < p.imgs.length; i++) { const t = h('button.fd-th' + (i === sel ? '.on' : ''), { onclick: () => { sel = i; drawStrip(); repaint(); }, 'aria-label': `사진 ${i + 1}` }, await thumb(acct.platform, { ...p.imgs[i], ratio: '1:1' }, 96)); strip.append(t); }
      strip.append(h('button.fd-th.add', { 'aria-label': '사진 넣기', onclick: async () => { const fs = await pickFile('image/*', true); for (const f of fs || []) { try { p.imgs.push({ ...(await ingest(f)), ratio: p.imgs[0]?.ratio || P.ratios[0][0] }); } catch { toast('이 사진은 읽지 못했어요'); } } sel = Math.max(0, p.imgs.length - 1); drawStrip(); repaint(); } }, ic('plus', 18)));
      if (im()) strip.append(h('button.btn.sm.ghost', { onclick: () => { if (sel > 0) { [p.imgs[sel - 1], p.imgs[sel]] = [p.imgs[sel], p.imgs[sel - 1]]; sel--; drawStrip(); repaint(); } }, 'aria-label': '앞으로' }, ic('left', 14)), h('button.btn.sm.ghost', { onclick: () => { p.imgs.splice(sel, 1); sel = Math.max(0, sel - 1); drawStrip(); repaint(); }, 'aria-label': '사진 빼기' }, ic('trash', 14)));
    };
    // 끌어서 위치 맞추기
    let drag = null;
    stage.addEventListener('pointerdown', e => { if (!im()) return; drag = { x: e.clientX, y: e.clientY, ox: im().x || 0, oy: im().y || 0 }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', async e => { if (!drag) return; const r = stage.getBoundingClientRect(); im().x = Math.max(-1, Math.min(1, drag.ox + (e.clientX - drag.x) / r.width * 2.4)); im().y = Math.max(-1, Math.min(1, drag.oy + (e.clientY - drag.y) / r.height * 2.4)); const img = await loadImg(im()); if (img) paint(cv, img, im(), cv.width, cv.height); });
    stage.addEventListener('pointerup', () => drag = null); stage.addEventListener('pointercancel', () => drag = null);
    const collect = () => ({ ...p, caption: cap.value, title: title?.value || '', date: date.value, status: st });
    const save = async () => { const s = await db.put('posts', collect()); p.id = s.id; return s; };
    const files = async () => { const out = []; for (let i = 0; i < p.imgs.length; i++) { const img = await loadImg(p.imgs[i]); if (!img) continue; const c2 = h('canvas'); const [W, H] = sizeFor(acct.platform, p.imgs[i], img); paint(c2, img, p.imgs[i], W, H); const b = await new Promise(r => c2.toBlob(r, 'image/jpeg', .93)); out.push(new File([b], `${acct.name}_${date.value || todayStr()}_${i + 1}.jpg`, { type: 'image/jpeg' })); } return out; };
    const copy = async () => { try { await navigator.clipboard.writeText(cap.value); return true; } catch { return false; } };
    box.append(h('div.fd-left', stage, strip, tools),
      h('div.fd-right', title, cap, h('div.fd-row', cnt, h('button.btn.sm.ghost', { onclick: async () => toast(await copy() ? '글을 복사했어요' : '복사하지 못했어요') }, ic('copy', 14), '글 복사')), sugg,
        h('div.fd-row', h('span.lbl', '올릴 날'), date), h('div.fd-row', h('span.lbl', '상태'), stEl),
        h('div.modal-f', p.id ? h('button.btn.danger', { onclick: async () => { if (await confirmBox('이 게시글을 지울까요?', '지우기')) { await db.remove(p.id); close(); redraw(); } }, 'aria-label': '지우기' }, ic('trash', 14)) : null,
          h('button.btn', { title: '맞춘 크기로 사진을 저장하고 글을 복사해요', onclick: async () => { await save(); const fs = await files(); await copy(); if (fs.length && navigator.canShare?.({ files: fs })) { try { await navigator.share({ files: fs, text: cap.value }); return; } catch { } } fs.forEach(f => download(f.name, f)); toast(fs.length ? `사진 ${fs.length}장을 저장하고 글을 복사했어요` : '글을 복사했어요'); } }, ic('share', 14), '올릴 준비'),
          h('button.btn.pri', { onclick: async () => { await save(); close(); redraw(); } }, '피드에 놓기'))));
    count(); drawSugg(); drawStrip(); repaint();
    return box;
  }, { wide: true });
}
