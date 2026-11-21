// 프롬프트 스튜디오: 팀 앱과 따로 도는 유료 서비스 화면.
// 손님은 로그인 없이 "복구 코드"(이 기기에 저장)로 구분하고, 결제는 계좌 이체 + 입금 알림 자동 확인.
// 서버 구조와 함수는 supabase/studio.sql. 유료 틀 본문은 서버에서 구독 중인 손님에게만 내려옴.
const SB = { url: 'https://wuvqtfvvouweqxbydlqa.supabase.co', key: 'sb_publishable_dpHWxB26toO96sIiv4XlqA_lBmzrGGp' };
// 월결제 하나만. 정가 9,900원에서 할인한 값
export const PLANS = [
  { id: 'm1', label: '월 구독', price: 2900, list: 9900 },
];

// ── 작은 도구 ──
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const [base, id] = tag.split('#');
  const [name, ...cls] = base.split('.');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('ps:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ps:' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('ps:' + k); } catch { } },
};
async function rpc(fn, args = {}) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB.key, authorization: 'Bearer ' + SB.key, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const txt = await r.text();
  if (!r.ok) { let m = txt; try { m = JSON.parse(txt).message || txt; } catch { } throw new Error(m); }
  return txt ? JSON.parse(txt) : null;
}
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const isForever = s => /infinity/i.test(String(s || ''));
const ymd = s => { if (isForever(s)) return '평생'; const d = new Date(s); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };
const group4 = s => String(s || '').replace(/(.{4})(?=.)/g, '$1 ');
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
async function copy(text, msg = '복사했어요') {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(msg);
}
const ICON = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.4-3.6 4.2-5.2 7.5-5.2s6.1 1.6 7.5 5.2"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5" stroke-linecap="round"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M12 9v11M3.5 13h17M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 4h11v16l-5.5-4-5.5 4z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.8v.2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3" stroke-linecap="round"/><path d="M12 7v6M9 10h6" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4" stroke-linecap="round"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 9.5l1.5 5 1.5-4 1.5 4 1.5-5"/></svg>',
};
const ic = (n, cls = '') => h('span.ic' + (cls ? '.' + cls : ''), { html: ICON[n], 'aria-hidden': 'true' });

// ── 빈칸 ──
const VAR = /\{\{\s*([^{}\n]{1,30}?)\s*\}\}/g;
export function vars(body) { const out = []; for (const m of String(body || '').matchAll(VAR)) if (!out.includes(m[1])) out.push(m[1]); return out; }
// 줄에 빈칸 하나만 있으면(자료·글처럼 긴 것) 여러 줄 칸
export function isLong(body, name) { return String(body || '').split('\n').some(l => l.trim() === `{{${name}}}`); }
export function fill(body, vals = {}) { return String(body || '').replace(VAR, (_, k) => String(vals[k] ?? '').trim() || `[${k}]`); }

// ── 상태 ──
const S = { list: [], me: null, bank: null, cat: '전체', q: '', loaded: false, error: '', mine: null, folder: '전체' };
const vals = store.get('vals', {});
const saveVals = () => store.set('vals', vals);
const active = () => !!(S.me && S.me.active);
const forever = () => active() && isForever(S.me.paid_until);

async function loadMe() {
  const tok = store.get('token', '');
  if (!tok) { S.me = null; return; }
  try { S.me = await rpc('ps_me', { p_token: tok }); if (!S.me) store.del('token'); } catch { }
}
async function ensureMe() {
  if (S.me) return S.me;
  S.me = await rpc('ps_join'); store.set('token', S.me.token); return S.me;
}
async function loadAll() {
  try {
    const [list] = await Promise.all([rpc('ps_catalog', { p_lang: 'ko' }), loadMe()]);
    S.list = list || []; S.loaded = true; S.error = '';
  } catch (e) { S.error = '틀을 불러오지 못했어요. 인터넷을 확인하고 다시 열어 주세요.'; S.loaded = true; }
}

// ── 시트(아래에서 올라오는 창) ──
let closeSheet = null;
function sheet(build, { wide = false, onClose } = {}) {
  if (closeSheet) closeSheet(true);
  const root = $('#sheet-root');
  const panel = h('section.sheet' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' });
  const back = h('div.scrim', { onclick: () => close() });
  const wrap = h('div.sheet-wrap', {}, back, panel);
  const close = (instant) => {
    if (closeSheet !== close) return; closeSheet = null; onClose && onClose();
    document.removeEventListener('keydown', esc); document.body.classList.remove('locked');
    if (instant) return wrap.remove();
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260);
  };
  const esc = e => { if (e.key === 'Escape') close(); };
  closeSheet = close;
  panel.append(h('button.sheet-x', { 'aria-label': '닫기', onclick: () => close() }, ic('x')), ...[build(close)].flat());
  root.append(wrap); document.body.classList.add('locked'); document.addEventListener('keydown', esc);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
  return close;
}

