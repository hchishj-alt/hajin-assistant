// 구독: 상태, 잠금(needPro), 구독 관리 화면(#/plan), 관리 화면(#/admin)
// 구독 중 = 서버 pr_customers.paid_until > now(). 이 기기는 마지막 상태를 기억해 두고 열 때마다 새로 받는다.
import { SB, PRICE, FREE } from './config.js';
import { cardReady, startCard, finishRedirect } from './billing.js';
import { ic, esc, $, el, toast, sheet, copy, buzz } from './ui.js';

const LS = { token: 'prompter:token', me: 'prompter:me', admin: 'prompter:admin' };
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export async function rpc(fn, args = {}) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB.key, authorization: 'Bearer ' + SB.key, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const txt = await r.text();
  if (!r.ok) { let m = txt; try { m = JSON.parse(txt).message || txt; } catch {} throw new Error(m); }
  return txt ? JSON.parse(txt) : null;
}

let me = ls.get(LS.me);
const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function setMe(v) { me = v; if (v) { ls.set(LS.me, v); if (v.token) ls.set(LS.token, v.token); } listeners.forEach(f => f(me)); }
export const token = () => ls.get(LS.token);
const isForever = s => /infinity/i.test(String(s || ''));
export const isPro = () => !!me && (isForever(me.paid_until) || (me.paid_until && new Date(me.paid_until) > new Date()));
export const state = () => me;
const ymd = s => { if (isForever(s)) return '평생'; const d = new Date(s); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };
const md = s => { const d = new Date(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const group4 = s => String(s || '').replace(/(.{4})(?=.)/g, '$1 ');

export const limits = () => isPro() ? { scripts: Infinity, recSec: Infinity, voice: true } : FREE;

// 서버에서 새로 받기 (열 때, 구독 화면 들어갈 때)
export async function refresh() {
  const t = token(); if (!t) return me;
  try { const v = await rpc('pr_me', { p_token: t }); if (v) setMe(v); } catch {}
  return me;
}
async function ensureToken() {
  if (token()) return token();
  const v = await rpc('pr_join'); setMe(v); return v.token;
}

// 결제창에서 돌아온 경우, ?gift= 링크로 들어온 경우
export async function boot() {
  const q = new URLSearchParams(location.search);
  const gift = q.get('gift');
  if (gift) { history.replaceState(null, '', location.pathname + '#/plan'); sessionStorage.setItem('prompter:gift', gift); }
  if (q.get('after') === 'card') {
    try { const t = await ensureToken(); const v = await finishRedirect(t); if (v) { await refresh(); celebrate(); } }
    catch (e) { toast(e.message || '카드 등록을 마치지 못했어요'); }
  }
  refresh();
}

const WHY = {
  scripts: ['대본을 더 쓰려면', `무료는 대본 ${FREE.scripts}개까지예요`],
  rec: ['더 길게 찍으려면', `무료는 한 번에 ${Math.round(FREE.recSec / 60)}분까지 찍혀요`],
  voice: ['목소리 따라가기는', '프로에서 쓸 수 있어요'],
};
const PERKS = [
  ['doc', '대본', `${FREE.scripts}개`, '무제한'],
  ['timer', '한 번 녹화', `${Math.round(FREE.recSec / 60)}분`, '무제한'],
  ['mic', '목소리 따라가기', '—', '사용'],
];
const perkTable = () => `<div class="perks"><div class="ph"><span></span><span>무료</span><span class="pro">프로</span></div>${PERKS.map(([i, l, f, p]) => `<div class="pr"><span class="lab">${ic(i, 16)}${l}</span><span>${f}</span><b>${p}</b></div>`).join('')}</div>`;

// 잠긴 기능을 눌렀을 때
export function needPro(kind) {
  const [a, b] = WHY[kind] || ['프로 기능이에요', ''];
  const box = el(`<div><div class="upic">${ic('star', 26)}</div><h2 style="text-align:center;margin-bottom:4px">${a}<br>프로가 필요해요</h2><p class="muted c">${b}</p>
    ${perkTable()}
    <button class="btn acc wide" data-card>${ic('card', 18)}카드로 구독 · 월 ${won(PRICE.month)}</button>
    <button class="ghost wide" data-gift style="margin-top:8px">${ic('gift', 18)}기프트 키가 있어요</button></div>`);
  const sh = sheet(box);
  $('[data-card]', box).onclick = () => { sh.close(); subscribe(); };
  $('[data-gift]', box).onclick = () => { sh.close(); location.hash = '#/plan'; setTimeout(() => $('#giftin')?.focus(), 500); };
}

async function subscribe(btn) {
  if (!cardReady()) { toast('카드 결제는 곧 열려요. 지금은 기프트 키로 열 수 있어요'); return; }
  try {
    if (btn) btn.disabled = true;
    const t = await ensureToken();
    const v = await startCard(t);
    if (v) { await refresh(); celebrate(); }
  } catch (e) { if (e.message !== 'not-ready') toast(e.message || '결제를 마치지 못했어요'); }
  finally { if (btn) btn.disabled = false; }
}

function celebrate(msg = '프로가 열렸어요') {
  buzz([15, 40, 15]);
  const box = el(`<div class="c"><div class="upic big">${ic('check', 34)}</div><h2>${msg}</h2><p class="muted">${isForever(me?.paid_until) ? '평생 쓸 수 있어요' : ymd(me?.paid_until) + '까지 쓸 수 있어요'}</p><button class="btn wide" data-x>좋아요</button></div>`);
  const sh = sheet(box); $('[data-x]', box).onclick = sh.close;
  if (location.hash.startsWith('#/plan')) setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 50);
}

/* ---------- 구독 관리 화면 ---------- */
export async function planView(view) {
  await refresh();
  const pro = isPro(), card = me?.card, forever = isForever(me?.paid_until);
  const badge = forever ? '평생 프로' : pro ? '프로' : '무료';
  const hist = me?.history || [];
  const failed = card?.status === 'failed';
  view.innerHTML = `
    <div class="top"><a class="iconbtn" href="#/" aria-label="목록">${ic('left', 22)}</a><h1 class="h1s">구독 관리</h1><span style="width:44px"></span></div>
    ${failed ? `<div class="notice">${ic('card', 18)}<span>카드 결제가 안 됐어요. 카드를 바꿔 주세요.</span></div>` : ''}
    <div class="hero ${pro ? 'on' : ''}">
      <div class="row" style="justify-content:space-between"><span class="badge">${ic('star', 14)}${badge}</span>${pro && !forever ? `<span class="until">${ymd(me.paid_until)}까지</span>` : ''}</div>
      <div class="price">${pro ? (forever ? '평생 무료' : card?.status === 'active' ? `다음 결제 ${md(card.next_at)}` : '구독 중') : `월 ${won(PRICE.month)}`}</div>
      <p class="hs">${pro ? (card ? `${esc(card.label || '카드')} · ${card.status === 'active' ? `매달 ${won(card.amount)} 자동결제` : card.status === 'canceled' ? '해지됨 · 남은 기간만 써요' : '결제 실패'}` : forever ? '기프트 키로 열렸어요' : '기프트 키로 열렸어요') : '대본 무제한 · 길게 찍기 · 목소리 따라가기'}</p>
    </div>
    ${perkTable()}
    <div class="acts">
      ${!pro || (card && card.status !== 'active' && !forever) ? `<button class="btn acc wide" id="sub">${ic('card', 18)}카드로 구독 · 월 ${won(PRICE.month)}</button>${cardReady() ? '' : '<p class="tip c">카드 결제는 준비 중이에요. 지금은 기프트 키로 열 수 있어요.</p>'}` : ''}
      ${card && card.status === 'active' ? `<div class="row"><button class="ghost grow" id="chg">${ic('card', 18)}카드 바꾸기</button><button class="ghost grow" id="cancel">해지하기</button></div>` : ''}
    </div>

    <div class="sec">${ic('gift', 16)}기프트 키</div>
    <div class="box"><div class="row"><input id="giftin" class="inp grow" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" id="redeem">넣기</button></div>
      <p class="tip">받은 키를 넣으면 한 달·평생처럼 키에 적힌 만큼 프로가 열려요.</p></div>

    <div class="sec">${ic('devices', 16)}다른 기기에서 이어 쓰기</div>
    <div class="box">
      ${token() ? `<div class="row" style="justify-content:space-between"><div><small class="muted">내 복구 코드</small><div class="code">${group4(token())}</div></div><button class="ghost sm" id="cp">${ic('copy', 16)}복사</button></div><div class="hr"></div>` : ''}
      <div class="row"><input id="restore" class="inp grow" placeholder="다른 기기의 복구 코드 16자" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="ghost" id="rs">불러오기</button></div>
      <p class="tip">구독은 이 코드에 묶여 있어요. 폰을 바꾸면 이 코드를 넣어 주세요.</p></div>

    ${hist.length ? `<div class="sec">${ic('receipt', 16)}결제 내역</div><div class="box list">${hist.map(h => `<div class="li"><span>${h.method === 'card' ? '카드' : h.method === 'gift' ? '기프트 키' : '운영자 지급'}${h.status === 'failed' ? ' · 실패' : ''}</span><span class="muted">${ymd(h.created_at)}</span><b>${h.amount ? won(h.amount) : h.days ? h.days + '일' : h.status === 'failed' ? '—' : '평생'}</b></div>`).join('')}</div>` : ''}
    <p class="tip c" style="margin-top:24px">결제·환불 문의는 앱 운영자에게 해 주세요.</p>`;

  const g = sessionStorage.getItem('prompter:gift'); if (g) { $('#giftin').value = g; sessionStorage.removeItem('prompter:gift'); }
  $('#sub')?.addEventListener('click', e => subscribe(e.currentTarget));
  $('#chg')?.addEventListener('click', e => subscribe(e.currentTarget));
  const cancel = $('#cancel');
  if (cancel) {
    let armed = false;
    cancel.onclick = async () => {
      if (!armed) { armed = true; cancel.textContent = '한 번 더 누르면 해지'; cancel.classList.add('warn'); setTimeout(() => { armed = false; cancel.textContent = '해지하기'; cancel.classList.remove('warn'); }, 3500); return; }
      try { await rpc('pr_card_cancel', { p_token: token() }); toast('해지했어요. 남은 기간은 그대로 써요'); planView(view); } catch { toast('지금은 해지를 못 했어요. 잠시 뒤 다시 해 주세요'); }
    };
  }
  $('#redeem').onclick = async () => {
    const key = $('#giftin').value.trim(); if (!key) return $('#giftin').focus();
    const b = $('#redeem'); b.disabled = true;
    try {
      const r = await rpc('pr_redeem', { p_token: token() || '', p_key: key });
      if (r?.token) ls.set(LS.token, r.token);
      if (!r?.ok) return toast({ format: '키 모양이 달라요', none: '없는 키예요', expired: '기한이 지난 키예요', used: '이미 다 쓴 키예요', mine: '이미 넣은 키예요' }[r?.why] || '키를 넣지 못했어요');
      await refresh(); celebrate(r.forever ? '평생 프로가 열렸어요' : `${r.days}일 프로가 열렸어요`); planView(view);
    } catch { toast('지금은 서버에 닿지 않아요'); }
    finally { b.disabled = false; }
  };
  $('#cp')?.addEventListener('click', () => copy(token(), '복구 코드를 복사했어요'));
  $('#rs').onclick = async () => {
    const t = $('#restore').value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (t.length !== 16) return toast('복구 코드는 16자예요');
    try { const v = await rpc('pr_me', { p_token: t }); if (!v) return toast('없는 코드예요'); setMe(v); toast('불러왔어요'); planView(view); }
    catch { toast('지금은 서버에 닿지 않아요'); }
  };
}

/* ---------- 관리 화면 (#/admin) ---------- */
export async function adminView(view) {
  const secret = ls.get(LS.admin);
  if (!secret) {
    view.innerHTML = `<div class="top"><a class="iconbtn" href="#/">${ic('left', 22)}</a><h1 class="h1s">관리</h1><span style="width:44px"></span></div>
      <div class="box"><p style="margin:0 0 10px">관리 비밀키를 넣어 주세요. 이 기기에만 저장돼요.</p><div class="row"><input id="sec" class="inp grow" type="password" autocomplete="off"><button class="btn" id="go">${ic('key', 18)}열기</button></div></div>`;
    $('#go').onclick = async () => { const v = $('#sec').value.trim(); try { await rpc('pr_admin', { p_secret: v }); ls.set(LS.admin, v); adminView(view); } catch { toast('비밀키가 맞지 않아요'); } };
    return;
  }
  let d, gifts;
  try { [d, gifts] = await Promise.all([rpc('pr_admin', { p_secret: secret }), rpc('pr_admin_gifts', { p_secret: secret })]); }
  catch { ls.del(LS.admin); toast('비밀키가 바뀌었어요. 다시 넣어 주세요'); return adminView(view); }
  const base = location.origin + location.pathname;
  view.innerHTML = `<div class="top"><a class="iconbtn" href="#/">${ic('left', 22)}</a><h1 class="h1s">관리</h1><button class="iconbtn" id="out" aria-label="잠그기">${ic('lock', 18)}</button></div>
    <div class="stats four">
      <div class="stat"><div class="n">${d.customers}</div><div class="l">손님</div></div>
      <div class="stat"><div class="n">${d.active}</div><div class="l">프로</div></div>
      <div class="stat"><div class="n">${d.cards}</div><div class="l">카드 구독</div></div>
      <div class="stat"><div class="n sm">${won(d.month_sum)}</div><div class="l">이번 달 카드</div></div></div>
    <div class="sec">${ic('gift', 16)}기프트 키 만들기</div>
    <div class="box">
      <div class="row wrap"><div class="seg" id="gd"><button data-d="31" aria-pressed="true">한 달</button><button data-d="365" aria-pressed="false">1년</button><button data-d="0" aria-pressed="false">평생</button></div>
        <div class="seg" id="gn"><button data-n="1" aria-pressed="true">1개</button><button data-n="5" aria-pressed="false">5개</button><button data-n="10" aria-pressed="false">10개</button></div></div>
      <div class="row" style="margin-top:8px"><input id="gnote" class="inp grow" placeholder="메모 (누구에게 줄지)" maxlength="60"><button class="btn" id="gmake">만들기</button></div></div>
    <div class="box list" id="glist">${gifts.length ? gifts.map(g => `<div class="li gk" data-k="${esc(g.key)}"><span class="code sm">${esc(g.key)}</span><span class="muted">${g.days ? g.days + '일' : '평생'} · ${g.used}/${g.max_uses}${g.note ? ' · ' + esc(g.note) : ''}</span><span class="row"><button class="mini" data-cp aria-label="링크 복사">${ic('link', 16)}</button>${g.used ? '' : `<button class="mini" data-del aria-label="지우기">${ic('trash', 16)}</button>`}</span></div>`).join('') : '<p class="muted" style="margin:0">아직 만든 키가 없어요</p>'}</div>
    <div class="sec">${ic('key', 16)}손으로 기간 주기</div>
    <div class="box"><div class="row"><input id="gt" class="inp grow" placeholder="복구 코드 앞 4자리 이상" autocapitalize="characters"><input id="gdays" class="inp" style="width:84px" type="number" placeholder="일(0=평생)"><button class="ghost" id="grant">주기</button></div></div>
    <div class="sec">${ic('receipt', 16)}최근 결제·지급</div>
    <div class="box list">${d.payments.length ? d.payments.map(p => `<div class="li"><span>${p.who} · ${p.method === 'card' ? '카드' : p.method === 'gift' ? '기프트' : '지급'}${p.status !== 'paid' ? ' · ' + p.status : ''}</span><span class="muted">${ymd(p.created_at)}</span><b>${p.amount ? won(p.amount) : p.days ? p.days + '일' : '—'}</b></div>`).join('') : '<p class="muted" style="margin:0">아직 없어요</p>'}</div>`;
  const pick = id => [...$(id).querySelectorAll('button')].forEach(b => b.onclick = () => $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)));
  pick('#gd'); pick('#gn');
  $('#out').onclick = () => { ls.del(LS.admin); adminView(view); };
  $('#gmake').onclick = async () => {
    const days = +$('#gd [aria-pressed=true]').dataset.d, n = +$('#gn [aria-pressed=true]').dataset.n;
    try { const keys = await rpc('pr_admin_gift_make', { p_secret: secret, p_days: days, p_count: n, p_max_uses: 1, p_note: $('#gnote').value.trim() });
      copy(keys.map(k => `${k}  ${base}?gift=${k}`).join('\n'), `키 ${keys.length}개를 만들고 복사했어요`); adminView(view); }
    catch { toast('만들지 못했어요'); }
  };
  view.querySelectorAll('.gk').forEach(r => {
    const k = r.dataset.k;
    $('[data-cp]', r).onclick = () => copy(`${base}?gift=${k}`, '선물 링크를 복사했어요');
    const del = $('[data-del]', r); if (del) del.onclick = async () => { await rpc('pr_admin_gift_del', { p_secret: secret, p_key: k }); adminView(view); };
  });
  $('#grant').onclick = async () => {
    const r = await rpc('pr_admin_grant', { p_secret: secret, p_token: $('#gt').value.trim(), p_days: +($('#gdays').value || 0) }).catch(() => null);
    toast(r?.ok ? '기간을 줬어요' : r ? `맞는 손님이 ${r.found}명이에요` : '주지 못했어요'); if (r?.ok) adminView(view);
  };
}
