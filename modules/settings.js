import { h, ic, clear, toast, head, seg, modal, form, confirmBox, download, pickFile, busy } from '../js/ui.js';
import * as db from '../js/db.js';
import * as brain from '../js/brain.js';
import * as store from '../js/store.js';
import { VERSION } from '../js/version.js';
import { applyTheme, go } from '../js/app.js';

export default {
  async render(root, params) {
    const name = await db.kvGet('name', '하진');
    const theme = await db.kvGet('theme', 'auto');
    const accent = await db.kvGet('accent', '#4b5bff');
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    root.append(head('설정', `하진 비서 v${VERSION}`));

    const nameIn = h('input.in', { value: name, onchange: async () => { await db.kvSet('name', nameIn.value.trim() || '하진'); toast('저장했어요'); } });
    const goalIn = h('input.in', { type: 'number', value: Math.round((await db.kvGet('focusGoal', 240)) / 60), onchange: async () => db.kvSet('focusGoal', (+goalIn.value || 4) * 60) });
    const accIn = h('input', { type: 'color', value: accent, oninput: async () => { await db.kvSet('accent', accIn.value); applyTheme(); } });
    const sec = (title, iconName, ...kids) => h('div.card', { style: { marginBottom: '14px' }, id: 'sec-' + iconName }, h('div.card-h', h('h3', ic(iconName), title)), ...kids);

    root.append(
      sec('나', 'user', h('div.grid.g2', h('label.f', '부를 이름', nameIn))),
      sec('화면 · 색 조합', 'palette',
        h('div.row', { style: { marginBottom: '12px' } }, seg([['auto', '시스템 따라'], ['light', '밝게'], ['dark', '어둡게']], theme, async v => { await db.kvSet('theme', v); await applyTheme(v); go('settings'); })),
        await palettePicker()),
      await labelSection(),
      sec('알림', 'bell', h('p.small.muted', '일정 10분 전(일정마다 바꿀 수 있어요)을 알려요. 폰에서는 홈 화면에 설치한 뒤 켜 주세요.'),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: async () => { const r = await Notification?.requestPermission?.(); toast(r === 'granted' ? '알림을 켰어요' : '알림이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.'); } }, '알림 켜기'), h('span.chip', 'Notification' in window ? (Notification.permission === 'granted' ? '켜짐' : '꺼짐') : '지원 안 함'))),
      await syncSection(params[0] === 'sync'),
      await extSection(params[0] === 'ext'),
      await learnedSection(),
      sec('장소 찾기', 'pin', h('p.small.muted', '일정에 장소를 말하면 실제 주소를 찾아 붙여요. 키 없이도 큰 장소는 찾고, 카카오 무료 키를 넣으면 가게·전시장까지 찾아요. 키는 이 기기에만 저장돼요.'),
        (() => { const i = h('input.in', { type: 'password', placeholder: '카카오 REST API 키 (선택)', autocomplete: 'off', 'aria-label': '카카오 REST API 키' }); db.kvGet('secret:kakao', '').then(v => (i.value = v || '')); const out = h('span.faint.tiny');
          return h('div.stack', h('div.row', { style: { gap: '6px' } }, h('div.grow', i), h('button.btn.sm', { onclick: async () => { await db.kvSet('secret:kakao', i.value.trim()); out.textContent = '찾는 중…'; const PL = await import('../js/place.js'); const hit = await PL.lookup('서울시청'); out.textContent = hit ? `잘 돼요: ${hit.name} · ${hit.addr} (${hit.by})` : '찾지 못했어요. 키나 인터넷 연결을 확인해 주세요.'; } }, '저장하고 시험')), out,
            h('p.faint.tiny', '키 받는 곳: ', h('a', { href: 'https://developers.kakao.com/console/app', target: '_blank', rel: 'noopener' }, 'Kakao Developers'), ' → 앱 만들기 → 앱 키의 REST API 키 복사, 플랫폼(Web)에 이 앱 주소 등록.')); })()),
      sec('외부 AI 연결', 'sparkles', h('p.small.muted', '링크 본문 읽기와 페이지 이미지 찾기는 키 없이 돼요. 구글 Gemini 무료 키를 넣으면 쓴 말을 AI가 먼저 읽어서 날짜·사람·종류를 정리하고, 링크와 회의 요약도 자연스러워져요. 인터넷이 없거나 키가 없으면 앱 안 규칙이 대신 읽어요. 결과는 늘 확인 대기로만 들어가요.'),
        (() => { const i = h('input.in', { type: 'password', placeholder: 'Gemini API 키 (선택)', autocomplete: 'off', 'aria-label': 'Gemini API 키' }); const on = h('input', { type: 'checkbox', onchange: () => db.kvSet('ai:on', on.checked) }); const out = h('span.faint.tiny');
          import('../js/ai.js').then(async AI => { i.value = (await db.kvGet(AI.KEY, '')) || ''; on.checked = await db.kvGet('ai:on', true); });
          return h('div.stack', h('div.row', { style: { gap: '6px' } }, h('div.grow', i), h('button.btn.sm', { onclick: async () => { const AI = await import('../js/ai.js'); await db.kvSet(AI.KEY, i.value.trim()); await db.kvSet('ai:model', ''); if (!i.value.trim()) { out.textContent = '키를 지웠어요. 앱 안 규칙만 써요.'; return; } out.textContent = '시험하는 중…'; try { const a = await AI.ask('“연결됐어요”라고만 답해.'); out.textContent = `잘 돼요: ${a.slice(0, 30)} (${await db.kvGet('ai:model', '')})`; } catch (e) { out.textContent = e.message; } } }, '저장하고 시험')), out,
            h('label.row.small', { style: { gap: '8px', cursor: 'pointer' } }, on, '쓴 말을 AI가 먼저 읽기'),
            h('div.row', { style: { gap: '6px', flexWrap: 'wrap' } },
              h('button.btn.sm', { onclick: async () => (await import('../js/keyshare.js')).showQR() }, ic('phone', 14), '폰·아이패드로 키 보내기'),
              h('button.btn.sm', { onclick: async () => (await import('../js/keyshare.js')).scan(k => { i.value = k; out.textContent = '키를 받았어요. 바로 쓸 수 있어요.'; }) }, ic('camera', 14), 'QR로 키 받기')),
            h('p.faint.tiny', '키 받는 곳: ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'), ' → API 키 만들기(무료, 카드 등록 없음). 키는 이 기기에만 저장되고 팀과 공유되지 않아요. AI를 쓸 때는 그 문장이나 링크 본문이 구글로 전송되고, 무료 등급은 구글이 품질 개선에 쓸 수 있으니 민감한 내용은 피해 주세요.')); })()),
      sec('데이터', 'shield',
        h('p.small.muted', `모든 기록은 이 기기 안에만 있어요. ${est ? `사용 ${(est.usage / 1e6).toFixed(1)}MB` : ''}${persisted ? ' · 자동 삭제 방지 켜짐' : ''}`),
        h('div.row', { style: { marginTop: '8px' } },
          h('button.btn.sm', { onclick: async () => download(`hajin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll()), 'application/json') }, ic('download', 14), '백업 (기록만)'),
          h('button.btn.sm', { onclick: async e => { const btn = e.currentTarget; busy(btn, true, '묶는 중'); try { download(`hajin-backup-full-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll({ withBlobs: true })), 'application/json'); } catch (er) { toast('사진·녹음이 너무 많아 한 파일로 묶지 못했어요. “백업 (기록만)”을 써 주세요.'); } finally { busy(btn, false); } } }, ic('download', 14), '백업 (사진·녹음 포함)'),
          h('button.btn.sm', { onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { await db.importAll(JSON.parse(await f.text())); toast('복원했어요'); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message); } } }, ic('upload', 14), '복원'),
          h('button.btn.sm.ghost.danger', { onclick: async () => { if (!(await confirmBox('모든 기록을 지울까요? 되돌릴 수 없어요. 먼저 백업을 권해요.', '모두 지우기'))) return; indexedDB.deleteDatabase('hajin-assistant'); toast('지웠어요'); setTimeout(() => location.reload(), 600); } }, '모두 지우기')),
        h('p.faint.tiny', { style: { marginTop: '8px' } }, '동기화를 켜면 폰과 PC가 자동으로 맞춰져요. 백업 파일은 만약을 위한 사본이에요.')),
      sec('업데이트', 'refresh', h('p.small.muted', '새 버전이 올라오면 앱이 스스로 받아 두고 "업데이트" 알림을 띄워요. 기록은 그대로 남아요.'),
        h('div.row', { style: { marginTop: '8px' } }, h('span.chip', `현재 v${VERSION}`), h('button.btn.sm', { onclick: async () => { const r = await navigator.serviceWorker?.getRegistration(); if (!r) { toast('오프라인 모드가 아직 준비 안 됐어요'); return; } await r.update(); toast(r.waiting || r.installing ? '새 버전을 받는 중이에요' : '최신 버전이에요'); } }, '지금 확인'))),
      sec('폰에 설치', 'phone', h('div.list',
        h('div.li', h('b.small', { style: { width: '70px' } }, '아이폰'), h('span.small', 'Safari로 열기 → 공유 버튼 → "홈 화면에 추가"')),
        h('div.li', h('b.small', { style: { width: '70px' } }, '안드로이드'), h('span.small', 'Chrome으로 열기 → 메뉴 ⋮ → "앱 설치" 또는 "홈 화면에 추가"')),
        h('div.li', h('b.small', { style: { width: '70px' } }, 'PC'), h('span.small', 'Chrome·Edge 주소창 오른쪽 설치 아이콘')))),
    );
    if (params[0] === 'sync') setTimeout(() => document.getElementById('sec-sync')?.scrollIntoView({ behavior: 'smooth' }), 100);
    if (params[0] === 'ext') setTimeout(() => document.getElementById('sec-cloud')?.scrollIntoView({ behavior: 'smooth' }), 100);
  },
};

