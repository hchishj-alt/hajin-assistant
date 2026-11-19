// 꾸미기: 내 화면 취향 (나만 적용, 내 계정으로 다른 기기에도 따라옴)
import { h, ic, clear, toast, head, seg, pickFile, confirmBox } from '../js/ui.js';
import * as db from '../js/db.js';
import * as L from '../js/look.js';
import { go, applyTheme, MODULES, buildNav } from '../js/app.js';

export default {
  async render(root) {
    const cur = await L.get();
    const set = async (patch, redraw = true) => { await L.save(patch); await applyTheme(); if (redraw) go('look'); };
    const row = (label, ctl) => h('div.look-row', h('span', label), ctl);
    const pick = (k, opts) => seg(opts, cur[k], v => set({ [k]: v }));
    const sec = (title, icon, ...kids) => h('div.card', h('div.card-h', h('h3', ic(icon), title)), ...kids);
    const range = (val, min, max, fn) => { const r = h('input', { type: 'range', min, max, value: val, oninput: () => fn(+r.value, false), onchange: () => fn(+r.value, true) }); return r; };

    root.append(head('꾸미기', '질리지 않게 내 화면만 바꿔요. 팀원 화면에는 영향이 없고, 내 계정으로 로그인한 기기에 따라와요.',
      h('button.btn.sm', { onclick: async () => { if (await confirmBox('꾸미기를 처음 상태로 되돌릴까요?', '되돌리기')) { await L.reset(); await applyTheme(); await buildNav(); go('look'); } } }, ic('refresh', 14), '처음으로')));

    const inkIn = h('input', { type: 'color', value: cur.ink || getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#17181b', oninput: () => set({ ink: inkIn.value }, false) });
    const B = cur.bg;
    const urlIn = h('input.in', { placeholder: '이미지 주소 붙여넣기 (https://…)', value: B.url || '', onchange: () => set({ bg: { kind: urlIn.value.trim() ? 'url' : 'none', url: urlIn.value.trim() } }) });

    root.append(
      h('div.card', { style: { marginBottom: '14px' } }, h('div.card-h', h('h3', ic('sparkles'), '분위기 한 번에')),
        h('div.presets', Object.entries(L.PRESETS).map(([id, p]) => h('button.preset', { onclick: async () => { await db.kvSet('look', { ...L.DEFAULT, ...p.look, bg: { ...L.DEFAULT.bg, ...(p.look.bg || {}) }, start: cur.start, hidden: cur.hidden }); await applyTheme(); toast(`"${p.name}" 분위기로 바꿨어요`); go('look'); } },
          h('div.pv', { style: { fontFamily: L.FONTS[p.look.font || 'pretendard'].css, borderRadius: 10 * (p.look.rd || 1) + 'px', background: p.look.bg ? L.GRADS[p.look.bg.grad] : 'var(--bg2)', borderWidth: (p.look.bw ?? 1) + 'px' } }, '가나 Aa'), h('b', p.name), h('span', p.note))))),
      h('div.look-grid',
        sec('글씨', 'edit',
          row('폰트', h('select.in', { onchange: e => set({ font: e.target.value }) }, Object.entries(L.FONTS).map(([id, f]) => h('option', { value: id, selected: cur.font === id }, `${f.name} · ${f.note}`)))),
          row('크기', pick('fs', [[.92, '작게'], [1, '보통'], [1.08, '크게'], [1.16, '아주 크게']])),
          row('자간', pick('ls', [['tight', '좁게'], ['normal', '보통'], ['wide', '넓게']])),
          row('줄 간격', pick('lh', [['tight', '촘촘'], ['normal', '보통'], ['loose', '넉넉']])),
          row('글씨 색', h('div.row', inkIn, cur.ink ? h('button.btn.sm', { onclick: () => set({ ink: '' }) }, '색 조합 따라가기') : h('span.faint.tiny', '안 보이는 색은 알아서 진하게 보정해요')))),
        sec('모양', 'grid',
          row('둥글리기', pick('rd', [[.35, '각지게'], [1, '보통'], [1.4, '둥글게'], [1.9, '아주 둥글게']])),
          row('테두리', pick('bw', [[0, '없음'], [1, '얇게'], [1.5, '보통'], [2, '굵게']])),
          row('테두리 색', pick('line', [['soft', '연하게'], ['strong', '진하게'], ['acc', '포인트 색']])),
          row('그림자', pick('shadow', [['none', '없음'], ['soft', '은은'], ['deep', '또렷']])),
          row('아이콘 선', pick('iw', [[1.5, '가늘게'], [1.9, '보통'], [2.4, '도톰']]))),
        sec('투명도 · 배경', 'image',
          row('카드 투명도', pick('cardA', [[100, '불투명'], [88, '살짝'], [72, '반투명'], [55, '많이']])),
          row('배경', h('div.bgpick',
            h('button' + (B.kind === 'none' ? '.on' : ''), { onclick: () => set({ bg: { kind: 'none' } }) }, '없음'),
            Object.entries(L.GRADS).map(([id, g]) => h('button' + (B.kind === 'grad' && B.grad === id ? '.on' : ''), { 'aria-label': '그라데이션 ' + id, style: { backgroundImage: g, backgroundColor: 'var(--bg)' }, onclick: () => set({ bg: { kind: 'grad', grad: id } }) })),
            h('button' + (B.kind === 'image' ? '.on' : ''), { onclick: async () => { const f = await pickFile('image/*'); if (!f) return; try { await L.setImage(f); await applyTheme(); toast('배경으로 깔았어요'); go('look'); } catch { toast('이 이미지는 읽을 수 없어요'); } } }, ic('upload', 14), ' 사진'))),
          row('이미지 링크', urlIn),
          row('흐림', range(B.blur, 0, 40, (v, done) => set({ bg: { blur: v } }, false))),
          row('덮개 진하기', range(B.dim, 40, 95, (v, done) => set({ bg: { dim: v } }, false))),
          row('그라데이션 덮개', seg([['none', '고르게'], ['bottom', '아래로 진하게'], ['top', '위로 진하게'], ['side', '옆으로'], ['vignette', '가운데 밝게']], B.mask, v => set({ bg: { mask: v } }))),
          h('p.faint.tiny', { style: { marginTop: '6px' } }, '올린 사진은 이 기기에만 저장돼요. 글자가 묻히지 않게 덮개는 40% 아래로, 카드는 55% 아래로 내려가지 않아요.')),
        sec('움직임 · 여백', 'zap',
          row('움직임', pick('motion', [['bouncy', '쫀득'], ['calm', '잔잔'], ['off', '끄기']])),
          row('여백', pick('density', [['tight', '촘촘'], ['normal', '보통'], ['loose', '넉넉']]))),
        sec('메뉴', 'menu',
          row('처음 화면', h('select.in', { onchange: e => set({ start: e.target.value }, false) }, MODULES.filter(m => !m.hidden && !m.adminOnly).map(m => h('option', { value: m.id, selected: cur.start === m.id }, m.title)))),
          h('p.small.muted', { style: { margin: '8px 0 4px' } }, '안 쓰는 메뉴 숨기기'),
          h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } }, MODULES.filter(m => !m.hidden && !m.adminOnly && !['today', 'settings', 'look', 'menu', 'assistant', 'inbox'].includes(m.id)).map(m => { const off = cur.hidden.includes(m.id); return h('button.chip' + (off ? '' : '.on'), { style: { cursor: 'pointer', border: 0, opacity: off ? .45 : 1 }, 'aria-pressed': !off, onclick: async () => { await L.save({ hidden: off ? cur.hidden.filter(x => x !== m.id) : [...cur.hidden, m.id] }); await buildNav(); go('look'); } }, m.title); })))));
  },
};
