import { h, ic, clear, toast, head, seg, modal, form, fmtDate, colorFor, confirmBox, debounce, dropzone, download, md, tile } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';
import { go } from '../js/app.js';

export const TEMPLATES = {
  '기획서': '## 한 줄 정의\n\n## 왜 (문제)\n\n## 누구에게 (타깃)\n\n## 무엇을 (핵심 기능 3개)\n- \n- \n- \n\n## 어떻게 보일까 (톤·무드)\n\n## 일정\n- \n\n## 리스크·확인할 것\n- ',
  '콘셉트 기획': '## 콘셉트 키워드 3개\n\n## 무드\n\n## 색 (주조·보조·포인트)\n\n## 타이포\n\n## 레퍼런스에서 가져올 것\n- \n\n## 하지 않을 것\n- ',
  '린 캔버스': '## 문제\n\n## 고객군\n\n## 고유 가치 제안\n\n## 솔루션\n\n## 채널\n\n## 수익원\n\n## 비용 구조\n\n## 핵심 지표\n\n## 경쟁 우위',
  'KPT 회고': '## Keep (좋았던 것)\n- \n\n## Problem (아쉬웠던 것)\n- \n\n## Try (다음에 해 볼 것)\n- ',
  '사용자 여정': '## 페르소나\n\n## 단계별\n### 알게 됨\n### 써 봄\n### 계속 씀\n\n## 불편한 순간\n\n## 기회',
  '콘텐츠 기획': '## 주제\n\n## 첫 1.5초 훅\n\n## 컷 구성\n1. \n2. \n3. \n\n## 자막·문구\n\n## 해시태그\n',
  '피치덱 목차': '1. 문제\n2. 해결책\n3. 시장 크기\n4. 제품\n5. 비즈니스 모델\n6. 경쟁\n7. 팀\n8. 지표·성과\n9. 로드맵\n10. 투자 요청',
};
let tab = 'docs', projF = '';
export default {
  async render(root, params) {
    if (params[0]) { const it = await db.get(params[0]); if (it?.col === 'refs') tab = 'refs'; else return editor(root, params[0]); }
    const body = h('div');
    root.append(head('기획 보드', '메모·아이디어·기획서·레퍼런스를 한곳에. 쓰면 키워드와 비슷한 기록을 찾아 줘요.',
      h('button.btn.sm', { onclick: newProject }, ic('grid', 14), '프로젝트'),
      h('button.btn.sm.pri', { onclick: () => newDoc() }, ic('plus', 14), '새 문서')), body);
    await draw();

    async function draw() {
      clear(body);
      const [notes, refs, projects] = await Promise.all([db.list('notes'), db.list('refs'), db.list('projects')]);
      body.append(h('div.tiles', { style: { marginBottom: '12px' } }, tile('file', notes.filter(n => n.type !== 'idea').length, '문서·메모'), tile('bulb', notes.filter(n => n.type === 'idea').length, '아이디어'), tile('link', refs.length, '레퍼런스'), tile('grid', projects.length, '프로젝트')));
      body.append(h('div.row.between', { style: { marginBottom: '12px' } },
        seg([['docs', '문서'], ['ideas', '아이디어 보드'], ['refs', '레퍼런스'], ['projects', '프로젝트']], tab, v => { tab = v; draw(); }),
        h('select.in', { style: { width: 'auto' }, onchange: e => { projF = e.target.value; draw(); } }, h('option', { value: '' }, '모든 프로젝트'), projects.map(p => h('option', { value: p.name, selected: p.name === projF }, p.name)))));
      const pf = x => !projF || x.project === projF;
      if (tab === 'docs') {
        const xs = notes.filter(n => n.type !== 'idea' && pf(n)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const g = h('div.grid.gauto');
        if (!xs.length) body.append(h('div.card', h('div.empty', '새 문서에서 템플릿을 골라 시작해 보세요')));
        xs.forEach(n => g.append(h('div.card.click', { onclick: () => go('plan/' + n.id) },
          h('div.row.between', h('span.chip' + (n.type === 'memo' ? '' : '.acc'), n.template || (n.type === 'memo' ? '메모' : '문서')), h('span.faint.tiny', fmtDate(n.updatedAt))),
          h('h3', { style: { margin: '8px 0 4px' } }, n.title || '(제목 없음)'),
          h('p.faint.small', { style: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, (n.body || '').replace(/[#\-*]/g, '').slice(0, 160)),
          h('div.chips', { style: { marginTop: '8px' } }, (n.tags || []).slice(0, 4).map(t => h('span.chip', '#' + t)), n.project ? h('span.chip.acc', n.project) : null))));
        body.append(g);
      }
      if (tab === 'ideas') {
        const cols = ['아이디어', '검토', '진행', '보류'];
        const xs = notes.filter(n => n.type === 'idea' && pf(n));
        const kan = h('div.kan');
        for (const c of cols) {
          const col = h('div.kcol', h('h4', c, h('span', xs.filter(x => (x.stage || '아이디어') === c).length)));
          col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
          col.ondragleave = () => col.classList.remove('over');
          col.ondrop = async e => { e.preventDefault(); col.classList.remove('over'); await db.patch(e.dataTransfer.getData('text'), { stage: c }); draw(); };
          xs.filter(x => (x.stage || '아이디어') === c).forEach(x => col.append(h('div.kcard', { draggable: true, ondragstart: e => e.dataTransfer.setData('text', x.id), onclick: () => go('plan/' + x.id) }, h('div', { style: { fontWeight: 600 } }, x.title), x.tags?.length ? h('div.chips', { style: { marginTop: '6px' } }, x.tags.slice(0, 3).map(t => h('span.chip', '#' + t))) : null,
            h('div.row', { style: { marginTop: '6px', gap: '4px' } }, cols.filter(cc => cc !== c).map(cc => h('button.btn.sm.ghost', { style: { padding: '2px 6px', fontSize: '11px' }, onclick: async e => { e.stopPropagation(); await db.patch(x.id, { stage: cc }); draw(); } }, '→' + cc))))));
          if (c === '아이디어') col.append(h('button.btn.sm.ghost', { style: { width: '100%' }, onclick: () => modal('새 아이디어', close => form(FIELDS.idea, { project: projF }, async v => { await db.put('notes', { ...v, type: 'idea', stage: '아이디어', tags: brain.keywords(v.title + ' ' + v.body, 4) }); close(); draw(); })) }, ic('plus', 14), '추가'));
          kan.append(col);
        }
        body.append(kan);
      }
      if (tab === 'refs') { tab = 'docs'; go('archive' + (projF ? '/p/' + encodeURIComponent(projF) : '')); return; }
      if (tab === 'projects') {
        const g = h('div.grid.gauto');
        const tasks = await db.list('tasks'); const exps = await db.list('expenses'); const logs = await db.list('timelogs');
        for (const p of projects) {
          const t = tasks.filter(x => x.project === p.name), done = t.filter(x => x.done).length;
          const spend = exps.filter(x => x.project === p.name).reduce((s, x) => s + (Number(x.amount) || 0), 0);
          const m = logs.filter(x => x.project === p.name).reduce((s, x) => s + (x.minutes || 0), 0);
          g.append(h('div.card', h('div.row', h('span.dot', { style: { background: p.color || colorFor(p.name), width: '12px', height: '12px' } }), h('h3.grow', p.name), h('span.chip', p.status || '진행')),
            p.desc ? h('p.faint.small', { style: { marginTop: '4px' } }, p.desc) : null,
            h('div.bar', { style: { margin: '10px 0 6px' } }, h('i', { style: { width: (t.length ? done / t.length * 100 : 0) + '%' } })),
            h('div.row.between.tiny.faint', h('span', `할 일 ${done}/${t.length}`), h('span', `${Math.round(m / 60)}시간`), h('span', `${spend.toLocaleString()}원`)),
            h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: () => { projF = p.name; tab = 'docs'; draw(); } }, '문서'), h('button.btn.sm.ghost', { onclick: () => newProject(p) }, ic('edit', 14)))));
        }
        if (!projects.length) g.append(h('div.card', h('div.empty', '프로젝트를 만들면 할 일·지출·작업 시간이 프로젝트별로 모여요')));
        body.append(g);
      }
    }
    function newProject(p = {}) {
      modal(p.id ? '프로젝트 고치기' : '새 프로젝트', close => form([{ k: 'name', label: '이름' }, { k: 'status', label: '상태', type: 'select', options: ['진행', '준비', '보류', '완료'] }, { k: 'color', label: '색', type: 'color', default: '#4b5bff' }, { k: 'desc', label: '설명', type: 'textarea', rows: 2 }], p, async v => { await db.put('projects', { ...p, ...v }); close(); tab = 'projects'; draw(); }));
    }
    function newDoc() {
      modal('새 문서', close => h('div.grid.g2', [['빈 문서', ''], ...Object.entries(TEMPLATES)].map(([name, tpl]) => h('button.card.click', { style: { textAlign: 'left', font: 'inherit', color: 'inherit' }, onclick: async () => { const n = await db.put('notes', { type: 'doc', template: name === '빈 문서' ? '' : name, title: name === '빈 문서' ? '' : name, body: tpl, project: projF, tags: [] }); close(); go('plan/' + n.id); } }, h('h3', name), h('p.faint.tiny', tpl.split('\n').filter(l => l.startsWith('#')).slice(0, 3).map(l => l.replace(/#+\s*/, '')).join(' · ') || '자유롭게')))), { wide: true });
    }
  },
};

async function refsView(refs, redraw) {
  const wrap = h('div');
  wrap.append(h('div.row', { style: { marginBottom: '12px' } },
    dropzone(h('span', ic('image'), ' 이미지 끌어놓기 · 눌러서 고르기 · 붙여넣기(Ctrl+V)'), 'image/*', async files => { for (const f of files) await addImg(f); redraw(); }),
    h('button.btn', { onclick: () => modal('링크 레퍼런스', close => form(FIELDS.reference, { project: projF }, async v => { await db.put('refs', { ...v, tags: brain.keywords(v.title + ' ' + v.memo, 4) }); close(); redraw(); })) }, ic('link', 14), '링크 추가')));
  wrap.firstChild.firstChild.style.flex = '1';
  const onPaste = async e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/')); if (f.length) { for (const x of f) await addImg(x); redraw(); } };
  document.addEventListener('paste', onPaste, { once: true });
  async function addImg(f) { const key = await db.putBlob(f); await db.put('refs', { title: f.name.replace(/\.\w+$/, ''), imgKey: key, project: projF, tags: [] }); }
  const g = h('div', { style: { columns: '220px', columnGap: '12px' } });
  if (!refs.length) wrap.append(h('div.card', h('div.empty', '레퍼런스를 모아 두면 기획 문서에서 비슷한 걸 추천해 드려요')));
  for (const r of refs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const blob = r.imgKey ? await db.getBlob(r.imgKey) : null;
    g.append(h('div.card', { style: { breakInside: 'avoid', marginBottom: '12px', padding: '8px' } },
      blob ? h('img', { src: URL.createObjectURL(blob), style: { width: '100%', borderRadius: '8px', display: 'block' }, loading: 'lazy' }) : null,
      h('div', { style: { padding: '6px 4px 2px' } }, h('div.small', { style: { fontWeight: 650 } }, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title || r.url) : r.title),
        r.memo ? h('p.faint.tiny', r.memo) : null,
        h('div.row.between', { style: { marginTop: '4px' } }, h('div.chips', (r.tags || []).slice(0, 3).map(t => h('span.chip', '#' + t)), r.project ? h('span.chip.acc', r.project) : null),
          h('div.row', { style: { gap: '2px' } }, h('button.btn.sm.ghost', { 'aria-label': '고치기', onclick: () => modal('레퍼런스 고치기', close => form([...FIELDS.reference, { k: 'tagsS', label: '태그 (쉼표로)', full: true }], { ...r, tagsS: (r.tags || []).join(', ') }, async v => { const { tagsS, ...rest } = v; await db.put('refs', { ...r, ...rest, tags: tagsS.split(/[,，]/).map(s => s.trim()).filter(Boolean) }); close(); redraw(); })) }, ic('edit', 13)), h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('지울까요?', '지우기')) { await db.remove(r.id); redraw(); } } }, ic('trash', 13)))))));
  }
  wrap.append(g);
  return wrap;
}

async function editor(root, id) {
  const n = await db.get(id);
  if (!n || n.deleted) { root.append(h('div.empty', '문서를 찾을 수 없어요')); return; }
  const title = h('input.in', { value: n.title || '', placeholder: '제목', style: { fontSize: '22px', fontWeight: 700, border: 0, padding: '4px 0', background: 'transparent' } });
  const ta = h('textarea.in', { rows: 22, style: { minHeight: '50vh', fontSize: '15px', lineHeight: 1.7 } }, n.body || '');
  const status = h('span.faint.tiny', '저장됨');
  const proj = h('input.in', { value: n.project || '', placeholder: '프로젝트', style: { width: '140px', padding: '5px 10px', fontSize: '13px' } });
  const side = h('div.stack');
  const save = debounce(async () => { await db.patch(id, { title: title.value, body: ta.value, project: proj.value }); status.textContent = '저장됨'; drawSide(); }, 700);
  [title, ta, proj].forEach(x => x.addEventListener('input', () => { status.textContent = '저장 중…'; save(); }));
  root.append(
    h('div.row.between', { style: { marginBottom: '8px' } }, h('a.btn.sm.ghost', { href: '#/plan' }, ic('left', 14), '기획 보드'),
      h('div.row', status, proj, h('button.btn.sm.ghost', { onclick: () => download((title.value || '문서') + '.md', `# ${title.value}\n\n${ta.value}`, 'text/markdown') }, ic('download', 14)),
        h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('이 문서를 지울까요?', '지우기')) { await db.remove(id); go('plan'); } } }, ic('trash', 14)))),
    h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }, class: 'editor-grid' }, h('div.card', title, ta), side));
  drawSide();

  async function drawSide() {
    const text = title.value + '\n' + ta.value;
    clear(side);
    if (text.trim().length < 10) { side.append(h('div.card.flat', h('p.faint.small', '쓰기 시작하면 키워드·요약·레퍼런스 추천이 여기 떠요. 모두 제안일 뿐이라 누르기 전엔 바뀌지 않아요.'))); return; }
    const kws = brain.keywords(text, 8);
    const cur = new Set(n.tags || []);
    side.append(h('div.card', h('div.card-h', h('h3', ic('hash'), '키워드 제안')),
      h('div.chips', kws.map(k => h('button.chip' + (cur.has(k) ? '.acc' : ''), { onclick: async e => { cur.has(k) ? cur.delete(k) : cur.add(k); n.tags = [...cur]; await db.patch(id, { tags: n.tags }); e.target.classList.toggle('acc'); } }, '#' + k))),
      h('p.faint.tiny', { style: { marginTop: '6px' } }, '눌러서 태그로 확정')));
    if (sentCount(text) >= 4) {
      const sum = brain.summarize(text, 3);
      side.append(h('div.card', h('div.card-h', h('h3', ic('sparkles'), '요약 미리보기'), h('span.chip.warn', '임시')), h('ul', { style: { margin: 0, paddingLeft: '18px' } }, sum.map(s => h('li.small', s))),
        h('button.btn.sm', { style: { marginTop: '8px' }, onclick: async () => { ta.value = `> 요약\n${sum.map(s => '> - ' + s).join('\n')}\n\n` + ta.value; save(); } }, '문서 맨 위에 넣기')));
      const a = brain.analyzeNotes(text);
      if (a.actions.length) side.append(h('div.card', h('div.card-h', h('h3', ic('check2'), '할 일 후보'), h('span.chip', a.actions.length)), a.actions.slice(0, 5).map(t => h('div.li', h('div.grow.small', t.title), h('button.btn.sm', { onclick: async e => { await store.draft('task', { title: t.title, due: t.due || '', who: t.who, project: proj.value, priority: 'normal' }, { source: t.src, sourceRef: id, origin: 'doc' }); e.target.disabled = true; e.target.textContent = '대기함'; } }, '+')))));
    }
    const refs = await db.list('refs'); const notes = (await db.list('notes')).filter(x => x.id !== id);
    const r = brain.recommendRefs(text, [...refs.map(x => ({ id: x.id, title: x.title, text: `${x.title} ${x.memo || ''} ${(x.tags || []).join(' ')}`, route: 'plan', url: x.url })), ...notes.map(x => ({ id: x.id, title: x.title, text: `${x.title} ${x.body || ''}`, route: 'plan/' + x.id }))]);
    side.append(h('div.card', h('div.card-h', h('h3', ic('star'), '레퍼런스 추천')),
      r.mine.length ? h('div', h('div.tiny.faint', { style: { fontWeight: 650 } }, '내 기록 중 비슷한 것'), r.mine.map(m => h('div.li.click', { onclick: () => m.url ? window.open(m.url, '_blank') : go(m.route) }, ic('file', 14), h('div.small.grow', m.title || '(제목 없음)')))) : null,
      h('div.tiny.faint', { style: { fontWeight: 650, marginTop: '8px' } }, '찾아볼 곳'),
      r.links.map(l => h('a.li.click', { href: l.url, target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } }, ic('globe', 14), h('div.grow', h('div.small', l.site), h('div.faint.tiny', l.q)))),
      r.moods.length || r.styleTags.length ? h('div.chips', { style: { marginTop: '8px' } }, [...r.styleTags, ...r.moods].map(t => h('span.chip', t))) : null,
      h('div.tiny.faint', { style: { fontWeight: 650, marginTop: '10px' } }, '체크리스트'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, r.checklist.map(c => h('li.tiny', c)))));
  }
}
const sentCount = t => brain.sentences(t).length;
