import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, confirmBox, download, dropzone, busy, tile, debounce } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import * as V from '../js/video.js';
import { FIELDS } from '../js/fields.js';
import { go } from '../js/app.js';

let tab = 'feed';
export default {
  async render(root, params) {
    if (params[0] === 'edit') { if (!params[1]) return go('studio'); return editor(root, params[1]); }
    const body = h('div');
    root.append(head('SNS 스튜디오', '찍은 걸 넣으면 내 콘셉트로 통일해서 편집·자막·썸네일까지.',
      h('button.btn.sm', { onclick: () => { tab = 'concept'; draw(); } }, ic('palette', 14), '콘셉트'),
      h('button.btn.sm.pri', { onclick: async () => { const p = await db.put('studio', { title: '새 영상', clips: [], subs: [], conceptId: (await db.list('concepts'))[0]?.id || null }); go('studio/edit/' + p.id); } }, ic('plus', 14), '새 편집')), body);
    await draw();
    async function draw() {
      clear(body);
      const [items, projs, concepts] = await Promise.all([db.list('sns'), db.list('studio'), db.list('concepts')]);
      const stages = ['아이디어', '촬영', '편집', '예약', '게시'];
      body.append(h('div.tiles', { style: { marginBottom: '12px' } }, tile('bulb', items.filter(i => i.status === '아이디어').length, '아이디어'), tile('film', projs.length, '편집 중인 영상'), tile('check', items.filter(i => i.status === '게시').length, '게시함', 'ok'), tile('palette', concepts.length, '내 콘셉트')));
      body.append(h('div', { style: { marginBottom: '12px' } }, seg([['feed', '피드·게시글'], ['board', '콘텐츠 보드'], ['edits', '편집실'], ['concept', '콘셉트']], tab, v => { tab = v; draw(); })));
      if (tab === 'feed') body.append(await (await import('./feed.js')).feedView(draw));
      if (tab === 'board') {
        const kan = h('div.kan');
        for (const s of stages) {
          const xs = items.filter(i => (i.status || '아이디어') === s).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
          const col = h('div.kcol', h('h4', s, h('span', xs.length)));
          col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
          col.ondrop = async e => { e.preventDefault(); await db.patch(e.dataTransfer.getData('text'), { status: s }); draw(); };
          xs.forEach(i => col.append(h('div.kcard', { draggable: true, ondragstart: e => e.dataTransfer.setData('text', i.id), onclick: () => editItem(i) }, h('div', { style: { fontWeight: 600 } }, i.title), h('div.chips', { style: { marginTop: '6px' } }, h('span.chip', i.platform || '인스타그램'), i.date ? h('span.chip.acc', i.date.slice(5).replace('-', '/')) : null))));
          if (s === '아이디어') col.append(h('button.btn.sm.ghost', { style: { width: '100%' }, onclick: () => editItem({ status: '아이디어', platform: '인스타그램' }) }, ic('plus', 14), '추가'));
          kan.append(col);
        }
        body.append(kan);
      }
      if (tab === 'edits') {
        const g = h('div.grid.gauto');
        if (!projs.length) g.append(h('div.card', h('div.empty', '새 편집을 눌러 찍은 영상·사진을 넣어 보세요')));
        for (const p of projs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
          const tb = p.thumbKey ? await db.getBlob(p.thumbKey) : null;
          g.append(h('div.card.click', { onclick: () => go('studio/edit/' + p.id) }, tb ? h('img', { src: URL.createObjectURL(tb), style: { width: '100%', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '10px', maxHeight: '260px' } }) : h('div', { style: { aspectRatio: '9/16', maxHeight: '260px', background: 'var(--bg2)', borderRadius: '10px', display: 'grid', placeItems: 'center' } }, ic('film', 32)),
            h('h3', { style: { marginTop: '8px' } }, p.title), h('p.faint.tiny', `클립 ${p.clips?.length || 0}개 · 자막 ${p.subs?.length || 0}줄 · ${fmtDate(p.updatedAt)}`)));
        }
        body.append(g);
      }
      if (tab === 'concept') body.append(await conceptView(concepts, draw));
    }
    function editItem(i) { modal(i.id ? 'SNS 콘텐츠' : '새 콘텐츠', close => { const f = form(FIELDS.sns, i, async v => { await db.put('sns', { ...i, ...v }); close(); draw(); }); if (i.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { await db.remove(i.id); close(); draw(); } }, ic('trash', 14))); return f; }); }
  },
};

