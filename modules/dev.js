// 앱 개선 요청: 하고 싶은 말 → 코딩 AI에 붙여 넣을 요청서. 안 되는 것과 대안도 여기서 한눈에
import { h, ic, clear, toast, head, fmtDate, confirmBox } from '../js/ui.js';
import * as db from '../js/db.js';
import * as C from '../js/codex.js';
import * as G from '../js/gripe.js';
import * as A from '../js/admin.js';

export default {
  async render(root) {
    const me = await A.who(); const gbox = h('div'); let gAll = false;
    root.append(head('앱 개선 요청', me.admin ? '팀이 쓰다 불편했던 것이 여기 모여요. 아래에서 요청서로도 바꿀 수 있어요.' : '쓰다 불편한 건 여기나 소머AI에 그냥 말해 주세요. 접수되고, 고쳐지면 알려 드려요.'));
    const gin = h('input.in', { placeholder: '예: 폰에서 캘린더 글씨가 너무 작아요', 'aria-label': '불편한 점 적기' });
    const gsend = async () => { const t = gin.value.trim(); if (!t) return toast('불편한 점을 적어 주세요'); await G.file({ text: t, kind: 'write', route: '앱 개선 요청' }); gin.value = ''; toast(me.admin ? '접수했어요' : '접수했어요. 고쳐지면 알려 드릴게요'); drawGripes(); };
    gin.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); gsend(); } });
    async function drawGripes() {
      const mineOnly = !me.admin; const xs = (await G.all()).filter(g => !mineOnly || g.by === me.name || (me.was || []).includes(g.by));
      const open = xs.filter(G.isOpen); const shown = gAll ? xs : open;
      const row = g => { const mine = g.by === me.name;
        const st = me.admin ? h('button.dev-st' + (g.status === '반영됨' ? '.done' : ''), { type: 'button', title: '눌러서 상태 바꾸기', 'aria-label': `상태 ${g.status}, 눌러서 바꾸기`, onclick: async () => { const next = G.STATUS[(G.STATUS.indexOf(g.status) + 1) % G.STATUS.length]; await G.setStatus(g.id, next); drawGripes(); } }, g.status) : h('span.dev-st' + (g.status === '반영됨' ? '.done' : ''), g.status);
        const ctx = [g.said && ['그 전에 한 말', g.said], g.bot && [`소머AI 답${g.ai ? ' (AI)' : ''}`, g.bot], g.made && g.made.length && ['만들어진 것', g.made.join(' / ')], g.fixNote && ['반영', g.fixNote]].filter(Boolean);
        return h('div.li.gr-li', st,
          h('div.grow', h('div.t.small', g.text), (g.more || []).map(m => h('div.small.gr-more', m)),
            h('div.faint.tiny', [me.admin ? g.by : '', fmtDate(g.createdAt, { time: true }), g.route, g.dev, g.ver ? 'v' + g.ver : '', G.KIND[g.kind] || ''].filter(Boolean).join(' · ')),
            ctx.length ? h('details.gr-ctx', h('summary', '앞뒤 보기'), ctx.map(([k, v]) => h('p', h('b', k), v))) : null,
          h('div.row.gr-act',
          me.admin ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { ta.value = [g.text, ...(g.more || [])].join('\n') + (g.said ? `\n(그 전에 한 말: ${g.said})` : '') + (g.bot ? `\n(소머AI 답: ${g.bot})` : ''); make(); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, '요청서로') : null,
          (me.admin || (mine && g.status === '접수')) ? h('button.btn.sm.ghost.icon', { type: 'button', 'aria-label': '접수 지우기', onclick: async () => { if (await confirmBox('이 접수를 지울까요?', '지우기')) { await db.remove(g.id); drawGripes(); } } }, ic('trash', 14)) : null))); };
      clear(gbox);
      gbox.append(h('div.card', h('div.card-h', h('h3', ic('flag', 15), me.admin ? ' 불편 접수' : ' 내가 접수한 불편'), h('span.chip' + (open.length ? '.acc' : ''), `열린 것 ${open.length}`)),
        h('div.row.gr-in', gin, h('button.btn.pri', { type: 'button', onclick: gsend }, '접수')),
        h('p.faint.tiny', { style: { margin: '8px 0 0' } }, me.admin ? '소머AI에게 한 불평, 아쉬워요, 같은 걸 거듭 고쳐 말한 것이 자동으로 들어와요. 한 말과 그때의 답이 같이 남아요.' : '소머AI에게 “왜 이래”, “이상하게 알아듣네”처럼 말해도 접수돼요. 한 말과 그때의 답이 관리자에게 같이 전해져요.'),
        shown.length ? h('div.list', { style: { marginTop: '10px' } }, shown.slice(0, 60).map(row)) : h('div.empty', gAll ? '접수된 게 없어요' : '열려 있는 접수가 없어요'),
        h('div.row', { style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
          xs.length > open.length || gAll ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { gAll = !gAll; drawGripes(); } }, gAll ? '열린 것만 보기' : `끝난 것도 보기 (${xs.length - open.length})`) : null,
          me.admin && open.length ? h('button.btn.sm', { type: 'button', onclick: async () => { const tx = `소머스튜디오 앱 불편 접수 ${open.length}건\n\n` + G.asText(open); try { await navigator.clipboard.writeText(tx); toast('모아서 복사했어요. 개발 요청에 붙여 넣으세요'); } catch { ta.value = tx; toast('아래 칸에 넣었어요. 복사해 주세요'); } } }, ic('copy', 14), `열린 것 ${open.length}건 모아 복사`) : null)));
    }
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
    root.append(gbox, h('div.card', h('div.card-h', h('h3', ic('file', 15), ' 요청서 만들기')), h('p.faint.tiny', { style: { margin: '0 0 8px' } }, '바꾸고 싶은 걸 평소 말로 적으면 코딩 AI에 그대로 붙여 넣을 요청서로 바꿔 드려요.'), ta, h('div.row', { style: { marginTop: '10px', gap: '8px' } }, h('button.btn.pri', { onclick: make }, ic('sparkles', 14), '요청서 만들기'), h('span.faint.tiny', '소머AI 채팅에서 "앱 고쳐줘: …"라고 해도 돼요'))), out, hist,
      h('details.card.dev-lim', h('summary', h('b', '이 앱에서 안 되는 것과 대신 쓰는 방법'), h('span.faint.tiny', ` ${C.LIMITS.length}가지`)),
        h('div.dev-lims', C.LIMITS.map(([t, why, alt]) => h('div.dev-l', h('b', t), h('p', why), h('p.alt', ic('check', 13), alt))))));
    drawHist(); drawGripes(); G.applyFixed().then(n => { if (n) drawGripes(); }).catch(() => { });
  },
};
