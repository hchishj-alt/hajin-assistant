// 피그마: 실시간 연동 (토큰) + 자동 정리 화면 + 가이드라인 + 역방향(댓글)
import { h, ic, clear, toast, head, modal, form, fmtDate, rel, confirmBox, tile, ring, seg, busy, todayStr } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as F from '../js/figma-api.js';
import { go } from '../js/app.js';

let tab = 'board';
const TONE = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--acc)' };

export default {
  async render(root, params) {
    if (params[0]) return detail(root, params[0]);
    const token = await F.getToken();
    const files = (await db.list('figmafiles')).sort((a, b) => (b.snap?.lastModified || '').localeCompare(a.snap?.lastModified || ''));
    const todoN = files.reduce((s, f) => s + (f.snap?.todo?.length || 0), 0);
    const openC = files.reduce((s, f) => s + (f.comments || []).filter(c => !c.resolved && !c.parent).length, 0);
    const avg = files.length ? Math.round(files.reduce((s, f) => s + (f.snap?.score || 0), 0) / files.length) : 0;
    root.append(head('피그마', token ? '인터넷만 되면 1분마다 바뀐 것만 확인해서 자동으로 정리해 보여줘요.' : '토큰 하나만 넣으면 피그마 파일이 실시간으로 정리돼서 보여요.',
      h('button.btn.sm.ghost', { title: '가이드라인', onclick: guide }, ic('book', 14), '?'),
      h('a.btn.sm', { href: 'figma-plugin.zip', download: 'hajin-tidy-figma-plugin.zip' }, ic('download', 14), '플러그인'),
      h('button.btn.sm.pri', { onclick: addFile }, ic('plus', 14), '파일 연결')),
      h('div.tiles', { style: { marginBottom: '14px' } }, tile('layers', files.length, '연결된 파일'), tile('target', files.length ? avg : '–', '평균 정리 점수', avg >= 80 ? 'ok' : avg >= 50 ? 'warn' : files.length ? 'bad' : ''), tile('flag', todoN, '피그마에서 할 일', todoN ? 'warn' : 'ok'), tile('msg', openC, '열린 댓글')));
    if (!token) root.append(tokenCard());
    if (!files.length) { root.append(h('div.card', h('div.empty', '“파일 연결”에 피그마 링크를 붙여넣으면 바로 분석해요. 파일은 몇 개든 추가할 수 있어요.'))); return; }
    const g = h('div.grid.g2');
    for (const f of files) {
      const s = f.snap || {}; const last = (f.versions || [])[0];
      const st = statusCount(f);
      g.append(h('div.card.click', { onclick: () => go('figma/' + f.id), style: { cursor: 'pointer' } },
        h('div.card-h', h('h3', ic('layers'), f.name || f.key), ring((s.score || 0) / 100, { size: 46, label: String(s.score ?? '–'), color: s.score >= 80 ? 'var(--ok)' : s.score >= 50 ? 'var(--warn)' : 'var(--bad)' })),
        h('div.chips', h('span.chip', `페이지 ${s.pages?.length || 0}`), h('span.chip', `섹션 ${s.totals?.sections || 0}`), h('span.chip', `프레임 ${s.totals?.frames || 0}`), s.totals?.loose ? h('span.chip.warn', `흩어짐 ${s.totals.loose}`) : null, f.team ? h('span.chip.ok', '팀 공유') : null),
        statusBar(st),
        h('div.faint.tiny', { style: { marginTop: '6px' } }, last ? `${rel(last.at.slice(0, 10))} ${new Date(last.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · ${last.who} 수정` : s.lastModified ? `마지막 수정 ${fmtDate(s.lastModified, { time: true })}` : '아직 못 읽음', s.todo?.length ? ` · 할 일 ${s.todo.length}` : '')));
    }
    root.append(g);
    if (token) F.watch(f => toast(`피그마 "${f.name}"이 바뀌어서 다시 정리했어요`, { label: '보기', fn: () => go('figma/' + f.id) }));
  },
};

