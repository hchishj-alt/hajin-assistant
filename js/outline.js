// 말한 문장을 "주제 → 하위 항목"으로 쪼개 정리 (규칙 기반). 마인드맵 회의의 "대화 → 노드"가 씀
import * as brain from './brain.js';

const FILL = /(^|\s)(오늘은?|내일은?|이번\s*주는?|일단은?|우선은?|그냥|좀|약간|아마도?|이제|음+|어+|아+|그니까|그러니까|뭔가|진짜|되게|막|저는|제가|나는|내가|우리는?|우리가)(?=\s)/g;
const SPLIT = /[.!?\n]+|\s+(?:그리고는?|또한?|근데|그런데|그래서|그\s*다음에?|말고도|외에도|이랑|하고|및)\s+|,\s*|(?<=할듯|할\s듯|겠다|같아|같다|야지|할게|하자|해야\s?함|해야\s?돼|해야\s?해)\s+/;
const PRON = /^(이거|그거|저거|이건|그건|여기|거기|뭐|이것|그것|나|저|우리|다들|얘|걔)$/;
// 주제를 알면 "말하지 않은 것"도 같이 챙길 항목을 제안
const HINTS = [
  [/지원사업|지원금|공모|보조금|바우처/, ['마감일 확인', '자격 요건', '제출 서류', '우선순위']],
  [/촬영|로케|스튜디오/, ['장소', '장비', '촬영 일정', '콘티']],
  [/전시|부스|행사|팝업/, ['일정', '설치', '홍보', '예산']],
  [/굿즈|제작물|인쇄|현수막|포스터/, ['품목', '수량', '단가', '업체']],
  [/홍보|마케팅|sns|인스타|릴스|콘텐츠/i, ['채널', '올릴 날', '문구', '이미지']],
  [/예산|비용|견적|정산/, ['항목', '금액', '지출 시점']],
  [/회의|미팅|킥오프/, ['안건', '참석자', '결정할 것']],
  [/디자인|시안|로고|브랜딩/, ['레퍼런스', '시안', '피드백', '마감']],
  [/영상|편집|모션|자막/, ['컷 구성', '자막', '음악', '썸네일']],
  [/클라이언트|외주|계약|발주/, ['요구 사항', '견적', '마감', '계약']],
  [/일정|스케줄|마감/, ['마감일', '담당', '순서']],
  [/채용|팀원|멤버|역할/, ['역할', '담당', '일정']],
];
export const hintsFor = t => (HINTS.find(([re]) => re.test(t)) || [, []])[1];
const GENERIC = ['목표', '할 일', '일정', '담당', '걸리는 점'];
// "지원사업 회의를 할 거야", "전시 준비 하자"처럼 주제를 꺼내는 말
const ANNOUNCE = /^(.{2,16}?)\s*(회의|미팅|얘기|이야기|논의|기획|정리|준비|건)?(을|를|에\s*대해서?|에\s*관해서?)?\s*(할\s*거야|할\s*거예요|할게요?|하자|시작\S*|해\s*보자|해\s*볼까\S*|합시다|할\s*예정\S*|하려고\s*\S*|얘기\s*\S+|이야기\s*\S+|논의\s*\S+)$/;

const josa = s => s.replace(/(을|를|이|가|은|는|도|만|의|에|에서|으로|로|와|과|랑|이랑)$/, '');
// 말끝을 정리해 "~하기 / ~ 정리" 같은 짧은 항목으로
export function act(s) {
  let t = s.trim().replace(/[.!?~]+$/, ''); let did = false;
  t = t.replace(/\s*(할|될)?\s*(듯|것\s*같(아요?|다|음)?)$/, '').replace(/야\s*(겠\S*|지|함|해요?|한다|돼요?|됨|해|하는데|되는데|할|될)$/, '야');
  if (/야$/.test(t) && t.length > 2) {
    did = true;
    const map = [[/\s*해야$/, ''], [/봐야$/, '보기'], [/려야$/, '리기'], [/겨야$/, '기기'], [/져야$/, '지기'], [/워야$/, '우기'], [/와야$/, '오기'], [/써야$/, '쓰기'], [/줘야$/, '주기'], [/꿔야$/, '꾸기'], [/춰야$/, '추기'], [/(어|아)야$/, '기'], [/야$/, '기']];
    for (const [re, to] of map) if (re.test(t)) { t = t.replace(re, to); break; }
    if (!t) t = '하기';
  } else {
    const m = t.match(/\s*(하자|할게요?|할래요?|하기로(\s*\S+)?|해\s*보자|하면\s*좋겠\S*|할\s*예정\S*|해\s*줘|해\s*주세요|할\s*것|하려고\S*|할까\S*|해야지)$/);
    if (m && m.index > 0) { t = t.slice(0, m.index).replace(/(으로|로)$/, ''); did = true; }
    else t = t.replace(/(겠다|겠어요?|같아요?|같다|이에요|예요|입니다|이야|임)$/, '');
  }
  if (/(있는|없는|하는|되는|받는|쓰는|보는|가는|오는|주는)$/.test(t)) t += ' 것';
  // "우선순위를 정리" → "우선순위 정리" (단, "받을 수 있는"의 '을'은 그대로)
  t = t.split(/\s+/).map((w, i, a) => i < a.length - 1 && a[i + 1] !== '수' && w.length > 2 ? w.replace(/(을|를)$/, '') : w).join(' ').replace(/\s+/g, ' ').trim();
  return { text: t.length > 24 ? t.slice(0, 23) + '…' : t, todo: did };
}

