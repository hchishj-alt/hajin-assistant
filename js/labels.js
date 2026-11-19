// 중요도·분류 색 라벨: 일정·회의에 붙이는 색 (팀이 같은 뜻으로 쓰게 팀에 공유, 관리는 관리자)
import * as db from './db.js';
export const DEFAULTS = [
  { id: 'urgent', name: '긴급', color: '#e5484d' }, { id: 'important', name: '중요', color: '#f59e0b' },
  { id: 'normal', name: '보통', color: '#4b5bff' }, { id: 'easy', name: '여유', color: '#12976b' }, { id: 'idea', name: '아이디어', color: '#b05cff' }];
let cache = DEFAULTS;
export async function load() { const d = await db.get('labels-main'); cache = d && !d.deleted && d.list?.length ? d.list : DEFAULTS; return cache; }
export const all = () => cache;
export const find = id => cache.find(l => l.id === id) || null;
export const colorOf = id => find(id)?.color || '';
export async function save(list) { cache = list; await db.put('labelsets', { id: 'labels-main', list, team: (await db.get('team-main')) ? 'team-main' : '' }); }
db.onChange?.((col) => { if (col === 'labelsets') load(); });