async function extSection(focus) {
  const ext = await import('../js/ext.js');
  const box = h('div.card', { style: { marginBottom: '14px', outline: focus ? '2px solid var(--acc)' : '' }, id: 'sec-cloud' });
  async function draw() {
    clear(box);
    box.append(h('div.card-h', h('h3', ic('cloud'), '확장 두뇌 (기기 안 모델)'), h('span.chip', ext.hasWebGPU() ? 'WebGPU 가속 가능' : 'CPU로 동작')),
      h('p.small.muted', '기본 두뇌는 늘 켜져 있어요. 확장 두뇌는 한 번 내려받으면 인터넷 없이 기기 안에서만 돌아요. 키·비용·만료가 없어요. 와이파이에서 받으세요.'));
    for (const kind of ['stt', 'llm']) {
      const cur = await db.kvGet('ext:' + kind, null);
      const title = kind === 'stt' ? '음성인식 (녹음·영상 받아쓰기, 자동 자막)' : '문장 다듬기 언어모델 (실험)';
      const sel = h('select.in', { style: { width: 'auto' } }, ext.MODELS[kind].map(m => h('option', { value: m.id, selected: m.id === cur }, `${m.label} · ${m.note}`)));
      const bar = h('div.bar.hide', { style: { marginTop: '6px' } }, h('i', { style: { width: '0%' } }));
      const lbl = h('span.faint.tiny');
      const btn = h('button.btn.sm' + (cur ? '' : '.pri'), cur ? '다시 받기' : '내려받기');
      btn.onclick = async () => {
        busy(btn, true, '받는 중'); bar.classList.remove('hide');
        try { await ext.load(kind, sel.value, (p, t) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; lbl.textContent = t; }); toast('준비됐어요'); draw(); }
        catch (e) { toast('받기 실패: ' + e.message); store.logError(e, 'ext:' + kind); busy(btn, false); }
      };
      box.append(h('div', { style: { padding: '10px 0', borderTop: '1px solid var(--line)' } },
        h('div.row.between', h('div', h('div.small', { style: { fontWeight: 650 } }, title), h('div.faint.tiny', cur ? `준비됨 · ${cur.split('/')[1]}` : '아직 없음')), h('div.row', sel, btn, cur ? h('button.btn.sm.ghost', { onclick: async () => { await ext.remove(kind); draw(); } }, '지우기') : null)), bar, lbl));
    }
  }
  await draw();
  return box;
}

