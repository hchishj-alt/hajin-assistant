// 하진 매니저: 인스타·틱톡 계정을 같이 키우는 매니저 앱 (비서 앱과 따로 설치되는 PWA)
import * as S from './store.js';
import * as A from './analyze.js';
import * as AI from './ai.js';
import * as IG from './ig.js';
import { readFiles } from './importers.js';
import { inspect, imgB64 } from './video.js';
import { seed } from './demo.js';
import { h, ic, icon, toast, sheet, busy, seg, field, copy, spark } from './ui.js';
export const VERSION = '1.0.0';

const view = document.getElementById('view');
const TABS = [['today', '오늘', 'home'], ['stats', '분석', 'chart'], ['coach', '코치', 'sparkles'], ['people', '사람', 'users'], ['deals', '협찬', 'briefcase']];
const $plat = { get: () => localStorage.getItem('mgr:plat') || 'ig', set: v => localStorage.setItem('mgr:plat', v) };

async function state() {
  const D = { profile: {}, posts: [], snaps: [], people: {}, handled: {}, deals: [], drafts: [], about: {}, ads: [] };
  const v = Object.fromEntries(await Promise.all(Object.entries(D).map(async ([k, d]) => [k, (await S.get(k, d)) || d])));
  v.about = { ig: v.profile.ig?.username, tt: v.profile.tt?.username, ...v.about };
  return v;
}
const snapshotText = (st, An) => ['ig', 'tt'].map(p => { const a = An.plats[p]; if (!a.n && !st.profile[p]) return ''; return `${A.PLAT[p]}: 팔로워 ${a.growth.now ?? '?'}(7일 ${a.growth.d7 ?? '?'}), 게시물 ${a.n}개 중 숫자 있는 것 ${a.measured}개, 반응률 중앙값 ${A.pct(a.er)}, 저장률 ${A.pct(a.save)}, 공유율 ${A.pct(a.share)}, 영상 완주 ${A.pct(a.keep)}, 마지막 업로드 ${a.last == null ? '?' : Math.floor(a.last) + '일 전'}, 주당 ${a.perWeek.toFixed(1)}개, 잘 되는 시간 ${a.hours[0] ? A.slotName(a.hours[0].h) : '?'}, 잘 되는 형식 ${a.kinds[0] ? A.KIND[a.kinds[0].k] : '?'}, 최고 게시물 "${(a.top[0]?.p.caption || '').slice(0, 30)}"`; }).filter(Boolean).join('\n') + `\n협찬 진행 ${st.deals.filter(d => !['정산', '거절'].includes(d.status)).length}건`;

// ── 라우터 ──
let cleanup = null;
async function route() {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  if (cleanup) { try { cleanup(); } catch { } cleanup = null; }
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.t === name));
  view.classList.remove('in'); void view.offsetWidth;
  const st = await state(); const An = A.analyze(st);
  view.replaceChildren();
  const fn = SCREENS[name] || SCREENS.today;
  try { cleanup = await fn(view, st, An, rest); } catch (e) { console.error(e); view.append(h('div.card', '화면을 그리다 문제가 생겼어요: ' + e.message)); }
  view.classList.add('in'); window.scrollTo(0, 0);
}
const head = (title, sub, right) => h('header.top', h('div', h('h1', title), sub ? h('p.sub', sub) : null), h('div.topr', right));
const demoBadge = () => S.getMode() === 'demo' ? h('button.demo', { onclick: () => go('#/settings') }, ic('flag', 14), '연습 모드 · 봄이') : null;
const go = hsh => { location.hash = hsh; };
const tile = (icn, label, val, sub, cls = '') => h('div.tile' + (cls ? '.' + cls : ''), h('div.tl', ic(icn, 15), label), h('div.tv', val), sub ? h('div.ts', sub) : null);
const platSeg = (cur, on) => seg([['ig', '인스타', 'ig'], ['tt', '틱톡', 'tt']], cur, on);
const empty = (icn, title, body, btn) => h('div.empty', ic(icn, 28), h('b', title), h('p', body), btn);

const SCREENS = {};

// ── 오늘 ──
SCREENS.today = async (root, st, An) => {
  const cards = A.brief(st, An);
  const hello = h('p.hello', greet(st));
  const line = h('div.mline', h('div.ava', ic('sparkles', 18)), h('div.mtext', hello));
  root.append(head('매니저', null, [demoBadge(), h('button.iconbtn', { 'aria-label': '숫자 채우기', onclick: () => go('#/data'), html: icon('upload', 20) }), h('button.iconbtn', { 'aria-label': '설정', onclick: () => go('#/settings'), html: icon('gear', 20) })]), line);
  // 매니저 한마디 (AI, 하루 한 번 저장)
  (async () => {
    const day = A.today(), cache = await S.get('dailyline', null);
    if (cache?.day === day && cache.text) { hello.textContent = cache.text; return; }
    if (!(await AI.hasKey()) || !cards.length) return;
    try { const t = await AI.dailyLine({ about: st.about, snapshot: snapshotText(st, An), cards }); if (t) { hello.textContent = t; await S.set('dailyline', { day, text: t }); } } catch { }
  })();
  // 숫자 타일
  const tiles = h('div.tiles');
  for (const p of ['ig', 'tt']) {
    const a = An.plats[p], pr = st.profile[p]; if (!pr?.username && !a.n) continue;
    const d7 = a.growth.d7;
    tiles.append(h('button.tile.big', { onclick: () => { $plat.set(p); go('#/stats'); } }, h('div.tl', ic(p, 15), (pr?.username ? '@' + pr.username : A.PLAT[p])), h('div.tv', A.fmt(a.growth.now ?? pr?.followers)), h('div.ts', h('span' + (d7 > 0 ? '.up' : d7 < 0 ? '.down' : ''), d7 == null ? '팔로워' : `7일 ${d7 >= 0 ? '+' : ''}${d7}`), ' · 반응률 ' + A.pct(a.er))));
  }
  if (tiles.children.length) root.append(tiles);
  // 할 일 카드
  const LV = { now: ['지금', 'now'], today: ['오늘', 'today'], tip: ['참고', 'tip'] };
  const list = h('div.cards');
  cards.forEach((c, i) => list.append(h('div.card.bc.' + c.lvl, { style: { animationDelay: i * 40 + 'ms' } },
    h('div.bci', ic(c.icon, 18)),
    h('div.bcm', h('div.bct', h('span.lv.' + LV[c.lvl][1], LV[c.lvl][0]), c.title), h('p', c.body), c.go ? h('button.link', { onclick: () => go(c.go) }, c.btn || '열기', ic('right', 14)) : null),
    c.num ? h('div.bcn', c.num) : null)));
  if (!cards.length) list.append(empty('check', '오늘은 급한 게 없어요', '올릴 거 하나 정해 볼까요?', h('button.btn', { onclick: () => go('#/coach') }, '코치 열기')));
  root.append(h('h2.sec', '오늘 챙길 것 ', h('small', cards.length + '')), list);
  // 매니저에게 묻기
  const q = h('input.ask', { placeholder: '매니저에게 물어보기 (예: 이번 주 뭐 올려?)', enterkeyhint: 'send' });
  const send = () => { const t = q.value.trim(); if (!t) return; q.value = ''; openChat(st, An, t); };
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) send(); });
  root.append(h('div.askbar', ic('msg', 18), q, h('button.iconbtn.acc', { 'aria-label': '보내기', onclick: send, html: icon('send', 18) })));
  root.append(h('button.ghost.wide', { onclick: () => openChat(st, An) }, ic('msg', 16), '지난 대화 보기'));
};
function greet(st) { const hr = new Date().getHours(); const n = st.about.name || '하진'; return hr < 6 ? `${n}님, 늦었어요. 오늘 할 건 내일 아침에 다시 정리해 둘게요.` : hr < 12 ? `${n}님 좋은 아침이에요. 오늘 챙길 걸 골라 놨어요.` : hr < 18 ? `${n}님, 오후 체크할게요. 아래부터 하나씩요.` : `${n}님, 저녁이에요. 지금이 올리기 좋은 시간대일 수 있어요.`; }

