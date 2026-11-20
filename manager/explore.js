// 매니저의 탐색: 하루 한 번(앱을 열 때) 구글 검색으로 하진 분야의 지금 트렌드·잘 크는 계정 패턴·알고리즘 소식을 찾아 정리.
// 결과는 전략 짜기와 캡션·피드백에 근거로 들어감. 키가 없으면 앱에 넣어 둔 기본 플레이북만 씀.
import * as S from './store.js';
import * as AI from './ai.js';
import { kdate } from './strategy.js';
export async function niche(st) {
  const caps = st.posts.filter(p => p.caption).slice(0, 15).map(p => p.caption.split('\n')[0].slice(0, 40));
  return `${st.about.vibe || ''} ${st.about.goal || ''} / 최근 캡션: ${caps.join(' | ') || '없음'}`;
}
let busy = null;
export function daily(st, force = false) { return busy ||= run(st, force).finally(() => { busy = null; }); }
async function run(st, force) {
  const cur = await S.get('explore', null);
  if (!force && cur?.day === kdate()) return cur;
  if (!(await AI.hasKey())) return cur;
  const n = await niche(st);
  const prompt = `너는 한국의 SNS 크리에이터 매니저야. 오늘(${kdate()}) 기준 최신 정보를 구글 검색으로 직접 찾아서 정리해.
크리에이터: ${st.about.name || '하진'}, 인스타 ${st.about.ig || ''} / 틱톡 ${st.about.tt || ''}, 자기 자신이 콘텐츠인 초보. 분야 단서: ${n}
찾을 것:
1) 이 분야(한국, 20대)에서 지금(최근 2~4주) 인스타 릴스·틱톡에서 뜨는 포맷·챌린지·사운드·밈·주제
2) 비슷한 분야에서 팔로워 0→1만을 빠르게 넘긴 크리에이터들이 공통으로 한 것(올리는 빈도, 훅, 시리즈화, 소통 방식)
3) 최근 인스타·틱톡 알고리즘이나 기능 변화 중 초보에게 중요한 것(공식 발표·믿을 만한 기사 우선)
4) 이 분야에서 검색이 많은 낱말·해시태그
지어내지 말고 찾은 것만. 확실하지 않으면 "추정"이라고 써.
마지막에 JSON 하나만 출력: {"niche":"이 크리에이터의 분야를 한 줄로","trends":[{"title":"","what":"무엇이 뜨는지","forMe":"하진이 이걸 자기 식으로 하는 법 한 줄","plat":"ig|tt|both","heat":1~5}] 4~6개,"playbook":[{"rule":"뜨는 사람들이 한 것","how":"하진이 할 구체 행동"}] 4~6개,"algo":[{"news":"","so":"그래서 할 일"}] 2~4개,"keywords":["#태그나 검색어"] 6~10개,"series":[{"name":"시리즈 이름","format":"매번 같은 틀","why":"왜 먹힐지"}] 2~3개}`;
  const { data, src } = await AI.search(prompt);
  const out = { day: kdate(), at: Date.now(), ...data, src };
  await S.set('explore', out);
  const sg = await S.get('strategy', null); if (sg) { (sg.log ||= []).push({ at: Date.now(), text: `오늘 분야 탐색: ${(data.trends || []).slice(0, 2).map(t => t.title).join(', ')}${(data.trends || []).length > 2 ? ` 외 ${data.trends.length - 2}개` : ''}를 찾았어요.` }); await S.set('strategy', sg); }
  return out;
}
// 키가 없을 때도 쓰는 기본 플레이북 (공개적으로 알려진 초보 성장 원칙)
export const BASE_PLAYBOOK = [
  { rule: '같은 시간에 꾸준히', how: '인스타 주 4개, 틱톡 주 3개를 정한 시간에. 쉬는 날도 스토리 1개' },
  { rule: '시리즈로 기억되기', how: '매번 같은 제목 틀(예: "디자인과 하진의 ○○ 1편")로 묶어서 다음 편을 기다리게' },
  { rule: '첫 1초에 결과', how: '완성된 모습·가장 예쁜 컷·한 줄 결론을 맨 앞에. 설명은 뒤로' },
  { rule: '올리고 1시간이 승부', how: '올린 뒤 30분 안에 달린 댓글 전부 답장, 스토리로 새 게시물 알리기' },
  { rule: '같은 분야 사람들과 섞이기', how: '비슷한 규모 계정 5곳에 진심 댓글(이모지만 말고 한 문장) 매일' },
  { rule: '잘된 건 바로 변주', how: '평소 1.5배 넘게 잘된 게시물은 1주 안에 각도만 바꿔 다시' },
];