async function learnedSection() {
  const L = brain.getLearned();
  const box = h('div.card', { style: { marginBottom: '14px' } });
  const kindLabel = k => store.KINDS[k]?.label || k;
  const rows = [
    ...Object.entries(L.cat || {}).map(([k, v]) => ({ t: `"${k}" → 지출 분류 ${v}`, del: () => delete L.cat[k] })),
    ...Object.entries(L.kind || {}).map(([k, v]) => ({ t: `"${k}" 들어가면 → ${kindLabel(v)}`, del: () => delete L.kind[k] })),
    ...(L.people || []).map((p, i) => ({ t: `사람 이름: ${p}`, del: () => L.people.splice(L.people.indexOf(p), 1) })),
  ];
  box.append(h('div.card-h', h('h3', ic('sparkles'), '비서가 배운 것'), h('span.chip', rows.length)),
    h('p.small.muted', '확인 대기함에서 고치거나 종류를 바꾸면 여기에 규칙으로 쌓여서 다음부터 반영돼요. 틀린 규칙은 지우면 돼요.'),
    rows.length ? h('div.list', { style: { marginTop: '6px' } }, rows.map(r => h('div.li', h('div.small.grow', r.t), h('button.btn.sm.ghost', { 'aria-label': '지우기', onclick: async e => { r.del(); brain.setLearned(L); await store.saveLearned(); e.target.closest('.li').remove(); } }, ic('x', 13))))) : h('p.faint.small', { style: { marginTop: '6px' } }, '아직 배운 게 없어요'),
    h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: () => modal('규칙 직접 추가', close => form([{ k: 'word', label: '이 말이 들어가면' }, { k: 'kind', label: '이걸로', type: 'select', options: Object.entries(store.KINDS).filter(([, v]) => v.col).map(([k, v]) => [k, v.label]) }], {}, async v => { if (!v.word) return; L.kind[v.word] = v.kind; brain.setLearned(L); await store.saveLearned(); close(); go('settings'); })) }, ic('plus', 14), '규칙 추가')));
  return box;
}

