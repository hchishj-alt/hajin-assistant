// 비서의 대화: 항목으로 만들 말이 아니면 그냥 말로 받아 줌 (규칙 기반, 외부 AI 없음)
import * as db from './db.js';
import * as store from './store.js';

const pick = a => a[Math.floor(Math.random() * a.length)];
const hour = () => new Date().getHours();
const RX = {
  hi: /^(안녕|하이|헬로|hello|hi|ㅎㅇ|좋은\s*(아침|저녁|밤)|반가워)/i,
  thanks: /(고마워|고맙|감사|땡큐|thank|ㄱㅅ)/i,
  ok: /^(응|ㅇㅇ|ㅇㅋ|오케이|ok|okay|넵|네|넹|알겠어|알았어|그래|좋아|굿|됐어|ㅇㅇㅇ)[.!~ ]*$/i,
  no: /^(아니|아냐|ㄴㄴ|노|no|됐어요?|괜찮아|안\s*해도\s*돼)[.!~ ]*$/i,
  who: /(너는?\s*(누구|뭐야|뭐니)|넌\s*누구|이름이?\s*뭐|정체가)/,
  can: /(뭐\s*할\s*수\s*있|뭘\s*할\s*수|할\s*수\s*있는\s*(게|거|것)|어떻게\s*(써|쓰는|사용)|사용법|도움말|기능\s*(뭐|알려))/,
  tired: /(힘들|피곤|졸려|지쳤|지친다|우울|짜증|스트레스|하기\s*싫|귀찮|멘붕|망했|막막)/,
  happy: /(신난|신나|기분\s*좋|행복|뿌듯|해냈|끝냈다|성공|드디어)/,
  praise: /(잘했|잘한다|똑똑|최고|대박|굿잡|천재|귀엽)/,
  scold: /(바보|멍청|못\s*알아\s*(들|듣)|왜\s*이래|답답해|엉망이)|^(이상해|틀렸어|별로야?|아니야 틀렸어)[.!~ ]*$/,
  bored: /(심심|뭐\s*하지|뭐해|놀자)/,
  laugh: /^[ㅋㅎ]{2,}[.!~ ]*$|^(ㅋ|ㅎ)+$/,
  bye: /^(잘\s*자|굿나잇|바이|bye|안녕히|수고했어|수고|퇴근)/i,
  // 비서 행동에 대한 말: "할 일로 만들지 말고 대화처럼"
  meta: /((할\s*일|일정|항목|임시).{0,12}(만들지\s*마|만들기가?\s*아니|말고|하지\s*마|그만))|(대화(처럼|로|하듯)|말동무|그냥\s*(말|얘기|대화))/,
  fix: /^[“"']?(.{1,20}?)[”"']?\s*(?:이|가|은|는)?\s*아니(?:라|고|야[,.]?)\s*[“"']?(.{1,20}?)[”"']?\s*(?:이야|야|예요|이에요|임|입니다|라고|이라고)?[.!~]*$/,
};

// 이 말이 "항목으로 만들 말"이 아니라 "대화"인지 (비서가 먼저 확인)
export function isTalk(t) {
  t = t.trim();
  if (RX.fix.test(t) || RX.meta.test(t)) return true;
  if (/\d/.test(t) || /https?:/.test(t)) return false;
  return t.length <= 30 && [RX.hi, RX.thanks, RX.ok, RX.no, RX.who, RX.can, RX.tired, RX.happy, RX.praise, RX.scold, RX.bored, RX.laugh, RX.bye].some(r => r.test(t));
}

// 이름 바로잡기 기억: "김민서가 아니라 최민서야" → 다음부터 알아서 바꿔 들음
export const aliases = () => db.kvGet('chat:alias', {});
export async function applyAlias(text) { const a = await aliases(); for (const [from, to] of Object.entries(a)) if (text.includes(from) && !text.includes(to)) text = text.split(from).join(to); return text; }

export async function reply(text, { name = '' } = {}) {
  const t = text.trim(); const you = name ? name + ' 님' : '';
  if (RX.meta.test(t)) { await db.kvSet('chat:mode', 'talk'); return { text: '알겠어요. 이제 아무 말이나 할 일로 만들지 않을게요. 날짜·시간·금액이 있거나 “~해야 해”, “할 일: …”처럼 분명할 때만 임시 항목을 만들고, 나머지는 그냥 대화로 받을게요.' }; }
  const fx = t.match(RX.fix);
  if (fx && fx[1].trim() !== fx[2].trim() && fx[1].trim().split(/\s+/).length <= 2 && fx[2].trim().split(/\s+/).length <= 2) {
    const from = fx[1].trim(), to = fx[2].trim(); let n = 0;
    // 아직 확정 전인 임시 항목과, 저장된 연락처·할 일·일정에서 바로잡기
    for (const d of await store.drafts()) { const s = JSON.stringify(d.data); if (s.includes(from)) { await db.patch(d.id, { data: JSON.parse(s.split(from).join(to)) }); n++; } }
    for (const col of ['contacts', 'tasks', 'events']) for (const it of await db.list(col)) { const patch = {}; for (const k of ['name', 'title', 'who', 'memo']) if (typeof it[k] === 'string' && it[k].includes(from)) patch[k] = it[k].split(from).join(to); if (Object.keys(patch).length) { await db.patch(it.id, patch); n++; } }
    await db.kvSet('chat:alias', { ...(await aliases()), [from]: to });
    return { text: n ? `‘${from}’을(를) ‘${to}’(으)로 ${n}곳 고쳤어요. 앞으로도 ‘${to}’(으)로 알아들을게요.` : `알겠어요. 앞으로 ‘${from}’이라고 하면 ‘${to}’(으)로 알아들을게요.`, chips: [{ label: '되돌리기', undoAlias: from }] };
  }
  if (RX.who.test(t)) return { text: '하진 님 팀의 비서예요. 일정·할 일·지출·연락처를 말 한 줄로 받아 적고, 팀원에게 말을 전하고, 회의 내용을 정리해요. 정해진 규칙으로 움직여서 사람처럼 뭐든 답하지는 못해요.' };
  if (RX.can.test(t)) return { text: '이렇게 말해 보세요.', list: ['“내일 3시 클라이언트 미팅” → 일정', '“금요일까지 시안 보내야 해” → 할 일', '“점심 9000원” → 지출', '“민서한테 내일 가능하냐고 물어봐줘” → 메신저로 전달', '“오늘 일정”, “밀린 할 일” → 찾아보기', '“앱 고쳐줘: …” → 코덱스용 요청서'] };
  if (RX.hi.test(t)) { const h = hour(); return { text: `${h < 11 ? '좋은 아침이에요' : h < 18 ? '안녕하세요' : '좋은 저녁이에요'}${you ? ', ' + you : ''}. ${await brief()}` }; }
  if (RX.thanks.test(t)) return { text: pick(['별말씀을요.', '도움이 됐다니 좋아요.', '언제든요.']) };
  if (RX.bye.test(t)) return { text: pick(['오늘도 수고했어요. 푹 쉬어요.', '수고 많았어요. 내일 봬요.']) };
  if (RX.laugh.test(t)) return { text: pick(['ㅎㅎ', '웃을 일이 있었나 봐요.', 'ㅋㅋ 좋네요.']) };
  if (RX.tired.test(t)) { const s = await brief(true); return { text: `${pick(['고생이 많아요.', '오늘 많이 달렸나 봐요.', '그럴 때 있죠.'])} ${s} 급하지 않은 건 내일로 미뤄도 괜찮아요.`, chips: [{ label: '오늘 남은 일 보기', say: '오늘 할 일' }] }; }
  if (RX.happy.test(t)) return { text: pick(['와, 잘됐어요!', '좋은 소식이네요. 축하해요!', '뿌듯하겠어요.']) };
  if (RX.praise.test(t)) return { text: pick(['고마워요. 더 잘 알아듣게 계속 배울게요.', '칭찬 고마워요!']) };
  if (RX.scold.test(t)) return { text: '미안해요, 제가 잘못 알아들었나 봐요. 어떻게 하면 좋을지 한 줄로 알려 주면 다음부터 그렇게 할게요. 대답 아래 “고칠 점 알려주기”를 눌러도 돼요.' };
  if (RX.bored.test(t)) return { text: `${await brief()} 가볍게 끝낼 수 있는 것부터 하나 해 볼까요?`, chips: [{ label: '이번 주 할 일', say: '이번 주 할 일' }] };
  if (RX.ok.test(t)) return { text: pick(['네!', '좋아요.', '알겠어요.']) };
  if (RX.no.test(t)) return { text: pick(['네, 그대로 둘게요.', '알겠어요.']) };
  // 무슨 말인지 딱 잡히지 않을 때: 만들지 않고 물어봄
  return { text: pick(['들었어요.', '그렇군요.', '네, 알겠어요.']) + ' 적어 둘까요?', chips: [{ label: '할 일로', make: 'task' }, { label: '메모로', make: 'note' }, { label: '아이디어로', make: 'idea' }, { label: '그냥 넘기기', skip: true }] };
}

async function brief(soft) {
  const today = new Date(); const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const ev = (await store.eventsOn(ds)).filter(e => e.kind !== 'focus').length; const tk = (await db.list('tasks')).filter(x => !x.done && x.due && x.due <= ds).length;
  if (!ev && !tk) return soft ? '오늘은 남은 일정도, 밀린 할 일도 없어요.' : '오늘은 일정도 밀린 할 일도 없어요.';
  return `오늘 일정 ${ev}개, 오늘까지인 할 일 ${tk}개가 있어요.`;
}
