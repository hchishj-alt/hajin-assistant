// 아이폰·아이패드 홈 화면 전용 위젯.
// 웹앱은 홈 화면 위젯을 직접 만들 수 없어서, 무료 앱 Scriptable이 내 일정 파일(.ics 구독 주소)을 읽어 위젯으로 그리게 함.
// 여기서는 그 위젯 코드를 만들어 줌 (구독 주소가 코드 안에 들어감). 서버나 비용이 더 들지 않음.

// 위젯 안에서 도는 코드. Scriptable(아이폰 앱)에서 실행됨. 시험할 수 있게 계산 부분(core)은 따로 둠
export const core = `
function unesc(s) { return String(s || '').replace(/\\\\n/gi, ' ').replace(/\\\\([,;\\\\])/g, '$1'); }
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dkey(v) { return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8); }
function parse(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').split(/\\r?\\n/)) {
    if (raw === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
    if (raw === 'END:VEVENT') { if (cur && cur.date) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = raw.indexOf(':'); if (i < 0) continue;
    const key = raw.slice(0, i), val = raw.slice(i + 1), name = key.split(';')[0];
    if (name === 'SUMMARY') cur.title = unesc(val);
    else if (name === 'LOCATION') cur.place = unesc(val);
    else if (name === 'DTSTART') { cur.date = dkey(val); cur.start = val.length > 8 ? val.slice(9, 11) + ':' + val.slice(11, 13) : ''; }
    else if (name === 'DTEND') { cur.endDate = dkey(val); cur.endAll = val.length <= 8; cur.end = val.length > 8 ? val.slice(9, 11) + ':' + val.slice(11, 13) : ''; }
    else if (name === 'RRULE') { for (const kv of val.split(';')) { const p = kv.split('='); if (p[0] === 'FREQ') cur.freq = p[1]; if (p[0] === 'INTERVAL') cur.every = Number(p[1]) || 1; if (p[0] === 'BYDAY') cur.byday = p[1]; if (p[0] === 'UNTIL') cur.until = dkey(p[1]); } }
    else if (name === 'EXDATE') cur.ex.push(dkey(val));
  }
  for (const e of out) { e.task = /^마감 · /.test(e.title || ''); if (e.task) e.title = e.title.replace(/^마감 · /, ''); if (e.endDate) { if (e.endAll) { const d = new Date(e.endDate + 'T00:00'); d.setDate(d.getDate() - 1); e.last = ymd(d); } else e.last = e.endDate; } }
  return out;
}
function occurs(e, date) {
  if (e.ex.indexOf(date) >= 0) return false;
  if (e.date === date) return true;
  if (date < e.date) return false;
  if (!e.freq) return !!(e.last && date <= e.last);
  if (e.until && date > e.until) return false;
  const a = new Date(e.date + 'T00:00'), b = new Date(date + 'T00:00'), days = Math.round((b - a) / 864e5);
  if (e.freq === 'DAILY') return true;
  if (e.freq === 'WEEKLY') { if (e.byday) return b.getDay() > 0 && b.getDay() < 6; return a.getDay() === b.getDay() && days % (7 * (e.every || 1)) === 0; }
  if (e.freq === 'MONTHLY') return a.getDate() === b.getDate();
  return false;
}
// 오늘부터 며칠 치를 날짜별로: [{ date, label, rows: [{ time, title, task }] }]
function agenda(events, now, span) {
  const W = ['일', '월', '화', '수', '목', '금', '토'], out = [], hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  for (let i = 0; i < span; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), date = ymd(d);
    let ev = events.filter(function (e) { return !e.task && occurs(e, date); }).sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
    if (i === 0) ev = ev.filter(function (e) { return !e.start || (e.end && e.endDate === e.date ? e.end : e.start) >= hm || e.start >= hm; });   /* 오늘은 이미 지난 일정을 뺌 */
    const tk = events.filter(function (e) { return e.task && (e.date === date || (i === 0 && e.date < date)); });
    const rows = ev.map(function (e) { return { time: e.start || '종일', title: e.title || '일정', place: e.place || '' }; }).concat(tk.map(function (e) { return { time: e.date < date ? '밀림' : '마감', title: e.title, task: true }; }));
    out.push({ date: date, label: i === 0 ? '오늘' : i === 1 ? '내일' : (d.getMonth() + 1) + '/' + d.getDate() + ' (' + W[d.getDay()] + ')', rows: rows });
  }
  return out;
}
`;

