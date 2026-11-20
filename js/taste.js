// 지원사업·정보 랭킹 취향 학습: 팀원이 "관심 있어요 / 필요 없어요"라고 한 것을 모아 순위를 우리에게 맞게 좁힘
import * as db from './db.js';

const STOP = /^(지원사업|지원|사업|모집|공고|안내|접수|신청|참여|참가|기업|대상|관련|정보|소식|랭킹|순위|분야|글|것|거|및|등|위한|통해|추진|개최|운영|실시|선정|발표|최대|이상|이하|오는|올해|내년|우리|이런|그런|같은|이거|그거|좀|더|다|안|\d+년?|\d+차)$/;
const JOSA = /(으로|에서|에게|한테|까지|부터|이랑|이나|은|는|이|가|을|를|의|에|로|와|과|도|랑|나)$/;
export const words = t => [...new Set(String(t).replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/).map(w => w.length > 2 ? w.replace(JOSA, '') : w).filter(w => w.length >= 2 && !STOP.test(w)))].slice(0, 8);
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const team = async () => (await db.get('team-main')) ? 'team-main' : '';
const who = () => db.kvGet('name', '하진');

export const rows = () => db.list('leadfb');
// 모인 피드백 → { w: {낱말: 가중치}, by: {낱말: [누가]}, links: {주소: {up, down}} }
export function profile(list) {
  const w = {}, by = {}, links = {};
  for (const r of list) {
    const sign = r.kind === 'up' ? 1 : -1;
    if (r.link) { const l = (links[r.link] ||= { up: 0, down: 0, by: {} }); l[r.kind]++; l.by[r.by] = r.kind; }
    for (const x of r.words || []) { w[x] = (w[x] || 0) + sign * (r.word ? 4 : 1); if (r.word) (by[x] ||= []).push(r.by); }
  }
  return { w, by, links };
}
export const load = async () => profile(await rows());
// 이 글에 배운 취향을 적용: 두 번 이상 같은 쪽으로 모였거나, 말로 직접 알려 준 낱말만 반영
export function bonus(it, prof) {
  if (!prof) return { delta: 0, up: [], down: [] };
  const text = `${it.title} ${it.desc || ''}`.toLowerCase(); let delta = 0; const up = [], down = [];
  for (const [x, v] of Object.entries(prof.w)) { if (Math.abs(v) < 2 || !text.includes(x.toLowerCase())) continue; delta += Math.max(-4, Math.min(4, v)) * 4; (v > 0 ? up : down).push(x); }
  return { delta: Math.max(-20, Math.min(20, Math.round(delta))), up, down };
}

// 글 하나에 대한 피드백 (한 사람이 한 글에 하나). 같은 걸 다시 누르면 취소
export async function markItem(it, kind) {
  const me = await who(); const id = 'fb-' + hash(me + '|' + it.link);
  const cur = await db.get(id);
  if (cur && cur.kind === kind) { await db.remove(id); return { off: true, words: cur.words }; }
  const ws = words(it.title);
  await db.put('leadfb', { id, kind, link: it.link, title: it.title, words: ws, by: me, team: await team() });
  return { words: ws };
}
// 낱말로 직접 알려 준 피드백 ("제조 쪽은 필요 없어")
export async function markWords(ws, kind) {
  const me = await who(); const t = await team();
  for (const x of ws) await db.put('leadfb', { id: 'fb-' + hash(me + '|w|' + x), kind, words: [x], word: true, by: me, team: t });
}
export async function forget(ws) { let n = 0; for (const r of await rows()) if (r.word && r.words.some(x => ws.includes(x))) { await db.remove(r.id); n++; } return n; }

const UP = /(더\s*(많이\s*)?(보여|알려|찾아|띄워|올려)|관심\s*(이\s*)?(있|많)|위주로|중요해|필요해|좋아|맞아|우선)/;
const DOWN = /(필요\s*(가\s*)?없|관심\s*(이\s*)?없|안\s*봐도|빼\s*(줘|주|고)|그만\s*보여|안\s*맞|숨겨|별로|줄여|내려)/;
const UNDO = /(취소|되돌려|다시\s*보여|잊어|지워)/;
const ABOUT = /랭킹|지원사업|공고|지원금|공모|소식|정보/;
// 일반 비서 화면에서: 랭킹 얘기인 게 분명할 때만 피드백으로 받음
export const isFeedback = t => ABOUT.test(t) && (UP.test(t) || DOWN.test(t)) && !/\d{1,2}\s*(시|일|월)/.test(t);
const subject = (t, re) => words(t.slice(0, t.search(re)).replace(/(랭킹|순위)에서?/g, ' ').replace(/(관련|쪽|분야|같은\s*(거|것|글)|글|내용)(은|는|이|가|을|를|도)?(\s|$)/g, ' ').split(/,|\s+(?:랑|하고|이나|또는|그리고)\s+/).join(' '));
const nth = n => `${n}번`;

