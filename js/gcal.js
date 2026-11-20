// 구글 캘린더 연동 (무료, 구글 로그인·API 키 없이)
//  1) 일정 하나를 구글 캘린더에 바로 추가하는 링크
//  2) 내 일정 전체를 구독 주소(.ics)로 내보내 구글 캘린더가 알아서 가져가게 하기 → 구글 알림을 그대로 씀
import * as db from './db.js';
import * as store from './store.js';

const pad = n => String(n).padStart(2, '0');
const dt = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
const nextDay = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 1); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; };
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
const RR = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', biweekly: 'WEEKLY;INTERVAL=2', weekdays: 'WEEKLY;BYDAY=MO,TU,WE,TH,FR' };
const TZ = 'Asia/Seoul';

// 구글 캘린더 "일정 추가" 화면이 내용이 채워진 채로 열리는 주소
export function addUrl(e) {
  const dates = e.start ? `${dt(e.date, e.start)}/${dt(e.date, e.end || store.addMins(e.start, 60))}` : `${dt(e.date)}/${nextDay(e.date)}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title || '일정', dates, ctz: TZ });
  if (e.place) q.set('location', e.place);
  if (e.memo) q.set('details', e.memo);
  if (e.repeat && RR[e.repeat]) q.set('recur', 'RRULE:FREQ=' + RR[e.repeat]);
  return 'https://calendar.google.com/calendar/render?' + q;
}

// .ics 글 만들기 (알림 포함). tasks=true면 마감 있는 할 일도 종일 일정으로
// 알림 시간은 앱의 알림 설정을 따름: 일정은 N분 전, 마감은 그날 정한 시각 (폰 캘린더가 그대로 울림)
export async function ics({ tasks = true } = {}) {
  const cfg = await (await import('./alarm.js')).get();
  const hmDur = hm => { const [a, b] = String(hm || '09:00').split(':').map(Number); return `PT${a || 0}H${b ? b + 'M' : ''}`; };
  const evs = (await db.list('events')).filter(e => e.date && e.kind !== 'focus');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hajin-assistant//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:하진 비서', 'X-WR-TIMEZONE:' + TZ, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const e of evs) {
    L.push('BEGIN:VEVENT', 'UID:' + e.id + '@hajin', 'DTSTAMP:' + stamp, 'SUMMARY:' + esc(e.title));
    const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;   /* 여러 날 이어지는 일정 */
    if (e.start) L.push(`DTSTART;TZID=${TZ}:` + dt(e.date, e.start), `DTEND;TZID=${TZ}:` + dt(last, e.end || (last > e.date ? '23:59' : store.addMins(e.start, 60))));
    else L.push('DTSTART;VALUE=DATE:' + dt(e.date), 'DTEND;VALUE=DATE:' + nextDay(last));
    if (e.place) L.push('LOCATION:' + esc(e.place));
    if (e.memo) L.push('DESCRIPTION:' + esc(e.memo));
    if (e.repeat && RR[e.repeat]) {
      L.push('RRULE:FREQ=' + RR[e.repeat] + (e.until ? ';UNTIL=' + (e.start ? dt(e.until) + 'T145959Z' : dt(e.until)) : ''));   /* 끝나는 날 (한국 시간 그날 밤까지) */
      for (const d of e.skip || []) L.push(e.start ? `EXDATE;TZID=${TZ}:` + dt(d, e.start) : 'EXDATE;VALUE=DATE:' + dt(d));   /* 건너뛴 날 */
    }
    const r = Number(e.remind === '' || e.remind == null ? cfg.lead : e.remind); if (cfg.on && e.start && r >= 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), `TRIGGER:-PT${r}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  if (tasks) for (const t of (await db.list('tasks')).filter(t => !t.done && t.due)) {
    L.push('BEGIN:VEVENT', 'UID:' + t.id + '@hajin', 'DTSTAMP:' + stamp, 'SUMMARY:' + esc('마감 · ' + t.title), 'DTSTART;VALUE=DATE:' + dt(t.due), 'DTEND;VALUE=DATE:' + nextDay(t.due), 'TRANSP:TRANSPARENT');
    if (cfg.on && cfg.tasks) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('오늘 마감 · ' + t.title), 'TRIGGER:' + hmDur(cfg.taskAt), 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

// 구독 주소: 팀 저장소에 내 일정 파일을 올려 두고, 바뀔 때마다 덮어씀
export const state = () => db.kvGet('gcal', { on: false, url: '', at: '', tasks: true });
export async function publish(force = false) {
  const st = await state(); if (!st.on && !force) return st;
  const sync = await import('./sync.js'); const url = await sync.publishCal(await ics({ tasks: st.tasks !== false }), st.key);
  if (!url) throw new Error('멤버 코드로 로그인해야 구독 주소를 만들 수 있어요.');
  const next = { ...st, on: true, url: url.url, key: url.key, at: new Date().toISOString() };
  await db.kvSet('gcal', next); return next;
}
export async function off() { const st = await state(); if (st.key) { try { await (await import('./sync.js')).removeCal(st.key); } catch { } } await db.kvSet('gcal', { on: false, url: '', at: '', tasks: st.tasks }); }
// 구글 캘린더에서 "URL로 추가"가 채워진 채로 열림
export const subscribeUrl = url => 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(url.replace(/^https:/, 'webcal:'));

// 아이폰·아이패드·맥 기본 캘린더가 바로 '구독' 창을 여는 주소
export const appleUrl = url => url.replace(/^https?:/, 'webcal:');

// 일정·할 일이 바뀌면 잠깐 뒤에 한 번만 다시 올림
let timer = 0;
export function watch() {
  const later = () => { clearTimeout(timer); timer = setTimeout(() => publish().catch(() => { }), 4000); };
  db.onChange(col => { if (col === 'events' || col === 'tasks') later(); });
  import('./alarm.js').then(A => A.onChange(later)).catch(() => { });   /* 알림 시간을 바꾸면 폰 캘린더 알람도 따라가게 */
}
