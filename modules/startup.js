import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, addDays, ymd, confirmBox, tile, ring, md, colorFor } from '../js/ui.js';
import * as db from '../js/db.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';
import { go } from '../js/app.js';

let tab = 'okr';
export default {
  async render(root) {
    const body = h('div');
    root.append(head('스타트업 PM', '목표·로드맵·지원사업·지표·주간 보고를 PM 시선으로 한곳에.'), body);
    await draw();
    async function draw() {
      clear(body);
      const [okrs, ms, grants, kpis] = await Promise.all([db.list('okrs'), db.list('milestones'), db.list('grants'), db.list('kpis')]);
      const q = brain.quarterOf();
      const qOkrs = okrs.filter(o => o.quarter === q);
      const avg = qOkrs.length ? qOkrs.reduce((s, o) => s + okrProgress(o), 0) / qOkrs.length : 0;
      const nextG = grants.filter(g => g.deadline && g.deadline >= todayStr() && !['선정', '탈락'].includes(g.status)).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
      body.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('target', Math.round(avg * 100) + '%', `${String(q).replace(/^\d{4}\s*/, '')} 목표 달성`, avg >= .7 ? 'ok' : ''),
        tile('flag', ms.filter(m => m.status !== '완료').length, '남은 마일스톤'),
        tile('clock', nextG ? 'D-' + dday(nextG.deadline) : '–', nextG ? nextG.title.slice(0, 12) : '다가오는 마감 없음', nextG && dday(nextG.deadline) <= 7 ? 'bad' : ''),
        tile('trend', kpis.length, '추적 지표')));
      body.append(h('div', { style: { marginBottom: '12px', overflowX: 'auto' } }, seg([['okr', '목표·OKR'], ['road', '로드맵'], ['grant', '지원사업·투자'], ['kpi', '지표'], ['report', '주간 보고'], ['decide', '결정 기록']], tab, v => { tab = v; draw(); })));
      if (tab === 'okr') body.append(okrView(okrs, draw));
      if (tab === 'road') body.append(roadView(ms, draw));
      if (tab === 'grant') body.append(grantView(grants, draw));
      if (tab === 'kpi') body.append(kpiView(kpis, draw));
      if (tab === 'report') body.append(await reportView());
      if (tab === 'decide') body.append(await decideView());
    }
  },
};
const dday = d => Math.ceil((new Date(d) - new Date(todayStr())) / 864e5);
const okrProgress = o => { const k = o.krs || []; return k.length ? k.reduce((s, r) => s + Math.min(1, (Number(r.current) || 0) / (Number(r.target) || 1)), 0) / k.length : 0; };

function okrView(okrs, redraw) {
  const q = brain.quarterOf();
  const wrap = h('div.stack');
  wrap.append(h('div.row', h('button.btn.sm.pri', { onclick: () => modal('새 목표', close => form(FIELDS.okr, { quarter: q }, async v => { await db.put('okrs', { ...v, krs: [] }); close(); redraw(); })) }, ic('plus', 14), '목표')));
  const groups = {}; okrs.forEach(o => (groups[o.quarter || q] = groups[o.quarter || q] || []).push(o));
  if (!okrs.length) wrap.append(h('div.card', h('div.empty', '목표 하나에 핵심 결과(숫자) 2~4개가 좋아요. 예: "첫 고객 10팀" → 인터뷰 30회, 데모 5회')));
  for (const [qq, os] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
    wrap.append(h('div.faint.small', { style: { fontWeight: 650 } }, qq));
    for (const o of os) {
      const p = okrProgress(o);
      const krs = h('div.stack', { style: { marginTop: '10px' } });
      (o.krs || []).forEach((r, i) => {
        const pr = Math.min(1, (Number(r.current) || 0) / (Number(r.target) || 1));
        const inp = h('input.in', { type: 'number', value: r.current ?? 0, style: { width: '84px', padding: '4px 8px' }, onchange: async () => { o.krs[i].current = Number(inp.value); await db.patch(o.id, { krs: o.krs }); redraw(); } });
        krs.append(h('div', h('div.row.between.small', h('span', r.title), h('span.row', inp, h('span.faint', `/ ${r.target}${r.unit || ''}`), h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async () => { o.krs.splice(i, 1); await db.patch(o.id, { krs: o.krs }); redraw(); } }, ic('x', 12)))), h('div.bar', { style: { marginTop: '4px' } }, h('i', { style: { width: pr * 100 + '%', background: pr >= 1 ? 'var(--ok)' : 'var(--acc)' } }))));
      });
      wrap.append(h('div.card', h('div.row', ring(p, { size: 52 }), h('div.grow', h('h3', o.title), h('p.faint.tiny', [o.owner, `핵심 결과 ${(o.krs || []).length}개`].filter(Boolean).join(' · '))),
        h('button.btn.sm', { onclick: () => modal('핵심 결과 추가', close => form([{ k: 'title', label: '핵심 결과', full: true }, { k: 'target', label: '목표치', type: 'number' }, { k: 'unit', label: '단위', placeholder: '명, 건, 원, %' }, { k: 'current', label: '현재', type: 'number', default: 0 }], {}, async v => { o.krs = [...(o.krs || []), v]; await db.patch(o.id, { krs: o.krs }); close(); redraw(); })) }, ic('plus', 14), 'KR'),
        h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('목표를 지울까요?', '지우기')) { await db.remove(o.id); redraw(); } } }, ic('trash', 14))), krs));
    }
  }
  return wrap;
}

