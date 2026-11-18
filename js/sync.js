// 동기화 자리 (마지막 단계에서 Supabase 연결). 지금은 기기 저장만.
export const enabled = false;
export async function syncNow() { return { ok: false, reason: '아직 동기화가 꺼져 있어요' }; }
