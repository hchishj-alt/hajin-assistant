// AI 피드백 학습: 멤버가 AI 결과에 👍/👎 와 한마디를 남기면, 규칙으로 바꿔 다음 결과부터 반영.
// 팀에 공유된 피드백은 팀 전체의 AI에, 나만 본 결과의 피드백은 내 비서에만 적용돼요.
import * as db from './db.js';
import * as brain from './brain.js';
import { h, ic, toast } from './ui.js';

const KIND = { summary: '회의 요약', board: '마인드맵 정리', chat: '비서 대답', draft: '임시 항목', auto: '자동 분류', edit: '자동 편집' };
const KINDWORD = { 일정: 'event', '할 일': 'task', 할일: 'task', 지출: 'expense', 비용: 'expense', 메모: 'note', 아이디어: 'idea', 연락처: 'contact', 사람: 'contact' };

// 한마디 → 규칙
export function parse(text) {
  const t = String(text || ''); const r = {};
  if (/짧게|간단|간결|너무\s*길|줄여|핵심만|요점만/.test(t)) r.len = -1;
  if (/자세|길게|더\s*많이|부족|빠졌|빠뜨|누락|놓쳤|더\s*꼼꼼/.test(t) && !/할\s*일|결정/.test(t)) r.len = 1;
  if (/할\s*일.{0,10}(더|빠|누락|놓|못\s*뽑)|액션.{0,6}(더|빠)/.test(t)) r.actions = 1;
  if (/할\s*일.{0,10}(너무\s*많|과하|줄여|아닌\s*것)/.test(t)) r.actions = -1;
  if (/결정.{0,10}(빠|누락|놓|더)/.test(t)) r.decisions = 1;
  if (/질문|고민.{0,8}(빼|필요\s*없)/.test(t)) r.noQuestions = true;
  const boost = [...t.matchAll(/["“']?([가-힣A-Za-z0-9]{2,12})["”']?\s*(?:은|는|이|가|을|를)?\s*(?:중요|꼭|강조|빠지면\s*안|항상\s*넣)/g)].map(m => m[1]);
  const mute = [...t.matchAll(/["“']?([가-힣A-Za-z0-9]{2,12})["”']?\s*(?:은|는|이|가|을|를|얘기는|이야기는)?\s*(?:빼|제외|필요\s*없|안\s*중요|무시)/g)].map(m => m[1]);
  const STOP = /^(요약|할일|결정|질문|이건|그건|이거|그거|너무|내용|부분|정리|이런|그런)$/;
  if (boost.length) r.boost = boost.filter(w => !STOP.test(w)); if (mute.length) r.mute = mute.filter(w => !STOP.test(w));
  const km = t.match(/(일정|할\s*일|지출|비용|메모|아이디어|연락처)\s*(?:이|가)?\s*(?:아니라|말고|아니고)\s*(일정|할\s*일|지출|비용|메모|아이디어|연락처)/);
  if (km) r.kind = KINDWORD[km[2].replace(/\s/g, '') === '할일' ? '할 일' : km[2]];
  return r;
}
export const describe = r => [r.len < 0 && '요약 더 짧게', r.len > 0 && '요약 더 자세히', r.actions > 0 && '할 일 더 꼼꼼히', r.actions < 0 && '할 일은 확실한 것만', r.decisions > 0 && '결정사항 더 챙기기', r.noQuestions && '질문·고민 빼기', ...(r.boost || []).map(w => `"${w}" 강조`), ...(r.mute || []).map(w => `"${w}" 빼기`), r.kind && '종류 바로잡기'].filter(Boolean);

// 쌓인 피드백 전체 → 지금 적용할 설정
export async function prefs() {
  const all = (await db.list('feedback')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const off = new Set(await db.kvGet('ai:rulesOff', []));
  const p = { len: 0, actions: 0, decisions: 0, noQuestions: false, boost: new Set(), mute: new Set(), rules: [] };
  for (const f of all) {
    if (off.has(f.id)) continue; const r = f.rule || {}; const d = describe(r); if (!d.length) continue;
    if (r.len) p.len = Math.max(-2, Math.min(2, p.len + r.len)); if (r.actions) p.actions = Math.max(-1, Math.min(1, p.actions + r.actions)); if (r.decisions) p.decisions = 1; if (r.noQuestions) p.noQuestions = true;
    (r.boost || []).forEach(w => { p.boost.add(w); p.mute.delete(w); }); (r.mute || []).forEach(w => { p.mute.add(w); p.boost.delete(w); });
    p.rules.push({ id: f.id, by: f.by, at: f.createdAt, text: f.text, does: d, team: !!f.team });
  }
  return p;
}
// 분석 결과에 학습한 설정 적용 (원문 text 가 있으면 요약 길이를 다시 뽑음)
export async function refine(a, text = '') {
  const p = await prefs(); const used = [];
  const out = { ...a };
  if (p.len && text) { const base = (a.summary || []).length || 3; const n = Math.max(1, Math.min(10, base + p.len * (base > 4 ? 2 : 1))); const stars = (a.summary || []).filter(s => s.startsWith('★')); out.summary = [...stars, ...brain.summarize(text, n)]; used.push(p.len < 0 ? '요약 더 짧게' : '요약 더 자세히'); }
  if (p.mute.size) { const bad = s => [...p.mute].some(w => String(s.title || s).includes(w)); for (const k of ['summary', 'decisions', 'questions', 'ideas', 'actions', 'dates']) if (out[k]) { const n0 = out[k].length; out[k] = out[k].filter(s => !bad(s)); if (out[k].length !== n0) used.push('뺄 말 반영'); } out.keywords = (out.keywords || []).filter(k => !p.mute.has(k)); }
  if (p.boost.size && text) { const ss = brain.sentences(text).filter(s => [...p.boost].some(w => s.includes(w))); const add = ss.filter(s => !(out.summary || []).some(x => x.includes(s.slice(0, 12)))).slice(0, 3); if (add.length) { out.summary = [...(out.summary || []), ...add]; used.push([...p.boost].map(w => `"${w}" 강조`).join(', ')); } out.keywords = [...new Set([...[...p.boost].filter(w => text.includes(w)), ...(out.keywords || [])])]; }
  if (p.actions < 0 && out.actions) { out.actions = out.actions.filter(x => x.who || x.due); used.push('할 일은 확실한 것만'); }
  if (p.actions > 0 && text && out.actions) { const have = new Set(out.actions.map(x => x.src)); for (const s of brain.sentences(text)) if (!have.has(s) && /(하자|할게|해야|하기|필요|챙기|알아보|찾아보|연락|예약|주문|구매|사야)/.test(s) && s.length > 6 && s.length < 80) out.actions.push({ title: brain.cleanTask(s), who: '', due: brain.parseWhen(s).date || '', src: s, loose: true }); used.push('할 일 더 꼼꼼히'); }
  if (p.decisions > 0 && text) { const more = brain.sentences(text).filter(s => /(하기로|으로\s*하|로\s*하자|좋겠|가는\s*걸로|하는\s*걸로)/.test(s) && !(out.decisions || []).includes(s)); if (more.length) { out.decisions = [...(out.decisions || []), ...more].slice(0, 14); used.push('결정사항 더 챙기기'); } }
  if (p.noQuestions) { out.questions = []; used.push('질문·고민 빼기'); }
  out.learnedUsed = [...new Set(used)];
  return out;
}
export async function stats() {
  const all = await db.list('feedback'); const up = all.filter(f => f.rating > 0).length, down = all.filter(f => f.rating < 0).length;
  const recent = all.filter(f => Date.now() - new Date(f.createdAt) < 14 * 864e5), old = all.filter(f => Date.now() - new Date(f.createdAt) >= 14 * 864e5);
  const rate = xs => xs.length ? Math.round(xs.filter(f => f.rating > 0).length / xs.length * 100) : null;
  return { n: all.length, up, down, rate: rate(all), recent: rate(recent), before: rate(old), byKind: Object.fromEntries(Object.keys(KIND).map(k => [k, rate(all.filter(f => f.kind === k))]).filter(([, v]) => v != null)) };
}
export const KINDS = KIND;

// 결과 아래에 붙이는 피드백 줄. onLearn: 규칙이 생겼을 때(다시 정리 등)
export function widget({ kind, ref = '', source = '', shared = false, onLearn } = {}) {
  const box = h('div.fb');
  const send = async (rating, text = '') => {
    const rule = parse(text);
    const item = await db.put('feedback', { kind, ref, rating, text, rule, source: String(source).slice(0, 300), by: await db.kvGet('name', '하진'), team: shared && (await db.get('team-main')) ? 'team-main' : '' });
    if (rule.kind && source) { brain.learnKind(source, rule.kind); await db.kvSet('brain:learned', brain.getLearned()); }
    const d = describe(rule);
    toast(d.length ? `배웠어요: ${d.join(', ')}. 다음부터 반영할게요` : rating > 0 ? '고마워요. 이 방식을 유지할게요' : text ? '기록했어요. 비슷한 피드백이 쌓이면 방식을 바꿀게요' : '기록했어요. 어떤 점이 아쉬웠는지 적어 주면 바로 배워요');
    if (d.length && onLearn) onLearn(item);
    return item;
  };
  const draw = (state = '') => {
    box.replaceChildren();
    if (state === 'done') { box.append(h('span.faint.tiny', ic('check', 12), ' 피드백 반영됨')); return; }
    const inp = h('input.in', { placeholder: '예: 더 짧게 / 할 일이 빠졌어 / "예산"은 꼭 넣어줘 / 이건 일정이 아니라 할 일', 'aria-label': '피드백 한마디' });
    const submit = async r => { await send(r, inp.value.trim()); draw('done'); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && inp.value.trim()) { e.preventDefault(); submit(state === 'up' ? 1 : -1); } });
    box.append(h('span.fb-q', 'AI 결과가 어땠나요?'),
      h('button.fb-b' + (state === 'up' ? '.on' : ''), { type: 'button', 'aria-label': '좋아요', onclick: () => state === 'up' ? submit(1) : (send(1), draw('done')) }, ic('thumb', 14)),
      h('button.fb-b.down' + (state === 'down' ? '.on' : ''), { type: 'button', 'aria-label': '아쉬워요', onclick: () => draw('down') }, ic('thumb', 14)),
      state ? h('div.fb-row', inp, h('button.btn.sm.pri', { type: 'button', onclick: () => submit(-1) }, '보내기')) : h('button.fb-t', { type: 'button', onclick: () => draw('down') }, '고칠 점 알려주기'));
    if (state) setTimeout(() => inp.focus(), 30);
  };
  draw();
  return box;
}
