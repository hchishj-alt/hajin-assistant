// 레퍼런스 아카이브: 링크만 붙이면 미리보기, 프로젝트 = 대분류 폴더, 색·느낌·올린 사람·종류로 필터
import { h, ic, clear, toast, head, modal, form, confirmBox, tile, seg, busy, rel, debounce, colorFor, pickFile } from '../js/ui.js';
import * as db from '../js/db.js';
import * as brain from '../js/brain.js';
import * as LP from '../js/linkpreview.js';
import { go } from '../js/app.js';

const F = { folder: '', sub: '', kind: '', hues: new Set(), moods: new Set(), by: '', q: '' };
const KIND = { video: ['영상', 'film'], image: ['이미지', 'image'], web: ['웹', 'globe'] };
const teamOf = async () => ((await db.get('team-main')) ? 'team-main' : '');
const meName = () => db.kvGet('name', '하진');
const blobUrls = new Map();

export default {
  async render(root, params) {
    if (params[0] === 'p' && params[1]) { F.folder = params[1]; F.sub = params[2] || ''; }
    const box = h('div');
    root.append(head('레퍼런스 아카이브', '링크만 붙이면 미리보기가 떠요. 색·느낌은 자동으로 골라 둬요.',
      h('button.btn.sm', { onclick: newFolder }, ic('plus', 14), '폴더'),
      h('button.btn.sm', { onclick: async () => { const f = await pickFile('image/*', true); const fs = [].concat(f || []).filter(Boolean); if (fs.length) addImages(fs); } }, ic('upload', 14), '이미지 올리기'),
      h('button.btn.sm.pri', { onclick: () => addLinks() }, ic('link', 14), '링크 추가')), box);
    // 어디서든 링크·이미지 붙여넣기
    const onPaste = async e => {
      if (!document.body.contains(box) || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const t = e.clipboardData?.getData('text') || '';
      const files = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addImages(files, t && /https?:\/\//.test(t) ? t.trim() : ''); }
      else if (/https?:\/\//.test(t)) { e.preventDefault(); addLinks(t); }
    };
    document.addEventListener('paste', onPaste);
    await draw();
    return () => document.removeEventListener('paste', onPaste);

    async function draw() {
      clear(box);
      const [all, projects, subs] = await Promise.all([db.list('refs'), db.list('projects'), db.list('reffolders')]);
      const people = [...new Set(all.map(r => r.by).filter(Boolean))];
      const inFolder = all.filter(r => (!F.folder || (F.folder === '_none' ? !r.project : r.project === F.folder)) && (!F.sub || r.sub === F.sub));
      const shown = inFolder.filter(r => (!F.kind || (r.kind || 'image') === F.kind) && (!F.by || r.by === F.by) && [...F.hues].every(x => (r.hues || []).includes(x)) && [...F.moods].every(x => (r.mood || []).includes(x)) && (!F.q || `${r.title} ${r.memo || ''} ${(r.tags || []).join(' ')} ${r.provider || ''}`.toLowerCase().includes(F.q.toLowerCase())));
      box.append(h('div.tiles', { style: { marginBottom: '14px' } }, tile('layers', all.length, '전체 레퍼런스'), tile('film', all.filter(r => r.kind === 'video').length, '영상'), tile('image', all.filter(r => (r.kind || 'image') === 'image').length, '이미지'), tile('users', people.length, '올린 사람')));
      const layout = h('div.arch');
      // 폴더 (대분류 = 프로젝트)
      const tree = h('nav.arch-tree', h('div.arch-tl', '폴더'));
      const fbtn = (label, folder, sub, n, color) => h('button.arch-f' + (F.folder === folder && F.sub === sub ? '.on' : '') + (sub ? '.sub' : ''), { onclick: () => { F.folder = folder; F.sub = sub; draw(); } }, color ? h('span.dot', { style: { background: color } }) : ic(sub ? 'file' : 'inbox', 14), h('span.grow', label), h('span.n', n));
      tree.append(fbtn('전체', '', '', all.length));
      for (const p of projects.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))) {
        tree.append(fbtn(p.name, p.name, '', all.filter(r => r.project === p.name).length, p.color || colorFor(p.name)));
        if (F.folder === p.name) subs.filter(s => s.project === p.name).forEach(s => tree.append(fbtn(s.name, p.name, s.name, all.filter(r => r.project === p.name && r.sub === s.name).length)));
      }
      const none = all.filter(r => !r.project).length;
      if (none) tree.append(fbtn('분류 안 됨', '_none', '', none));
      // 필터
      const q = h('input.in', { placeholder: '제목·태그·사이트 찾기', value: F.q, oninput: debounce(e => { F.q = e.target.value; draw().then(() => { const i = box.querySelector('.arch-q input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250) });
      const sw = h('div.swatches', LP.HUES.map(([n, c]) => h('button.sw' + (F.hues.has(n) ? '.on' : ''), { title: n, 'aria-label': n, style: { background: c }, onclick: () => { F.hues.has(n) ? F.hues.delete(n) : F.hues.add(n); draw(); } })));
      const moods = h('div.chips', LP.MOODS.filter(m => all.some(r => (r.mood || []).includes(m))).map(m => h('button.chip' + (F.moods.has(m) ? '.acc' : ''), { onclick: () => { F.moods.has(m) ? F.moods.delete(m) : F.moods.add(m); draw(); } }, m)));
      const who = h('div.chips', people.map(p => h('button.chip' + (F.by === p ? '.acc' : ''), { onclick: () => { F.by = F.by === p ? '' : p; draw(); } }, h('span.av', { style: { background: colorFor(p) } }, p.slice(-2, -1) || p[0]), p)));
      const active = F.hues.size + F.moods.size + (F.by ? 1 : 0) + (F.kind ? 1 : 0) + (F.q ? 1 : 0);
      const filters = h('div.card.arch-filter',
        h('div.row', { style: { gap: '10px', flexWrap: 'wrap' } }, h('div.arch-q.grow', { style: { minWidth: '180px' } }, q), seg([['', '전체'], ['video', '영상'], ['image', '이미지'], ['web', '웹']], F.kind, v => { F.kind = v; draw(); }), active ? h('button.btn.sm.ghost', { onclick: () => { F.hues.clear(); F.moods.clear(); F.by = ''; F.kind = ''; F.q = ''; draw(); } }, '필터 지우기') : null),
        h('div.arch-frow', h('span.lbl', '색'), sw), all.some(r => r.mood?.length) ? h('div.arch-frow', h('span.lbl', '느낌'), moods) : null, people.length ? h('div.arch-frow', h('span.lbl', '올린 사람'), who) : null);
      // 그리드
      const grid = h('div.masonry');
      if (!shown.length) grid.append(h('div.card', h('div.empty', all.length ? '조건에 맞는 레퍼런스가 없어요' : '링크를 붙여넣기(Ctrl+V) 하거나 “링크 추가”를 눌러 보세요. 유튜브·비메오·핀터레스트·비핸스·인스타·이미지 주소 다 돼요.')));
      for (const r of shown.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) grid.append(await cardOf(r));
      const dz = h('div.drop.arch-drop', { onclick: () => addLinks() }, ic('link', 16), ' 링크·이미지 붙여넣기(Ctrl+V) · 끌어놓기 · 눌러서 링크 추가');
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = async e => { e.preventDefault(); dz.classList.remove('over'); const t = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text'); const fs = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')); if (fs.length) return addImages(fs, t && /^https?:/.test(t) ? t : ''); if (t) return addLinks(t); };
      layout.append(tree, h('div.arch-main', filters, dz, h('div.faint.tiny', { style: { margin: '2px 2px 8px' } }, `${shown.length}개${F.folder ? ' · ' + (F.folder === '_none' ? '분류 안 됨' : F.folder) + (F.sub ? ' › ' + F.sub : '') : ''}`), grid));
      box.append(layout);
    }

    async function cardOf(r) {
      let src = r.thumb || '';
      if (r.imgKey) { if (!blobUrls.has(r.imgKey)) { const b = await db.getBlob(r.imgKey); if (b) blobUrls.set(r.imgKey, URL.createObjectURL(b)); } src = blobUrls.get(r.imgKey) || ''; }
      const k = KIND[r.kind || 'image'];
      const el = h('div.ref', { tabindex: 0, onclick: () => open(r, src), onkeydown: e => e.key === 'Enter' && open(r, src) },
        h('div.ref-img', src ? h('img', { src, loading: 'lazy', alt: r.title || '', referrerpolicy: 'no-referrer', onerror: e => { e.target.replaceWith(h('div.ref-ph', ic(k[1], 28))); } }) : h('div.ref-ph', ic(k[1], 28)),
          r.kind === 'video' ? h('span.ref-play', ic('play', 16)) : null,
          h('div.ref-hover', h('span.av', { style: { background: colorFor(r.by || '?') } }, (r.by || '?').slice(-2, -1) || (r.by || '?')[0]), h('div', h('b', r.by || '알 수 없음'), h('div', `${rel((r.createdAt || '').slice(0, 10))} 올림`)))),
        h('div.ref-b', h('div.ref-t', r.title || r.url), h('div.row.between', { style: { gap: '6px' } }, h('span.faint.tiny', { style: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 } }, ic(k[1], 12), h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.provider || k[0])),
          r.colors?.length ? h('div.pal', r.colors.slice(0, 5).map(c => h('i', { style: { background: c }, title: c }))) : null)));
      return el;
    }

    function open(r, src) {
      modal(r.title || '레퍼런스', close => {
        const media = r.embed && r.kind === 'video' ? (/\.(mp4|webm|mov)/i.test(r.embed) ? h('video', { src: r.embed, controls: true, style: { width: '100%', borderRadius: '12px' } }) : h('div.ratio', h('iframe', { src: r.embed, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' })))
          : src ? h('img', { src, referrerpolicy: 'no-referrer', style: { width: '100%', borderRadius: '12px', display: 'block', maxHeight: '60vh', objectFit: 'contain', background: 'var(--bg2)' } }) : null;
        return h('div',
          media,
          h('div.row', { style: { margin: '12px 0 6px', gap: '8px', flexWrap: 'wrap' } },
            r.colors?.length ? h('div.pal.lg', r.colors.map(c => h('button', { title: c + ' 복사', style: { background: c }, onclick: async () => { await navigator.clipboard.writeText(c); toast(c + ' 복사했어요'); } }))) : null,
            ...(r.mood || []).map(m => h('span.chip', m)), ...(r.hues || []).map(x => h('span.chip', x))),
          h('p.faint.small', [r.by && `${r.by} 올림`, r.provider, r.project && `폴더 ${r.project}${r.sub ? ' › ' + r.sub : ''}`].filter(Boolean).join(' · ')),
          r.memo ? h('p.small', r.memo) : null,
          h('div.modal-f',
            h('button.btn.ghost.danger', { onclick: async () => { if (await confirmBox('이 레퍼런스를 지울까요?', '지우기')) { await db.remove(r.id); close(); draw(); } } }, ic('trash', 14)),
            src && !r.colors?.length ? h('button.btn', { onclick: async e => { const btn = e.currentTarget; busy(btn, true, '분석 중'); try { await db.patch(r.id, await LP.analyzeColors(src)); toast('색을 분석했어요'); close(); draw(); } catch { toast('이 이미지는 색을 못 읽었어요'); busy(btn, false); } } }, '색 분석') : null,
            h('button.btn', { onclick: () => { close(); edit(r); } }, ic('edit', 14), '고치기'),
            r.url ? h('a.btn.pri', { href: r.url, target: '_blank', rel: 'noopener' }, '원본 열기') : null));
      }, { wide: true });
    }

    async function folderFields(cur = {}) {
      const projects = (await db.list('projects')).map(p => p.name).filter(Boolean);
      const subs = await db.list('reffolders');
      return [{ k: 'project', label: '폴더 (프로젝트)', type: 'select', options: [['', '분류 안 됨'], ...projects.map(p => [p, p])] },
        { k: 'sub', label: '하위 폴더', type: 'select', options: [['', '없음'], ...subs.filter(s => !cur.project || s.project === cur.project).map(s => [s.name, `${s.project} › ${s.name}`])] }];
    }
    async function edit(r) {
      const ff = await folderFields(r);
      modal('레퍼런스 고치기', close => form([{ k: 'title', label: '제목', full: true }, ...ff, { k: 'tagsS', label: '태그 (쉼표로)', full: true }, { k: 'moodS', label: '느낌 (쉼표로)', full: true }, { k: 'memo', label: '메모', type: 'textarea', rows: 3 }],
        { ...r, tagsS: (r.tags || []).join(', '), moodS: (r.mood || []).join(', ') }, async v => {
          const { tagsS, moodS, ...rest } = v; const sp = s => s.split(/[,，]/).map(x => x.trim()).filter(Boolean);
          await db.put('refs', { ...r, ...rest, tags: sp(tagsS), mood: sp(moodS) }); close(); draw();
        }));
    }

    async function addLinks(text = '') {
      const ta = h('textarea.in', { rows: 4, placeholder: '링크를 한 줄에 하나씩 (여러 개 한 번에 돼요)' });
      ta.value = text;
      const ff = await folderFields({ project: F.folder && F.folder !== '_none' ? F.folder : '' });
      modal('링크로 레퍼런스 추가', close => {
        const f = form([...ff, { k: 'memo', label: '메모 (선택)', full: true }], { project: F.folder && F.folder !== '_none' ? F.folder : '', sub: F.sub }, async v => {
          const urls = [...new Set((ta.value.match(/https?:\/\/[^\s<>"']+|(?:www\.)[^\s<>"']+/g) || []))];
          if (!urls.length) { toast('링크를 찾지 못했어요'); return; }
          const btn = document.querySelector('.modal button[type=submit]'); busy(btn, true, `불러오는 중 0/${urls.length}`);
          const by = await meName(), team = await teamOf();
          let n = 0;
          for (const u of urls) {
            const ex = (await db.list('refs')).find(x => x.url === u);
            if (ex) { n++; continue; }
            let p; try { p = await LP.preview(u); } catch { p = { url: u, title: u, kind: 'web' }; }
            const item = await db.put('refs', { ...p, project: v.project, sub: v.sub, memo: v.memo, by, team, tags: brain.keywords(`${p.title} ${p.desc || ''} ${v.memo || ''}`, 4) });
            if (p.thumb) LP.analyzeColors(p.thumb).then(c => db.patch(item.id, c)).then(() => draw()).catch(() => { });
            btn.textContent = `불러오는 중 ${++n}/${urls.length}`;
          }
          toast(`${urls.length}개를 담았어요. 색은 곧 자동으로 골라져요`); close(); draw();
        }, { submitLabel: '담기' });
        f.prepend(ta);
        setTimeout(() => ta.focus(), 50);
        return f;
      });
    }
    // 이미지 (붙여넣기·올리기·끌어놓기): 링크는 선택, 팀 저장소에 webp로 줄여 올림 (로그인 안 했으면 이 기기에만)
    async function addImages(files, link = '') {
      const ff = await folderFields({ project: F.folder && F.folder !== '_none' ? F.folder : '' });
      const urls = files.map(f => URL.createObjectURL(f));
      modal(files.length > 1 ? `이미지 ${files.length}장 담기` : '이미지 담기', close => {
        const f = form([{ k: 'title', label: '제목 (비우면 파일 이름)', full: true }, { k: 'url', label: '원본 링크 (선택)', type: 'url', full: true, default: link }, ...ff, { k: 'memo', label: '메모 (선택)', full: true }],
          { project: F.folder && F.folder !== '_none' ? F.folder : '', sub: F.sub, url: link }, async v => {
            const btn = document.querySelector('.modal button[type=submit]'); busy(btn, true, '담는 중');
            const by = await meName(), team = await teamOf();
            const sync = await import('../js/sync.js');
            let cloud = 0;
            for (const [i, file] of files.entries()) {
              const small = await shrink(file);
              const pub = await sync.uploadImage(small).catch(() => null);
              const base = { kind: 'image', title: (files.length > 1 && v.title ? `${v.title} ${i + 1}` : v.title) || (file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.\w+$/, '') : '붙여넣은 이미지'), url: v.url || '', project: v.project, sub: v.sub, memo: v.memo, by, provider: v.url ? hostOf(v.url) : pub ? '팀 저장소' : '이 기기에만' };
              let item;
              if (pub) { cloud++; item = await db.put('refs', { ...base, thumb: pub, team }); }
              else { const key = await db.putBlob(small); blobUrls.set(key, URL.createObjectURL(small)); item = await db.put('refs', { ...base, imgKey: key, team: '' }); }
              LP.analyzeColors(urls[i]).then(c => db.patch(item.id, c)).then(() => draw()).catch(() => { });
            }
            toast(cloud === files.length ? `${files.length}장 담았어요 · 팀도 같이 봐요` : `${files.length}장 담았어요${cloud ? ` (팀 공유 ${cloud}장)` : ' · 동기화에 로그인하면 팀과 같이 봐요'}`);
            close(); draw();
          }, { submitLabel: '담기' });
        f.prepend(h('div', { style: { display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '10px' } }, urls.map(u => h('img', { src: u, style: { height: '120px', borderRadius: '10px', flex: 'none' } }))));
        return f;
      });
    }
    async function newFolder() {
      const projects = (await db.list('projects')).map(p => p.name).filter(Boolean);
      modal('새 폴더', close => form([{ k: 'kind', label: '종류', type: 'select', options: [['project', '대분류 (새 프로젝트)'], ['sub', '하위 폴더']], default: F.folder && F.folder !== '_none' ? 'sub' : 'project' }, { k: 'project', label: '어느 프로젝트 안에 (하위 폴더일 때)', type: 'select', options: projects.map(p => [p, p]), default: F.folder }, { k: 'name', label: '이름', full: true }], {}, async v => {
        if (!v.name?.trim()) { toast('이름을 적어 주세요'); return; }
        const team = await teamOf();
        if (v.kind === 'project') { if (!projects.includes(v.name.trim())) await db.put('projects', { name: v.name.trim(), status: '진행', color: colorFor(v.name), team }); F.folder = v.name.trim(); F.sub = ''; }
        else { if (!v.project) { toast('프로젝트를 골라 주세요'); return; } await db.put('reffolders', { project: v.project, name: v.name.trim(), team }); F.folder = v.project; F.sub = v.name.trim(); }
        close(); draw();
      }, { submitLabel: '만들기' }));
    }
  },
};

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
// 긴 변 1600px, webp로 줄이기 (용량 1/5 정도)
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (file.type === 'image/gif' && file.size < 2.5e6) return file;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/webp', 0.82));
    return b && b.size < file.size ? b : file;
  } catch { return file; }
}