async function openChat(st, An, first) {
  const hist = await S.get('chat', []);
  const box = h('div.chat'); const draw = () => { box.replaceChildren(...hist.slice(-30).map(m => h('div.msg' + (m.me ? '.me' : ''), m.text))); box.scrollTop = 1e9; };
  const inp = h('input.ask', { placeholder: '물어볼 것', enterkeyhint: 'send' });
  const ask = async t => {
    hist.push({ me: true, text: t, at: Date.now() }); draw();
    const wait = h('div.msg.wait', '생각 중…'); box.append(wait); box.scrollTop = 1e9;
    let a;
    if (await AI.hasKey()) { try { a = await AI.talk({ about: st.about, q: t, snapshot: snapshotText(st, An), history: hist }); } catch (e) { a = 'AI가 지금 답을 못 했어요 (' + e.message + '). 숫자로만 보면: ' + ruleAnswer(st, An); } }
    else a = ruleAnswer(st, An) + '\n\n(AI를 연결하면 대화로 더 자세히 답해요. 설정 › AI 연결)';
    wait.remove(); hist.push({ me: false, text: a, at: Date.now() }); await S.set('chat', hist.slice(-80)); draw();
  };
  const send = () => { const t = inp.value.trim(); if (t) { inp.value = ''; ask(t); } };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) send(); });
  sheet('매니저', [box, h('div.askbar.in', inp, h('button.iconbtn.acc', { 'aria-label': '보내기', onclick: send, html: icon('send', 18) }))]);
  draw(); if (first) ask(first);
}
function ruleAnswer(st, An) { const c = A.brief(st, An).slice(0, 3); return c.length ? '지금 가장 중요한 건 ' + c.map((x, i) => `${i + 1}. ${x.title}`).join(' ') : '숫자가 아직 부족해요. 숫자 채우기에서 캡처를 올려 주세요.'; }

// ── 분석 ──
SCREENS.stats = async (root, st, An) => {
  const plat = $plat.get(); const a = An.plats[plat];
  root.append(head('분석', '알고리즘이 보는 숫자로 내 계정 읽기', [demoBadge(), h('button.iconbtn', { 'aria-label': '숫자 채우기', onclick: () => go('#/data'), html: icon('plus', 20) })]), platSeg(plat, v => { $plat.set(v); route(); }));
  if (!a.n) { root.append(empty('chart', `${A.PLAT[plat]} 기록이 없어요`, '캡처를 올리거나 연결하면 여기서 분석해요.', h('button.btn', { onclick: () => go('#/data') }, '숫자 채우기'))); return; }
  root.append(h('div.card', h('div.row.sb', h('b', '팔로워'), h('span.big', A.fmt(a.growth.now))), spark(a.growth.series.map(s => s.followers)), h('div.row.gap', h('span.chip', '7일 ' + (a.growth.d7 == null ? '–' : (a.growth.d7 >= 0 ? '+' : '') + a.growth.d7)), h('span.chip', '30일 ' + (a.growth.d30 == null ? '–' : (a.growth.d30 >= 0 ? '+' : '') + a.growth.d30)), h('span.chip', `주 ${a.perWeek.toFixed(1)}개 업로드`))));
  const sig = plat === 'ig'
    ? [['send', '보내기율', A.pct(a.share), '가장 큰 신호'], ['play', '완주율', A.pct(a.keep), '평균 시청/길이'], ['bookmark', '저장률', A.pct(a.save), '다시 볼 가치'], ['heart', '반응률', A.pct(a.er), '도달 대비'], ['globe', '도달 배수', a.reachX == null ? '–' : a.reachX.toFixed(1) + '배', '1배 넘으면 추천 탐색']]
    : [['play', '완주율', A.pct(a.keep), '가장 큰 신호'], ['send', '공유율', A.pct(a.share), ''], ['heart', '반응률', A.pct(a.er), '조회 대비'], ['bookmark', '저장률', A.pct(a.save), ''], ['msg', '숫자 있는 영상', a.measured + '개', '']];
  if (!a.measured) { root.append(h('div.card.note', ic('chart', 18), h('p', `게시물 ${a.n}개는 있는데 반응 숫자(조회·좋아요 등)가 아직 없어요. 인사이트 캡처를 올리거나 연결하면 알고리즘 신호가 보여요. `, h('button.link', { onclick: () => go('#/data') }, '숫자 채우기')))); }
  else root.append(h('h2.sec', '알고리즘 신호'), h('div.tiles.five', sig.map(s => tile(s[0], s[1], s[2], s[3]))));
  // 시간·요일
  const bars = (rows, label) => rows.length ? h('div.bars', rows.slice(0, 5).map(r => h('div.bar', h('span.bl', label(r)), h('span.bt', h('i', { style: { width: Math.min(100, r.lift * 50) + '%' } })), h('span.bv', (r.lift >= 1 ? '+' : '') + Math.round((r.lift - 1) * 100) + '%')))) : h('p.muted', '같은 시간대에 2개 넘게 올리면 비교돼요.');
  root.append(h('h2.sec', '잘 되는 시간'), h('div.card', bars(a.hours, r => A.slotName(r.h)), h('div.hr'), bars(a.dayRank, r => A.dayName(r.d))));
  // 형식
  if (a.kinds.length) root.append(h('h2.sec', '형식별'), h('div.card', h('div.bars', a.kinds.map(k => h('div.bar', h('span.bl', (A.KIND[k.k] || k.k) + ' ' + k.n), h('span.bt', h('i', { style: { width: Math.min(100, k.er / (a.kinds[0].er || 1) * 100) + '%' } })), h('span.bv', A.pct(k.er)))))));
  // 캡션
  if (a.cap.nShort && a.cap.nLong) root.append(h('div.card.note', ic('type', 18), h('p', `짧은 캡션(60자 미만) 반응률 ${A.pct(a.cap.short)}, 긴 캡션 ${A.pct(a.cap.long)}. ${a.cap.short > a.cap.long * 1.15 ? '짧게 쓸 때 더 잘 돼요.' : a.cap.long > a.cap.short * 1.15 ? '이야기가 있는 긴 캡션이 더 잘 돼요.' : '길이 차이는 크지 않아요.'} 해시태그는 평균 ${a.cap.tagsAvg.toFixed(1)}개${a.cap.tagsAvg > 8 ? ' — 너무 많아요, 3~5개로.' : '.'}`)));
  // 잘된 것 / 아쉬운 것
  const why = (x) => { const s = x.s, r = []; if (s.share != null && a.share && s.share > a.share * 1.5) r.push('보내기가 많음'); if (s.save != null && a.save && s.save > a.save * 1.5) r.push('저장이 많음'); if (s.keep != null && a.keep && s.keep > a.keep * 1.2) r.push('끝까지 봄'); if (s.keep != null && a.keep && s.keep < a.keep * 0.8) r.push('초반 이탈'); if (s.reachX != null && s.reachX > 1.2) r.push('팔로워 밖까지 닿음'); return r.join(' · ') || A.slotName(Math.floor(A.kHour(x.p.at) / 3) * 3) + ' 업로드'; };
  const prow = x => h('button.prow', { onclick: () => editPost(x.p) }, h('span.pk', A.KIND[x.p.kind] || x.p.kind), h('span.pc', (x.p.caption || '(캡션 없음)').split('\n')[0]), h('span.pw', why(x)), h('span.pe', A.pct(x.s.er)));
  if (a.top.length) root.append(h('h2.sec', '잘된 것'), h('div.card.list', a.top.map(prow)));
  if (a.low.length > 2) root.append(h('h2.sec', '아쉬운 것'), h('div.card.list', a.low.map(prow)));
  const all = st.posts.filter(p => p.plat === plat);
  root.append(h('h2.sec', '전체 게시물 ', h('small', all.length + '')), h('div.card.list', all.slice(0, 60).map(p => h('button.prow', { onclick: () => editPost(p) }, h('span.pk', A.KIND[p.kind] || p.kind), h('span.pc', (p.caption || '(캡션 없음)').split('\n')[0]), h('span.pw', new Date(p.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) + (p.src === 'api' ? ' · 자동' : p.src === 'export' ? ' · 숫자 없음' : '')), h('span.pe', A.fmt(p.reach || p.views || p.likes))))));
};
// 게시물 숫자 고치기 / 직접 적기
function postForm(p = {}, onSave) {
  const f = {}; const num = (k, label) => field(label, f[k] = h('input', { type: 'number', inputmode: 'numeric', value: p[k] ?? '', min: 0 }));
  f.plat = h('select', ['ig', 'tt'].map(v => h('option', { value: v, selected: (p.plat || $plat.get()) === v }, A.PLAT[v])));
  f.kind = h('select', Object.entries(A.KIND).map(([v, l]) => h('option', { value: v, selected: p.kind === v }, l)));
  const d = p.at ? new Date(new Date(p.at).getTime() + 9 * 3600e3).toISOString().slice(0, 16) : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
  f.at = h('input', { type: 'datetime-local', value: d });
  f.caption = h('textarea', { rows: 3, value: p.caption || '' });
  const body = h('div.form', h('div.two', field('어디', f.plat), field('형식', f.kind)), field('올린 때', f.at), field('캡션', f.caption),
    h('div.three', num('reach', '도달'), num('views', '조회'), num('likes', '좋아요'), num('comments', '댓글'), num('saves', '저장'), num('shares', '공유·보내기'), num('dur', '길이(초)'), num('avgWatch', '평균 시청(초)')),
    h('div.row.gap', p.id ? h('button.ghost', { onclick: async () => { await S.update('posts', [], l => l.filter(x => x.id !== p.id)); close(); toast('지웠어요'); route(); } }, ic('trash', 16), '지우기') : null, h('button.btn.grow', { onclick: async () => {
      const n = { ...p, plat: f.plat.value, kind: f.kind.value, at: new Date(f.at.value + ':00+09:00').toISOString(), caption: f.caption.value };
      for (const k of ['reach', 'views', 'likes', 'comments', 'saves', 'shares', 'dur', 'avgWatch']) n[k] = f[k].value === '' ? undefined : +f[k].value;
      if (!p.id) n.src = 'manual';
      if (p.id) await S.update('posts', [], l => l.map(x => x.id === p.id ? n : x)); else await S.addPosts([n]);
      close(); toast('저장했어요'); onSave ? onSave() : route();
    } }, '저장')));
  const close = sheet(p.id ? '게시물 숫자' : '직접 적기', body);
}
const editPost = p => postForm(p);

