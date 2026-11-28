// 알림: 일정 시작 전, 할 일 마감(그날 아침·전날 저녁), 아침 브리핑, 앱 아이콘의 남은 개수.
// 앱이 열려 있는 동안은 여기서 울림. 같은 목록(plan)을 서버 푸시도 그대로 씀.
import * as db from './db.js';
import * as store from './store.js';
import { h, ic } from './ui.js';
import * as SC from './scope.js';
import * as ACT from './acts.js';

export const DEFAULT = { on: true, lead: 10, tasks: true, taskAt: '09:00', eve: true, eveAt: '20:00', brief: true, briefAt: '08:30', badge: true };
export const get = async () => ({ ...DEFAULT, ...(await db.kvGet('alarm', {})) });
export async function set(patch) { const next = { ...(await get()), ...patch }; await db.kvSet('alarm', next); tell(); return next; }

const FIRED = 'me:alarmfired', SNOOZE = 'me:alarmsnooze';   /* 이 기기에서만 기억 */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date, hm) => new Date(`${date}T${/^\d{1,2}:\d{2}$/.test(hm || '') ? hm.padStart(5, '0') : '09:00'}:00`);
const names = (xs, n = 3) => xs.slice(0, n).map(x => x.title).filter(Boolean).join(', ') + (xs.length > n ? ` 외 ${xs.length - n}개` : '');
const subs = new Set(); const tell = () => subs.forEach(f => { try { f(); } catch { } });
export const onChange = f => { subs.add(f); return () => subs.delete(f); };

// 앞으로 days일 동안 울릴 알림을 시각 순으로. until = 이때를 넘기면 늦어서 안 울림
export async function plan({ from = new Date(), days = 2, cfg } = {}) {
  cfg = cfg || await get(); if (!cfg.on) return [];
  // 팀 일정은 내가 낀 것만 울림(캘린더 "내 일정"과 같은 기준): 다른 팀원끼리의 약속까지 내 폰이 울리지 않게
  const meN = await db.kvGet('name', '');
  const evs = (await db.list('events')).filter(e => e.date && e.kind !== 'focus' && (!e.team || SC.involves(e, meN)));
  const mine = await store.mineFilter();
  const open = (await db.list('tasks')).filter(t => !t.done && t.due && mine(t));
  const acts = cfg.tasks ? await db.list('acts') : [];
  const out = []; const today = ymd(from);
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i); const date = ymd(d);
    const nd = new Date(d); nd.setDate(nd.getDate() + 1);
    const todays = evs.filter(e => store.occursOn(e, date)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    for (const e of todays) {
      if (!e.start) continue; const lead = Number(e.remind === '' || e.remind == null ? cfg.lead : e.remind); if (!(lead >= 0)) continue;
      const st = at(date, e.start);
      out.push({ id: `ev|${e.id}|${date}`, kind: 'event', at: new Date(st - lead * 6e4), until: new Date(+st + 5 * 6e4), title: e.title || '일정', body: `${lead ? (lead >= 60 && lead % 60 === 0 ? lead / 60 + '시간' : lead + '분') + ' 뒤 ' : ''}${e.start} 시작${e.place ? ' · ' + e.place : ''}`, url: '#/calendar' });
    }
    const due = open.filter(t => t.due === date), late = date === today ? open.filter(t => t.due < date) : [], tomorrow = open.filter(t => t.due === ymd(nd));
    const win = t => new Date(+t + 3 * 36e5);
    if (cfg.tasks && due.length) { const t = at(date, cfg.taskAt); out.push({ id: `due|${date}`, kind: 'task', at: t, until: win(t), title: `오늘 마감 ${due.length}개`, body: names(due), url: '#/tasks' }); }
    /* 대외활동 마감: 2주 전, 7일 전, 3일 전부터는 매일 아침 한 번. 팀 목표의 오늘·내일 마감은 위의 할 일 알림이 이미 알려 줌. 제출 완료면 안 울림 */
    { const hit = ACT.alarmsOn(acts, date, meN).filter(x => !(x.a.goal && x.n <= 1)); const tx = ACT.alarmText(hit); if (tx) { const t = at(date, cfg.taskAt); out.push({ id: `act|${date}`, kind: 'task', at: t, until: win(t), title: tx.title, body: tx.body, url: '#/acts' }); } }
    if (cfg.eve && tomorrow.length) { const t = at(date, cfg.eveAt); out.push({ id: `eve|${date}`, kind: 'task', at: t, until: win(t), title: `내일 마감 ${tomorrow.length}개`, body: names(tomorrow), url: '#/tasks' }); }
    if (cfg.brief && (todays.length || due.length || late.length)) {
      const t = at(date, cfg.briefAt); const first = todays.find(e => e.start);
      out.push({ id: `brief|${date}`, kind: 'brief', at: t, until: win(t), title: '오늘 브리핑', body: [todays.length ? `일정 ${todays.length}개${first ? ` (${first.start} ${first.title})` : ''}` : '', due.length ? `오늘 마감 ${due.length}개` : '', late.length ? `밀린 일 ${late.length}개` : ''].filter(Boolean).join(' · '), url: '#/today' });
    }
  }
  /* 새로 찾은 대외활동 중 우리와 잘 맞는 것: 찾은 날 한 번만 묶어서 */
  { const an = cfg.tasks ? await db.kvGet('acts:new', null) : null; if (an && an.at) { const t = new Date(an.at); if (+t > +from - 12 * 36e5) out.push({ id: `actnew|${an.date}`, kind: 'bell', at: t, until: new Date(+t + 12 * 36e5), title: `새로 찾은 대외활동 ${an.n}개`, body: `가장 맞는 건 “${String(an.title || '').slice(0, 24)}” (맞음 ${an.pct}%)`, url: '#/acts/rec' }); } }
  /* 불편 접수: 관리자에게는 새 접수, 말한 사람에게는 반영 소식 */
  try { const G = await import('./gripe.js'); for (const a of await G.alarms(from)) out.push(a); } catch { }
  for (const s of await db.kvGet(SNOOZE, [])) out.push({ ...s, at: new Date(s.at), until: new Date(s.until) });
  return out.sort((a, b) => a.at - b.at);
}
// 아직 안 울린, 앞으로 울릴 것만 (화면에 보여 줄 때)
export async function upcoming(n = 5, from = new Date()) { return (await plan({ from, days: 3 })).filter(a => a.at > from).slice(0, n); }