// ── 화면 ──
function statusPill() {
  const on = active();
  return h('a.pill' + (on ? '.on' : ''), { href: '#me' }, ic('user'), '마이페이지', h('i.state' + (on ? '.on' : ''), { title: on ? '구독 중' : '무료' }));
}
function cats() { return ['전체', ...new Set(S.list.map(t => t.cat)), '무료']; }
function shown() {
  const q = S.q.trim().toLowerCase();
  return S.list.filter(t => (S.cat === '전체' || (S.cat === '무료' ? t.free : t.cat === S.cat))
    && (!q || (t.title + ' ' + t.summary + ' ' + t.cat).toLowerCase().includes(q)));
}
function card(t) {
  const locked = !t.free && !active();
  return h('button.card' + (locked ? '.locked' : ''), { onclick: () => openTemplate(t), 'data-id': t.id },
    h('div.card-top', {}, h('span.cat', {}, t.cat), t.free ? h('span.badge.free', {}, '무료') : locked ? h('span.badge', {}, ic('lock'), '구독') : null),
    h('strong.card-title', {}, t.title),
    h('span.card-sum', {}, t.summary));
}
function renderGrid() {
  const g = $('#grid'); if (!g) return;
  const items = shown();
  g.replaceChildren(...(items.length ? items.map(card) : [h('p.empty', {}, S.q ? `"${S.q}"에 맞는 틀이 없어요.` : '틀이 아직 없어요.')]));
}
function renderChips() {
  const c = $('#chips'); if (!c) return;
  c.replaceChildren(...cats().map(name => h('button.chip' + (name === S.cat ? '.on' : ''), { onclick: () => { S.cat = name; renderChips(); renderGrid(); } }, name)));
}
function render() {
  if (location.hash === '#admin') return renderAdmin();
  if (location.hash.startsWith('#me')) return renderMe(location.hash.split('/')[1] || 'saves');
  const app = $('#app');
  const total = S.list.length, free = S.list.filter(t => t.free).length;
  app.replaceChildren(
    h('header.top', {}, h('a.brand', { href: './' }, h('img', { src: 'icon.svg', alt: '' }), h('span', {}, '프롬프트 스튜디오')), statusPill()),
    h('section.hero', {},
      h('h1', {}, '빈칸만 채우면', h('br'), '바로 쓰는 프롬프트'),
      h('p.lead', {}, 'Claude, ChatGPT, Gemini 어디에나 붙여 넣으면 돼요. 무엇을 어떻게 물어야 할지 고민하는 시간을 줄여 드려요.'),
      h('div.stats', {},
        h('div.stat', {}, ic('stack'), h('b', {}, total || '–'), h('span', {}, '틀')),
        h('div.stat', {}, ic('gift'), h('b', {}, free || '–'), h('span', {}, '무료')),
        h('div.stat', {}, ic('coin'), h('b', {}, '2,900'), h('span', {}, '원 / 월'))),
      active() ? null : h('button.cta', { onclick: () => paySheet() }, '월 2,900원으로 전부 열기')),
    h('section.tools', {},
      h('label.search', {}, ic('search'), h('input', { type: 'search', placeholder: '무엇을 하려고 하나요? 예: 자소서, 캡션', value: S.q, oninput: e => { S.q = e.target.value; renderGrid(); } })),
      h('div.chips#chips')),
    S.error ? h('p.error', {}, S.error) : h('section.grid#grid'),
    h('footer.foot', {},
      h('div', {}, h('b', {}, '결제는 어떻게 하나요?'), h('p', {}, '계좌 이체로 받아요. 입금자명에 내 입금 코드를 적으면 보통 1분 안에 자동으로 열려요. 카드 결제는 준비 중이에요.')),
      h('div', {}, h('b', {}, '다른 기기에서도 쓸 수 있나요?'), h('p', {}, '마이페이지 › 구독에서 복구 코드를 복사해 다른 기기에 넣으면 보관함까지 그대로 이어져요. 로그인은 따로 없어요.')),
      h('div', {}, h('b', {}, '자동으로 다시 결제되나요?'), h('p', {}, '아니요. 이체한 기간만큼만 열리고, 끝나기 전에 다시 이체하면 그 뒤로 이어 붙어요.')),
      h('p.fine', {}, '© 프롬프트 스튜디오')));
  renderChips(); renderGrid();
}

// 틀 열기
async function openTemplate(t, save = null) {
  if (!t.free && !active()) return lockedSheet(t);
  let body = t.body;
  if (body == null) {
    try { body = await rpc('ps_body', { p_token: store.get('token', ''), p_id: t.id }); } catch { }
    if (body == null) { await loadMe(); render(); return lockedSheet(t); }
    t.body = body;
  }
  const v = save ? { ...(save.vals || {}) } : (vals[t.id] || (vals[t.id] = {}));
  const keep = () => { if (!save) saveVals(); };
  const names = vars(body);
  sheet(close => {
    const pre = h('pre.preview');
    const paint = () => {
      pre.replaceChildren(...String(body).split(VAR).map((part, i) => i % 2 ? (String(v[part] ?? '').trim() ? h('mark.filled', {}, v[part].trim()) : h('mark.blank', {}, part)) : part));
      const left = names.filter(n => !String(v[n] ?? '').trim()).length;
      $('#left') && ($('#left').textContent = left ? `빈칸 ${left}개 남음` : '다 채웠어요');
    };
    const fields = names.map(n => {
      const long = isLong(body, n);
      const input = h(long ? 'textarea' : 'input', { id: 'f-' + n, rows: long ? 4 : null, placeholder: long ? '여기에 붙여 넣어요' : '', oninput: e => { v[n] = e.target.value; keep(); paint(); } });
      input.value = v[n] || '';
      return h('label.field', {}, h('span', {}, n), input);
    });
    const doCopy = () => copy(fill(body, v), '프롬프트를 복사했어요');
    const open = (url, name) => { copy(fill(body, v), `복사했어요. ${name}에 붙여 넣으세요`); window.open(url, '_blank', 'noopener'); };
    const box = saveBox(t, body, v, save, close);
    paint();
    return [
      h('div.sheet-head', {}, h('span.cat', {}, save ? `보관함 · ${save.folder || '폴더 없음'}` : t.cat), h('h2', {}, save ? save.title : t.title), h('p.muted', {}, save ? t.title : t.summary)),
      h('div.tpl', {},
        h('div.fields', {}, h('div.fields-head', {}, h('b', {}, '빈칸 채우기'), h('span.muted#left')), ...fields,
          names.length ? h('button.link', { onclick: () => { for (const n of names) v[n] = ''; keep(); for (const el of document.querySelectorAll('.field input, .field textarea')) el.value = ''; paint(); } }, '모두 지우기') : null),
        h('div.prev', {}, h('b', {}, '미리 보기'), pre)),
      h('div.actions', {},
        h('button.btn.primary', { onclick: doCopy }, ic('copy'), '복사'),
        h('button.btn', { onclick: () => box.toggle() }, ic('bookmark'), save ? '저장' : '보관'),
        h('button.btn', { onclick: () => open('https://claude.ai/new', 'Claude') }, ic('out'), 'Claude'),
        h('button.btn', { onclick: () => open('https://chatgpt.com/', 'ChatGPT') }, ic('out'), 'ChatGPT'),
        h('button.btn', { onclick: () => open('https://gemini.google.com/app', 'Gemini') }, ic('out'), 'Gemini')),
      box.el,
    ];
  }, { wide: true });
}

