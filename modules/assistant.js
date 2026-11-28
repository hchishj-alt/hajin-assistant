import { h, ic, clear, toast, md, fmtDate, busy, todayStr } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { answer } from '../js/query.js';
import * as FB from '../js/feedback.js';
import { draftCard } from '../js/draftcard.js';
import { describe } from '../js/fields.js';
import { createRecorder, canVoice, toText, waveEl, fmtSec } from '../js/voice.js';
import { go, updateBadge } from '../js/app.js';

const SUGGEST = ['오늘 일정', '오늘 빈 시간', '이번 주 할 일', '밀린 할 일', '이번 달 지출', '확인 대기함', '내일 오후 3시 팀 회의', '점심 9000원', '금요일까지 포트폴리오 정리'];

let onAiKey = () => { };   // 팀 AI 키가 들어오면 비서 화면의 연결 표시를 바꾸는 손잡이 (화면을 다시 그릴 때 갈아 끼움)
export default {
  async render(root, params, opts) {
    const sheet = (opts && opts.sheet) || null;   /* 다른 화면 위에 띄운 비서 창이면: 그 화면에 맞는 말, 화면 이름 */
    const list = h('div.chat');
    const ta = h('textarea', { rows: 1, placeholder: sheet ? '말하거나 적어 주세요' : '무엇이든 말하거나 적어 주세요', 'aria-label': '비서에게 입력' });
    const preview = h('div.chips', { style: { minHeight: '22px', padding: '0 4px 6px' } });
    const micBtn = h('button.btn.icon.ghost', { title: '말로 입력', 'aria-label': '말로 입력', onclick: () => toggleMic() }, ic('mic', 20));
    const sendBtn = h('button.btn.pri.icon', { 'aria-label': '보내기', onclick: () => send() }, ic('right', 20));
    const recBar = h('div.row.hide', { style: { padding: '6px 4px', gap: '10px' } });
    let micBusy = false;
    /* AI가 권한 다음 말 가운데 화면으로 가자는 말은 바로 여는 단추로, 답에 "○○ 화면"이 나오면 그 화면 여는 단추도 붙임 */
    const navChips = (say, next = []) => { const out = [];
      for (const s of next) { const to = brain.navPhrase(s); if (to) { if (!out.some(c => c.go === to)) out.push({ label: s.replace(/\s*(화면|메뉴|페이지|탭)?(을|를)?\s*(으로|로)?\s*(좀\s*)?(보여|열어|가|이동해|켜|띄워)\s*(줘|주세요|줄래)?[.!?]*$/, '') + ' 열기', go: to }); } else out.push({ label: s, say: s }); }
      for (const x of brain.screensIn(say)) if (!out.some(c => c.go === x.to)) out.push({ label: `${x.name} 열기`, go: x.to });
      return out.slice(0, 4); };
    const botSay = async (text, chips = []) => { await drawMsg(await db.put('chat', { role: 'bot', text, chips }), new Map()); scrollDown(); };
    const micOff = () => { clearInterval(timer); recBar.classList.add('hide'); micBtn.classList.remove('rec'); };
    const projBar = h('div.chips', { style: { padding: '0 4px 6px' } });
    const aiBar = h('div.chips', { style: { margin: '-6px 0 10px' } });
    const sug = h('div.suggest', (sheet && sheet.suggest && sheet.suggest.length ? sheet.suggest : SUGGEST).map(s => h('button.chip', { onclick: () => { ta.value = s; send(); } }, s)));
    /* 큰 비서 화면에서도 내 역할에서 자주 묻는 말을 앞에 둠 */
    if (!sheet) import('../js/helper.js').then(H => H.suggestFor('assistant')).then(xs => { const add = xs.filter(x => !SUGGEST.includes(x)).slice(0, 3); sug.prepend(...add.map(s => h('button.chip', { onclick: () => { ta.value = s; send(); } }, s))); }).catch(() => { });

    const page = h('div.chatpage');
    root.append(page);
    page.append(...[
      sheet ? null : h('div.page-head', h('div', h('h1', '비서'), h('p.sub', '한 줄로 일정·할 일·지출·연락처·메모 무엇이든. 결과는 확정 전까지 임시예요.')),
        h('div.row', h('button.btn.sm.ghost', { onclick: clearChat }, ic('trash', 14), '대화 지우기'))),
      aiBar, list,
      h('div.composer', sug, projBar, recBar, h('div.box', ta, micBtn, sendBtn), preview)].filter(Boolean));

    // 아래 값들은 지난 대화를 그리는 동안에도 쓰이므로, 기다리는 일(await)보다 먼저 만들어 둠
    // 일정에 빠진 필수 정보(날짜·시간)와 누구랑·어디서를 되물어 채움
    const ASK = {
      day: ['무슨 요일이에요?', ['월요일', '화요일', '수요일', '목요일', '금요일', '아직 몰라']],
      date: ['언제예요?', ['오늘', '내일', '이번 주 토요일', '아직 몰라']],
      time: ['몇 시예요?', ['오전 10시', '오후 2시', '저녁 7시', '종일']],
      more: ['누구랑, 어디서 하는지도 알려 주면 채워 둘게요.', ['없어']],
      who: ['누구랑 가요?', ['혼자', '팀이랑']],
    };
    // 확정된 카드는 어디로 갔는지 보여 주고, 누르면 그 화면으로 감 (rec: 저장된 기록)
    const staticCard = (d, rec, at) => { const k = store.KINDS[d.kind] || {}; const ok = d.status === 'approved'; const gone = ok && rec && rec.deleted; const src = rec && !rec.deleted ? rec : d.data;
      const sub = !ok ? '버림' : gone ? '확정했다가 지움' : ['확정됨', at ? at.where : '', describe(d.kind, src)].filter(Boolean).join(' · '); const route = ok && !gone ? (at ? at.route : k.route) : '';
      return h('div.draft' + (ok && !gone ? '.done' : '.gone') + (route ? '.click' : ''), { 'data-did': d.id, ...(route ? { role: 'button', tabindex: 0, title: '눌러서 저장된 곳 보기', onclick: () => go(route), onkeydown: e => { if (e.key === 'Enter') go(route); } } : {}) },
        h('div.k', ic(k.icon || 'file')), h('div.grow', h('div.small', { style: { fontWeight: 650 } }, src.title || src.name || d.data.title || d.data.name), h('div.faint.tiny', sub)), route ? h('span.faint', { style: { flex: 'none', alignSelf: 'center' } }, ic('right', 16)) : null); };
    const staticCardOf = async d => { const rec = d.status === 'approved' && d.resultId ? await db.get(d.resultId) : null; let at = null; if (rec && !rec.deleted) { try { at = await (await import('../js/where.js')).placeOf(d.kind, rec); } catch { } } return staticCard(d, rec, at); };
    // 되묻는 중에 온 말이 답이 아니라 새로 적는 말인지 (예: "몇 시예요?"에 "점심 9000원")
    const looksNew = (text, k, ctx) => { const ps = brain.interpret(text, ctx); if (!ps.length) return false; if (ps.length > 1) return true; const p = ps[0];
      if (['expense', 'income', 'contact', 'vendor', 'query', 'reference', 'buy', 'nav', 'timelog'].includes(p.kind)) return true;
      const w = brain.parseWhen(text); const rest = w.hits.reduce((x, hh) => x.replace(hh, ' '), text).replace(/(쯤|경|정도|일\s*듯|인\s*듯|같아요?|이요|부터|까지|으로|로|에|이야|야|예요|이에요|요|해|하자|할게|일걸|쯤이야)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
      if ((k === 'date' || k === 'time') && p.kind === 'talk' && rest.replace(/\s/g, '').length >= 3 && !/^(아직|몰라|미정|나중에|종일|하루\s*종일|글쎄|아마|음)/.test(rest)) return true;   // "내일 비 온대"는 답이 아니라 다른 말
      if (k === 'date' || k === 'time') return (p.kind === 'task' || p.kind === 'event' || p.kind === 'note') && rest.length >= 5 && !/^(아직|몰라|미정|나중에|종일|하루\s*종일)/.test(rest);
      return (p.kind === 'task' || p.kind === 'event') && w.hits.length > 0 && rest.length >= 4; };
    const missing = (data, src) => { if (data.endDate && data.endDate > (data.date || '')) return []; const w = brain.parseWhen(src || ''); const need = []; if ((!w.date || w.vague) && !data._dated) need.push('date'); if (!data.start && !data._allday && !/(오전|오후|아침|저녁|밤|점심|새벽|종일|하루\s*종일)/.test(src || '')) need.push('time'); if (!data._asked && ((!data.who && !data.place && !data.area) || (!data.who && /(방문|관람|구경|저녁|점심|식사|약속|영화|여행|나들이|데이트|모임)/.test(data.title || '')))) need.push(data.place || data.area ? 'who' : 'more'); return need; };
    let recorder = null, timer = 0;

    // 이 기기에 AI가 연결됐는지 한눈에 (연결은 기기마다 따로라서, 폰에서는 안 돼 있을 수 있음)
    const drawAiBar = () => import('../js/ai.js').then(async AI => { clear(aiBar); if (await AI.enabled()) aiBar.append(h('span.chip.ok', { title: '말 읽기·질문 답하기·요약을 Gemini가 해요' }, ic('sparkles', 12), 'AI 연결됨'));
      else aiBar.append(h('button.chip.warn', { style: { minHeight: '36px' }, title: '지금은 앱 규칙으로만 읽고 있어요. 연결하면 긴 글 요약과 질문 답하기가 돼요', onclick: async () => { if (await AI.keyed()) { await db.kvSet('ai:on', true); toast('AI를 켰어요'); drawAiBar(); } else (await import('../js/keyshare.js')).guide(drawAiBar); } }, ic('sparkles', 12), (await AI.keyed()) ? 'AI 꺼짐 · 켜기' : 'AI 연결 안 됨 · 연결하기')); }).catch(() => { });
    drawAiBar(); window.removeEventListener('hajin:ai-key', onAiKey); onAiKey = drawAiBar; window.addEventListener('hajin:ai-key', onAiKey);
    // 기존 대화
    const msgs = (await db.list('chat')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-60);
    const hello = ((await db.kvGet('me:member', null)) || {}).name || (await db.kvGet('name', '')) || '';   /* 팀원이 열어도 자기 이름으로 인사 */
    if (!msgs.length) list.append(botBubble(h('div', h('p', `안녕하세요${hello ? ' ' + hello + '님' : ''}. 이렇게 말해 보세요.`), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, ['"다음 주 화요일 2시 홍대 촬영"', '"어도비 구독 3만7천원 결제"', '"홍길동 010-1234-5678 디자이너"', '"오늘 일정 보여줘"', '회의나 생각을 길게 말하면 요약·키워드·할 일로 정리해요'].map(x => h('li.small', x))))));
    const pending = new Map((await store.drafts()).map(d => [d.id, d]));
    for (const m of msgs) await drawMsg(m, pending, false);
    // 답을 못 받고 지나간 말(오류·끊김)이 있으면 한 번 알려 주고 다시 읽을 수 있게 함
    { const dayAgo = Date.now() - 864e5; const lost = msgs.filter((m, i) => { if (m.role !== 'me' || m.ok || m.err || m.noted || !(Date.parse(m.createdAt || 0) > dayAgo)) return false; const nx = msgs[i + 1]; return nx ? nx.role === 'me' : Date.now() - Date.parse(m.createdAt) > 120000; });
      if (lost.length) { for (const m of lost) await db.patch(m.id, { noted: true }); await drawMsg(await db.put('chat', { role: 'bot', text: `아까 답을 못 드린 말이 ${lost.length}개 있어요. 누르면 지금 다시 읽을게요.`, chips: lost.slice(-3).map(m => ({ label: m.text.length > 26 ? m.text.slice(0, 26) + '…' : m.text, say: m.text })) }), pending, false); } }
    scrollDown();

    ta.addEventListener('input', () => { autoGrow(); livePreview(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    if (!sheet || !matchMedia('(pointer:coarse)').matches) setTimeout(() => ta.focus(), 50);   /* 폰에서 띄운 창은 키보드가 권하는 말을 가리지 않게 */
    const pre = sessionStorage.getItem('assistant:prefill');
    if (pre) { sessionStorage.removeItem('assistant:prefill'); send(pre); }

    // 지금 이야기하는 프로젝트: 프로젝트 이름을 말하면 따라 바뀌고, 이름 없이 적은 것도 여기에 묶임 (3시간 지나면 풀림)
    async function curProj() { const c = await db.kvGet('chat:project', null); if (!c || !c.name || Date.now() - (c.at || 0) > 3 * 36e5) return ''; return (await store.projects()).includes(c.name) ? c.name : ''; }
    async function setProj(name) { await db.kvSet('chat:project', name ? { name, at: Date.now() } : null); await drawProj(); }
    async function drawProj() { clear(projBar); const cur = await curProj(); const all = await store.projects(); if (!all.length) return;
      if (cur) projBar.append(h('span.chip.acc', { title: '이름 없이 적은 것도 이 프로젝트로 묶어요' }, ic('folder', 12), `지금 프로젝트: ${cur}`), h('button.chip', { 'aria-label': '프로젝트 묶기 끄기', style: { minHeight: '36px' }, onclick: () => setProj('') }, '끄기'));
      if (all.length > 1 || !cur) { const sel = h('select.chip', { 'aria-label': '지금 프로젝트 고르기', style: { maxWidth: '180px', minHeight: '36px' }, onchange: () => setProj(sel.value) }, h('option', { value: '' }, cur ? '다른 프로젝트로' : '프로젝트 고르기'), ...all.filter(p => p !== cur).map(p => h('option', { value: p }, p))); projBar.append(sel); } }
    await drawProj();
    function autoGrow() { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; }
    function livePreview() {
      clear(preview);
      const v = ta.value.trim();
      if (!v) return;
      if (v.length > 220) { preview.append(h('span.chip.acc', ic('sparkles', 12), '긴 글 → 요약·키워드·할 일로 정리')); return; }
      for (const p of brain.interpret(v).filter(x => x.kind !== 'talk').slice(0, 4)) {
        const k = store.KINDS[p.kind];
        preview.append(h('span.chip.acc', ic(k?.icon || (p.kind === 'query' ? 'search' : 'right'), 12), p.kind === 'query' ? '찾아보기' : p.kind === 'nav' ? '이동' : k?.label));
        const desc = p.kind === 'query' || p.kind === 'nav' ? '' : describe(p.kind, p.data);
        if (desc) preview.append(h('span.chip', desc));
      }
    }
    function scrollDown() { requestAnimationFrame(() => { const sc = sheet && page.closest('.modal'); if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }); }

    async function send(text = ta.value.trim(), origin = 'chat') {
      if (!text) return;
      ta.value = ''; autoGrow(); clear(preview);
      const me = await db.put('chat', { role: 'me', text });
      list.append(meBubble(text));
      scrollDown();
      try { await handle(text, origin); await db.patch(me.id, { ok: true }); }
      catch (e) { store.logError(e, 'assistant'); try { await db.patch(me.id, { err: true }); await drawMsg(await db.put('chat', { role: 'bot', text: '이 말을 처리하다 문제가 생겼어요. 한 번 더 읽어 볼게요, 아래를 눌러 주세요. (' + e.message + ')', chips: [{ label: '다시 읽기', say: text }] }), new Map()); } catch { list.append(botBubble('처리하다 문제가 생겼어요: ' + e.message)); } }
      scrollDown();
    }

    // 되묻는 동안에도 임시 카드를 같이 보여 줌(첫 물음에 한 번). 답이 올 때마다 그 카드를 새로 그림
    async function askNext(d, need, lead = '', carded = false) {
      const k = need[0]; await refreshCards([d.id]);
      if (!k) { await db.kvSet('chat:ask', null); await drawMsg(await db.put('chat', { role: 'bot', text: (lead || '다 채웠어요.') + ' 맞으면 확정해 주세요.', draftIds: carded && list.querySelector(`.draft[data-did="${d.id}"]`) ? [] : [d.id] }), new Map([[d.id, await db.get(d.id)]])); updateBadge(); return; }
      const week = k === 'date' ? ((d.source || '').match(/(다다음\s*주|다담주|다음\s*주|담주|이번\s*주|금주|\d{1,2}\s*월\s*(?:첫|둘|셋|넷|다섯|마지막)\s*째?\s*주)/) || [''])[0] : '';
      await db.kvSet('chat:ask', { id: d.id, need, carded: true, week });
      const A = ASK[k === 'date' && week ? 'day' : k];
      await drawMsg(await db.put('chat', { role: 'bot', text: `${lead}${lead ? ' ' : ''}“${d.data.title}” ${week ? week + ' ' : ''}${A[0]}`, chips: A[1].map(x => ({ label: x, say: x })), draftIds: carded ? [] : [d.id] }), new Map([[d.id, await db.get(d.id)]]));
    }
    async function refreshCards(ids) { for (const id of ids || []) { const els = list.querySelectorAll(`.draft[data-did="${id}"]`); if (!els.length) continue; const d = await db.get(id); if (!d) continue; const done = d.status === 'pending' ? null : await staticCardOf(d); els.forEach((el, i) => el.replaceWith(d.status === 'pending' ? draftCard(d, () => updateBadge()) : (i ? done.cloneNode(true) : done))); } }
    async function answerAsk(pend, text) {
      const d = await db.get(pend.id); if (!d || d.status !== 'pending') { await db.kvSet('chat:ask', null); return false; }
      const k = pend.need[0]; const w = brain.parseWhen(text); const skip = /^(없어|없음|몰라|아직|미정|모름|나중에|건너|패스|스킵|그냥|됐어|아니|혼자)/.test(text.trim()); const data = { ...d.data }; let lead = '';
      if (/^(취소|그만|안\s*해|버려)/.test(text.trim())) { await db.kvSet('chat:ask', null); await store.reject(d); await drawMsg(await db.put('chat', { role: 'bot', text: '알겠어요. 그 일정은 버렸어요.' }), new Map()); updateBadge(); return true; }
      if (k === 'date') { const w2 = pend.week && w.hits.length && !/(주|달|월)/.test(w.hits.join(' ')) ? brain.parseWhen(`${pend.week} ${text}`) : w;
        if (w2.date) { data.date = w2.date; data._dated = true; if (w2.time) data.start = w2.time; lead = '날짜를 넣었어요.'; }
        else if (skip) { data.date = ''; data._dated = true; await db.patch(d.id, { data }); await askNext({ ...d, data }, pend.need.filter(x => x !== 'date' && x !== 'time'), '날짜는 비워 뒀어요. 정해지면 “방금 거 금요일로”처럼 말해 주세요.', pend.carded); return true; }
        else { await db.kvSet('chat:ask', null); return false; } }
      else if (k === 'time') { if (w.time) { data.start = w.time; if (w.end) data.end = w.end; lead = '시간을 넣었어요.'; } else if (/종일|하루/.test(text)) { data._allday = true; lead = '종일 일정으로 두었어요.'; } else if (skip) { data._allday = true; lead = '시간은 비워 두었어요.'; } else if (w.date) { data.date = w.date; data._dated = true; lead = '날짜를 바꿨어요.'; await db.patch(d.id, { data }); return askNext({ ...d, data }, pend.need, lead, pend.carded), true; } else { await db.kvSet('chat:ask', null); return false; } }
      else { data._asked = true; if (/^팀(이랑|원|\s*전체)?/.test(text.trim())) { data.who = '팀 전체'; data.scope = 'work'; lead = '넣었어요.'; } else if (!skip) { const people = [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean); const pp = brain.eventParts(text.trim() + ' 방문', people) || {}; const wm = !pp.who && text.match(/([가-힣A-Za-z]{2,8}?)(이랑|랑|하고|와|과)(\s|$)/); const who = pp.who || (wm && wm[1]) || ''; const place = pp.place || ''; if (who) data.who = who; if (place) data.place = place; if (pp.area) data.area = pp.area; if (!who && !place && !pp.area) data.place = text.trim().replace(/(에서|에|요)$/, '').slice(0, 30);
          if (data.place || data.area) { try { const PL = await import('../js/place.js'); const hit = await PL.lookup(data.place || data.area, data.place ? data.area : ''); if (hit) { data.addr = hit.addr; data.mapUrl = hit.url || ''; data.placeBy = hit.by; } } catch { } }
          const SCm = await import('../js/scope.js'); data.scope = SCm.guess(`${data.title} ${data.place || ''}`, { who: data.who || '', team: people }); lead = '넣었어요.'; } }
      await db.patch(d.id, { data });
      await askNext({ ...d, data }, pend.need.slice(1), lead, pend.carded); return true;
    }

    async function handle(text, origin) {
      const CH = await import('../js/chat.js');
      text = await CH.applyAlias(text);
      const projects = await store.projects();
      const people = await store.peopleNames();
      const vendorNames = (await db.list('vendors')).map(v => v.name).filter(Boolean);
      // 프로젝트 이름(또는 그 안의 낱말)을 말하면 '지금 프로젝트'가 그쪽으로 바뀜
      const project = await curProj();
      const F = await import('../js/follow.js');
      // AI가 연결돼 있으면 대화·질문은 AI가 앱 기록을 보고 답함. true=답했음, 'add'=새로 적을 말이라 아래 읽기로 넘김, false=AI 없음·실패(규칙으로 답함)
      let aiAdd = false;
      const aiSay = async (src, hint = '', extra = {}) => { const AI = await import('../js/ai.js'); if (!(await AI.enabled())) return false;
        const wait = h('div.bubble.bot.faint', h('span.spin'), ' 기록을 보고 답하는 중이에요'); list.append(wait); wait.scrollIntoView({ block: 'end' });
        let r = null, map = new Map(); try { const CX = await import('../js/context.js'); const snap = await CX.snapshot(); map = snap.map; r = await AI.converse(src, { snapshot: snap.text, history: await CX.recentTalk(), name: (await db.kvGet('name', '')) || '', hint, screen: sheet ? sheet.screen : '' }); } catch (e) { store.logError(e, 'ai-talk'); r = null; } wait.remove();
        if (!r) return false; if (r.intent === 'add' && !extra.noAdd) { aiAdd = true; return 'add'; }
        const items = r.ids.map(c => map.get(c)).filter(Boolean).map(x => ({ icon: x.icon, title: x.title, sub: x.sub, route: x.route }));
        if (r.intent === 'edit') { const ACT = await import('../js/act.js'); const a = await ACT.tryAct(src, { people }); if (a) { await refreshCards(a.refresh); await drawMsg(await db.put('chat', { role: 'bot', q: src, text: a.text, chips: a.chips }), new Map()); updateBadge(); return true; }
          await drawMsg(await db.put('chat', { role: 'bot', q: src, text: r.next.length ? `${r.say ? r.say + ' ' : ''}맞으면 아래를 눌러 주세요. 그대로 바꿀게요.` : `${r.say ? r.say + ' ' : ''}이건 말로 바로 바꾸지 못했어요. 아래 항목을 눌러 열어서 고쳐 주세요.`, items, chips: r.next.map(x => ({ label: x, say: x })), ai: true }), new Map()); return true; }
        if (r.intent === 'add') return false;
        await drawMsg(await db.put('chat', { role: 'bot', q: src, text: r.say, items: [...items, ...(extra.items || [])].filter((x, i, a) => a.findIndex(y => y.title === x.title && y.route === x.route) === i), draftIds: extra.draftIds || [], chips: [...(extra.chips || []), ...navChips(r.say, r.next)], ai: true }), new Map((await store.drafts()).map(d => [d.id, d]))); updateBadge(); return true; };
      { const W = await import('../js/where.js'); if (W.isWhere(text)) { const r = await W.find(text); if ((await aiSay(text, r.text, { noAdd: true, items: r.items, draftIds: r.draftIds, chips: r.chips })) === true) return; await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, items: r.items, draftIds: r.draftIds, chips: r.chips }), new Map((await store.drafts()).map(d => [d.id, d]))); updateBadge(); return; } }
      { const pend = await db.kvGet('chat:ask', null); if (pend) { if (looksNew(text, pend.need[0], { projects, people, vendors: vendorNames, project })) await db.kvSet('chat:ask', null); else if (await answerAsk(pend, text)) return; } }
      // 방금 만든 것을 말로 고치기·취소하기
      { const r = await F.tryFollow(text, { people }); if (r) { await refreshCards(r.refresh); await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, chips: r.chips }), new Map()); updateBadge(); return; } }
      const talk = async src => { const r = await CH.reply(src, { name: (await db.kvGet('name', '')) || '' }); await drawMsg(await db.put('chat', { role: 'bot', q: src, text: r.text, list: r.list, chips: r.chips }), new Map()); };
      { const T = await import('../js/taste.js'); if (T.isFeedback(text)) { const r = await T.talk(text); if (r) { await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, chips: (r.chips || []).filter(c => c.say) }), new Map()); return; } } }
      // "○○한테 ~ 전해줘"인데 메신저를 못 쓰는 상태면 그렇다고 말하고 대신 적어 둘지 물음
      { const dm = text.match(/^(.{1,10}?)\s*(?:님)?\s*(?:한테|에게|께)\s+(.+?)\s*(?:전해|말해|알려|보내|물어봐|물어)\s*(?:줘|주세요|줄래)$/s); if (dm && (await import('../js/dm.js')).parseSend(text, [{ id: 'x', name: dm[1].replace(/\s/g, '') }])) { const sync = await import('../js/sync.js');   /* "파일 보내줘"처럼 전할 말이 아닌 것은 그냥 할 일로 */ const roster = (await sync.me()) ? (await db.kvGet('sync:roster', [])) : [];
        if (!roster.some(r => r.name && (r.name === dm[1].trim() || r.name.slice(1) === dm[1].trim()))) { await drawMsg(await db.put('chat', { role: 'bot', q: `${dm[1].trim()}에게 ${dm[2]} 전하기`, text: `${dm[1].trim()} 님에게 바로 전하려면 팀 동기화에 로그인돼 있어야 해요. 지금은 연결이 안 돼 있어서, 잊지 않게 할 일로 적어 둘까요?`, chips: [{ label: '할 일로', make: 'task' }, { label: '괜찮아요', skip: true }] }), new Map()); return; } } }
      // 프로젝트를 말로 만들기·지우기·이름 바꾸기·상태 바꾸기. 이름 없이 "프로젝트 지우고 싶어"처럼 말하면 하는 법을 알려 줌(할 일·아이디어로 적지 않음)
      const actSay = async r => { await refreshCards(r.refresh); await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, chips: r.chips }), new Map()); await drawProj(); const np = (r.text.match(/^“(.+?)” 프로젝트를 만들었어요/) || [])[1]; if (np) await setProj(np); };
      if (/프로젝트/.test(text) && /(편집|삭제|수정|추가|없애|없앨|지워|지우|이름\s*바꾸|바꿔|만들고\s*싶|만들어\s*(줘|주세요)|하나\s*하고\s*싶|관리)/.test(text) && !/\d\s*(원|만원|천원)/.test(text) && !/(까지|\d\s*시)(\s|$)/.test(text)) { const ACT = await import('../js/act.js'); const r = (await ACT.tryProject(text)) || (/(추가|생성|등록|만들|시작)/.test(text) ? await ACT.tryAct(text, { people }) : null); if (r) { await actSay(r); return; }
        /* 프로젝트 자체를 어떻게 하고 싶다는 말일 때만 하는 법을 알려 줌. "루미에 프로젝트 회의 4시로 바꿔줘"처럼 프로젝트 안의 일정·할 일 이야기는 아래 보통 읽기로 넘김 */
        if (/프로젝트\s*(?:를|을|은|는|도|의)?\s*(?:이름|명)?\s*(?:을|를)?\s*(?:좀\s*|하나\s*)?(?:편집|삭제|수정|추가|없애|없앨|지워|지우|바꾸|바꿔|만들|관리|새로)/.test(text) || /^(?:새\s*)?프로젝트/.test(text.trim())) { await botSay('프로젝트는 이름을 넣어 말하면 바로 해 드려요. “루미에 프로젝트 만들어줘”, “루미에 프로젝트 이름 루미에 팝업으로 바꿔줘”, “루미에 프로젝트 지워줘”처럼요. 프로젝트 화면에서도 할 수 있어요.', [{ label: '프로젝트 열기', go: 'plan/projects' }]); return; } }
      if (CH.isTalk(text) && !/(확정|승인|버려)\s*(해\s*)?(줘|주세요|둬)\s*[.!~]*$/.test(text)) { const k = CH.isCommand(text) ? null : CH.know(text); const a = CH.isCommand(text) ? false : await aiSay(text, k && k !== CH.NOAI ? k : ''); if (a === true) return; if (a !== 'add') return talk(text); }
      // 물음처럼 생긴 말은 AI가 먼저 뜻을 가림(질문이면 답하고, 적어 달라는 말이면 아래로)
      else if (!aiAdd && text.length <= 200 && !/\n/.test(text) && (/[?？]\s*$/.test(text) || /(뭐|뭘|왜|어떻게|어떡|언제|어디|어딨|누가|누구|얼마|몇\s|어때|어떨까|될까|할까|있어|없어|됐어|맞아|인가|일까|줄래|알려\s*줘|말해\s*줘|추천)\S*\s*[?？.!]*$/.test(text)) && !brain.interpret(text, { projects, people, vendors: vendorNames, project }).some(p => p.kind === 'nav')) { const rule = brain.interpret(text, { projects, people, vendors: vendorNames, project }); let hint = '', listed = false; /* 목록을 그대로 보여 주면 되는 물음("오늘 일정")은 앱이 바로 답하고, 까닭·판단을 묻는 말만 AI로 */
        if (rule.some(p => p.kind === 'query')) { try { const a0 = await answer(text); listed = !!(a0.items && a0.items.length) && !/(왜|뭐부터|뭘\s*먼저|어떻게|어떡|추천|어때|어떨까|될까|할까|급한|중요한|바쁜|괜찮|가능|정리해|요약)/.test(text) && !/[가-힣]까\s*[?？.!]*$/.test(text); hint = a0.text + (a0.items && a0.items.length ? ' / ' + a0.items.slice(0, 8).map(i => i.title + (i.sub ? ' (' + i.sub + ')' : '')).join(', ') : ''); } catch { } }
        if (!listed && (await aiSay(text, hint)) === true) return; }
      // 이미 있는 걸 말로 고치기 (완료·옮기기·취소·넘기기·담당)
      { const ACT = await import('../js/act.js'); const r = (await ACT.tryProject(text)) || (await ACT.tryAct(text, { people })); if (r) { await actSay(r); return; } }
      // 회의록 붙여넣기: 회의록에 넣고, 줄마다 담당·마감을 읽어 임시 항목으로
      { const mn = brain.minutes(text, { projects, people, vendors: vendorNames, project, me: await store.myNames() });
        if (mn) { const a = brain.analyzeNotes(mn.body, { people }); a.decisions = [...new Set([...mn.notes, ...(a.decisions || [])])].slice(0, 12);
          { const AI = await import('../js/ai.js'); if (await AI.enabled()) { const wait = h('div.bubble.bot.faint', h('span.spin'), ' AI가 회의록을 정리하고 있어요'); list.append(wait); const dg = await AI.digest(text, { today: todayStr(), people, what: '회의록' }); wait.remove(); if (dg) { a.summary = dg.summary; if (dg.decisions.length) a.decisions = dg.decisions; a.questions = dg.questions; if (dg.ideas.length) a.ideas = dg.ideas; a.byAI = true; } } } a.actions = mn.items.filter(x => x.kind === 'task').map(x => ({ title: x.data.title, who: x.data.who || '', due: x.data.due || '', src: x.src }));
          if (mn.project && mn.project !== project) await setProj(mn.project);
          const mt = await db.put('meetings', { title: mn.title, date: mn.date || todayStr(), attendees: mn.attendees.join(', '), project: mn.project, transcript: mn.body, seconds: 0, summaryDraft: a });
          const ids = []; for (const x of mn.items) ids.push((await store.draft(x.kind, x.data, { source: x.src, sourceRef: mt.id, confidence: x.confidence || 0.75, origin })).id);
          await F.remember(ids);
          const nT = mn.items.filter(x => x.kind === 'task').length, nE = mn.items.filter(x => x.kind === 'event').length;
          await drawMsg(await db.put('chat', { role: 'bot', q: text, text: `“${mn.title}”을 회의록에 넣었어요.${mn.project ? ` “${mn.project}” 프로젝트에 묶었어요.` : ''} 할 일 ${nT}개${nE ? `, 일정 ${nE}개` : ''}를 임시로 만들었고, 나머지 ${mn.notes.length}줄은 결정사항으로 적어 뒀어요. 맞으면 확정해 주세요.`, draftIds: ids, chips: [{ label: '회의록 보기', go: 'meetings/' + mt.id }] }), new Map((await store.drafts()).map(d => [d.id, d])));
          updateBadge(); return; } }
      // 길게 쓰거나 말한 건 → 원문은 메모로 저장(내가 쓴 거라 확정), 요약·할 일은 임시
      const nSent = brain.sentences(text).length;
      const isMeeting = /^(회의록|회의\s*(내용|정리|메모)|미팅\s*(내용|정리|메모))\s*[:：]/.test(text);
      const long = !brain.isBlock(text) && (isMeeting || (nSent >= 3 && text.length > 60 && !text.includes('\n')) || text.length > 220 || (origin === 'voice' && text.length > 90) || (text.length > 100 && nSent >= 3 && !text.includes('\n')) || text.split('\n').length > 6);
      /* 이어 쓴 말(일정·쓴 돈·살 것·아이디어가 섞인 것)은 메모+요약으로 뭉치지 않고 항목마다 따로 읽음. 아주 긴 글·회의록만 예전처럼 메모로 */
      let asItems = false;
      if (long && !isMeeting && text.length <= 420 && text.split('\n').length <= 12) { try { asItems = brain.interpret(text, { projects, people, vendors: vendorNames, project }).filter(p => !/^(talk|query|nav)$/.test(p.kind)).length >= 2; } catch { asItems = false; } }
      if (long && !asItems) {
        const a = await FB.refine(brain.analyzeNotes(text, { people }), text); await (await import('../js/ai.js')).enhance(a, text, { today: todayStr(), people });
        // "회의록: …"으로 시작하면 메모가 아니라 회의록에 넣음
        const bodyText = isMeeting ? text.replace(/^[^:：]+[:：]\s*/, '') : text;
        const note = isMeeting ? await db.put('meetings', { title: `${fmtDate(new Date())} 회의`, date: todayStr(), attendees: '', project: '', transcript: bodyText, seconds: 0, summaryDraft: a }) : await db.put('notes', { type: 'memo', title: (a.summary[0] || text).slice(0, 50), body: text, tags: a.keywords.slice(0, 6), origin });
        const ids = [];
        ids.push((await store.draft('summary', { title: `“${note.title}” 요약`, ...a }, { sourceRef: note.id, source: text, confidence: 0.7, origin })).id);
        for (const t of a.actions) ids.push((await store.draft('task', { title: t.title, due: t.due || '', who: t.who || '', priority: 'normal', project: '', memo: t.src }, { source: t.src, sourceRef: note.id, confidence: 0.7, origin })).id);
        for (const d of a.dates) ids.push((await store.draft('event', { title: d.title || '일정', date: d.date, start: d.time || '', end: d.end || '', memo: d.src }, { source: d.src, sourceRef: note.id, confidence: 0.6, origin })).id);
        for (const i of a.ideas) ids.push((await store.draft('idea', { title: i.slice(0, 60), body: i, tags: brain.keywords(i, 4) }, { source: i, sourceRef: note.id, confidence: 0.55, origin })).id);
        await F.remember(ids);
        const msg = await db.put('chat', { role: 'bot', q: text, text: `${isMeeting ? '회의록에 넣고' : '메모로 저장하고'} 정리했어요. 문장 ${a.stats.sentences}개 → 요약 ${a.summary.length}줄, 할 일 ${a.actions.length}개, 일정 ${a.dates.length}개, 아이디어 ${a.ideas.length}개. 확인해 주세요.`, draftIds: ids });
        await drawMsg(msg, new Map((await store.drafts()).map(d => [d.id, d])));
        updateBadge();
        return;
      }
      // "민서한테 ~라고 전해줘" → 메신저로 전달
      { const DM = await import('../js/dm.js'); const sync = await import('../js/sync.js'); const meM = await sync.me();
        const dv = text.match(/^(?:앱|웹|사이트)\s*(?:좀\s*)?(?:고쳐|개선|수정|바꿔)\s*(?:줘|주세요)?\s*[:：,]?\s*(.+)$/s) || text.match(/^코덱스\s*(?:요청)?\s*[:：]\s*(.+)$/s);
        if (dv) { const C = await import('../js/codex.js'); const r = await C.build(dv[1]); await C.save(dv[1], r); try { await navigator.clipboard.writeText(r.body); } catch { } await drawMsg(await db.put('chat', { role: 'bot', q: text, text: `요청서를 만들고 복사했어요. Codex에 붙여 넣으면 돼요.\n관련 화면: ${r.areas.join(', ') || '못 찾음'} · 먼저 볼 파일 ${r.files.length}개. 다시 보려면 메뉴의 “앱 개선 요청”을 열어요.` }), new Map()); return; }
        const cmd = DM.parseSend(text, (await db.kvGet('sync:roster', [])).filter(r => r.id && r.id !== meM?.id));
        if (cmd) { let t; try { await sync.dmSend(cmd.to.id, cmd.body); t = `${cmd.to.name} 님에게 전했어요: “${cmd.body}”. 답이 오면 바로 알려 드릴게요.`; } catch (e) { t = `${cmd.to.name} 님에게 못 전했어요. ${e.message}`; }
          await drawMsg(await db.put('chat', { role: 'bot', q: text, text: t }), new Map()); return; } }
      // "이 링크 요약해줘" → 본문을 읽어 요약(무료 읽기 서비스, AI 키가 있으면 AI 요약). 원문은 메모로 남기고 요약은 임시
      { const um = text.match(/https?:\/\/[^\s<>"']+/); if (um && /(요약|정리해|무슨\s*내용|읽어\s*(줘|봐)|내용\s*알려|뭐라는)/.test(text)) {
        const wait = h('div.bubble.bot', h('span.spin'), ' 링크를 읽고 있어요'); list.append(wait); wait.scrollIntoView({ block: 'end' });
        try { const AI = await import('../js/ai.js'); const pg = await AI.readPage(um[0]); const a = brain.analyzeNotes(pg.text.slice(0, 8000), { people });
          const ai = await AI.summarize(pg.text, pg.title); if (ai) { a.summary = ai.lines; if (ai.keywords.length) a.keywords = ai.keywords; }
          const note = await db.put('notes', { type: 'memo', title: (pg.title || um[0]).slice(0, 60), body: `${um[0]}\n\n${pg.text.slice(0, 6000)}`, tags: a.keywords.slice(0, 6), origin });
          const d = await store.draft('summary', { title: `“${note.title}” 요약`, ...a }, { sourceRef: note.id, source: um[0], confidence: ai ? 0.8 : 0.6, origin });
          wait.remove(); await drawMsg(await db.put('chat', { role: 'bot', q: text, text: `${ai ? 'AI가' : '앱 안에서'} 읽고 ${a.summary.length}줄로 줄였어요. 원문은 메모에 넣어 뒀어요.${ai ? '' : ' 설정에서 무료 AI 키를 넣으면 요약이 더 자연스러워져요.'}`, draftIds: [d.id] }), new Map((await store.drafts()).map(x => [x.id, x]))); updateBadge();
        } catch (e) { wait.remove(); await drawMsg(await db.put('chat', { role: 'bot', q: text, text: `이 링크는 읽지 못했어요. 로그인이 필요하거나 막아 둔 사이트일 수 있어요. 내용을 붙여 넣어 주시면 정리해 드릴게요.` }), new Map()); }
        return; } }
      /* 공모전·서포터즈 공고 링크 → 읽어서 대외활동 임시 항목으로 (이름·마감·인원·자격·포스터). 확정하면 대외활동 화면에 들어가요 */
      { const um = text.match(/https?:\/\/[^\s<>"']+/); const AC = um ? await import('../js/acts.js') : null;
        if (um && (AC.isActLink(um[0]) || /(공모전|서포터즈|대외\s*활동|기자단|앰배서더|홍보\s*대사)/.test(text))) {
          const wait = h('div.bubble.bot', h('span.spin'), ' 공고를 읽고 있어요'); list.append(wait); wait.scrollIntoView({ block: 'end' });
          const said = text.replace(um[0], ' ').trim(); let data; try { data = await AC.fromLink(um[0], said); } catch { data = { ...AC.parse(said), title: AC.titleOf(said), link: um[0], status: 'want' }; }
          wait.remove(); const got = !!data.read; delete data.read; if (!data.title) data.title = AC.titleOf(said) || '이름을 적어 주세요';
          const d = await store.draft('act', data, { source: text, confidence: got ? 0.7 : 0.45, origin });
          const bits = [data.due ? `마감 ${data.due.slice(5).replace('-', '/')}` : '', AC.partTag(data), AC.whoTag(data), AC.regionTag(data)].filter(Boolean).join(', ');
          await drawMsg(await db.put('chat', { role: 'bot', q: text, text: got ? `공고를 읽어 대외활동으로 임시로 담았어요.${bits ? ' ' + bits + '.' : ''} 틀린 데가 있으면 고친 뒤 확정해 주세요.` : '이 링크는 내용을 읽지 못해서 주소만 담았어요. 이름과 마감을 적은 뒤 확정해 주세요.', draftIds: [d.id] }), new Map((await store.drafts()).map(x => [x.id, x]))); updateBadge(); return; } }
      let parsed = brain.interpret(text, { projects, people, vendors: vendorNames, project });
      if (aiAdd && parsed.every(p => p.kind === 'query' || p.kind === 'talk')) parsed = [];
      // 키가 연결돼 있으면 Gemini가 먼저 읽음(규칙 초안을 힌트로). 못 읽거나 연결이 없으면 규칙 결과 그대로
      let byAI = false, aiLate = false;
      if (!parsed.some(p => p.kind === 'query' || p.kind === 'nav') && text.trim().length >= 4) { const AI = await import('../js/ai.js');
        if (await AI.enabled()) { const wait = h('div.bubble.bot.faint', h('span.spin'), ' AI가 읽고 있어요'); list.append(wait); wait.scrollIntoView({ block: 'end' });
          const got = await AI.refine(text, parsed, { today: todayStr(), people, projects, vendors: (await db.list('vendors')).map(v => v.name) }); wait.remove();
          if (got && got.length) { parsed = got.map(g => brain.polish({ src: text, ...g }, { projects, project })); byAI = true; } else if (got === null) { aiLate = true; } else if (got && !got.length && parsed.every(p => p.kind === 'talk')) { /* AI도 만들 게 없다고 봄 → 대화로 */ } } }
      const ids = []; const replies = [];
      // 프로젝트 이름을 말한 항목이 있으면 '지금 프로젝트'가 그쪽으로 바뀜 (연락처·질문은 안 바꿈)
      { const named = parsed.find(p => p.data && p.data.project && !p.byCtx && projects.includes(p.data.project)); if (named && named.data.project !== project) await setProj(named.data.project); }
      const ctxIds = [];
      for (const p of parsed) {
        if (p.kind === 'nav') { go(p.data.q ? 'prompts/find/' + encodeURIComponent(p.data.q) : p.data.make ? 'prompts/make' : brain.navTo(p.data.to)); return; }
        if (p.kind === 'talk') { if (aiAdd || (await aiSay(p.src || text, '', { noAdd: true })) !== true) await talk(p.src || text); continue; }
        if (p.kind === 'query') { const a = await answer(text); replies.push(a); continue; }
        // 일정에 장소가 있으면 실제 주소를 찾아 붙임 (못 찾아도 그대로 진행)
        if (p.kind === 'event' && (p.data.place || p.data.area)) { try { const PL = await import('../js/place.js'); const hit = await PL.lookup(p.data.place || p.data.area, p.data.place ? p.data.area : ''); if (hit) { p.data.addr = hit.addr; p.data.mapUrl = hit.url || ''; p.data.placeBy = hit.by; } } catch { } }
        ids.push((await store.draft(p.kind, p.data, { source: p.src || text, confidence: p.confidence, origin })).id); if (p.byCtx) ctxIds.push(ids.at(-1));
      }
      if (aiAdd && !ids.length && !replies.length && !parsed.length) { await talk(text); return; } /* AI도 항목을 못 만들면 어떻게 적을지 물음 */
      await F.remember(ids);
      for (const a of replies) {
        const msg = await db.put('chat', { role: 'bot', q: text, text: a.text, items: a.items.slice(0, 12), ...(a.chips && a.chips.length ? { chips: a.chips } : {}) });
        await drawMsg(msg, new Map());
      }
      if (ids.length === 1 && parsed.filter(p => p.kind === 'event').length === 1 && !parsed.find(p => p.kind === 'event').data.repeat) {
        const ev = parsed.find(p => p.kind === 'event'); const need = missing(ev.data, ev.src || text).filter(k => k !== 'more' || true);
        if (need.includes('date') || need.includes('time')) { const d = await db.get(ids[0]); updateBadge(); return askNext(d, need, '일정으로 적어 둘게요.'); }
      }
      if (ids.length) {
        const labels = parsed.filter(p => p.kind !== 'query').map(p => p.label);
        const msg = await db.put('chat', { role: 'bot', q: text, text: `${[...new Set(labels)].join(' · ')} ${ids.length}개를 임시로 만들었어요. 맞으면 확정해 주세요.${byAI ? ' (AI가 읽음)' : aiLate ? ' (AI가 늦어서 앱 규칙으로 읽었어요)' : ''}${ctxIds.length ? ` 프로젝트 이름이 없어서 지금 프로젝트 “${project}”에 묶었어요.` : ''}`, draftIds: ids, ...(ctxIds.length ? { chips: [{ label: '프로젝트에서 빼기', act: { op: 'unproj', ids: ctxIds } }] } : {}) });
        await drawMsg(msg, new Map((await store.drafts()).map(d => [d.id, d])));
        updateBadge();
      }
    }

    async function drawMsg(m, pending, animate = true) {
      if (m.role === 'me') { list.append(meBubble(m.text)); return; }
      const box = h('div', h('div', m.text));
      if (m.items?.length) box.append(h('div.list', { style: { marginTop: '6px' } }, m.items.map(it => h('div.li.click', { onclick: () => go(it.route) }, ic(it.icon), h('div.grow', h('div.t.small', it.title), h('div.faint.tiny', it.sub)), it.tel ? h('a.btn.sm', { href: 'tel:' + it.tel, onclick: e => e.stopPropagation() }, ic('phone', 14)) : null))));
      for (const id of m.draftIds || []) {
        const d = pending.get(id) || (await db.get(id));
        if (!d) continue;
        if (d.status === 'pending') box.append(draftCard(d, () => updateBadge()));
        else box.append(await staticCardOf(d));
      }
      if (m.list?.length) box.append(h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.8 } }, m.list.map(x => h('li', x))));
      if (m.chips?.length && !m.chipDone) { const row = h('div.chips', { style: { marginTop: '8px' } }); const done = async label => { await db.patch(m.id, { chipDone: label }); row.replaceWith(h('span.faint.tiny', label)); };
        row.append(...m.chips.map(c => h('button.chip' + (c.make === 'task' ? '.acc' : ''), { onclick: async () => {
          if (c.say) return send(c.say);
          if (c.skip) return done('넘겼어요');
          if (c.aiGuide) return import('../js/keyshare.js').then(K => K.guide(drawAiBar));
          if (c.go) return go(c.go);
          if (c.proj !== undefined) { await setProj(c.proj); return done(c.proj ? `지금 프로젝트: ${c.proj}` : '프로젝트 없이'); }
          if (c.act) { const ACT = await import('../js/act.js'); const r = await ACT.run(c.act); await done(c.label); if (r) { await refreshCards(r.refresh); await drawMsg(await db.put('chat', { role: 'bot', text: r.text, chips: r.chips }), new Map()); } updateBadge(); return; }
          if (c.follow) { const F = await import('../js/follow.js'); const r = await F.run(c.follow); await done(c.label); if (r) { await refreshCards(r.refresh); await drawMsg(await db.put('chat', { role: 'bot', text: r.text }), new Map()); } updateBadge(); return; }
          if (c.undoAlias) { const CH = await import('../js/chat.js'); const a = await CH.aliases(); delete a[c.undoAlias]; await db.kvSet('chat:alias', a); return done('기억을 지웠어요'); }
          if (c.make === 'event') { const d = await store.draft('event', { title: m.q.trim().slice(0, 60), date: todayStr(), start: '', end: '', place: '' }, { source: m.q, confidence: .6, origin: 'chat' }); await (await import('../js/follow.js')).remember([d.id]); await done('일정으로 받을게요'); return askNext(d, missing(d.data, m.q)); }
          if (c.make) { const d = await store.draft(c.make, c.make === 'task' ? { title: brain.cleanTask(m.q) || m.q, due: '', priority: 'normal' } : c.make === 'note' ? { title: m.q.slice(0, 50), body: m.q, type: 'memo' } : { title: m.q }, { source: m.q, confidence: .6, origin: 'chat' }); await (await import('../js/follow.js')).remember([d.id]); await store.approve(d); const nd = await db.get(d.id); updateBadge(); await done(`${store.KINDS[c.make]?.label || ''}${c.make === 'task' ? '에' : '로'} 넣었어요`); box.append(await staticCardOf(nd));
            toast(`${store.KINDS[c.make]?.label || ''}${c.make === 'task' ? '에' : '로'} 넣었어요`, { label: '되돌리기', fn: async () => { const cur = await db.get(d.id); if (cur && cur.status === 'approved') { await store.unapprove(cur); await refreshCards([d.id]); updateBadge(); } } }); }
        } }, c.label))); box.append(row); }
      else if (m.chipDone) box.append(h('div.faint.tiny', { style: { marginTop: '6px' } }, m.chipDone));
      if (m.dm) { const DM = await import('../js/dm.js'); const j = await DM.judge(m.dm.body, m.dm.name);
        if (j.note) box.append(h('div.small.muted', { style: { marginTop: '4px' } }, j.note));
        const chipsOf = list => list.map(r => h('button.chip', { onclick: async e => { const b = e.currentTarget; try { await (await import('../js/sync.js')).dmSend(m.dm.from, r); b.replaceWith(h('span.chip.ok', ic('check', 12), '답장함')); } catch (er) { toast(er.message); } } }, ic('send', 12), r));
        const rp = h('span', { style: { display: 'contents' } }, chipsOf(j.replies));
        DM.aiReplies(m.id, m.dm.body, m.dm.name, j.note).then(rs => { if (rs && rs.length) rp.replaceChildren(...chipsOf(rs)); }).catch(() => { });
        box.append(h('div.chips', { style: { marginTop: '8px' } }, j.actions.map(a => h('button.chip.acc', { onclick: async () => { await store.draft(a.kind, a.data, { source: m.dm.body, origin: 'dm', confidence: .75 }); updateBadge(); toast('임시 항목을 만들었어요', { label: '확인 대기함', fn: () => go('inbox') }); } }, ic('plus', 12), a.label)),
          rp,
          h('a.chip', { href: '#/talk/' + m.dm.from }, '대화 열기'))); }
      if (m.q) box.append(FB.widget({ kind: 'chat', ref: m.id, source: m.q }));
      const b = botBubble(box, (m.draftIds?.length || m.items?.length) ? 'wide' : '');
      if (!animate) b.style.animation = 'none';
      list.append(b);
    }
    async function clearChat() { const all = await db.list('chat'); if (!all.length) return; const { confirmBox } = await import('../js/ui.js'); if (!(await confirmBox('대화 내용을 지울까요? 확정한 항목과 대기함은 그대로 있어요.', '지우기'))) return;
      for (const m of all) await db.remove(m.id); clear(list);
      toast('대화를 지웠어요.', { label: '되돌리기', fn: async () => { for (const m of all) await db.put('chat', { ...m, deleted: false }); clear(list); const pend = new Map((await store.drafts()).map(d => [d.id, d])); for (const m of all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-60)) await drawMsg(m, pend, false); scrollDown(); } }); }

    // 음성
    async function toggleMic() {
      if (micBusy) return;
      if (recorder?.running) {
        micBusy = true; clearInterval(timer);
        try {
          const r = await recorder.stop(); let text = (r.text || '').trim(), told = false;
          if (!text && r.blob) {   /* 실시간으로 못 받아쓴 경우: 녹음한 것을 글로 바꿈 */
            clear(recBar).append(h('span.spin'), h('span.small.muted.grow', '글로 바꾸는 중이에요…'));
            try { text = await toText(r.blob); }
            catch (e) { told = true; if (e.code === 'no-engine') { micOff(); await botSay('말은 잘 녹음됐는데, 이 기기에는 글로 바꿔 줄 AI가 아직 연결돼 있지 않아요. AI를 연결하면 바로 돼요. 그 전에는 키보드의 마이크(받아쓰기)를 눌러 말해도 돼요.', [{ label: 'AI 연결하기', aiGuide: true }]); } else toast(e.message); }
          }
          micOff();
          if (text) send(text, 'voice'); else if (!told) toast(r.seconds < 2 ? '너무 짧았어요. 마이크를 누르고 말한 뒤 "끝"을 눌러 주세요.' : '알아들은 말이 없어요. 조금 더 크게 말해 주세요.');
        } finally { micBusy = false; }
        return;
      }
      if (!canVoice()) { toast('이 브라우저는 말로 입력할 수 없어요. 키보드의 마이크(받아쓰기)를 써 주세요.'); ta.focus(); return; }
      const wave = waveEl(28); const live = h('span.small.muted.grow', '듣고 있어요…'); const tm = h('span.mono.small', '0:00');
      clear(recBar).append(h('span.dot', { style: { background: 'var(--bad)' } }), wave, live, tm, h('button.btn.sm', { onclick: toggleMic }, ic('stop', 14), '끝'));
      recBar.classList.remove('hide'); micBtn.classList.add('rec');
      let sec = 0; clearInterval(timer); timer = setInterval(() => (tm.textContent = fmtSec(++sec)), 1000);
      recorder = createRecorder({ record: false, onLevel: v => wave.level(v), onInterim: t => { if (t) live.textContent = t.slice(-80); }, onText: full => (live.textContent = full.slice(-80)),
        onState: (s, mode) => {
          if (s === 'recording' && mode === 'rec') live.textContent = '녹음하고 있어요. 다 말하면 "끝"을 눌러 주세요.';   /* 실시간 받아쓰기가 안 되는 기기 */
          else if (s === 'denied') { micOff(); toast('마이크가 막혀 있어요. 폰 설정에서 이 앱의 마이크를 허용해 주세요.'); }
          else if (s === 'unsupported') { micOff(); toast('이 기기에서는 말로 입력할 수 없어요. 키보드의 마이크(받아쓰기)를 써 주세요.'); }
          else if (s === 'no-engine') { micOff(); botSay('이 기기에서는 말하는 대로 받아쓰는 기능이 안 켜져요. AI를 연결하면 말을 녹음해서 글로 바꿔 드려요. 그 전에는 키보드의 마이크(받아쓰기)를 눌러 말해도 돼요.', [{ label: 'AI 연결하기', aiGuide: true }]); }
        } });
      micBusy = true;
      try { await recorder.start(); } catch (e) { if (!e.told) toast(e.message); micOff(); } finally { micBusy = false; }
    }
    const onChat = async e => { await drawMsg(e.detail, new Map()); scrollDown(); };
    window.addEventListener('hajin:chat', onChat);
    if (sheet && sheet.say) { ta.value = sheet.say; send(); }   /* 바로가기에서 한 말을 들고 열린 경우 */
    return () => { window.removeEventListener('hajin:chat', onChat); if (recorder?.running) recorder.stop(); clearInterval(timer); };
  },
};
const meBubble = t => h('div.bubble.me', t);
const botBubble = (c, cls = '') => h('div.bubble.bot' + (cls ? '.' + cls : ''), c);
