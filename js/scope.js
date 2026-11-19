// 일정·할 일이 "개인"인지 "팀 업무"인지 글의 맥락으로 판단 (규칙 기반, db 안 씀)
// 팀 업무 = 팀 전체가 보는 업무 일정. 개인 = 나만 보는 일정. 내 일정 화면에는 개인 + 내가 낀 팀 업무가 같이 보임
const PERSONAL = /병원|치과|약국|진료|검진|개인|사적|가족|엄마|아빠|부모님|어머니|아버지|할머니|할아버지|동생|언니|오빠|누나|(?<![가-힣])형(?![가-힣])|남친|여친|애인|남편|아내|데이트|소개팅|친구|생일|기념일|이사|월세|관리비|은행|대출|적금|운동|헬스|필라테스|요가|(?<![a-z])pt(?![a-z])|미용실|(?<!썸)네일|휴가|(?<!촬영\s?|출장\s?|답사\s?)여행(?!\s?(콘텐츠|브이로그|영상|촬영))|나들이|결혼식|장례|과외|알바|수업|학교|과제|시험|동아리|종강|개강|자취|택배|영화(?!\s?(제|촬영|편집|포스터|예고))|콘서트|맛집|쇼핑(?!\s?(몰|라이브|백))|산책|집들이|본가|합주|밴드|동창|모임(?!\s?공간)|병가|반차|연차/i;
const WORK = /팀|썸네일|기획안|기획서|영상|ppt|피피티|카피|협찬|광고|룩북|콘티|대본|스토리보드|컨펌|클라|로케|스튜디오|모델|소품|의상|자막|납기|오티|회의|미팅|킥오프|클라이언트|고객|외주|납품|시안|피드백|촬영|편집|업로드|발표|제안서|견적|계약|정산|공유|리뷰|스프린트|마감|부스|워크숍|회식|지원사업|공모|설명회|간담회|사업계획|제출|심사|입찰|수주|인쇄|현수막|굿즈|브랜딩|콘텐츠|릴스|보고|세금|부가세|사무실|거래처|업체|대표님|팀장님|실장님|주무관|담당자|PD|피디|감독님|작가님/;
const KIN = /(오빠|언니|누나|형|엄마|아빠|어머니|아버지|할머니|할아버지|이모|고모|삼촌|동생|친구|남친|여친|남편|아내)$/;

export const LABEL = { work: '팀 업무', personal: '개인' };
// who = 같이 하는 사람, team = 팀원 이름 목록
export function guess(text, { who = '', team = [] } = {}) {
  let t = String(text || ''); let p = 0, w = 0;
  if (/(?<![A-Za-z])PT(?![A-Za-z])/.test(t) && !/(헬스|운동|트레이너|센터|필라테스|회차|받으러|받기|받음|\d+\s*회)/.test(t)) t = t.replace(/(?<![A-Za-z])PT(?![A-Za-z])/g, '발표'); // 경쟁 PT, PT 리허설
  if (/(본사|시공|철수|리허설|프리오픈|팝업|컨펌|(?<![A-Za-z])OT(?![A-Za-z])|클라이언트|브랜드팀|대행사|제일기획|대관|입점|큐시트|케이터링|인플루언서)/.test(t)) w += 1;
  if (PERSONAL.test(t)) p += 1;
  if (WORK.test(t)) w += 1;
  const names = team.filter(Boolean).flatMap(n => /^[가-힣]{3,4}$/.test(n) ? [n, n.slice(1)] : [n]);
  if (who) { if (names.some(n => who.includes(n))) w += 2; else if (KIN.test(who.replace(/\s/g, ''))) p += 2; else if (/(대표님?|팀장님?|실장님?|교수님?|주무관님?|대리님?|과장님?|매니저님?|담당자|감독님?|작가님?|피디님?|PD님?)$/.test(who)) w += 2; }
  else if (names.some(n => t.includes(n))) w += 1;
  if (p === w) return w ? 'work' : (p ? 'personal' : 'work'); // 팀을 위한 앱이라 애매하면 팀 업무
  return p > w ? 'personal' : 'work';
}
export const of = (e, opt) => e.scope || (e.team ? 'work' : e.team === '' && e.auto === undefined && e.scopeSet ? 'personal' : guess(`${e.title || ''} ${e.memo || ''} ${e.place || ''}`, { who: e.who || e.attendees || '', ...opt }));
// 팀 업무 중 "내가 낀 것": 내가 만들었거나, 같이 하는 사람·담당에 내 이름이 있거나, 사람을 따로 안 적은(팀 전체) 것
export function involves(e, me) {
  if (!me) return true; const g = me.length >= 3 ? me.slice(1) : me;
  const ppl = [e.who, e.attendees, e.assignee].filter(Boolean).join(' ');
  if (!ppl.trim() || !e.by || e.by === me) return true; // 내가 만든 일정의 '누구랑'은 나와 같이 하는 사람
  return ppl.includes(me) || ppl.includes(g) || ppl.includes('나') && /(^|[\s,])나($|[\s,])/.test(ppl) || e.by === me || /전체|모두|다같이|팀\s*전원|전원/.test(ppl);
}
