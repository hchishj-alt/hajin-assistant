// 앱을 고치고 싶을 때: 하고 싶은 말을 적으면 코딩 AI(GPT Codex 등)에 그대로 붙여 넣을 요청서를 만들어 줌.
// 비서는 코드를 직접 쓰지 못함 (규칙 기반이라). 대신 "어느 파일을, 어떤 규칙으로, 무엇을 확인하며" 고칠지 정리해 줌.
import * as db from './db.js';
import { VERSION } from './version.js';

export const REPO = 'hchishj-alt/hajin-assistant';
// 말에 나오는 낱말 → 관련 화면과 파일
const MAP = [
  [/오늘|메인|홈|첫\s*화면/, '오늘(메인)', ['modules/today.js', 'js/look.js']],
  [/비서|소머|채팅|말투|명령|알아듣/, '소머AI', ['modules/assistant.js', 'js/brain.js', 'js/query.js']],
  [/확인\s*대기|임시\s*항목|대기함/, '확인 대기함', ['modules/inbox.js', 'js/draftcard.js', 'js/store.js']],
  [/캘린더|일정|달력|구글/, '캘린더', ['modules/calendar.js', 'js/gcal.js', 'js/fields.js']],
  [/할\s*일|마감|체크/, '할 일', ['modules/tasks.js', 'js/fields.js']],
  [/회의록|녹음|받아쓰기|요약/, '회의록', ['modules/meetings.js', 'js/brain.js', 'js/voice.js', 'js/feedback.js']],
  [/마인드맵|노드|보드\s*회의/, '마인드맵 회의', ['modules/board.js']],
  [/기획|아이디어/, '기획 보드', ['modules/plan.js']],
  [/SNS|피드|게시글|인스타|트위터|유튜브|틱톡|썸네일|영상|편집|자막/i, 'SNS 스튜디오', ['modules/studio.js', 'modules/feed.js', 'js/video.js']],
  [/레퍼런스|핀터레스트|미리보기|링크/, '레퍼런스', ['modules/archive.js', 'js/linkpreview.js']],
  [/피그마|플러그인/, '피그마 정리', ['modules/figma.js', 'js/figma-api.js', 'figma-plugin/']],
  [/메신저|메시지|DM|답장/i, '메신저', ['modules/talk.js', 'js/dm.js', 'js/sync.js', 'supabase/setup.sql']],
  [/인맥|연락처|명함/, '인맥', ['modules/people.js']],
  [/팀|투표|조율|멤버/, '팀', ['modules/team.js', 'js/sync.js', 'js/admin.js']],
  [/비용|영수증|정산/, '비용 처리', ['modules/money.js']],
  [/구매|장바구니|엑셀|비품|가격/, '구매 목록', ['modules/shop.js', 'js/product.js', 'js/xlsx.js']],
  [/지원사업|랭킹|공고/, '정보 랭킹', ['modules/radar.js', 'scripts/', '.github/workflows/feed.yml']],
  [/꾸미기|테마|색|폰트|글씨|배경|둥글|투명/, '꾸미기', ['modules/look.js', 'js/look.js', 'js/theme.js', 'css/app.css']],
  [/관리자|권한|수정\s*기록|통계/, '관리자', ['modules/admin.js', 'js/admin.js']],
  [/동기화|로그인|코드|공유|실시간/, '동기화', ['js/sync.js', 'supabase/setup.sql', 'modules/settings.js']],
  [/중요도|라벨|색\s*관리/, '중요도 색', ['js/labels.js']],
  [/자동\s*분류|알아서|학습|피드백/, '자동 분류·학습', ['js/auto.js', 'js/feedback.js', 'js/brain.js']],
  [/알림|푸시|오프라인|설치|아이콘|업데이트/, '앱 껍데기', ['sw.js', 'manifest.webmanifest', 'js/app.js', 'index.html']],
  [/폰|모바일|아이패드|작은\s*화면|넘침|레이아웃|디자인|버튼|여백/, '화면 모양', ['css/app.css', 'js/ui.js']],
];
const KIND = [[/안\s*(돼|되|나와|떠|보여|열려)|오류|에러|버그|깨져|멈춰|이상해|틀려/, '버그 고치기'], [/추가|만들어|넣어|새로|있으면|기능/, '기능 추가'], [/바꿔|고쳐|수정|옮겨|크게|작게|줄여|늘려|빼|없애/, '고치기']];