// ── 폰·PC 동기화 (Supabase) ──
let syncOff = null;
async function copySql(done) {
  try { const sql = await (await fetch('supabase/setup.sql')).text(); await navigator.clipboard.writeText(sql); toast(done); }
  catch { toast('복사하지 못했어요. 파일을 새 창으로 열게요'); try { window.open('supabase/setup.sql', '_blank', 'noopener'); } catch { } }
}
async function syncSection(focus) {
  const sync = await import('../js/sync.js');
  const box = h('div.card', { style: { marginBottom: '14px', outline: focus ? '2px solid var(--acc)' : '' }, id: 'sec-sync' });
  const LABEL = { off: ['꺼짐', ''], signedout: ['로그인 필요', 'warn'], idle: ['켜짐', 'ok'], syncing: ['맞추는 중', 'acc'], error: ['문제 있음', 'bad'], offline: ['오프라인', 'warn'] };
  let off = null;
  async function draw() {
    clear(box);
    const st = sync.getState();
    const cfg = await sync.config();
    const [lab, tone] = LABEL[st.status] || ['', ''];
    box.append(h('div.card-h', h('h3', ic('refresh'), '폰·PC 동기화'), h('span.chip' + (tone ? '.' + tone : ''), lab)),
      h('p.small.muted', '내 기록은 나만 볼 수 있게 내 Supabase에 사본으로 올라가고, 폰과 PC가 자동으로 맞춰져요. 인터넷이 없어도 기기에서 그대로 쓰고, 연결되면 알아서 맞춰요. 사진·녹음·영상 원본은 기기에만 남아요.'));
    if (!cfg.url || !cfg.key || focus === 'cfg') {
      const u = h('input.in', { placeholder: 'https://xxxx.supabase.co', value: cfg.url });
      const k = h('input.in', { placeholder: 'sb_publishable_… (공개 키)', value: cfg.key });
      box.append(h('div.grid.g2', { style: { marginTop: '10px' } }, h('label.f', 'Project URL', u), h('label.f', 'Publishable 키', k)),
        h('p.faint.tiny', { style: { marginTop: '6px' } }, 'secret 키는 절대 넣지 마세요. 공개 키만으로 충분해요.'),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm.pri', { onclick: async () => { if (!/^https:\/\/.+/.test(u.value.trim()) || !k.value.trim()) { toast('주소와 키를 확인해 주세요'); return; } if (/secret|service_role/i.test(k.value)) { toast('secret 키는 넣으면 안 돼요. publishable 키를 넣어 주세요'); return; } focus = false; await sync.setConfig(u.value, k.value); draw(); } }, '연결'),
          h('button.btn.sm', { onclick: () => copySql('서버 설정 SQL을 복사했어요. Supabase SQL Editor에 붙여넣고 Run 하세요') }, ic('copy', 14), '서버 설정 SQL 복사')));
      return;
    }
    const me = sync.user();
    if (!me) {
      const codeIn = h('input.in', { placeholder: '멤버 코드 (예: AB3CD)', maxlength: 5, autocapitalize: 'characters', autocomplete: 'one-time-code', style: { textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 700, maxWidth: '220px' } });
      const go1 = async btn => { busy(btn, true, '들어가는 중'); try { const m = await sync.loginWithCode(codeIn.value); toast(`${m.name} 님, 반가워요. 맞추는 중이에요`); } catch (e) { toast(e.message); } busy(btn, false); draw(); };
      codeIn.addEventListener('keydown', e => e.key === 'Enter' && !e.isComposing && go1(e.target.nextSibling));
      box.append(h('div.row', { style: { marginTop: '10px' } }, codeIn, h('button.btn.sm.pri', { onclick: e => go1(e.currentTarget) }, '로그인'), h('button.btn.sm.ghost', { onclick: () => { focus = 'cfg'; draw(); } }, '서버 바꾸기')),
        h('p.faint.tiny', { style: { marginTop: '6px' } }, '관리자(하진)가 준 5자리 코드로 들어와요. 폰과 PC에서 같은 코드를 쓰면 기록이 맞춰져요.'));
      return;
    }
    const mm = await sync.me();
    box.append(h('div.tiles', { style: { margin: '10px 0' } },
      h('div.tile', h('div.tn', { style: { fontSize: '16px' } }, mm ? `${mm.name}${mm.is_admin ? ' · 관리자' : ''}` : '로그인됨'), h('div.tl', '멤버')),
      h('div.tile', h('div.tn', st.last ? new Date(st.last).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '–'), h('div.tl', '마지막으로 맞춘 시각')),
      h('div.tile', h('div.tn', String(st.pushed || 0)), h('div.tl', '방금 올린 것')),
      h('div.tile', h('div.tn', String(st.pulled || 0)), h('div.tl', '방금 받은 것'))),
      st.error ? h('p.small', { style: { color: 'var(--bad)' } }, st.error) : null,
      h('div.row', h('button.btn.sm.pri', { onclick: async e => { const btn = e.currentTarget; busy(btn, true, '맞추는 중'); await sync.syncNow(); busy(btn, false); draw(); } }, ic('refresh', 14), '지금 맞추기'),
        h('button.btn.sm', { onclick: () => copySql('서버 설정 SQL을 복사했어요') }, ic('copy', 14), '서버 설정 SQL'),
        h('button.btn.sm.ghost', { onclick: async () => { if (await confirmBox('이 기기에서 로그아웃할까요? 기록은 기기에 그대로 남아요.', '로그아웃')) { await sync.signOut(); draw(); } } }, '로그아웃')));
  }
  syncOff?.(); /* 예전 화면의 구독은 끊음 */
  off = syncOff = sync.onState(() => { if (!document.body.contains(box)) { off?.(); return; } draw(); });
  await draw();
  return box;
}