function tokenCard() {
  const inp = h('input.in', { type: 'password', placeholder: 'figd_… 개인 토큰', autocomplete: 'off' });
  return h('div.card', { style: { marginBottom: '14px', borderColor: 'var(--acc)' } }, h('div.card-h', h('h3', ic('zap'), '피그마 토큰 넣기 (한 번만, 무료)')),
    h('ol', { style: { margin: '0 0 10px', paddingLeft: '20px', lineHeight: 1.9 } },
      h('li.small', 'figma.com 로그인 → 왼쪽 위 이름 → ', h('b', 'Settings'), ' → ', h('b', 'Security')),
      h('li.small', h('b', 'Personal access tokens'), ' → Generate new token'),
      h('li.small', '권한: File content 읽기, File versions 읽기, Comments 읽기·쓰기, 만료는 가장 길게'),
      h('li.small', '만든 토큰을 아래에 붙여넣기')),
    h('div.row', inp, h('button.btn.sm.pri', { onclick: async e => { const btn = e.currentTarget; busy(btn, true, '확인 중'); try { await F.setToken(inp.value); const me = await F.me(); toast(`${me.handle} 님 피그마에 연결했어요`); go('figma'); } catch (err) { await F.setToken(''); toast(err.message === 'Failed to fetch' ? '인터넷 연결을 확인해 주세요' : err.message); } busy(btn, false); } }, '연결')),
    h('p.faint.tiny', { style: { marginTop: '6px' } }, '토큰은 이 기기에만 저장되고 백업·동기화·팀 공유 안 돼요. 팀원은 각자 자기 토큰을 넣거나, 넣지 않아도 관리자가 읽은 분석 결과는 팀 공유로 봐요.'));
}

async function addFile() {
  if (!(await F.getToken())) { toast('먼저 피그마 토큰을 넣어 주세요'); return; }
  modal('피그마 파일 연결', close => form([{ k: 'url', label: '파일 링크 (figma.com/design/…)', full: true }, { k: 'share', label: '공유', type: 'select', options: [['', '나만 보기 (개인 파일)'], ['1', '팀에 공유']] }], {}, async v => {
    const btn = document.querySelector('.modal button[type=submit]'); busy(btn, true, '분석 중');
    try { const f = await F.addFile(v.url, !!v.share); toast(`"${f.name}" 연결 · 정리 점수 ${f.snap.score}`); close(); go('figma/' + f.id); }
    catch (e) { toast(e.message === 'Failed to fetch' ? '인터넷 연결을 확인해 주세요' : e.message); busy(btn, false); }
  }, { submitLabel: '연결' }));
}

function statusCount(f) {
  const c = { done: 0, review: 0, wip: 0, hold: 0, none: 0 };
  for (const p of f.snap?.pages || []) if (!p.archive) for (const g of Object.values(p.groups)) for (const n of g) c[n.status]++;
  return c;
}
function statusBar(c) {
  const tot = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  return h('div', h('div', { style: { display: 'flex', height: '8px', borderRadius: '99px', overflow: 'hidden', background: 'var(--bg2)', marginTop: '10px' } }, F.STATUS.map(s => h('div', { title: `${s.label} ${c[s.k]}`, style: { width: (c[s.k] / tot * 100) + '%', background: s.color, transition: 'width .6s var(--spring)' } }))),
    h('div.row.tiny.faint', { style: { marginTop: '4px', gap: '10px' } }, F.STATUS.map(s => `${s.emoji} ${c[s.k]}`), `표시 없음 ${c.none}`));
}

