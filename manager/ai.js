// 매니저의 AI: 비서 앱과 같은 무료 Gemini 키(이 기기의 'hajin-assistant' 저장소 secret:gemini)를 같이 씀.
// 키가 없으면 각 기능이 앱 규칙으로 대신 답함. 키는 화면·기록·로그에 절대 안 남김.
import * as hdb from '../js/db.js';
const KEY = 'secret:gemini';
const GAPI = 'https://generativelanguage.googleapis.com/v1beta/';
export const hasKey = async () => { try { return !!(await hdb.kvGet(KEY, '')); } catch { return false; } };
export async function saveKey(k) { await hdb.kvSet(KEY, k.trim()); await hdb.kvSet('ai:model', ''); await hdb.kvSet('ai:on', true); try { await hdb.kvSetRaw('me:aiteam', false); } catch { } }
export const looksLikeKey = k => /^(AIza[\w-]{30,}|AQ\.[\w.-]{20,})$/.test(k.trim());

async function call(model, key, body, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  const url = GAPI + `models/${model}:generateContent`;
  const ways = /^AIza/.test(key) ? ['q', 'h'] : ['h', 'q']; let r;
  try {
    for (const w of ways) {
      r = await fetch(w === 'q' ? url + '?key=' + encodeURIComponent(key) : url, { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json', ...(w === 'h' ? { 'x-goog-api-key': key } : {}) }, body });
      if (r.ok || ![400, 401, 403].includes(r.status)) break;
    }
    return r;
  } finally { clearTimeout(t); }
}
// parts: [문자열 | {img: base64, mime}] → 글 또는 JSON
export async function gem(parts, { json = false, temp = 0.6, ms = 40000 } = {}) {
  const key = await hdb.kvGet(KEY, ''); if (!key) throw new Error('AI 키가 없어요');
  const saved = await hdb.kvGet('ai:model', '');
  const list = [...new Set([/flash/.test(saved) ? saved : '', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'].filter(Boolean))];
  const body = JSON.stringify({ contents: [{ parts: parts.map(p => typeof p === 'string' ? { text: p } : { inline_data: { mime_type: p.mime || 'image/jpeg', data: p.img } }) }], generationConfig: { temperature: temp, ...(json ? { responseMimeType: 'application/json' } : {}) } });
  let last = '';
  for (const m of list) {
    let r; try { r = await call(m, key, body, ms); } catch { last = '응답이 너무 늦어요'; continue; }
    if (r.ok) { const out = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim(); if (!json) return out; try { return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { last = 'AI 답을 읽지 못했어요'; continue; } }
    last = r.status === 429 ? '무료 사용량을 잠깐 넘었어요. 1분쯤 뒤에 다시 해 주세요' : [400, 401, 403].includes(r.status) ? 'AI 키를 확인해 주세요 (' + r.status + ')' : 'AI가 답하지 못했어요 (' + r.status + ')';
    if ([401, 403].includes(r.status)) break;
  }
  throw new Error(last || 'AI가 답하지 못했어요');
}

// 구글 검색을 붙여 묻기(최신 트렌드 탐색). 답은 글로 받고 그 안의 JSON을 꺼냄. 출처 링크도 같이
export async function search(prompt, { ms = 60000 } = {}) {
  const key = await hdb.kvGet(KEY, ''); if (!key) throw new Error('AI 키가 없어요');
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.5 } });
  let last = '';
  for (const m of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']) {
    let r; try { r = await call(m, key, body, ms); } catch { last = '응답이 너무 늦어요'; continue; }
    if (!r.ok) { last = r.status === 429 ? '무료 사용량을 넘었어요' : 'AI 검색 실패 (' + r.status + ')'; if ([401, 403].includes(r.status)) break; continue; }
    const j = await r.json(); const c = j.candidates?.[0] || {};
    const text = (c.content?.parts || []).map(p => p.text || '').join('');
    const src = (c.groundingMetadata?.groundingChunks || []).map(g => g.web).filter(Boolean).map(w => ({ title: w.title, url: w.uri })).slice(0, 12);
    const mm = text.match(/\{[\s\S]*\}/); if (!mm) { last = 'AI 답을 읽지 못했어요'; continue; }
    try { return { data: JSON.parse(mm[0]), src }; } catch { last = 'AI 답을 읽지 못했어요'; }
  }
  throw new Error(last || 'AI 검색 실패');
}
// 매니저의 성격과 지식. 모든 부탁에 앞에 붙음
const ROLE = (about, plat) => `너는 ${about.name || '하진'}의 전담 SNS 매니저야. ${about.name || '하진'}은 자기 자신이 콘텐츠인 초보 크리에이터고 ${plat === 'tt' ? '틱톡' : plat === 'ig' ? '인스타그램' : '인스타그램과 틱톡'}에서 인플루언서로 크는 게 목표야.
계정: 인스타 ${about.ig || '-'} / 틱톡 ${about.tt || '-'}. 목표: ${about.goal || '아직 안 정함'}. 분위기·키워드: ${about.vibe || '-'}.
말투: 친한 매니저처럼 다정하지만 솔직하게, 해요체. 칭찬은 짧게, 고칠 점은 구체적으로(몇 초, 어떤 말, 어떤 각도). 뜬구름 금지, 바로 할 수 있는 행동으로.
알고리즘 상식(2025~2026 기준 공개된 내용): 인스타 릴스는 시청 시간·끝까지 보기, 도달 대비 보내기(DM 공유), 도달 대비 좋아요를 핵심으로 보고 비팔로워 추천은 '원본성'을 우대함(재업로드·워터마크 감점). 3초 안에 이탈하면 추천이 끊김. 캐러셀은 넘겨 보기·저장이 신호. 해시태그는 3~5개 정확한 것, 캡션 키워드가 검색에 쓰임. 틱톡은 완주율·다시 보기·공유·댓글, 첫 1~2초 훅, 화면 글자·캡션 키워드 검색(틱톡 SEO), 트렌드 사운드. 둘 다 9:16 세로, 화면 위아래 UI 가리는 영역 피하기.
광고: 한국 공정위 기준으로 협찬·광고는 캡션 첫 줄이나 영상 시작에 "광고"/"협찬" 같은 표시를 분명히 해야 해.`;

export async function caption({ about, plat, idea, mood, past = [], notes = '' }) {
  const prompt = `${ROLE(about, plat)}
${plat === 'tt' ? '틱톡' : '인스타'}에 올릴 게시물 캡션을 써 줘.
무슨 게시물: ${idea || '(설명 없음)'}
원하는 느낌: ${mood || '평소 나처럼'}
${notes ? '영상·사진을 본 매니저 메모: ' + notes : ''}
내가 전에 쓴 캡션(말투를 따라 해): ${past.slice(0, 8).map(c => '「' + c.slice(0, 120) + '」').join(' ') || '없음'}
JSON으로만 답해: {"options":[{"style":"짧은 이름","text":"캡션 전체(줄바꿈 \\n, 해시태그 빼고)","why":"왜 이게 먹히는지 한 줄"}] 3개, "tags":["#태그" 4~6개: 큰 것 1~2 + 작은 것], "first":"첫 줄(훅) 팁 한 줄", "cta":"댓글·저장·보내기를 부르는 끝맺음 한 줄", "keywords":["검색에 걸릴 낱말" 3개]}`;
  return gem([prompt], { json: true, temp: 0.85 });
}
export async function video({ about, plat, frames, meta, rules, idea }) {
  const prompt = `${ROLE(about, plat)}
내가 만든 ${plat === 'tt' ? '틱톡' : '릴스'} 영상을 봐 줘. 아래 사진은 영상에서 뽑은 장면이고 각각 몇 초 장면인지 순서대로: ${frames.map(f => f.t.toFixed(1) + '초').join(', ')}.
영상 정보: 길이 ${meta.dur.toFixed(1)}초, ${meta.w}×${meta.h}, ${meta.ratio}. 앱이 잰 것: ${rules.map(r => r.msg).join(' / ')}
무슨 영상인지(내 설명): ${idea || '없음'}
알고리즘이 밀어 줄지 기준으로 냉정하게 평가해. JSON으로만: {"score":0~100,"one":"한 줄 총평","hook":{"score":0~10,"say":"첫 1~2초 평가와 고칠 법"},"good":["잘한 점" 2~3],"fix":[{"t":"몇 초 또는 전체","what":"문제","how":"구체적 고칠 법"}] 3~5개,"text":"화면에 넣으면 좋을 글자(훅 문구) 2개를 / 로","cover":장면 번호(0부터, 커버로 좋은 것),"sound":"어울리는 소리·음악 방향","length":"권하는 길이와 까닭","caption":"이 영상에 맞는 캡션 한 개(해시태그 포함)"}`;
  return gem([prompt, ...frames.map(f => ({ img: f.b64 }))], { json: true, temp: 0.4, ms: 60000 });
}
export async function readShot(images) {
  const prompt = `이 사진들은 인스타그램이나 틱톡의 인사이트(통계)·프로필 화면 캡처야. 보이는 숫자만 읽어서 JSON으로. 안 보이는 값은 null. 한국어 '만'·'천'·'K'·'M'은 숫자로 바꿔.
프로필 화면이면 격자에 보이는 조회수는 날짜를 모르니 posts에 넣지 마.
{"plat":"ig"|"tt","profile":{"followers":숫자,"following":숫자,"posts":숫자,"views30":"최근 30일 조회 숫자(보이면)"}|null,"posts":[{"kind":"reels"|"carousel"|"photo"|"video"|"story","date":"YYYY-MM-DD 또는 null","caption":"보이면 앞부분","views":n,"reach":n,"likes":n,"comments":n,"saves":n,"shares":n,"avgWatch":초,"dur":초,"follows":n}]}`;
  return gem([prompt, ...images.map(i => ({ img: i.b64, mime: i.mime }))], { json: true, temp: 0 });
}
export async function talk({ about, q, snapshot, history = [] }) {
  const prompt = `${ROLE(about)}
지금 계정 상태(앱이 잰 숫자): ${snapshot}
지난 대화: ${history.slice(-6).map(m => (m.me ? '나: ' : '매니저: ') + m.text).join('\n') || '없음'}
나: ${q}
매니저로서 답해. 5문장 안쪽, 필요하면 번호 목록. 숫자가 없어서 모르는 건 지어내지 말고 무엇을 채우면 알 수 있는지 말해.`;
  return gem([prompt], { temp: 0.7 });
}
export async function dailyLine({ about, snapshot, cards }) {
  const prompt = `${ROLE(about)}
오늘 아침 매니저로서 하진에게 건넬 첫마디를 두 문장으로. 오늘 가장 중요한 한 가지를 콕 집어. 숫자 근거: ${snapshot}. 오늘 할 일 후보: ${cards.slice(0, 5).map(c => c.title).join(' / ')}`;
  return gem([prompt], { temp: 0.8, ms: 20000 });
}
export async function plan({ about, snapshot, days = 7 }) {
  const prompt = `${ROLE(about)}
지금 계정 상태: ${snapshot}
앞으로 ${days}일 올릴 계획을 짜 줘. 콘텐츠는 하진 자신(얼굴·일상·스타일·작업)이야. 촬영 부담은 적게.
JSON으로만: {"items":[{"day":"월" 같은 요일,"plat":"ig"|"tt"|"both","kind":"reels"|"carousel"|"photo"|"story"|"video","idea":"무엇을 찍을지 한 줄","hook":"첫 1초에 할 말이나 장면","time":"올릴 시각 HH:MM"}]}`;
  return gem([prompt], { json: true, temp: 0.8 });
}
