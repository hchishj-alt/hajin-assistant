// 숫자로 계정 읽기: 반응률, 알고리즘 신호, 잘 되는 시간·형식, 성장, 맞팔 정리, 오늘의 매니저 카드
export const josa = w => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? '은' : '는'; };
export const PLAT = { ig: '인스타', tt: '틱톡' };
export const KIND = { reels: '릴스', carousel: '캐러셀', photo: '사진', video: '영상', story: '스토리' };
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
const kst = d => new Date(new Date(d).getTime() + 9 * 3600e3);
export const kDay = d => kst(d).getUTCDay();
export const kHour = d => kst(d).getUTCHours();
export const today = () => kst(Date.now()).toISOString().slice(0, 10);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const fmt = n => n == null || !Number.isFinite(+n) ? '–' : (n = +n, Math.abs(n) >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '만' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + '천' : String(Math.round(n)));
export const pct = x => x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';

// 게시물 하나의 반응 숫자
export function score(p, followers) {
  const base = p.reach || p.views || followers || 0;
  const inter = (p.likes || 0) + (p.comments || 0) + (p.saves || 0) + (p.shares || 0);
  const s = {
    inter, base,
    er: base ? inter / base : null,                       // 반응률
    save: p.reach && p.saves != null ? p.saves / p.reach : null,   // 저장률
    share: p.reach && p.shares != null ? p.shares / p.reach : null, // 공유(보내기)율 — 인스타가 가장 크게 보는 신호
    keep: p.avgWatch && p.dur ? Math.min(1, p.avgWatch / p.dur) : null, // 끝까지 본 비율(평균 시청/길이)
    reachX: followers && p.reach ? p.reach / followers : null,     // 팔로워 몇 배에게 닿았는지 (1 넘으면 추천 탐색에 실림)
  };
  return s;
}
const hasMetric = p => (p.likes ?? p.views ?? p.reach) != null;