function roadView(ms, redraw) {
  const wrap = h('div');
  const add = (m = { status: '예정' }) => modal(m.id ? '마일스톤 고치기' : '새 마일스톤', close => form([{ k: 'title', label: '마일스톤', full: true }, { k: 'date', label: '목표일', type: 'date' }, { k: 'status', label: '상태', type: 'select', options: ['예정', '진행', '완료', '지연'] }, { k: 'project', label: '프로젝트' }, { k: 'memo', label: '완료 기준', type: 'textarea', rows: 2 }], m, async v => { await db.put('milestones', { ...m, ...v }); close(); redraw(); }));
  wrap.append(h('div.row', { style: { marginBottom: '12px' } }, h('button.btn.sm.pri', { onclick: () => add() }, ic('plus', 14), '마일스톤')));
  const sorted = ms.sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  if (!sorted.length) { wrap.append(h('div.card', h('div.empty', '출시·데모데이·지원 마감처럼 큰 지점을 찍어 두세요'))); return wrap; }
  const byM = {}; sorted.forEach(m => (byM[(m.date || '미정').slice(0, 7)] = byM[(m.date || '미정').slice(0, 7)] || []).push(m));
  const tl = h('div.timeline.card');
  const tone = { 완료: 'ok', 진행: 'acc', 지연: 'bad', 예정: '' };
  for (const [mo, xs] of Object.entries(byM)) {
    tl.append(h('div.small', { style: { fontWeight: 700, margin: '6px 0' } }, mo === '미정' ? '날짜 미정' : `${+mo.slice(0, 4)}년 ${+mo.slice(5)}월`));
    xs.forEach(m => tl.append(h('div.tl-i', { style: { cursor: 'pointer' }, onclick: () => add(m) }, h('div.row', h('span.t', m.title), h('span.chip' + (tone[m.status] ? '.' + tone[m.status] : ''), m.status), m.date ? h('span.faint.tiny', dday(m.date) >= 0 ? `D-${dday(m.date)}` : `${-dday(m.date)}일 지남`) : null), m.memo ? h('div.faint.tiny', m.memo) : null)));
  }
  wrap.append(tl);
  return wrap;
}