async function detail(root, id) {
  let f = await db.get(id);
  if (!f) { root.append(h('div.empty', '파일을 찾을 수 없어요')); return; }
  const token = await F.getToken();
  const s = f.snap || { pages: [], todo: [], totals: {} };
  const body = h('div');
  root.append(h('div.row', { style: { marginBottom: '6px' } }, h('a.btn.sm.ghost', { href: '#/figma' }, ic('left', 14), '피그마')),
    head(f.name || f.key, `점수 ${s.score ?? '–'} · ${s.checkedAt ? '확인 ' + new Date(s.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}${token ? ' · 1분마다 자동 확인' : ' · 토큰 없음 (팀 공유본)'}`,
      h('button.btn.sm.ghost', { onclick: guide }, ic('book', 14), '?'),
      h('a.btn.sm', { href: F.fileLink(f.key), target: '_blank', rel: 'noopener' }, '피그마에서 열기'),
      (await db.get('team-main')) ? h('button.btn.sm' + (f.team ? '.pri' : ''), { title: '팀원도 이 파일의 정리 화면을 봐요', onclick: async () => { await db.patch(id, { team: f.team ? '' : 'team-main' }); toast(f.team ? '나만 보기로 바꿨어요' : '팀에 공유했어요'); go('figma/' + id); } }, ic('users', 14), f.team ? '팀 공유 중' : '나만 보기') : null,
      token ? h('button.btn.sm', { onclick: async e => { const btn = e.currentTarget; busy(btn, true, '읽는 중'); try { await F.refresh(f, { force: true }); go('figma/' + id); } catch (err) { toast(err.message); busy(btn, false); } } }, ic('refresh', 14), '지금') : null,
      h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('이 파일 연결을 뺄까요? 피그마 파일은 그대로예요.', '빼기')) { await db.remove(id); go('figma'); } } }, ic('trash', 14))),
    h('div.tiles', { style: { marginBottom: '12px' } }, tile('target', s.score ?? '–', '정리 점수', s.score >= 80 ? 'ok' : s.score >= 50 ? 'warn' : 'bad'), tile('grid', (s.totals.sections || 0), '섹션'), tile('layers', s.totals.frames || 0, '맨 위 프레임'), tile('flag', s.todo.length, '할 일', s.todo.length ? 'warn' : 'ok'), tile('msg', (f.comments || []).filter(c => !c.resolved && !c.parent).length, '열린 댓글')),
    h('div', { style: { marginBottom: '12px' } }, seg([['board', '정리 보기'], ['todo', '피그마에서 할 일'], ['activity', '활동'], ['progress', '진행']], tab, v => { tab = v; draw(); })), body);
  draw();

  function draw() {
    clear(body);
    if (tab === 'board') return body.append(board());
    if (tab === 'todo') return body.append(todoView());
    if (tab === 'activity') return body.append(activity());
    body.append(progress());
  }
  function board() {
    const wrap = h('div.stack');
    for (const p of s.pages) {
      const cats = Object.entries(p.groups);
      const card = h('div.card', h('div.card-h', h('h3', ic(p.archive ? 'inbox' : 'file'), p.name, p.archive ? h('span.chip', '보관') : null), h('div.chips', h('span.chip', `섹션 ${p.sections}`), h('span.chip', `프레임 ${p.frames}`), p.loose ? h('span.chip.warn', { title: `이미지 ${p.looseImages} · 텍스트 ${p.looseTexts}` }, `흩어짐 ${p.loose}`) : h('span.chip.ok', '깔끔'))));
      if (!cats.length) card.append(h('p.faint.small', '섹션·프레임이 없어요'));
      const order = [...F.CATS.map(c => c.k), 'etc', 'archive'];
      cats.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
      for (const [ck, ns] of cats) {
        const cat = F.CATS.find(c => c.k === ck) || { label: ck === 'archive' ? '보관 자료' : '기타', icon: 'more' };
        card.append(h('div.small', { style: { fontWeight: 700, margin: '10px 0 6px', display: 'flex', alignItems: 'center', gap: '6px' } }, ic(cat.icon, 14), cat.label, h('span.faint.tiny', ns.length)),
          (() => { const box = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '8px' } }, ns.slice(0, 12).map(n => nodeChip(n))); if (ns.length > 12) box.append(h('button.btn.sm.ghost', { onclick: e => { e.currentTarget.remove(); ns.slice(12).forEach(n => box.append(nodeChip(n))); } }, `${ns.length - 12}개 더 보기`)); return box; })());
      }
      wrap.append(card);
    }
    return wrap;
  }
  function nodeChip(n) {
    const st = F.STATUS.find(x => x.k === n.status);
    const tasks = h('span.faint.tiny');
    const el = h('div.tile', { style: { padding: '10px', cursor: 'pointer', borderLeft: `3px solid ${st ? st.color : 'var(--line)'}` }, onclick: () => nodeMenu(n) },
      h('div.small', { style: { fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: n.name }, n.name),
      h('div.faint.tiny', [n.type === 'SECTION' ? '섹션' : '프레임', `${n.kids}개`, n.w ? `${n.w}×${n.h}` : '', n.defaultName ? '기본 이름' : ''].filter(Boolean).join(' · ')), tasks);
    db.list('tasks').then(ts => { const k = ts.filter(t => t.figma?.key === f.key && t.figma.node === n.id && !t.done).length; if (k) tasks.textContent = `할 일 ${k}`; });
    return el;
  }
  function nodeMenu(n) {
    modal(n.name, close => {
      const who = h('input.in', { placeholder: '담당 (예: 민서)' });
      const title = h('input.in', { placeholder: '무엇을 할까요? (예: 버튼 눌림 상태 추가)' });
      const due = h('input.in', { type: 'date' });
      return h('div',
        h('div.row', { style: { marginBottom: '10px' } }, h('a.btn.sm', { href: F.nodeLink(f.key, n.id), target: '_blank', rel: 'noopener' }, '피그마에서 이 위치 열기'), h('span.chip', F.STATUS.find(x => x.k === n.status)?.label || '상태 표시 없음')),
        h('div.small', { style: { fontWeight: 650, margin: '6px 0' } }, '여기에 할 일 남기기'),
        h('div.stack', title, h('div.grid.g2', who, due)),
        h('p.faint.tiny', { style: { marginTop: '6px' } }, token ? '앱 할 일로 저장되고, 피그마 이 위치에 댓글 핀이 꽂혀요. 완료하면 피그마 댓글에 ✅ 답장이 달려요.' : '토큰이 없어서 앱 할 일로만 저장돼요.'),
        h('div.modal-f', h('button.btn', { onclick: close }, '취소'), h('button.btn.pri', { onclick: async e => {
          if (!title.value.trim()) { toast('할 일을 적어 주세요'); return; }
          const btn = e.currentTarget; busy(btn, true);
          const task = { title: title.value.trim(), who: who.value.trim(), due: due.value, project: f.name, figma: { key: f.key, node: n.id }, memo: `피그마 ${f.name} › ${n.name}` };
          if (token) { try { task.figma.comment = await F.postTask(f, n, task); } catch (err) { toast('피그마 댓글은 못 남겼어요: ' + err.message); } }
          await store.commit('task', task);
          toast(task.figma.comment ? '할 일 저장 + 피그마에 댓글 핀' : '할 일로 저장했어요'); close(); draw();
        } }, '남기기')));
    });
  }
  function todoView() {
    const card = h('div.card');
    if (!s.todo.length) card.append(h('div.empty', '정리할 게 없어요. 깔끔해요!'));
    s.todo.forEach((t, i) => card.append(h('div.li', { style: { alignItems: 'flex-start' } }, h('span.dot', { style: { background: TONE[t.level] || 'var(--acc)', marginTop: '7px' } }),
      h('div.grow', h('div.t.small', t.text), h('div.faint.tiny', '방법: ' + t.how)),
      h('button.btn.sm', { title: '할 일로', onclick: async () => { await store.commit('task', { title: `[피그마] ${t.text}`, project: f.name, memo: t.how, figma: { key: f.key } }); toast('할 일에 넣었어요'); } }, ic('plus', 12), '할 일'))));
    return h('div.stack', card, h('div.card.flat', h('p.small.muted', '플러그인 버튼 이름 그대로 적었어요. 피그마에서 "하진 정리" 플러그인을 열고 해당 버튼을 누르면 돼요. 끝나면 1분 안에 점수가 다시 계산돼요.')));
  }
  function activity() {
    const vs = (f.versions || []).slice(0, 20), cs = (f.comments || []).filter(c => !c.parent).slice(0, 30);
    return h('div.grid.g2',
      h('div.card', h('div.card-h', h('h3', ic('clock'), '최근 수정')), vs.length ? h('div.timeline', vs.map(v => h('div.tl-i', h('div.small.mono.faint', `${v.at.slice(5, 10).replace('-', '/')} ${new Date(v.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`), h('div.t', v.who + (v.label ? ' · ' + v.label : ''), v.desc ? h('div.faint.tiny', v.desc) : null)))) : h('p.faint.small', '기록 없음')),
      h('div.card', h('div.card-h', h('h3', ic('msg'), '댓글'), h('span.faint.tiny', '새 댓글은 확인 대기함으로 와요')), cs.length ? h('div.list', cs.map(c => h('div.li' + (c.resolved ? '.done' : ''), h('div.grow', h('div.small', c.msg), h('div.faint.tiny', [c.who, rel(c.at.slice(0, 10)), F.findNode(f, c.node)].filter(Boolean).join(' · '))), c.node ? h('a.btn.sm.ghost', { href: F.nodeLink(f.key, c.node), target: '_blank', rel: 'noopener' }, '열기') : null))) : h('p.faint.small', '댓글 없음')));
  }
  function progress() {
    const c = statusCount(f);
    const hs = f.history || [];
    const W = 520, H = 120, max = 100;
    const pts = hs.map((x, i) => `${hs.length > 1 ? i / (hs.length - 1) * W : W / 2},${H - x.score / max * H}`).join(' ');
    return h('div.grid.g2',
      h('div.card', h('div.card-h', h('h3', ic('flag'), '상태 (섹션·프레임 이름 앞 표시)')), statusBar(c), h('p.faint.tiny', { style: { marginTop: '8px' } }, '피그마에서 플러그인 "상태 표시"로 붙이면 여기 진행률이 바뀌어요.')),
      h('div.card', h('div.card-h', h('h3', ic('trend'), '정리 점수 변화')), hs.length ? h('div', { html: `<svg viewBox="0 -6 ${W} ${H + 12}" width="100%" height="${H + 12}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>` }) : h('p.faint.small', '기록이 쌓이면 보여요'),
        h('div.faint.tiny', hs.length ? `${hs[0].score} → ${hs[hs.length - 1].score} (${hs.length}번 기록)` : '')));
  }
}

