import { h, ic, clear, toast, head, modal, form, fmtDate, confirmBox, tile } from '../js/ui.js';
import * as db from '../js/db.js';
import { go } from '../js/app.js';

export default {
  async render(root) {
    const files = (await db.list('figma')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const paste = h('textarea.in', { rows: 3, placeholder: '플러그인의 "요약 만들기" 결과를 여기 붙여넣기' });
    const addBtn = h('button.btn.pri', { onclick: async () => {
      let j; try { j = JSON.parse(paste.value.trim()); } catch { toast('요약 형식이 아니에요. 플러그인에서 다시 복사해 주세요'); return; }
      if (j.app !== 'hajin-figma') { toast('하진 정리 플러그인 요약이 아니에요'); return; }
      const ex = files.find(f => f.file === j.file);
      const snap = { at: j.at, frames: j.pages.reduce((s, p) => s + p.frames, 0), pages: j.pages.length, comps: j.pages.reduce((s, p) => s + p.comps, 0) };
      await db.put('figma', { ...(ex || {}), file: j.file, fileKey: j.fileKey || ex?.fileKey || '', pages: j.pages, history: [...(ex?.history || []), snap].slice(-30) });
      toast(ex ? '파일 요약을 업데이트했어요' : '파일을 추가했어요'); go('figma');
    } }, ic('check', 14), '추가');
    const total = files.reduce((s, f) => s + (f.pages || []).reduce((a, p) => a + p.frames, 0), 0);
    root.append(head('피그마 정리', '자체 플러그인으로 파일을 정리하고, 구조 요약을 여기 모아서 한눈에 봐요.',
      h('a.btn.sm.pri', { href: 'figma-plugin.zip', download: 'hajin-tidy-figma-plugin.zip' }, ic('download', 14), '플러그인 받기')),
      h('div.tiles', { style: { marginBottom: '14px' } }, tile('layers', files.length, '관리 중인 파일'), tile('grid', total, '프레임 합계'), tile('check', files.filter(f => (f.pages || []).some(p => /cover/i.test(p.name))).length, '커버 있는 파일', 'ok'), tile('clock', files[0] ? fmtDate(files[0].updatedAt).split(' (')[0] : '–', '마지막 정리')),
      h('div.grid.g2',
        h('div.card', h('div.card-h', h('h3', ic('book'), '플러그인 설치 (한 번만)')),
          h('ol', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.9 } },
            h('li.small', '위의 ', h('b', '플러그인 받기'), '로 zip을 받아 압축을 풀어요'),
            h('li.small', 'Figma 데스크톱 앱 → 아무 파일 열기'),
            h('li.small', '메뉴 → Plugins → Development → ', h('b', 'Import plugin from manifest…')),
            h('li.small', '압축 푼 폴더의 ', h('code', 'manifest.json'), ' 선택'),
            h('li.small', '이후 Plugins → Development → ', h('b', '하진 정리'), '로 실행')),
          h('p.faint.tiny', { style: { marginTop: '8px' } }, '인터넷 없이 파일 안에서만 동작해요. 계정·토큰 필요 없음.')),
        h('div.card', h('div.card-h', h('h3', ic('sparkles'), '플러그인이 하는 일')),
          h('div.list', [['edit', '레이어 이름 정리', '기본 이름 → Button/·Card/·Text/ 규칙'], ['grid', '프레임 정렬·섹션 묶기', '이름순 격자, 앞부분 같은 것끼리 섹션'], ['flag', '상태 표시', '✅ 🛠 👀 ⏸ 를 프레임 이름 앞에'], ['file', '페이지 구조·커버', 'Cover/Flow/Design/Components/Archive + 썸네일'], ['palette', '스타일 점검', '스타일 안 걸린 색·글꼴 찾기'], ['upload', '요약 보내기', '파일 구조를 이 앱으로']].map(([i, t, s]) => h('div.li', ic(i, 16), h('div.grow', h('div.small', { style: { fontWeight: 600 } }, t), h('div.faint.tiny', s))))))),
      h('div.card', { style: { margin: '14px 0' } }, h('div.card-h', h('h3', ic('upload'), '파일 요약 붙여넣기')), paste, h('div.modal-f', addBtn)));
    if (!files.length) { root.append(h('div.card', h('div.empty', '플러그인에서 요약을 붙여넣으면 파일별 현황이 쌓여요'))); return; }
    const g = h('div.grid.g2');
    for (const f of files) {
      const hs = f.history || [];
      const last = hs[hs.length - 1] || {}, prev = hs[hs.length - 2];
      const urlIn = h('input.in', { value: f.url || '', placeholder: 'figma.com 파일 링크 (선택)', onchange: async () => db.patch(f.id, { url: urlIn.value.trim() }) });
      const statusOf = n => /^✅/.test(n) ? 'done' : /^🛠/.test(n) ? 'wip' : /^👀/.test(n) ? 'review' : /^⏸/.test(n) ? 'hold' : 'none';
      const allFrames = (f.pages || []).flatMap(p => p.topFrames || []);
      const cnt = { done: 0, wip: 0, review: 0, hold: 0, none: 0 }; allFrames.forEach(n => cnt[statusOf(n)]++);
      g.append(h('div.card', h('div.card-h', h('h3', ic('layers'), f.file), h('div.row', f.url ? h('a.btn.sm', { href: f.url, target: '_blank', rel: 'noopener' }, '열기') : null, h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('이 파일 기록을 지울까요?', '지우기')) { await db.remove(f.id); go('figma'); } } }, ic('trash', 13)))),
        h('div.row', { style: { gap: '14px', marginBottom: '8px' } }, stat(last.pages, '페이지'), stat(last.frames, '프레임', prev && last.frames - prev.frames), stat(last.comps, '컴포넌트', prev && last.comps - prev.comps)),
        allFrames.length ? h('div', { style: { display: 'flex', height: '10px', borderRadius: '99px', overflow: 'hidden', background: 'var(--bg2)' } }, [['done', 'var(--ok)'], ['review', 'var(--acc)'], ['wip', 'var(--warn)'], ['hold', 'var(--ink3)']].map(([k, c]) => h('div', { title: k, style: { width: cnt[k] / allFrames.length * 100 + '%', background: c } }))) : null,
        h('div.row.tiny.faint', { style: { marginTop: '4px' } }, `✅ ${cnt.done}`, `👀 ${cnt.review}`, `🛠 ${cnt.wip}`, `⏸ ${cnt.hold}`, `표시 없음 ${cnt.none}`),
        h('div.list', { style: { marginTop: '8px' } }, (f.pages || []).map(p => h('div.li', h('div.grow.small', p.name), h('span.faint.tiny.mono', `${p.frames} 프레임 · ${p.comps} 컴포넌트`)))),
        urlIn, h('p.faint.tiny', { style: { marginTop: '6px' } }, `마지막 요약 ${fmtDate(last.at || f.updatedAt, { time: true })}`)));
    }
    root.append(g);
  },
};
const stat = (n, l, d) => h('div', h('div.stat', { style: { fontSize: '22px' } }, n ?? 0, d ? h('span.small', { style: { color: d > 0 ? 'var(--ok)' : 'var(--bad)', marginLeft: '4px' } }, (d > 0 ? '+' : '') + d) : null), h('div.faint.tiny', l));
