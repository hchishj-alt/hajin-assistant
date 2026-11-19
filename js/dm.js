// 개인 메신저의 비서 역할: 받은 메시지를 읽고 판단(일정 겹침 확인, 할 일·일정 제안, 답장 초안)
import * as db from './db.js';
import * as brain from './brain.js';
import * as store from './store.js';
import { fmtDate } from './ui.js';

const ASK = /\?|가능|괜찮|되나|될까|어때|시간\s*돼|시간\s*되|올\s*수|볼\s*수|만날|할\s*수\s*있/;
const hm2m = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + (m || 0); };

// 받은 메시지 하나에 대한 판단: { note, actions:[{label, kind, data}], replies:[...] }
export async function judge(text, fromName = '') {
  const out = { note: '', actions: [], replies: [] };
  const w = brain.parseWhen(text);
  const people = [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean);
  if (w.date && brain.isDeadline(text)) {
    const due = (await db.list('tasks')).filter(t => !t.done && t.due && t.due <= w.date).length;
    out.note = `${fmtDate(w.date)}까지 해 달라는 요청이에요. 그날까지 남은 내 할 일은 ${due}개예요.`;
    if (ASK.test(text)) out.replies.push(`네, ${fmtDate(w.date)}까지 할게요.`, `${fmtDate(w.date)}까지는 어려워요. 하루 더 줄 수 있어요?`);
  } else if (w.date) {
    const evs = (await store.eventsOn(w.date)).filter(e => e.kind !== 'focus');
    const clash = w.time ? evs.filter(e => e.start && Math.abs(hm2m(e.start) - hm2m(w.time)) < 60 || (e.start && e.end && hm2m(e.start) <= hm2m(w.time) && hm2m(w.time) < hm2m(e.end))) : [];
    const when = `${fmtDate(w.date)}${w.time ? ' ' + w.time : ''}`;
    if (clash.length) {
      out.note = `${when}에는 “${clash[0].title}”(${clash[0].start}${clash[0].end ? '–' + clash[0].end : ''}) 일정이 있어요.`;
      const free = (await store.freeSlots(w.date)).filter(s => s.mins >= 60).slice(0, 2).map(s => s.start);
      out.replies.push(free.length ? `그 시간엔 일정이 있어요. ${free.join(' 또는 ')}는 어때요?` : '그날은 일정이 차 있어요. 다른 날은 어때요?');
    } else {
      out.note = w.time ? `${when}에는 겹치는 일정이 없어요.` : `${when}에 일정 ${evs.length}개가 있어요.`;
      if (ASK.test(text)) out.replies.push(w.time ? `네, ${when} 가능해요.` : '네, 그날 괜찮아요. 몇 시가 좋아요?');
    }
    const title = brain.cleanTask(text.replace(ASK, ' ')).replace(/[?？]/g, '').trim().slice(0, 40) || `${fromName} 님과 약속`;
    if (!brain.isDeadline(text)) out.actions.push({ label: `일정으로 추가 · ${when}`, kind: 'event', data: { title: title.length < 3 ? `${fromName} 님과 약속` : title, date: w.date, start: w.time || '', end: w.end || '', memo: `${fromName}: ${text}` } });
  }
  const a = brain.analyzeNotes(text, { people });
  for (const t of a.actions.slice(0, 2)) out.actions.push({ label: `할 일로 추가 · ${t.title.slice(0, 22)}`, kind: 'task', data: { title: t.title, due: t.due || w.date || '', who: '', priority: 'normal', memo: `${fromName}: ${text}` } });
  if (!a.actions.length && brain.isDeadline(text) && w.date) out.actions.push({ label: `할 일로 추가 · ${fmtDate(w.date)}까지`, kind: 'task', data: { title: brain.cleanTask(text).slice(0, 60), due: w.date, priority: 'normal', memo: `${fromName}: ${text}` } });
  const money = brain.parseMoney(text); if (money && /(보내|입금|정산|송금|결제)/.test(text)) out.actions.push({ label: `비용으로 기록 · ${money.toLocaleString()}원`, kind: 'expense', data: { title: text.slice(0, 40), amount: money, date: new Date().toISOString().slice(0, 10), memo: `${fromName}: ${text}` } });
  const urls = brain.parseUrls(text); if (urls.length) out.actions.push({ label: '레퍼런스로 저장', kind: 'reference', data: { title: text.replace(urls[0], '').trim().slice(0, 50) || urls[0], url: urls[0] } });
  if (!out.replies.length) out.replies.push(ASK.test(text) ? '확인하고 알려줄게요.' : '확인했어요.');
  if (/고마|감사|수고/.test(text)) out.replies.unshift('저도 고마워요!');
  out.replies = [...new Set(out.replies)].slice(0, 3);
  return out;
}

// 비서 채팅에서 "민서한테 ~라고 전해줘" 같은 말 알아듣기 → { to, body } 또는 null
export function parseSend(text, roster = []) {
  const t = text.trim();
  const m = t.match(/^(.{1,10}?)\s*(?:님)?\s*(?:한테|에게|께|보고)\s+(.+)$/s);
  if (!m) return null;
  const who = m[1].replace(/\s/g, '');
  const to = roster.find(r => r.name === who || r.name.endsWith(who) || (who.length >= 2 && r.name.includes(who)));
  if (!to) return null;
  let body = m[2].trim();
  const verb = /\s*(?:(?:이)?라고|다고|냐고|자고|하라고)?\s*(?:좀\s*)?(?:전해|말해|물어봐|물어|보내|알려|연락해|톡해|메시지\s*보내)\s*(?:줘|주세요|줄래|주라|줘요|봐줘|봐)?\s*[.!?]?$/;
  if (!verb.test(body)) return null;
  const ask = /냐고|물어/.test(body.match(verb)[0]);
  body = body.replace(verb, '').replace(/["“”']/g, '').trim();
  if (ask && !/[?？]$/.test(body)) body = body.replace(/(는지|인지|한지)$/, '').replace(/하$/, '해').replace(/되$/, '돼').replace(/(있|없|았|었|였|겠|같)$/, '$1어').replace(/이$/, '이야') + '?';
  return body.length >= 1 ? { to, body } : null;
}
