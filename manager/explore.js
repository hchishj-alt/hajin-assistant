// 매니저의 탐색: 하루 한 번(앱을 열 때) 구글 검색으로 하진 분야의 지금 트렌드·잘 크는 계정 패턴·알고리즘 소식을 찾아 정리.
// 결과는 전략 짜기와 캡션·피드백에 근거로 들어감. 키가 없으면 앱에 넣어 둔 기본 플레이북만 씀.
import * as S from './store.js';
import * as AI from './ai.js';
import { kdate } from './strategy.js';
import * as W from './web.js';
import { pick } from './fields.js';
export async function niche(st) {
  const caps = st.posts.filter(p => p.caption).slice(0, 15).map(p => p.caption.split('\n')[0].slice(0, 40));
  return `${st.about.vibe || ''} ${st.about.goal || ''} / 최근 캡션: ${caps.join(' | ') || '없음'}`;
}
let busy = null;
export function daily(st, force = false) { return busy ||= run(st, force).finally(() => { busy = null; }); }
// 내 분야 검색어: 내 캡션에 자주 쓴 해시태그 + 지난 탐색 키워드 + 분위기 낱말
export function queries(st, ex) {
  const cnt = {};
  for (const p of st.posts) for (const t of (p.caption || '').match(/#[^\s#]+/g) || []) { const k = t.slice(1).replace(/[^\w가-힣]/g, ''); if (k.length >= 2 && !/^\d+$/.test(k) && /[가-힣]/.test(k) && !/^(fyp|foryou|shorts|reels|추천|팔로우|ootd|대구|서울|부산|일상|데일리)$/i.test(k)) cnt[k] = (cnt[k] || 0) + 1; }
  const mine = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const fromEx = (ex?.keywords || []).map(k => k.replace(/^#/, ''));
  const fq = pick(st.about.vibe || '').flatMap(f => f.q);
  const vibe = fq.length ? [] : (st.about.vibe || '').split(/[,\/]+/).map(x => x.trim()).filter(x => x && x.length < 12);
  return [...new Set([...mine.slice(0, 3), ...fq.slice(0, 3), ...fromEx.slice(0, 2), ...vibe.slice(0, 2)])].slice(0, 5);
}
// 참고 영상 모으기 (AI 없이도 됨): 검색어마다 유튜브 쇼츠, 조회수 순
export async function gatherRefs(st, ex) {
  const qs = queries(st, ex); if (!qs.length) return null;
  const lists = await Promise.all(qs.map(q => W.ytShorts(q).catch(() => [])));
  const seen = new Set(), items = [];
  for (const l of lists) for (const v of l) if (!seen.has(v.id)) { seen.add(v.id); items.push(v); }
  const ko = v => /[가-힣]/.test(v.title) ? 1 : 0;
  items.sort((a, b) => ko(b) - ko(a) || (b.views || 0) - (a.views || 0));
  const old = await S.get('refs', null); const keep = old?.items?.filter(x => x.saved) || [];
  const out = { day: kdate(), at: Date.now(), qs, items: [...keep, ...items.filter(x => !keep.some(k => k.id === x.id))].slice(0, 60), notes: old?.day === kdate() ? old.notes : {} };
  await S.set('refs', out); return out;
}
async function run(st, force) {
  const cur = await S.get('explore', null);
  if (!force && cur?.day === kdate()) return cur;
  const refs = await gatherRefs(st, cur).catch(() => null);
  if (!(await AI.hasKey())) return cur;
  const n = await niche(st);
  const seen = refs?.items?.slice(0, 25).map(v => `${v.title} (조회 ${v.views}, 검색어 ${v.q})`).join('\n') || '';
  const ask = `너는 한국의 SNS 크리에이터 매니저야. 오늘(${kdate()}) 기준으로 정리해.
크리에이터: ${st.about.name || '크리에이터'}, 인스타 ${st.about.ig || ''} / 틱톡 ${st.about.tt || ''}, 자기 자신이 콘텐츠인 초보. 분야 단서: ${n}
지금 이 분야에서 조회수가 높은 쇼츠(앱이 방금 모은 것):\n${seen || '없음'}
찾을/정리할 것:
1) 이 분야(한국, 20대)에서 지금 뜨는 포맷·챌린지·사운드·주제 (위 영상 제목·조회수에서 보이는 패턴 포함)
2) 비슷한 분야에서 팔로워 0→1만을 빠르게 넘긴 크리에이터들의 공통점
3) 최근 인스타·틱톡 알고리즘 변화 중 초보에게 중요한 것
4) 검색이 많은 낱말·해시태그
지어내지 말고, 확실하지 않으면 "추정"이라고 써.
마지막에 JSON 하나만: {"niche":"분야 한 줄","trends":[{"title":"","what":"","forMe":"이 크리에이터식으로 하는 법","plat":"ig|tt|both","heat":1~5}] 4~6개,"playbook":[{"rule":"","how":""}] 4~6개,"algo":[{"news":"","so":""}] 2~4개,"keywords":["#..."] 6~10개,"series":[{"name":"","format":"","why":""}] 2~3개}`;
  let data, src = [], how = 'search';
  try { ({ data, src } = await AI.search(ask)); }
  catch { how = 'data'; data = await AI.gem([ask.replace('마지막에 JSON 하나만:', 'JSON으로만 답해:')], { json: true, temp: 0.5 }); }
  const out = { day: kdate(), at: Date.now(), ...data, src, how };
  await S.set('explore', out);
  const sg = await S.get('strategy', null); if (sg) { (sg.log ||= []).push({ at: Date.now(), text: `오늘 분야 탐색${how === 'data' ? '(모은 영상 기준)' : ''}: ${(data.trends || []).slice(0, 2).map(t => t.title).join(', ')}${(data.trends || []).length > 2 ? ` 외 ${data.trends.length - 2}개` : ''}를 찾았어요.` }); await S.set('strategy', sg); }
  return out;
}
// 키가 없을 때도 쓰는 기본 플레이북 (공개적으로 알려진 초보 성장 원칙)
export const BASE_PLAYBOOK = [
  { rule: '같은 시간에 꾸준히', how: '일주일에 4~5개를 정한 시간에. 쉬는 날도 스토리 1개' },
  { rule: '시리즈로 기억되기', how: '매번 같은 제목 틀(예: "○○의 △△ 1편")로 묶어서 다음 편을 기다리게' },
  { rule: '첫 1초에 결과', how: '완성된 모습·가장 예쁜 컷·한 줄 결론을 맨 앞에. 설명은 뒤로' },
  { rule: '올리고 1시간이 승부', how: '올린 뒤 30분 안에 달린 댓글 전부 답장, 스토리로 새 게시물 알리기' },
  { rule: '같은 분야 사람들과 섞이기', how: '비슷한 규모 계정 5곳에 진심 댓글(이모지만 말고 한 문장) 매일' },
  { rule: '잘된 건 바로 변주', how: '평소 1.5배 넘게 잘된 게시물은 1주 안에 각도만 바꿔 다시' },
];