// ── 색 조합 고르기 ──
async function palettePicker() {
  const T = await import('../js/theme.js');
  const cur = await T.current();
  const dark = T.isDark(await db.kvGet('theme', 'auto'));
  const pick = async id => { await db.kvSet('palette', id); await db.kvSet('accent', null); await applyTheme(); go('settings'); };
  const sw = (id, p) => { const [bg, card, ink, acc] = dark ? p.dark : p.light; return h('button.palb' + (cur.id === id ? '.on' : ''), { onclick: () => pick(id), 'aria-pressed': cur.id === id }, h('div.pv', { style: { background: bg } }, h('i', { style: { background: card } }), h('i', { style: { background: ink, opacity: .85 } }), h('i', { style: { background: acc } })), h('b', p.name), h('span', p.note)); };
  const tint = h('input', { type: 'color', value: cur.tint, oninput: async () => { await db.kvSet('palTint', tint.value); await db.kvSet('palette', 'custom'); await db.kvSet('accent', null); applyTheme(); } });
  const acc = h('input', { type: 'color', value: cur.cacc, oninput: async () => { await db.kvSet('palAcc', acc.value); await db.kvSet('palette', 'custom'); await db.kvSet('accent', null); applyTheme(); } });
  return h('div',
    h('div.pals', Object.entries(T.PALETTES).map(([id, p]) => sw(id, p)), sw('custom', T.customPalette(cur.tint, cur.cacc))),
    h('div.row', { style: { marginTop: '12px', gap: '14px', flexWrap: 'wrap' } }, h('span.small', { style: { fontWeight: 650 } }, '내 조합 만들기'), h('label.row.small', '배경 톤', tint), h('label.row.small', '포인트', acc), h('span.faint.tiny', '고르면 밝게·어둡게 둘 다 자동으로 맞춰요. 글자가 안 보일 조합은 알아서 보정해요.')));
}