function grantView(gs, redraw) {
  const cols = ['검토', '준비', '제출', '서류 합격', '발표', '선정', '탈락'];
  const edit = (g = { status: '검토' }) => modal(g.id ? '지원사업 고치기' : '새 지원사업·투자', close => { const f = form(FIELDS.grant, g, async v => { await db.put('grants', { ...g, ...v }); close(); redraw(); }); if (g.id) f.querySelector('.modal-f').prepend(h('button.btn.danger', { type: 'button', onclick: async () => { await db.remove(g.id); close(); redraw(); } }, ic('trash', 14))); return f; });
  const wrap = h('div');
  wrap.append(h('div.row', { style: { marginBottom: '12px' } }, h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '추가'),
    h('a.btn.sm.ghost', { href: 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do', target: '_blank', rel: 'noopener' }, ic('globe', 14), 'K-Startup 공고'),
    h('a.btn.sm.ghost', { href: 'https://www.bizinfo.go.kr/', target: '_blank', rel: 'noopener' }, ic('globe', 14), '기업마당')));
  const kan = h('div.kan');
  for (const c of cols) {
    const xs = gs.filter(g => (g.status || '검토') === c).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
    const col = h('div.kcol', h('h4', c, h('span', xs.length)));
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => { e.preventDefault(); await db.patch(e.dataTransfer.getData('text'), { status: c }); redraw(); };
    xs.forEach(g => { const d = g.deadline ? dday(g.deadline) : null; col.append(h('div.kcard', { draggable: true, ondragstart: e => e.dataTransfer.setData('text', g.id), onclick: () => edit(g) }, h('div', { style: { fontWeight: 600 } }, g.title), h('div.chips', { style: { marginTop: '6px' } }, d != null ? h('span.chip' + (d < 0 ? '' : d <= 7 ? '.bad' : d <= 14 ? '.warn' : ''), d < 0 ? '마감 지남' : 'D-' + d) : null, g.amount ? h('span.chip', Math.round(g.amount / 10000).toLocaleString() + '만원') : null, g.org ? h('span.chip', g.org) : null))); });
    kan.append(col);
  }
  wrap.append(kan);
  return wrap;
}

function kpiView(kpis, redraw) {
  const wrap = h('div');
  wrap.append(h('div.row', { style: { marginBottom: '12px' } }, h('button.btn.sm.pri', { onclick: () => modal('새 지표', close => form([{ k: 'name', label: '지표 이름 (예: 인스타 팔로워, MAU, 매출)' }, { k: 'unit', label: '단위' }, { k: 'goal', label: '목표', type: 'number' }], {}, async v => { await db.put('kpis', { ...v, history: [] }); close(); redraw(); })) }, ic('plus', 14), '지표')));
  const g = h('div.grid.gauto');
  if (!kpis.length) g.append(h('div.card', h('div.empty', '매주 숫자 하나씩만 적어도 흐름이 보여요')));
  for (const k of kpis) {
    const hist = (k.history || []).sort((a, b) => a.date.localeCompare(b.date));
    const last = hist[hist.length - 1]?.value ?? 0, prev = hist[hist.length - 2]?.value;
    const delta = prev != null ? last - prev : null;
    const inp = h('input.in', { type: 'number', placeholder: '오늘 값', style: { width: '110px' } });
    g.append(h('div.card', h('div.row.between', h('h3', k.name), h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('지표를 지울까요?', '지우기')) { await db.remove(k.id); redraw(); } } }, ic('trash', 13))),
      h('div.row', { style: { alignItems: 'baseline', gap: '6px', margin: '6px 0' } }, h('span.stat', Number(last).toLocaleString()), h('span.faint', k.unit || ''), delta != null ? h('span.chip' + (delta >= 0 ? '.ok' : '.bad'), (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta).toLocaleString()) : null),
      spark(hist.map(x => x.value), k.goal),
      k.goal ? h('div.faint.tiny', `목표 ${Number(k.goal).toLocaleString()}${k.unit || ''} · ${Math.round(last / k.goal * 100)}%`) : null,
      h('div.row', { style: { marginTop: '8px' } }, inp, h('button.btn.sm', { onclick: async () => { if (inp.value === '') return; const hs = (k.history || []).filter(x => x.date !== todayStr()); hs.push({ date: todayStr(), value: Number(inp.value) }); await db.patch(k.id, { history: hs }); redraw(); } }, '기록'))));
  }
  wrap.append(g);
  return wrap;
}
function spark(vals, goal) {
  const W = 240, H = 50;
  if (vals.length < 2) return h('div.faint.tiny', { style: { height: H + 'px', display: 'grid', placeItems: 'center' } }, '두 번 이상 기록하면 그래프가 생겨요');
  const max = Math.max(...vals, goal || 0), min = Math.min(...vals, 0);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 6) - 3}`).join(' ');
  return h('div', { html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${goal ? `<line x1="0" x2="${W}" y1="${H - ((goal - min) / (max - min || 1)) * (H - 6) - 3}" y2="${H - ((goal - min) / (max - min || 1)) * (H - 6) - 3}" stroke="var(--ok)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : ''}</svg>` });
}

