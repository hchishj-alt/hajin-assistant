// 처음 열었을 때 한 번: 기본 콘셉트·프로젝트를 넣어 둠 (사용법은 확인 대기함 위쪽 안내로 보여 줌)
import * as db from './db.js';
import { DEFAULT_CONCEPT, LOOKS } from './video.js';
import { updateBadge } from './app.js';
const E = '1970-01-01T00:00:00.000Z';
const seedPut = (col, it) => db.putRaw({ ...it, col, createdAt: E, updatedAt: E, deleted: false, dirty: false });
export async function welcome() {
  if (!(await db.list('concepts')).length) {
    await seedPut('concepts', { ...structuredClone(DEFAULT_CONCEPT), id: 'seed-concept-sky', name: '하진 · 하늘', look: { ...LOOKS['하늘'] }, accent: '#4b5bff', hashtags: '#hajin #design' });
    await seedPut('concepts', { ...structuredClone(DEFAULT_CONCEPT), id: 'seed-concept-mono', name: '하진 · 흑백 미니멀', look: { ...LOOKS['흑백'] }, accent: '#111111', sub: { pos: 'bottom', size: 50, style: 'plain' } });
  }
  if (!(await db.list('projects')).length) {
    await seedPut('projects', { id: 'seed-proj-eternia', name: '이터니아', status: '진행', color: '#4b5bff', desc: '졸업작품 · 팀 프로젝트' });
    await seedPut('projects', { id: 'seed-proj-hwansang', name: '환상선택', status: '진행', color: '#17181b', desc: '졸업작품 · 흑백 미니멀' });
  }
  updateBadge();
}
