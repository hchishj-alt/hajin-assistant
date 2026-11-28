// 불편 접수: 소머AI에게 한 불평·짜증·거듭 고쳐 말한 것을 "고칠 일"로 받아 적음 (자료 모으기가 아니라 접수)
// · 접수된 것은 팀 공간으로 올라가 관리자(하진) 기기에 모이고, 고쳐지면 말한 사람에게 알림이 감
// · 판단(judge)은 순수 함수라 자가 점검에서 그대로 시험함
import * as db from './db.js';

export const STATUS = ['접수', '확인', '수정 중', '반영됨'];
export const KIND = { say: '채팅에서 한 말', down: '아쉬워요 누름', refix: '같은 걸 거듭 고침', write: '직접 적음' };

const EXPLICIT = /^(?:불편\s*(?:사항|접수|신고)?|건의\s*(?:사항)?|버그\s*(?:신고|제보)?|오류\s*(?:신고|제보)?|개선\s*(?:사항|요청))\s*[:：]\s*(.+)$/s;
const SWEAR = /(ㅅㅂ|ㅆㅂ|시발|씨발|씨바|ㅈㄴ|존나|졸라|ㅈ같|좆|개같|개빡|빡치|빡쳐|빡침|ㅂㅅ|병신|미친|ㅁㅊ|ㅡㅡ|;;|에휴|아오|짜증|답답|열받|킹받|환장|돌겠|미치겠)/;
/* 소머AI·앱을 두고 하는 말이 분명한 것 */
const STRONG = /(왜\s*이래|왜\s*이러|왜\s*이럼|왜\s*저래|뭐야\s*이거|이게\s*뭐야|이상하게\s*(알아|적|넣|만들|읽|나와|들)|못\s*알아|말귀|엉뚱|잘못\s*(알아|들었|적|넣|만들|읽)|아니라고|아니라니까|아니잖아|그게\s*아니|또\s*(이래|이러|틀|안\s*돼|안\s*됨)|몇\s*번(을|째)?\s*(말|얘기)|먹통|튕겨|튕김|튕기|버그\s*(있|났|남|야|임|네|인가|인\s*듯|같)|오류\s*(나|났|떠|뜸|남)|에러\s*(나|났|떠|뜸|남)|똑바로|제대로\s*(좀|해|안|못)|쓸모\s*없|못\s*쓰겠|못\s*써\s*먹|바보|멍청)/;
/* 다른 이야기일 수도 있어서, 앱 이야기이거나 방금 답을 들은 직후일 때만 */
const WEAK = /(버그|오류|에러|이상해|이상함|이상한데|이상하네|틀렸|틀림|틀리잖|안\s*돼|안\s*됨|안\s*되네|안\s*되잖|안\s*된다|안\s*되는데|안\s*먹|안\s*눌|안\s*열|안\s*떠|안\s*뜸|안\s*뜨|안\s*보여|안\s*보임|안\s*나와|안\s*나옴|안\s*바뀌|안\s*움직|안\s*와|안\s*옴|안\s*울|멈췄|멈춤|꺼져|꺼짐|느려|느림|버벅|렉\s*걸|불편|구려|구림|별로|엉망|쓰레기|사라졌|없어졌|날아갔|날라갔|지워졌|헷갈|복잡해|어려워|모르겠)/;
const APPISH = /(앱|어플|비서|소머|ai|에이아이|너는?(?=\s|$)|넌(?=\s|$)|니가|네가|이거|화면|버튼|단추|알림|알람|동기화|로그인|캘린더|메신저|입력|글씨|저장|대기함|마이크|음성|받아쓰기|위젯|확정)/i;
const OTHERS = /(클라이언트|고객|업체|교수|팀장|대표|사장|거래처|담당자|엄마|아빠|친구|남친|여친)/;
const WORKISH = /(\d{1,2}\s*(시|일|월)|\d\s*(원|만\s*원|천\s*원)|까지\s*$|해야\s*(해|돼|함)\s*$|내일|모레|다음\s*주|이번\s*주|회의|미팅|촬영|마감)/;
const HASCMD = /(\d|요일|오전|오후|내일|모레|으로\s*(바꿔|옮겨|해)|로\s*(바꿔|옮겨|해)|취소|지워|버려|확정)/;

