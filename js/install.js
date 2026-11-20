// 홈 화면에 설치: 스토어 없이 0원으로 앱처럼 쓰는 길.
// 안드로이드·PC 크롬은 설치 창을 바로 띄우고, 아이폰·아이패드는 누를 곳을 순서대로 보여 줌
import { h, ic, toast, modal } from './ui.js';
import * as db from './db.js';

const NUDGE = 'me:installnudge';   /* 이 기기에서만 기억 (동기화·백업에 안 들어감) */
let evt = null;
const subs = new Set();
const tell = () => subs.forEach(f => { try { f(); } catch { } });
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; tell(); });
  addEventListener('appinstalled', () => { evt = null; db.kvSet(NUDGE, 'done').catch(() => { }); toast('설치됐어요. 이제 홈 화면 아이콘으로 열어 주세요.'); tell(); });
}
export const onChange = f => { subs.add(f); return () => subs.delete(f); };

// 지금 어떤 기기·브라우저인지
export function where() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const ipad = ios && !/iPhone|iPod/.test(ua);
  const android = /Android/.test(ua);
  const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i.test(ua);   /* 카카오톡·인스타 안에서 열린 화면은 설치가 안 됨 */
  const safari = ios && !inApp && !/CriOS|FxiOS|EdgiOS|OPiOS|Whale|GSA\//.test(ua);
  const samsung = /SamsungBrowser/.test(ua);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return { ios, ipad, android, inApp, safari, samsung, installed, canAsk: !!evt };
}

// 안드로이드·PC: 브라우저의 설치 창 띄우기
export async function ask() {
  if (!evt) return false;
  const e = evt; evt = null;
  try { e.prompt(); const r = await e.userChoice; tell(); return r && r.outcome === 'accepted'; } catch { tell(); return false; }
}

const appUrl = () => location.origin + location.pathname;
const copyBtn = () => h('button.btn', { type: 'button', style: { minHeight: '44px' }, onclick: async () => { try { await navigator.clipboard.writeText(appUrl()); toast('주소를 복사했어요'); } catch { toast(appUrl()); } } }, ic('copy', 16), '앱 주소 복사');
const steps = (...xs) => h('ol.inst-steps', ...xs.filter(Boolean).map((x, i) => h('li', h('span.n', String(i + 1)), h('span', ...[].concat(x)))));
const shareIc = () => ic('shareup', 18);

export function guide() {
  const w = where();
  if (w.installed) { toast('이미 앱으로 설치해서 쓰고 있어요'); return; }
  modal('앱으로 설치하기', close => {
    const box = h('div.stack');
    const free = h('p.small.muted', '스토어 없이 무료예요. 홈 화면에 아이콘이 생기고, 주소창 없이 전체 화면으로 열려요.');
    if (w.inApp) {
      box.append(free, h('p.small', h('b', '지금은 다른 앱 안에서 열려 있어서 설치가 안 돼요.')),
        steps(['아래 "앱 주소 복사"를 눌러요'], [w.ios ? 'Safari를 열고 주소창에 붙여넣어요' : 'Chrome을 열고 주소창에 붙여넣어요'], ['거기서 다시 "설치하기"를 눌러요']), copyBtn());
    } else if (w.ios) {
      box.append(free);
      if (!w.safari) box.append(h('p.small', 'Safari에서 여는 게 가장 확실해요. 안 되면 주소를 복사해 Safari에 붙여넣어 주세요.'));
      box.append(steps(
        [w.ipad ? '화면 위쪽의 공유 버튼 ' : '화면 아래쪽의 공유 버튼 ', shareIc(), ' 을 눌러요. 안 보이면 ⋯ 을 먼저 눌러요'],
        ['목록을 아래로 내려 ', h('b', '"홈 화면에 추가"'), '를 눌러요'],
        ['오른쪽 위 ', h('b', '"추가"'), '를 누르면 끝이에요']),
        h('p.faint.tiny', '설치한 앱은 Safari와 기록을 따로 가져요. 멤버 코드로 로그인하면 기록이 맞춰져요. Safari로만 쓰면 오래 안 열 때 기록이 지워질 수 있어서, 설치해 두는 쪽이 안전해요.'));
      if (!w.safari) box.append(copyBtn());
    } else if (evt) {
      const out = h('p.small', { style: { minHeight: '1.4em' } });
      box.append(free, h('button.btn.pri', { type: 'button', style: { minHeight: '48px' }, onclick: async () => { const ok = await ask(); if (ok) close(); else { out.textContent = '취소했어요. 다시 하려면 브라우저 메뉴 ⋮ 에서 "앱 설치"를 눌러 주세요.'; } } }, ic('download', 18), '지금 설치하기'), out);
    } else if (w.android) {
      box.append(free, w.samsung
        ? steps(['아래 메뉴 ≡ 를 눌러요'], [h('b', '"현재 페이지 추가"'), '를 눌러요'], [h('b', '"홈 화면"'), '을 골라요'])
        : steps(['오른쪽 위 메뉴 ⋮ 를 눌러요'], [h('b', '"앱 설치"'), ' 또는 ', h('b', '"홈 화면에 추가"'), '를 눌러요'], [h('b', '"설치"'), '를 누르면 끝이에요']),
        h('p.faint.tiny', 'Chrome에서 여는 게 가장 확실해요.'));
    } else {
      box.append(free, steps(['Chrome이나 Edge 주소창 오른쪽의 설치 아이콘을 눌러요'], [h('b', '"설치"'), '를 누르면 끝이에요']),
        h('p.faint.tiny', '아이콘이 안 보이면 메뉴 ⋮ 에서 "앱 설치"를 찾아 주세요.'));
    }
    return box;
  });
}

// 오늘 화면 맨 위의 한 줄 권유. 폰·태블릿이거나 설치 창을 띄울 수 있을 때만, 한 번 닫으면 다시 안 뜸
export async function nudge() {
  const w = where();
  if (w.installed || !(w.ios || w.android || evt)) return null;
  if (await db.kvGet(NUDGE, '')) return null;
  const el = h('div.card.inst-nudge',
    ic('download', 22),
    h('div.grow', h('b', '홈 화면에 설치하면 앱처럼 써요'), h('small', '무료예요. 아이콘이 생기고 전체 화면으로 열려요.')),
    h('button.btn.pri', { type: 'button', style: { minHeight: '44px' }, onclick: guide }, '설치하기'),
    h('button.btn.ghost.icon', { type: 'button', 'aria-label': '설치 안내 닫기', style: { minWidth: '44px', minHeight: '44px' }, onclick: async () => { await db.kvSet(NUDGE, 'later'); el.remove(); toast('설정 › 앱으로 설치에서 언제든 다시 볼 수 있어요'); } }, ic('x')));
  return el;
}