function lockedSheet(t) {
  sheet(close => [
    h('div.sheet-head', {}, h('span.cat', {}, t.cat), h('h2', {}, t.title), h('p.muted', {}, t.summary)),
    h('div.blur', { 'aria-hidden': 'true' }, ...[92, 78, 85, 40, 88, 70, 60].map(w => h('i', { style: { width: w + '%' } }))),
    h('div.lockbox', {}, ic('lock'), h('b', {}, '구독하면 바로 열려요'), h('p.muted', {}, `틀 ${S.list.length}개를 전부 쓸 수 있어요. 정가 9,900원에서 할인해 한 달 2,900원.`),
      h('button.cta', { onclick: () => { close(true); paySheet(); } }, '구독하기')),
  ]);
}

// 결제(이체) 창
let poll = null;
async function paySheet(planId = store.get('plan', 'm1')) {
  if (forever()) return toast('평생 이용 중이라 결제할 필요가 없어요');
  let me;
  try { me = await ensureMe(); } catch { return toast('잠시 후 다시 눌러 주세요'); }
  if (!S.bank) { try { S.bank = await rpc('ps_bank'); } catch { S.bank = {}; } }
  const b = S.bank || {}, ready = !!(b.bank && b.account);
  let plan = PLANS.find(p => p.id === planId) || PLANS[0];
  const startedActive = active(), startUntil = me.paid_until;
  sheet(close => {
    const amount = h('b.amount', {}, won(plan.price));
    const planBtns = PLANS.map(p => h('button.plan' + (p.id === plan.id ? '.on' : ''), { onclick: e => {
      plan = p; store.set('plan', p.id); amount.textContent = won(p.price);
      for (const el of e.currentTarget.parentNode.children) el.classList.toggle('on', el === e.currentTarget);
    } }, h('span', {}, p.label), p.list ? h('s.list', {}, won(p.list)) : null, h('b', {}, won(p.price)), p.list ? h('em', {}, `${Math.round((1 - p.price / p.list) * 100)}% 할인`) : null));
    const wait = h('div.wait', {}, h('span.dot'), h('span', {}, '입금을 기다리는 중이에요. 이 창을 열어 두면 열리는 순간 알려 드려요.'));
    clearInterval(poll);
    poll = setInterval(async () => {
      if (document.hidden) return;
      await loadMe();
      if (S.me && S.me.active && (!startedActive || S.me.paid_until !== startUntil)) {
        clearInterval(poll); wait.className = 'wait done'; wait.replaceChildren(ic('check'), h('span', {}, `열렸어요! ${ymd(S.me.paid_until)}까지 전부 쓸 수 있어요.`));
        render(); setTimeout(() => close(), 1800);
      }
    }, 5000);
    return [
      h('div.sheet-head', {}, h('h2', {}, startedActive ? '기간 늘리기' : '구독하기'), h('p.muted', {}, '계좌 이체로 받아요. 자동으로 다시 빠져나가지 않아요.')),
      h('div.plans' + (PLANS.length === 1 ? '.one' : ''), {}, ...planBtns),
      h('ol.steps', {},
        h('li', {}, h('div', {}, h('b', {}, '받는 분 통장 표시(입금자명)에 이 코드를 적어요'), h('p.muted', {}, '이름 대신 코드만 적으면 돼요. 이 코드로 누가 보냈는지 알아봐요.')),
          h('button.code', { onclick: () => copy(me.code, '입금 코드를 복사했어요') }, h('span', {}, me.code), ic('copy'))),
        h('li', {}, h('div', {}, h('b', {}, '이 계좌로 ', amount, '을 보내요')),
          ready ? h('button.acct', { onclick: () => copy(`${b.bank} ${b.account}`, '계좌를 복사했어요') }, h('span', {}, `${b.bank} ${b.account}`), b.holder ? h('em', {}, b.holder) : null, ic('copy'))
            : h('p.warn', {}, '계좌를 준비하고 있어요. 조금 뒤에 다시 열어 주세요.')),
        h('li', {}, h('div', {}, h('b', {}, '끝! 보통 1분 안에 자동으로 열려요'), h('p.muted', {}, '코드를 빼먹었거나 금액이 달라도 확인해서 열어 드려요.')), wait)),
      h('button.link.gift-link', { onclick: () => giftSheet() }, ic('gift'), '기프트 키가 있나요?'),
    ];
  }, { onClose: () => clearInterval(poll) });
}

// 기프트 키 넣기 (한 달 무료·평생 무료 등)
const GIFT_WHY = { format: '키 모양이 달라요. XXXX-XXXX-XXXX 꼴이에요', none: '없는 키예요. 글자를 다시 확인해 주세요', expired: '기한이 지난 키예요', used: '이미 다 쓴 키예요', mine: '이미 이 기기에서 쓴 키예요' };
async function redeem(key) {
  const r = await rpc('ps_redeem', { p_token: store.get('token', ''), p_key: key });
  if (r && r.token) store.set('token', r.token);
  if (!r || !r.ok) return { ok: false, msg: GIFT_WHY[r && r.why] || '잠시 후 다시 해 주세요' };
  await loadMe(); S.mine = null;
  return { ok: true, msg: r.forever ? '평생 무료로 열렸어요! 틀을 전부 쓸 수 있어요' : `${r.days}일 무료가 들어왔어요. ${ymd(r.paid_until)}까지 전부 쓸 수 있어요` };
}
function giftSheet(prefill = '') {
  sheet(close => {
    const input = h('input.gift-in', { placeholder: 'XXXX-XXXX-XXXX', value: prefill, autocapitalize: 'characters', spellcheck: 'false', autocomplete: 'off' });
    const msg = h('p.muted.small', {}, '받은 키를 넣으면 바로 열려요. 대소문자·띄어쓰기는 상관없어요.');
    const go = h('button.cta.gift-go', { onclick: async () => {
      if (!input.value.trim()) return input.focus();
      go.disabled = true;
      try {
        const r = await redeem(input.value);
        if (r.ok) { msg.className = 'wait done'; msg.replaceChildren(ic('check'), h('span', {}, r.msg)); render(); setTimeout(() => close(), 2200); }
        else { msg.className = 'warn'; msg.textContent = r.msg; go.disabled = false; }
      } catch { msg.className = 'warn'; msg.textContent = '잠시 후 다시 해 주세요'; go.disabled = false; }
    } }, '키 넣기');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    setTimeout(() => !prefill && input.focus(), 300);
    return [h('div.sheet-head', {}, h('div.gift-ic', {}, ic('gift')), h('h2', {}, '기프트 키'), h('p.muted', {}, '친구나 이벤트로 받은 키로 무료로 쓸 수 있어요.')), input, msg, go];
  });
}

