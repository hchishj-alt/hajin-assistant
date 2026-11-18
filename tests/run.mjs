// node tests/run.mjs — 두뇌 자가 점검 (앱 안 "자가 점검"과 같은 시나리오)
import { run } from '../js/selftest.js';
const r = run();
let fail = 0;
for (const x of r) { if (!x.ok) fail++; console.log(`${x.ok ? '✓' : '✗'} [${x.group}] ${x.name} — ${x.detail}`); }
console.log(`\n${r.length - fail}/${r.length} 통과`);
process.exit(fail ? 1 : 0);