// ── 숫자 채우기 ──
SCREENS.data = async (root, st) => {
  root.append(head('숫자 채우기', '많이 채울수록 매니저가 똑똑해져요', demoBadge()));
  const tk = await IG.tokenInfo(); const last = await S.get('g:iglast', 0);
  const way = (icn, title, body, ...btns) => h('div.card.way', h('div.wi', ic(icn, 20)), h('div.grow', h('b', title), h('p', body), h('div.row.gap.wrap', btns)));
  const shotIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => readShots([...e.target.files]) });
  const zipIn = h('input', { type: 'file', accept: '.zip,.json,.html,.txt,application/zip', multiple: true, hidden: true, onchange: e => importExport([...e.target.files]) });
  root.append(shotIn, zipIn,
    way('ig', '인스타 자동 연결', tk ? `연결됨 · 마지막으로 받은 때 ${last ? new Date(last).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '아직'}. 앱을 열 때마다 새 숫자를 받아요.` : '프로(크리에이터) 계정이면 게시물 숫자를 앱이 알아서 받아요. 처음 한 번만 연결하면 돼요.',
      S.getMode() === 'demo' ? h('p.fhint', '연습 모드에서는 연결을 쓰지 않아요.') : tk ? h('button.btn', { onclick: async e => { const btn = e.currentTarget; const b = e.currentTarget; busy(b, true, '받는 중'); try { const r = await IG.sync(); toast(`게시물 ${r.n}개 받았어요`); route(); } catch (er) { toast('못 받았어요: ' + er.message, 4000); busy(b, false); } } }, ic('refresh', 16), '지금 받기') : h('button.btn', { onclick: igGuide }, '연결하기'),
      tk ? h('button.ghost', { onclick: async () => { await IG.disconnect(); toast('연결을 끊었어요'); route(); } }, '끊기') : null),
    way('image', '캡처 올리기 (인스타·틱톡)', '인사이트·프로필·틱톡 분석 화면을 찍어 올리면 AI가 숫자를 읽어요. 여러 장 한 번에 돼요. 읽은 건 확인해야 들어가요.', h('button.btn', { onclick: () => shotIn.click() }, ic('upload', 16), '캡처 고르기')),
    way('folder', '내 정보 다운로드 파일', '팔로워·팔로잉 명단과 예전 게시물 캡션을 한 번에 가져와요. 맞팔 정리에 꼭 필요해요.', h('button.btn', { onclick: () => zipIn.click() }, ic('upload', 16), '파일 고르기'), h('button.ghost', { onclick: exportGuide }, '받는 법')),
    way('edit', '직접 적기', '숫자 몇 개만 알아도 돼요. 좋아요·조회만 적어도 분석돼요.', h('button.btn', { onclick: () => postForm({}) }, '적기')),
  );
  const pend = st.drafts.filter(d => d.status === '임시');
  if (pend.length) root.append(h('button.btn.wide', { onclick: () => go('#/inbox') }, `확인 기다리는 것 ${pend.length}개`));
};
function igGuide() {
  const tok = h('input', { placeholder: '토큰 붙여넣기 (IG…로 시작)', autocomplete: 'off', spellcheck: false });
  const step = (n, t, extra) => h('li', h('b', n), h('div', t, extra));
  const close = sheet('인스타 자동 연결', h('div.form',
    h('p.muted', '인스타가 정한 공식 방법이에요. 비밀번호는 앱에 안 넣고, 인스타가 주는 "토큰"만 이 폰에 저장해요. 15분쯤 걸려요(PC가 편해요).'),
    h('ol.steps',
      step('1', '인스타 앱 › 설정 › 계정 유형 › 프로페셔널(크리에이터)로 바꾸기 (무료, 언제든 되돌릴 수 있어요)'),
      step('2', 'developers.facebook.com 에 페이스북 계정으로 들어가 "앱 만들기" › 사용 사례 "Instagram에서 메시지 및 콘텐츠 관리" 고르기', h('a.link', { href: 'https://developers.facebook.com/apps/creation/', target: '_blank', rel: 'noopener' }, '열기', ic('ext', 14))),
      step('3', '앱 › Instagram › "Instagram 로그인을 통한 API 설정" › 2단계 "계정 추가"로 o.xxin.e 로그인'),
      step('4', '같은 화면에서 "토큰 생성"을 눌러 나온 긴 글자를 복사'),
      step('5', '아래에 붙여넣고 연결')),
    field('토큰', tok), h('button.btn.wide', { onclick: async e => { const btn = e.currentTarget; if (!tok.value.trim()) return toast('토큰을 붙여넣어 주세요'); busy(btn, true, '확인 중'); try { const me = await IG.connect(tok.value); close(); toast('@' + me.username + ' 연결됐어요'); await IG.sync(); route(); } catch (er) { busy(btn, false); toast('연결 안 됐어요: ' + er.message, 5000); } } }, '연결'),
    h('p.fhint', '팔로워 명단과 팔로우·언팔 실행은 공식 API에 없어요(인스타가 막아 둠). 그건 "내 정보 다운로드"와 사람 탭으로 해요.')));
}
function exportGuide() {
  sheet('내 정보 다운로드 받는 법', h('div.form',
    h('h3', ic('ig', 16), ' 인스타'), h('ol.steps', h('li', h('b', '1'), h('div', '설정 › 계정 센터 › 내 정보 및 권한 › 내 정보 내보내기')), h('li', h('b', '2'), h('div', '"내보내기 만들기" › 기기로 내보내기 › 정보 맞춤 설정에서 "팔로워 및 팔로잉"(+ 원하면 "콘텐츠")')), h('li', h('b', '3'), h('div', '형식은 꼭 JSON, 기간 "전체 기간" › 시작')), h('li', h('b', '4'), h('div', '몇 분~몇 시간 뒤 알림이 오면 zip을 받아 여기에 그대로 올리기'))),
    h('h3', ic('tt', 16), ' 틱톡'), h('ol.steps', h('li', h('b', '1'), h('div', '프로필 › ☰ › 설정 및 개인정보 › 계정 › 데이터 다운로드')), h('li', h('b', '2'), h('div', '형식 JSON 고르고 요청 › 준비되면 "데이터 다운로드" 탭에서 받기')), h('li', h('b', '3'), h('div', 'zip을 그대로 여기에 올리기'))),
    h('p.fhint', '파일은 이 폰 안에서만 읽어요. 어디로도 안 보내요. 2주에 한 번 새로 받으면 새로 온 사람·떠난 사람을 알려 드려요.')));
}
async function importExport(files) {
  if (!files.length) return; toast('읽는 중…', 8000);
  try {
    const r = await readFiles(files); let msg = [];
    for (const p of ['ig', 'tt']) {
      const x = r[p];
      if (x.followers.length || x.following.length) {
        await S.update('people', {}, pp => { const old = pp[p] || {}; pp[p] = { followers: x.followers.length ? x.followers : old.followers || [], following: x.following.length ? x.following : old.following || [], at: new Date().toISOString(), prevFollowers: old.followers?.length ? old.followers.map(y => y.u) : null }; return pp; });
        await S.update('profile', {}, pr => { pr[p] = { ...(pr[p] || {}), ...(x.followers.length ? { followers: pr[p]?.live ? pr[p].followers : x.followers.length } : {}), ...(x.following.length ? { following: x.following.length } : {}) }; return pr; });
        if (x.followers.length) await S.snap(p, (await S.get('profile', {}))[p].followers);
        msg.push(`${A.PLAT[p]} 팔로워 ${x.followers.length} · 팔로잉 ${x.following.length}`);
      }
      if (x.posts.length) { const n = await S.addPosts(x.posts); msg.push(`${A.PLAT[p]} 게시물 ${n}개`); }
    }
    toast(msg.length ? msg.join(', ') + ' 가져왔어요' : '읽을 수 있는 게 없었어요. JSON 형식인지 봐 주세요', 4500);
    route();
  } catch (e) { toast('못 읽었어요: ' + e.message, 4000); }
}
async function readShots(files) {
  if (!files.length) return;
  if (!(await AI.hasKey())) { toast('캡처 읽기는 AI 연결이 필요해요. 설정 › AI 연결', 4000); return; }
  toast(`캡처 ${files.length}장 읽는 중…`, 20000);
  try {
    const imgs = await Promise.all(files.slice(0, 6).map(f => imgB64(f)));
    const r = await AI.readShot(imgs);
    await S.update('drafts', [], d => { d.unshift({ id: S.uid(), kind: 'shot', at: Date.now(), status: '임시', data: r }); return d; });
    toast('읽었어요. 확인해 주세요'); go('#/inbox');
  } catch (e) { toast('못 읽었어요: ' + e.message, 4000); }
}