// 중요도·분류 색: 일정·회의에 붙이는 라벨 (팀 공유, 관리자가 관리)
async function labelSection() {
  const LB = await import('../js/labels.js');
  const admin = await (await import('../js/admin.js')).isAdmin();
  let list = (await LB.load()).map(l => ({ ...l }));
  const box = h('div.card', { style: { marginBottom: '14px' }, id: 'sec-labels' });
  const save = async () => { try { await LB.save(list.filter(l => l.name.trim())); } catch (e) { toast(e.message); } };
  const draw = () => {
    clear(box);
    box.append(h('div.card-h', h('h3', ic('palette'), '중요도 · 분류 색'), admin ? h('div.row', h('button.btn.sm', { onclick: async () => { list.push({ id: 'l' + Date.now().toString(36), name: '새 라벨', color: '#14a3c7' }); await save(); draw(); } }, ic('plus', 14), '추가')) : null),
      h('p.small.muted', { style: { marginBottom: '8px' } }, admin ? '일정과 회의에 붙이는 색이에요. 이름과 색을 바꾸면 팀 전체에 같은 뜻으로 적용돼요.' : '일정과 회의에 붙이는 색이에요. 바꾸는 건 관리자만 할 수 있어요.'),
      ...list.map((l, i) => h('div.li', h('input', { type: 'color', value: l.color, disabled: !admin, onchange: async e => { l.color = e.target.value; await save(); } }),
        h('input.in.grow', { value: l.name, disabled: !admin, 'aria-label': '라벨 이름', onchange: async e => { l.name = e.target.value.trim(); await save(); } }),
        admin ? h('button.btn.sm.icon', { 'aria-label': '위로', disabled: i === 0, onclick: async () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; await save(); draw(); } }, ic('up', 14)) : null,
        admin ? h('button.btn.sm.icon', { 'aria-label': '지우기', onclick: async () => { list.splice(i, 1); await save(); draw(); } }, ic('trash', 14)) : null)));
  };
  draw();
  return box;
}
