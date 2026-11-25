// 비밀 값 검사: 저장소에 secret 키·토큰이 들어갔는지 찾아요. `node tests/secrets.mjs`
// 걸리면 0이 아닌 코드로 끝나서 자동 실행(security.yml)이 빨간불이 돼요.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIR = new Set(['.git', 'node_modules']);
const SKIP_FILE = /^(js\/vendor-.*\.js|figma-plugin\.zip|tests\/secrets\.mjs)$/;
const RULES = [
  ['Supabase secret 키', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['JWT(service_role일 수 있음)', /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['Google API 키', /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI 키', /sk-[A-Za-z0-9]{32,}/],
  ['Anthropic 키', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['GitHub 토큰', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Figma 토큰', /figd_[A-Za-z0-9_-]{20,}/],
  ['포트원 시크릿처럼 보이는 값', /(api_?secret|webhook_?secret)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{20,}['"]/i],
  ['개인 키 파일', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name), rel = p.replace(/^\.\//, '');
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (SKIP_FILE.test(rel) || st.size > 2_000_000) continue;
    let text; try { text = readFileSync(p, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;
    text.split('\n').forEach((line, i) => {
      for (const [label, re] of RULES) if (re.test(line)) hits.push(`${rel}:${i + 1}  ${label}`);
    });
  }
}
walk('.');
if (hits.length) { console.error('비밀 값처럼 보이는 것이 있어요:\n' + hits.join('\n')); process.exit(1); }
console.log('비밀 값 검사 통과');
