// 매니저가 직접 굴리는 전략: 주마다 계획을 스스로 세우고, 올린 결과를 보고 다음 걸 고치고, 하진은 팀원으로 의견을 냄.
// 앱을 열 때마다 tick()이 돌며: 이번 주 계획이 없으면 만들고 → 올린 게시물을 계획과 짝짓고 → 지난 일은 미루거나 접고 → 가까운 일 캡션을 미리 써 둠.
import * as S from './store.js';
import * as A from './analyze.js';
import * as AI from './ai.js';
import { FIELDS, pick } from './fields.js';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const kdate = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => kdate(new Date(d + 'T12:00:00+09:00').getTime() + n * 864e5);
export const dow = d => new Date(d + 'T12:00:00+09:00').getUTCDay();
export function weekStart(d = kdate()) { const w = dow(d); return addDays(d, w === 0 ? -6 : 1 - w); } // 월요일
export const dayLabel = d => { const t = kdate(); return d === t ? '오늘' : d === addDays(t, 1) ? '내일' : d === addDays(t, -1) ? '어제' : `${+d.slice(5, 7)}/${+d.slice(8)} ${DAYS[dow(d)]}`; };

const BASE = [
  { name: '스타일', ex: ['오늘 코디 30초 GRWM', '같은 옷 3가지로 입기', '요즘 꽂힌 아이템 3개'] },
  { name: '하는 일', ex: ['책상·작업 공간 구경', '하는 과정 빨리 감기', '하루 따라가기'] },
  { name: '일상·나', ex: ['솔직 Q&A', '오늘 하루 1분 요약', '친구랑 있었던 일 공감 썰'] },
];
// 고른 분야가 있으면 그 분야를 축으로, 없으면 기본 세 축
const pillarsOf = st => { const f = pick(st.about?.vibe || ''); if (!f.length) return BASE; const out = f.slice(0, 3).map(x => ({ name: x.name.split('·')[0], ex: x.ex })); while (out.length < 3) out.push(out.length === 1 ? { name: out[0].name, ex: [...out[0].ex].reverse() } : BASE[2]); return out; };
// 쓰는 플랫폼만 (아이디를 적었거나 기록이 있는 곳). 아무것도 없으면 둘 다
const planEnd = ws => addDays(ws, kdate() >= addDays(ws, 4) ? 13 : 6);
const usePlats = (st, An) => { const u = ['ig', 'tt'].filter(p => st.profile?.[p]?.username || An.plats[p].n); return u.length ? u : ['ig', 'tt']; };
// 숫자로 이번 주 틀 정하기 (AI 없을 때도, AI가 짤 때도 이 틀을 줌)
function frame(st, An) {
  const ig = An.plats.ig, tt = An.plats.tt;
  const slot = p => { const b = An.plats[p].hours[0]; const h = b && b.n >= 3 && b.lift > 1.1 ? b.h : null; return h != null ? String(Math.min(23, h + 1)).padStart(2, '0') + ':00' : p === 'tt' ? '21:00' : '20:00'; };
  const igKind = ig.kinds[0]?.k || 'reels';
  const lastRes = (st.strategy?.results || []).slice(-6);
  return { cadence: { ig: 4, tt: 3 }, slot: { ig: slot('ig'), tt: slot('tt') }, igKind, lastRes };
}
function rulePlan(st, An, ws) {
  const f = frame(st, An); const items = []; const PILLARS = pillarsOf(st);
  const use = usePlats(st, An);
  const sched = use.length === 2 ? { ig: [1, 3, 5, 6], tt: [2, 4, 0] } : { [use[0]]: [1, 2, 4, 5, 0] };
  let n = 0;
  for (const plat of use) for (const w of sched[plat]) {
  for (const wk of planEnd(ws) > addDays(ws, 6) ? [0, 7] : [0]) {
    const pil = PILLARS[n % 3]; const date = addDays(ws, (w === 0 ? 6 : w - 1) + wk);
    if (date < kdate()) { n++; continue; }
    items.push({ id: S.uid(), date, time: f.slot[plat], plat, kind: plat === 'tt' ? 'video' : (n % 4 === 3 ? 'carousel' : f.igKind), pillar: pil.name, idea: pil.ex[Math.floor(n / 3) % 3], hook: '결과(완성 모습)부터 1초 보여 주고 시작', why: '', status: '예정' });
    n++;
  } }
  return { items: items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), focus: '꾸준히 같은 시간에 올려서 알고리즘에 "이 계정은 이때 올라온다"를 학습시키기', experiment: { hypo: '첫 1초에 결과를 먼저 보여 주면 끝까지 보는 비율이 오른다', metric: '완주율' } };
}
async function aiPlan(st, An, ws, note = '') {
  const f = frame(st, An);
  const use = usePlats(st, An);
  const snap = use.map(p => { const a = An.plats[p]; return `${A.PLAT[p]}: 팔로워 ${a.growth.now ?? '?'}, 7일 ${a.growth.d7 ?? '?'}, 반응률 ${A.pct(a.er)}, 보내기율 ${A.pct(a.share)}, 완주율 ${A.pct(a.keep)}, 잘 되는 형식 ${A.KIND[a.kinds[0]?.k] || '?'}, 잘 되는 시간 ${a.hours[0] ? A.slotName(a.hours[0].h) : '?'}, 잘된 것 "${(a.top[0]?.p.caption || '').slice(0, 30)}"`; }).join('\n');
  const ex = await S.get('explore', null);
  const exText = ex ? `오늘 찾아본 트렌드: ${(ex.trends || []).map(t => t.title + '(' + t.forMe + ')').join(' / ')}. 뜨는 사람들 공통점: ${(ex.playbook || []).map(p => p.rule).join(', ')}. 시리즈 후보: ${(ex.series || []).map(x => x.name + ' — ' + x.format).join(' / ')}. 검색 낱말: ${(ex.keywords || []).join(' ')}` : '트렌드 탐색 결과 없음';
  const prompt = `너는 크리에이터 ${st.about.name || '크리에이터'}의 전담 매니저고, 전략은 네가 세워. "이대로만 하면 뜬다" 수준으로 구체적이어야 해.
${exText} ${st.about.name || '크리에이터'}은 팀원으로 의견을 내고 촬영·업로드를 해.
목표: ${st.about.goal || '팔로워 성장'}. 분위기: ${st.about.vibe || '-'}. 콘텐츠는 ${st.about.name || '크리에이터'} 자신(얼굴·스타일·작업·일상).
계정 숫자:\n${snap}
지난 실험 결과: ${f.lastRes.map(r => `${r.idea}(${r.verdict})`).join(', ') || '없음'}
팀원 의견(꼭 반영): ${note || (st.strategy?.notes || []).slice(-5).map(n => n.text).join(' / ') || '없음'}
${kdate() > ws ? kdate() + '(오늘)부터 ' + planEnd(ws) + '(일)까지 계획 (오늘 이전 날짜 금지)' : ws + '(월)부터 7일 계획'}. ${planEnd(ws) > addDays(ws, 6) ? '아래 개수는 한 주 기준이고, 다음 주까지 같이 짜.' : ''} ${use.length === 2 ? `인스타 ${f.cadence.ig}개, 틱톡 ${f.cadence.tt}개. 촬영 부담 적게, 한 번 찍어 두 플랫폼에 나눠 쓰는 것 환영.` : `${A.PLAT[use[0]]}만 써. 5개. plat은 전부 "${use[0]}". 촬영 부담 적게.`} 계획의 절반 이상은 트렌드나 시리즈에 걸어. 각 항목 why에 근거(트렌드 이름이나 내 숫자)를 써. 시간은 인스타 ${f.slot.ig}, 틱톡 ${f.slot.tt} 근처.
JSON만: {"focus":"이번 주 전략 한 문장","experiment":{"hypo":"이번 주 시험할 가설","metric":"볼 숫자"},"items":[{"date":"YYYY-MM-DD","time":"HH:MM","plat":"ig"|"tt","kind":"reels"|"carousel"|"photo"|"story"|"video","pillar":"축 이름","idea":"무엇을 찍을지 한 줄","hook":"첫 1초","why":"왜 이걸(숫자 근거) 한 줄"}]}`;
  const r = await AI.gem([prompt], { json: true, temp: 0.8, ms: 45000 });
  const items = (r.items || []).filter(x => x.date && x.idea && x.date >= kdate() && x.date <= planEnd(ws)).map(x => ({ id: S.uid(), status: '예정', ...x, plat: use.length === 1 ? use[0] : x.plat === 'tt' ? 'tt' : 'ig' })).map(x => x.plat === 'tt' && x.kind !== 'video' ? { ...x, kind: 'video' } : x.plat === 'ig' && x.kind === 'video' ? { ...x, kind: 'reels' } : x);
  if (items.length < 2) throw new Error('계획이 너무 짧아요');
  return { items: items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), focus: r.focus || '', experiment: r.experiment || null };
}
async function makeWeek(st, An, ws, note) {
  let p, by = 'ai';
  if (await AI.hasKey()) { try { p = await aiPlan(st, An, ws, note); } catch { p = null; } }
  if (!p) { p = rulePlan(st, An, ws); by = 'rule'; }
  return { week: ws, ...p, by, at: Date.now() };
}
const log = (sg, text) => { (sg.log ||= []).push({ at: Date.now(), text }); sg.log = sg.log.slice(-60); };