export function analyze(text) {
  const hits = MAP.filter(([re]) => re.test(text));
  const files = [...new Set(hits.flatMap(h => h[2]))];
  return { kind: (KIND.find(([re]) => re.test(text)) || [, '고치기'])[1], areas: hits.map(h => h[1]), files: files.length ? files : ['js/app.js', 'css/app.css'], needsDb: /메신저|공유|동기화|실시간|멤버|권한/.test(text) };
}

export async function build(text, { route = location.hash, extra = '' } = {}) {
  const a = analyze(text);
  let errs = []; try { errs = (await db.kvGet('errors', [])).slice(-3).map(e => `- ${e.msg || e}`); } catch { }
  const title = text.split('\n')[0].trim().slice(0, 60);
  const body = [
    `# ${a.kind}: ${title}`, '',
    '## 하고 싶은 것', text.trim(), extra ? '\n' + extra.trim() : '', '',
    '## 앱 정보',
    `- 저장소: ${REPO} (정적 PWA, 빌드 없음, 순수 ES 모듈). 먼저 저장소의 AGENTS.md를 읽고 그 규칙을 따를 것.`,
    `- 지금 버전: ${VERSION}`, `- 요청할 때 보고 있던 화면: ${route || '#/today'}`,
    `- 관련 화면: ${a.areas.join(', ') || '(자동으로 못 찾음. AGENTS.md의 파일 지도를 볼 것)'}`,
    '', '## 먼저 볼 파일', ...a.files.map(f => `- ${f}`),
    '', '## 지켜야 할 것',
    '- 프레임워크·번들러·npm 의존성을 추가하지 말 것. 기존 js/ui.js의 h(), modal(), form() 같은 도우미를 쓸 것.',
    '- 화면 글은 쉬운 한국어. 새 색·크기는 css/app.css의 변수(--fs, --rd, --bw, --acc 등)를 써서 꾸미기 설정이 그대로 먹게 할 것.',
    '- 폰(390px)에서 가로 넘침이 없고, 누르는 곳은 44px 이상일 것.',
    '- 새 파일을 만들면 sw.js의 캐시 목록에 넣고, js/version.js와 sw.js의 VERSION을 같이 올릴 것.',
    '- 비밀 키, 멤버 코드, DB 비밀번호를 코드나 커밋에 넣지 말 것. js/config.js에는 공개(publishable) 키만.',
    a.needsDb ? '- 서버 표나 규칙이 바뀌면 supabase/setup.sql에 "다시 실행해도 안전한" 형태로 추가하고, 내가 SQL Editor에서 실행해야 한다고 알려 줄 것.' : '',
    '', '## 다 됐는지 확인',
    '- 바꾼 화면을 넓은 화면과 폰 크기에서 열어 오류(console)가 없는지 확인.',
    '- 설정 → 자가 점검을 열어 모두 통과하는지 확인.',
    '- 무엇을 어느 파일에서 바꿨는지, 내가 직접 해야 하는 일이 있는지 한국어로 짧게 정리.',
    errs.length ? '\n## 최근 앱 오류 기록\n' + errs.join('\n') : '',
  ].filter(l => l !== '').join('\n').replace(/\n(## )/g, '\n\n$1');
  return { title: `${a.kind}: ${title}`, body, ...a };
}
export const issueUrl = r => `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(r.title)}&body=${encodeURIComponent(r.body.slice(0, 6000))}`;
export async function save(text, r) { return db.put('devreqs', { text, title: r.title, body: r.body, status: '요청 전' }); }

// 이 앱에서 안 되는 것과 대신 쓰는 방법 (솔직하게)
export const LIMITS = [
  ['소머AI가 코드를 직접 짜기', '소머AI는 규칙으로 움직여서 코드를 만들지 못해요.', '여기서 요청서를 만들어 GPT Codex에 붙여 넣으면 Codex가 저장소를 고쳐요.'],
  ['사람처럼 자유롭게 대화하는 AI', '무료·오프라인이라 큰 AI 모델이 없어요. 정해진 말 종류만 알아들어요.', '자주 쓰는 말은 피드백으로 학습시키고, 긴 글 정리는 ChatGPT에 맡긴 뒤 결과를 붙여 넣어요.'],
  ['앱을 닫아도 오는 푸시 알림', '무료 구성에는 알림을 대신 보내 줄 서버가 없어요. 아이폰은 홈 화면에 설치해야만 알림이 돼요.', '일정은 구글 캘린더 연동으로 구글 알림을 받고, 메신저는 앱이 열려 있을 때 바로 알려요.'],
  ['인스타·X·유튜브에 바로 올리기', '각 회사의 심사받은 유료·사업자용 연결이 필요해요.', '"올릴 준비"로 크기 맞춘 사진과 글을 만들고, 폰 공유 창에서 앱으로 넘겨요.'],
  ['구글 캘린더와 양쪽 실시간 맞추기', '구글 로그인 심사와 서버가 필요해요.', '내 일정 → 구글은 구독 주소로 자동, 구글 → 여기는 .ics 가져오기로 해요. 구글이 읽는 간격은 몇 시간이에요.'],
  ['쇼핑몰 링크에서 가격을 항상 읽기', '쿠팡 등 일부 몰은 자동 읽기를 막아요.', '이름·가격·사진 주소를 직접 고칠 수 있고, 사진은 "이미지 주소 복사"로 넣어요.'],
  ['핀터레스트·인스타 페이지 주소의 미리보기', '로그인 벽 때문에 페이지 주소로는 사진을 못 읽을 때가 있어요.', '사진을 우클릭해서 "이미지 주소 복사"한 링크를 넣으면 떠요.'],
  ['음성 받아쓰기(모든 브라우저)', '브라우저에 들어 있는 기능을 써서 크롬·사파리에서만 되고, 정확도는 기기에 달려 있어요.', '안 되는 기기에서는 글로 적거나, 폰 키보드의 받아쓰기를 써요.'],
  ['캡컷 수준의 영상 편집', '브라우저에서는 긴 영상·여러 겹 효과·빠른 내보내기가 어려워요. 내보내기는 실제 재생 시간만큼 걸려요.', '짧은 릴스용 컷·자막·배경음·썸네일까지만 하고, 긴 편집은 캡컷에서 해요.'],
  ['유행 음악·저작권 걱정 없는 음원 자동 추천', '음원 회사 목록을 무료로 읽을 길이 없어요.', '유튜브 오디오 보관함 같은 무료 음원 사이트로 가는 바로가기를 쓰고, 받은 파일을 넣어요.'],
  ['자막 자동 번역', '번역 AI는 유료이거나 서버가 필요해요.', '자막을 복사해 파파고·ChatGPT에서 번역한 뒤 다시 붙여 넣어요.'],
  ['기기끼리 사진·영상 원본 맞추기', '무료 저장 공간이 1GB라 큰 파일은 기기에만 둬요.', '레퍼런스·게시글 사진은 줄여서 올리고, 영상 원본은 드라이브에 두고 링크만 저장해요.'],
  ['피그마 파일을 앱에서 직접 고치기', '웹에서는 피그마 파일을 읽기만 할 수 있어요.', '함께 들어 있는 피그마 플러그인으로 레이어 정리와 이름 붙이기를 해요.'],
  ['멤버가 아주 많아지는 경우', '무료 서버는 동시 접속 200명, 저장 500MB까지예요. 일주일 안 쓰면 잠들어요.', '팀 규모에서는 충분하고, 잠들지 않게 매일 한 번 깨우는 자동 작업을 넣어 뒀어요.'],
];
