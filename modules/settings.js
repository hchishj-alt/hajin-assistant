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
      sec('나', 'user', h('div.grid.g2', h('label.f', '부를 이름', nameIn), h('label.f', '하루 집중 목표(시간)', goalIn))),
      sec('화면', 'palette', h('div.row', seg([['auto', '시스템'], ['light', '밝게'], ['dark', '어둡게']], theme, async v => { await db.kvSet('theme', v); applyTheme(v); go('settings'); }), h('label.row.small', '포인트 색', accIn), h('button.btn.sm.ghost', { onclick: async () => { await db.kvSet('accent', null); document.documentElement.style.removeProperty('--acc'); go('settings'); } }, '기본 색'))),
      sec('알림', 'bell', h('p.small.muted', '일정 10분 전(일정마다 바꿀 수 있어요)과 집중 타이머 끝을 알려요. 폰에서는 홈 화면에 설치한 뒤 켜 주세요.'),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.sm', { onclick: async () => { const r = await Notification?.requestPermission?.(); toast(r === 'granted' ? '알림을 켰어요' : '알림이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.'); } }, '알림 켜기'), h('span.chip', 'Notification' in window ? (Notification.permission === 'granted' ? '켜짐' : '꺼짐') : '지원 안 함'))),
      await extSection(params[0] === 'ext'),
      await learnedSection(),
      sec('데이터', 'shield',
        h('p.small.muted', `모든 기록은 이 기기 안에만 있어요. ${est ? `사용 ${(est.usage / 1e6).toFixed(1)}MB` : ''}${persisted ? ' · 자동 삭제 방지 켜짐' : ''}`),
        h('div.row', { style: { marginTop: '8px' } },
          h('button.btn.sm', { onclick: async () => download(`hajin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll()), 'application/json') }, ic('download', 14), '백업 (기록만)'),
          h('button.btn.sm', { onclick: async e => { busy(e.currentTarget, true, '묶는 중'); download(`hajin-backup-full-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll({ withBlobs: true })), 'application/json'); busy(e.currentTarget, false); } }, ic('download', 14), '백업 (사진·녹음 포함)'),
          h('button.btn.sm', { onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { await db.importAll(JSON.parse(await f.text())); toast('복원했어요'); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message); } } }, ic('upload', 14), '복원'),
          h('button.btn.sm.ghost.danger', { onclick: async () => { if (!(await confirmBox('모든 기록을 지울까요? 되돌릴 수 없어요. 먼저 백업을 권해요.', '모두 지우기'))) return; indexedDB.deleteDatabase('hajin-assistant'); toast('지웠어요'); setTimeout(() => location.reload(), 600); } }, '모두 지우기')),
        h('p.faint.tiny', { style: { marginTop: '8px' } }, '폰과 PC를 바꿀 때는 백업 파일로 옮길 수 있어요. 자동 동기화는 다음 단계에서 켜져요.')),
      sec('업데이트', 'refresh', h('p.small.muted', '새 버전이 올라오면 앱이 스스로 받아 두고 "업데이트" 알림을 띄워요. 기록은 그대로 남아요.'),
        h('div.row', { style: { marginTop: '8px' } }, h('span.chip', `현재 v${VERSION}`), h('button.btn.sm', { onclick: async () => { const r = await navigator.serviceWorker?.getRegistration(); if (!r) { toast('오프라인 모드가 아직 준비 안 됐어요'); return; } await r.update(); toast(r.waiting || r.installing ? '새 버전을 받는 중이에요' : '최신 버전이에요'); } }, '지금 확인'))),
      sec('폰에 설치', 'phone', h('div.list',
        h('div.li', h('b.small', { style: { width: '70px' } }, '아이폰'), h('span.small', 'Safari로 열기 → 공유 버튼 → "홈 화면에 추가"')),
        h('div.li', h('b.small', { style: { width: '70px' } }, '안드로이드'), h('span.small', 'Chrome으로 열기 → 메뉴 ⋮ → "앱 설치" 또는 "홈 화면에 추가"')),
        h('div.li', h('b.small', { style: { width: '70px' } }, 'PC'), h('span.small', 'Chrome·Edge 주소창 오른쪽 설치 아이콘')))),
    );
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