async function conceptView(concepts, redraw) {
  const wrap = h('div');
  wrap.append(h('p.muted.small', { style: { marginBottom: '10px' } }, '콘셉트 = 편집 방식 한 벌. 색감만이 아니라 컷 길이, 화면 움직임, 넘기는 방식, 화면 틀, 시간·날짜 표시, 자막이 나오는 방식, 효과음까지 묶여 있어요. 아래 형식을 가져와서 내 것으로 고치거나 처음부터 만들 수 있어요.'));
  wrap.append(h('div.row', { style: { marginBottom: '12px' } }, h('button.btn.sm.pri', { onclick: () => edit({ ...structuredClone(V.DEFAULT_CONCEPT), name: '새 콘셉트' }) }, ic('plus', 14), '콘셉트 만들기')));
  wrap.append(h('h3', { style: { margin: '4px 0 8px' } }, '내 콘셉트'));
  const g = h('div.grid.gauto');
  for (const c of concepts) {
    const cv = h('canvas', { style: { width: '100%', borderRadius: '10px', display: 'block' } });
    previewConcept(cv, c);
    g.append(h('div.card.click', { onclick: () => edit(c) }, cv, h('h3', { style: { marginTop: '8px' } }, c.name), h('p.faint.tiny', describe(c))));
  }
  if (!concepts.length) g.append(h('div.card', h('div.empty', '아직 없어요. 아래 형식에서 하나 가져와 보세요')));
  wrap.append(g);
  // 일상 브이로그 숏폼에서 널리 쓰이는 형식 20가지
  wrap.append(h('h3', { style: { margin: '20px 0 4px' } }, '브이로그 형식 20가지'), h('p.faint.small', { style: { marginBottom: '8px' } }, '누르면 내 콘셉트로 복사돼서 마음대로 고칠 수 있어요.'));
  const pg = h('div.grid.gauto');
  for (const c of V.PRESETS) {
    const cv = h('canvas', { style: { width: '100%', borderRadius: '10px', display: 'block' } });
    previewConcept(cv, c);
    pg.append(h('div.card.click.vpre', { onclick: async () => { const mine = await db.put('concepts', structuredClone(c)); toast(`“${c.name}”을 내 콘셉트로 가져왔어요`); redraw(); edit(mine); } }, cv, h('h3', { style: { marginTop: '8px' } }, c.name), h('p.small.muted', c.about), h('p.faint.tiny', describe(c))));
  }
  wrap.append(pg);
  return wrap;

  async function edit(c) {
    const cv = h('canvas', { style: { width: '100%', maxWidth: '260px', borderRadius: '12px', display: 'block', margin: '0 auto' } });
    const st = structuredClone(c); st.edit = { ...V.EDIT_DEFAULT, ...(st.edit || {}) }; st.sub = st.sub || {}; st.edit.progress = st.edit.progress ? '1' : '';
    let anim = 0; const stopAnim = () => { cancelAnimationFrame(anim); anim = 0; };
    let logoImg = st.logoKey ? await blobImg(await db.getBlob(st.logoKey)) : null;
    const upd = () => { if (!anim) previewConcept(cv, st, logoImg); };
    // 움직임·전환·화면 틀이 실제로 어떻게 보이는지 4컷짜리로 돌려 봄
    const playDemo = async () => { stopAnim(); await V.ensureFont(st.font); const [W, H] = V.RATIOS[st.ratio] || V.RATIOS['9:16']; const g = cv.getContext('2d'); const len = Math.min(2.2, Math.max(.9, st.edit.cut || 1.6)), n = 4, t0 = performance.now(); let last = -1;
      const tick = () => { if (!cv.isConnected) return stopAnim(); const T = (performance.now() - t0) / 1000; if (T >= len * n) { anim = 0; upd(); return; } const idx = Math.floor(T / len), local = T - idx * len; if (idx !== last) { last = idx; if (idx && st.edit.sfxCut) V.playSfx(st.edit.sfxCut, .4); }
        g.setTransform(1 / 3, 0, 0, 1 / 3, 0, 0); V.drawFrame(g, sample(idx), W, H, st, { ...V.motionAt(st, { type: 'image' }, local, len, idx), t: Math.floor(T * 24) }); V.transitionAt(g, W, H, st, local, idx); V.drawOverlay(g, W, H, st, { T, total: len * n, idx, n }); V.drawSubtitle(g, ['오늘 하루 시작', '자막은 이렇게 나와요', '컷이 바뀔 때마다', '끝!'][idx], W, H, st, 1, local); anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick); };
    const rng = (label, key, min, max, step) => { const i = h('input', { type: 'range', min, max, step, value: st.look[key] ?? 0, style: { width: '100%' }, oninput: () => { st.look[key] = +i.value; upd(); } }); return h('label.f', label, i); };
    const looks = h('div.chips', Object.keys(V.LOOKS).map(n => h('button.chip', { onclick: () => { st.look = { ...V.LOOKS[n] }; close(); edit({ ...st, look: st.look }); } }, n)));
    const inp = (label, key, type = 'text', obj = st) => { const i = h('input.in', { type, value: obj[key] ?? '', oninput: () => { obj[key] = type === 'number' ? +i.value : i.value; upd(); } }); return h('label.f', label, i); };
    const sel = (label, key, opts, obj = st) => { const s = h('select.in', { onchange: () => { obj[key] = s.value; upd(); } }, opts.map(([v, l]) => h('option', { value: v, selected: obj[key] === v }, l))); return h('label.f', label, s); };
    const logoBtn = h('label.btn.sm', ic('image', 14), '로고 이미지', h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; st.logoKey = await db.putBlob(f); logoImg = await blobImg(f); upd(); } }));
    const close = modal(c.id ? '콘셉트 고치기' : '새 콘셉트', () => h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: '16px' }, class: 'editor-grid' },
      h('div', cv, h('div.row', { style: { justifyContent: 'center', marginTop: '8px' } }, h('button.btn.sm', { onclick: playDemo }, ic('play', 14), '움직임 미리보기'))),
      h('div.stack',
        inp('이름', 'name'), inp('한 줄 설명', 'about'),
        h('div.grid.g2', sel('비율', 'ratio', Object.keys(V.RATIOS).map(r => [r, r])), sel('로고 위치', 'logoPos', [['tr', '오른쪽 위'], ['tl', '왼쪽 위'], ['br', '오른쪽 아래'], ['bl', '왼쪽 아래']])),
        h('div.small', { style: { fontWeight: 700 } }, '편집 방식'),
        h('div.grid.g2', inp('컷 길이(초, 0이면 그대로)', 'cut', 'number', st.edit), sel('화면 움직임', 'motion', V.OPTS.motion, st.edit), sel('넘기는 방식', 'trans', V.OPTS.trans, st.edit), sel('화면 틀', 'frame', V.OPTS.frame, st.edit), sel('표시', 'stamp', V.OPTS.stamp, st.edit), sel('자막 등장', 'subAnim', V.OPTS.subAnim, st.edit), sel('컷마다 효과음', 'sfxCut', [['', '없음'], ...Object.entries(V.SFX)], st.edit), sel('진행 막대', 'progress', [['', '없음'], ['1', '아래에 표시']], st.edit)),
        h('div.grid.g2', inp('시간 표시 시작', 'startTime', 'time', st.edit), inp('컷마다 흐르는 분', 'stepMin', 'number', st.edit), inp('DAY 라벨 글자', 'dayLabel', 'text', st.edit), inp('어울리는 배경음', 'music')),
        h('div', h('div.small', { style: { fontWeight: 700, marginBottom: '4px' } }, '색감'), looks),
        h('div.grid.g2', rng('밝기', 'brightness', .7, 1.4, .01), rng('대비', 'contrast', .7, 1.5, .01), rng('채도', 'saturate', 0, 1.8, .01), rng('색온도 (차갑게↔따뜻하게)', 'warmth', -.4, .4, .01), rng('페이드', 'fade', 0, .4, .01), rng('비네팅', 'vignette', 0, .8, .01), rng('필름 입자', 'grain', 0, .3, .01)),
        h('div.grid.g2', sel('글꼴', 'font', [...new Set([st.font, ...V.FONT_NAMES])].filter(Boolean).map(f => [f, f.replace(' Variable', '')])), sel('글자 굵기', 'weight', [['500', '보통'], ['700', '굵게'], ['800', '아주 굵게'], ['900', '최대']].map(([a, b]) => [a, b])), inp('글자색', 'main', 'color'), inp('포인트색', 'accent', 'color')),
        h('div.grid.g2', sel('자막 스타일', 'style', [['box', '박스'], ['stroke', '외곽선'], ['plain', '그림자'], ['highlight', '형광펜']], st.sub), sel('자막 위치', 'pos', [['bottom', '아래'], ['middle', '가운데'], ['top', '위']], st.sub), inp('자막 크기', 'size', 'number', st.sub)),
        inp('인트로 문구 (첫 2초)', 'intro'), inp('아웃로 문구 (마지막 2초)', 'outro'), inp('기본 해시태그', 'hashtags'),
        h('div.row', logoBtn),
        h('div.modal-f', c.id ? h('button.btn.danger', { onclick: async () => { if (await confirmBox('콘셉트를 지울까요?', '지우기')) { await db.remove(c.id); close(); redraw(); } } }, ic('trash', 14)) : null, c.id ? h('button.btn', { onclick: async () => { const { id, ...rest } = st; await db.put('concepts', { ...rest, name: st.name + ' 복사' }); close(); redraw(); toast('복사했어요'); } }, ic('copy', 14), '복사') : null, h('button.btn.pri', { onclick: async () => { st.edit.cut = +st.edit.cut || 0; st.edit.stepMin = +st.edit.stepMin || 0; st.edit.progress = !!st.edit.progress && st.edit.progress !== '0'; stopAnim(); await db.put('concepts', st); close(); redraw(); toast('콘셉트 저장'); } }, '저장')))), { wide: true });
    upd();
  }
}
const describe = c => { const e = c.edit || {}; const f = (k, v) => (V.OPTS[k].find(o => o[0] === v) || [])[1]; return [c.ratio === '16:9' ? '16:9 가로 1920×1080' : c.ratio, e.cut ? `컷 ${e.cut}초` : '', e.motion && e.motion !== 'none' ? f('motion', e.motion) : '', e.trans && e.trans !== 'cut' ? f('trans', e.trans) : '', e.frame && e.frame !== 'none' ? f('frame', e.frame) : '', e.stamp && e.stamp !== 'none' ? f('stamp', e.stamp) : '', e.progress ? '진행 막대' : '', e.sfxCut ? '효과음 ' + V.SFX[e.sfxCut] : ''].filter(Boolean).join(' · '); };
async function blobImg(b) { if (!b) return null; const img = new Image(); img.src = URL.createObjectURL(b); await img.decode().catch(() => { }); return img; }
const sampleImgs = [];
function sample(i = 0) {
  i = i % 4; if (sampleImgs[i]) return sampleImgs[i];
  const PAL = [['#8ec5ff', '#e8f3ff', '#7ccf7a', '#3e9a4e', '#ff7a59'], ['#ffd9a8', '#fff1dc', '#c98f5a', '#8a5a34', '#6b8cff'], ['#c9b8ff', '#f1ecff', '#8fa0c8', '#55648f', '#ffd34d'], ['#ffb3c7', '#fff0f4', '#f2a65a', '#c9743a', '#4fb7a5']][i];
  const c = document.createElement('canvas'); c.width = 540; c.height = 960; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 960); gr.addColorStop(0, PAL[0]); gr.addColorStop(.55, PAL[1]); gr.addColorStop(.56, PAL[2]); gr.addColorStop(1, PAL[3]); g.fillStyle = gr; g.fillRect(0, 0, 540, 960);
  g.fillStyle = '#fff'; [[120, 180, 60], [180, 170, 45], [380, 240, 50], [430, 230, 36]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
  g.fillStyle = PAL[4]; g.beginPath(); g.arc(150 + i * 80, 640, 90, 0, 7); g.fill(); g.fillStyle = '#ffd34d'; g.fillRect(200, 720, 140, 120);
  return (sampleImgs[i] = c);
}
async function previewConcept(cv, c, logo) {
  const [W, H] = V.RATIOS[c.ratio] || V.RATIOS['9:16'];
  cv.width = W / 3; cv.height = H / 3;
  const ctx = cv.getContext('2d'); ctx.scale(1 / 3, 1 / 3);
  if (!logo && c.logoKey) logo = await blobImg(await db.getBlob(c.logoKey));
  await V.ensureFont(c.font); ctx.setTransform(1 / 3, 0, 0, 1 / 3, 0, 0);
  V.drawFrame(ctx, sample(), W, H, c);
  V.drawOverlay(ctx, W, H, c, { T: 3, total: 10, idx: 2, n: 8 });
  V.drawSubtitle(ctx, '자막은 이렇게 보여요', W, H, c);
  if (c.intro) V.drawTitleCard(ctx, c.intro, W, H, c, .9);
  V.drawLogo(ctx, logo, W, H, c.logoPos);
}