// 앱을 열 때마다 매니저가 하는 일. 바뀐 게 있으면 true
let running = null;
export function tick(force = false) { return running ||= _tick(force).finally(() => { running = null; }); }
async function _tick(force) {
  const st = await stateLite(); const An = A.analyze(st); const today = kdate(); const ws = weekStart(today);
  const sg = st.strategy || { notes: [], log: [], results: [] }; let changed = false;
  // 1) 이번 주 계획이 없거나 지난주 것이면 새로 (지난주 결과를 정리해서 넘김)
  const upgrade = sg.cur?.by === 'rule' && sg.cur.week === ws && !sg.cur.items.some(i => i.status === '찍음' || i.status === '올림') && (await AI.hasKey());
  // 주말에 미리 짜 둔 다음 주 계획이 있으면 그대로 이어 감
  if (sg.cur && sg.cur.week < ws && !force && sg.cur.items.filter(i => i.date >= ws).length >= 3) {
    const old = sg.cur.items.filter(i => i.date < ws); const done = old.filter(i => i.status === '올림').length;
    (sg.past ||= []).push({ week: sg.cur.week, focus: sg.cur.focus, done, all: old.length }); sg.past = sg.past.slice(-12);
    sg.cur.items = sg.cur.items.filter(i => i.date >= ws); sg.cur.week = ws; changed = true;
    log(sg, '새 주가 시작됐어요. 미리 짜 둔 계획대로 가요.');
  }
  if (!sg.cur || sg.cur.week !== ws || force || upgrade) {
    if (sg.cur && sg.cur.week !== ws) {
      const done = sg.cur.items.filter(i => i.status === '올림').length, all = sg.cur.items.length;
      log(sg, `지난주 계획 ${all}개 중 ${done}개 올림. 결과를 보고 이번 주를 새로 짰어요.`);
      (sg.past ||= []).push({ week: sg.cur.week, focus: sg.cur.focus, done, all }); sg.past = sg.past.slice(-12);
    }
    sg.cur = await makeWeek(st, An, ws); changed = true;
    log(sg, sg.cur.by === 'ai' ? `이번 주 전략: ${sg.cur.focus}` : `이번 주 계획을 숫자 규칙으로 짰어요 (AI 연결하면 더 잘 짜요)`);
  }
  // 2) 올린 게시물을 계획과 짝짓기 (같은 플랫폼, 그날 ±1일)
  for (const it of sg.cur.items) {
    if (it.status === '올림' && it.postId) continue;
    const cand = st.posts.find(p => p.plat === it.plat && Math.abs(new Date(p.at) - new Date(it.date + 'T' + (it.time || '20:00') + ':00+09:00')) < 1.5 * 864e5 && !sg.cur.items.some(o => o.postId === p.id));
    if (cand && it.status !== '건너뜀') { it.status = '올림'; it.postId = cand.id; changed = true; log(sg, `"${it.idea}" 올린 것 확인했어요.`); }
  }
  // 3) 올린 것 평가 → 결과 기록 (숫자가 들어온 것만, 한 번만)
  for (const it of sg.cur.items.filter(i => i.status === '올림' && i.postId && !i.verdict)) {
    const p = st.posts.find(x => x.id === it.postId); const a = An.plats[it.plat];
    if (!p || (p.reach ?? p.views ?? p.likes) == null || !a.measured) continue;
    const s = A.score(p, a.fol); const r = a.er ? s.er / a.er : null; if (r == null) continue;
    it.verdict = r >= 1.3 ? '잘됨' : r <= 0.7 ? '아쉬움' : '보통'; it.lift = r; changed = true;
    (sg.results ||= []).push({ at: Date.now(), idea: it.idea, pillar: it.pillar, kind: it.kind, plat: it.plat, verdict: it.verdict, lift: r }); sg.results = sg.results.slice(-40);
    log(sg, `"${it.idea}" ${it.verdict} (평소의 ${r.toFixed(1)}배). ${it.verdict === '잘됨' ? '비슷한 걸 다음 주에 더 넣을게요.' : it.verdict === '아쉬움' ? '다음엔 훅을 바꿔 볼게요.' : ''}`);
  }
  // 4) 놓친 일: 하루 지난 '예정'은 이번 주 빈 날로 미루고, 더 못 미루면 건너뜀
  for (const it of sg.cur.items.filter(i => i.status === '예정' && i.date < today)) {
    const used = new Set(sg.cur.items.filter(i => i.plat === it.plat && i.status !== '건너뜀').map(i => i.date));
    let nd = null; for (let k = 0; k < 7; k++) { const d = addDays(today, k); if (d >= addDays(ws, 7)) break; if (!used.has(d)) { nd = d; break; } }
    if (nd) { log(sg, `"${it.idea}" ${dayLabel(it.date)} 못 올려서 ${dayLabel(nd)}로 옮겼어요.`); it.date = nd; } else { it.status = '건너뜀'; log(sg, `"${it.idea}"는 이번 주엔 접었어요.`); }
    changed = true;
  }
  sg.cur.items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (changed) await S.set('strategy', sg);
  // 5) 오늘·내일 할 것 캡션 미리 써 두기 (AI, 한 번에 2개까지, 화면은 기다리지 않음)
  draftCaptions(sg, st).catch(() => { });
  return changed;
}
async function draftCaptions(sg, st) {
  if (!(await AI.hasKey())) return;
  const today = kdate(), tmr = addDays(today, 1);
  const need = sg.cur.items.filter(i => i.status === '예정' && (i.date === today || i.date === tmr) && !i.caption).slice(0, 2);
  if (!need.length) return;
  const past = st.posts.filter(p => p.caption).map(p => p.caption);
  for (const it of need) {
    try { const r = await AI.caption({ about: st.about, plat: it.plat, idea: it.idea + ' / 첫 1초: ' + it.hook, mood: '', past }); const o = r.options?.[0]; if (o) { it.caption = o.text + ((r.tags || []).length ? '\n\n' + r.tags.join(' ') : ''); it.capAlt = (r.options || []).slice(1).map(x => x.text); } } catch { return; }
  }
  const fresh = await S.get('strategy'); if (!fresh?.cur) return;
  for (const it of need) { const t = fresh.cur.items.find(x => x.id === it.id); if (t && it.caption) { t.caption = it.caption; t.capAlt = it.capAlt; } }
  log(fresh, `${need.map(i => '"' + i.idea + '"').join(', ')} 캡션을 미리 써 뒀어요.`);
  await S.set('strategy', fresh); window.dispatchEvent(new CustomEvent('mgr:strategy'));
}
async function stateLite() {
  const D = { profile: {}, posts: [], snaps: [], about: {}, strategy: null };
  const v = Object.fromEntries(await Promise.all(Object.entries(D).map(async ([k, d]) => [k, (await S.get(k, d)) ?? d])));
  v.about = { ig: v.profile.ig?.username, tt: v.profile.tt?.username, ...v.about }; return v;
}
// 팀원(하진) 의견 → 매니저가 이번 주 남은 계획에 반영
export async function discuss(text) {
  const sg = await S.get('strategy', null); if (!sg?.cur) return null;
  (sg.notes ||= []).push({ at: Date.now(), text, by: 'me' });
  const st = await stateLite(); const An = A.analyze(st); const today = kdate();
  let reply = '';
  if (await AI.hasKey()) {
    try {
      const keep = sg.cur.items.filter(i => i.date < today || i.status !== '예정');
      const left = sg.cur.items.filter(i => i.date >= today && i.status === '예정');
      const r = await AI.gem([`너는 크리에이터 ${st.about.name || '크리에이터'}의 매니저고 팀원 ${st.about.name || '크리에이터'}이 이번 주 계획에 의견을 줬어: "${text}".
이번 주 전략: ${sg.cur.focus}. 남은 계획(JSON): ${JSON.stringify(left.map(({ id, date, time, plat, kind, pillar, idea, hook }) => ({ id, date, time, plat, kind, pillar, idea, hook })))}
오늘은 ${today}. 의견을 반영해 남은 계획을 고쳐. 날짜는 ${today}~${addDays(sg.cur.week, 6)} 안. 받아들일 건 받아들이고, 숫자상 아니다 싶으면 이유를 짧게 말하고 절충해.
JSON만: {"reply":"팀원에게 할 말 2문장(해요체)","items":[{"id":"기존이면 그대로, 새 건 빈 문자열","date","time","plat":"ig"|"tt","kind","pillar","idea","hook","why"}]}`], { json: true, temp: 0.6 });
      if (Array.isArray(r.items) && r.items.length) {
        const old = new Map(left.map(i => [i.id, i]));
        sg.cur.items = [...keep, ...r.items.filter(x => x.date && x.idea).map(x => ({ ...(old.get(x.id) || {}), ...x, id: x.id && old.has(x.id) ? x.id : S.uid(), status: '예정', caption: old.get(x.id)?.idea === x.idea ? old.get(x.id)?.caption : undefined, plat: x.plat === 'tt' ? 'tt' : 'ig' }))].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      }
      reply = r.reply || '반영했어요.';
    } catch (e) { reply = '의견은 적어 뒀어요. AI가 지금 답을 못 해서(' + e.message + ') 다음에 계획을 짤 때 반영할게요.'; }
  } else reply = '의견 적어 뒀어요. 다음 주 계획을 짤 때 꼭 반영할게요. (AI를 연결하면 바로 계획을 고쳐요)';
  sg.notes.push({ at: Date.now(), text: reply, by: 'mgr' }); sg.notes = sg.notes.slice(-40);
  log(sg, '팀원 의견을 듣고 계획을 고쳤어요: ' + text.slice(0, 30));
  await S.set('strategy', sg); return reply;
}
export async function setItem(id, patch) { const sg = await S.get('strategy'); const it = sg?.cur?.items.find(i => i.id === id); if (!it) return; Object.assign(it, patch); if (patch.status) log(sg, `"${it.idea}" ${patch.status === '건너뜀' ? '건너뛰기로 했어요' : patch.status === '찍음' ? '촬영 끝' : patch.status === '올림' ? '올렸다고 들었어요' : patch.status}`); await S.set('strategy', sg); }
export async function replan() { const st = await stateLite(); const An = A.analyze(st); const sg = st.strategy || { notes: [], log: [], results: [] }; sg.cur = await makeWeek(st, An, weekStart(), (sg.notes || []).filter(n => n.by === 'me').slice(-3).map(n => n.text).join(' / ')); log(sg, '처음부터 다시 짰어요: ' + (sg.cur.focus || '')); await S.set('strategy', sg); return sg; }
export { kdate, addDays };
