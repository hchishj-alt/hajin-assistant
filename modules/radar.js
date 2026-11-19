// 지원사업·창업 정보 랭킹: 매일 모인 글 + 우리가 직접 넣은 링크를 시급성·유익성·우선순위로 점수 매김
import { h, ic, clear, toast, head, modal, form, tile, seg, rel, todayStr, debounce } from '../js/ui.js';
import * as db from '../js/db.js';
import { go } from '../js/app.js';
import * as taste from '../js/taste.js';

let tab = 'rank', q = '';
const TYPE = { grant: ['지원사업', 'target'], news: ['정보', 'book'], community: ['커뮤니티', 'users'], help: ['도움말', 'bulb'] };
// 우리 회사(친구들끼리 시작한 작은 콘텐츠 기획·제작 외주사)에 맞는 말일수록 점수
const FIT = [[/콘텐츠|영상|디자인|미디어|크리에이|브랜딩|모션|애니|게임|웹툰|광고|마케팅|홍보|sns|숏폼|유튜브/i, 9], [/예비\s*창업|초기\s*창업|청년|1인|소규모|소기업|스타트업|창업\s*[37]년|신생/, 8], [/지원금|사업화\s*자금|바우처|보조금|무상|최대\s*[\d,.]+\s*(억|천만|백만|만)\s*원/, 7], [/입주|공간|사무실|멘토링|컨설팅|교육|네트워킹|판로|수주|외주|프리랜서|계약|세금|부가세|종합소득|4대\s*보험/, 4], [/모집|공고|접수|신청|공모/, 3]];
const MISFIT = [/제조|농업|농식품|수산|축산|바이오|반도체|이차전지|조선|건설|수출\s*중견|대기업|상장|원전|방산/, /부고|인사\]|포토\]|주가|증시|속보/];
export function score(it, marks = {}, base = new Date(), prof = null, me = '') {
  const text = `${it.title} ${it.desc || ''}`;
  const today = base.toISOString().slice(0, 10);
  let due = it.deadline || '';
  if (!due) { const m = text.match(/(?:~|까지|마감|접수\s*기간)[^.\d]{0,12}(\d{1,2})[.\/월]\s*(\d{1,2})|(\d{1,2})[.\/월]\s*(\d{1,2})일?\s*(?:까지|마감)/); if (m) { const mo = +(m[1] || m[3]), d = +(m[2] || m[4]); let y = base.getFullYear(); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) { if (mo < base.getMonth() + 1 - 6) y++; due = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; } } }
  const dday = due ? Math.round((new Date(due) - new Date(today)) / 864e5) : null;
  const age = Math.max(0, Math.round((base - new Date(it.date || base)) / 864e5));
  let urg = dday == null ? Math.max(2, 14 - age) : dday < 0 ? -100 : dday <= 3 ? 40 : dday <= 7 ? 33 : dday <= 14 ? 26 : dday <= 30 ? 17 : 8;
  if (it.type !== 'grant' && dday == null) urg = Math.max(1, 10 - age);
  let fit = 0; const why = [];
  for (const [re, w] of FIT) { const m = text.match(re); if (m) { fit += w; why.push(m[0]); } }
  for (const re of MISFIT) if (re.test(text)) fit -= 12;
  // 지금 신청할 수 있는 공고인지, 이미 끝난 소식인지
  if (it.type === 'grant' && !it.manual) { if (/모집|공고|접수|신청|참가자|지원\s*대상|선착순|참여\s*기업/.test(text)) { fit += 8; why.push('모집 중'); } if (/시상|수상|성료|협약|개최했|마쳤|선정됐|선정했|발표했|마무리|성과\s*공유|수료/.test(text)) fit -= 16; }
  // 팀이 알려 준 취향 (관심 있어요 / 필요 없어요)
  const learn = taste.bonus(it, prof); const lk = prof?.links[it.link] || { up: 0, down: 0, by: {} };
  if (learn.up.length) why.push('팀 관심: ' + learn.up[0]);
  fit = Math.max(0, Math.min(40, Math.round(fit * 1.25)));
  const tst = learn.delta - lk.down * 12;
  const mk = marks[it.link] || {};
  const stars = Object.keys(mk.stars || {}).length;
  const pri = Math.min(20, ({ grant: 10, help: 6, community: 5, news: 3 }[it.type] || 3) + stars * 5 + lk.up * 3 + (it.manual ? 4 : 0));
  return { total: urg + fit + pri + tst, tst, urg: Math.max(0, urg), fit, pri, dday, due, why: [...new Set(why)].slice(0, 4), stars, learn, liked: lk.by[me] === 'up', ups: lk.up, hidden: !!mk.hidden || urg < 0 || lk.down >= 2 || lk.by[me] === 'down' };
}