// ── 편집실 ──
async function editor(root, id) {
  const p = await db.get(id);
  if (!p) { root.append(h('div.empty', '편집을 찾을 수 없어요')); return; }
  const concepts = await db.list('concepts');
  let ratio = p.ratio || '';
  const fit = c => ({ ...c, ratio: ratio || c.ratio });
  let base = concepts.find(c => c.id === p.conceptId) || concepts[0] || V.DEFAULT_CONCEPT;
  let concept = fit(base); await V.ensureFont(concept.font);
  let clips = [];
  const els = new Map();   /* 파일 하나에 영상 요소 하나 */
  const ghosts = [];       /* 이 기기에 파일이 없거나 못 여는 클립. 화면에는 안 보이지만 저장할 때 제자리에 다시 끼워 넣어 다른 기기 것을 지우지 않음 */
  for (const [at, k] of (p.clips || []).entries()) { const b = await db.getBlob(k.key).catch(() => null); const c = b ? await loadClip(b, k, els) : null; if (c && !c.bad) clips.push(c); else ghosts.push({ at, raw: k, why: b ? 'codec' : 'nofile' }); }
  const note = h('div');   /* 넣다가 생긴 일을 알려 주는 자리 */
  const tell = (...lines) => { clear(note); const ls = lines.flat().filter(Boolean); if (ls.length) note.append(h('div.card', { style: { borderColor: 'var(--warn,#e3a008)', marginBottom: '10px' } }, ls.map(l => h('p.small', { style: { margin: '2px 0' } }, l)), h('button.btn.sm.ghost', { style: { marginTop: '6px' }, onclick: () => clear(note) }, '알겠어요'))); };
  const ghostLine = () => (ghosts.length ? `이 편집의 클립 ${ghosts.length}개는 ${ghosts.every(g => g.why === 'nofile') ? '다른 기기에서 넣은 것이라 이 기기에 파일이 없어요' : '이 기기에서 열 수 없어요'}. 여기서는 빼고 보여 주고, 넣은 기기에서는 그대로 있어요.` : '');
  let subs = p.subs || [];
  let sfx = p.sfx || [], musicVol = p.musicVol ?? .35;
  const sfxList = h('div.stack');
  const musicBlob = p.musicKey ? await db.getBlob(p.musicKey).catch(() => null) : null;   /* 다른 기기에서 넣은 배경음은 이 기기에 파일이 없을 수 있음 */
  let musicEl = musicBlob ? Object.assign(new Audio(URL.createObjectURL(musicBlob)), { preload: 'auto' }) : null;
  let logo = concept.logoKey ? await blobImg(await db.getBlob(concept.logoKey).catch(() => null)) : null;
  let player = null, making = false;
  const stopPreview = () => { if (player && !making) { player.close(); player = null; playBtn.innerHTML = ''; playBtn.append(ic('play', 16), '미리보기'); } };   /* 클립을 손대기 전에 돌던 미리보기를 멈춤 (같은 영상을 두 곳에서 움직이지 않게) */

  const save = debounce(async () => { await db.patch(id, { title: titleIn.value, conceptId: base.id || null, ratio, clips: (() => { const out = clips.map(k => ({ key: k.key, type: k.type, in: k.in, out: k.out, dur: k.dur, vol: k.vol })); for (const g of ghosts) out.splice(Math.min(g.at, out.length), 0, g.raw); return out; })(), subs, sfx, musicVol }); }, 500);
  const titleIn = h('input.in.editor-title', { value: p.title, 'aria-label': '영상 제목', style: { fontSize: '20px', fontWeight: 700, border: 0, background: 'transparent', padding: '2px 0' }, oninput: save });
  const canvas = h('canvas.editor-canvas');
  const timeEl = h('span.mono.small', '0:00 / 0:00');
  const playBtn = h('button.btn.pri', ic('play', 16), '미리보기');
  const exportBtn = h('button.btn', ic('download', 16), '영상 만들기');
  const clipList = h('div.stack');
  const subList = h('div.stack');
  const thumbBox = h('div');
  const capBox = h('div');
  const conceptInfo = h('p.faint.tiny', { style: { marginTop: '6px' } });
  const setConcept = async c => { base = c; concept = fit(base); await V.ensureFont(concept.font); logo = concept.logoKey ? await blobImg(await db.getBlob(concept.logoKey)) : null; conceptInfo.textContent = [describe(concept), base.music ? '어울리는 배경음: ' + base.music : ''].filter(Boolean).join(' · '); save(); still(); };
  const conceptSel = h('select.in', { 'aria-label': '콘셉트', onchange: async () => { const v = conceptSel.value; if (v.startsWith('preset:')) { const mine = await db.put('concepts', structuredClone(V.PRESETS[+v.slice(7)])); concepts.push(mine); conceptSel.querySelector('optgroup').append(h('option', { value: mine.id }, mine.name)); conceptSel.value = mine.id; toast(`“${mine.name}”을 내 콘셉트로 가져왔어요`); return setConcept(mine); } setConcept(concepts.find(c => c.id === v) || V.DEFAULT_CONCEPT); } },
    h('optgroup', { label: '내 콘셉트' }, concepts.length ? concepts.map(c => h('option', { value: c.id, selected: c.id === base.id }, c.name)) : h('option', { value: '' }, '기본')),
    h('optgroup', { label: '브이로그 형식 (고르면 내 콘셉트로 복사)' }, V.PRESETS.map((c, i) => h('option', { value: 'preset:' + i }, c.name))));
  const ratioSel = h('select.in', { 'aria-label': '화면 비율', onchange: () => { ratio = ratioSel.value; concept = fit(base); save(); still(); setConcept(base); } }, [['', '콘셉트 그대로'], ['9:16', '9:16 세로 (쇼츠·릴스·틱톡)'], ['16:9', '16:9 가로 (유튜브 1920×1080)'], ['1:1', '1:1 정사각'], ['4:5', '4:5 인스타 피드']].map(([v, l]) => h('option', { value: v, selected: v === ratio }, l)));
  conceptInfo.textContent = [describe(concept), base.music ? '어울리는 배경음: ' + base.music : ''].filter(Boolean).join(' · ');
  // 콘셉트의 편집 방식을 지금 클립에 적용 (컷 길이 맞추기 + 컷마다 효과음)
  const applyBtn = h('button.btn.sm.pri', { onclick: () => { if (!clips.length) return toast('먼저 영상이나 사진을 넣어 주세요'); const r = V.applyConcept(clips, concept); if (r.sfx.length) sfx = [...sfx.filter(x => !x.auto), ...r.sfx.map(x => ({ ...x, auto: true }))]; save(); drawClips(); drawSfx(); still(); toast(r.trimmed || r.sfx.length ? `컷 ${r.trimmed}개 길이를 맞추고 효과음 ${r.sfx.length}개를 놓았어요` : '이미 콘셉트대로예요. 움직임·전환·화면 틀은 미리보기에서 바로 보여요'); } }, ic('sparkles', 14), '콘셉트대로 다듬기');

  playBtn.onclick = () => {
    if (player) { player.close(); player = null; playBtn.innerHTML = ''; playBtn.append(ic('play', 16), '미리보기'); still(); return; }
    if (!clips.length) { toast('영상이나 사진을 먼저 넣어 주세요'); return; }
    player = V.createPlayer(canvas, clips, concept, subs, { logo, music: musicEl, musicVol, sfx, onTime: (t, T) => (timeEl.textContent = `${fmt(t)} / ${fmt(T)}`), onEnd: () => { player = null; playBtn.innerHTML = ''; playBtn.append(ic('play', 16), '미리보기'); } });
    player.play(); playBtn.innerHTML = ''; playBtn.append(ic('stop', 16), '멈춤');
  };
  /* 영상 만들기: 화면을 실제 속도로 찍어서 만듦. 다른 앱에 다녀오면 그동안 멈췄다가 이어짐 */
  const bar = h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--bg2)', overflow: 'hidden', display: 'none' } }, h('div', { style: { height: '100%', width: '0%', background: 'var(--acc)', transition: 'width .3s linear' } }));
  const exportHint = h('p.faint.tiny', { style: { display: 'none', margin: '2px 0 0' } }, '만드는 동안 이 화면을 켜 두세요. 다른 앱에 다녀오면 그동안 멈췄다가 돌아오면 이어서 만들어요.');
  const cancelBtn = h('button.btn.ghost', { style: { display: 'none' }, onclick: () => { if (player) { player.cancel(); toast('만들던 것을 멈췄어요'); } } }, ic('stop', 16), '그만 만들기');
  const exporting = on => { making = on; for (const [el, d] of [[bar, 'block'], [exportHint, 'block'], [cancelBtn, '']]) el.style.display = on ? d : 'none'; playBtn.disabled = on; titleIn.disabled = on; const side = root.querySelector('.editor-side'); if (side) { side.inert = on; side.style.opacity = on ? '.45' : ''; } if (!on) bar.firstChild.style.width = '0%'; };
  exportBtn.onclick = async () => {
    if (!clips.length) { toast('클립이 없어요'); return; }
    if (V.recType() == null) { tell('이 브라우저는 영상 만들기를 지원하지 않아요. 아이폰·아이패드는 iOS 14.5 이상 사파리, 컴퓨터와 안드로이드는 크롬에서 해 주세요.'); return; }
    if (player) player.close();
    const T = V.totalDuration(clips, concept);
    busy(exportBtn, true, '만드는 중'); exporting(true);
    const done = () => { player = null; busy(exportBtn, false); exporting(false); };
    player = V.createPlayer(canvas, clips, concept, subs, { logo, music: musicEl, musicVol, sfx, record: true,
      onTime: (t, tt) => { timeEl.textContent = `● ${fmt(t)} / ${fmt(tt)}`; bar.firstChild.style.width = Math.min(100, t / (tt || 1) * 100).toFixed(1) + '%'; },
      onError: e => { store.logError(e, 'studio:export'); tell('영상을 만들다 문제가 생겼어요: ' + (e && e.message || e) + '. 클립을 줄이거나 다시 해 보세요.'); },
      onEnd: async (blob, info) => {
        done(); still();
        if (!blob || !blob.size) return;
        const type = (info && info.type) || blob.type || '', ext = /mp4/.test(type) ? 'mp4' : 'webm';
        const name = `${(titleIn.value || '영상').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || '영상'}.${ext}`;
        const mine = (await db.list('sns')).find(x => x.studioId === id);   /* 다시 만들 때마다 콘텐츠 보드에 줄이 늘지 않게 */
        if (mine) await db.patch(mine.id, { title: titleIn.value }); else await db.put('sns', { title: titleIn.value, status: '편집', platform: '인스타그램', studioId: id, date: '' });
        resultModal(blob, name, type, T);
      } });
    player.play();
  };
  /* 다 만든 영상: 미리 보고 저장. 폰에서는 공유 창으로 사진첩에 저장하거나 바로 보냄 */
  function resultModal(blob, name, type, T) {
    const url = URL.createObjectURL(blob); const file = (() => { try { return new File([blob], name, { type: /mp4/.test(type || blob.type) ? 'video/mp4' : 'video/webm' }); } catch { return null; } })();
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    modal('영상이 만들어졌어요', close => h('div',
      h('video', { src: url, controls: true, playsInline: true, style: { width: '100%', maxHeight: '52vh', background: '#000', borderRadius: '12px', display: 'block' } }),
      h('p.small.muted', { style: { margin: '10px 0 4px' } }, `${fmt(T)} · ${mb(blob.size)} · ${/mp4/.test(type) ? 'mp4' : 'webm'}`),
      V.plays(type) ? null : h('p.small', { style: { color: 'var(--warn,#b45309)', margin: '0 0 6px' } }, /mp4/.test(type) ? '이 브라우저가 만든 mp4는 소리 형식 때문에 아이폰이나 인스타에서 안 열릴 수 있어요. 컴퓨터 크롬 최신 버전이나 아이폰 사파리에서 만들면 어디서나 열려요.' : '이 브라우저는 webm으로만 만들 수 있어요. 인스타·아이폰에 올리려면 mp4가 필요해요. 컴퓨터 크롬 최신 버전이나 아이폰 사파리에서 만들면 mp4로 나와요.'),
      h('div.modal-f', canShare ? h('button.btn.pri', { onclick: async () => { try { await navigator.share({ files: [file], title: titleIn.value || '영상' }); } catch (e) { if (e && e.name !== 'AbortError') { download(name, blob); toast('공유가 안 돼서 파일로 저장했어요'); } } } }, ic('upload', 14), '저장·공유') : null,
        h('button.btn' + (canShare ? '' : '.pri'), { onclick: () => { download(name, blob); toast('파일로 저장했어요'); } }, ic('download', 14), '파일로 저장'))),
      { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
  }

  let adding = false;
  async function addFiles(files) {
    if (adding) return toast('앞의 파일을 넣는 중이에요'); adding = true; stopPreview();
    const list = [...files], cant = [], skipped = []; let added = 0, full = false;
    try {
      for (const [n, f] of list.entries()) {
        const type = kindOf(f); if (!type) { skipped.push(f.name); continue; }
        tell(`${list.length}개 중 ${n + 1}번째를 넣는 중이에요 (${mb(f.size)})${f.size > 5e8 ? '. 큰 파일이라 조금 걸려요' : ''}`);
        const c = await loadClip(f, { type, dur: 3 });
        if (c.bad) { cant.push(f.name); try { URL.revokeObjectURL(c.el.src); } catch { } continue; }
        let key; try { key = await db.putBlob(f); } catch (e) { full = true; store.logError(e, 'studio:putBlob'); try { URL.revokeObjectURL(c.el.src); } catch { } break; }
        c.key = key; if (type === 'video') els.set(key, c.el); clips.push(c); added++;
      }
    } finally { adding = false; }
    const heic = cant.filter(n => /\.(heic|heif)$/i.test(n)), vids = cant.filter(n => !/\.(heic|heif)$/i.test(n));
    tell(
      vids.length ? `이 기기에서 열 수 없는 영상이라 넣지 않았어요: ${vids.join(', ')}. 아이폰에서 “고효율”로 찍은 영상은 윈도우·안드로이드 크롬에서 안 열릴 수 있어요. 아이폰·아이패드에서 편집하거나, 아이폰 설정 › 카메라 › 포맷에서 “높은 호환성”으로 찍으면 어디서나 열려요.` : '',
      heic.length ? `이 기기에서 열 수 없는 사진이라 넣지 않았어요: ${heic.join(', ')}. HEIC 사진은 아이폰·아이패드에서 넣거나 JPG로 바꿔서 넣어 주세요.` : '',
      skipped.length ? `영상이나 사진이 아니라서 넘어갔어요: ${skipped.join(', ')}` : '',
      full ? '이 기기의 저장 공간이 모자라서 더 넣지 못했어요. 안 쓰는 편집을 지우거나 더 짧은 영상으로 해 주세요.' : '',
      ghostLine());
    if (added) { save(); drawClips(); still(); toast(`${added}개 넣었어요`); }
  }
  let wantThumb = [], thumbRun = 0, turn = Promise.resolve();
  const inTurn = fn => (turn = turn.then(fn, fn));   /* 같은 영상 요소를 여러 곳에서 동시에 옮기지 않게 차례로 */
  async function fillThumbs() {
    const my = ++thumbRun, list = wantThumb.slice();
    for (const [k, cv] of list) await inTurn(async () => { if (my !== thumbRun || player) return; try { await V.seek(k.el, (k.in || 0) + .1); const g = cv.getContext('2d'), vw = k.el.videoWidth, vh = k.el.videoHeight, sc = Math.max(cv.width / vw, cv.height / vh); g.drawImage(k.el, (cv.width - vw * sc) / 2, (cv.height - vh * sc) / 2, vw * sc, vh * sc); } catch { } });
  }
  function drawClips() {
    clear(clipList); wantThumb = [];
    if (!clips.length) clipList.append(h('div.faint.small', '아직 클립이 없어요'));
    clips.forEach((k, i) => {
      const thumb = k.type === 'image' ? h('img', { src: k.el.src }) : h('canvas', { width: 96, height: 128 }); if (k.type === 'video') wantThumb.push([k, thumb]);   /* 영상 클립의 작은 그림은 영상 요소를 또 만들지 않고 한 장씩 찍어서 채움 */
      Object.assign(thumb.style, { width: '48px', height: '64px', objectFit: 'cover', borderRadius: '8px', background: 'var(--bg2)', flex: 'none' });
      const num = (v, f, step = .1, label = '') => { const i2 = h('input.in', { type: 'number', inputMode: 'decimal', step, min: 0, value: v, 'aria-label': label, style: { width: '72px', padding: '4px 6px' }, onchange: () => { const x = parseFloat(i2.value); f(Number.isFinite(x) ? x : v); stopPreview(); save(); drawClips(); still(); } }); return i2; };
      const D = k.type === 'video' ? k.el.duration : 0;
      const move = d => { stopPreview(); [clips[i + d], clips[i]] = [clips[i], clips[i + d]]; save(); drawClips(); still(); };
      const moveRow = h('div.row.nowrap.clip-move', h('button.btn.sm.ghost', { 'aria-label': '위로', disabled: !i, onclick: () => move(-1) }, ic('up', 14)), h('button.btn.sm.ghost', { 'aria-label': '아래로', disabled: i === clips.length - 1, onclick: () => move(1) }, ic('down', 14)), h('button.btn.sm.ghost', { 'aria-label': '빼기', onclick: () => { stopPreview(); clips.splice(i, 1); save(); drawClips(); still(); } }, ic('x', 14)));
      clipList.append(h('div.li', { style: { gap: '8px', flexWrap: 'wrap' } }, thumb,
        h('div.grow', h('div.row.between.nowrap', { style: { gap: '6px' } }, h('div.small', { style: { fontWeight: 600 } }, `${i + 1}. ${k.type === 'video' ? '영상' : '사진'} · ${V.clipLen(k).toFixed(1)}초`), moveRow),
          k.type === 'video' ? h('div.row', { style: { gap: '4px', marginTop: '4px' } }, h('span.tiny.faint', '시작'), num(k.in || 0, v => { k.in = +Math.min(Math.max(0, v), Math.max(0, (k.out ?? D) - .3)).toFixed(2); }, .1, '시작(초)'), h('span.tiny.faint', '끝'), num(+(k.out ?? D).toFixed(1), v => { k.out = +Math.max(Math.min(D, v), (k.in || 0) + .3).toFixed(2); }, .1, '끝(초)')) : h('div.row', { style: { gap: '4px', marginTop: '4px' } }, h('span.tiny.faint', '길이'), num(k.dur || 3, v => (k.dur = Math.min(60, Math.max(.5, v))), .5, '길이(초)'))),
        k.type === 'video' ? h('div.row.clip-acts',
          h('button.btn.sm.ghost', { title: '원하는 곳에서 둘로 나눠요', onclick: () => splitUI(i) }, ic('minus', 12), '나누기'),
          h('button.btn.sm.ghost', { title: '장면이 바뀌는 곳을 찾아 알아서 나눠요', onclick: e => autoCut(i, e.currentTarget) }, '자동 컷'),
          h('button.btn.sm.ghost', { title: '이 클립 소리 켜기/끄기', onclick: () => { k.vol = (k.vol ?? 1) ? 0 : 1; save(); drawClips(); } }, (k.vol ?? 1) ? '소리 켬' : '소리 끔')) : null,
      ));
    });
    const T = V.totalDuration(clips, concept);
    timeEl.textContent = `0:00 / ${fmt(T)}`;
    fillThumbs();
  }
  // 컷 편집: 한 클립을 원하는 곳에서 둘로
  async function cutAt(i, times) {
    stopPreview();
    const k = clips[i]; const a = k.in || 0, b = k.out ?? k.el.duration; const ts = [a, ...times.filter(t => t > a + .2 && t < b - .2).sort((x, y) => x - y), b];
    if (ts.length < 3) return 0;
    const blob = await db.getBlob(k.key); const parts = [];
    for (let n = 0; n < ts.length - 1; n++) parts.push(await loadClip(blob, { key: k.key, type: 'video', in: +ts[n].toFixed(2), out: +ts[n + 1].toFixed(2), vol: k.vol }, els));
    clips.splice(i, 1, ...parts); save(); drawClips(); return parts.length;
  }
  function splitUI(i) {
    stopPreview();
    const k = clips[i]; const a = k.in || 0, b = k.out ?? k.el.duration;
    modal('클립 나누기', close => {
      const cv = h('canvas', { style: { width: '100%', maxHeight: '46vh', objectFit: 'contain', background: '#000', borderRadius: '12px', display: 'block' } });
      const lab = h('span.mono.small'); const r = h('input', { type: 'range', min: a, max: b, step: .05, value: ((a + b) / 2).toFixed(2), style: { width: '100%' }, 'aria-label': '나눌 곳' });
      const show = async () => { await V.seek(k.el, +r.value); const [W, H] = V.RATIOS[concept.ratio] || V.RATIOS['9:16']; cv.width = W / 2; cv.height = H / 2; const g = cv.getContext('2d'); g.scale(.5, .5); V.drawFrame(g, k.el, W, H, concept); lab.textContent = `${(+r.value - a).toFixed(1)}초 지점 · 앞 ${(+r.value - a).toFixed(1)}초 / 뒤 ${(b - +r.value).toFixed(1)}초`; };
      r.oninput = debounce(show, 60); show();
      return h('div', cv, h('div', { style: { margin: '10px 0 4px' } }, r), lab, h('div.modal-f', h('button.btn.pri', { onclick: async () => { const n = await cutAt(i, [+r.value]); close(); toast(n ? '둘로 나눴어요. 필요 없는 쪽은 빼면 돼요' : '너무 끝이라 나눌 수 없어요'); } }, '여기서 나누기')));
    });
  }
  async function autoCut(i, btn) {
    stopPreview(); const k = clips[i]; busy(btn, true, '찾는 중');
    try { const cuts = await V.detectCuts(k.el, k.in || 0, k.out ?? k.el.duration); const n = await cutAt(i, cuts); toast(n ? `장면 ${n}개로 나눴어요` : '장면이 바뀌는 곳을 못 찾았어요'); } catch (e) { toast('자동 컷 실패: ' + e.message); }
    busy(btn, false);
  }
  function drawSfx() {
    clear(sfxList);
    sfx.sort((x, y) => x.t - y.t).forEach((x, i) => {
      const t = h('input.in', { type: 'number', step: .1, min: 0, value: x.t, style: { width: '72px', padding: '5px' }, 'aria-label': '시간(초)', onchange: () => { x.t = Math.max(0, +t.value); save(); } });
      const sel = h('select.in', { style: { padding: '5px 8px' }, 'aria-label': '효과음', onchange: () => { x.kind = sel.value; save(); V.playSfx(x.kind); } }, Object.entries(V.SFX).map(([k, n]) => h('option', { value: k, selected: k === x.kind }, n)));
      sfxList.append(h('div.row.nowrap', { style: { gap: '4px' } }, t, h('span.tiny.faint', '초'), sel, h('button.btn.sm.ghost', { 'aria-label': '들어보기', onclick: () => V.playSfx(x.kind) }, ic('play', 12)), h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: () => { sfx.splice(i, 1); save(); drawSfx(); } }, ic('x', 12))));
    });
    if (!sfx.length) sfxList.append(h('div.faint.small', '효과음은 앱이 직접 만드는 소리라 저작권 걱정이 없어요'));
  }
  function drawSubs() {
    clear(subList);
    subs.forEach((s, i) => {
      const t = h('input.in.sub-text', { value: s.text, 'aria-label': '자막 글', style: { padding: '5px 8px' }, oninput: () => { s.text = t.value; save(); } });
      const a = h('input.in', { type: 'number', inputMode: 'decimal', step: .1, min: 0, value: s.start, 'aria-label': '자막 시작(초)', style: { width: '64px', flex: 'none', padding: '5px' }, onchange: () => { s.start = Math.max(0, +a.value || 0); if (s.end <= s.start) { s.end = +(s.start + 1).toFixed(1); b.value = s.end; } save(); } });
      const b = h('input.in', { type: 'number', inputMode: 'decimal', step: .1, min: 0, value: s.end, 'aria-label': '자막 끝(초)', style: { width: '64px', flex: 'none', padding: '5px' }, onchange: () => { s.end = Math.max(s.start + .2, +b.value || 0); b.value = s.end; save(); } });
      subList.append(h('div.row.nowrap.sub-row', { style: { gap: '4px' } }, a, h('span.tiny.faint', '~'), b, t, h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: () => { subs.splice(i, 1); save(); drawSubs(); } }, ic('x', 12))));
    });
    if (!subs.length) subList.append(h('div.faint.small', '대본을 붙여넣거나 자동 자막을 눌러 주세요'));
  }
  function still() { return inTurn(async () => {
    if (player) return;
    const [W, H] = V.RATIOS[concept.ratio] || V.RATIOS['9:16'];
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const k = clips[0];
    try {
      if (k?.type === 'video') await V.seek(k.el, (k.in || 0) + .1);
      V.drawFrame(ctx, k?.el || sample(), W, H, concept);
      V.drawOverlay(ctx, W, H, concept, { T: 0, total: V.totalDuration(clips, concept) || 1, idx: 0, n: clips.length || 1 });
      if (concept.intro) V.drawTitleCard(ctx, concept.intro, W, H, concept);
      else if (subs[0]) V.drawSubtitle(ctx, subs[0].text, W, H, concept);
      V.drawLogo(ctx, logo, W, H, concept.logoPos);
    } catch (e) { console.error(e); }
  }); }
  const script = h('textarea.in', { rows: 4, placeholder: '대본을 붙여넣으면 길이에 맞춰 자막 시간을 나눠요 (줄마다 한 자막)' });
  const autoSubBtn = h('button.btn.sm', ic('wave', 14), '자동 자막');
  autoSubBtn.onclick = async () => {
    const ext = await import('../js/ext.js');
    if (!(await ext.isReady('stt'))) { toast('설정 → 확장 두뇌에서 음성인식 모델을 받아 주세요'); go('settings/ext'); return; }
    busy(autoSubBtn, true, '듣는 중');
    try {
      let offset = 0; const out = [];
      for (const k of clips) {
        if (k.type === 'video') {
          const r = await ext.transcribe(await db.getBlob(k.key), null, { start: k.in || 0, end: k.out ?? k.el.duration });
          for (const c of r.chunks || []) if (c.timestamp) out.push({ start: +(offset + c.timestamp[0]).toFixed(2), end: +(offset + (c.timestamp[1] ?? c.timestamp[0] + 2)).toFixed(2), text: c.text.trim() });
        }
        offset += V.clipLen(k);
      }
      subs = out; save(); drawSubs(); toast(`자막 ${out.length}줄 (임시 — 확인하며 고쳐 주세요)`);
    } catch (e) { toast('자동 자막 실패: ' + e.message); }
    busy(autoSubBtn, false);
  };

  // 썸네일
  async function thumbs() {
    stopPreview(); clear(thumbBox);
    if (!clips.length) { thumbBox.append(h('div.faint.small', '클립을 넣으면 좋은 장면을 골라 드려요')); return; }
    thumbBox.append(h('div.faint.small', h('span.spin'), ' 장면 고르는 중'));
    const cands = await inTurn(() => V.thumbCandidates(clips, 6)).catch(() => []);
    clear(thumbBox);
    if (!cands || !cands.length) { thumbBox.append(h('div.faint.small', '장면을 고르지 못했어요. 클립을 다시 넣어 주세요')); return; }
    const tIn = h('input.in', { value: titleIn.value, placeholder: '썸네일 제목' });
    const sIn = h('input.in', { placeholder: '작은 라벨 (예: EP.03)' });
    const lay = h('select.in', ['center', 'bottom', 'top', 'left'].map(v => h('option', { value: v }, { center: '가운데', bottom: '아래', top: '위', left: '왼쪽' }[v])));
    const ratio = h('select.in', Object.keys(V.RATIOS).map(r => h('option', { value: r, selected: r === concept.ratio }, r)));
    const big = h('canvas', { style: { width: '100%', maxWidth: '320px', borderRadius: '12px', display: 'block', margin: '8px auto' } });
    let pick = cands[0];
    const redraw = async () => { if (pick.clip.type === 'video') await V.seek(pick.clip.el, pick.time); V.renderThumb(big, pick.clip.el, concept, { title: tIn.value, sub: sIn.value, layout: lay.value, ratio: ratio.value }); };
    [tIn, sIn].forEach(x => x.addEventListener('input', debounce(redraw, 150))); [lay, ratio].forEach(x => x.addEventListener('change', redraw));
    const row = h('div.thumbs');
    for (const c of cands) {
      if (c.clip.type === 'video') await V.seek(c.clip.el, c.time);
      const cv = document.createElement('canvas'); cv.width = 180; cv.height = 240;
      const g = cv.getContext('2d'); g.scale(180 / 1080, 240 / 1440); V.drawFrame(g, c.clip.el, 1080, 1440, concept);
      cv.style.cssText = 'width:100%;border-radius:10px;cursor:pointer;outline-offset:2px';
      cv.onclick = () => { pick = c; row.querySelectorAll('canvas').forEach(x => (x.style.outline = '')); cv.style.outline = '3px solid var(--acc)'; redraw(); };
      row.append(cv);
    }
    row.firstChild && (row.firstChild.style.outline = '3px solid var(--acc)');
    thumbBox.append(h('p.faint.tiny', '선명하고 노출이 좋은 장면 순으로 골랐어요'), row, h('div.grid.g2', { style: { marginTop: '8px' } }, tIn, sIn, lay, ratio), big,
      h('div.row', h('button.btn.sm.pri', { onclick: () => big.toBlob(async b => { download(`${titleIn.value || '썸네일'}.png`, b); await db.patch(id, { thumbKey: await db.putBlob(b) }); }, 'image/png') }, ic('download', 14), '썸네일 저장')));
    await redraw();
  }
  function caption() {
    clear(capBox);
    const text = `${titleIn.value} ${subs.map(s => s.text).join(' ')}`;
    const kws = brain.keywords(text, 6).filter(k => !k.includes(' '));
    const tags = [...new Set([...(concept.hashtags || '').split(/\s+/).filter(Boolean).map(t => t.replace(/^#?/, '#')), ...kws.map(k => '#' + k.replace(/\s/g, ''))])].slice(0, 12);
    const sum = brain.summarize(subs.map(s => s.text).join('. ') || titleIn.value, 2);
    const hook = sum[0] || titleIn.value;
    const cap = `${titleIn.value}\n\n${hook}${sum[1] ? '\n' + sum[1] : ''}\n\n${tags.join(' ')}`;
    const ta = h('textarea.in', { rows: 6 }, cap);
    const aiBtn = h('button.btn.sm', { onclick: async () => { const AI = await import('../js/ai.js'); if (!(await AI.enabled())) { toast('설정에서 Gemini 키를 넣으면 AI가 캡션을 써요', { label: '설정', fn: () => go('settings') }); return; } busy(aiBtn, true, 'AI가 쓰는 중'); const r = await AI.caption({ title: titleIn.value, subs: subs.map(s => s.text).join(' '), concept: [concept.name, concept.tone, concept.desc].filter(Boolean).join(' · '), tags: concept.hashtags || '' }); busy(aiBtn, false); if (!r) { toast('AI가 답하지 못했어요. 조금 뒤에 다시 해 주세요.'); return; } ta.value = `${r.hook}\n\n${r.body}\n\n${[...new Set([...(concept.hashtags || '').split(/\s+/).filter(Boolean).map(t => t.replace(/^#?/, '#')), ...r.hashtags])].slice(0, 14).join(' ')}`; } }, ic('sparkles', 14), 'AI로 쓰기');
    capBox.append(h('div.row.between', h('span.chip.warn', '제안 · 고쳐서 쓰세요'), h('div.row', { style: { gap: '6px' } }, aiBtn, h('button.btn.sm', { onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('캡션 복사'); } catch { } } }, ic('copy', 14), '복사'))), ta);
  }

  root.append(
    h('div.row.between', { style: { marginBottom: '8px' } }, h('a.btn.sm.ghost', { href: '#/studio' }, ic('left', 14), '스튜디오'), h('div.row', h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('이 편집을 지울까요?', '지우기')) { await db.remove(id); go('studio'); } } }, ic('trash', 14)))),
    titleIn,
    h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: '16px', alignItems: 'start', marginTop: '10px' }, class: 'editor-grid' },
      h('div.stack', { style: { position: 'sticky', top: '12px' }, class: 'editor-stage' }, canvas, bar, h('div.row.between', h('div.row', playBtn, exportBtn, cancelBtn), timeEl), exportHint),
      h('div.stack.editor-side',
        h('div.card', h('div.card-h', h('h3', ic('palette'), '콘셉트'), applyBtn), h('div.grid.g2', conceptSel, ratioSel), conceptInfo),
        h('div.card', h('div.card-h', h('h3', ic('film'), '클립'), h('label.btn.sm', ic('music', 14), musicEl ? '배경음 바꾸기' : '배경음', h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; stopPreview(); let key; try { key = await db.putBlob(f); } catch (err) { store.logError(err, 'studio:music'); return toast('저장 공간이 모자라서 배경음을 넣지 못했어요'); } await db.patch(id, { musicKey: key }); try { if (musicEl) { musicEl.pause(); URL.revokeObjectURL(musicEl.src); } } catch { } musicEl = Object.assign(new Audio(URL.createObjectURL(f)), { preload: 'auto' }); e.target.value = ''; toast('배경음 넣었어요'); } }))),
          note, dropzone(h('span', ic('upload'), ' 영상·사진 끌어놓기 / 눌러서 고르기'), 'video/*,image/*', addFiles), h('div', { style: { height: '8px' } }), clipList),
        h('div.card', h('div.card-h', h('h3', ic('music'), '소리'), h('button.btn.sm', { onclick: () => { let t = 0; for (const k of clips) { t += V.clipLen(k); } sfx.push({ t: sfx.length ? +(Math.min(Math.max(0, t - .5), (sfx[sfx.length - 1].t || 0) + 2)).toFixed(1) : 0, kind: 'pop', vol: .8 }); save(); drawSfx(); } }, ic('plus', 14), '효과음')),
          h('div.row', { style: { gap: '8px', marginBottom: '8px' } }, h('span.small', '배경음 크기'), h('input', { type: 'range', min: 0, max: 1, step: .05, value: musicVol, style: { flex: 1 }, 'aria-label': '배경음 크기', oninput: e => { musicVol = +e.target.value; save(); } })),
          h('button.btn.sm.ghost', { style: { marginBottom: '8px' }, title: '컷이 바뀌는 곳마다 효과음을 놓아요', onclick: () => { let t = 0; const add = []; clips.slice(0, -1).forEach(k => { t += V.clipLen(k); add.push({ t: +t.toFixed(1), kind: 'whoosh', vol: .6 }); }); if (!add.length) return toast('클립이 두 개 이상일 때 쓸 수 있어요'); sfx = [...sfx.filter(x => !add.some(a => Math.abs(a.t - x.t) < .2)), ...add]; save(); drawSfx(); toast(`컷 ${add.length}곳에 효과음을 놓았어요`); } }, ic('sparkles', 14), '컷마다 자동으로 놓기'),
          sfxList,
          h('p.faint.tiny', { style: { marginTop: '10px' } }, '무료 배경음은 여기서 받아 넣어요: ', h('a', { href: 'https://www.youtube.com/audiolibrary', target: '_blank', rel: 'noopener' }, '유튜브 오디오 보관함'), ' · ', h('a', { href: 'https://pixabay.com/music/', target: '_blank', rel: 'noopener' }, 'Pixabay Music'), ' · ', h('a', { href: 'https://gongu.copyright.or.kr/gongu/bbs/B0000011/list.do?menuNo=200020', target: '_blank', rel: 'noopener' }, '공유마당'))),
        h('div.card', h('div.card-h', h('h3', ic('type'), '자막'), h('div.row', autoSubBtn, h('button.btn.sm', { onclick: () => { const T = V.totalDuration(clips, concept) || 10; subs = V.distributeSubs(script.value, T, concept.intro ? 2.2 : 0); save(); drawSubs(); } }, '대본 → 자막'), h('button.btn.sm.ghost', { onclick: () => download(`${titleIn.value}.srt`, V.toSrt(subs), 'text/plain') }, 'SRT'))), script, h('div', { style: { height: '8px' } }), subList),
        h('div.card', h('div.card-h', h('h3', ic('image'), '썸네일'), h('button.btn.sm', { onclick: thumbs }, ic('sparkles', 14), '장면 고르기')), thumbBox),
        h('div.card', h('div.card-h', h('h3', ic('hash'), '캡션·해시태그'), h('button.btn.sm', { onclick: caption }, ic('sparkles', 14), '만들기')), capBox))));
  drawClips(); drawSubs(); drawSfx(); still(); tell(ghostLine());
  /* 화면을 떠날 때: 재생·녹화를 멈추고 열어 둔 영상을 놓아 줌 (폰에서 메모리가 쌓이지 않게) */
  return () => { try { player && player.close(); } catch { } try { musicEl && musicEl.pause(); } catch { } const seen = new Set(); for (const k of clips) { const el = k.el; if (!el || seen.has(el)) continue; seen.add(el); try { if (k.type === 'video') { el.pause(); const u = el.src; el.removeAttribute('src'); el.load(); URL.revokeObjectURL(u); } else URL.revokeObjectURL(el.src); } catch { } } };
}
// 클립 하나를 연다. 같은 파일에서 잘라 낸 클립들은 영상 요소 하나를 같이 씀(폰은 동시에 열 수 있는 영상 수가 적음).
// 이 기기에서 못 여는 파일(아이폰 고효율 영상을 크롬에서, HEIC 사진 등)은 bad로 표시해서 넣지 않음.
async function loadClip(blob, k, cache) {
  if (k.type === 'image') { const img = new Image(); img.src = URL.createObjectURL(blob); let ok = true; await img.decode().catch(() => { ok = false; }); return { ...k, el: img, bad: !ok || !img.naturalWidth }; }
  let v = cache && k.key ? cache.get(k.key) : null;
  if (!v) {
    v = document.createElement('video'); v.playsInline = true; v.preload = 'metadata'; v.src = URL.createObjectURL(blob);
    const ok = await new Promise(r => { v.onloadedmetadata = () => r(true); v.onerror = () => r(false); setTimeout(() => r(false), 10000); });
    if (ok && !Number.isFinite(v.duration)) await new Promise(r => { const end = () => { v.removeEventListener('durationchange', end); r(); }; v.addEventListener('durationchange', end); try { v.currentTime = 1e7; } catch { } setTimeout(end, 3000); }).then(() => { try { v.currentTime = 0; } catch { } });   /* 폰·브라우저가 녹화한 영상은 길이를 끝까지 가 봐야 앎 */
    v._bad = !ok || !Number.isFinite(v.duration) || !v.duration || !v.videoWidth;
    if (cache && k.key && !v._bad) cache.set(k.key, v);
  }
  return { ...k, el: v, out: v._bad ? 0 : Math.min(k.out ?? v.duration, v.duration), bad: v._bad };
}
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3g2)$/i, IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;
const kindOf = f => (/^video\//.test(f.type) || (!f.type && VIDEO_EXT.test(f.name)) ? 'video' : /^image\//.test(f.type) || (!f.type && IMAGE_EXT.test(f.name)) ? 'image' : '');
const mb = n => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'GB' : Math.max(1, Math.round(n / 1e6)) + 'MB');
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
