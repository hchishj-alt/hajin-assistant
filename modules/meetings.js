import { h, ic, clear, toast, head, modal, form, todayStr, fmtDate, busy, download, confirmBox, pickFile, tile } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { createRecorder, hasSpeech, waveEl, fmtSec } from '../js/voice.js';
import { draftCard, summaryView } from '../js/draftcard.js';
import { go, updateBadge } from '../js/app.js';

export default {
  async render(root, params) {
    if (params[0] === 'new') return newMeeting(root);
    if (params[0]) return detail(root, params[0]);
    const ms = (await db.list('meetings')).sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
    const unconfirmed = ms.filter(m => !m.summaryConfirmed).length;
    const totalMin = Math.round(ms.reduce((s, m) => s + (m.seconds || 0), 0) / 60);
    root.append(head('회의록', '녹음하면서 받아쓰고, 끝나면 요약·결정·할 일을 뽑아요.',
      h('button.btn.sm', { onclick: () => paste() }, ic('file', 14), '메모 붙여넣기'),
      h('a.btn.sm.pri', { href: '#/meetings/new' }, ic('mic', 14), '새 회의')),
      h('div.tiles', { style: { marginBottom: '14px' } }, tile('mic', ms.length, '회의'), tile('sparkles', unconfirmed, '요약 확인 전', unconfirmed ? 'warn' : 'ok'), tile('clock', totalMin + '분', '녹음 시간'), tile('check2', (await db.list('tasks')).filter(t => t.sourceRef && ms.some(m => m.id === t.sourceRef)).length, '회의에서 나온 할 일')));
    const c = h('div.card');
    if (!ms.length) c.append(h('div.empty', '아직 회의록이 없어요. 새 회의를 눌러 녹음해 보세요.'));
    for (const m of ms) c.append(h('div.li.click', { onclick: () => go('meetings/' + m.id) },
      h('div.ti', { style: { width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: m.summaryConfirmed ? 'var(--ok-soft)' : 'var(--warn-soft)', color: m.summaryConfirmed ? 'var(--ok)' : 'var(--warn)' } }, ic(m.summaryConfirmed ? 'check' : 'sparkles', 16)),
      h('div.grow', h('div.t', m.title), h('div.faint.tiny', [fmtDate(m.date || m.createdAt), m.attendees, m.seconds ? fmtSec(m.seconds) : '', m.project].filter(Boolean).join(' · '))),
      h('div.chips', (m.keywords || []).slice(0, 3).map(k => h('span.chip', '#' + k)))));
    root.append(c);

    function paste() {
      modal('회의 메모 붙여넣기', close => form([{ k: 'title', label: '회의 이름', full: true }, { k: 'date', label: '날짜', type: 'date', default: todayStr() }, { k: 'attendees', label: '참석자 (쉼표로)' }, { k: 'transcript', label: '메모·대화 내용', type: 'textarea', rows: 10, placeholder: '카톡 대화, 노트, 받아쓴 내용 무엇이든' }], {}, async v => {
        const m = await db.put('meetings', { ...v, title: v.title || '회의', seconds: 0 });
        close(); await analyze(m); go('meetings/' + m.id);
      }, { submitLabel: '저장하고 정리' }));
    }
  },
};

