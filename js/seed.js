// 처음 열었을 때 한 번: 기본 콘셉트·프로젝트, 사용법 안내를 확인 대기함에 하나 넣어 둠
import * as db from './db.js';
import * as store from './store.js';
import { DEFAULT_CONCEPT, LOOKS } from './video.js';
import { updateBadge } from './app.js';
export async function welcome() {
  if (!(await db.list('concepts')).length) {
    await db.put('concepts', { ...structuredClone(DEFAULT_CONCEPT), name: '하진 · 하늘', look: { ...LOOKS['하늘'] }, accent: '#4b5bff', hashtags: '#hajin #design' });
    await db.put('concepts', { ...structuredClone(DEFAULT_CONCEPT), name: '하진 · 흑백 미니멀', look: { ...LOOKS['흑백'] }, accent: '#111111', sub: { pos: 'bottom', size: 50, style: 'plain' } });
  }
  if (!(await db.list('projects')).length) {
    await db.put('projects', { name: '이터니아', status: '진행', color: '#4b5bff', desc: '졸업작품 · 팀 프로젝트' });
    await db.put('projects', { name: '환상선택', status: '진행', color: '#17181b', desc: '졸업작품 · 흑백 미니멀' });
  }
  await store.draft('note', { title: '확인 대기함 사용법', body: '비서가 만든 일정·할 일·요약은 여기서 먼저 기다려요.\n\n· 확정: 실제 기록으로 저장\n· 고치기: 고쳐서 저장 (비서가 배워요)\n· 종류 바꾸기: 다음부터 비슷한 말은 그 종류로\n· 버리기: 없던 일로', tags: ['사용법'] }, { source: '하진 비서 첫 실행', confidence: 1, origin: 'system' });
  updateBadge();
}
