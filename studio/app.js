// 프롬프트 스튜디오: 팀 앱과 따로 도는 유료 서비스 화면.
// 손님은 로그인 없이 "복구 코드"(이 기기에 저장)로 구분하고, 결제는 계좌 이체 + 입금 알림 자동 확인.
// 서버 구조와 함수는 supabase/studio.sql. 유료 틀 본문은 서버에서 구독 중인 손님에게만 내려옴.
const SB = { url: 'https://wuvqtfvvouweqxbydlqa.supabase.co', key: 'sb_publishable_dpHWxB26toO96sIiv4XlqA_lBmzrGGp' };
export const PLANS = [
  { id: 'm1', label: '1개월', price: 990, note: '' },
  { id: 'm3', label: '3개월', price: 2970, note: '' },
  { id: 'y1', label: '1년', price: 9900, note: '2개월 무료' },
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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
const ymd = s => { const d = new Date(s); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };
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
const S = { list: [], me: null, bank: null, cat: '전체', q: '', loaded: false, error: '' };
const vals = store.get('vals', {});
const saveVals = () => store.set('vals', vals);
const active = () => !!(S.me && S.me.active);

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
  return h('button.pill' + (on ? '.on' : ''), { onclick: accountSheet },
    ic(on ? 'check' : 'user'), on ? `구독 중 · ${ymd(S.me.paid_until)}까지` : '무료로 쓰는 중');
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
        h('div.stat', {}, ic('coin'), h('b', {}, '990'), h('span', {}, '원 / 월'))),
      active() ? null : h('button.cta', { onclick: () => paySheet() }, '월 990원으로 전부 열기')),
    h('section.tools', {},
      h('label.search', {}, ic('search'), h('input', { type: 'search', placeholder: '무엇을 하려고 하나요? 예: 자소서, 캡션', value: S.q, oninput: e => { S.q = e.target.value; renderGrid(); } })),
      h('div.chips#chips')),
    S.error ? h('p.error', {}, S.error) : h('section.grid#grid'),
    h('footer.foot', {},
      h('div', {}, h('b', {}, '결제는 어떻게 하나요?'), h('p', {}, '계좌 이체로 받아요. 입금자명에 내 입금 코드를 적으면 보통 1분 안에 자동으로 열려요. 카드 결제는 준비 중이에요.')),
      h('div', {}, h('b', {}, '다른 기기에서도 쓸 수 있나요?'), h('p', {}, '오른쪽 위 내 정보에서 복구 코드를 복사해 다른 기기에 넣으면 같이 열려요. 로그인은 따로 없어요.')),
      h('div', {}, h('b', {}, '자동으로 다시 결제되나요?'), h('p', {}, '아니요. 이체한 기간만큼만 열리고, 끝나기 전에 다시 이체하면 그 뒤로 이어 붙어요.')),
      h('p.fine', {}, '© 프롬프트 스튜디오')));
  renderChips(); renderGrid();
}

// 틀 열기
async function openTemplate(t) {
  if (!t.free && !active()) return lockedSheet(t);
  let body = t.body;
  if (body == null) {
    try { body = await rpc('ps_body', { p_token: store.get('token', ''), p_id: t.id }); } catch { }
    if (body == null) { await loadMe(); render(); return lockedSheet(t); }
    t.body = body;
  }
  const v = vals[t.id] || (vals[t.id] = {});
  const names = vars(body);
  sheet(() => {
    const pre = h('pre.preview');
    const paint = () => {
      pre.replaceChildren(...String(body).split(VAR).map((part, i) => i % 2 ? (String(v[part] ?? '').trim() ? h('mark.filled', {}, v[part].trim()) : h('mark.blank', {}, part)) : part));
      const left = names.filter(n => !String(v[n] ?? '').trim()).length;
      $('#left') && ($('#left').textContent = left ? `빈칸 ${left}개 남음` : '다 채웠어요');
    };
    const fields = names.map(n => {
      const long = isLong(body, n);
      const input = h(long ? 'textarea' : 'input', { id: 'f-' + n, rows: long ? 4 : null, placeholder: long ? '여기에 붙여 넣어요' : '', oninput: e => { v[n] = e.target.value; saveVals(); paint(); } });
      input.value = v[n] || '';
      return h('label.field', {}, h('span', {}, n), input);
    });
    const doCopy = () => copy(fill(body, v), '프롬프트를 복사했어요');
    const open = (url, name) => { copy(fill(body, v), `복사했어요. ${name}에 붙여 넣으세요`); window.open(url, '_blank', 'noopener'); };
    paint();
    return [
      h('div.sheet-head', {}, h('span.cat', {}, t.cat), h('h2', {}, t.title), h('p.muted', {}, t.summary)),
      h('div.tpl', {},
        h('div.fields', {}, h('div.fields-head', {}, h('b', {}, '빈칸 채우기'), h('span.muted#left')), ...fields,
          names.length ? h('button.link', { onclick: () => { for (const n of names) v[n] = ''; saveVals(); for (const el of document.querySelectorAll('.field input, .field textarea')) el.value = ''; paint(); } }, '모두 지우기') : null),
        h('div.prev', {}, h('b', {}, '미리 보기'), pre)),
      h('div.actions', {},
        h('button.btn.primary', { onclick: doCopy }, ic('copy'), '복사'),
        h('button.btn', { onclick: () => open('https://claude.ai/new', 'Claude') }, ic('out'), 'Claude'),
        h('button.btn', { onclick: () => open('https://chatgpt.com/', 'ChatGPT') }, ic('out'), 'ChatGPT'),
        h('button.btn', { onclick: () => open('https://gemini.google.com/app', 'Gemini') }, ic('out'), 'Gemini')),
    ];
  }, { wide: true });
}