async function newMeeting(root) {
  const people = (await db.list('contacts'));
  const title = h('input.in', { placeholder: '회의 이름 (예: 이터니아 회고)', value: '' });
  const att = h('input.in', { placeholder: '참석자 (쉼표로)', list: 'pp' });
  const proj = h('input.in', { placeholder: '프로젝트', list: 'pj' });
  const dl = h('datalist#pp', people.map(p => h('option', { value: p.name })));
  const pj = h('datalist#pj', (await store.projects()).map(p => h('option', { value: p })));
  const ta = h('textarea.in', { rows: 12, placeholder: hasSpeech() ? '녹음을 시작하면 여기에 받아쓴 내용이 실시간으로 쌓여요. 직접 적어도 돼요.' : '이 브라우저는 실시간 받아쓰기가 안 돼요. 녹음은 되고, 끝난 뒤 확장 두뇌로 받아쓸 수 있어요. 직접 메모해도 돼요.' });
  const interim = h('div.faint.small', { style: { minHeight: '20px', marginTop: '4px' } });
  const wave = waveEl(40);
  const timer = h('span.mono', '0:00');
  const recBtn = h('button.btn.pri', { style: { minWidth: '130px' } }, ic('mic', 16), '녹음 시작');
  const markBtn = h('button.btn', { disabled: true, title: '지금 이 순간을 중요 표시' }, ic('star', 14), '중요');
  const doneBtn = h('button.btn', ic('check', 14), '끝내고 정리');
  let rec = null, sec = 0, iv = 0, blob = null, base = '';

  recBtn.onclick = async () => {
    if (rec?.running) { await stopRec(); return; }
    base = ta.value ? ta.value.trimEnd() + '\n' : '';
    rec = createRecorder({ onLevel: v => wave.level(v), onInterim: t => (interim.textContent = t), onText: (full) => { ta.value = base + full; ta.scrollTop = ta.scrollHeight; } });
    try { await rec.start(); } catch (e) { toast(e.message); return; }
    recBtn.className = 'btn rec'; recBtn.innerHTML = ''; recBtn.append(ic('stop', 16), '일시정지');
    markBtn.disabled = false;
    iv = setInterval(() => (timer.textContent = fmtSec(++sec)), 1000);
  };
  async function stopRec() {
    const r = await rec.stop(); clearInterval(iv);
    if (r.blob) blob = blob ? new Blob([blob, r.blob], { type: r.blob.type }) : r.blob;
    recBtn.className = 'btn pri'; recBtn.innerHTML = ''; recBtn.append(ic('mic', 16), '이어서 녹음');
    markBtn.disabled = true; interim.textContent = '';
  }
  markBtn.onclick = () => { ta.value = ta.value.trimEnd() + ` ★[${fmtSec(sec)} 중요] `; base = ta.value; };
  doneBtn.onclick = async () => {
    if (rec?.running) await stopRec();
    if (!ta.value.trim() && !blob) { toast('녹음이나 메모가 없어요'); return; }
    busy(doneBtn, true, '정리 중');
    const audioKey = blob ? await db.putBlob(blob) : null;
    const m = await db.put('meetings', { title: title.value.trim() || `${fmtDate(new Date())} 회의`, date: todayStr(), attendees: att.value.trim(), project: proj.value.trim(), transcript: ta.value.trim(), audioKey, seconds: sec });
    if (m.transcript) await analyze(m);
    go('meetings/' + m.id);
  };
  const upBtn = h('button.btn.sm.ghost', { onclick: async () => { const f = await pickFile('audio/*,video/*'); if (!f) return; blob = f; toast('파일을 붙였어요. 저장 후 상세 화면에서 받아쓰기를 눌러 주세요.'); } }, ic('upload', 14), '녹음 파일 올리기');

  root.append(head('새 회의', '말하는 동안 받아쓰고, ★ 버튼으로 중요한 순간을 표시해요.', h('a.btn.sm.ghost', { href: '#/meetings' }, '목록')),
    h('div.grid.g3', { style: { marginBottom: '12px' } }, title, att, proj), dl, pj,
    h('div.card', h('div.row.between', { style: { marginBottom: '10px' } }, h('div.row', recBtn, markBtn, upBtn), h('div.row', wave, timer)), ta, interim, h('div.modal-f', doneBtn)));
  return () => { if (rec?.running) rec.stop(); clearInterval(iv); };
}

