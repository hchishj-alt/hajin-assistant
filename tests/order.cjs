// node tests/order.cjs — 화면 코드에서 "값을 만들기 전에 그 값을 쓰는 함수를 먼저 부르는 곳"을 찾음
// (v1.15.0 비서 화면이 이 문제로 멈췄음: 지난 대화를 그리는 함수가 아래쪽 const 를 먼저 씀)
// 앱은 의존성이 없고, 이 점검만 개발 PC에 깔린 acorn 을 빌려 씀. 없으면 건너뜀.
let acorn; for (const m of ['acorn', '/opt/node-tools/node_modules/acorn']) { try { acorn = require(m); break; } catch { } }
if (!acorn) { console.log('acorn 이 없어서 순서 점검은 건너뜀'); process.exit(0); }
const fs = require('fs'), path = require('path');
const isFn = n => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
const kids = n => { const out = []; for (const k in n) { if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) for (const x of v) { if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
const patNames = (p, out) => { if (!p) return; if (p.type === 'Identifier') out.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => patNames(q.value || q.argument, out)); else if (p.type === 'ArrayPattern') p.elements.forEach(q => patNames(q, out)); else if (p.type === 'AssignmentPattern') patNames(p.left, out); else if (p.type === 'RestElement') patNames(p.argument, out); };
/* 노드 안에서 쓰인 이름. deep=false 면 안쪽 함수 본문은 건너뜀(바로 실행되는 것만) */
function refs(n, deep, out = new Set(), own = new Set()) {
  if (!n) return out;
  if (n.type === 'Identifier') { out.add(n.name); return out; }
  if (n.type === 'MemberExpression') { refs(n.object, deep, out, own); if (n.computed) refs(n.property, deep, out, own); return out; }
  if (n.type === 'Property') { if (n.computed) refs(n.key, deep, out, own); refs(n.value, deep, out, own); return out; }
  if (isFn(n)) { if (!deep) return out; }
  for (const c of kids(n)) refs(c, deep, out, own);
  return out;
}
/* 함수 안에서 스스로 만든 이름(매개변수·지역 변수) */
function locals(fn) { const s = new Set(); fn.params.forEach(p => patNames(p, s)); (function w(n) { if (!n) return; if (n.type === 'VariableDeclaration') n.declarations.forEach(d => patNames(d.id, s)); if (n.type === 'FunctionDeclaration' && n.id) s.add(n.id.name); if (n !== fn && isFn(n)) { n.params.forEach(p => patNames(p, s)); } kids(n).forEach(w); })(fn.body); return s; }
const hasAwait = n => { let f = false; (function w(x) { if (!x || f) return; if (x.type === 'AwaitExpression' || (x.type === 'ForOfStatement' && x.await)) { f = true; return; } if (isFn(x)) return; kids(x).forEach(w); })(n); return f; };

let total = 0;
function scanBody(file, body) {
  const stmts = body; const decl = new Map(); const fns = new Map();
  stmts.forEach((s, i) => {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach(d => { const ns = new Set(); patNames(d.id, ns); ns.forEach(n => decl.set(n, { i, line: s.loc.start.line })); });
    if (s.type === 'FunctionDeclaration' && s.id) fns.set(s.id.name, s);
  });
  if (!decl.size) return;
  /* 끌어올려진 함수가 (다른 끌어올려진 함수를 거쳐) 쓰는 바깥 이름 */
  const direct = new Map(); for (const [name, f] of fns) { const loc = locals(f); const r = refs(f.body, true); const out = new Set([...r].filter(x => !loc.has(x))); direct.set(name, out); }
  const closure = name => { const seen = new Set(), out = new Set(); (function go(n) { if (seen.has(n)) return; seen.add(n); for (const x of direct.get(n) || []) { out.add(x); if (fns.has(x)) go(x); } })(name); return out; };
  /* 뒤에 만들어지는 값을 쓰는 화살표 함수 상수(const f = () => …)도 함수처럼 다룸 */
  stmts.forEach((s, i) => { if (s.type === 'VariableDeclaration') s.declarations.forEach(d => { if (d.id.type === 'Identifier' && isFn(d.init)) { const loc = locals(d.init); direct.set(d.id.name, new Set([...refs(d.init.body, true)].filter(x => !loc.has(x)))); fns.set(d.id.name, d.init); } }); });
  let awaited = false;
  stmts.forEach((s, i) => {
    if (s.type === 'FunctionDeclaration') return;
    const now = new Set(); (function w(x) { if (!x || isFn(x)) return; if ((x.type === 'CallExpression' || x.type === 'NewExpression') && x.callee.type === 'Identifier') now.add(x.callee.name); kids(x).forEach(w); })(s); /* 이 줄에서 바로 부르는 것 */
    const later = refs(s, true);           /* 이 줄에서 걸어 두는 것(이벤트 등) */
    const report = (set, kind) => { for (const n of set) { if (!fns.has(n)) continue; const sd = decl.get(n); if (sd && sd.i > i) { if (kind === 'now') { total++; console.log(`BUG  ${file}:${s.loc.start.line} ${n}() 을 만들기 전에 부름 (만드는 줄 ${sd.line})`); } continue; }
      for (const x of closure(n)) { const d = decl.get(x); if (d && d.i > i && x !== n) { if (kind === 'later') { /* 사이에 기다림이 있어야 사용자가 누를 틈이 생김 */ let aw = false; for (let k = i; k < d.i; k++) if (stmts[k].type !== 'FunctionDeclaration' && hasAwait(stmts[k])) aw = true; if (!aw) continue; }
        total++; console.log(`${kind === 'now' ? 'BUG ' : 'risk'} ${file}:${s.loc.start.line} ${n}() → ${x} (만드는 줄 ${d.line})`); } } } };
    report(now, 'now');
    const onlyLater = new Set([...later].filter(x => !now.has(x))); report(onlyLater, 'later');
  });
}
function walk(file, n) { if (!n) return; if (isFn(n) && n.body.type === 'BlockStatement') scanBody(file, n.body.body); if (n.type === 'Program') scanBody(file, n.body); kids(n).forEach(c => walk(file, c)); }
const root = process.argv[2] || path.join(__dirname, '..');
for (const dir of ['js', 'modules']) for (const f of fs.readdirSync(path.join(root, dir)).sort()) { if (!f.endsWith('.js') || /^vendor-/.test(f)) continue; const p = path.join(root, dir, f); let ast; try { ast = acorn.parse(fs.readFileSync(p, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (e) { console.log('parse fail', p, e.message); continue; } walk(dir + '/' + f, ast); }
console.log(total ? `순서 문제 ${total}곳` : '순서 문제 없음'); process.exit(total ? 1 : 0);
