// 우리 웹사이트로 바로 가기. 메뉴에서는 누르면 곧장 새 창으로 열리고, 이 화면은 주소 복사·QR 보여 주기·(관리자) 주소 바꾸기용
import { h, ic, toast, head, modal } from '../js/ui.js';
import { WORDMARK, SITE, siteUrl, setSiteUrl } from '../js/logo.js';
import { isAdmin } from '../js/admin.js';

export default {
  async render(root) {
    const adm = await isAdmin(); const card = h('div.card.site-card');
    root.append(head('우리 웹사이트', '외주 문의를 받는 Somer Studio 사이트예요.'), card);
    await draw();
    async function draw() {
      const url = await siteUrl(); const shown = url.replace(/^https:\/\//, '').replace(/\/$/, '');
      const copy = async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요'); } catch { toast(url); } };
      const cv = h('canvas.site-qr', { 'aria-label': shown + '으로 가는 QR', role: 'img' });
      try { const qrcode = (await import('../js/vendor-qr.js')).default; const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount(), cell = 6, pad = 3, size = (n + pad * 2) * cell; cv.width = cv.height = size; const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size); cx.fillStyle = '#0E1626'; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cx.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell); } catch { cv.hidden = true; }
      card.replaceChildren(
        h('div.site-wm', { role: 'img', 'aria-label': 'Somer Studio', html: WORDMARK }),
        h('a.site-url', { href: url, target: '_blank', rel: 'noopener' }, shown),
        h('div.row', { style: { gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
          h('a.btn.pri', { href: url, target: '_blank', rel: 'noopener' }, ic('globe', 16), '사이트 열기'),
          h('button.btn', { type: 'button', onclick: copy }, ic('copy', 16), '주소 복사'),
          adm ? h('button.btn.ghost', { type: 'button', onclick: edit }, ic('edit', 16), '주소 바꾸기') : null),
        cv, h('p.small.faint', '만난 자리에서 이 QR을 보여 주면 상대 폰에서 바로 열려요.'));
    }
    function edit() {
      const inp = h('input.in', { type: 'url', placeholder: SITE, 'aria-label': '웹사이트 주소' });
      const close = modal('웹사이트 주소 바꾸기', () => h('form', { onsubmit: async e => { e.preventDefault(); let u = inp.value.trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; u = u.replace(/^http:/i, 'https:');
        if (u && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(u)) return toast('주소를 다시 확인해 주세요');
        await setSiteUrl(u); close(); toast(u ? '주소를 바꿨어요' : '처음 주소로 돌렸어요'); await draw(); (await import('../js/app.js')).buildNav(); } },
        h('p.small.muted', { style: { margin: '0 0 10px' } }, '사이트가 다른 주소로 옮겨 가면 여기서 바꿔요. 비워 두고 저장하면 처음 주소(somer-studio.com)로 돌아가요. 팀원 메뉴에도 같이 바뀌어요.'), inp,
        h('div.row', { style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button.btn.pri', { type: 'submit' }, '저장'))));
      siteUrl().then(u => { inp.value = u; });
    }
  },
};
