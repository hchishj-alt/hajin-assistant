import { h, ic, clear, toast, head, tile, ring, fmtDate, confirmBox } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import { VERSION } from '../js/version.js';

export default {
  async render(root) {
    const body = h('div');
    const runBtn = h('button.btn.sm.pri', { onclick: () => run() }, ic('refresh', 14), '다시 점검');
    root.append(head('자가 점검', '두뇌 시뮬레이션, 기기 기능, 저장소, 오류 기록을 스스로 확인해요.', runBtn), body);
    await run();

    async function run() {
      clear(body);
      body.append(h('div.faint.small', h('span.spin'), ' 점검 중…'));
      const { run: brainTests } = await import(`../js/selftest.js?t=${Date.now()}`);
      const tests = brainTests();
      const env = await envChecks();
      const errors = await db.kvGet('errors', []);
      const ds = (await db.list('drafts'));
      const decided = ds.filter(d => d.status !== 'pending');
      const edited = decided.filter(d => d.status === 'approved' && d.updatedAt !== d.approvedAt);
      const okT = tests.filter(t => t.ok).length, okE = env.filter(e => e.ok).length;
      clear(body);
      body.append(h('div.tiles', { style: { marginBottom: '14px' } },
        tile('sparkles', `${okT}/${tests.length}`, '두뇌 시뮬레이션', okT === tests.length ? 'ok' : 'warn'),
        tile('phone', `${okE}/${env.length}`, '기기 기능', okE === env.length ? 'ok' : ''),
        tile('x', errors.length, '오류 기록', errors.length ? 'bad' : 'ok'),
        tile('check', decided.length ? Math.round(decided.filter(d => d.status === 'approved').length / decided.length * 100) + '%' : '–', '실사용 정확도')));
      const groups = {}; tests.forEach(t => (groups[t.group] = groups[t.group] || []).push(t));
      body.append(h('div.grid.g2',
        h('div.card', h('div.card-h', h('h3', ic('sparkles'), '두뇌 시뮬레이션'), h('span.faint.tiny', '기준: 2026-11-19 오전 10시')),
          Object.entries(groups).map(([g, ts]) => h('div', { style: { marginBottom: '8px' } }, h('div.small', { style: { fontWeight: 700, margin: '6px 0' } }, `${g} ${ts.filter(t => t.ok).length}/${ts.length}`),
            ts.map(t => h('div.li', { style: { padding: '6px 2px', alignItems: 'flex-start' } }, h('span', { style: { color: t.ok ? 'var(--ok)' : 'var(--bad)' } }, ic(t.ok ? 'check' : 'x', 16)), h('div.grow', h('div.small', t.name), h('div.faint.tiny', t.detail))))))),
        h('div.stack',
          h('div.card', h('div.card-h', h('h3', ic('phone'), '이 기기에서 되는 것')), env.map(e => h('div.li', { style: { padding: '6px 2px' } }, h('span', { style: { color: e.ok ? 'var(--ok)' : 'var(--ink3)' } }, ic(e.ok ? 'check' : 'x', 16)), h('div.grow', h('div.small', e.name), h('div.faint.tiny', e.ok ? e.yes : e.no))))),
          h('div.card', h('div.card-h', h('h3', ic('x'), '오류 기록'), errors.length ? h('button.btn.sm.ghost', { onclick: async () => { await db.kvSet('errors', []); run(); } }, '비우기') : null),
            errors.length ? h('div.list', errors.slice(0, 20).map(e => h('div.li', { style: { alignItems: 'flex-start' } }, h('div.grow', h('div.small', e.msg), h('div.faint.tiny', `${fmtDate(e.at, { time: true })} · ${e.where}`))))) : h('div.empty', '기록된 오류가 없어요'),
            errors.length ? h('button.btn.sm', { style: { marginTop: '8px' }, onclick: async () => { try { await navigator.clipboard.writeText(JSON.stringify({ version: VERSION, ua: navigator.userAgent, errors: errors.slice(0, 20) }, null, 1)); toast('오류 보고서를 복사했어요. 개발 요청함에 붙여넣으세요.'); } catch { } } }, ic('copy', 14), '보고서 복사') : null),
          await requests())));
    }
  },
};

async function envChecks() {
  const c = document.createElement('canvas');
  const checks = [
    ['기기 저장소', !!window.indexedDB, '기록 저장 가능', '저장 불가 — 시크릿 모드인지 확인'],
    ['자동 삭제 방지', await navigator.storage?.persisted?.().catch(() => false), '브라우저가 기록을 지우지 않아요', '홈 화면에 설치하면 켜져요'],
    ['오프라인 실행', !!navigator.serviceWorker?.controller, '인터넷 없이도 열려요', '한 번 더 새로고침하면 켜져요'],
    ['실시간 받아쓰기', !!(window.SpeechRecognition || window.webkitSpeechRecognition), '말하면 바로 글자로', '녹음 후 확장 두뇌로 받아쓰기'],
    ['녹음', !!window.MediaRecorder, '회의 녹음 가능', '녹음 불가'],
    ['영상 만들기', !!(c.captureStream && window.MediaRecorder), 'SNS 스튜디오 렌더 가능', '이 브라우저는 영상 렌더가 안 돼요 (PC Chrome 권장)'],
    ['WebGPU', !!navigator.gpu, '확장 두뇌 빠르게', 'CPU로 느리게 동작'],
    ['알림', 'Notification' in window && Notification.permission === 'granted', '일정 알림 켜짐', '설정에서 알림 켜기'],
    ['클립보드', !!navigator.clipboard, '복사 가능', '복사 불가'],
  ];
  // DB 왕복 테스트
  let rt = false;
  try { const x = await db.put('_selftest', { v: 1 }); rt = (await db.get(x.id))?.v === 1; await db.putRaw({ ...x, deleted: true, dirty: false }); } catch { }
  checks.unshift(['저장·읽기 왕복', rt, '정상', '저장소 오류']);
  return checks.map(([name, ok, yes, no]) => ({ name, ok: !!ok, yes, no }));
}

// 개발 요청함 — 쓰다가 아쉬운 점을 적어 두면 다음 업데이트 때 반영 (GitHub 이슈로 보내기)
async function requests() {
  const reqs = (await db.list('requests')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inp = h('input.in', { placeholder: '이런 기능이 있으면 좋겠다 / 이게 불편하다' });
  const box = h('div.card', h('div.card-h', h('h3', ic('flag'), '개발 요청함'), h('span.chip', reqs.filter(r => !r.done).length)),
    h('p.faint.small', '여기 적어 두면 다음 업데이트 때 모아서 반영해요. GitHub에 이슈로 보낼 수도 있어요.'),
    h('div.row.nowrap', { style: { margin: '8px 0' } }, inp, h('button.btn.sm.pri', { onclick: async () => { if (!inp.value.trim()) return; await db.put('requests', { text: inp.value.trim(), done: false }); inp.value = ''; toast('적어 뒀어요'); location.hash = '#/health'; location.reload(); } }, '추가')));
  for (const r of reqs.slice(0, 15)) box.append(h('div.li', h('input', { type: 'checkbox', checked: r.done, onchange: e => db.patch(r.id, { done: e.target.checked }) }), h('div.grow.small', r.text),
    h('a.btn.sm.ghost', { href: `https://github.com/hchishj-alt/hajin-assistant/issues/new?title=${encodeURIComponent(r.text.slice(0, 60))}&body=${encodeURIComponent(r.text + '\n\nv' + VERSION)}`, target: '_blank', rel: 'noopener', title: 'GitHub 이슈로' }, ic('upload', 13))));
  return box;
}