// ── 보관함 ──
async function loadMine(force = false) {
  if (S.mine && !force) return S.mine;
  const tok = store.get('token', '');
  if (!tok) return (S.mine = { folders: [], saves: [], payments: [] });
  try { S.mine = (await rpc('ps_mine', { p_token: tok })) || { folders: [], saves: [], payments: [] }; } catch { S.mine = S.mine || { folders: [], saves: [], payments: [] }; }
  return S.mine;
}
const tname = id => (S.list.find(t => t.id === id) || {}).title || '';
const today = () => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}`; };

// 틀 창 안의 "보관" 칸: 이름과 폴더를 고르고 보관함에 넣음
function saveBox(t, body, v, save, closeSheet) {
  const el = h('div.savebox');
  let open = false, folder = save ? save.folder : (S.folder !== '전체' && S.folder !== '폴더 없음' ? S.folder : '');
  const paint = async () => {
    if (!open) return el.replaceChildren();
    const mine = await loadMine();
    const title = h('input', { value: save ? save.title : `${t.title} ${today()}`, maxlength: 80 });
    const newF = h('input', { placeholder: '새 폴더 이름', maxlength: 30 });
    const chips = h('div.chips.wrap');
    const paintChips = () => chips.replaceChildren(...['', ...mine.folders].map(f => h('button.chip' + (f === folder ? '.on' : ''), { onclick: () => { folder = f; paintChips(); } }, f ? [ic('folder'), f] : '폴더 없음')));
    paintChips();
    const addF = async () => {
      const name = newF.value.trim(); if (!name) return;
      const fresh = !mine.folders.includes(name);
      if (fresh) mine.folders.push(name);
      folder = name; newF.value = ''; paintChips();
      if (fresh) try { await ensureMe(); await rpc('ps_folders', { p_token: S.me.token, p_folders: mine.folders }); } catch { toast('폴더를 저장하지 못했어요'); }
    };
    const doSave = async () => {
      try {
        await ensureMe();
        if (folder && !(S.mine?.folders || []).includes(folder)) await rpc('ps_folders', { p_token: S.me.token, p_folders: [...(S.mine?.folders || []), folder] });
        const r = await rpc('ps_save', { p_token: S.me.token, p_item: { id: save?.id, title: title.value.trim() || t.title, template_id: t.id, folder, vals: v, text: fill(body, v), pinned: save?.pinned || false } });
        await loadMine(true); toast(folder ? `"${folder}" 폴더에 보관했어요` : '보관함에 넣었어요');
        if (save) { save.title = title.value.trim(); save.folder = folder; save.vals = { ...v }; closeSheet(); if (location.hash.startsWith('#me')) render(); }
        else { open = false; paint(); }
        return r;
      } catch (e) { toast(/full/.test(e.message) ? '보관함이 가득 찼어요 (500개)' : '잠시 후 다시 해 주세요'); }
    };
    el.replaceChildren(h('div.savebox-in', {},
      h('label.field', {}, h('span', {}, '이름'), title),
      h('div.field', {}, h('span', {}, '폴더'), chips, h('div.row', {}, newF, h('button.btn', { onclick: addF }, ic('plus'), '만들기'))),
      h('button.btn.primary', { onclick: doSave }, ic('bookmark'), save ? '바꾼 내용 저장' : '보관함에 넣기')));
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  return { el, toggle() { open = !open; paint(); } };
}

// ── 마이페이지 (#me/saves · #me/plan · #me/help) ──
const TABS = [['saves', '보관함', 'bookmark'], ['plan', '구독', 'card'], ['help', '도움말', 'help']];
async function renderMe(tab) {
  const app = $('#app');
  const top = h('header.top', {}, h('a.back', { href: '#', 'aria-label': '틀 목록으로' }, ic('back'), h('span', {}, '틀 목록')), h('b.top-title', {}, '마이페이지'), h('span.top-gap'));
  const tabs = h('nav.tabs', {}, ...TABS.map(([id, label, icon]) => h('a.tab' + (id === tab ? '.on' : ''), { href: '#me/' + id }, ic(icon), label)));
  const body = h('section.me-body');
  app.replaceChildren(top, tabs, body);
  if (!S.loaded) await loadAll();
  if (tab === 'plan') return renderPlan(body);
  if (tab === 'help') return renderHelp(body);
  return renderSaves(body);
}

async function renderSaves(root) {
  const mine = await loadMine(true);
  const folders = ['전체', ...mine.folders, '폴더 없음'];
  if (!folders.includes(S.folder)) S.folder = '전체';
  const count = f => f === '전체' ? mine.saves.length : mine.saves.filter(x => (f === '폴더 없음' ? !x.folder : x.folder === f)).length;
  const list = mine.saves.filter(x => S.folder === '전체' || (S.folder === '폴더 없음' ? !x.folder : x.folder === S.folder));
  const newF = h('input', { placeholder: '새 폴더 이름', maxlength: 30 });
  const saveFolders = async () => { await ensureMe(); await rpc('ps_folders', { p_token: S.me.token, p_folders: mine.folders }); };
  const addFolder = async () => {
    const name = newF.value.trim(); if (!name) return newF.focus();
    if (mine.folders.includes(name) || name === '전체' || name === '폴더 없음') return toast('같은 이름의 폴더가 있어요');
    mine.folders.push(name); await saveFolders(); S.folder = name; renderSaves(root);
  };
  // 고른 폴더 손보기: 이름 바꾸기·지우기
  let tools = null;
  if (mine.folders.includes(S.folder)) {
    const rn = h('input', { value: S.folder, maxlength: 30 });
    let armed = false;
    const del = h('button.btn.ghost', { onclick: async () => {
      if (!armed) { armed = true; del.lastChild.textContent = '한 번 더 누르면 지워요'; return; }
      const f = S.folder; mine.folders = mine.folders.filter(x => x !== f); await saveFolders(); await rpc('ps_move_folder', { p_token: S.me.token, p_from: f, p_to: '' });
      S.folder = '전체'; toast(`"${f}" 폴더를 지웠어요. 안의 것은 폴더 없음으로 옮겼어요`); renderSaves(root);
    } }, ic('trash'), h('span', {}, '폴더 지우기'));
    tools = h('div.ftools', {}, h('div.row', {}, rn, h('button.btn', { onclick: async () => {
      const to = rn.value.trim(), from = S.folder; if (!to || to === from) return;
      if (mine.folders.includes(to)) return toast('같은 이름의 폴더가 있어요');
      mine.folders = mine.folders.map(x => x === from ? to : x); await saveFolders(); await rpc('ps_move_folder', { p_token: S.me.token, p_from: from, p_to: to });
      S.folder = to; toast('폴더 이름을 바꿨어요'); renderSaves(root);
    } }, '이름 바꾸기')), del);
  }
  const item = x => {
    const t = S.list.find(y => y.id === x.template_id);
    const move = h('select', { 'aria-label': '폴더 옮기기', onchange: async e => { x.folder = e.target.value; await rpc('ps_save', { p_token: S.me.token, p_item: x }); toast(x.folder ? `"${x.folder}"로 옮겼어요` : '폴더에서 뺐어요'); renderSaves(root); } },
      ...['', ...mine.folders].map(f => h('option', { value: f, selected: f === (x.folder || '') }, f || '폴더 없음')));
    let armed = false;
    const del = h('button.icon-btn', { 'aria-label': '지우기', onclick: async () => {
      if (!armed) { armed = true; del.classList.add('armed'); toast('한 번 더 누르면 지워요'); setTimeout(() => { armed = false; del.classList.remove('armed'); }, 2500); return; }
      await rpc('ps_unsave', { p_token: S.me.token, p_id: x.id }); toast('지웠어요'); renderSaves(root);
    } }, ic('trash'));
    return h('article.save' + (x.pinned ? '.pinned' : ''), {},
      h('button.save-main', { onclick: () => t ? openTemplate(t, x) : copy(x.text, '복사했어요') },
        h('div.save-top', {}, h('span.cat', {}, x.folder ? [ic('folder'), x.folder] : '폴더 없음'), h('span.muted.small', {}, ymd(x.updated_at))),
        h('strong', {}, x.title), h('span.save-sub', {}, t ? t.title : '틀이 없어진 보관본'), h('p.save-text', {}, x.text.replace(/\s+/g, ' ').slice(0, 140))),
      h('div.save-acts', {},
        h('button.icon-btn', { 'aria-label': '복사', onclick: () => copy(x.text, '프롬프트를 복사했어요') }, ic('copy')),
        h('button.icon-btn' + (x.pinned ? '.on' : ''), { 'aria-label': '위에 고정', onclick: async () => { x.pinned = !x.pinned; await rpc('ps_save', { p_token: S.me.token, p_item: x }); renderSaves(root); } }, ic('pin')),
        h('label.move', {}, ic('folder'), move), del));
  };
  root.replaceChildren(...[
    h('div.stats', {},
      h('div.stat', {}, ic('bookmark'), h('b', {}, mine.saves.length), h('span', {}, '보관')),
      h('div.stat', {}, ic('folder'), h('b', {}, mine.folders.length), h('span', {}, '폴더')),
      h('div.stat', {}, ic(active() ? 'check' : 'lock'), h('b', {}, forever() ? '평생' : active() ? daysLeft() + '일' : '무료'), h('span', {}, forever() ? '이용' : active() ? '남음' : '이용 중'))),
    h('div.chips.folders', {}, ...folders.map(f => h('button.chip' + (f === S.folder ? '.on' : ''), { onclick: () => { S.folder = f; renderSaves(root); } }, f, h('em', {}, count(f))))),
    h('div.row.newf', {}, newF, h('button.btn', { onclick: addFolder }, ic('plus'), '폴더')),
    tools,
    list.length ? h('div.saves', {}, ...list.map(item))
      : h('div.empty-box', {}, ic('bookmark'), h('b', {}, mine.saves.length ? '이 폴더는 비어 있어요' : '아직 보관한 프롬프트가 없어요'),
        h('p.muted', {}, '틀을 열고 빈칸을 채운 뒤 "보관"을 누르면 여기에 모여요. 폴더로 나눠 둘 수 있어요.'), h('a.cta', { href: '#' }, '틀 고르러 가기'))].filter(Boolean));
}

const daysLeft = () => forever() ? Infinity : S.me && S.me.paid_until ? Math.max(0, Math.ceil((new Date(S.me.paid_until) - Date.now()) / 864e5)) : 0;
async function renderPlan(root) {
  await loadMe();
  const mine = await loadMine(true), me = S.me, on = active(), left = daysLeft();
  const inf = forever(), total = left > 31 ? 365 : 31, pct = inf ? 100 : on ? Math.min(100, Math.round(left / total * 100)) : 0;
  const input = h('input', { placeholder: '복구 코드 16자리', autocapitalize: 'characters', spellcheck: 'false' });
  const use = async () => {
    const tok = input.value.replace(/\s/g, '').toUpperCase();
    if (tok.length < 12) return toast('복구 코드를 확인해 주세요');
    try { const m = await rpc('ps_me', { p_token: tok }); if (!m) return toast('맞는 코드가 없어요'); store.set('token', tok); S.me = m; S.mine = null; toast(m.active ? '구독과 보관함을 이어 왔어요' : '코드를 넣었어요'); renderPlan(root); }
    catch { toast('잠시 후 다시 해 주세요'); }
  };
  root.replaceChildren(...[
    h('div.plan-card' + (on ? '.on' : ''), {},
      h('div.ring', { style: { '--p': pct } }, h('b', {}, inf ? '∞' : on ? left : 0), h('span', {}, inf ? '평생' : '일 남음')),
      h('div', {},
        h('b.plan-state', {}, inf ? '평생 이용' : on ? '구독 중' : me && me.paid_until ? '구독이 끝났어요' : '무료로 쓰는 중'),
        h('p.muted', {}, inf ? `틀 ${S.list.length}개를 기간 없이 전부 쓸 수 있어요.` : on ? `${ymd(me.paid_until)}까지 틀 ${S.list.length}개를 전부 쓸 수 있어요.` : `무료 틀 ${S.list.filter(t => t.free).length}개를 쓸 수 있어요. 구독하면 ${S.list.length}개 전부 열려요.`),
        inf ? null : h('button.cta.small', { onclick: () => paySheet() }, on ? '기간 늘리기' : '월 2,900원 구독하기'))),
    inf ? null : h('p.muted.small.note', {}, '자동으로 다시 빠져나가지 않아요. 끝나기 전에 늘리면 남은 기간 뒤에 이어 붙어요.'),
    me ? h('div.me', {},
      h('div.me-row', {}, h('span.muted', {}, '입금 코드'), h('button.code.small', { onclick: () => copy(me.code, '입금 코드를 복사했어요') }, h('span', {}, me.code), ic('copy'))),
      h('div.me-row', {}, h('span.muted', {}, '복구 코드'), h('button.code.small', { onclick: () => copy(me.token, '복구 코드를 복사했어요') }, h('span', {}, group4(me.token)), ic('copy'))),
      h('p.muted.small', {}, '복구 코드를 다른 기기에 넣으면 구독과 보관함이 그대로 이어져요. 남에게 알려 주지 마세요.')) : null,
    inf ? null : h('button.gift-row', { onclick: () => giftSheet() }, ic('gift'), h('span', {}, h('b', {}, '기프트 키 넣기'), h('em', {}, '한 달 무료·평생 무료 키가 있으면 여기에')), ic('back', 'flip')),
    h('h3', {}, '결제 내역'),
    mine.payments.length ? h('div.pays', {}, ...mine.payments.map(p => h('div.pay', {}, h('span', {}, ymd(p.created_at)), h('b', {}, won(p.amount)), h('span.muted', {}, `+${p.days}일`))))
      : h('p.muted', {}, '아직 결제 내역이 없어요.'),
    h('h3', {}, '다른 기기에서 쓰던 게 있나요?'),
    h('div.row', {}, input, h('button.btn', { onclick: use }, '넣기'))].filter(Boolean));
}

// ── 도움말 · 첫 방문 안내 · 홈 화면에 추가 ──
const GUIDE = [
  ['stack', '틀 고르기', '하고 싶은 일을 검색하거나 분류를 눌러 틀을 골라요. 무료 틀은 바로 열려요.'],
  ['help', '빈칸 채우기', '왼쪽 칸만 채우면 오른쪽 미리 보기에 바로 들어가요. 채운 내용은 이 기기에 남아 있어요.'],
  ['copy', '복사하고 붙여 넣기', '"복사"를 누르거나 Claude·ChatGPT·Gemini 단추를 누르면 복사된 채로 그 사이트가 열려요. 붙여 넣기만 하면 돼요.'],
  ['bookmark', '보관하고 폴더로 정리', '"보관"을 누르면 마이페이지 보관함에 모여요. 폴더를 만들어 나눠 두고, 다시 열어 고쳐 쓸 수 있어요.'],
];
function device() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'pc';
}
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
const INSTALL = {
  ios: ['아이폰·아이패드', ['Safari로 이 주소를 열어요 (카카오톡·인스타 안에서는 안 돼요)', '아래 가운데 공유 단추(네모에 위 화살표)를 눌러요', '"홈 화면에 추가"를 누르고 오른쪽 위 "추가"를 눌러요']],
  android: ['안드로이드', ['Chrome으로 이 주소를 열어요', '오른쪽 위 점 세 개 메뉴를 눌러요', '"앱 설치" 또는 "홈 화면에 추가"를 눌러요']],
  pc: ['PC (Chrome·Edge)', ['주소창 오른쪽 끝의 설치 단추(모니터에 화살표)를 눌러요', '없으면 오른쪽 위 메뉴 › "앱 설치" 또는 "앱 › 이 사이트를 앱으로 설치"', '바탕화면·작업 표시줄에서 앱처럼 열려요']],
};
function installBlock(compact = false) {
  const d = device();
  const order = [d, ...Object.keys(INSTALL).filter(k => k !== d)];
  const one = (k, open) => h('details.install' + (open ? '.mine' : ''), { open: open || null },
    h('summary', {}, ic('home'), INSTALL[k][0], open ? h('em', {}, '지금 기기') : null),
    h('ol', {}, ...INSTALL[k][1].map(s => h('li', {}, s))));
  return h('div.installs', {},
    standalone() ? h('p.okline', {}, ic('check'), '지금 앱으로 쓰고 있어요.') : null,
    deferredInstall ? h('button.cta.small', { onclick: async () => { deferredInstall.prompt(); const r = await deferredInstall.userChoice; deferredInstall = null; toast(r.outcome === 'accepted' ? '설치했어요' : '나중에 언제든 할 수 있어요'); } }, ic('home'), '바로 설치하기') : null,
    ...(compact ? [one(d, true)] : order.map((k, i) => one(k, i === 0))));
}
function renderHelp(root) {
  root.replaceChildren(
    h('h3', {}, '이렇게 써요'),
    h('ol.guide-steps', {}, ...GUIDE.map(([icon, t, d]) => h('li', {}, h('span.gico', {}, ic(icon)), h('div', {}, h('b', {}, t), h('p.muted', {}, d))))),
    h('button.btn', { onclick: () => onboarding(true) }, '처음 안내 다시 보기'),
    h('h3', {}, '홈 화면에 추가해서 앱처럼 쓰기'),
    h('p.muted', {}, '설치는 무료이고, 앱 스토어를 거치지 않아요. 홈 화면 아이콘으로 바로 열려요.'),
    installBlock(),
    h('h3', {}, '자주 묻는 것'),
    ...[
      ['결제는 어떻게 하나요?', '계좌 이체로 받아요. 입금자명에 내 입금 코드를 적으면 보통 1분 안에 자동으로 열려요.'],
      ['자동으로 다시 결제되나요?', '아니요. 이체한 기간만큼만 열리고, 끝나기 전에 늘리면 남은 기간 뒤에 이어 붙어요.'],
      ['폰과 PC에서 같이 쓰고 싶어요', '마이페이지 › 구독에서 복구 코드를 복사해 다른 기기의 같은 칸에 넣으면 구독과 보관함이 이어져요.'],
      ['코드를 빼먹고 입금했어요', '걱정 마세요. 입금 내역을 보고 확인해서 열어 드려요.'],
      ['보관한 건 어디에 저장되나요?', '서버에 복구 코드 기준으로 저장돼요. 복구 코드만 있으면 기기를 바꿔도 남아 있어요.'],
    ].map(([q, a]) => h('details.faq', {}, h('summary', {}, q), h('p', {}, a))));
}

// 처음 온 사람에게 한 번 보여 주는 안내
function onboarding(force = false) {
  if (!force && store.get('onboarded', false)) return;
  const slides = [...GUIDE.map(([icon, t, d]) => ({ icon, t, d })), { icon: 'home', t: '홈 화면에 추가하면 앱처럼', d: '설치는 무료예요. 지금 기기에 맞는 방법이에요.', install: true }];
  let i = 0;
  sheet(close => {
    const stage = h('div.ob-stage'), dots = h('div.ob-dots'), next = h('button.cta'), skip = h('button.link', { onclick: () => close() }, '건너뛰기');
    const paint = () => {
      const s = slides[i];
      stage.replaceChildren(h('div.ob-slide', { key: i },
        h('span.ob-ico', {}, ic(s.icon)), h('span.muted.small', {}, `${i + 1} / ${slides.length}`), h('h2', {}, s.t), h('p.muted', {}, s.d), s.install ? installBlock(true) : null));
      dots.replaceChildren(...slides.map((_, k) => h('i' + (k === i ? '.on' : ''))));
      next.textContent = i === slides.length - 1 ? '시작하기' : '다음';
    };
    next.onclick = () => { if (i < slides.length - 1) { i++; paint(); } else close(); };
    paint();
    return [stage, h('div.ob-foot', {}, dots, h('div.row', {}, skip, next))];
  }, { onClose: () => store.set('onboarded', true) });
}

// ── 관리 화면 (#admin): 하진만. 입금 알림 비밀키로 들어감 ──
async function renderAdmin() {
  const app = $('#app');
  const secret = store.get('admin', '');
  const top = h('header.top', {}, h('a.brand', { href: './' }, h('img', { src: 'icon.svg', alt: '' }), h('span', {}, '스튜디오 관리')), h('a.pill', { href: './' }, '손님 화면'));
  if (!secret) {
    const input = h('input', { type: 'password', placeholder: '입금 알림 비밀키' });
    app.replaceChildren(top, h('section.admin', {}, h('h2', {}, '관리 화면'), h('p.muted', {}, '비밀키는 이 기기에만 저장돼요.'),
      h('div.row', {}, input, h('button.btn.primary', { onclick: async () => { try { await rpc('ps_admin', { p_secret: input.value.trim() }); store.set('admin', input.value.trim()); renderAdmin(); } catch { toast('비밀키가 맞지 않아요'); } } }, '들어가기'))));
    return;
  }
  let d, bank;
  try { [d, bank] = await Promise.all([rpc('ps_admin', { p_secret: secret }), rpc('ps_bank')]); }
  catch { store.del('admin'); toast('다시 들어와 주세요'); return renderAdmin(); }
  const grant = async (code, days, dep) => {
    if (!code || !days) return toast('코드와 기간을 넣어 주세요');
    const r = await rpc('ps_admin_grant', { p_secret: secret, p_code: code, p_days: +days, p_deposit: dep ?? null });
    toast(r && r.ok ? `${r.code} → ${ymd(r.until)}까지` : '그런 코드가 없어요'); renderAdmin();
  };
  const daysOf = a => Math.floor((a || 0) / 2900) * 31;
  const paste = h('textarea', { rows: 3, placeholder: '은행 앱 입금 알림을 그대로 붙여 넣어요. 예: [토스뱅크] 입금 2,900원 K7M2' });
  const fb = { bank: h('input', { placeholder: '은행 (예: 토스뱅크)', value: bank?.bank || '' }), account: h('input', { placeholder: '계좌번호', value: bank?.account || '' }), holder: h('input', { placeholder: '예금주 (예: 김*진)', value: bank?.holder || '' }) };
  const gCode = h('input', { placeholder: '코드 K7M2', autocapitalize: 'characters' }), gDays = h('input', { type: 'number', placeholder: '일 수' });
  const hook = `${SB.url}/rest/v1/rpc/ps_deposit`;
  app.replaceChildren(top, h('section.admin', {},
    h('div.stats', {}, h('div.stat', {}, ic('check'), h('b', {}, d.active), h('span', {}, '구독 중')), h('div.stat', {}, ic('user'), h('b', {}, d.customers), h('span', {}, '코드 받은 사람')),
      h('div.stat', {}, ic('coin'), h('b', {}, won(d.deposits.filter(x => x.matched && new Date(x.created_at).getMonth() === new Date().getMonth()).reduce((s, x) => s + (x.amount || 0), 0))), h('span', {}, '이번 달 입금'))),
    h('h3', {}, '입금 알림 붙여 넣기'), h('p.muted', {}, '자동 연결 전이거나 알림이 안 왔을 때 여기에 붙여 넣으면 같은 규칙으로 처리해요.'), paste,
    h('button.btn.primary', { onclick: async () => { if (!paste.value.trim()) return; const r = await rpc('ps_deposit', { p_secret: secret, p_msg: paste.value }); toast(r.ok ? (r.dup ? '이미 처리한 알림이에요' : `${r.code} ${r.days}일 열었어요`) : '코드를 못 찾았어요. 아래에서 직접 열어 주세요'); renderAdmin(); } }, '처리하기'),
    h('h3', {}, '최근 입금'),
    d.deposits.length ? h('div.deps', {}, ...d.deposits.map(x => {
      const c = h('input', { placeholder: '코드', value: x.code || '' });
      return h('div.dep' + (x.matched ? '' : '.miss'), {},
        h('div', {}, h('b', {}, x.amount ? won(x.amount) : '금액 없음'), h('span.muted', {}, ` ${new Date(x.created_at).toLocaleString('ko-KR')}`), h('p.raw', {}, x.raw)),
        x.matched ? h('span.ok', {}, ic('check'), `${x.code} · ${x.days}일`) : h('div.row', {}, c, h('button.btn', { onclick: () => grant(c.value.trim().toUpperCase(), daysOf(x.amount) || 31, x.id) }, '열기')));
    })) : h('p.muted', {}, '아직 없어요.'),
    h('h3', {}, '직접 기간 주기'), h('div.row', {}, gCode, gDays, h('button.btn', { onclick: () => grant(gCode.value.trim().toUpperCase(), gDays.value) }, '주기')),
    giftAdmin(secret),
    h('h3', {}, '손님에게 보이는 계좌'), h('div.col', {}, fb.bank, fb.account, fb.holder,
      h('button.btn.primary', { onclick: async () => { for (const k of Object.keys(fb)) await rpc('ps_admin_set', { p_secret: secret, p_k: k, p_v: fb[k].value.trim() }); S.bank = null; toast('계좌를 저장했어요'); } }, '저장')),
    h('h3', {}, '입금 알림 자동 연결'),
    h('div.guide', {},
      h('p', {}, '폰이 입금 알림을 받으면 아래 주소로 알림 글을 보내게 하면 돼요. 손님 코드와 금액을 찾아 자동으로 열어요.'),
      h('dl', {}, h('dt', {}, '주소 (POST)'), h('dd.mono', {}, hook), h('dt', {}, '헤더'), h('dd.mono', {}, `apikey: ${SB.key}`, h('br'), 'Content-Type: application/json'),
        h('dt', {}, '본문'), h('dd.mono', {}, '{"p_secret":"비밀키", "p_msg":"알림 글"}')),
      h('p', {}, h('b', {}, '아이폰'), ' 단축어 › 자동화 › 메시지 › "입금"이 들어간 메시지 받으면 › 바로 실행 › "URL 콘텐츠 가져오기"(방법 POST, 위 헤더, JSON 본문의 p_msg에 메시지). 은행 입금 알림을 문자로 받아야 해요.'),
      h('p', {}, h('b', {}, '안드로이드'), ' MacroDroid(무료) › 트리거 "알림 수신"(은행 앱, "입금" 포함) › 동작 "HTTP 요청"(POST, 위 헤더, 본문에 [notification_text]).'),
      h('button.btn', { onclick: () => copy(JSON.stringify({ url: hook, apikey: SB.key, body: { p_secret: secret, p_msg: '' } }, null, 1), '연결 정보를 복사했어요') }, ic('copy'), '연결 정보 복사 (비밀키 포함)')),
    h('button.link', { onclick: () => { store.del('admin'); renderAdmin(); } }, '이 기기에서 나가기')));
}

// 관리: 기프트 키 만들기·목록
const GIFT_URL = k => new URL('./?gift=' + k, location.href.split('#')[0].split('?')[0]).href;
function giftAdmin(secret) {
  const box = h('div.gifts');
  let kind = 31;
  const kinds = [[31, '한 달 무료'], [0, '평생 무료'], [-1, '직접 일 수']];
  const days = h('input', { type: 'number', min: 1, placeholder: '일 수', style: { display: 'none' } });
  const kindBtns = h('div.chips', {}, ...kinds.map(([v, l]) => h('button.chip' + (v === kind ? '.on' : ''), { onclick: e => {
    kind = v; days.style.display = v === -1 ? '' : 'none';
    for (const el of e.currentTarget.parentNode.children) el.classList.toggle('on', el === e.currentTarget);
  } }, l)));
  const count = h('input', { type: 'number', min: 1, max: 100, value: 1, 'aria-label': '키 개수' });
  const uses = h('input', { type: 'number', min: 1, value: 1, 'aria-label': '한 키로 쓸 수 있는 사람 수' });
  const note = h('input', { placeholder: '메모 (예: 민서 선물, 11월 이벤트)' });
  const made = h('div');
  const line = (k, meta, del) => h('div.gkey', {}, h('div.gk-l', {}, h('code', {}, k), meta), h('div.gk-r', {}, del,
    h('button.icon-btn', { 'aria-label': '키 복사', onclick: () => copy(k, '키를 복사했어요') }, ic('copy')),
    h('button.icon-btn', { 'aria-label': '링크 복사', onclick: () => copy(GIFT_URL(k), '바로 열리는 링크를 복사했어요') }, ic('out'))));
  const list = async () => {
    let gs = []; try { gs = await rpc('ps_admin_gifts', { p_secret: secret }) || []; } catch { }
    box.replaceChildren(...(gs.length ? gs.map(g => line(g.key, h('span.gmeta', {}, h('b', {}, g.days ? `${g.days}일` : '평생'), ` ${g.used}/${g.max_uses}명`, g.note ? h('em', {}, g.note) : null),
      g.used ? null : h('button.icon-btn', { 'aria-label': '지우기', onclick: async () => { await rpc('ps_admin_gift_del', { p_secret: secret, p_key: g.key }); toast('지웠어요'); list(); } }, ic('trash')))) : [h('p.muted', {}, '아직 만든 키가 없어요.')]));
  };
  const make = async () => {
    const d = kind === -1 ? +days.value : kind;
    if (kind === -1 && !(d > 0)) return toast('일 수를 넣어 주세요');
    try {
      const keys = await rpc('ps_admin_gift_make', { p_secret: secret, p_days: d, p_count: Math.min(100, Math.max(1, +count.value || 1)), p_max_uses: Math.max(1, +uses.value || 1), p_note: note.value.trim() });
      made.replaceChildren(h('p.ok-line', {}, ic('check'), `${keys.length}개 만들었어요. 키나 링크를 보내 주면 돼요.`),
        h('button.btn', { onclick: () => copy(keys.join('\n'), '키를 모두 복사했어요') }, ic('copy'), '키 모두 복사'),
        h('button.btn', { onclick: () => copy(keys.map(GIFT_URL).join('\n'), '링크를 모두 복사했어요') }, ic('out'), '링크 모두 복사'));
      note.value = ''; list();
    } catch { toast('만들지 못했어요. 서버를 확인해 주세요'); }
  };
  list();
  return h('div', {}, h('h3', {}, '기프트 키'),
    h('p.muted', {}, '한 달 무료나 평생 무료 키를 만들어 나눠 줘요. 링크를 보내면 누르기만 해도 키 창이 열려요.'),
    kindBtns, days,
    h('div.gift-form', {}, h('label', {}, h('span', {}, '개수'), count), h('label', {}, h('span', {}, '한 키로 몇 명'), uses)), note,
    h('button.btn.primary', { onclick: make }, ic('gift'), '키 만들기'), made, box);
}

// ── 시작 ──
addEventListener('hashchange', () => { if (closeSheet) closeSheet(true); render(); scrollTo(0, 0); });
addEventListener('visibilitychange', async () => { if (!document.hidden && location.hash !== '#admin' && S.loaded) { const was = active(); await loadMe(); if (was !== active()) render(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { });
render();
const giftParam = new URLSearchParams(location.search).get('gift');
if (giftParam) history.replaceState(null, '', location.pathname + location.hash);
loadAll().then(() => {
  render();
  if (giftParam) { store.set('onboarded', true); setTimeout(() => giftSheet(giftParam), 400); }
  else if (!location.hash) setTimeout(() => onboarding(), 400);
});