export function analyze(st) {
  const { posts = [], profile = {}, snaps = [] } = st;
  const out = { plats: {} };
  for (const plat of ['ig', 'tt']) {
    const all = posts.filter(p => p.plat === plat);
    const ps = all.filter(hasMetric);
    const fol = profile[plat]?.followers || 0;
    const sc = ps.map(p => ({ p, s: score(p, fol) }));
    const ers = sc.map(x => x.s.er).filter(x => x != null);
    const byKind = {};
    for (const x of sc) { (byKind[x.p.kind] ||= []).push(x); }
    const kinds = Object.entries(byKind).map(([k, xs]) => ({ k, n: xs.length, er: med(xs.map(x => x.s.er).filter(v => v != null)), reach: med(xs.map(x => x.p.reach || x.p.views || 0)) })).sort((a, b) => (b.er ?? -1) - (a.er ?? -1));
    // 시간: 3시간 묶음 × 요일. 반응률 중앙값과 견줘서 위에 있는 칸
    // 시간 비교는 '얼마나 많이 닿았나'(도달·조회, 없으면 좋아요)를 같은 플랫폼 중앙값과 견줌
    const vol = x => x.p.reach || x.p.views || x.p.likes || 0;
    const vmid = med(sc.map(vol).filter(Boolean)) || 0;
    for (const x of sc) x.perf = vmid ? vol(x) / vmid : null;
    const slots = {};
    for (const x of sc) { if (x.perf == null) continue; const h = Math.floor(kHour(x.p.at) / 3) * 3; (slots[h] ||= []).push(x.perf); }
    const mid = 1;
    const hours = Object.entries(slots).map(([h, v]) => ({ h: +h, n: v.length, lift: mid ? med(v) / mid : 1 })).filter(x => x.n >= 2).sort((a, b) => b.lift - a.lift);
    const days = {}; for (const x of sc) if (x.perf != null) (days[kDay(x.p.at)] ||= []).push(x.perf);
    const dayRank = Object.entries(days).map(([d, v]) => ({ d: +d, n: v.length, lift: mid ? med(v) / mid : 1 })).filter(x => x.n >= 2).sort((a, b) => b.lift - a.lift);
    // 캡션 길이·해시태그 수
    const capLen = sc.filter(x => x.s.er != null).map(x => ({ len: (x.p.caption || '').replace(/#[^\s#]+/g, '').trim().length, tags: ((x.p.caption || '').match(/#[^\s#]+/g) || []).length, er: x.s.er }));
    const shortC = capLen.filter(x => x.len < 60).map(x => x.er), longC = capLen.filter(x => x.len >= 60).map(x => x.er);
    // 해시태그별: 2번 넘게 쓴 태그가 붙은 게시물의 도달을 평소와 견줌
    const tagMap = {};
    for (const x of sc) { if (x.perf == null) continue; for (const t of new Set(((x.p.caption || '').match(/#[^\s#]+/g) || []).map(t => t.toLowerCase()))) (tagMap[t] ||= []).push(x.perf); }
    const tagsRank = Object.entries(tagMap).filter(([, v]) => v.length >= 2).map(([t, v]) => ({ t, n: v.length, lift: med(v) })).sort((a, b) => b.lift - a.lift);
    // 올리는 박자
    const now = Date.now();
    const last = all[0] ? (now - new Date(all[0].at)) / 864e5 : null;
    const w4 = all.filter(p => now - new Date(p.at) < 28 * 864e5).length / 4;
    // 성장
    const sn = snaps.filter(s => s.plat === plat);
    const lastS = sn[sn.length - 1], ago = days_ => { const t = new Date(Date.now() - days_ * 864e5 + 9 * 3600e3).toISOString().slice(0, 10); return [...sn].reverse().find(s => s.date <= t); };
    const s7 = ago(7), s30 = ago(30);
    const top = [...sc].filter(x => x.s.er != null).sort((a, b) => b.s.er - a.s.er);
    out.plats[plat] = {
      n: all.length, measured: ps.length, er: med(ers), save: med(sc.map(x => x.s.save).filter(v => v != null)), share: med(sc.map(x => x.s.share).filter(v => v != null)),
      keep: med(sc.map(x => x.s.keep).filter(v => v != null)), reachX: med(sc.map(x => x.s.reachX).filter(v => v != null)),
      kinds, hours, dayRank, tagsRank, top: top.slice(0, 3), low: top.slice(-3).reverse(),
      cap: { short: med(shortC), long: med(longC), nShort: shortC.length, nLong: longC.length, tagsAvg: avg(capLen.map(x => x.tags)) },
      last, perWeek: w4,
      growth: { now: lastS?.followers ?? (profile[plat]?.followers || null), d7: lastS && s7 && s7 !== lastS ? lastS.followers - s7.followers : null, d30: lastS && s30 && s30 !== lastS ? lastS.followers - s30.followers : null, series: sn.slice(-60) },
      fol,
    };
  }
  return out;
}
export const slotName = h => `${h < 12 ? '오전' : '오후'} ${((h % 12) || 12)}~${(((h + 3) % 12) || 12)}시`;
export const dayName = d => DAY[d] + '요일';

// 맞팔 정리: 내가 팔로우하는데 안 받는 사람 / 나를 팔로우하는데 내가 안 한 사람 / 새로 온 사람 / 떠난 사람
export function people(pp = {}, handled = {}, plat = 'ig') {
  const fs = pp.followers || [], fg = pp.following || [], prev = pp.prevFollowers || null;
  const F = new Set(fs.map(x => x.u)), G = new Set(fg.map(x => x.u));
  const mark = u => handled[plat + ':' + u];
  const notBack = fg.filter(x => !F.has(x.u)).sort((a, b) => String(a.t).localeCompare(String(b.t)));  // 오래전에 팔로우했는데 안 받는 사람부터
  const fans = fs.filter(x => !G.has(x.u)).sort((a, b) => String(b.t).localeCompare(String(a.t)));      // 최근에 나를 팔로우한 사람부터
  const P = prev ? new Set(prev) : null;
  const fresh = P ? fs.filter(x => !P.has(x.u)) : [];
  const left = P ? [...P].filter(u => !F.has(u)).map(u => ({ u })) : [];
  const open = l => l.filter(x => !mark(x.u));
  return { notBack, fans, fresh, left, mutual: fs.filter(x => G.has(x.u)).length, openNotBack: open(notBack), openFans: open(fans), at: pp.at, F: fs.length, G: fg.length };
}
export const profileUrl = (plat, u) => plat === 'tt' ? `https://www.tiktok.com/@${u}` : `https://www.instagram.com/${u}/`;
export const DAILY_LIMIT = 20;   // 하루에 손으로 정리할 만큼. 한꺼번에 많이 끊거나 걸면 인스타·틱톡이 '자동 활동'으로 보고 막을 수 있음

// 오늘의 매니저 카드: 지금 해야 할 일부터. 각 카드는 숫자 근거를 같이 보여 줌
export function brief(st, A) {
  const cards = []; const add = c => cards.push(c);
  const { profile = {}, deals = [], drafts = [], people: pp = {}, handled = {}, about = {} } = st;
  const plats = ['ig', 'tt'].filter(p => profile[p]?.username || A.plats[p].n);
  if (!plats.length) add({ lvl: 'now', icon: 'user', title: '계정부터 알려 주세요', body: '인스타 아이디만 넣어도 시작돼요. 숫자는 연결하거나 캡처를 올리면 채워져요.', go: '#/settings', btn: '계정 넣기' });
  for (const plat of plats) {
    const a = A.plats[plat], name = PLAT[plat];
    if (a.last == null) add({ lvl: 'now', icon: 'upload', title: `${name} 게시물 기록이 아직 없어요`, body: '인사이트 화면 캡처를 올리면 AI가 숫자를 읽어 와요. 연결하면 자동이에요.', go: '#/data', btn: '숫자 채우기' });
    else if (a.last > (plat === 'tt' ? 2 : 4)) add({ lvl: 'now', icon: 'clock', title: `${name}에 ${Math.floor(a.last)}일째 안 올렸어요`, body: plat === 'tt' ? '틱톡은 자주 올릴수록 새 영상이 시험받을 기회가 늘어요. 짧은 거라도 오늘 하나 올려요.' : '쉬는 기간이 길면 다음 게시물이 처음 닿는 사람 수가 줄어요. 스토리라도 오늘 하나 올려요.', go: '#/coach', btn: '뭐 올릴지 정하기', num: Math.floor(a.last) + '일' });
    const best = a.hours[0];
    if (best && best.n >= 3 && best.lift > 1.15) add({ lvl: 'today', icon: 'clock', title: `${name}${josa(name)} ${slotName(best.h)}에 올리면 잘 돼요`, body: `그 시간에 올린 ${best.n}개는 평소보다 ${Math.round((best.lift - 1) * 100)}% 더 많은 사람에게 닿았어요.`, num: '+' + Math.round((best.lift - 1) * 100) + '%' });
    const k = a.kinds[0], k2 = a.kinds[1];
    if (k && k2 && k.er != null && k2.er != null && k.n >= 2 && k2.n >= 2 && k.er > k2.er * 1.25) add({ lvl: 'today', icon: 'layers', title: `${KIND[k.k] || k.k}가 ${KIND[k2.k] || k2.k}보다 잘 먹혀요`, body: `반응률 ${pct(k.er)} 대 ${pct(k2.er)}. 이번 주엔 ${KIND[k.k] || k.k}를 하나 더 넣어요.`, num: pct(k.er) });
    const t = a.top[0];
    if (t && a.er && a.measured >= 4 && t.s.er > a.er * 1.6) add({ lvl: 'today', icon: 'star', title: `"${(t.p.caption || KIND[t.p.kind] || '게시물').split('\n')[0].slice(0, 22)}" 같은 걸 한 번 더`, body: `이 게시물 반응률이 평소의 ${(t.s.er / a.er).toFixed(1)}배였어요. 같은 구도·주제로 변주하면 알고리즘이 이어서 밀어 줄 확률이 높아요.`, num: (t.s.er / a.er).toFixed(1) + '배' });
    if (plat === 'ig' && a.share != null && a.save != null && a.measured >= 3) {
      if (a.share < 0.005) add({ lvl: 'tip', icon: 'send', title: '보내기(공유)가 적어요', body: `공유율 ${pct(a.share)}. 인스타는 "친구한테 보내고 싶은 것"을 가장 크게 봐요. 끝에 "이거 ○○한테 보내 줘" 같은 말이나, 친구를 떠올리게 하는 상황을 넣어 봐요.`, num: pct(a.share) });
    }
    if (a.keep != null && a.keep < 0.4) add({ lvl: 'tip', icon: 'play', title: `${name} 영상이 끝까지 안 보여져요`, body: `평균 ${pct(a.keep)}만 보고 넘겨요. 첫 1초에 결론·표정·움직임을 먼저 보여 주고, 길이를 줄여 봐요.`, go: '#/coach', btn: '영상 봐 주기', num: pct(a.keep) });
    if (a.growth.d7 != null) add({ lvl: 'tip', icon: 'trend', title: `${name} 이번 주 팔로워 ${a.growth.d7 >= 0 ? '+' : ''}${a.growth.d7}`, body: a.growth.d7 > 0 ? '좋아요. 새로 온 사람들이 본 게시물이 무엇인지 분석에서 확인해 봐요.' : '줄었어요. 떠난 사람 명단을 확인하고, 최근 올린 것 중 평소와 결이 다른 게 있었는지 봐요.', num: (a.growth.d7 >= 0 ? '+' : '') + a.growth.d7 });
  }
  for (const plat of plats) {
    const a = A.plats[plat]; const gt = about.goal || ''; const only = /인스타|insta/i.test(gt) && !/틱톡|tiktok/i.test(gt) ? 'ig' : /틱톡|tiktok/i.test(gt) && !/인스타|insta/i.test(gt) ? 'tt' : null; const pc = only && only !== plat ? null : pace(gt, a, about.goalAt);
    if (pc && !pc.done && pc.perDay != null) add({ lvl: pc.onTrack === false ? 'today' : 'tip', icon: 'target', title: pc.onTrack === false ? `${PLAT[plat]} 목표까지 하루 ${Math.ceil(pc.need)}명씩 필요해요` : `${PLAT[plat]} 목표까지 ${fmt(pc.left)}명 남았어요`, body: pc.eta ? `지금 속도(하루 ${pc.perDay.toFixed(1)}명)면 ${pc.eta}일 뒤 ${fmt(pc.g.n)}명이에요.${pc.onTrack === false ? ' 속도를 올리려면 잘된 형식을 주 3번 이상, 같은 시간에 꾸준히.' : ''}` : '요즘 팔로워가 늘지 않아요. 잘된 게시물을 변주해서 다시 올려 봐요.', num: fmt(pc.left) + '명' });
    // 지금이 잘 되는 시간인데 오늘 안 올렸으면
    const best = a.hours[0], hr = kHour(Date.now());
    if (best && best.n >= 3 && best.lift > 1.1 && hr >= best.h - 1 && hr < best.h + 3 && (a.last == null || a.last >= 0.8)) add({ lvl: 'now', icon: 'zap', title: `지금이 ${PLAT[plat]} 올리기 좋은 시간이에요`, body: `${slotName(best.h)}에 올린 게 평소보다 ${Math.round((best.lift - 1) * 100)}% 더 닿았어요. 준비된 게 있으면 지금 올려요.`, go: '#/coach/caption', btn: '캡션 받기' });
    const tg = a.tagsRank;
    if (tg.length >= 3 && tg[0].lift > 1.3) add({ lvl: 'tip', icon: 'hash', title: `${tg[0].t} 붙인 게 잘 닿아요`, body: `${tg[0].n}번 썼고 평소의 ${tg[0].lift.toFixed(1)}배. ${tg[tg.length - 1].lift < 0.8 ? tg[tg.length - 1].t + '는 빼도 돼요.' : ''}`, num: tg[0].lift.toFixed(1) + '배' });
  }
  // 사람 정리
  for (const plat of ['ig', 'tt']) {
    const p = pp[plat]; if (!p) continue;
    const r = people(p, handled, plat);
    if (r.openFans.length) add({ lvl: 'today', icon: 'users', title: `${PLAT[plat]} 맞팔 안 한 팔로워 ${r.openFans.length}명`, body: `나를 팔로우했는데 내가 아직 안 한 사람이에요. 오늘 ${Math.min(DAILY_LIMIT, r.openFans.length)}명만 봐요.`, go: '#/people', btn: '정리하기', num: r.openFans.length + '명' });
    if (r.openNotBack.length) add({ lvl: 'tip', icon: 'users', title: `${PLAT[plat]} 나만 팔로우 중 ${r.openNotBack.length}명`, body: '상대는 나를 안 하는 계정이에요. 좋아하는 계정이면 두고, 아니면 하루 20명 안쪽으로 천천히 끊어요.', go: '#/people', btn: '보기', num: r.openNotBack.length + '명' });
    const age = p.at ? (Date.now() - new Date(p.at)) / 864e5 : 99;
    if (age > 14) add({ lvl: 'tip', icon: 'refresh', title: `${PLAT[plat]} 팔로우 명단이 ${Math.floor(age)}일 지났어요`, body: '새로 받으면 그동안 새로 온 사람·떠난 사람을 알려 드려요.', go: '#/people', btn: '새로 받기' });
  }
  // 협찬
  const live = deals.filter(d => !['정산', '거절'].includes(d.status));
  for (const d of live) {
    const left = d.due ? Math.ceil((new Date(d.due + 'T23:59:59+09:00') - Date.now()) / 864e5) : null;
    if (left != null && left <= 3 && d.status !== '업로드') add({ lvl: 'now', icon: 'briefcase', title: `${d.brand} ${left < 0 ? '마감 지남' : left === 0 ? '오늘 마감' : 'D-' + left}`, body: `${d.deliverables || '콘텐츠'} · ${d.status}. 올릴 때 첫 줄에 "광고"를 꼭 넣어요.`, go: '#/deals', btn: '열기', num: left < 0 ? '지남' : 'D-' + left });
    if (d.status === '업로드' && !d.paid) add({ lvl: 'today', icon: 'wallet', title: `${d.brand} 정산 확인`, body: `${d.fee ? fmt(d.fee) + '원 ' : ''}들어왔는지 확인하고 정산으로 옮겨요.`, go: '#/deals', btn: '열기' });
  }
  const pend = drafts.filter(d => d.status === '임시').length;
  if (pend) add({ lvl: 'today', icon: 'inbox', title: `AI가 만든 것 ${pend}개가 확인을 기다려요`, body: '확인해야 기록에 들어가요.', go: '#/inbox', btn: '확인하기', num: pend + '개' });
  if (!about.goal) add({ lvl: 'tip', icon: 'target', title: '목표를 정해 두면 더 똑똑해져요', body: '예: "3개월 안에 팔로워 1만, 패션·일상". 캡션·피드백이 목표 쪽으로 맞춰져요.', go: '#/settings', btn: '목표 정하기' });
  const order = { now: 0, today: 1, tip: 2 };
  return cards.sort((a, b) => order[a.lvl] - order[b.lvl]);
}
// 목표 글에서 팔로워 숫자·기간 읽기: "3개월 안에 팔로워 1만" → {n:10000, days:90}
export function goalOf(text = '') {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(만|천|k|K)?\s*(명)?/g); if (!m) return null;
  let n = null;
  for (const x of m) { const y = x.match(/(\d+(?:\.\d+)?)\s*(만|천|k|K)?/); const v = +y[1] * (y[2] === '만' ? 10000 : /천|k/i.test(y[2] || '') ? 1000 : 1); if (v >= 100) { n = v; } }
  if (!n) return null;
  const per = String(text).match(/(\d+)\s*(개월|달|주|일)/); const days = per ? +per[1] * (/(개월|달)/.test(per[2]) ? 30 : per[2] === '주' ? 7 : 1) : null;
  return { n, days };
}
export function pace(goalText, a, setAt) {
  const g = goalOf(goalText); if (!g || !a.growth.now) return null;
  const perDay = a.growth.d30 != null ? a.growth.d30 / 30 : a.growth.d7 != null ? a.growth.d7 / 7 : null;
  const left = g.n - a.growth.now; if (left <= 0) return { g, done: true };
  const eta = perDay > 0 ? Math.ceil(left / perDay) : null;
  const daysLeft = g.days && setAt ? Math.max(1, g.days - Math.floor((Date.now() - setAt) / 864e5)) : g.days;
  const need = daysLeft ? left / daysLeft : null;
  return { g, left, perDay, eta, need, daysLeft, onTrack: need != null && perDay != null ? perDay >= need : null };
}
// 협찬 단가 대략 (국내 마이크로 인플루언서 흔한 범위로 잡은 어림값, 실제는 협의)
export function rateGuess(followers, er) {
  if (!followers) return null;
  const per = followers < 10000 ? [10, 30] : followers < 50000 ? [15, 35] : [20, 40]; // 팔로워 1명당 원
  const boost = er && er > 0.06 ? 1.3 : er && er < 0.02 ? 0.8 : 1;
  return [Math.round(followers * per[0] * boost / 10000) * 10000, Math.round(followers * per[1] * boost / 10000) * 10000];
}

// 줄이지 않고 쉼표만 (가격용)
export const fmt2 = n => Number(n).toLocaleString('ko-KR');