function guide() {
  modal('피그마 가이드라인', close => {
    const paste = h('textarea.in', { rows: 3, placeholder: '(토큰 없이 쓸 때) 플러그인 "요약 만들기" 결과 붙여넣기' });
    return h('div',
      h('p.small.muted', '이 규칙만 지키면 앱이 파일을 자동으로 분류하고, 진행률·할 일·담당을 한눈에 보여줘요.'),
      h('div.list', { style: { margin: '10px 0' } }, F.GUIDE.map(([t, d], i) => h('div.li', { style: { alignItems: 'flex-start' } }, h('span.chip.acc', String(i + 1)), h('div.grow', h('div.t.small', t), h('div.faint.small', d))))),
      h('div.small', { style: { fontWeight: 650, margin: '12px 0 6px' } }, '앱이 알아듣는 분류 (이름에 이 말이 있으면)'),
      h('div.list', F.CATS.map(c => h('div.li', ic(c.icon, 14), h('b.small', { style: { width: '120px' } }, c.label), h('span.faint.tiny', c.re.source.replace(/\(\^\|_\)SEC_\\d/, 'SEC_번호').replace(/\\/g, '').split('|').slice(0, 9).join(', '))))),
      h('details', { style: { marginTop: '12px' } }, h('summary.small', '토큰 없이 플러그인 요약으로 넣기'), paste, h('button.btn.sm', { style: { marginTop: '6px' }, onclick: async () => {
        let j; try { j = JSON.parse(paste.value.trim()); } catch { toast('요약 형식이 아니에요'); return; }
        if (j.app !== 'hajin-figma') { toast('하진 정리 플러그인 요약이 아니에요'); return; }
        const pages = j.pages.map(p => ({ id: p.name, name: p.name, archive: /옛날|old|archive|보관/i.test(p.name), top: p.frames, sections: 0, frames: p.frames, loose: 0, defaultNamed: 0, groups: { etc: (p.topFrames || []).map((n, i) => ({ id: p.name + i, name: n, type: 'FRAME', status: F.statusOf(n), kids: 0 })) } }));
        const ex = (await db.list('figmafiles')).find(x => x.key === j.fileKey || x.name === j.file);
        await db.put('figmafiles', { ...(ex || {}), key: j.fileKey || ex?.key || '', name: j.file, team: ex?.team ?? ((await db.get('team-main')) ? 'team-main' : ''), snap: { name: j.file, pages, todo: [], totals: { sections: 0, frames: pages.reduce((s, p) => s + p.frames, 0) }, score: null, checkedAt: j.at } });
        toast('넣었어요'); close(); go('figma');
      } }, '넣기')),
      h('div.modal-f', h('button.btn.pri', { onclick: close }, '알겠어요')));
  }, { wide: true });
}
