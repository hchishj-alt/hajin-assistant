// 처음 열었을 때 한 번: 기본 콘셉트를 넣어 둠 (사용법은 확인 대기함 위쪽 안내로 보여 줌)
import * as db from './db.js';
import { DEFAULT_CONCEPT, LOOKS } from './video.js';
import { updateBadge } from './app.js';
const E = '1970-01-01T00:00:00.000Z';
const seedPut = (col, it) => db.putRaw({ ...it, col, createdAt: E, updatedAt: E, deleted: false, dirty: false });
export async function welcome() {
  if (!(await db.list('concepts', { includeDeleted: true })).length) {   /* 지운 것도 세어서, 지운 기본 콘셉트를 되살리지 않음 */
    await seedPut('concepts', { ...structuredClone(DEFAULT_CONCEPT), id: 'seed-concept-sky', name: '하진 · 하늘', look: { ...LOOKS['하늘'] }, accent: '#4b5bff', hashtags: '#hajin #design' });
    await seedPut('concepts', { ...structuredClone(DEFAULT_CONCEPT), id: 'seed-concept-mono', name: '하진 · 흑백 미니멀', look: { ...LOOKS['흑백'] }, accent: '#111111', sub: { pos: 'bottom', size: 50, style: 'plain' } });
  }
  // 기본 프로젝트는 넣지 않음. 전에는 프로젝트가 하나도 없으면 "이터니아"·"환상선택"을 다시 넣어서, 다 지워도 되살아났음 (v1.35.5)
  updateBadge();
}