// 회의 분석 → 요약은 임시(확인 대기), 할 일·일정도 임시
export async function analyze(m) {
  const people = [...(m.attendees || '').split(/[,，\s]+/).filter(Boolean), ...(await db.list('contacts')).map(c => c.name), ...(await store.teammateNames())];
  const a = brain.analyzeNotes(m.transcript || '', { people, base: new Date(m.date || Date.now()) });
  const stars = [...(m.transcript || '').matchAll(/★\[([\d:]+) 중요\]\s*([^★]{0,120})/g)].map(x => `${x[1]} ${x[2].trim()}`);
  if (stars.length) a.summary = [...stars.map(s => '★ ' + s), ...a.summary];
  await db.patch(m.id, { keywords: a.keywords, summaryDraft: a, summaryConfirmed: false });
  // 이전 임시 항목 정리
  for (const d of await store.drafts()) if (d.sourceRef === m.id) await store.reject(d);
  await store.draft('summary', { title: `${m.title} 요약`, ...a }, { sourceRef: m.id, source: m.transcript, origin: 'meeting', confidence: 0.7 });
  for (const t of a.actions) await store.draft('task', { title: t.title, due: t.due || '', who: t.who || '', priority: 'normal', project: m.project || '', memo: `${m.title}: ${t.src}` }, { source: t.src, sourceRef: m.id, origin: 'meeting', confidence: t.who || t.due ? 0.8 : 0.65 });
  for (const d of a.dates) await store.draft('event', { title: d.title || '후속 일정', date: d.date, start: d.time || '', end: d.end || '', memo: `${m.title}: ${d.src}` }, { source: d.src, sourceRef: m.id, origin: 'meeting', confidence: d.time ? 0.75 : 0.55 });
  updateBadge();
  return a;
}

