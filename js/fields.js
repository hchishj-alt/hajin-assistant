// 종류별 입력 항목 정의 — 확인 대기함 편집과 각 페이지 직접 편집이 같은 정의를 씀
import { EXP_CATS } from './brain.js';
export const EXP_CAT_LIST = [...Object.keys(EXP_CATS), '기타'];
export const FIELDS = {
  event: [
    { k: 'title', label: '제목', full: true },
    { k: 'date', label: '날짜', type: 'date', req: true },
    { k: 'endDate', label: '끝나는 날 (여러 날일 때)', type: 'date' },
    { k: 'place', label: '장소' },
    { k: 'who', label: '누구랑' },
    { k: 'addr', label: '주소 (자동으로 찾음)', full: true },
    { k: 'start', label: '시작', type: 'time' },
    { k: 'end', label: '끝', type: 'time' },
    { k: 'repeat', label: '반복', type: 'select', options: [['', '안 함'], ['daily', '매일'], ['weekdays', '평일'], ['weekly', '매주'], ['biweekly', '격주'], ['monthly', '매월']] },
    { k: 'remind', label: '알림(분 전)', type: 'number', default: 10 },
    { k: 'label', label: '중요도 색', type: 'label', full: true },
    { k: 'scope', label: '구분', type: 'select', options: [['', '알아서 (내용 보고 정함)'], ['work', '팀 업무 (팀 전체 일정)'], ['personal', '개인 (나만 보기)']], default: '' },
    { k: 'memo', label: '메모', type: 'textarea', rows: 2 },
  ],
  task: [
    { k: 'title', label: '할 일', full: true },
    { k: 'due', label: '마감일', type: 'date' },
    { k: 'time', label: '시간', type: 'time' },
    { k: 'priority', label: '중요도', type: 'select', options: [['high', '높음'], ['normal', '보통'], ['low', '낮음']], default: 'normal' },
    { k: 'project', label: '프로젝트' },
    { k: 'who', label: '담당' },
    { k: 'scope', label: '구분', type: 'select', options: [['', '알아서 (내용 보고 정함)'], ['work', '팀 업무 (팀 전체 일정)'], ['personal', '개인 (나만 보기)']], default: '' },
    { k: 'memo', label: '메모', type: 'textarea', rows: 2 },
  ],
  expense: [
    { k: 'title', label: '내용', full: true },
    { k: 'amount', label: '금액(원)', type: 'number', inputmode: 'numeric' },
    { k: 'date', label: '날짜', type: 'date' },
    { k: 'category', label: '분류', type: 'select', options: EXP_CAT_LIST },
    { k: 'pay', label: '결제 수단', type: 'select', options: ['개인카드', '법인카드', '현금', '계좌이체'] },
    { k: 'project', label: '프로젝트' },
    { k: 'status', label: '처리 상태', type: 'select', options: [['todo', '정산 전'], ['submitted', '결재 요청'], ['approved', '승인됨'], ['done', '정산 완료']], default: 'todo' },
    { k: 'team', label: '공유', type: 'select', options: [['auto', '알아서 (내용 보고 정함)'], ['', '나만 보기'], ['team-main', '팀에 공유']], default: 'auto' },
    { k: 'memo', label: '메모', type: 'textarea', rows: 2 },
  ],
  income: [
    { k: 'title', label: '내용', full: true },
    { k: 'amount', label: '금액(원)', type: 'number', inputmode: 'numeric' },
    { k: 'date', label: '받는 날 (받기로 한 날)', type: 'date' },
    { k: 'from', label: '누구에게서' },
    { k: 'project', label: '프로젝트' },
    { k: 'status', label: '상태', type: 'select', options: [['due', '받을 예정'], ['got', '받음']], default: 'due' },
    { k: 'team', label: '공유', type: 'select', options: [['auto', '알아서 (내용 보고 정함)'], ['', '나만 보기'], ['team-main', '팀에 공유']], default: 'auto' },
    { k: 'memo', label: '메모', type: 'textarea', rows: 2 },
  ],
  vendor: [
    { k: 'name', label: '업체 이름' },
    { k: 'cat', label: '분야' },
    { k: 'phone', label: '전화', type: 'tel' },
    { k: 'kakao', label: '카톡·담당자' },
    { k: 'link', label: '링크', full: true },
    { k: 'memo', label: '메모', full: true },
  ],
  buy: [
    { k: 'title', label: '상품명', full: true },
    { k: 'url', label: '링크', type: 'url', full: true },
    { k: 'price', label: '가격', type: 'number' },
    { k: 'qty', label: '수량', type: 'number' },
  ],
  contact: [
    { k: 'name', label: '이름' },
    { k: 'phone', label: '전화', type: 'tel' },
    { k: 'email', label: '이메일', type: 'email' },
    { k: 'org', label: '소속' },
    { k: 'role', label: '직함·역할' },
    { k: 'group', label: '그룹', type: 'select', options: ['팀', '학교', '협력사', '클라이언트', '투자·지원', '친구', '가족', '기타'], default: '기타' },
    { k: 'birthday', label: '생일', type: 'date' },
    { k: 'cadence', label: '연락 주기(일, 0=없음)', type: 'number', default: 0 },
    { k: 'team', label: '공유', type: 'select', options: [['auto', '알아서 (내용 보고 정함)'], ['', '나만 보기'], ['team-main', '팀에 공유']], default: 'auto' },
    { k: 'sns', label: 'SNS·포트폴리오', full: true },
    { k: 'memo', label: '메모', type: 'textarea', rows: 3 },
  ],
  note: [
    { k: 'title', label: '제목', full: true, req: false },
    { k: 'body', label: '내용', type: 'textarea', rows: 8 },
    { k: 'project', label: '프로젝트' },
  ],
  idea: [
    { k: 'title', label: '아이디어', full: true },
    { k: 'body', label: '설명', type: 'textarea', rows: 5 },
    { k: 'project', label: '프로젝트' },
  ],
  reference: [
    { k: 'title', label: '제목', full: true },
    { k: 'url', label: '링크', type: 'url', full: true },
    { k: 'project', label: '프로젝트' },
    { k: 'memo', label: '왜 좋은지', type: 'textarea', rows: 3 },
  ],
  timelog: [
    { k: 'title', label: '무엇을', full: true },
    { k: 'minutes', label: '시간(분)', type: 'number' },
    { k: 'date', label: '날짜', type: 'date' },
    { k: 'project', label: '프로젝트' },
  ],
  sns: [
    { k: 'title', label: '콘텐츠', full: true },
    { k: 'platform', label: '플랫폼', type: 'select', options: ['인스타그램', '유튜브', '틱톡', '블로그', 'X', '링크드인'] },
    { k: 'status', label: '상태', type: 'select', options: ['아이디어', '촬영', '편집', '예약', '게시'] },
    { k: 'date', label: '게시 예정일', type: 'date' },
    { k: 'caption', label: '캡션', type: 'textarea', rows: 3 },
  ],
  okr: [
    { k: 'title', label: '목표(Objective)', full: true },
    { k: 'quarter', label: '분기' },
    { k: 'owner', label: '책임자' },
  ],
  grant: [
    { k: 'title', label: '사업·공모 이름', full: true },
    { k: 'org', label: '주관 기관' },
    { k: 'deadline', label: '마감일', type: 'date' },
    { k: 'amount', label: '지원 금액(원)', type: 'number' },
    { k: 'status', label: '상태', type: 'select', options: ['검토', '준비', '제출', '서류 합격', '발표', '선정', '탈락'] },
    { k: 'url', label: '공고 링크', type: 'url', full: true },
    { k: 'memo', label: '메모', type: 'textarea', rows: 3 },
  ],
};
// 보기용 한 줄 요약
export function describe(kind, d) {
  const p = [];
  if ((kind === 'event' || kind === 'task') && d.scope) p.push(d.scope === 'personal' ? '개인' : '팀 업무');
  if (kind === 'event') { if (d.date) p.push(d.date.slice(5).replace('-', '/') + (d.endDate && d.endDate > d.date ? '–' + d.endDate.slice(5).replace('-', '/') : '')); if (d.start) p.push(d.start + (d.end ? '–' + d.end : '')); if (d.place) p.push(d.area && !d.place.includes(d.area) ? `${d.place} (${d.area})` : d.place); else if (d.area) p.push(d.area); if (d.project) p.push(d.project); if (d.who) p.push((w => w + (((w.charCodeAt(w.length - 1) - 0xAC00) % 28) > 0 && /[가-힣]$/.test(w) ? '과' : '와') + ' 함께')(d.who)); if (d.addr) p.push(d.addr); }
  if (kind === 'task') { if (d.due) p.push('마감 ' + d.due.slice(5).replace('-', '/')); if (d.who) p.push('담당 ' + d.who); if (d.priority === 'high') p.push('중요'); if (d.project) p.push(d.project); if (d.memo) p.push(String(d.memo).slice(0, 40)); }
  if (kind === 'expense') { p.push((Number(d.amount) || 0).toLocaleString() + '원'); if (d.category) p.push(d.category); if (d.pay) p.push(d.pay); if (d.project) p.push(d.project); if (d.memo) p.push(String(d.memo).slice(0, 40)); }
  if (kind === 'income') { p.push((Number(d.amount) || 0).toLocaleString() + '원'); p.push(d.status === 'got' ? '받음' : '받을 예정'); if (d.date) p.push(d.date.slice(5).replace('-', '/')); if (d.from) p.push(d.from); if (d.project) p.push(d.project); if (d.memo) p.push(String(d.memo).slice(0, 40)); }
  if (kind === 'contact') { if (d.phone) p.push(d.phone); if (d.org) p.push(d.org); if (d.email) p.push(d.email); }
  if (kind === 'vendor') { if (d.cat) p.push(d.cat); if (d.phone) p.push(d.phone); if (d.kakao) p.push(d.kakao); if (d.link) p.push(d.link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]); for (const x of (d.prices || []).slice(0, 3)) p.push(`${x.item} ${Number(x.price).toLocaleString()}원${x.note ? ' (' + x.note + ')' : ''}`); if (d.memo) p.push(d.memo); }
  if (kind === 'buy') { if (d.price) p.push(Number(d.price).toLocaleString() + '원'); if (d.url) { try { p.push(new URL(d.url).hostname.replace(/^www\./, '')); } catch { } } }
  if (kind === 'timelog') { p.push(`${d.minutes}분`); if (d.project) p.push(d.project); }
  if (kind === 'reference' && d.url) { try { p.push(new URL(d.url).hostname); } catch { } }
  if (kind === 'grant' && d.deadline) p.push('마감 ' + d.deadline);
  if (kind === 'sns') p.push(d.platform);
  if ((kind === 'note' || kind === 'idea') && d.tags?.length) p.push(d.tags.slice(0, 4).map(t => '#' + t).join(' '));
  return p.join(' · ');
}