// 비서 위젯·비서 화면이 부르는 한마디 처리. ctx.rank = 지금 화면의 순위 [{it, s}]
export async function talk(text, ctx = {}) {
  const t = text.trim(); const rank = ctx.rank || []; const num = t.match(/(\d{1,2})\s*(번|위|등)/);
  if (num && rank.length) {
    const x = rank[+num[1] - 1]; if (!x) return { text: `지금 순위는 ${rank.length}번까지 있어요.` };
    const short = x.it.title.length > 26 ? x.it.title.slice(0, 25) + '…' : x.it.title;
    if (/왜|이유|어째서/.test(t)) { const s = x.s; const rule = `${nth(num[1])} “${short}” 글은 시급성 ${s.urg}, 유익성 ${s.fit}, 우선순위 ${s.pri}${s.tst ? `, 팀 취향 ${s.tst > 0 ? '+' : ''}${s.tst}` : ''}로 ${s.total}점이에요.${s.dday != null ? ` 마감까지 ${s.dday}일 남았고,` : ' 마감일은 못 찾았고,'} ${s.why.length ? `‘${s.why.join('’, ‘')}’ 때문에 우리와 맞다고 봤어요.` : '우리 업종과 맞는 말은 못 찾았어요.'}${s.learn?.up.length ? ` 팀이 관심 있다고 한 ‘${s.learn.up.join('’, ‘')}’도 들어 있어요.` : ''}${s.learn?.down.length ? ` 팀이 필요 없다고 한 ‘${s.learn.down.join('’, ‘')}’이 있어 깎였어요.` : ''}`; let ai = null; try { ai = await (await import('./ai.js')).whyRank({ title: x.it.title, desc: x.it.desc || '', facts: rule, n: +num[1] }); } catch { } return { text: ai ? `${ai}\n(${s.total}점: 시급성 ${s.urg}, 유익성 ${s.fit}, 우선순위 ${s.pri}${s.tst ? `, 팀 취향 ${s.tst > 0 ? '+' : ''}${s.tst}` : ''})` : rule, chips: [{ label: '필요 없어요', say: `${num[1]}번 필요 없어` }, { label: '관심 있어요', say: `${num[1]}번 관심 있어` }] }; }
    const kind = DOWN.test(t) ? 'down' : UP.test(t) ? 'up' : '';
    if (kind) { const r = await markItem(x.it, kind); if (r.off) await markItem(x.it, kind); return { text: kind === 'down' ? `${nth(num[1])} “${short}” 글은 내렸어요. 이런 글이 한 번 더 필요 없다고 나오면 비슷한 글도 같이 내릴게요.` : `${nth(num[1])} “${short}”에 관심 표시했어요. 비슷한 글이 또 관심을 받으면 위로 올릴게요.`, changed: true, chips: words(x.it.title).slice(0, 3).map(w => ({ label: kind === 'down' ? `‘${w}’ 글은 다 빼기` : `‘${w}’ 글 더 보기`, say: kind === 'down' ? `${w} 필요 없어` : `${w} 더 보여줘` })) }; }
  }
  if (/(배운|취향|기준|학습|뭐\s*배웠|알고\s*있)/.test(t) && !DOWN.test(t) && !UP.test(t)) {
    const p = await load(); const up = Object.entries(p.w).filter(([, v]) => v >= 2).map(([k]) => k), down = Object.entries(p.w).filter(([, v]) => v <= -2).map(([k]) => k);
    if (!up.length && !down.length) return { text: '아직 배운 게 없어요. “콘텐츠 더 보여줘”, “제조 쪽은 필요 없어”, “3번 필요 없어”처럼 알려 주세요.' };
    return { text: `지금까지 팀이 알려 준 기준이에요.\n더 보기: ${up.join(', ') || '없음'}\n줄이기: ${down.join(', ') || '없음'}`, chips: [...up, ...down].slice(0, 5).map(w => ({ label: `‘${w}’ 잊기`, say: `${w} 취소` })) };
  }
  if (UNDO.test(t)) { const ws = subject(t, UNDO); const n = ws.length ? await forget(ws) : 0; return n ? { text: `‘${ws.join('’, ‘')}’에 대해 배운 걸 지웠어요.`, changed: true } : { text: '지울 기준을 못 찾았어요. “제조 취소”처럼 낱말을 같이 말해 주세요.' }; }
  const kind = DOWN.test(t) ? 'down' : UP.test(t) ? 'up' : '';
  if (kind) {
    const ws = subject(t, kind === 'down' ? DOWN : UP);
    if (!ws.length) return { text: kind === 'down' ? '어떤 글이 필요 없는지 알려 주세요. “제조 쪽은 필요 없어”나 “3번 필요 없어”처럼요.' : '어떤 글을 더 볼지 알려 주세요. “충주 지원사업 더 보여줘”처럼요.' };
    await markWords(ws, kind);
    return { text: kind === 'down' ? `알겠어요. ‘${ws.join('’, ‘')}’ 글은 순위를 낮출게요. 팀 모두의 랭킹에 반영돼요.` : `알겠어요. ‘${ws.join('’, ‘')}’ 글을 위로 올릴게요. 팀 모두의 랭킹에 반영돼요.`, changed: true, chips: [{ label: '되돌리기', say: `${ws.join(' ')} 취소` }] };
  }
  return null;
}
