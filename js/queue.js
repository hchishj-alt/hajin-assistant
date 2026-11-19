// 대기열: 링크 불러오기·이미지 올리기처럼 오래 걸리는 일을 뒤에서 하나씩 처리. 그동안 다른 화면을 써도 되고, 끝나면 알려 줌
import { h, ic, toast } from './ui.js';

const jobs = []; let running = false, done = 0, failed = 0, total = 0, el = null, open = false;

function paint() {
  if (!el) { el = h('div#jobq'); document.body.append(el); }
  const left = jobs.length + (running ? 1 : 0);
  if (!left) { el.classList.remove('show'); return; }
  el.classList.add('show'); el.innerHTML = '';
  const cur = paint.cur;
  el.append(h('button.jq-h', { 'aria-expanded': String(open), 'aria-label': '대기열 보기', onclick: () => { open = !open; paint(); } }, h('span.spin'), h('span.grow', `${cur?.group || '처리'} ${done + 1}/${total}`), h('span.faint.tiny', left > 1 ? `${left - 1}개 대기` : '마지막'), ic('down', 12)),
    h('div.jq-bar', h('i', { style: { width: Math.round(done / Math.max(1, total) * 100) + '%' } })));
  if (open) el.append(h('div.jq-list', cur ? h('div.jq-i.on', h('span.spin'), h('span.grow', cur.label)) : null, jobs.slice(0, 6).map(j => h('div.jq-i', ic('clock', 12), h('span.grow', j.label))), jobs.length > 6 ? h('div.faint.tiny', `외 ${jobs.length - 6}개`) : null,
    jobs.length ? h('button.btn.sm.ghost', { onclick: () => { total -= jobs.length; jobs.length = 0; paint(); toast('남은 대기열을 비웠어요'); } }, '남은 것 취소') : null));
}
async function run() {
  if (running) return; running = true;
  while (jobs.length) {
    const j = jobs.shift(); paint.cur = j; paint();
    try { await j.fn(); } catch (e) { failed++; console.warn('queue', e); }
    done++; j.after && j.after();
  }
  running = false; paint.cur = null; paint();
  const last = run.group || '작업';
  toast(failed ? `${last} ${done - failed}개 끝, ${failed}개는 실패했어요` : `${last} ${done}개를 다 끝냈어요`);
  window.dispatchEvent(new CustomEvent('hajin:queue-done', { detail: { done, failed } }));
  done = failed = total = 0;
}
// group = "레퍼런스 불러오기"처럼 묶음 이름, label = 한 건의 이름, fn = 실제 일, after = 한 건 끝날 때마다(화면 다시 그리기 등)
export function add(group, label, fn, after) { jobs.push({ group, label, fn, after }); total++; run.group = group; paint(); run(); }
export const size = () => jobs.length + (running ? 1 : 0);
// 처리 중에 창을 닫으려 하면 한 번 알려 줌
window.addEventListener('beforeunload', e => { if (size()) { e.preventDefault(); e.returnValue = ''; } });
