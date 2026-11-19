// 앱 개선 요청: 하고 싶은 말 → 코딩 AI에 붙여 넣을 요청서. 안 되는 것과 대안도 여기서 한눈에
import { h, ic, clear, toast, head, fmtDate, confirmBox } from '../js/ui.js';
import * as db from '../js/db.js';
import * as C from '../js/codex.js';

export default {
  async render(root) {
    root.append(head('앱 개선 요청', '바꾸고 싶은 걸 평소 말로 적으면, GPT Codex에 그대로 붙여 넣을 요청서로 바꿔 드려요.'));
    const ta = h('textarea.in', { rows: 4, placeholder: '예: 메신저에서 사진도 보낼 수 있게 해줘\n예: 폰에서 캘린더 글씨가 너무 작아', 'aria-label': '바꾸고 싶은 것' });
    const out = h('div'); const hist = h('div');
    const make = async () => {
      const text = ta.value.trim(); if (!text) return toast('바꾸고 싶은 걸 적어 주세요');
      const r = await C.build(text, { route: document.referrer ? '' : (sessionStorage.getItem('lastRoute') || '') }); await C.save(text, r); show(r); drawHist();
    };
    const show = r => {
      clear(out);
      const pre = h('textarea.in.dev-out', { rows: 14, 'aria-label': '요청서' }); pre.value = r.body;
      out.append(h('div.card', h('div.card-h', h('h3', ic('file', 15), ' 요청서'), h('span.chip.acc', r.kind || '요청')),
        r.areas?.length ? h('div.chips', { style: { marginBottom: '8px' } }, r.areas.map(a => h('span.chip', a))) : null, pre,
        h('div.row', { style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
          h('button.btn.pri', { onclick: async () => { try { await navigator.clipboard.writeText(pre.value); toast('복사했어요. Codex에 붙여 넣으세요'); } catch { pre.select(); toast('글을 선택했어요. 복사해 주세요'); } } }, ic('copy', 14), '요청서 복사'),
          h('a.btn', { href: 'https://chatgpt.com/codex', target: '_blank', rel: 'noopener' }, ic('link', 14), 'Codex 열기'),
          h('a.btn.ghost', { href: C.issueUrl({ ...r, body: pre.value }), target: '_blank', rel: 'noopener', title: '저장소에 기록으로 남겨요' }, ic('flag', 14), 'GitHub 이슈로 남기기')),
        h('p.faint.tiny', { style: { marginTop: '8px' } }, 'Codex에서 저장소 ' + C.REPO + '를 고르고 붙여 넣으면 돼요. 고친 내용이 main에 합쳐지면 1분쯤 뒤 앱이 스스로 새 버전을 받아요.')));
    };
    const drawHist = async () => {
      clear(hist); const xs = (await db.list('devreqs')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12); if (!xs.length) return;
      hist.append(h('div.card', h('div.card-h', h('h3', '지난 요청')), h('div.list', xs.map(x => h('div.li', h('button.dev-st' + (x.status === '반영됨' ? '.done' : ''), { title: '눌러서 상태 바꾸기', onclick: async () => { await db.patch(x.id, { status: x.status === '반영됨' ? '요청 전' : x.status === '요청함' ? '반영됨' : '요청함' }); drawHist(); } }, x.status || '요청 전'),
        h('div.grow.click', { onclick: () => { ta.value = x.text; show(x); scrollTo({ top: 0, behavior: 'smooth' }); } }, h('div.t.small', x.title), h('div.faint.tiny', fmtDate(x.createdAt))),
        h('button.btn.sm.ghost.icon', { 'aria-label': '지우기', onclick: async () => { if (await confirmBox('이 요청 기록을 지울까요?', '지우기')) { await db.remove(x.id); drawHist(); } } }, ic('trash', 14)))))));
    };
    root.append(h('div.card', ta, h('div.row', { style: { marginTop: '10px', gap: '8px' } }, h('button.btn.pri', { onclick: make }, ic('sparkles', 14), '요청서 만들기'), h('span.faint.tiny', '비서 채팅에서 "앱 고쳐줘: …"라고 해도 돼요'))), out, hist,
      h('details.card.dev-lim', h('summary', h('b', '이 앱에서 안 되는 것과 대신 쓰는 방법'), h('span.faint.tiny', ` ${C.LIMITS.length}가지`)),
        h('div.dev-lims', C.LIMITS.map(([t, why, alt]) => h('div.dev-l', h('b', t), h('p', why), h('p.alt', ic('check', 13), alt))))));
    drawHist();
  },
};
