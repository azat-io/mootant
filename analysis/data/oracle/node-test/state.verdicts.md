| id | where | change | default | oracle |
|---|---|---|---|---|
| `rwe5wp8h` | src/counter.js:1 | `0` → `1` | Survived [static] | survived |
| `09w15scc` | src/counter.js:4 | `count = 0` → `;` | Survived | survived |
| `46xfa4e7` | src/counter.js:4 | `0` → `1` | Killed (assertion) | killed |
| `0zzzfjvt` | src/counter.js:7 | `1` → `2` | Killed (assertion) | killed |
| `x9ahzmww` | src/counter.js:8 | `count += step` → `count -= step` | Killed (assertion) | killed |
| `m7a3zaev` | src/counter.js:9 | `count` → `0` | Killed (assertion) | killed |
| `twzenj03` | src/memo.js:4 | `n < 2` → `n <= 2` | Killed (assertion) | killed |
| `pza07e73` | src/memo.js:4 | `n < 2` → `n != 2` | Killed (assertion) | killed |
| `ggy3hknz` | src/memo.js:4 | `n < 2` → `n < 1` | Killed (assertion) | killed |
| `w5mecyr1` | src/memo.js:5 | `n` → `undefined` | Killed (assertion) | killed |
| `01hdhec3` | src/memo.js:7 | `memo.has(n)` → `true` | Killed (assertion) | killed |
| `prd6tx8n` | src/memo.js:7 | `memo.has(n)` → `false` | Timeout (hit-limit) | survived |
| `9aj6pn3a` | src/memo.js:8 | `memo.get(n)` → `undefined` | Killed (assertion) | killed |
| `9mftec61` | src/memo.js:10 | `fib(n - 1) + fib(n - 2)` → `fib(n - 1)` | Killed (assertion) | killed |
| `bvgv40kb` | src/memo.js:10 | `n - 1` → `n + 1` | Killed (assertion) | killed |
| `85fey620` | src/memo.js:10 | `1` → `2` | Killed (assertion) | killed |
| `w9a6r2hb` | src/memo.js:10 | `n - 2` → `n + 2` | Killed (assertion) | killed |
| `kjjfy223` | src/memo.js:10 | `2` → `3` | Killed (assertion) | killed |
| `jngxgvvz` | src/memo.js:11 | `memo.set(n, value)` → `;` | Timeout (hit-limit) | survived |
| `65yctrxj` | src/registry.js:1 | `globalThis.__oracleRegistry ??= []` → `globalThis.__oracleRegistry = []` | Survived [static] | survived |
| `vh252wmh` | src/registry.js:1 | `globalThis.__oracleRegistry ??= []` → `globalThis.__oracleRegistry` | Killed (assertion) [static] | killed |
| `3ng2xh7x` | src/registry.js:1 | `[]` → `[undefined]` | Killed (assertion) [static] | killed |
| `gbyg7307` | src/registry.js:4 | `!globalThis.__oracleRegistry.includes...` → `true` | Killed (assertion) | killed |
| `g1t0eyzt` | src/registry.js:4 | `!globalThis.__oracleRegistry.includes...` → `false` | Killed (assertion) | killed |
| `13w8ghsk` | src/registry.js:7 | `globalThis.__oracleRegistry.length` → `0` | Killed (assertion) | killed |
| `58nbfkne` | src/registry.js:11 | `process.env.ORACLE_LIMIT ?? '5'` → `process.env.ORACLE_LIMIT` | Survived | survived |
| `byc65nq1` | src/registry.js:11 | `process.env.ORACLE_LIMIT ?? '5'` → `process.env.ORACLE_LIMIT \|\| '5'` | Survived | survived |
| `khbvr22p` | src/registry.js:11 | `'5'` → `''` | NoCoverage | survived |
| `krb87ct2` | src/registry.js:14 | `!Array.prototype.oracleLast` → `true` | Survived [static] | survived |
| `tmj05hgs` | src/registry.js:14 | `!Array.prototype.oracleLast` → `false` | Killed (assertion) [static] | killed |
| `7v2cmmnv` | src/registry.js:15 | `'oracleLast'` → `''` | Killed (assertion) [static] | killed |
| `rp8ennyr` | src/registry.js:17 | `this.length - 1` → `this.length + 1` | Killed (assertion) | killed |
| `0zkd32jk` | src/registry.js:17 | `1` → `2` | Killed (assertion) | killed |
| `q6zjqxwq` | src/registry.js:19 | `true` → `false` | Survived [static] | survived |
| `7kq6qzrd` | src/seen.js:4 | `seen.clear()` → `;` | Survived | survived |
| `2nde6pq8` | src/seen.js:8 | `seen.has(id)` → `true` | Killed (assertion) | killed |
| `33vsyqjb` | src/seen.js:8 | `seen.has(id)` → `false` | Survived | survived |
| `7tja3rd5` | src/seen.js:9 | `false` → `true` | NoCoverage | survived |
| `6he1q3eq` | src/seen.js:11 | `seen.add(id)` → `;` | Survived | survived |
| `t7es8e1w` | src/seen.js:12 | `true` → `false` | Killed (assertion) | killed |
