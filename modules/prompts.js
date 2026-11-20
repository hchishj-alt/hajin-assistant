// 프롬프트 스튜디오: 팀이 AI(Claude 등)에게 일 시킬 때 쓰는 말을 모아 두고, 빈칸만 채워 바로 쓰고, 서로의 작업 방식을 보는 곳.
//  · 보관함: 내 것·팀 것 + 역할별 기본 틀. 빈칸({{이름}})은 쓸 때 채우고, 팀·오늘 일정 같은 건 앱이 알아서 채움
//  · 만들기: 칸을 채우면 프롬프트로 조립, 빠진 것을 점검. 다른 데서 쓴 프롬프트를 붙여 넣어 모아 둘 수도 있음
//  · 작업 방식: 누가 어떤 일에 어떻게 시키는지 (쓴 기록으로)
import { h, ic, clear, toast, head, modal, seg, tile, ring, confirmBox, colorFor, debounce, md, busy, rel } from '../js/ui.js';
import * as db from '../js/db.js';
import * as P from '../js/prompts.js';

const F = { tab: 'lib', q: '', role: '', cat: '' };
const preview = s => String(s || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '[$1]').replace(/\s+/g, ' ').trim();
const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { try { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, t); document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; } } };

export default {
  async render(root, params) {
    /* 값은 맨 위에서 (첫 await 앞) */
    const body = h('div.ps-page'); let me = { name: '', role: '', keys: [] }, hasTeam = false, aiOn = false;
    if (['lib', 'make', 'style'].includes(params[0])) F.tab = params[0];
    if (params[0] === 'find') { F.tab = 'lib'; F.q = params[1] || ''; F.cat = ''; }   /* 비서에게 "견적 프롬프트"라고 하면 여기로 옴 */
    let seed = '';   /* 찾는 게 없어서 새로 만들 때, 만들기 칸에 미리 넣을 말 */
    root.append(head('프롬프트 스튜디오', 'AI에게 일 시키는 말을 모아 두고, 빈칸만 채워 바로 써요. 팀이 같이 써요.',
      h('button.btn.sm.ghost.ps-tap', { type: 'button', onclick: () => about() }, ic('users', 14), '우리 팀 소개'),
      h('button.btn.sm.pri.ps-tap', { type: 'button', onclick: () => { F.tab = 'make'; draw(); } }, ic('plus', 14), '새 프롬프트')), body);
    const m = await db.kvGet('me:member', null); me.name = (m && m.name) || await db.kvGet('name', ''); me.role = await P.myRole(); me.keys = P.roleKeys(me.role);
    hasTeam = !!(await db.get('team-main')); aiOn = await (await import('../js/ai.js')).enabled().catch(() => false);
    if (!F.role && me.keys.length) F.role = me.keys[0];
    await draw();
    if (params[0] === 'use' && params[1]) {   /* 다른 화면에서 "프롬프트로" 넘어온 경우: 그 틀을 바로 열고, 들고 온 내용을 칸에 넣음 */
      let pre = {}; try { pre = JSON.parse(sessionStorage.getItem('ps:prefill') || '{}'); sessionStorage.removeItem('ps:prefill'); } catch { }
      const p = P.BUILTIN.find(t => t.id === params[1]) || (await db.get(params[1]));
      if (p && p.body) { history.replaceState(history.state, '', '#/prompts'); use(p, pre); }
    }
    const off = db.onChange(col => { if ((col === 'prompts' || col === 'promptlogs') && !document.querySelector('.modal')) drawSoon(); });
    return () => off && off();

    function drawSoon() { clearTimeout(drawSoon.t); drawSoon.t = setTimeout(() => { if (document.body.contains(body)) draw(); }, 400); }
    async function draw() {
      const mine = (await db.list('prompts')), logs = await db.list('promptlogs'), fav = await db.kvGet('prompts:fav', []);
      const uses = {}; for (const l of logs) uses[l.pid] = (uses[l.pid] || 0) + 1;
      clear(body);
      const myUses = logs.filter(l => P.samePerson(l.by, me.name)).length;
      body.append(h('div.tiles', { style: { marginBottom: '14px' } }, tile('book', mine.length, '모아 둔 프롬프트'), tile('zap', logs.length, '팀이 쓴 횟수'), tile('user', myUses, '내가 쓴 횟수')),
        h('div', { style: { marginBottom: '12px' } }, seg([['lib', '보관함'], ['make', '만들기'], ['style', '작업 방식']], F.tab, v => { F.tab = v; draw(); })));
      if (F.tab === 'make') return body.append(maker());
      if (F.tab === 'style') return body.append(await styleView(logs, mine));

      /* 보관함 */
      const search = h('input.in', { placeholder: '찾기 (제목, 내용)', 'aria-label': '프롬프트 찾기', value: F.q, oninput: debounce(e => { F.q = e.target.value; draw().then(() => { const i = body.querySelector('input.in'); if (i) { i.focus(); i.setSelectionRange(F.q.length, F.q.length); } }); }, 250) });
      const chip = (on, label, fn) => h('button.chip' + (on ? '.acc' : ''), { type: 'button', style: { cursor: 'pointer', border: 0 }, 'aria-pressed': String(!!on), onclick: fn }, label);
      body.append(h('div.ps-bar', search),
        h('div.chips.ps-scroll', { style: { margin: '10px 0 6px' } }, [['', '전체'], ...Object.entries(P.ROLES)].map(([v, l]) => chip(F.role === v, l + (v && me.keys.includes(v) ? ' · 내 역할' : ''), () => { F.role = v; draw(); }))),
        h('div.chips.ps-scroll', { style: { marginBottom: '12px' } }, [['', '모든 분야'], ...P.CATS.map(c => [c, c])].map(([v, l]) => chip(F.cat === v, l, () => { F.cat = v; draw(); }))));
      const q = F.q.trim().toLowerCase();
      const match = p => (!F.cat || p.cat === F.cat) && (q || !F.role || p.role === F.role) && (!q || `${p.title} ${p.body} ${p.cat} ${p.by || ''}`.toLowerCase().includes(q));
      const saved = mine.filter(match).sort((a, b) => (fav.includes(b.id) - fav.includes(a.id)) || (uses[b.id] || 0) - (uses[a.id] || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const built = (q ? P.byRole(me.keys) : F.role ? P.BUILTIN.filter(t => t.role === F.role) : P.byRole(me.keys)).filter(p => (!F.cat || p.cat === F.cat) && (!q || `${p.title} ${p.body} ${p.cat}`.toLowerCase().includes(q)))
        .sort((a, b) => (fav.includes(b.id) - fav.includes(a.id)) || (uses[b.id] || 0) - (uses[a.id] || 0));
      if (saved.length) body.append(h('div.ps-h', ic('users', 15), '우리가 모아 둔 것', h('small', `${saved.length}개`)), h('div.ps-grid', saved.map(p => card(p, uses, fav))));
      else if (!mine.length) body.append(h('div.card.ps-first', ic('bulb', 22), h('div.grow', h('b', '자주 시키는 말을 여기 모아 두세요'), h('p.small.muted', 'Claude에서 잘 통했던 말을 붙여 넣으면 다음부터 빈칸만 바꿔 다시 쓸 수 있어요. 팀원도 같이 봐요.')), h('button.btn.sm.pri', { type: 'button', onclick: () => importOne() }, ic('plus', 14), '붙여 넣기')));
      if (built.length) body.append(h('div.ps-h', ic('sparkles', 15), q ? '기본 틀에서 찾은 것' : F.role ? `${P.ROLES[F.role]} 기본 틀` : '기본 틀', h('small', `${built.length}개`)), h('div.ps-grid', built.map(p => card(p, uses, fav))));
      if (!saved.length && !built.length) body.append(h('div.card', h('div.empty', q ? `"${F.q.trim()}"에 맞는 프롬프트가 아직 없어요.` : '조건에 맞는 프롬프트가 없어요.', h('div.row', { style: { marginTop: '10px', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
        q ? h('button.btn.sm.pri', { type: 'button', onclick: () => { seed = F.q.trim(); F.q = ''; F.tab = 'make'; draw(); } }, ic('plus', 14), '이 주제로 새로 만들기') : null,
        h('button.btn.sm', { type: 'button', onclick: () => { F.q = ''; F.cat = ''; F.role = ''; draw(); } }, '조건 지우기')))));
    }

    function card(p, uses, fav) {
      const on = fav.includes(p.id), n = uses[p.id] || 0, vs = P.vars(p.body).filter(v => !P.AUTO.includes(v));
      return h('div.ps-card', { 'data-id': p.id },
        h('button.ps-main', { type: 'button', onclick: () => use(p) },
          h('div.ps-top', h('b', p.title), h('span.chip.tiny', p.cat || '기타')),
          h('p.ps-pre', preview(p.body).slice(0, 110)),
          h('div.ps-meta', p.builtin ? h('span', ic('sparkles', 13), '기본 틀') : h('span', h('i.ps-dot', { style: { background: colorFor(p.by || me.name || '나') } }), p.by || me.name || '나', p.team ? '' : ' · 나만'), h('span', ic('zap', 13), `${n}번`), vs.length ? h('span', ic('edit', 13), `빈칸 ${vs.length}`) : null)),
        h('div.ps-act',
          h('button.btn.icon.ghost' + (on ? '.on' : ''), { type: 'button', 'aria-label': on ? '즐겨찾기 빼기' : '즐겨찾기', 'aria-pressed': String(on), onclick: async () => { const f = await db.kvGet('prompts:fav', []); await db.kvSet('prompts:fav', on ? f.filter(x => x !== p.id) : [...f, p.id]); draw(); } }, ic('star', 18)),
          h('button.btn.sm.pri', { type: 'button', onclick: () => use(p) }, '쓰기')));
    }

    /* 쓰기: 빈칸 채우기 → 복사 / Claude 열기 / 여기서 돌리기 */
    async function use(p, pre = {}) {
      const auto = await P.autoValues(), keep = await db.kvGet('prompts:vals', {}), seed = await P.seeds(), names = P.vars(p.body), mine = names.filter(n => !P.AUTO.includes(n) || (n === '프로젝트' && !auto[n]));
      /* 칸에 미리 넣는 순서: 다른 화면에서 들고 온 것 → 앱 기록으로 아는 것 → 지난번에 쓴 값 */
      const vals = { ...auto }, from = {}; for (const n of mine) { vals[n] = pre[n] || seed[n] || (keep[p.id] || {})[n] || ''; if (pre[n] || seed[n]) from[n] = true; }
      let logged = {}, text = '';
      modal(p.title, close => {
        const out = h('textarea.in.ps-out', { rows: 9, 'aria-label': '완성된 프롬프트' });
        const meter = h('div.ps-fillnote');
        const refresh = () => { text = P.fill(p.body, vals); out.value = text; const left = mine.filter(n => !String(vals[n] || '').trim()).length; clear(meter).append(left ? h('span.chip.warn', `빈칸 ${left}개 남음`) : h('span.chip.ok', ic('check', 13), '다 채웠어요'), names.some(n => P.AUTO.includes(n) && auto[n]) ? h('span.chip', ic('sparkles', 13), '팀·일정은 앱이 채움') : null); };
        const fields = mine.map(n => { const long = /내용|원문|글$|^글|계획|내역|조항|공고|목록|설명|피드백|자료/.test(n); const el = h(long ? 'textarea.in' : 'input.in', { rows: long ? 4 : undefined, placeholder: n, 'aria-label': n, value: long ? undefined : vals[n], oninput: e => { vals[n] = e.target.value; refresh(); } }, long ? vals[n] : null); return h('label.ps-f', h('span', n, from[n] ? h('em.ps-auto', '앱 기록에서 채움 · 고쳐도 돼요') : null), el); });
        const log = async tool => { if (logged[tool]) return; logged[tool] = true; const kv = await db.kvGet('prompts:vals', {}); kv[p.id] = Object.fromEntries(mine.filter(n => String(vals[n] || '').length <= 200).map(n => [n, vals[n]])); await db.kvSet('prompts:vals', kv);
          const r = P.review(out.value); await db.put('promptlogs', { pid: p.id, title: p.title, cat: p.cat || P.classify(p.body), tool, len: out.value.length, sig: Object.fromEntries(r.items.map(i => [i.id, i.ok])), by: me.name || '나', at: new Date().toISOString(), team: hasTeam ? 'team-main' : '' }); };
        const result = h('div.ps-result.hide');
        const run = h('button.btn', { type: 'button', onclick: async () => {
          if (!aiOn) { const K = await import('../js/keyshare.js'); return K.guide(async () => { aiOn = await (await import('../js/ai.js')).enabled().catch(() => false); }); }
          busy(run, true, '답을 받는 중'); result.classList.remove('hide'); clear(result).append(h('p.small.muted', '앱에 연결된 AI가 답하고 있어요…'));
          try { const AI = await import('../js/ai.js'); const ans = await AI.ask(out.value, { ms: 45000, temp: 0.6 }); await log('앱 AI'); const box = h('div.ps-ans'); box.innerHTML = md(ans);
            clear(result).append(h('div.ps-h', ic('sparkles', 15), 'AI 답 (확인 전 임시)'), box, h('div.row', { style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
              h('button.btn.sm', { type: 'button', onclick: async () => toast(await copyText(ans) ? '답을 복사했어요' : '복사하지 못했어요') }, ic('copy', 14), '답 복사'),
              h('button.btn.sm', { type: 'button', onclick: async () => { const store = await import('../js/store.js'); await store.draft('note', { title: p.title, memo: ans }, { source: p.title, origin: 'prompt' }); toast('확인 대기함에 메모로 넣었어요', { label: '대기함', fn: () => { close(); location.hash = '#/inbox'; } }); } }, ic('inbox', 14), '대기함에 넣기'))); }
          catch (e) { clear(result).append(h('p.small', { style: { color: 'var(--bad)' } }, e.message || 'AI가 답하지 못했어요')); }
          busy(run, false);
        } }, ic('sparkles', 14), aiOn ? '여기서 돌리기' : '여기서 돌리기 (AI 연결)');
        refresh();
        return h('div.stack', fields.length ? h('div.ps-fields', fields) : h('p.small.muted', '채울 빈칸이 없는 프롬프트예요. 아래 글을 그대로 쓰거나 고쳐서 써요.'), meter, out,
          h('div.ps-go',
            h('button.btn.pri', { type: 'button', onclick: async () => { const ok = await copyText(out.value); if (ok) await log('Claude'); toast(ok ? '복사했어요. Claude에 붙여 넣어 주세요.' : '복사하지 못했어요. 글을 길게 눌러 복사해 주세요.'); } }, ic('copy', 14), '복사'),
            h('a.btn', { href: 'https://claude.ai/new', target: '_blank', rel: 'noopener', onclick: async () => { const ok = await copyText(out.value); if (ok) await log('Claude'); toast(ok ? '복사했어요. 열린 Claude 창에 붙여 넣어 주세요.' : 'Claude를 열었어요. 글은 직접 복사해 주세요.'); } }, ic('link', 14), '복사하고 Claude 열기'),
            run),
          result,
          h('div.modal-f',
            p.builtin ? h('button.btn.ghost', { type: 'button', onclick: () => { close(); edit({ title: p.title, body: p.body, cat: p.cat, role: p.role, tool: p.tool }); } }, ic('edit', 14), '내 것으로 고치기')
              : h('button.btn.ghost', { type: 'button', onclick: () => { close(); edit(p); } }, ic('edit', 14), '고치기'),
            h('button.btn', { type: 'button', onclick: close }, '닫기')));
      }, { wide: true });
    }

    /* 저장·고치기 */
    function edit(p = {}) {
      modal(p.id ? '프롬프트 고치기' : '프롬프트 저장', close => {
        const title = h('input.in', { placeholder: '이름 (비우면 알아서 붙여요)', 'aria-label': '이름', value: p.title || '' });
        const ta = h('textarea.in', { rows: 10, placeholder: '프롬프트. 매번 바뀌는 곳은 {{고객사}}처럼 적어 두면 쓸 때 빈칸으로 물어봐요.', 'aria-label': '프롬프트' }, p.body || '');
        const cat = h('select.in', { 'aria-label': '분야' }, [['', '알아서'], ...P.CATS.map(c => [c, c])].map(([v, l]) => h('option', { value: v, selected: (p.cat || '') === v }, l)));
        const role = h('select.in', { 'aria-label': '누가 주로 쓰나' }, Object.entries(P.ROLES).map(([v, l]) => h('option', { value: v, selected: (p.role || me.keys[0] || 'all') === v }, l)));
        const share = h('input', { type: 'checkbox', checked: p.id ? !!p.team : true });
        const hint = h('div.ps-rev');
        const rev = () => { const r = P.review(ta.value); clear(hint).append(ring(r.score / 100, { size: 40, label: String(r.score) }), h('div.grow', h('b.small', r.word), h('div.chips', { style: { marginTop: '4px' } }, r.missing.slice(0, 4).map(i => h('button.chip', { type: 'button', title: i.tip, style: { cursor: 'pointer', border: 0 }, onclick: () => { ta.value = ta.value.trimEnd() + i.add; ta.focus(); rev(); } }, ic('plus', 12), i.label))))); };
        ta.addEventListener('input', debounce(rev, 200)); rev();
        const save = async () => {
          const bodyText = ta.value.trim(); if (bodyText.length < 5) { toast('프롬프트 내용을 적어 주세요'); ta.focus(); return; }
          try { await db.put('prompts', { ...(p.id ? p : {}), title: title.value.trim() || P.titleOf(bodyText), body: bodyText, cat: cat.value || P.classify(bodyText), role: role.value, tool: p.tool || 'Claude', team: share.checked && hasTeam ? 'team-main' : '', by: p.by || me.name || '' }); close(); toast(p.id ? '고쳤어요' : '보관함에 넣었어요'); F.tab = 'lib'; draw(); }
          catch (e) { toast(e.message); }
        };
        return h('div.stack', title, ta, hint, h('div.grid.g2', h('label.ps-f', h('span', '분야'), cat), h('label.ps-f', h('span', '주로 쓰는 역할'), role)),
          h('label.ps-share', share, h('span', hasTeam ? '팀과 같이 쓰기' : '팀과 같이 쓰기 (멤버 코드로 로그인하면 팀원에게 보여요)')),
          h('div.modal-f', p.id ? h('button.btn.danger', { type: 'button', onclick: async () => { if (!await confirmBox(`"${p.title}"을 지울까요?`, '지우기')) return; try { await db.remove(p.id); close(); draw(); toast('지웠어요', { label: '되돌리기', fn: async () => { await db.put('prompts', { ...p, deleted: false }); draw(); } }); } catch (e) { toast(e.message); } } }, ic('trash', 14), '지우기') : null,
            h('button.btn.pri', { type: 'button', onclick: save }, '저장')));
      }, { wide: true });
    }
    // 다른 데서 쓴 프롬프트 붙여 넣기: 이름·분야는 알아서, 쓴 기록도 하나 남김
    function importOne() { edit({}); }

    /* 만들기: 칸을 채우면 조립 + 점검 */
    function maker() {
      const v = { role: '', goal: seed ? `${seed}: ` : '', context: '', material: '', format: '', tone: '', limit: '', ask: true }; const seeded = seed; seed = '';
      const out = h('textarea.in.ps-out', { rows: 10, 'aria-label': '조립된 프롬프트', placeholder: '위 칸을 채우면 여기에 프롬프트가 만들어져요. 직접 고쳐도 돼요.' });
      const revBox = h('div.ps-rev'); let touched = false;
      const rev = () => { const r = P.review(out.value); clear(revBox).append(ring(r.score / 100, { size: 44, label: String(r.score) }), h('div.grow', h('b', r.word), r.missing.length ? h('div.small.muted', '빠진 것: ' + r.missing.map(i => i.label).join(', ')) : h('div.small.muted', '여섯 가지가 다 들어 있어요.'))); };
      const build = () => { if (!touched) out.value = P.compose(v); rev(); };
      const f = (k, label, ph, long) => h('label.ps-f', h('span', label), h(long ? 'textarea.in' : 'input.in', { rows: long ? 3 : undefined, placeholder: ph, 'aria-label': label, value: long ? undefined : (v[k] || undefined), oninput: e => { v[k] = e.target.value; touched = false; build(); } }));
      const roleHint = me.keys.includes('art') && !me.keys.includes('pm') ? '브랜드 경험이 많은 아트디렉터' : me.keys.includes('biz') && !me.keys.includes('pm') ? '작은 회사의 꼼꼼한 경영 담당' : me.keys.includes('make') && !me.keys.includes('pm') ? '촬영과 편집을 오래 한 콘텐츠 프로듀서' : '콘텐츠 기획사의 경험 많은 PM';
      const askBox = h('input', { type: 'checkbox', checked: true, onchange: e => { v.ask = e.target.checked; touched = false; build(); } });
      out.addEventListener('input', () => { touched = true; rev(); });
      const paste = h('button.btn.sm.ghost', { type: 'button', onclick: () => importOne() }, ic('copy', 14), '쓰던 프롬프트 붙여 넣기');
      const polish = h('button.btn', { type: 'button', onclick: async () => {
        if (out.value.trim().length < 10) return toast('먼저 칸을 채워 프롬프트를 만들어 주세요');
        if (!aiOn) { const K = await import('../js/keyshare.js'); return K.guide(async () => { aiOn = await (await import('../js/ai.js')).enabled().catch(() => false); }); }
        busy(polish, true, '다듬는 중');
        try { const AI = await import('../js/ai.js'); const before = out.value;
          const ans = await AI.ask(`아래는 사람이 AI에게 일을 시키려고 쓴 프롬프트야. 뜻과 말투는 그대로 두고, 더 잘 통하게 다듬어 줘. 빠진 것(할 일, 배경, 받을 모양, 지킬 것)이 있으면 [대괄호 빈칸]으로 자리를 만들어 둬. 설명 없이 다듬은 프롬프트만 써.\n\n"""\n${before}\n"""`, { ms: 30000, temp: 0.4 });
          const clean = String(ans || '').replace(/^```\w*\s*|\s*```$/g, '').replace(/^"""\s*|\s*"""$/g, '').trim();
          if (clean) { out.value = clean; touched = true; rev(); toast('AI가 다듬었어요. 확인하고 고쳐 주세요.', { label: '되돌리기', fn: () => { out.value = before; rev(); } }); } }
        catch (e) { toast(e.message || 'AI가 답하지 못했어요'); }
        busy(polish, false);
      } }, ic('sparkles', 14), 'AI로 다듬기');
      if (seeded) build(); else rev();
      return h('div.card.ps-make',
        h('div.row.between', { style: { gap: '8px', flexWrap: 'wrap', marginBottom: '6px' } }, h('b', '칸을 채우면 프롬프트가 돼요'), paste),
        h('div.ps-fields', f('role', 'AI의 역할', roleHint), f('goal', '해 줄 일', '예: 팝업 제안서 목차를 잡아 줘'), f('context', '상황', '누구에게, 왜, 지금 어떤 상태인지', true), f('material', '자료 (있으면)', '바탕이 될 글을 붙여 넣어요', true), f('format', '받을 모양', '예: 표로, 다섯 개, 300자 안쪽'), f('tone', '말투·받는 사람', '예: 고객에게 보낼 정중한 말투'), f('limit', '지킬 것', '예: 뻔한 표현 빼고, 추측하지 말 것')),
        h('label.ps-share', askBox, h('span', '모자란 정보는 먼저 물어보게 하기')),
        revBox, out,
        h('div.ps-go',
          h('button.btn.pri', { type: 'button', onclick: async () => { if (out.value.trim().length < 5) return toast('먼저 칸을 채워 주세요'); edit({ body: out.value.trim() }); } }, ic('book', 14), '보관함에 저장'),
          h('button.btn', { type: 'button', onclick: async () => { if (!out.value.trim()) return toast('먼저 칸을 채워 주세요'); const ok = await copyText(out.value); if (ok) { const r = P.review(out.value); await db.put('promptlogs', { pid: 'made', title: P.titleOf(out.value), cat: P.classify(out.value), tool: 'Claude', len: out.value.length, sig: Object.fromEntries(r.items.map(i => [i.id, i.ok])), by: me.name || '나', at: new Date().toISOString(), team: hasTeam ? 'team-main' : '' }); } toast(ok ? '복사했어요. Claude에 붙여 넣어 주세요.' : '복사하지 못했어요'); } }, ic('copy', 14), '복사'),
          polish));
    }

    /* 작업 방식 */
    async function styleView(logs, prompts) {
      const roster = await db.kvGet('sync:roster', []); const names = [...new Set([me.name, ...roster.map(r => r.name)].filter(Boolean))];
      const rows = P.style(logs, prompts, names); const roleOf = n => (roster.find(r => r.name === n) || {}).role || (P.samePerson(n, me.name) ? me.role : '');
      const wrap = h('div');
      if (!logs.length) wrap.append(h('div.card.ps-first', ic('trend', 22), h('div.grow', h('b', '쓰는 만큼 서로의 방식이 보여요'), h('p.small.muted', '스튜디오에서 프롬프트를 복사하거나 돌리면 누가 어떤 일에 어떻게 시키는지 쌓여요. Claude 안에서 나눈 대화는 앱이 볼 수 없으니, 잘 통한 말은 "붙여 넣기"로 모아 주세요.'))));
      if (logs.length >= 3) { const tipBox = h('div.ps-tips.hide');
        const tipBtn = h('button.btn.sm', { type: 'button', onclick: async () => {
          if (!aiOn) { const K = await import('../js/keyshare.js'); return K.guide(async () => { aiOn = await (await import('../js/ai.js')).enabled().catch(() => false); }); }
          busy(tipBtn, true, '읽는 중');
          try { const AI = await import('../js/ai.js'); const brief = rows.filter(r => r.uses).map(r => `${r.name}(${roleOf(r.name) || '역할 없음'}): ${r.uses}번, 분야 ${r.cats.map(c => c.join(' ')).join(', ')}, 평균 ${r.avg}자, 버릇 ${r.habits.join(', ') || '아직 없음'}, 자주 쓰는 것 ${r.top.map(t => t[0]).join(', ')}`).join('\n');
            const ans = await AI.ask(`작은 콘텐츠 기획 팀의 팀원들이 AI에게 일을 시킨 기록 요약이야. 이걸 보고 서로 배울 점을 알려 줘.\n\n${brief}\n\n- 사람마다 잘하고 있는 점 한 줄, 해 보면 좋을 점 한 줄\n- 마지막에 팀이 같이 쓰면 좋을 프롬프트 주제 두 개\n- 기록에 없는 것은 지어내지 마. 쉬운 한국어 해요체로, 전체 열 줄 안쪽.`, { ms: 30000, temp: 0.5 });
            tipBox.classList.remove('hide'); const box = h('div.ps-ans'); box.innerHTML = md(ans); clear(tipBox).append(h('div.ps-h', ic('sparkles', 15), 'AI가 본 서로 배울 점 (참고용)'), box); }
          catch (e) { toast(e.message || 'AI가 답하지 못했어요'); }
          busy(tipBtn, false);
        } }, ic('sparkles', 14), aiOn ? 'AI로 서로 배울 점 보기' : 'AI로 서로 배울 점 보기 (AI 연결)');
        wrap.append(h('div', { style: { marginBottom: '12px' } }, tipBtn), tipBox); }
      wrap.append(h('div.ps-people', rows.map(r => {
        const max = Math.max(1, ...r.cats.map(c => c[1]));
        return h('div.card.ps-person',
          h('div.row.nowrap', { style: { gap: '10px' } }, h('span.avatar', { style: { background: colorFor(r.name) } }, r.name[0]), h('div.grow', h('b', r.name + (P.samePerson(r.name, me.name) ? ' (나)' : '')), h('div.faint.tiny', roleOf(r.name) || '역할 없음')), r.last ? h('span.faint.tiny', rel(r.last)) : null),
          h('div.ps-nums', h('div', h('b', r.uses), h('small', '쓴 횟수')), h('div', h('b', r.week), h('small', '이번 주')), h('div', h('b', r.made), h('small', '만든 것')), h('div', h('b', r.avg || '-'), h('small', '평균 글자'))),
          r.cats.length ? h('div.ps-bars', r.cats.map(([c, n]) => h('div.ps-barrow', h('span', c), h('i', h('em', { style: { width: Math.round(n / max * 100) + '%' } })), h('b', n)))) : h('p.small.faint', '아직 쓴 기록이 없어요.'),
          r.habits.length ? h('div.chips', { style: { marginTop: '8px' } }, r.habits.map(x => h('span.chip', x))) : r.uses && r.uses < 3 ? h('p.tiny.faint', '세 번 넘게 쓰면 시키는 버릇이 보여요.') : null,
          r.top.length ? h('div.ps-top3', h('small', '자주 쓰는 것'), r.top.map(([t, n]) => h('div.row.between.nowrap', h('span.small', t), h('span.faint.tiny', `${n}번`)))) : null);
      })));
      return wrap;
    }

    /* 우리 팀 소개: 한 번 적어 두면 {{팀 소개}} 빈칸에 알아서 들어감 */
    async function about() {
      const cur = await db.kvGet('prompts:about', '');
      modal('우리 팀 소개', close => {
        const ta = h('textarea.in', { rows: 6, 'aria-label': '우리 팀 소개', placeholder: '예: 친구 셋이 하는 작은 콘텐츠 기획사. 브랜드 팝업과 SNS 콘텐츠를 기획·디자인한다. 미감과 디테일을 챙기는 귀여운 회사. 말투는 담백하고 친근하게.' }, cur);
        return h('div.stack', h('p.small.muted', '한 번 적어 두면, 프롬프트의 "우리 팀" 줄에 알아서 들어가요. AI가 우리를 알고 답하게 돼요.'), ta,
          h('div.modal-f', h('button.btn.pri', { type: 'button', onclick: async () => { await db.kvSet('prompts:about', ta.value.trim()); close(); toast('저장했어요. 이제 프롬프트에 같이 들어가요.'); } }, '저장')));
      });
    }
  },
};