// 이 말이 불편 접수인지. recent = 방금(몇 분 안에) 소머AI 답을 들은 뒤인지, people = 아는 사람 이름
// 돌려주는 것: null | { body, strong, quiet }   quiet = 고치는 말도 같이 들어 있어서, 접수만 조용히 하고 평소대로 처리할 것
export function judge(text, { recent = false, people = [] } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return null;
  const ex = t.match(EXPLICIT); if (ex && ex[1].trim().length >= 2) return { body: ex[1].trim(), strong: true, quiet: false, explicit: true };
  if (t.length > 70) return null;
  const appish = APPISH.test(t), strong = STRONG.test(t), weak = WEAK.test(t), swear = SWEAR.test(t);
  if (!strong && !weak && !swear) return null;
  /* 남 이야기("클라이언트가 짜증 냄", "민서 왜 이래")는 접수가 아님 */
  const other = OTHERS.test(t) || people.some(p => p && p.length >= 2 && (t.includes(p) || (p.length === 3 && t.includes(p.slice(1)))));
  if (other && !appish) return null;
  { const who = t.match(/^([가-힣]{2,4}?)(?:이|가|은|는|씨|님)?\s+왜\s*(?:이래|이러|저래|이럼)/); if (who && !APPISH.test(who[1]) && !/^(진짜|아니|대체|도대체|근데|그런데|갑자기|오늘|지금|자꾸|계속|얘는?|이건)$/.test(who[1])) return null; }   /* "○○ 왜 이래"는 그 사람·그 일 이야기 */
  /* 할 수 있는지 묻는 말("엑셀로는 안 돼?")은 물음이지 불편이 아님 */
  if (/[?？]\s*$/.test(t) && !swear && !strong && !/왜/.test(t)) return null;
  let hit = false;
  if (strong) hit = true;
  else { /* 방금 답을 들은 뒤라도, 다른 주어가 있는 말("오늘 컨디션 별로", "친구랑 싸워서 답답해")은 내 이야기라 접수하지 않음 */
    const bare = t.replace(new RegExp(WEAK.source, 'g'), '').replace(new RegExp(SWEAR.source, 'g'), '').replace(/(아니|진짜|이거|이게|너무|완전|정말|계속|자꾸|아직도|왜|또|좀|아|하|와|헐|개)/g, '').replace(/[^가-힣A-Za-z0-9]/g, '');
    if (weak) hit = appish || (recent && t.length <= 28 && bare.length <= 2);
    else hit = t.length <= 32 && (appish || (recent && (bare.length <= 2 || HASCMD.test(t)))); }
  if (!hit) return null;
  /* 일정·돈 이야기 안에 섞인 말("내일 회의 왜 이래")은 앱 이야기가 분명할 때만 */
  if (WORKISH.test(t) && !appish && !(recent && (swear || /아니라고|아니라니까|아니잖아|그게\s*아니/.test(t)))) return null;
  const rest = t.replace(SWEAR, '').replace(STRONG, '').replace(/^(아니|아\s|하\s|진짜|아니\s*근데)\s*/, '');
  const quiet = HASCMD.test(rest) && /[가-힣0-9]{2,}/.test(rest);
  return { body: t, strong: strong || swear, quiet };
}

const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const device = () => { try { const w = Math.min(innerWidth, screen.width || innerWidth); return /iPad|Macintosh.*Mobile/.test(navigator.userAgent) || (w >= 700 && w < 1100 && 'ontouchstart' in window) ? '아이패드' : w < 700 ? '폰' : 'PC'; } catch { return ''; } };