async function detail(root, id) {
  const m = await db.get(id);
  if (!m || m.deleted) { root.append(h('div.empty', '회의록을 찾을 수 없어요')); return; }
  const s = m.summaryConfirmed ? m.summary : m.summaryDraft;
  const drafts = (await store.drafts()).filter(d => d.sourceRef === id);
  const audio = m.audioKey ? await db.getBlob(m.audioKey) : null;
  const ta = h('textarea.in', { rows: 14 }, m.transcript || '');
  const saveBtn = h('button.btn.sm', { onclick: async () => { await db.patch(id, { transcript: ta.value }); toast('저장했어요'); } }, '저장');
  const reBtn = h('button.btn.sm', { onclick: async () => { busy(reBtn, true); await db.patch(id, { transcript: ta.value }); await analyze({ ...m, transcript: ta.value }); go('meetings/' + id); } }, ic('refresh', 14), '다시 정리');
  const sttBtn = audio ? h('button.btn.sm', { onclick: async () => {
    const ext = await import('../js/ext.js');
    if (!(await ext.isReady('stt'))) { toast('설정 → 확장 두뇌에서 음성인식 모델을 먼저 받아 주세요'); go('settings/ext'); return; }
    busy(sttBtn, true, '받아쓰는 중');
    try { const r = await ext.transcribe(audio, p => (sttBtn.lastChild.textContent = ` ${Math.round(p * 100)}%`)); ta.value = r.text; await db.patch(id, { transcript: r.text, segments: r.chunks }); toast('받아쓰기 끝'); }
    catch (e) { toast('받아쓰기 실패: ' + e.message); store.logError(e, 'stt'); }
    busy(sttBtn, false);
  } }, ic('wave', 14), '녹음 받아쓰기') : null;

  const sumCard = h('div.card', h('div.card-h', h('h3', ic('sparkles'), '정리', m.summaryConfirmed ? h('span.chip.ok', '확정') : h('span.chip.warn', '확인 전 · 임시')),
    h('div.row', !m.summaryConfirmed && s ? h('button.btn.sm.pri', { onclick: async () => { const d = drafts.find(x => x.kind === 'summary'); if (d) await store.approve(d); else await db.patch(id, { summary: s, summaryConfirmed: true }); updateBadge(); go('meetings/' + id); } }, ic('check', 14), '요약 확정') : null,
      s ? h('button.btn.sm', { onclick: () => editSummary() }, ic('edit', 14), '고치기') : null)),
    s ? summaryView(s) : h('div.empty', '받아쓴 내용이 있으면 정리가 여기 보여요'));
  const dCard = drafts.filter(d => d.kind !== 'summary').length ? h('div.card', h('div.card-h', h('h3', ic('inbox'), '이 회의에서 나온 임시 항목'), h('span.chip.warn', drafts.filter(d => d.kind !== 'summary').length)), drafts.filter(d => d.kind !== 'summary').map(d => draftCard(d, () => updateBadge()))) : null;

  root.append(head(m.title, [fmtDate(m.date || m.createdAt), m.attendees, m.project, m.seconds ? fmtSec(m.seconds) : ''].filter(Boolean).join(' · '),
    h('button.btn.sm.ghost', { onclick: exportMd }, ic('download', 14), '내보내기'),
    h('button.btn.sm.ghost', { onclick: copyShare }, ic('copy', 14), '공유용 복사'),
    (await db.get('team-main')) ? h('button.btn.sm' + (m.team ? '.pri' : '.ghost'), { title: '팀원도 이 회의록을 봐요 (녹음 원본은 기기에만)', onclick: async () => { if (m.team) await (await import('../js/sync.js')).unshare(m).catch(() => { }); await db.patch(id, { team: m.team ? '' : 'team-main', by: m.by || (await db.kvGet('name', '')) }); toast(m.team ? '나만 보기로 바꿨어요' : '팀에 공유했어요'); go('meetings/' + id); } }, ic('users', 14), m.team ? '팀 공유 중' : '팀에 공유') : null,
    h('button.btn.sm.ghost.danger', { onclick: async () => { if (await confirmBox('회의록을 지울까요?', '지우기')) { await db.remove(id); go('meetings'); } } }, ic('trash', 14))),
    h('div.grid.g2', h('div.stack', sumCard, dCard), h('div.card', h('div.card-h', h('h3', ic('file'), '받아쓴 내용'), h('div.row', sttBtn, reBtn, saveBtn)), audio ? h('audio', { controls: true, src: URL.createObjectURL(audio), style: { width: '100%', marginBottom: '10px' } }) : null, ta)));

  function editSummary() {
    const cur = s;
    const f = [{ k: 'summary', label: '요약 (줄마다 하나)', type: 'textarea', rows: 5 }, { k: 'decisions', label: '결정사항', type: 'textarea', rows: 3 }, { k: 'questions', label: '질문·고민', type: 'textarea', rows: 3 }, { k: 'keywords', label: '키워드 (쉼표로)', full: true }];
    modal('정리 고치기', close => form(f, { summary: (cur.summary || []).join('\n'), decisions: (cur.decisions || []).join('\n'), questions: (cur.questions || []).join('\n'), keywords: (cur.keywords || []).join(', ') }, async v => {
      const ns = { ...cur, summary: v.summary.split('\n').filter(Boolean), decisions: v.decisions.split('\n').filter(Boolean), questions: v.questions.split('\n').filter(Boolean), keywords: v.keywords.split(/[,，]/).map(x => x.trim()).filter(Boolean) };
      await db.patch(id, { summary: ns, summaryDraft: ns, summaryConfirmed: true, keywords: ns.keywords });
      for (const d of drafts.filter(x => x.kind === 'summary')) await db.patch(d.id, { status: 'approved' });
      updateBadge(); close(); go('meetings/' + id);
    }, { submitLabel: '고쳐서 확정' }));
  }
  function toMd() {
    const L = [`# ${m.title}`, `- 날짜: ${m.date || ''}`, m.attendees ? `- 참석: ${m.attendees}` : '', m.project ? `- 프로젝트: ${m.project}` : '', ''];
    if (s) {
      if (s.keywords?.length) L.push('키워드: ' + s.keywords.map(k => '#' + k).join(' '), '');
      const sec = (t, a, f = x => x) => a?.length && L.push(`## ${t}`, ...a.map(x => '- ' + f(x)), '');
      sec('요약', s.summary); sec('결정사항', s.decisions); sec('할 일', s.actions, a => `${a.title}${a.who ? ' (' + a.who + ')' : ''}${a.due ? ' ~' + a.due : ''}`); sec('질문·고민', s.questions); sec('아이디어', s.ideas);
    }
    return L.filter(x => x !== '').join('\n').replace(/\n## /g, '\n\n## ');
  }
  function exportMd() { download(`${m.title}.md`, toMd() + '\n\n## 원문\n' + (m.transcript || ''), 'text/markdown'); }
  async function copyShare() { try { await navigator.clipboard.writeText(toMd()); toast('복사했어요. 카톡·슬랙에 붙여넣으세요.'); } catch { toast('복사 권한이 없어요'); } }
}