function lockedSheet(t) {
  sheet(close => [
    h('div.sheet-head', {}, h('span.cat', {}, t.cat), h('h2', {}, t.title), h('p.muted', {}, t.summary)),
    h('div.blur', { 'aria-hidden': 'true' }, ...[92, 78, 85, 40, 88, 70, 60].map(w => h('i', { style: { width: w + '%' } }))),
    h('div.lockbox', {}, ic('lock'), h('b', {}, '구독하면 바로 열려요'), h('p.muted', {}, `틀 ${S.list.length}개를 전부 쓸 수 있어요. 한 달 990원.`),
      h('button.cta', { onclick: () => { close(true); paySheet(); } }, '구독하기')),
  ]);
}

// 결제(이체) 창
let poll = null;
async function paySheet(planId = store.get('plan', 'm1')) {
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
    } }, h('span', {}, p.label), h('b', {}, won(p.price)), p.note ? h('em', {}, p.note) : null));
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
      h('div.plans', {}, ...planBtns),
      h('ol.steps', {},
        h('li', {}, h('div', {}, h('b', {}, '받는 분 통장 표시(입금자명)에 이 코드를 적어요'), h('p.muted', {}, '이름 대신 코드만 적으면 돼요. 이 코드로 누가 보냈는지 알아봐요.')),
          h('button.code', { onclick: () => copy(me.code, '입금 코드를 복사했어요') }, h('span', {}, me.code), ic('copy'))),
        h('li', {}, h('div', {}, h('b', {}, '이 계좌로 ', amount, '을 보내요')),
          ready ? h('button.acct', { onclick: () => copy(`${b.bank} ${b.account}`, '계좌를 복사했어요') }, h('span', {}, `${b.bank} ${b.account}`), b.holder ? h('em', {}, b.holder) : null, ic('copy'))
            : h('p.warn', {}, '계좌를 준비하고 있어요. 조금 뒤에 다시 열어 주세요.')),
        h('li', {}, h('div', {}, h('b', {}, '끝! 보통 1분 안에 자동으로 열려요'), h('p.muted', {}, '코드를 빼먹었거나 금액이 달라도 확인해서 열어 드려요.')), wait)),
    ];
  }, { onClose: () => clearInterval(poll) });
}

// 내 정보
function accountSheet() {
  sheet(close => {
    const input = h('input', { placeholder: '복구 코드 16자리', autocapitalize: 'characters', spellcheck: 'false' });
    const use = async () => {
      const tok = input.value.replace(/\s/g, '').toUpperCase();
      if (tok.length < 12) return toast('복구 코드를 확인해 주세요');
      try { const me = await rpc('ps_me', { p_token: tok }); if (!me) return toast('맞는 코드가 없어요'); store.set('token', tok); S.me = me; close(); render(); toast(me.active ? '구독이 이어졌어요' : '코드를 넣었어요'); }
      catch { toast('잠시 후 다시 해 주세요'); }
    };
    const me = S.me;
    return [
      h('div.sheet-head', {}, h('h2', {}, '내 정보')),
      h('div.me', {},
        h('div.me-row', {}, h('span.muted', {}, '상태'), h('b', {}, active() ? `구독 중 · ${ymd(me.paid_until)}까지` : me && me.paid_until ? `${ymd(me.paid_until)}에 끝났어요` : '무료로 쓰는 중')),
        me ? h('div.me-row', {}, h('span.muted', {}, '입금 코드'), h('b.mono', {}, me.code)) : null,
        me ? h('div.me-row', {}, h('span.muted', {}, '복구 코드'), h('button.code.small', { onclick: () => copy(me.token, '복구 코드를 복사했어요') }, h('span', {}, group4(me.token)), ic('copy'))) : null,
        me ? h('p.muted.small', {}, '복구 코드가 있으면 다른 기기나 브라우저에서도 그대로 이어서 쓸 수 있어요. 남에게 알려 주지 마세요.') : null),
      h('button.cta', { onclick: () => { close(true); paySheet(); } }, active() ? '기간 늘리기' : '구독하기'),
      h('div.restore', {}, h('b', {}, '다른 기기에서 받은 복구 코드가 있나요?'), h('div.row', {}, input, h('button.btn', { onclick: use }, '넣기'))),
    ];
  });
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
  const daysOf = a => Math.floor((a || 0) / 9900) * 365 + Math.floor(((a || 0) % 9900) / 990) * 31;
  const paste = h('textarea', { rows: 3, placeholder: '은행 앱 입금 알림을 그대로 붙여 넣어요. 예: [토스뱅크] 입금 990원 K7M2' });
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

// ── 시작 ──
addEventListener('hashchange', render);
addEventListener('visibilitychange', async () => { if (!document.hidden && location.hash !== '#admin' && S.loaded) { const was = active(); await loadMe(); if (was !== active()) render(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { });
render();
loadAll().then(render);