// 방금 무슨 말을 했고 소머AI가 뭐라고 했는지 (접수증에 같이 남김). skipId = 지금 한 말 자체는 빼기
export async function context(cur = '') {
  const ms = (await db.list('chat')).filter(m => !m.gripe).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (ms.length && ms[ms.length - 1].role === 'me' && ms[ms.length - 1].text === cur) ms.pop();   /* 지금 한 말 자체는 빼고 그 앞을 봄 */
  const bot = [...ms].reverse().find(m => m.role === 'bot'); const said = [...ms].reverse().find(m => m.role === 'me');
  let made = [];
  if (bot && bot.draftIds && bot.draftIds.length) { for (const id of bot.draftIds.slice(0, 4)) { const d = await db.get(id); if (d) made.push(cut(`${d.kind || ''}: ${(d.data && (d.data.title || d.data.name)) || ''}${d.data && d.data.date ? ' ' + d.data.date : ''}${d.data && d.data.start ? ' ' + d.data.start : ''}`, 60)); } }
  const recent = !!(bot && Date.now() - new Date(bot.createdAt) < 4 * 6e4);
  return { said: said ? cut(said.text, 160) : '', bot: bot ? cut(bot.text, 220) : '', made, recent, ai: !!(bot && bot.ai) };
}

// 접수증 만들기. 불평을 연달아 하면(1분 반 안) 새로 만들지 않고 앞의 것에 덧붙임
export async function file({ text, kind = 'say', route = '', before = null, quiet = false } = {}) {
  const me = await db.kvGet('me:member', null); const name = await db.kvGet('name', '');
  const mine = (await db.list('gripes')).filter(g => g.by === name).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const last = mine[0];
  const prevSaid = (before && before.said) || '';   /* 바로 앞에 한 말이 그 접수(또는 덧붙인 말)일 때만 이어 붙임. 사이에 다른 말을 했으면 새 접수 */
  if (last && last.status === '접수' && kind === 'say' && last.kind === 'say' && Date.now() - new Date(last.createdAt) < 90 * 1000 && prevSaid && (prevSaid === cut(last.text, 160) || (last.more || []).includes(prevSaid))) { const more = [...(last.more || []), cut(text, 160)].slice(-6); await db.patch(last.id, { more }); return { ...last, more, joined: true }; }
  const V = await import('./version.js');
  return db.put('gripes', { text: cut(text, 300), kind, by: name || '이름 없음', byId: (me && me.id) || '', route, said: (before && before.said) || '', bot: (before && before.bot) || '', made: (before && before.made) || [], ai: !!(before && before.ai), ver: V.VERSION, dev: device(), status: '접수', quiet: !!quiet, team: (await db.get('team-main')) ? 'team-main' : '' });
}
export const all = async () => (await db.list('gripes')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
export const isOpen = g => g.status !== '반영됨' && g.status !== '접수 취소';
export async function setStatus(id, status, note = '') { const p = { status }; if (status === '반영됨') { p.fixedAt = new Date().toISOString(); if (note) p.fixNote = note; } return db.patch(id, p); }

// 접수 답을 들은 바로 뒤(2분 안)에 이어서 설명하는 말("4시라고 했는데 3시로 넣었잖아")은 새 항목으로 만들지 않고 접수증에 덧붙임
const DETAIL = /(했는데|했잖아|랬는데|라고\s*했|넣었|만들었|나왔|떴|바뀌었|잖아|는데[.!~ ]*$|거든|말이야|라니까|니까[.!~ ]*$|(?:^|\s)(?:안|못|왜)\s)/;
const NEWITEM = /(해야\s*(해|돼|함|됨)|까지|하기|보내기|예약|회의|미팅)\s*[.!~]*$/;
export async function waitMore(id) { await db.kvSet('me:gripewait', { id, at: Date.now() }); }
export async function followUp(text) {
  const w = await db.kvGet('me:gripewait', null); if (!w || Date.now() - w.at > 2 * 6e4) return null;
  const t = String(text || '').trim(); if (!DETAIL.test(t) || NEWITEM.test(t) || t.length > 160) { await db.kvSet('me:gripewait', null); return null; }
  const g = await db.get(w.id); if (!g || g.col !== 'gripes') return null;
  await db.patch(g.id, { more: [...(g.more || []), cut(t, 160)].slice(-6) }); await db.kvSet('me:gripewait', { id: g.id, at: Date.now() });
  return { more: true, id: g.id };
}

// 같은 것을 거듭 고쳐 말하면(두 번째부터) 조용히 접수. key = 방금 만든 항목들
export async function noteFix(text, route = '') {
  const last = await db.kvGet('chat:last', null); const key = last && last.ids ? last.ids.join(',') : ''; if (!key) return null;
  let run = await db.kvGet('me:gripefix', null);
  if (!run || run.key !== key || Date.now() - run.at > 10 * 6e4) run = { key, said: [], id: '' };
  run.said.push(cut(text, 80)); run.at = Date.now();
  let made = null;
  if (run.said.length >= 2) {
    const body = `같은 걸 ${run.said.length}번 고쳐 말했어요: ` + run.said.map(s => `“${s}”`).join(' → ');
    if (run.id && (await db.get(run.id))) { await db.patch(run.id, { text: cut(body, 300) }); }
    else { const first = await db.get(last.ids[0]); const before = { said: first && first.source ? cut(first.source, 160) : '', bot: '', made: first ? [cut(`${first.kind || ''}: ${(first.data && (first.data.title || first.data.name)) || ''}`, 60)] : [] }; made = await file({ text: body, kind: 'refix', route, before, quiet: true }); run.id = made.id; }
  }
  await db.kvSet('me:gripefix', run);
  return made;
}

// 관리자가 모아서 복사해 개발 쪽에 넘길 글
export function asText(list) {
  return list.map((g, i) => [`${i + 1}. [${g.status}] ${g.by} · ${String(g.createdAt || '').slice(0, 16).replace('T', ' ')} · ${[g.route && '화면 ' + g.route, g.dev, g.ver && 'v' + g.ver].filter(Boolean).join(' · ')}`,
    `   한 말: ${g.text}`, ...(g.more || []).map(m => `   이어서: ${m}`), g.said ? `   그 전에 한 말: ${g.said}` : '', g.bot ? `   소머AI 답${g.ai ? '(AI)' : '(규칙)'}: ${g.bot}` : '', g.made && g.made.length ? `   만들어진 것: ${g.made.join(' / ')}` : '', `   번호: ${g.id}`].filter(Boolean).join('\n')).join('\n\n');
}

// 고친 판이 나오면 data/gripe-fixed.json 에 번호가 실려 옴 → 관리자 기기가 그 접수를 "반영됨"으로 바꿈
export async function applyFixed() {
  const A = await import('./admin.js'); if (!(await A.isAdmin())) return 0;
  let j = null; try { const r = await fetch('data/gripe-fixed.json', { cache: 'no-cache' }); if (r.ok) j = await r.json(); } catch { return 0; }
  let n = 0;
  for (const f of (j && j.fixed) || []) { const g = f && f.id ? await db.get(f.id) : null; if (g && g.col === 'gripes' && g.status !== '반영됨') { await setStatus(g.id, '반영됨', [f.ver && 'v' + f.ver, f.note].filter(Boolean).join(' · ')); n++; } }
  return n;
}

// 알림 목록에 넣을 것: 관리자에게는 새 접수, 말한 사람에게는 반영 소식
export async function alarms(now = new Date()) {
  const A = await import('./admin.js'); const me = await A.who(); const out = [];
  for (const g of await db.list('gripes')) {
    const mine = g.by === me.name || (me.was || []).includes(g.by);
    if (me.admin && me.loggedIn && !mine && !g.quiet && g.status === '접수') { const t = new Date(g.createdAt); if (+now - t < 24 * 36e5) out.push({ id: `gripe|${g.id}`, kind: 'bell', at: t, until: new Date(+t + 24 * 36e5), title: `${g.by} 님이 불편을 접수했어요`, body: cut(g.text, 80), url: '#/dev' }); }
    if (mine && g.status === '반영됨' && g.fixedAt && !g.quiet) { const t = new Date(g.fixedAt); if (+now - t < 3 * 864e5) out.push({ id: `gripefix|${g.id}`, kind: 'bell', at: t, until: new Date(+t + 3 * 864e5), title: '접수한 불편이 반영됐어요', body: cut(g.text, 60) + (g.fixNote ? ` (${g.fixNote})` : ''), url: '#/dev' }); }
  }
  return out;
}
export async function counts() { const xs = await db.list('gripes'); const open = xs.filter(isOpen); return { all: xs.length, open: open.length, fresh: open.filter(g => g.status === '접수').length }; }