// ── 알림 권한 ──
export const perm = () => ('Notification' in window) ? Notification.permission : 'none';
export async function ask() { if (!('Notification' in window)) return 'none'; try { const r = await Notification.requestPermission(); tell(); return r; } catch { return perm(); } }

// ── 울리기 ──
async function system(a) {
  if (perm() !== 'granted') return false;
  const opt = { body: a.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: a.id, data: { url: a.url || '#/today' } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(a.title, opt); return true; } new Notification(a.title, opt); return true; } catch { return false; }
}
let pop = null;
function banner(a) {
  pop?.remove();
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); if (pop === el) pop = null; };
  const el = pop = h('div.alarm-pop', { role: 'alert' },
    h('span.ap-ic', ic(a.kind === 'event' ? 'calendar' : a.kind === 'task' ? 'check2' : 'bell', 20)),
    h('div.grow', h('b', a.title), a.body ? h('small', a.body) : null),
    a.kind === 'event' ? h('button.btn.sm.ghost', { type: 'button', onclick: async () => { await snooze(a, 5); close(); } }, '5분 뒤') : null,
    h('button.btn.sm.pri', { type: 'button', onclick: () => { close(); if (a.url) location.hash = a.url; } }, '보기'),
    h('button.btn.icon.ghost', { type: 'button', 'aria-label': '알림 닫기', onclick: close }, ic('x', 16)));
  document.body.append(el);
  try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([120, 60, 120]); } catch { }   /* 아직 한 번도 안 누른 화면에서는 브라우저가 막고 경고를 남기니 건너뜀 */
  setTimeout(() => { if (document.body.contains(el)) close(); }, 25000);
}
export async function snooze(a, mins = 5) {
  const t = Date.now() + mins * 6e4; const list = (await db.kvGet(SNOOZE, [])).filter(s => new Date(s.until) > new Date());
  list.push({ ...a, id: `${a.id}|again${t}`, at: new Date(t).toISOString(), until: new Date(t + 10 * 6e4).toISOString(), body: (a.body || '').replace(/^\d+(분|시간) 뒤 /, '') });
  await db.kvSet(SNOOZE, list); tell();
}
export async function fire(a) {
  const seen = document.visibilityState === 'visible';
  if (seen) banner(a);
  if (!seen || !document.hasFocus()) await system(a);
}
export async function test() { const a = { id: 'test|' + Date.now(), kind: 'bell', title: '시험 알림', body: '알림이 이렇게 와요.', url: '#/settings' }; banner(a); return system(a); }

export async function tick(now = new Date()) {
  const cfg = await get(); if (!cfg.on) return [];
  const fired = await db.kvGet(FIRED, {});
  const due = (await plan({ from: now, days: 1, cfg })).filter(a => a.at <= now && now <= a.until && !fired[a.id]);
  if (!due.length) return [];
  const keep = Date.now() - 3 * 864e5; for (const k of Object.keys(fired)) if (fired[k] < keep) delete fired[k];
  for (const a of due) fired[a.id] = Date.now();
  await db.kvSet(FIRED, fired);
  for (const a of due) await fire(a);
  return due;
}

// ── 앱 아이콘의 숫자: 오늘 남은 일정 + 오늘까지인 할 일 ──
export async function count(now = new Date()) {
  const today = ymd(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const meN = await db.kvGet('name', '');
  const evs = (await store.eventsOn(today)).filter(e => e.kind !== 'focus' && (!e.team || SC.involves(e, meN)) && (!e.start || (e.end || e.start) >= hm));
  const mine = await store.mineFilter();
  const tasks = (await db.list('tasks')).filter(t => !t.done && t.due && t.due <= today && mine(t));
  return { events: evs.length, tasks: tasks.length, n: evs.length + tasks.length };
}
export async function badge() {
  if (!('setAppBadge' in navigator)) return;
  try { const cfg = await get(); const n = cfg.on && cfg.badge ? (await count()).n : 0; if (n) await navigator.setAppBadge(n); else await navigator.clearAppBadge(); } catch { }
}

let started = false;
export function start() {
  if (started) return; started = true;
  const run = () => { tick().catch(() => { }); badge(); };
  setInterval(run, 30 * 1000); run();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  let t = 0; db.onChange(col => { if (col !== 'events' && col !== 'tasks') return; clearTimeout(t); t = setTimeout(() => { badge(); tell(); }, 1500); });
}