// 주간 보고 자동 작성 (기기 안 데이터로 조립, 임시)
async function reportView() {
  const end = todayStr(), start = ymd(addDays(new Date(), -6)), next = ymd(addDays(new Date(), 7));
  const [tasks, meetings, exps, logs, evs, ms] = await Promise.all([db.list('tasks'), db.list('meetings'), db.list('expenses'), db.list('timelogs'), db.list('events'), db.list('milestones')]);
  const done = tasks.filter(t => t.done && db.dayOf(t.doneAt || '') >= start);
  const open = tasks.filter(t => !t.done && t.due && t.due <= next);
  const mt = meetings.filter(m => (m.date || '') >= start);
  const spend = exps.filter(e => e.date >= start && e.date <= end).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const mins = logs.filter(l => l.date >= start).reduce((s, l) => s + (l.minutes || 0), 0);
  const byP = {}; logs.filter(l => l.date >= start).forEach(l => (byP[l.project || '기타'] = (byP[l.project || '기타'] || 0) + l.minutes));
  const upcoming = evs.filter(e => e.date > end && e.date <= next).sort((a, b) => a.date.localeCompare(b.date));
  const decisions = mt.flatMap(m => (m.summaryConfirmed ? m.summary?.decisions : []) || []);
  const risks = mt.flatMap(m => (m.summaryConfirmed ? m.summary?.questions : []) || []);
  const L = [`# 주간 보고 (${start.slice(5).replace('-', '/')} – ${end.slice(5).replace('-', '/')})`, '',
    `## 숫자로 보는 한 주`, `- 완료한 일 ${done.length}개 · 회의 ${mt.length}회 · 작업 ${Math.floor(mins / 60)}시간 ${mins % 60}분 · 지출 ${spend.toLocaleString()}원`, ''];
  if (Object.keys(byP).length) L.push('## 시간을 쓴 곳', ...Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([p, m]) => `- ${p}: ${Math.round(m / 6) / 10}시간`), '');
  if (done.length) L.push('## 한 일', ...done.slice(0, 15).map(t => `- ${t.title}${t.project ? ` (${t.project})` : ''}`), '');
  if (decisions.length) L.push('## 결정한 것', ...decisions.slice(0, 8).map(d => '- ' + d), '');
  if (open.length) L.push('## 다음 주 할 일', ...open.slice(0, 12).map(t => `- ${t.title}${t.who ? ' · ' + t.who : ''}${t.due ? ' · ~' + t.due.slice(5).replace('-', '/') : ''}`), '');
  if (upcoming.length) L.push('## 다음 주 일정', ...upcoming.slice(0, 10).map(e => `- ${e.date.slice(5).replace('-', '/')} ${e.start || ''} ${e.title}`), '');
  const nm = ms.filter(m => m.status !== '완료' && m.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nm) L.push('## 다음 마일스톤', `- ${nm.title} (D-${dday(nm.date)})`, '');
  if (risks.length) L.push('## 고민·리스크', ...risks.slice(0, 6).map(r => '- ' + r), '');
  const ta = h('textarea.in', { rows: 22 }, L.join('\n'));
  return h('div.card', h('div.card-h', h('h3', ic('file'), '이번 주 보고서 초안'), h('div.row', h('span.chip.warn', '임시 · 고쳐서 쓰세요'), h('button.btn.sm', { onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('복사했어요'); } catch { toast('복사 권한이 없어요'); } } }, ic('copy', 14), '복사'),
    h('button.btn.sm.pri', { onclick: async () => { const n = await db.put('notes', { type: 'doc', template: '주간 보고', title: `주간 보고 ${end}`, body: ta.value, tags: ['주간보고'] }); toast('기획 보드에 문서로 저장했어요'); go('plan/' + n.id); } }, ic('check', 14), '문서로 확정'))),
    h('p.faint.small', { style: { marginBottom: '8px' } }, '확정한 회의 요약·완료한 할 일·작업 기록·지출에서 자동으로 모았어요.'), ta);
}
async function decideView() {
  const ms = (await db.list('meetings')).filter(m => m.summaryConfirmed && m.summary?.decisions?.length).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const c = h('div.card');
  if (!ms.length) c.append(h('div.empty', '회의 요약을 확정하면 결정사항이 여기 쌓여요. "그때 왜 그렇게 정했지?"를 찾을 때 좋아요.'));
  for (const m of ms) c.append(h('div', { style: { marginBottom: '12px' } }, h('div.row', h('span.faint.tiny', m.date), h('a.small', { href: '#/meetings/' + m.id }, m.title)), h('ul', { style: { margin: '4px 0', paddingLeft: '18px' } }, m.summary.decisions.map(d => h('li.small', d)))));
  return c;
}
