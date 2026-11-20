// 연습 모드: 가상의 초보 인플루언서 '봄이'(인스타 팔로워 860, 틱톡 420)로 앱 전체를 미리 써 보게 함.
// 진짜 기록과 따로 저장되고(store 'demo:'), 끄면 사라짐.
import * as S from './store.js';
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const CAPS = [
  ['reels', '출근룩 30초 완성 🧥\n오늘은 니트+슬랙스 조합\n\n여러분은 출근룩 몇 분 걸려요?', 1.9],
  ['carousel', '11월 데일리룩 모음 (저장 필수)\n1. 체크 코트\n2. 니트 베스트\n3. 블랙 원피스', 1.6],
  ['photo', '오늘 날씨 너무 좋다', 0.6],
  ['reels', '다이소 5천원으로 책상 꾸미기 ✨ 친구한테 보내 줘', 2.4],
  ['reels', 'GRWM 졸업전시 가는 날', 1.2],
  ['photo', '카페 ☕️', 0.5],
  ['carousel', '디자인과 학생 작업실 투어 (아이패드 세팅 포함)', 1.8],
  ['reels', '무쌍 메이크업 3분 루틴 #무쌍', 1.4],
  ['photo', '셀카', 0.4],
  ['reels', '편의점 신상 솔직 리뷰 (진짜 별로였던 것 포함)', 1.5],
];
export async function seed() {
  const r = rng(7); const now = Date.now(); const posts = [];
  for (let i = 0; i < 34; i++) {
    const c = CAPS[i % CAPS.length]; const plat = i % 3 === 2 ? 'tt' : 'ig';
    const daysAgo = i * 2.6 + r() * 1.2 + 1.5;
    const hourPick = [8, 12, 13, 19, 20, 21, 22, 23][Math.floor(r() * 8)];
    const d = new Date(now - daysAgo * 864e5); d.setUTCHours(hourPick - 9, Math.floor(r() * 60));
    const nightBoost = hourPick >= 19 && hourPick <= 22 ? 1.45 : 1;
    const kind = plat === 'tt' ? 'video' : c[0];
    const reach = Math.round((plat === 'tt' ? 380 : 520) * c[2] * nightBoost * (0.7 + r() * 0.6) * (1 + (34 - i) / 60));
    const likes = Math.round(reach * (0.05 + r() * 0.04) * (c[2] > 1.3 ? 1.3 : 1));
    const dur = kind === 'reels' || kind === 'video' ? Math.round(9 + r() * 40) : undefined;
    posts.push({ plat, kind, at: d.toISOString(), caption: c[1] + (i % 4 === 0 ? '\n\n#데일리룩 #코디 #대학생룩 #ootd' : ''), reach, views: dur ? Math.round(reach * 1.4) : undefined, likes, comments: Math.round(likes * (0.05 + r() * 0.08)), saves: Math.round(reach * (kind === 'carousel' ? 0.04 : 0.012) * (0.6 + r())), shares: Math.round(reach * (c[1].includes('보내') ? 0.025 : 0.004) * (0.5 + r())), dur, avgWatch: dur ? Math.round(dur * (0.28 + r() * 0.35) * 10) / 10 : undefined, src: 'demo', ext: 'demo' + i });
  }
  await S.set('posts', posts.sort((a, b) => b.at.localeCompare(a.at)));
  const snaps = []; let ig = 610, tt = 250;
  for (let d = 60; d >= 0; d--) { ig += Math.round(r() * 8 - 1.5); tt += Math.round(r() * 6 - 1); snaps.push({ date: new Date(now - d * 864e5 + 9 * 3600e3).toISOString().slice(0, 10), plat: 'ig', followers: ig }, { date: new Date(now - d * 864e5 + 9 * 3600e3).toISOString().slice(0, 10), plat: 'tt', followers: tt }); }
  await S.set('snaps', snaps);
  await S.set('profile', { ig: { username: 'bomi.daily', followers: ig, following: 702, media: 48 }, tt: { username: 'bomi_daily', followers: tt, following: 180 } });
  const names = n => Array.from({ length: n }, (_, i) => ({ u: ['mint', 'sora', 'jun', 'ha', 'dal', 'byul', 'yuri', 'nana', 'coco', 'roro'][i % 10] + '_' + (100 + i * 7), t: new Date(now - (n - i) * 1.3 * 864e5).toISOString() }));
  const fol = names(140), fing = [...names(90), ...Array.from({ length: 45 }, (_, i) => ({ u: 'brand_or_star_' + i, t: new Date(now - (200 - i) * 864e5).toISOString() }))];
  await S.set('people', { ig: { followers: fol, following: fing, at: new Date(now - 3 * 864e5).toISOString(), prevFollowers: fol.slice(0, 128).map(x => x.u).concat(['left_one', 'left_two']) } });
  await S.set('deals', [
    { id: 'd1', brand: '모모 립밤', kind: '제품 협찬', fee: 0, product: '립밤 3종', deliverables: '릴스 1 + 스토리 1', due: new Date(now + 2 * 864e5 + 9 * 3600e3).toISOString().slice(0, 10), status: '진행', memo: '광고 표시 필수, 태그 @momo' },
    { id: 'd2', brand: '로컬 카페 숲', kind: '유료 광고', fee: 150000, deliverables: '피드 1', due: new Date(now - 4 * 864e5 + 9 * 3600e3).toISOString().slice(0, 10), status: '업로드', paid: false },
    { id: 'd3', brand: '가방 브랜드 누크', kind: '문의', fee: 300000, deliverables: '릴스 1', status: '문의', memo: 'DM으로 단가 물어봄' },
  ]);
  await S.set('about', { name: '봄이', ig: 'bomi.daily', tt: 'bomi_daily', goal: '3개월 안에 인스타 팔로워 3천, 데일리룩·대학생 일상', vibe: '편안함, 꾸안꾸, 솔직 리뷰' });
  await S.set('ads', [{ id: 'a1', where: 'ig', what: '데일리룩 릴스 홍보', spend: 20000, reach: 4100, follows: 23, at: new Date(now - 10 * 864e5).toISOString() }]);
}
