import { h, ic, clear, toast, md, fmtDate, busy, todayStr } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { answer } from '../js/query.js';
import * as FB from '../js/feedback.js';
import { draftCard } from '../js/draftcard.js';
import { describe } from '../js/fields.js';
import { createRecorder, hasSpeech, waveEl, fmtSec } from '../js/voice.js';
import { go, updateBadge } from '../js/app.js';

const SUGGEST = ['오늘 일정', '오늘 빈 시간', '이번 주 할 일', '밀린 할 일', '이번 달 지출', '확인 대기함', '내일 오후 3시 팀 회의', '점심 9000원', '금요일까지 포트폴리오 정리'];

export default {
  async render(root) {
    const list = h('div.chat');
    const ta = h('textarea', { rows: 1, placeholder: '무엇이든 말하거나 적어 주세요. 여러 줄이면 하나씩 처리해요.', 'aria-label': '비서에게 입력' });
    const preview = h('div.chips', { style: { minHeight: '22px', padding: '0 4px 6px' } });
    const micBtn = h('button.btn.icon.ghost', { title: '말로 입력', 'aria-label': '말로 입력', onclick: () => toggleMic() }, ic('mic', 20));
    const sendBtn = h('button.btn.pri.icon', { 'aria-label': '보내기', onclick: () => send() }, ic('right', 20));
    const recBar = h('div.row.hide', { style: { padding: '6px 4px', gap: '10px' } });
    const sug = h('div.suggest', SUGGEST.map(s => h('button.chip', { onclick: () => { ta.value = s; send(); } }, s)));

    const page = h('div.chatpage');
    root.append(page);
    page.append(
      h('div.page-head', h('div', h('h1', '비서'), h('p.sub', '한 줄로 일정·할 일·지출·연락처·메모 무엇이든. 결과는 확정 전까지 임시예요.')),
        h('div.row', h('button.btn.sm.ghost', { onclick: clearChat }, ic('trash', 14), '대화 지우기'))),
      list,
      h('div.composer', sug, recBar, h('div.box', ta, micBtn, sendBtn), preview));

    // 기존 대화
    const msgs = (await db.list('chat')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-60);
    if (!msgs.length) list.append(botBubble(h('div', h('p', '안녕하세요 하진님. 이렇게 말해 보세요.'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, ['"다음 주 화요일 2시 홍대 촬영"', '"어도비 구독 3만7천원 결제"', '"홍길동 010-1234-5678 디자이너"', '"오늘 일정 보여줘"', '회의나 생각을 길게 말하면 요약·키워드·할 일로 정리해요'].map(x => h('li.small', x))))));
    const pending = new Map((await store.drafts()).map(d => [d.id, d]));
    for (const m of msgs) await drawMsg(m, pending, false);
    scrollDown();

    ta.addEventListener('input', () => { autoGrow(); livePreview(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    setTimeout(() => ta.focus(), 50);
    const pre = sessionStorage.getItem('assistant:prefill');
    if (pre) { sessionStorage.removeItem('assistant:prefill'); send(pre); }

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
    function scrollDown() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); }

    async function send(text = ta.value.trim(), origin = 'chat') {
      if (!text) return;
      ta.value = ''; autoGrow(); clear(preview);
      const me = await db.put('chat', { role: 'me', text });
      list.append(meBubble(text));
      scrollDown();
      try { await handle(text, origin); } catch (e) { store.logError(e, 'assistant'); list.append(botBubble('처리하다 문제가 생겼어요: ' + e.message)); }
      scrollDown();
    }

    // 일정에 빠진 필수 정보(날짜·시간)와 누구랑·어디서를 되물어 채움
    const ASK = {
      date: ['언제예요?', ['오늘', '내일', '이번 주 토요일', '아직 몰라']],
      time: ['몇 시예요?', ['오전 10시', '오후 2시', '저녁 7시', '종일']],
      more: ['누구랑, 어디서 하는지도 알려 주면 채워 둘게요.', ['없어']],
      who: ['누구랑 가요?', ['혼자', '팀이랑']],
    };
    async function askNext(d, need, lead = '') {
      const k = need[0];
      if (!k) { await db.kvSet('chat:ask', null); await drawMsg(await db.put('chat', { role: 'bot', text: (lead || '다 채웠어요.') + ' 맞으면 확정해 주세요.', draftIds: [d.id] }), new Map([[d.id, await db.get(d.id)]])); updateBadge(); return; }
      await db.kvSet('chat:ask', { id: d.id, need });
      await drawMsg(await db.put('chat', { role: 'bot', text: `${lead}${lead ? ' ' : ''}“${d.data.title}” ${ASK[k][0]}`, chips: ASK[k][1].map(x => ({ label: x, say: x })) }), new Map());
    }
    const missing = (data, src) => { const w = brain.parseWhen(src || ''); const need = []; if (!w.date && !data._dated) need.push('date'); if (!data.start && !data._allday) need.push('time'); if (!data._asked && ((!data.who && !data.place && !data.area) || (!data.who && /(방문|관람|구경|저녁|점심|식사|약속|영화|여행|나들이|데이트|모임)/.test(data.title || '')))) need.push(data.place || data.area ? 'who' : 'more'); return need; };
    async function answerAsk(pend, text) {
      const d = await db.get(pend.id); if (!d || d.status !== 'pending') { await db.kvSet('chat:ask', null); return false; }
      const k = pend.need[0]; const w = brain.parseWhen(text); const skip = /^(없어|없음|몰라|아직|미정|모름|나중에|건너|패스|스킵|그냥|됐어|아니|혼자)/.test(text.trim()); const data = { ...d.data }; let lead = '';
      if (/^(취소|그만|안\s*해|버려)/.test(text.trim())) { await db.kvSet('chat:ask', null); await store.reject(d); await drawMsg(await db.put('chat', { role: 'bot', text: '알겠어요. 그 일정은 버렸어요.' }), new Map()); updateBadge(); return true; }
      if (k === 'date') { if (w.date) { data.date = w.date; data._dated = true; if (w.time) data.start = w.time; lead = '날짜를 넣었어요.'; } else if (skip) { data._dated = true; lead = '날짜는 오늘로 두었어요.'; } else { await db.kvSet('chat:ask', null); return false; } }
      else if (k === 'time') { if (w.time) { data.start = w.time; if (w.end) data.end = w.end; lead = '시간을 넣었어요.'; } else if (/종일|하루/.test(text)) { data._allday = true; lead = '종일 일정으로 두었어요.'; } else if (skip) { data._allday = true; lead = '시간은 비워 두었어요.'; } else if (w.date) { data.date = w.date; data._dated = true; lead = '날짜를 바꿨어요.'; await db.patch(d.id, { data }); return askNext({ ...d, data }, pend.need, lead), true; } else { await db.kvSet('chat:ask', null); return false; } }
      else { data._asked = true; if (/^팀(이랑|원|\s*전체)?/.test(text.trim())) { data.who = '팀 전체'; data.scope = 'work'; lead = '넣었어요.'; } else if (!skip) { const people = [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean); const pp = brain.eventParts(text.trim() + ' 방문', people) || {}; const wm = !pp.who && text.match(/([가-힣A-Za-z]{2,8}?)(이랑|랑|하고|와|과)(\s|$)/); const who = pp.who || (wm && wm[1]) || ''; const place = pp.place || ''; if (who) data.who = who; if (place) data.place = place; if (pp.area) data.area = pp.area; if (!who && !place && !pp.area) data.place = text.trim().replace(/(에서|에|요)$/, '').slice(0, 30);
          if (data.place || data.area) { try { const PL = await import('../js/place.js'); const hit = await PL.lookup(data.place || data.area, data.place ? data.area : ''); if (hit) { data.addr = hit.addr; data.mapUrl = hit.url || ''; data.placeBy = hit.by; } } catch { } }
          const SCm = await import('../js/scope.js'); data.scope = SCm.guess(`${data.title} ${data.place || ''}`, { who: data.who || '', team: people }); lead = '넣었어요.'; } }
      await db.patch(d.id, { data });
      await askNext({ ...d, data }, pend.need.slice(1), lead); return true;
    }

    async function handle(text, origin) {
      const CH = await import('../js/chat.js');
      text = await CH.applyAlias(text);
      { const pend = await db.kvGet('chat:ask', null); if (pend && await answerAsk(pend, text)) return; }
      const talk = async src => { const r = await CH.reply(src, { name: (await db.kvGet('name', '')) || '' }); await drawMsg(await db.put('chat', { role: 'bot', q: src, text: r.text, list: r.list, chips: r.chips }), new Map()); };
      { const T = await import('../js/taste.js'); if (T.isFeedback(text)) { const r = await T.talk(text); if (r) { await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, chips: (r.chips || []).filter(c => c.say) }), new Map()); return; } } }
      // "○○한테 ~ 전해줘"인데 메신저를 못 쓰는 상태면 그렇다고 말하고 대신 적어 둘지 물음
      { const dm = text.match(/^(.{1,10}?)\s*(?:님)?\s*(?:한테|에게|께)\s+(.+?)\s*(?:전해|말해|알려|보내)\s*(?:줘|주세요|줄래)$/s); if (dm) { const sync = await import('../js/sync.js'); const roster = (await sync.me()) ? (await db.kvGet('sync:roster', [])) : [];
        if (!roster.some(r => r.name && (r.name === dm[1].trim() || r.name.slice(1) === dm[1].trim()))) { await drawMsg(await db.put('chat', { role: 'bot', q: `${dm[1].trim()}에게 ${dm[2]} 전하기`, text: `${dm[1].trim()} 님에게 바로 전하려면 팀 동기화에 로그인돼 있어야 해요. 지금은 연결이 안 돼 있어서, 잊지 않게 할 일로 적어 둘까요?`, chips: [{ label: '할 일로', make: 'task' }, { label: '괜찮아요', skip: true }] }), new Map()); return; } } }
      if (CH.isTalk(text)) return talk(text);
      const projects = await store.projects();
      const people = [...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())].filter(Boolean);
      // 이미 있는 걸 말로 고치기 (완료·옮기기·취소·넘기기·담당)
      { const ACT = await import('../js/act.js'); const r = await ACT.tryAct(text, { people }); if (r) { await drawMsg(await db.put('chat', { role: 'bot', q: text, text: r.text, chips: r.chips }), new Map()); return; } }
      // 길게 쓰거나 말한 건 → 원문은 메모로 저장(내가 쓴 거라 확정), 요약·할 일은 임시
      const nSent = brain.sentences(text).length;
      const long = /^(회의록|회의\s*(내용|정리|메모)|미팅\s*(내용|정리))\s*[:：]/.test(text) || (nSent >= 3 && text.length > 60 && !text.includes('\n')) || text.length > 220 || (origin === 'voice' && text.length > 90) || (text.length > 100 && nSent >= 3 && !text.includes('\n')) || text.split('\n').length > 6;
      if (long) {
        const a = await FB.refine(brain.analyzeNotes(text, { people }), text); await (await import('../js/ai.js')).enhance(a, text, { today: todayStr(), people });
        const note = await db.put('notes', { type: 'memo', title: (a.summary[0] || text).slice(0, 50), body: text, tags: a.keywords.slice(0, 6), origin });
        const ids = [];
        ids.push((await store.draft('summary', { title: `“${note.title}” 요약`, ...a }, { sourceRef: note.id, source: text, confidence: 0.7, origin })).id);
        for (const t of a.actions) ids.push((await store.draft('task', { title: t.title, due: t.due || '', who: t.who || '', priority: 'normal', project: '', memo: t.src }, { source: t.src, sourceRef: note.id, confidence: 0.7, origin })).id);
        for (const d of a.dates) ids.push((await store.draft('event', { title: d.title || '일정', date: d.date, start: d.time || '', end: d.end || '', memo: d.src }, { source: d.src, sourceRef: note.id, confidence: 0.6, origin })).id);
        for (const i of a.ideas) ids.push((await store.draft('idea', { title: i.slice(0, 60), body: i, tags: brain.keywords(i, 4) }, { source: i, sourceRef: note.id, confidence: 0.55, origin })).id);
        const msg = await db.put('chat', { role: 'bot', q: text, text: `메모로 저장하고 정리했어요. 문장 ${a.stats.sentences}개 → 요약 ${a.summary.length}줄, 할 일 ${a.actions.length}개, 일정 ${a.dates.length}개, 아이디어 ${a.ideas.length}개. 확인해 주세요.`, draftIds: ids });
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
      let parsed = brain.interpret(text, { projects, people, vendors: (await db.list('vendors')).map(v => v.name) });
      // 키가 연결돼 있으면 Gemini가 먼저 읽음(규칙 초안을 힌트로). 못 읽거나 연결이 없으면 규칙 결과 그대로
      let byAI = false, aiLate = false;
      if (!parsed.some(p => p.kind === 'query' || p.kind === 'nav') && text.trim().length >= 4) { const AI = await import('../js/ai.js');
        if (await AI.enabled()) { const wait = h('div.bubble.bot.faint', h('span.spin'), ' AI가 읽고 있어요'); list.append(wait); wait.scrollIntoView({ block: 'end' });
          const got = await AI.refine(text, parsed, { today: todayStr(), people, projects, vendors: (await db.list('vendors')).map(v => v.name) }); wait.remove();
          if (got && got.length) { parsed = got; byAI = true; } else if (got === null) { aiLate = true; } else if (got && !got.length && parsed.every(p => p.kind === 'talk')) { /* AI도 만들 게 없다고 봄 → 대화로 */ } } }
      const ids = []; const replies = [];
      for (const p of parsed) {
        if (p.kind === 'nav') { const map = { 캘린더: 'calendar', 일정: 'calendar', '할 일': 'tasks', 할일: 'tasks', 회의: 'meetings', 기획: 'plan', 인맥: 'people', 연락처: 'people', 비용: 'money', 지출: 'money', 스타트업: 'startup', SNS: 'studio', 스튜디오: 'studio', 피그마: 'figma', 설정: 'settings', 대기함: 'inbox', '확인 대기함': 'inbox' }; go(map[p.data.to.replace(/\s+/g, ' ')] || 'today'); return; }
        if (p.kind === 'talk') { await talk(p.src || text); continue; }
        if (p.kind === 'query') { const a = await answer(text); replies.push(a); continue; }
        // 일정에 장소가 있으면 실제 주소를 찾아 붙임 (못 찾아도 그대로 진행)
        if (p.kind === 'event' && (p.data.place || p.data.area)) { try { const PL = await import('../js/place.js'); const hit = await PL.lookup(p.data.place || p.data.area, p.data.place ? p.data.area : ''); if (hit) { p.data.addr = hit.addr; p.data.mapUrl = hit.url || ''; p.data.placeBy = hit.by; } } catch { } }
        ids.push((await store.draft(p.kind, p.data, { source: p.src || text, confidence: p.confidence, origin })).id);
      }
      for (const a of replies) {
        const msg = await db.put('chat', { role: 'bot', q: text, text: a.text, items: a.items.slice(0, 12) });
        await drawMsg(msg, new Map());
      }
      if (ids.length === 1 && parsed.filter(p => p.kind === 'event').length === 1 && !parsed.find(p => p.kind === 'event').data.repeat) {
        const ev = parsed.find(p => p.kind === 'event'); const need = missing(ev.data, ev.src || text).filter(k => k !== 'more' || true);
        if (need.includes('date') || need.includes('time')) { const d = await db.get(ids[0]); updateBadge(); return askNext(d, need, '일정으로 적어 둘게요.'); }
      }
      if (ids.length) {
        const labels = parsed.filter(p => p.kind !== 'query').map(p => p.label);
        const msg = await db.put('chat', { role: 'bot', q: text, text: `${[...new Set(labels)].join(' · ')} ${ids.length}개를 임시로 만들었어요. 맞으면 확정해 주세요.${byAI ? ' (AI가 읽음)' : aiLate ? ' (AI가 늦어서 앱 규칙으로 읽었어요)' : ''}`, draftIds: ids });
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
        else box.append(h('div.draft' + (d.status === 'approved' ? '.done' : '.gone'), h('div.k', ic(store.KINDS[d.kind]?.icon || 'file')), h('div.grow', h('div.small', { style: { fontWeight: 650 } }, d.data.title || d.data.name), h('div.faint.tiny', d.status === 'approved' ? '확정됨' : '버림'))));
      }
      if (m.list?.length) box.append(h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.8 } }, m.list.map(x => h('li', x))));
      if (m.chips?.length && !m.chipDone) { const row = h('div.chips', { style: { marginTop: '8px' } }); const done = async label => { await db.patch(m.id, { chipDone: label }); row.replaceWith(h('span.faint.tiny', label)); };
        row.append(...m.chips.map(c => h('button.chip' + (c.make === 'task' ? '.acc' : ''), { onclick: async () => {
          if (c.say) return send(c.say);
          if (c.skip) return done('넘겼어요');
          if (c.act) { const ACT = await import('../js/act.js'); const r = await ACT.run(c.act); await done(c.label); if (r) await drawMsg(await db.put('chat', { role: 'bot', text: r.text, chips: r.chips }), new Map()); return; }
          if (c.undoAlias) { const CH = await import('../js/chat.js'); const a = await CH.aliases(); delete a[c.undoAlias]; await db.kvSet('chat:alias', a); return done('기억을 지웠어요'); }
          if (c.make === 'event') { const d = await store.draft('event', { title: m.q.trim().slice(0, 60), date: todayStr(), start: '', end: '', place: '' }, { source: m.q, confidence: .6, origin: 'chat' }); await done('일정으로 받을게요'); return askNext(d, missing(d.data, m.q)); }
          if (c.make) { const d = await store.draft(c.make, c.make === 'task' ? { title: brain.cleanTask(m.q) || m.q, due: '', priority: 'normal' } : c.make === 'note' ? { title: m.q.slice(0, 50), body: m.q, type: 'memo' } : { title: m.q }, { source: m.q, confidence: .6, origin: 'chat' }); updateBadge(); await done(`${store.KINDS[c.make]?.label || ''} 임시 항목을 만들었어요`); box.append(draftCard(d, () => updateBadge())); }
        } }, c.label))); box.append(row); }
      else if (m.chipDone) box.append(h('div.faint.tiny', { style: { marginTop: '6px' } }, m.chipDone));
      if (m.dm) { const DM = await import('../js/dm.js'); const j = await DM.judge(m.dm.body, m.dm.name);
        if (j.note) box.append(h('div.small.muted', { style: { marginTop: '4px' } }, j.note));
        box.append(h('div.chips', { style: { marginTop: '8px' } }, j.actions.map(a => h('button.chip.acc', { onclick: async () => { await store.draft(a.kind, a.data, { source: m.dm.body, origin: 'dm', confidence: .75 }); updateBadge(); toast('임시 항목을 만들었어요', { label: '확인 대기함', fn: () => go('inbox') }); } }, ic('plus', 12), a.label)),
          j.replies.map(r => h('button.chip', { onclick: async e => { const b = e.currentTarget; try { await (await import('../js/sync.js')).dmSend(m.dm.from, r); b.replaceWith(h('span.chip.ok', ic('check', 12), '답장함')); } catch (er) { toast(er.message); } } }, ic('send', 12), r)),
          h('a.chip', { href: '#/talk/' + m.dm.from }, '대화 열기'))); }
      if (m.q) box.append(FB.widget({ kind: 'chat', ref: m.id, source: m.q }));
      const b = botBubble(box, (m.draftIds?.length || m.items?.length) ? 'wide' : '');
      if (!animate) b.style.animation = 'none';
      list.append(b);
    }
    async function clearChat() { for (const m of await db.list('chat')) await db.remove(m.id); clear(list); toast('대화를 지웠어요. 확정한 항목은 그대로 있어요.'); }

    // 음성
    let recorder = null, timer = 0;
    async function toggleMic() {
      if (recorder?.running) { const r = await recorder.stop(); clearInterval(timer); recBar.classList.add('hide'); micBtn.classList.remove('rec'); if (r.text.trim()) send(r.text.trim(), 'voice'); else toast('알아들은 말이 없어요'); return; }
      if (!hasSpeech()) { toast('이 브라우저는 실시간 받아쓰기를 지원하지 않아요. 회의록 메뉴에서 녹음 후 받아쓰기를 써 주세요.'); return; }
      const wave = waveEl(28); const live = h('span.small.muted.grow', '듣고 있어요…'); const tm = h('span.mono.small', '0:00');
      clear(recBar).append(h('span.dot', { style: { background: 'var(--bad)' } }), wave, live, tm, h('button.btn.sm', { onclick: toggleMic }, ic('stop', 14), '끝'));
      recBar.classList.remove('hide'); micBtn.classList.add('rec');
      let sec = 0; timer = setInterval(() => (tm.textContent = fmtSec(++sec)), 1000);
      recorder = createRecorder({ record: false, onLevel: v => wave.level(v), onInterim: t => (live.textContent = t || '듣고 있어요…'), onText: full => (live.textContent = full.slice(-80)) });
      try { await recorder.start(); } catch (e) { toast(e.message); recBar.classList.add('hide'); micBtn.classList.remove('rec'); clearInterval(timer); }
    }
    const onChat = async e => { await drawMsg(e.detail, new Map()); scrollDown(); };
    window.addEventListener('hajin:chat', onChat);
    return () => { window.removeEventListener('hajin:chat', onChat); if (recorder?.running) recorder.stop(); clearInterval(timer); };
  },
};
const meBubble = t => h('div.bubble.me', t);
const botBubble = (c, cls = '') => h('div.bubble.bot' + (cls ? '.' + cls : ''), c);
