import { h, ic, clear, toast, head, seg, modal, form, todayStr, fmtDate, colorFor, facePic, confirmBox, download, pickFile, tile, rel } from '../js/ui.js';
import * as db from '../js/db.js';
import * as store from '../js/store.js';
import * as brain from '../js/brain.js';
import { FIELDS } from '../js/fields.js';
import { go } from '../js/app.js';

let group = '', q = '';
export default {
  async render(root, params) {
    if (params[0]) return detail(root, params[0]);
    const body = h('div');
    const search = h('input', { placeholder: '이름·소속·메모로 찾기', value: q, 'aria-label': '사람 찾기' });
    search.addEventListener('input', () => { q = search.value; draw(); });
    root.append(head('인맥 · 연락처', '사람과의 기록을 쌓고, 연락할 때를 놓치지 않게.',
      h('button.btn.sm.ghost.fold', { onclick: importVcf, title: '폰 연락처에서 내보낸 .vcf 가져오기' }, ic('upload', 14), '.vcf 가져오기'),
      h('button.btn.sm.ghost.fold', { onclick: exportVcf }, ic('download', 14), '내보내기'),
      h('button.btn.sm.pri', { onclick: () => edit() }, ic('plus', 14), '사람')),
      h('div.quick', { style: { marginBottom: '12px' } }, ic('search'), search), body);
    await draw();

    async function draw() {
      clear(body);
      const cs = (await db.list('contacts')).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      const reach = await store.peopleToReach();
      const bd = await store.upcomingBirthdays(30);
      const groups = [...new Set(cs.map(c => c.group || '기타'))];
      body.append(h('div.tiles', { style: { marginBottom: '12px' } }, tile('users', cs.length, '전체'), tile('bell', reach.length, '연락할 때', reach.length ? 'warn' : 'ok'), tile('cake', bd.length, '30일 내 생일'), tile('msg', (await db.list('interactions')).filter(i => i.date >= todayStr().slice(0, 7)).length, '이번 달 기록')));
      body.append(h('div', { style: { marginBottom: '10px', overflowX: 'auto' } }, seg([['', '전체'], ...groups.map(g => [g, g])], group, v => { group = v; draw(); })));
      let xs = cs.filter(c => !group || (c.group || '기타') === group);
      if (q.trim()) { const hit = brain.similar(q, xs.map(c => ({ id: c.id, text: `${c.name} ${c.org || ''} ${c.role || ''} ${c.memo || ''} ${(c.tags || []).join(' ')} ${c.phone || ''}` })), 50).map(x => x.id); xs = xs.filter(c => hit.includes(c.id) || (c.name || '').includes(q) || (c.phone || '').includes(q)); }
      if (reach.length && !q) body.append(h('div.card', { style: { marginBottom: '12px' } }, h('div.card-h', h('h3', ic('bell'), '연락할 때가 됐어요')), reach.slice(0, 5).map(c => row(c, `${c.overdue + c.cadence}일째 · 주기 ${c.cadence}일`))));
      const card = h('div.card');
      if (!xs.length) card.append(h('div.empty', cs.length ? '찾는 사람이 없어요' : '소머AI에게 "김민서 010-1234-5678 디자이너"라고 말해도 돼요'));
      let ch = '';
      xs.forEach(c => { const f = initial(c.name); if (f !== ch && !q) { ch = f; card.append(h('div.faint.tiny', { style: { padding: '8px 4px 2px', fontWeight: 700 } }, f)); } card.append(row(c)); });
      body.append(card);
    }
    function row(c, sub) {
      return h('div.li.click', { onclick: () => go('people/' + c.id) }, avatar(c),
        h('div.grow', h('div.t', c.name, c.role ? h('span.faint.small', ' · ' + c.role) : null), h('div.faint.tiny', sub || [c.org, c.phone, c.lastContact ? '마지막 연락 ' + rel(c.lastContact) : ''].filter(Boolean).join(' · '))),
        c.phone ? h('a.btn.sm.ghost', { href: 'tel:' + c.phone, onclick: e => e.stopPropagation(), 'aria-label': '전화' }, ic('phone', 15)) : null,
        c.phone ? h('a.btn.sm.ghost', { href: 'sms:' + c.phone, onclick: e => e.stopPropagation(), 'aria-label': '문자' }, ic('msg', 15)) : null);
    }
    function edit(c = {}) { modal(c.id ? '연락처 고치기' : '새 연락처', close => form(FIELDS.contact, c, async v => { const s = await db.put('contacts', { ...c, ...v }); close(); go('people/' + s.id); })); }
    async function exportVcf() {
      const cs = await db.list('contacts');
      download('hajin-contacts.vcf', cs.map(c => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `N:${c.name};;;;`, c.phone && `TEL;TYPE=CELL:${c.phone}`, c.email && `EMAIL:${c.email}`, c.org && `ORG:${c.org}`, c.role && `TITLE:${c.role}`, c.birthday && `BDAY:${c.birthday}`, c.memo && `NOTE:${c.memo.replace(/\n/g, '\\n')}`, 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n'), 'text/vcard');
    }
    async function importVcf() {
      const f = await pickFile('.vcf,text/vcard'); if (!f) return;
      const txt = (await f.text()).replace(/\r?\n[ \t]/g, '');
      const existing = await db.list('contacts');
      let n = 0, skip = 0;
      for (const card of txt.split(/BEGIN:VCARD/i).slice(1)) {
        const g = k => (card.match(new RegExp('^' + k + '(?:;[^:]*)?:(.*)$', 'mi')) || [])[1]?.trim();
        const qp = s => s && /=[0-9A-F]{2}/.test(s) ? decodeURIComponent(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, '%$1')) : s;
        let name = qp(g('FN')) || (qp(g('N')) || '').split(';').filter(Boolean).reverse().join('');
        const phone = brain.parsePhone(g('TEL') || '') || g('TEL') || '';
        if (!name) continue;
        if (existing.some(c => c.name === name && (c.phone || '') === phone)) { skip++; continue; }
        const b = g('BDAY');
        await db.put('contacts', { name, phone, email: g('EMAIL') || '', org: (qp(g('ORG')) || '').replace(/;/g, ' ').trim(), role: qp(g('TITLE')) || '', birthday: b && /^\d{4}-?\d{2}-?\d{2}/.test(b) ? b.replace(/^(\d{4})-?(\d{2})-?(\d{2}).*/, '$1-$2-$3') : '', memo: (qp(g('NOTE')) || '').replace(/\\n/g, '\n'), group: '기타', cadence: 0 });
        n++;
      }
      toast(`${n}명 가져왔어요${skip ? ` (중복 ${skip}명 건너뜀)` : ''}`); draw();
    }
  },
};
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initial(n = '') { n = String(n || ''); const c = n.charCodeAt(0); if (c >= 0xac00 && c <= 0xd7a3) return CHO[Math.floor((c - 0xac00) / 588)].replace('ㄲ', 'ㄱ').replace('ㄸ', 'ㄷ').replace('ㅃ', 'ㅂ').replace('ㅆ', 'ㅅ').replace('ㅉ', 'ㅈ'); return (n[0] || '#').toUpperCase(); }
export const avatar = (c, size = 36) => facePic(c.name, h('div.avatar', { style: { background: colorFor(c.name || ''), width: size + 'px', height: size + 'px' } }, (c.name || '?').slice(c.name?.length > 2 ? 1 : 0, c.name?.length > 2 ? 3 : 2)));

async function detail(root, id) {
  const c = await db.get(id);
  if (!c || c.deleted) { root.append(h('div.empty', '연락처를 찾을 수 없어요')); return; }
  const inter = (await db.list('interactions')).filter(i => i.contactId === id).sort((a, b) => b.date.localeCompare(a.date));
  const meetings = (await db.list('meetings')).filter(m => (m.attendees || '').includes(c.name));
  const tasks = (await db.list('tasks')).filter(t => t.who === c.name && !t.done);
  const logBtn = kind => h('button.btn.sm', { onclick: () => log(kind) }, ic({ 통화: 'phone', 만남: 'users', 메시지: 'msg', 메일: 'mail' }[kind], 14), kind);
  const since = c.lastContact ? Math.floor((Date.now() - new Date(c.lastContact)) / 864e5) : null;
  root.append(
    h('div.row', { style: { marginBottom: '6px' } }, h('a.btn.sm.ghost', { href: '#/people' }, ic('left', 14), '인맥')),
    h('div.card', { style: { marginBottom: '14px' } }, h('div.row', avatar(c, 64), h('div.grow', h('h1', c.name), h('p.muted', [c.role, c.org, c.group].filter(Boolean).join(' · '))),
      h('div.row', c.phone ? h('a.btn', { href: 'tel:' + c.phone }, ic('phone', 16), '전화') : null, c.phone ? h('a.btn', { href: 'sms:' + c.phone }, ic('msg', 16), '문자') : null, c.email ? h('a.btn', { href: 'mailto:' + c.email }, ic('mail', 16)) : null,
        h('button.btn', { onclick: () => modal('연락처 고치기', close => form(FIELDS.contact, c, async v => { await db.put('contacts', { ...c, ...v }); close(); go('people/' + id); })) }, ic('edit', 16)),
        h('button.btn.danger', { onclick: async () => { if (await confirmBox(`${c.name}님을 지울까요?`, '지우기')) { await db.remove(id); go('people'); } } }, ic('trash', 16))))),
    h('div.tiles', { style: { marginBottom: '14px' } }, tile('clock', since == null ? '–' : since + '일', '마지막 연락 후', c.cadence && since > c.cadence ? 'warn' : ''), tile('msg', inter.length, '기록'), tile('mic', meetings.length, '함께한 회의'), tile('check2', tasks.length, '맡긴 일')),
    h('div.grid.g2',
      h('div.card', h('div.card-h', h('h3', ic('file'), '정보')), h('div.list',
        [['전화', c.phone], ['이메일', c.email], ['생일', c.birthday && fmtDate(c.birthday)], ['연락 주기', c.cadence ? c.cadence + '일마다' : '없음'], ['SNS', c.sns], ['메모', c.memo]].filter(x => x[1]).map(([k, v]) => h('div.li', h('div.faint.small', { style: { width: '70px' } }, k), h('div.grow.small.prose', /^https?:/.test(v) ? h('a', { href: v, target: '_blank' }, v) : v))))),
      h('div.card', h('div.card-h', h('h3', ic('msg'), '연락 기록'), h('div.row', logBtn('통화'), logBtn('만남'), logBtn('메시지'))),
        inter.length ? h('div.timeline', inter.map(i => h('div.tl-i', h('div.faint.tiny', `${fmtDate(i.date)} · ${i.kind}`), h('div.small', i.memo || '')))) : h('div.empty', '연락할 때마다 기록하면 다음 대화가 쉬워져요'),
        meetings.length ? h('div', { style: { marginTop: '10px' } }, h('div.small', { style: { fontWeight: 650 } }, '함께한 회의'), meetings.map(m => h('div.li.click', { onclick: () => go('meetings/' + m.id) }, ic('mic', 14), h('div.small.grow', m.title), h('span.faint.tiny', m.date)))) : null,
        tasks.length ? h('div', { style: { marginTop: '10px' } }, h('div.small', { style: { fontWeight: 650 } }, '맡긴 일'), tasks.map(t => h('div.li', ic('check2', 14), h('div.small.grow', t.title), h('span.faint.tiny', t.due || '')))) : null)));

  function log(kind) {
    modal(`${kind} 기록`, close => form([{ k: 'date', label: '날짜', type: 'date', default: todayStr() }, { k: 'memo', label: '무슨 얘기를 했나요', type: 'textarea', rows: 4 }], {}, async v => {
      await db.put('interactions', { contactId: id, kind, ...v });
      if (!c.lastContact || v.date > c.lastContact) await db.patch(id, { lastContact: v.date });
      close(); go('people/' + id);
    }));
  }
}