function clause(c) {
  c = (' ' + c + ' ').replace(FILL, ' ').replace(/\s+/g, ' ').trim(); if (c.length < 2) return null;
  let m;
  if ((m = c.match(/^([^\s].{0,18}?)\s*(?:[-–—>:：\/]|→)\s*(.{1,30})$/)) && !/^\d/.test(m[2])) return { topic: m[1].trim(), point: act(m[2]) };
  if ((m = c.match(/^(.{1,16}?)(?:에\s*(?:관한|대한|관해서?|대해서?)|\s*관련(?:해서|된|해)?|\s*쪽은?|\s*건은?|\s*같은\s*경우는?)\s+(.+)$/))) return { topic: josa(m[1].trim()), point: act(m[2]) };
  if ((m = c.match(ANNOUNCE)) && !/(을|를|은|는|로|한테|에게)\s/.test(m[1]) && m[1].trim().split(/\s+/).length <= 3 && (m[2] || m[1].trim().split(/\s+/).length <= 2)) { const tp = josa(m[1].trim().replace(/\s*(회의|미팅|얘기|이야기|논의)$/, '')); if (tp.length >= 2 && !PRON.test(tp) && !/^(할\s*일|오늘|내일|이번\s*주)$/.test(tp)) return { topic: tp, point: null, announce: true }; }
  if ((m = c.match(/^(.{1,16}?)(은|는)\s+(.+)$/)) && !PRON.test(m[1]) && !/[을를]|\S(하|되|있|없|받|보|가|오|주|쓰)$/.test(m[1]) && m[1].split(/\s+/).length <= 3) return { topic: m[1].trim(), point: act(m[3]) };
  if ((m = c.match(/^(.{1,20}?)(을|를)\s+(?!수\s)(.+)$/)) && !PRON.test(m[1]) && m[1].split(/\s+/).length <= 4) return { topic: m[1].trim(), point: act(m[3]) };
  const words = c.split(/\s+/);
  if (words.length === 1) { const a = act(c); return a.todo ? { topic: '', point: a } : { topic: josa(a.text), point: null }; }
  const head = words[0].replace(/(한테|에게|께|에서|에|이랑|랑|와|과|의|이|가|도)$/, '');
  return { topic: head.length >= 2 ? head : '', point: act(words.slice(head.length >= 2 ? 1 : 0).join(' ')) };
}

// → [{ topic, points: [{ text, label }], hints: [] }]
export function structure(text) {
  const groups = []; let last = null;
  for (const raw of String(text).split(SPLIT).map(s => s && s.trim()).filter(Boolean).slice(0, 8)) {
    const r = clause(raw); if (!r) continue;
    const label = /급하|급해|당장|빨리|오늘\s*까지|오늘\s*안/.test(raw) ? 'urgent' : /결정|확정|하기로|으로\s*가자/.test(raw) ? 'important' : /\?|할까|어떨까|고민|문제/.test(raw) ? 'idea' : '';
    let g = r.topic ? groups.find(x => x.topic === r.topic) : last;
    if (!g) { if (!r.topic) { g = { topic: '', points: [] }; } else g = { topic: r.topic, points: [] }; groups.push(g); }
    if (r.point && r.point.text && r.point.text !== g.topic && !g.points.some(p => p.text === r.point.text)) g.points.push({ text: r.point.text, label, todo: r.point.todo });
    if (r.announce) g.full = true;
    last = g;
  }
  for (const g of groups) if (g.full) { const hs = hintsFor(g.topic); g.set = (hs.length ? hs : GENERIC).filter(hn => !g.points.some(p => p.text === hn)); }
  for (const g of groups) g.hints = g.topic ? hintsFor(g.topic).filter(hn => !g.points.some(p => p.text.includes(hn.split(' ')[0]))).slice(0, 3) : [];
  for (const g of groups) if (g.full) g.hints = [];
  return groups.filter(g => g.topic || g.points.length);
}