// ── 확인 대기함 ──
SCREENS.inbox = async (root, st) => {
  root.append(head('확인 대기', 'AI가 만든 건 확인해야 기록에 들어가요', demoBadge()));
  const pend = st.drafts.filter(d => d.status === '임시');
  if (!pend.length) { root.append(empty('inbox', '확인할 게 없어요', '캡처를 올리면 여기로 와요.')); return; }
  for (const d of pend) {
    const r = d.data || {}; const plat = r.plat === 'tt' ? 'tt' : 'ig';
    const rows = (r.posts || []).map(p => h('div.prow.static', h('span.pk', A.KIND[p.kind] || p.kind || '게시물'), h('span.pc', p.caption || p.date || ''), h('span.pw', ['views', 'reach', 'likes', 'comments', 'saves', 'shares'].filter(k => p[k] != null).map(k => ({ views: '조회', reach: '도달', likes: '좋아요', comments: '댓글', saves: '저장', shares: '공유' })[k] + ' ' + A.fmt(p[k])).join(' · '))));
    root.append(h('div.card', h('div.row.sb', h('b', ic(plat, 15), ' ', A.PLAT[plat], ' 캡처에서 읽은 것'), h('small.muted', new Date(d.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }))),
      r.profile ? h('p', `팔로워 ${A.fmt(r.profile.followers)} · 팔로잉 ${A.fmt(r.profile.following)} · 게시물 ${A.fmt(r.profile.posts)}`) : null, rows,
      h('div.row.gap', h('button.ghost', { onclick: async () => { await S.update('drafts', [], l => l.map(x => x.id === d.id ? { ...x, status: '버림' } : x)); route(); } }, '버리기'),
        h('button.btn.grow', { onclick: async () => {
          if (r.profile?.followers) { await S.update('profile', {}, pr => { pr[plat] = { ...(pr[plat] || {}), followers: r.profile.followers, following: r.profile.following ?? pr[plat]?.following }; return pr; }); await S.snap(plat, r.profile.followers, r.profile.following); }
          const ps = (r.posts || []).map(p => ({ plat, kind: p.kind || (plat === 'tt' ? 'video' : 'reels'), at: p.date ? new Date(p.date + 'T20:00:00+09:00').toISOString() : new Date().toISOString(), caption: p.caption || '', views: p.views ?? undefined, reach: p.reach ?? undefined, likes: p.likes ?? undefined, comments: p.comments ?? undefined, saves: p.saves ?? undefined, shares: p.shares ?? undefined, avgWatch: p.avgWatch ?? undefined, dur: p.dur ?? undefined, src: 'shot' }));
          if (ps.length) await S.addPosts(ps);
          await S.update('drafts', [], l => l.map(x => x.id === d.id ? { ...x, status: '확정' } : x)); toast('기록에 넣었어요'); route();
        } }, '맞아요, 넣기'))));
  }
};