export function script(url, appUrl = 'https://hchishj-alt.github.io/hajin-assistant/') {
  return `// 하진 비서 위젯 (Scriptable). 내 일정 주소가 들어 있으니 다른 사람에게 보내지 마세요.
const FEED = ${JSON.stringify(url)};
const APP = ${JSON.stringify(appUrl)};
${core}
async function load() {
  const fm = FileManager.local(), path = fm.joinPath(fm.cacheDirectory(), 'hajin-widget.ics');
  try { const r = new Request(FEED + (FEED.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()); r.timeoutInterval = 12; const s = await r.loadString(); if (s && s.indexOf('BEGIN:VCALENDAR') >= 0) { fm.writeString(path, s); return { text: s, fresh: true }; } } catch (e) { }
  return { text: fm.fileExists(path) ? fm.readString(path) : '', fresh: false };   /* 인터넷이 안 되면 지난번에 받아 둔 것 */
}
const fam = config.widgetFamily || 'medium';
const data = await load(), now = new Date();
const days = agenda(parse(data.text), now, 7);
const ink = Color.dynamic(new Color('#16161a'), new Color('#f4f4f6')), sub = Color.dynamic(new Color('#6b6b76'), new Color('#a0a0ad')), acc = Color.dynamic(new Color('#5b5bf0'), new Color('#8f8fff')), warn = Color.dynamic(new Color('#d9480f'), new Color('#ff9a62'));
const w = new ListWidget();
w.backgroundColor = Color.dynamic(new Color('#ffffff'), new Color('#17171c'));
w.url = APP + '#/today';
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (fam.indexOf('accessory') === 0) {   /* 잠금 화면 위젯: 다음 일정 하나 */
  let next = null; for (const d of days) { if (d.rows.length) { next = { d: d, r: d.rows[0] }; break; } }
  const a = w.addText(next ? (next.d.label === '오늘' ? '' : next.d.label + ' ') + next.r.time : '일정 없음'); a.font = Font.boldSystemFont(13);
  if (next) { const b = w.addText(next.r.title); b.font = Font.systemFont(12); b.lineLimit = 2; }
} else {
  const small = fam === 'small', budget = small ? 4 : fam === 'large' || fam === 'extraLarge' ? 13 : 5;
  w.setPadding(small ? 12 : 14, small ? 12 : 16, small ? 10 : 12, small ? 12 : 16);
  const W = ['일', '월', '화', '수', '목', '금', '토'];
  const head = w.addStack(); head.layoutHorizontally(); head.centerAlignContent();
  const t1 = head.addText((now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + W[now.getDay()] + '요일'); t1.font = Font.boldSystemFont(small ? 13 : 14); t1.textColor = ink;
  head.addSpacer();
  const n = days[0].rows.length; const t2 = head.addText(small ? String(n) : '오늘 ' + n + '개'); t2.font = Font.semiboldSystemFont(12); t2.textColor = acc;
  w.addSpacer(small ? 6 : 8);
  let used = 0, any = false;
  for (const d of days) {
    if (used >= budget) break;
    if (!d.rows.length) { if (d.label === '오늘') { const e = w.addText('오늘 남은 일정이 없어요'); e.font = Font.systemFont(12); e.textColor = sub; w.addSpacer(4); used++; } continue; }
    if (d.label !== '오늘') { if (used + 2 > budget) break; const h = w.addText(d.label); h.font = Font.semiboldSystemFont(11); h.textColor = sub; w.addSpacer(2); used++; }
    for (const r of d.rows) {
      if (used >= budget) break;
      const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent(); row.spacing = 8;
      const tm = row.addText(r.time); tm.font = Font.semiboldSystemFont(small ? 12 : 13); tm.textColor = r.task ? warn : acc; tm.lineLimit = 1;
      const tt = row.addText(r.title + (!small && r.place ? ' · ' + r.place : '')); tt.font = Font.systemFont(small ? 12 : 13); tt.textColor = ink; tt.lineLimit = 1;
      row.addSpacer();
      w.addSpacer(small ? 3 : 4); used++; any = true;
    }
  }
  w.addSpacer();
  if (!data.text) { const e = w.addText('일정을 못 받아 왔어요. 인터넷을 확인해 주세요.'); e.font = Font.systemFont(11); e.textColor = warn; }
  else if (!data.fresh) { const e = w.addText('오프라인: 지난번에 받은 일정'); e.font = Font.systemFont(10); e.textColor = sub; }
}
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}