// 늘 쓰는 곳 (주소가 바뀌지 않는 공식·대표 사이트)
export const PORTALS = [
  ['help', 'K-Startup 창업지원포털', 'https://www.k-startup.go.kr', '정부 창업 지원사업 공고가 전부 모이는 곳. 예비·초기창업패키지 공고는 여기.'],
  ['help', '기업마당', 'https://www.bizinfo.go.kr', '중소기업·소상공인 지원사업 통합 검색. 지역·분야로 걸러 보기.'],
  ['help', '한국콘텐츠진흥원', 'https://www.kocca.kr', '콘텐츠 제작 지원, 입주, 교육. 우리 업종에 가장 맞는 기관.'],
  ['help', '소상공인24', 'https://www.sbiz24.kr', '소상공인 정책자금·지원사업 신청.'],
  ['help', '온통청년', 'https://www.youthcenter.go.kr', '청년 정책·지원금 모음.'],
  ['help', '홈택스', 'https://www.hometax.go.kr', '사업자등록, 세금계산서, 부가세·종소세 신고.'],
  ['help', '정부24', 'https://www.gov.kr', '각종 증명서, 보조금24.'],
  ['community', '디스콰이엇', 'https://disquiet.io', '초기 팀·메이커들이 만든 것 공유하고 피드백 받는 곳.'],
  ['community', 'EO 플래닛', 'https://eopla.net', '창업자 글·인터뷰. 초기 운영 팁.'],
  ['community', '노트폴리오', 'https://notefolio.net', '국내 디자인·콘텐츠 포트폴리오. 수주·레퍼런스.'],
  ['community', '크몽', 'https://kmong.com', '외주 수주 채널. 단가 감 잡기에도.'],
  ['community', '라우드소싱', 'https://www.loud.kr', '디자인·콘텐츠 공모전 형태 외주.'],
  ['community', '원티드 긱스', 'https://www.wanted.co.kr/gigs', '프로젝트 단위 외주 매칭.'],
  ['community', '더브이씨', 'https://thevc.kr', '스타트업·투자 데이터.'],
];