// ── 코치 ──
SCREENS.coach = async (root, st, An, [tab = 'video']) => {
  root.append(head('코치', '찍은 걸 보여 주면 고칠 점을 짚어 줘요', demoBadge()), seg([['video', '영상 봐 주기', 'film'], ['caption', '캡션', 'type'], ['plan', '이번 주 계획', 'calendar']], tab, v => go('#/coach/' + v)));
  const plat0 = $plat.get(); let plat = plat0;
  const ps = h('div', platSeg(plat, v => { plat = v; $plat.set(v); ps.replaceChildren(platSeg(v, ps._on)); }));
  ps._on = v => { plat = v; $plat.set(v); ps.replaceChildren(platSeg(v, ps._on)); };
  ps.replaceChildren(platSeg(plat, ps._on));
  const keyed = await AI.hasKey();
  if (!keyed) root.append(h('div.card.note', ic('zap', 18), h('p', 'AI가 연결 안 된 기기예요. 지금은 앱 규칙으로만 봐요. ', h('button.link', { onclick: () => go('#/settings') }, 'AI 연결하기'))));
  if (tab === 'video') {
    const idea = h('input', { placeholder: '무슨 영상이에요? (예: 출근룩 GRWM)' });
    const out = h('div');
    const fin = h('input', { type: 'file', accept: 'video/*', hidden: true, onchange: async e => {
      const f = e.target.files[0]; if (!f) return; out.replaceChildren(h('div.card.center', h('span.spin'), ' 장면을 뽑는 중…'));
      let r; try { r = await inspect(f); } catch (er) { out.replaceChildren(h('div.card', '영상을 못 열었어요: ' + er.message + ' (mp4·mov로 해 주세요)')); return; }
      const strip = h('div.strip', r.frames.map((fr, i) => h('figure', h('img', { src: fr.url, alt: '' }), h('figcaption', fr.t.toFixed(1) + '초'))));
      const ruleList = h('div.rules', r.rules.map(x => h('div.rule.' + x.lvl, ic(x.lvl === 'good' ? 'check' : x.lvl === 'bad' ? 'x' : 'flag', 15), h('div', h('b', x.msg), x.how ? h('p', x.how) : null))));
      const aiBox = h('div');
      out.replaceChildren(h('div.card', h('div.row.sb', h('b', '앱이 잰 것'), h('small.muted', `${r.meta.dur.toFixed(1)}초 · ${r.meta.ratio}`)), strip, ruleList), aiBox);
      if (keyed) {
        aiBox.replaceChildren(h('div.card.center', h('span.spin'), ' 매니저가 영상을 보는 중… (20초쯤)'));
        try {
          const v = await AI.video({ about: st.about, plat, frames: r.frames, meta: r.meta, rules: r.rules, idea: idea.value });
          const res = h('div.card.ai',
            h('div.row.sb', h('b', ic('sparkles', 16), ' 매니저 피드백'), h('span.score', (v.score ?? '–') + '점')), h('p.one', v.one || ''),
            v.hook ? h('div.hook', h('b', `첫 1~2초 ${v.hook.score ?? '–'}/10`), h('p', v.hook.say)) : null,
            (v.good || []).length ? h('div', h('h4', '좋아요'), h('ul', v.good.map(x => h('li', x)))) : null,
            (v.fix || []).length ? h('div', h('h4', '고치면 좋아요'), h('div.fixes', v.fix.map(x => h('div.fix', h('span.ft', x.t), h('div', h('b', x.what), h('p', x.how)))))) : null,
            v.text ? h('p', h('b', '화면 글자 '), v.text) : null, v.sound ? h('p', h('b', '소리 '), v.sound) : null, v.length ? h('p', h('b', '길이 '), v.length) : null,
            Number.isInteger(v.cover) && r.frames[v.cover] ? h('div.cover', h('img', { src: r.frames[v.cover].url, alt: '' }), h('p', `커버는 ${r.frames[v.cover].t.toFixed(1)}초 장면을 추천해요`)) : null,
            v.caption ? h('div.capbox', h('pre', v.caption), h('button.ghost', { onclick: () => copy(v.caption) }, ic('copy', 15), '캡션 복사')) : null);
          aiBox.replaceChildren(res);
          await S.update('reviews', [], l => { l.unshift({ at: Date.now(), plat, idea: idea.value, score: v.score, one: v.one, fix: v.fix }); return l.slice(0, 40); });
        } catch (er) { aiBox.replaceChildren(h('div.card', 'AI 피드백을 못 받았어요: ' + er.message)); }
      }
      e.target.value = '';
    } });
    root.append(h('div.card', ps, field('설명 (선택)', idea), h('button.btn.wide', { onclick: () => fin.click() }, ic('film', 16), '영상 고르기'), h('p.fhint', '영상은 이 폰에서 장면 몇 장만 뽑고, AI에는 그 장면 사진만 보내요.')), fin, out);
    const rev = await S.get('reviews', []);
    if (rev.length) root.append(h('h2.sec', '지난 피드백'), h('div.card.list', rev.slice(0, 8).map(x => h('div.prow.static', h('span.pk', (x.score ?? '–') + '점'), h('span.pc', x.idea || x.one || ''), h('span.pw', new Date(x.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }))))));
  }
  if (tab === 'caption') {
    const idea = h('textarea', { rows: 3, placeholder: '무엇을 올려요? 대충 써도 돼요 (예: 졸업전시 끝나고 친구들이랑 찍은 사진, 너무 뿌듯)' });
    const mood = h('input', { placeholder: '느낌 (선택): 담백하게 / 웃기게 / 감성' });
    const draft = h('textarea', { rows: 3, placeholder: '(선택) 내가 써 둔 캡션이 있으면 붙여넣기 → 점검해 줘요' });
    const out = h('div');
    root.append(h('div.card', ps, field('무슨 게시물', idea), field('느낌', mood), field('써 둔 캡션', draft), h('button.btn.wide', { onclick: async e => { const btn = e.currentTarget;
      const past = st.posts.filter(p => p.caption && p.plat === plat).map(p => p.caption);
      out.replaceChildren(capCheck(draft.value, plat));
      if (!idea.value.trim() && !draft.value.trim()) return toast('무슨 게시물인지 한 줄만 써 주세요');
      if (!keyed) { out.append(capRules(idea.value, st)); return; }
      busy(btn, true, '쓰는 중');
      try {
        const r = await AI.caption({ about: st.about, plat, idea: idea.value || draft.value, mood: mood.value, past, notes: draft.value ? '내가 써 둔 캡션: ' + draft.value : '' });
        const tags = (r.tags || []).join(' ');
        out.append(...(r.options || []).map(o => h('div.card.cap', h('div.row.sb', h('b', o.style), h('button.ghost.sm', { onclick: () => copy(o.text + (tags ? '\n\n' + tags : '')) }, ic('copy', 14), '복사')), h('pre', o.text), h('p.muted', o.why))),
          h('div.card', h('p', h('b', '해시태그 '), tags), r.first ? h('p', h('b', '첫 줄 '), r.first) : null, r.cta ? h('p', h('b', '끝맺음 '), r.cta) : null, (r.keywords || []).length ? h('p', h('b', '검색 낱말 '), r.keywords.join(', ')) : null));
      } catch (er) { out.append(h('div.card', 'AI가 못 썼어요: ' + er.message), capRules(idea.value, st)); }
      busy(btn, false);
    } }, ic('sparkles', 16), '캡션 받기')), out);
  }
  if (tab === 'plan') {
    const out = h('div'); const saved = await S.get('plan', null);
    const draw = p => out.replaceChildren(h('div.card.list', (p.items || []).map(x => h('div.prow.static', h('span.pk', x.day), h('span.pc', h('b', x.idea), h('br'), h('small', '첫 1초: ' + (x.hook || ''))), h('span.pw', (x.plat === 'both' ? '인스타·틱톡' : A.PLAT[x.plat] || '') + ' · ' + (A.KIND[x.kind] || x.kind || '')), h('span.pe', x.time || '')))), h('p.fhint', '계획은 임시예요. 마음에 안 들면 다시 받기.'));
    if (saved) draw(saved);
    root.append(h('div.card', h('p', '지금 숫자(잘 되는 시간·형식·쉰 날)를 보고 7일치 올릴 거리를 짜요. 촬영 부담은 적게.'), h('button.btn.wide', { onclick: async e => { const btn = e.currentTarget;
      if (!keyed) { const p = rulePlan(An); await S.set('plan', p); draw(p); return; }
      busy(btn, true, '짜는 중'); try { const p = await AI.plan({ about: st.about, snapshot: snapshotText(st, An) }); await S.set('plan', p); draw(p); } catch (er) { toast('못 짰어요: ' + er.message); const p = rulePlan(An); draw(p); } busy(btn, false);
    } }, ic('calendar', 16), saved ? '다시 받기' : '계획 받기')), out);
  }
};
// 써 둔 캡션 점검 (규칙)
function capCheck(t, plat) {
  if (!t.trim()) return h('div');
  const tags = (t.match(/#[^\s#]+/g) || []).length, first = t.split('\n')[0], body = t.replace(/#[^\s#]+/g, '').trim();
  const r = [];
  r.push(first.length <= 40 ? ['good', `첫 줄 ${first.length}자, 더보기 전에 다 보여요`] : ['warn', `첫 줄이 ${first.length}자라 잘려요. 궁금하게 만드는 말을 앞 25자 안에`]);
  r.push(tags === 0 ? ['warn', '해시태그가 없어요. 정확한 것 3~5개'] : tags > 8 ? ['warn', `해시태그 ${tags}개는 많아요. 3~5개로`] : ['good', `해시태그 ${tags}개`]);
  r.push(/[?？]|댓글|알려|골라|보내|저장/.test(body) ? ['good', '반응을 부르는 말이 있어요'] : ['warn', '끝에 질문이나 "저장해 둬", "친구한테 보내" 같은 말을 넣어 봐요']);
  if (/협찬|제공|광고|업체|브랜드로부터/.test(t) && !/^\s*[\[(]?\s*(광고|협찬|유료\s*광고)/.test(t)) r.push(['bad', '협찬·광고면 첫 줄 맨 앞에 "광고" 또는 "협찬"을 써야 해요 (공정위 기준)']);
  if (plat === 'tt' && body.length < 20) r.push(['warn', '틱톡은 캡션 낱말로도 검색돼요. 무슨 영상인지 낱말을 넣어요']);
  return h('div.card', h('b', '써 둔 캡션 점검'), h('div.rules', r.map(([l, m]) => h('div.rule.' + l, ic(l === 'good' ? 'check' : l === 'bad' ? 'x' : 'flag', 15), h('div', h('b', m))))));
}
function capRules(idea, st) {
  const kw = (st.about.vibe || '').split(/[,\s]+/).filter(Boolean).slice(0, 2);
  const core = idea.trim().split(/[.!\n]/)[0].slice(0, 30) || '오늘';
  const opts = [`${core} 🫧\n\n이런 날은 꼭 남겨 두고 싶어요\n여러분은 요즘 뭐가 제일 좋아요?`, `저만 이런 거 아니죠…? ${core}\n\n공감되면 친구한테 보내 줘요`, `${core}, 기록용 📌\n저장해 두고 나중에 봐요`];
  return h('div', opts.map(o => h('div.card.cap', h('div.row.sb', h('b', '앱 규칙 예시'), h('button.ghost.sm', { onclick: () => copy(o) }, ic('copy', 14), '복사')), h('pre', o))), h('p.fhint', 'AI를 연결하면 내 말투를 배워서 써요. 키워드: ' + (kw.join(', ') || '설정에서 분위기를 적어 주세요')));
}
function rulePlan(An) {
  const a = An.plats.ig, t = An.plats.tt; const k = a.kinds[0]?.k || 'reels'; const hr = a.hours[0]?.h ?? 19;
  const time = String(hr + 1).padStart(2, '0') + ':00';
  const ideas = ['오늘의 코디 30초', '작업실·책상 브이로그', '요즘 자주 쓰는 것 3가지', '하루 루틴 빨리 감기', 'Q&A 스토리 질문 받기', '전에 잘된 게시물 변주', '주말 데일리 사진 모음'];
  return { items: ['월', '화', '수', '목', '금', '토', '일'].map((d, i) => ({ day: d, plat: i % 2 ? 'tt' : 'ig', kind: i % 2 ? 'video' : (i === 4 ? 'story' : k), idea: ideas[i], hook: '결과부터 보여 주고 시작', time: i % 2 && t.hours[0] ? String(t.hours[0].h + 1).padStart(2, '0') + ':00' : time })) };
}

// ── 사람 (팔로우 정리) ──
SCREENS.people = async (root, st, An, [tab = 'fans']) => {
  const plat = $plat.get();
  root.append(head('사람', '맞팔·정리할 사람을 골라 드려요', demoBadge()), platSeg(plat, v => { $plat.set(v); route(); }));
  const pp = st.people[plat];
  const zipIn = h('input', { type: 'file', accept: '.zip,.json,.html,.txt,application/zip', multiple: true, hidden: true, onchange: e => importExport([...e.target.files]) });
  root.append(zipIn);
  if (!pp) {
    root.append(empty('users', `${A.PLAT[plat]} 팔로우 명단이 없어요`, '"내 정보 다운로드" 파일을 올리면 맞팔 안 한 사람, 나만 팔로우하는 사람, 새로 온·떠난 사람을 정리해요.', h('div.row.gap.center', h('button.btn', { onclick: () => zipIn.click() }, ic('upload', 16), '파일 올리기'), h('button.ghost', { onclick: exportGuide }, '받는 법'))));
    root.append(whyManual());
    return;
  }
  const r = A.people(pp, st.handled, plat);
  root.append(h('div.tiles.five', tile('users', '팔로워', A.fmt(r.F)), tile('user', '팔로잉', A.fmt(r.G)), tile('check', '맞팔', A.fmt(r.mutual)), tile('userplus', '새로 옴', pp.prevFollowers ? '+' + r.fresh.length : '–'), tile('userminus', '떠남', pp.prevFollowers ? String(r.left.length) : '–')));
  const day = A.today(); const done = Object.values(st.handled).filter(x => x.at?.slice(0, 10) === day && x.plat === plat).length;
  root.append(h('div.card.quota', h('div.row.sb', h('b', `오늘 정리 ${done}/${A.DAILY_LIMIT}`), h('small.muted', '하루 20명 안쪽이 안전해요')), h('div.meter', h('i', { style: { width: Math.min(100, done / A.DAILY_LIMIT * 100) + '%' } }))));
  const tabs = [['fans', `맞팔 안 함 ${r.openFans.length}`], ['notback', `나만 팔로우 ${r.openNotBack.length}`], ['fresh', `새로 옴 ${r.fresh.length}`], ['left', `떠남 ${r.left.length}`]];
  root.append(seg(tabs, tab, v => go('#/people/' + v)));
  const listOf = { fans: r.openFans, notback: r.openNotBack, fresh: r.fresh, left: r.left }[tab] || [];
  const verb = { fans: ['맞팔했어요', 'userplus'], notback: ['끊었어요', 'userminus'], fresh: ['봤어요', 'check'], left: ['봤어요', 'check'] }[tab];
  const help = { fans: '나를 팔로우했는데 내가 안 한 사람이에요. 눌러서 프로필을 보고, 맞팔하고 싶으면 인스타에서 팔로우를 누른 뒤 "맞팔했어요".', notback: '내가 팔로우하는데 나를 안 하는 계정이에요. 좋아서 보는 계정(연예인·브랜드)은 "두기"로 빼 두세요.', fresh: '지난번 명단 뒤로 새로 온 사람이에요. 최근 게시물에 댓글을 남겨 주면 오래 남아요.', left: '지난번엔 있었는데 이번 명단에 없는 사람이에요.' }[tab];
  const box = h('div.card.list');
  const mark = async (u, what) => { await S.update('handled', {}, hd => { hd[plat + ':' + u] = { what, at: new Date().toISOString(), plat }; return hd; }); };
  const today20 = listOf.slice(0, tab === 'fans' || tab === 'notback' ? Math.max(0, A.DAILY_LIMIT - done) || 5 : 60);
  for (const x of today20) {
    const row = h('div.prow.person', h('a.pu', { href: A.profileUrl(plat, x.u), target: '_blank', rel: 'noopener' }, h('span.avatar', x.u[0].toUpperCase()), h('span', '@' + x.u, x.t ? h('small', ' ' + new Date(x.t).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })) : null), ic('ext', 14)),
      h('div.pa', tab === 'notback' ? h('button.ghost.sm', { onclick: async () => { await mark(x.u, 'keep'); row.classList.add('gone'); setTimeout(() => row.remove(), 280); } }, '두기') : null,
        h('button.btn.sm', { onclick: async () => { await mark(x.u, tab); row.classList.add('gone'); setTimeout(() => route(), 280); } }, ic(verb[1], 14), verb[0])));
    box.append(row);
  }
  root.append(h('p.muted.pad', help), today20.length ? box : empty('check', '다 했어요', tab === 'fans' || tab === 'notback' ? '오늘 몫은 끝났어요. 내일 또 골라 드릴게요.' : '해당하는 사람이 없어요.'));
  root.append(h('div.row.gap.center', h('button.ghost', { onclick: () => zipIn.click() }, ic('refresh', 15), '명단 새로 받기'), h('button.ghost', { onclick: exportGuide }, '받는 법')), whyManual());
};
const whyManual = () => h('details.card.why', h('summary', ic('shield', 15), ' 왜 버튼으로 바로 팔로우·언팔을 안 해요?'), h('p', '인스타·틱톡은 공식 API로 팔로우·언팔·맞팔 실행을 열어 두지 않았고, 다른 프로그램이 대신 누르는 건 약관 위반이에요. 걸리면 활동 제한이나 정지가 와요(특히 하루에 많이 끊을 때). 그래서 매니저는 누구를 할지 골라 주고 순서·속도를 관리하고, 마지막 누르기 한 번만 직접 해요. 프로필은 앱으로 바로 열려요.'));

// ── 협찬·광고 ──
const STAGES = ['문의', '협의', '진행', '업로드', '정산'];
SCREENS.deals = async (root, st, An, [tab = 'deals']) => {
  root.append(head('협찬', '문의부터 정산까지, 광고 표시 점검', [demoBadge(), h('button.iconbtn.acc', { 'aria-label': '새 협찬', onclick: () => dealForm({}), html: icon('plus', 20) })]));
  root.append(seg([['deals', '협찬', 'briefcase'], ['ads', '광고 집행', 'rocket'], ['rate', '내 단가', 'wallet']], tab, v => go('#/deals/' + v)));
  if (tab === 'deals') {
    const live = st.deals.filter(d => d.status !== '거절');
    const money = live.filter(d => d.status === '정산').reduce((s, d) => s + (+d.fee || 0), 0), wait = live.filter(d => d.status === '업로드' && !d.paid).reduce((s, d) => s + (+d.fee || 0), 0);
    root.append(h('div.tiles', tile('briefcase', '진행 중', live.filter(d => !['정산'].includes(d.status)).length + '건'), tile('wallet', '받을 돈', A.fmt(wait) + '원'), tile('check', '받은 돈', A.fmt(money) + '원')));
    if (!live.length) root.append(empty('briefcase', '아직 협찬이 없어요', 'DM으로 문의가 오면 여기에 적어 두세요. 마감·광고 표시·정산을 챙겨 드려요.', h('button.btn', { onclick: () => dealForm({}) }, '협찬 적기')));
    for (const s of STAGES) {
      const ds = live.filter(d => d.status === s); if (!ds.length) continue;
      root.append(h('h2.sec', s, ' ', h('small', ds.length)), h('div.card.list', ds.map(d => { const left = d.due && !['업로드', '정산'].includes(s) ? Math.ceil((new Date(d.due + 'T23:59:59+09:00') - Date.now()) / 864e5) : null; return h('button.prow', { onclick: () => dealForm(d) }, h('span.pk', d.kind || '협찬'), h('span.pc', h('b', d.brand), ' ', h('small', d.deliverables || '')), h('span.pw', d.fee ? A.fmt(d.fee) + '원' : '제품'), h('span.pe' + (left != null && left <= 2 && s !== '업로드' ? '.hot' : ''), left == null ? '' : left < 0 ? '지남' : 'D-' + left)); })));
    }
    root.append(h('div.card.note', ic('shield', 18), h('p', '광고 표시 규칙: 돈이나 제품을 받았으면 캡션 첫 줄 맨 앞에 "광고"(또는 "협찬"), 영상은 시작 화면에도. 인스타 "유료 파트너십" 표시를 켜면 더 좋아요. 코치 › 캡션에 붙여넣으면 점검해 줘요.')));
  }
  if (tab === 'ads') {
    const ads = st.ads;
    const sp = ads.reduce((s, a) => s + (+a.spend || 0), 0), fo = ads.reduce((s, a) => s + (+a.follows || 0), 0);
    root.append(h('div.tiles', tile('wallet', '쓴 돈', A.fmt(sp) + '원'), tile('userplus', '늘어난 팔로워', A.fmt(fo)), tile('target', '팔로워 1명당', fo ? A.fmt(sp / fo) + '원' : '–')));
    root.append(h('div.card.note', ic('bulb', 18), h('p', '초보 때 광고(홍보하기)는 이미 반응이 좋았던 게시물에만, 하루 5천~1만 원으로 3일 시험해요. 팔로워 1명당 500원보다 비싸면 멈추고 콘텐츠에 돈을 써요. 목표는 "프로필 방문"으로 골라야 팔로워가 늘어요.')));
    root.append(h('div.card.list', ads.map(a => h('div.prow.static', h('span.pk', A.PLAT[a.where] || a.where), h('span.pc', a.what), h('span.pw', `${A.fmt(a.spend)}원 · 도달 ${A.fmt(a.reach)} · +${a.follows || 0}명`), h('span.pe', a.follows ? A.fmt(a.spend / a.follows) + '원/명' : '')))), h('button.btn.wide', { onclick: adForm }, ic('plus', 16), '광고 기록 더하기'));
  }
  if (tab === 'rate') {
    for (const p of ['ig', 'tt']) {
      const a = An.plats[p], fol = a.growth.now || st.profile[p]?.followers; if (!fol) continue;
      const g = A.rateGuess(fol, a.er);
      root.append(h('div.card', h('div.row.sb', h('b', ic(p, 15), ' ', A.PLAT[p]), h('span.muted', '팔로워 ' + A.fmt(fol) + ' · 반응률 ' + A.pct(a.er))), h('div.big', `${A.fmt(g[0])}~${A.fmt(g[1])}원`), h('p.muted', '게시물 1개 기준 어림값이에요. 반응률이 높으면 더 불러도 돼요. 릴스+스토리 묶음은 1.3~1.5배, 2차 활용(브랜드가 광고로 씀)은 따로 받아요.')));
    }
    root.append(h('div.card.note', ic('msg', 18), h('p', '단가를 물어보면: "릴스 1개 ○○원, 스토리 추가 ○○원, 2차 활용은 1개월 ○○원이에요. 제품만 받는 협찬은 촬영 일정 맞으면 가능해요." 처럼 묶음으로 답해요.')));
  }
};
function dealForm(d) {
  const f = {};
  const inp = (k, label, type = 'text', ph = '') => field(label, f[k] = h('input', { type, value: d[k] ?? '', placeholder: ph, ...(type === 'number' ? { inputmode: 'numeric' } : {}) }));
  f.status = h('select', [...STAGES, '거절'].map(s => h('option', { selected: (d.status || '문의') === s }, s)));
  f.memo = h('textarea', { rows: 2, value: d.memo || '' });
  const close = sheet(d.id ? d.brand : '새 협찬', h('div.form', inp('brand', '브랜드'), h('div.two', inp('kind', '종류', 'text', '제품 협찬 / 유료 광고'), inp('fee', '받는 돈(원)', 'number')), inp('deliverables', '올릴 것', 'text', '릴스 1 + 스토리 1'), h('div.two', inp('due', '마감', 'date'), field('단계', f.status)), field('메모', f.memo),
    h('div.row.gap', d.id ? h('button.ghost', { onclick: async () => { await S.update('deals', [], l => l.filter(x => x.id !== d.id)); close(); route(); } }, ic('trash', 16)) : null,
      d.status === '업로드' ? h('button.ghost', { onclick: async () => { await S.update('deals', [], l => l.map(x => x.id === d.id ? { ...x, paid: true, status: '정산' } : x)); close(); toast('정산으로 옮겼어요'); route(); } }, '돈 받았어요') : null,
      h('button.btn.grow', { onclick: async () => {
        if (!f.brand.value.trim()) return toast('브랜드 이름을 적어 주세요');
        const n = { ...d, id: d.id || S.uid(), brand: f.brand.value.trim(), kind: f.kind.value, fee: f.fee.value === '' ? 0 : +f.fee.value, deliverables: f.deliverables.value, due: f.due.value, status: f.status.value, memo: f.memo.value };
        await S.update('deals', [], l => { const i = l.findIndex(x => x.id === n.id); if (i >= 0) l[i] = n; else l.unshift(n); return l; }); close(); toast('저장했어요'); route();
      } }, '저장'))));
}
function adForm() {
  const f = {}; const inp = (k, label, type = 'number') => field(label, f[k] = h('input', { type, ...(type === 'number' ? { inputmode: 'numeric' } : {}) }));
  f.where = h('select', h('option', { value: 'ig' }, '인스타'), h('option', { value: 'tt' }, '틱톡'));
  const close = sheet('광고 기록', h('div.form', field('어디', f.where), inp('what', '무슨 광고', 'text'), h('div.three', inp('spend', '쓴 돈'), inp('reach', '도달'), inp('follows', '늘어난 팔로워')), h('button.btn.wide', { onclick: async () => { await S.update('ads', [], l => { l.unshift({ id: S.uid(), where: f.where.value, what: f.what.value, spend: +f.spend.value || 0, reach: +f.reach.value || 0, follows: +f.follows.value || 0, at: new Date().toISOString() }); return l; }); close(); route(); } }, '저장')));
}

// ── 설정 ──
SCREENS.settings = async (root, st) => {
  root.append(head('설정', null, demoBadge()));
  const ab = await S.get('about', {}); const pr = st.profile;
  const f = { name: h('input', { value: ab.name || '' , placeholder: '하진' }), ig: h('input', { value: pr.ig?.username || ab.ig || '', placeholder: 'o.xxin.e', autocapitalize: 'off' }), tt: h('input', { value: pr.tt?.username || ab.tt || '', placeholder: '틱톡 아이디', autocapitalize: 'off' }), goal: h('input', { value: ab.goal || '', placeholder: '3개월 안에 팔로워 1만, 패션·일상' }), vibe: h('input', { value: ab.vibe || '', placeholder: '꾸안꾸, 솔직, 디자인 전공' }) };
  root.append(h('h2.sec', '나'), h('div.card.form', field('부를 이름', f.name), h('div.two', field('인스타 아이디', f.ig), field('틱톡 아이디', f.tt)), field('목표', f.goal), field('분위기·키워드', f.vibe, 'AI가 캡션·피드백을 여기에 맞춰요'), h('button.btn.wide', { onclick: async () => {
    const clean = v => v.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/, '').replace(/\/.*$/, '').toLowerCase();
    await S.set('about', { ...ab, name: f.name.value.trim(), ig: clean(f.ig.value), tt: clean(f.tt.value), goal: f.goal.value.trim(), vibe: f.vibe.value.trim() });
    await S.update('profile', {}, p => { if (clean(f.ig.value)) p.ig = { ...(p.ig || {}), username: clean(f.ig.value) }; if (clean(f.tt.value)) p.tt = { ...(p.tt || {}), username: clean(f.tt.value) }; return p; });
    toast('저장했어요');
  } }, '저장')));
  // AI
  const keyed = await AI.hasKey();
  const key = h('input', { type: 'password', placeholder: 'AIza… 또는 AQ.… 키 붙여넣기', autocomplete: 'off' });
  root.append(h('h2.sec', 'AI 연결'), h('div.card.form', h('p', keyed ? h('span.ok', ic('check', 15), ' 이 기기는 AI 연결됨 (비서 앱과 같은 무료 Gemini 키)') : '연결 안 됨. 무료 키 하나면 캡션·영상 피드백·캡처 읽기·대화가 돼요.'),
    keyed ? null : h('a.link', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, '① Google AI Studio에서 무료 키 만들기', ic('ext', 14)),
    keyed ? null : field('② 키 붙여넣기', key), keyed ? null : h('button.btn.wide', { onclick: async () => { if (!AI.looksLikeKey(key.value)) return toast('키 모양이 아니에요. 다시 복사해 주세요'); await AI.saveKey(key.value); toast('연결했어요'); route(); } }, '연결')));
  // 연습 모드
  const demo = S.getMode() === 'demo';
  root.append(h('h2.sec', '연습 모드'), h('div.card', h('p', '가상의 초보 인플루언서 "봄이"(인스타 팔로워 860명쯤, 협찬 3건)의 계정으로 모든 기능을 미리 써 봐요. 내 기록과 따로 저장돼요.'), h('button.btn.wide' + (demo ? '.warn' : ''), { onclick: async () => { if (demo) { localStorage.setItem('mgr:mode', 'real'); S.setMode('real'); await S.clearDemo(); toast('연습 모드를 껐어요'); } else { localStorage.setItem('mgr:mode', 'demo'); S.setMode('demo'); await seed(); toast('봄이 계정으로 바꿨어요'); } go('#/today'); } }, demo ? '연습 모드 끄기' : '봄이로 연습하기')));
  // 설치
  root.append(h('h2.sec', '폰에 설치'), h('div.card', h('p', /iphone|ipad/i.test(navigator.userAgent) ? 'Safari 아래 공유 버튼 › "홈 화면에 추가"' : 'Chrome 메뉴(⋮) › "앱 설치" 또는 "홈 화면에 추가"'), h('p.fhint', '비서 앱과 따로 아이콘이 생겨요. 주소: hchishj-alt.github.io/hajin-assistant/manager/')));
  root.append(h('h2.sec', '데이터'), h('div.card.form', h('p.muted', '모든 기록은 이 기기에만 있어요. 인스타 토큰도 이 기기에만.'), h('div.row.gap', h('button.ghost', { onclick: async () => { const all = {}; for (const k of ['profile', 'posts', 'snaps', 'people', 'handled', 'deals', 'about', 'ads', 'reviews', 'plan']) all[k] = await S.get(k); const b = new Blob([JSON.stringify(all)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: 'manager-backup.json' }); a.click(); } }, ic('download', 15), '백업 받기'), h('button.ghost', { onclick: () => { const i = h('input', { type: 'file', accept: '.json', onchange: async e => { try { const j = JSON.parse(await e.target.files[0].text()); for (const [k, v] of Object.entries(j)) if (v != null) await S.set(k, v); toast('되살렸어요'); route(); } catch { toast('백업 파일이 아니에요'); } } }); i.click(); } }, ic('upload', 15), '백업 넣기'))), h('p.ver', '매니저 ' + VERSION));
};

// ── 시작 ──
async function boot() {
  S.setMode(localStorage.getItem('mgr:mode') === 'demo' ? 'demo' : 'real');
  document.getElementById('tabbar').append(...TABS.map(([t, l, i]) => h('button', { 'data-t': t, onclick: () => go('#/' + t), 'aria-label': l }, ic(i, 22), h('span', l))));
  // 처음 열면 인스타 아이디를 넣어 둠 (하진 계정)
  if (S.getMode() === 'real') { const p = await S.get('profile', null); if (!p) await S.set('profile', { ig: { username: 'o.xxin.e' }, tt: { username: 'o.xxin.e' } }); }
  window.addEventListener('hashchange', route);
  await route();
  // 인스타가 연결돼 있으면 열 때마다 새 숫자 (30분 간격)
  if (S.getMode() === 'real' && (await IG.tokenInfo()) && Date.now() - (await S.get('g:iglast', 0)) > 30 * 60e3) { try { await IG.sync(); if (/today|stats|^$/.test(location.hash.replace(/^#\/?/, '') || 'today')) route(); } catch (e) { if (e.code === 190) toast('인스타 연결이 끊겼어요. 숫자 채우기에서 다시 연결해 주세요', 5000); } }
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('./sw.js').catch(() => { });
}
boot();