async function loadFeed() {
  try { const r = await fetch('data/feed.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch { }
  return { updatedAt: null, items: [], log: [] };
}

export default {
  async render(root) {
    const body = h('div');
    root.append(head('지원사업 · 정보 랭킹', '매일 아침 새 글을 모아서, 우리 회사 기준으로 시급성·유익성·우선순위 점수를 매겨요.',
      h('button.btn.sm.ghost', { onclick: howto }, ic('book', 14), '?'),
      h('button.btn.sm.pri', { onclick: () => add() }, ic('plus', 14), '링크 넣기')), body);
    const feed = await loadFeed(); let curRank = [];
    await draw();
    widget();

    async function draw() {
      clear(body);
      const [leads, markRows, grants] = await Promise.all([db.list('leads'), db.list('leadmarks'), db.list('grants')]);
      const marks = {}; markRows.forEach(m => (marks[m.link] = m));
      const me = await db.kvGet('name', '하진'); const prof = await taste.load();
      const all = [...leads.map(l => ({ ...l, manual: true })), ...feed.items.filter(i => !leads.some(l => l.link === i.link)), ...PORTALS.map(([type, title, link, desc]) => ({ type, title, link, desc, source: '늘 쓰는 곳', portal: true, date: null }))];
      const scored = all.map(it => ({ it, s: score(it, marks, new Date(), prof, me) })).filter(x => !x.s.hidden);
      const live = scored.filter(x => !x.it.portal);
      // 같은 소식을 여러 매체가 쓴 건 하나만 (제목이 절반 넘게 겹치면 같은 글로 봄)
      const grams = t => { const n = t.replace(/[^가-힣a-zA-Z0-9]/g, ''); const g = new Set(); for (let i = 0; i < n.length - 1; i++) g.add(n.slice(i, i + 2)); return g; };
      const rank = []; for (const x of [...live].sort((a, b) => b.s.total - a.s.total)) { const g = grams(x.it.title); const dup = rank.find(y => { let c = 0; for (const k of g) if (y.g.has(k)) c++; return c / Math.max(1, Math.min(g.size, y.g.size)) > .55; }); if (dup) dup.more = (dup.more || 0) + 1; else rank.push(Object.assign(x, { g })); }
      const soon = live.filter(x => x.s.dday != null && x.s.dday <= 7).length;
      body.append(h('div.tiles', { style: { marginBottom: '14px' } }, tile('layers', live.length, '모인 글'), tile('flag', soon, '7일 안 마감', soon ? 'warn' : 'ok'), tile('star', live.filter(x => x.s.stars).length, '팀이 찜한 글'), tile('target', grants.filter(g => !['선정', '탈락'].includes(g.status)).length, '준비 중인 지원사업', '', 'startup')));
      const search = h('input.in', { placeholder: '찾기 (예: 콘텐츠, 청년, 입주)', value: q, style: { maxWidth: '260px' }, oninput: debounce(e => { q = e.target.value; draw().then(() => { const i = body.querySelector('input.in'); i.focus(); i.setSelectionRange(q.length, q.length); }); }, 250) });
      body.append(h('div.row.between', { style: { marginBottom: '12px', gap: '10px', flexWrap: 'wrap' } }, seg([['rank', '랭킹'], ['grant', '지원사업'], ['news', '정보'], ['place', '커뮤니티·도움말']], tab, v => { tab = v; draw(); }), search));
      const match = x => !q || `${x.it.title} ${x.it.desc || ''} ${x.it.source || ''}`.toLowerCase().includes(q.toLowerCase());
      if (tab === 'place') {
        const g = h('div.grid.g2');
        for (const [k, [label, icon]] of [['help', TYPE.help], ['community', TYPE.community]]) g.append(h('div.card', h('div.card-h', h('h3', ic(icon), label)), h('div.list', scored.filter(x => x.it.type === k && (x.it.portal || x.it.manual) && match(x)).map(x => h('a.li.click', { href: x.it.link, target: '_blank', rel: 'noopener' }, h('div.grow', h('div.t.small', x.it.title), h('div.faint.tiny', x.it.desc || '')), ic('link', 14))))));
        body.append(g); return;
      }
      const pool = (tab === 'rank' ? rank : rank.filter(x => x.it.type === tab)).filter(match);
      const top = pool.slice(0, tab === 'rank' ? 10 : 30); curRank = top;
      const learned = Object.entries(prof.w).filter(([, v]) => Math.abs(v) >= 2);
      if (learned.length) body.append(h('div.rd-learn', h('span.faint.tiny', '팀이 알려 준 기준'), ...learned.slice(0, 10).map(([k, v]) => h('button.chip' + (v > 0 ? '.ok' : '.bad'), { title: '누르면 잊어요', onclick: async () => { await taste.forget([k]); for (const r of await taste.rows()) if (!r.word && (r.words || []).includes(k)) await db.put('leadfb', { ...r, words: r.words.filter(x => x !== k) }); draw(); } }, (v > 0 ? '+ ' : '− ') + k))));
      const left = h('div.card', h('div.card-h', h('h3', ic('trend'), tab === 'rank' ? '우리 회사 랭킹 TOP 10' : TYPE[tab][0] + ' 순위'), h('span.faint.tiny', feed.updatedAt ? `${rel(feed.updatedAt.slice(0, 10))} 모음` : '아직 자동 수집 전')));
      if (!top.length) left.append(h('div.empty', feed.updatedAt ? '조건에 맞는 글이 없어요' : '앱을 주소에 올리면 매일 아침 자동으로 채워져요. 지금은 “링크 넣기”로 직접 넣을 수 있어요.'));
      top.forEach((x, i) => left.append(row(x, i + 1, marks, me)));
      const rest = [...live].filter(match).sort((a, b) => (b.it.date || '').localeCompare(a.it.date || ''));
      const right = h('div.card', h('div.card-h', h('h3', ic('file'), '모든 글 (최신순)'), h('span.faint.tiny', rest.length + '개')),
        h('div.list', { style: { maxHeight: '70vh', overflow: 'auto' } }, rest.slice(0, 150).map(x => h('button.li.click.rd-li', { onclick: () => detail(x), title: '자세히' }, h('span.chip' + (x.it.type === 'grant' ? '.acc' : ''), TYPE[x.it.type]?.[0] || '글'), h('div.grow', { style: { minWidth: 0 } }, h('div.small', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, x.it.title), h('div.faint.tiny', [x.it.source, x.it.date && rel(x.it.date.slice(0, 10)), x.s.dday != null ? `D-${x.s.dday}` : ''].filter(Boolean).join(' · '))), h('span.mono.tiny.faint', x.s.total)))));
      body.append(h('div.grid', { class: 'editor-grid', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } }, left, right));
    }

    // 앱 안에서 바로 읽기: 요약·마감·맞는 이유를 보여 주고, 필요할 때만 원문으로
    function detail(x) {
      const { it, s } = x;
      modal(TYPE[it.type]?.[0] || '글', close => h('div',
        h('h3', { style: { lineHeight: 1.4 } }, it.title),
        h('div.chips', { style: { margin: '8px 0' } }, s.dday != null ? h('span.chip' + (s.dday <= 3 ? '.bad' : s.dday <= 7 ? '.warn' : ''), s.dday === 0 ? '오늘 마감' : `D-${s.dday} (${s.due})`) : h('span.chip', '마감일 못 찾음'), ...s.why.map(w => h('span.chip.acc', w)), h('span.chip', `점수 ${s.total}`)),
        h('p.small', { style: { lineHeight: 1.7, whiteSpace: 'pre-wrap' } }, it.desc && it.desc.replace(it.title, '').trim().length > 20 ? it.desc : '이 글은 제목만 모였어요. 자세한 조건은 원문에서 확인해 주세요.'),
        h('p.faint.tiny', [it.source, it.date && new Date(it.date).toLocaleDateString('ko-KR'), it.q].filter(Boolean).join(' · ')),
        h('div.modal-f', { style: { flexWrap: 'wrap' } },
          h('a.btn.ghost', { href: it.link, target: '_blank', rel: 'noopener' }, ic('link', 14), '원문'),
          h('button.btn', { onclick: async () => { const store = await import('../js/store.js'); await store.draft('task', { title: `지원 검토: ${it.title.slice(0, 50)}`, due: s.due || '', priority: s.dday != null && s.dday <= 7 ? 'high' : 'normal', memo: it.link }, { source: it.title, origin: 'radar', confidence: .8 }); (await import('../js/app.js')).updateBadge(); close(); toast('할 일 임시 항목을 만들었어요', { label: '확인 대기함', fn: () => go('inbox') }); } }, ic('check2', 14), '할 일로'),
          it.type === 'grant' ? h('button.btn.pri', { onclick: async () => { await db.put('grants', { title: it.title, url: it.link, deadline: s.due || '', status: '검토', org: it.source || '', team: (await db.get('team-main')) ? 'team-main' : '' }); close(); toast('지원사업 준비 목록에 담았어요', { label: '보기', fn: () => go('startup') }); } }, ic('plus', 14), '준비 목록에 담기') : null)));
    }
    function row(x, n, marks, me) {
      const { it, s } = x;
      const starred = !!(marks[it.link]?.stars || {})[me];
      const bar = (v, max, c, t) => h('div', { title: `${t} ${v}/${max}`, style: { flex: max, height: '6px', borderRadius: '99px', background: 'var(--bg2)', overflow: 'hidden' } }, h('i', { style: { display: 'block', height: '100%', width: (v / max * 100) + '%', background: c, borderRadius: '99px', transition: 'width .6s var(--spring)' } }));
      const mark = async patch => { const cur = marks[it.link] || { id: 'mk-' + [...it.link].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36) + it.link.length, link: it.link, stars: {}, team: (await db.get('team-main')) ? 'team-main' : '' }; await db.put('leadmarks', { ...cur, ...patch(cur) }); draw(); };
      return h('div.rank', h('div.rank-n' + (n <= 3 ? '.top' : ''), n),
        h('div.grow', { style: { minWidth: 0 } },
          h('button.rank-t', { onclick: () => detail(x) }, it.title),
          h('div.chips', { style: { margin: '4px 0 6px' } }, h('span.chip' + (it.type === 'grant' ? '.acc' : ''), TYPE[it.type]?.[0] || '글'), s.dday != null ? h('span.chip' + (s.dday <= 3 ? '.bad' : s.dday <= 7 ? '.warn' : ''), s.dday === 0 ? '오늘 마감' : `D-${s.dday}`) : null, s.stars ? h('span.chip.ok', `찜 ${s.stars}`) : null, s.ups ? h('span.chip.ok', `관심 ${s.ups}`) : null, x.more ? h('span.chip', `같은 소식 ${x.more}건`) : null, ...s.why.map(w => h('span.chip', w)), h('span.faint.tiny', [it.source, it.by && it.by + ' 넣음'].filter(Boolean).join(' · '))),
          h('div.row', { style: { gap: '4px' } }, bar(s.urg, 40, 'var(--bad)', '시급성'), bar(s.fit, 40, 'var(--acc)', '유익성'), bar(s.pri, 20, 'var(--ok)', '우선순위')),
          h('div.faint.tiny', { style: { marginTop: '3px' } }, `시급성 ${s.urg} · 유익성 ${s.fit} · 우선순위 ${s.pri}${s.tst ? ` · 팀 취향 ${s.tst > 0 ? '+' : ''}${s.tst}` : ''}`)),
        h('div.rank-s', s.total),
        h('div.rank-a',
          h('button.btn.icon.ghost' + (starred ? '.on' : ''), { title: '찜 (팀 우선순위 +5)', 'aria-label': '찜', onclick: () => mark(c => { const st = { ...(c.stars || {}) }; starred ? delete st[me] : (st[me] = 1); return { stars: st }; }) }, ic('star', 16)),
          it.type === 'grant' ? h('button.btn.icon.ghost', { title: '지원사업 준비 목록에 담기', 'aria-label': '담기', onclick: async () => { await db.put('grants', { title: it.title, url: it.link, deadline: s.due || '', status: '검토', org: it.source || '', team: (await db.get('team-main')) ? 'team-main' : '' }); toast('스타트업 PM → 지원사업에 담았어요', { label: '보기', fn: () => go('startup') }); } }, ic('plus', 16)) : null,
          h('button.btn.icon.ghost' + (s.liked ? '.on' : ''), { title: '관심 있어요 (이런 글을 위로)', 'aria-label': '관심', onclick: async () => { await taste.markItem(it, 'up'); draw(); } }, ic('thumb', 16)),
          h('button.btn.icon.ghost', { title: '필요 없어요 (숨기고, 이런 글을 아래로)', 'aria-label': '숨기기', onclick: async () => { const r = await taste.markItem(it, 'down'); draw(); toast('숨겼어요. 비슷한 글도 점점 내릴게요', { label: '되돌리기', fn: async () => { await taste.markItem(it, 'down'); draw(); } }); } }, h('span.flip', ic('thumb', 16)))));
    }

    // 랭킹 화면에 떠 있는 비서: 말로 피드백 ("제조 쪽은 필요 없어", "3번 왜 높아?")
    function widget() {
      const log = h('div.rdw-log'); const inp = h('input.in', { placeholder: '예: 제조 쪽은 필요 없어', 'aria-label': '비서에게 말하기' });
      const bub = (t, me, chips) => { const b = h('div.rdw-b' + (me ? '.me' : ''), t); log.append(b); if (chips?.length) log.append(h('div.chips', chips.map(c => h('button.chip', { onclick: () => say(c.say) }, c.label)))); log.scrollTop = log.scrollHeight; };
      const say = async t => { t = (t || '').trim(); if (!t) return; inp.value = ''; bub(t, true);
        let r = await taste.talk(t, { rank: curRank });
        if (!r) { const CH = await import('../js/chat.js'); r = CH.isTalk(t) ? await CH.reply(t, { name: (await db.kvGet('name', '')) || '' }) : { text: '여기서는 랭킹을 우리 팀에 맞게 고쳐요. “콘텐츠 더 보여줘”, “제조 쪽은 필요 없어”, “3번 필요 없어”, “1번 왜 높아?”처럼 말해 주세요.' }; r = { text: r.text, chips: (r.chips || []).filter(c => c.say) }; }
        if (r.changed) await draw();
        bub(r.text, false, r.chips); };
      const panel = h('div.rdw', { hidden: true }, h('div.rdw-h', h('b', ic('sparkles', 15), '랭킹 비서'), h('button.btn.icon.ghost', { 'aria-label': '닫기', onclick: () => { panel.hidden = true; fab.hidden = false; } }, ic('minus', 16))), log,
        h('div.chips.rdw-q', ['배운 기준 보기', '1번 왜 높아?'].map(t => h('button.chip', { onclick: () => say(t) }, t))),
        h('form.rdw-f', { onsubmit: e => { e.preventDefault(); say(inp.value); } }, inp, h('button.btn.icon.pri', { 'aria-label': '보내기' }, ic('send', 16))));
      const fab = h('button.rdw-fab', { 'aria-label': '랭킹 비서 열기', onclick: () => { panel.hidden = false; fab.hidden = true; if (!log.children.length) bub('어떤 글이 더 필요하고 어떤 글이 필요 없는지 알려 주세요. 팀원 모두의 말이 모여서 랭킹이 우리에게 맞게 좁혀져요.'); inp.focus(); } }, ic('sparkles', 18), '비서에게 알려주기');
      root.append(fab, panel);
    }

    function add(v0 = {}) {
      modal('링크 넣기', close => form([{ k: 'link', label: '링크', type: 'url', full: true }, { k: 'title', label: '제목', full: true }, { k: 'type', label: '종류', type: 'select', options: Object.entries(TYPE).map(([k, [l]]) => [k, l]), default: 'grant' }, { k: 'deadline', label: '마감일 (있으면)', type: 'date' }, { k: 'desc', label: '한 줄 메모', full: true }], v0, async v => {
        if (!/^https?:\/\//.test(v.link || '')) { toast('링크를 넣어 주세요'); return; }
        await db.put('leads', { ...v, title: v.title || v.link, date: new Date().toISOString(), source: '직접 넣음', by: await db.kvGet('name', '하진'), team: (await db.get('team-main')) ? 'team-main' : '' });
        close(); draw();
      }, { submitLabel: '넣기' }));
    }
    function howto() {
      modal('랭킹은 이렇게 매겨요', close => h('div',
        h('div.list', [['시급성 (40점)', '마감이 가까울수록 높아요. 3일 안 40, 7일 안 33, 2주 안 26, 한 달 안 17. 마감이 없으면 새 글일수록. 마감 지난 글은 자동으로 빠져요.'], ['유익성 (40점)', '콘텐츠·영상·디자인, 예비·초기 창업, 청년·소규모, 지원금·바우처 같은 말이 있으면 높아요. 제조·농업처럼 우리와 먼 분야는 깎여요.'], ['우선순위 (20점)', '지원사업 > 도움말 > 커뮤니티 > 뉴스 순. 팀원이 찜(★)하면 한 명당 +5, 관심 있어요는 +3, 우리가 직접 넣은 링크는 +4.'], ['팀이 알려 준 기준', '관심 있어요·필요 없어요를 누르거나 비서에게 “제조 쪽은 필요 없어”처럼 말하면 배워요. 같은 낱말이 두 번 이상 모이거나 말로 직접 알려 주면 그 낱말이 든 글이 올라가거나 내려가요. 두 명이 필요 없다고 한 글은 모두에게서 빠져요. 점수는 −20에서 +20까지 따로 더해져요.']].map(([t, d]) => h('div.li', { style: { alignItems: 'flex-start' } }, h('div.grow', h('div.t.small', t), h('div.faint.small', d))))),
        h('p.small.muted', { style: { marginTop: '10px' } }, '글은 GitHub가 매일 아침 6시 40분에 무료로 모아요. 모으는 검색어는 저장소의 data/sources.json 에서 바꿀 수 있어요. 제목을 누르면 항상 원문으로 가요.'),
        feed.log?.length ? h('details', h('summary.small', '오늘 수집 기록'), h('pre.tiny', { style: { whiteSpace: 'pre-wrap' } }, feed.log.join('\n'))) : null,
        h('div.modal-f', h('button.btn.pri', { onclick: close }, '알겠어요'))));
    }
  },
};
