| id | where | change | default | fast | strict | strict-fast | oracle |
|---|---|---|---|---|---|---|---|
| `424vqnce` | src/boot.js:1 | `process.env.ORACLE_CONFIG ?? '{"mode"...` → `process.env.ORACLE_CONFIG` | Killed (load-error) [static] | Killed (load-error) [static] | Killed (load-error) [static] | Killed (load-error) [static] | killed |
| `xy73ng73` | src/boot.js:1 | `process.env.ORACLE_CONFIG ?? '{"mode"...` → `process.env.ORACLE_CONFIG \|\| '{"mod...` | Survived [static] | Survived [static] | Survived [static] | Survived [static] | survived |
| `1q7p1tzs` | src/boot.js:1 | `'{"mode":"test"}'` → `''` | Killed (load-error) [static] | Killed (load-error) [static] | Killed (load-error) [static] | Killed (load-error) [static] | killed |
| `sbj931tm` | src/boot.js:4 | `CONFIG.mode` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `5nbbr7jm` | src/hazards.js:2 | `code > 100` → `code >= 100` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `qnee4fhc` | src/hazards.js:2 | `code > 100` → `code != 100` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `bnw2zp6g` | src/hazards.js:2 | `code > 100` → `code > 101` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `qaqjk1ta` | src/hazards.js:3 | `0` → `1` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `wx591560` | src/hazards.js:5 | `code` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `t8tvwwbe` | src/hazards.js:9 | `code > 100` → `code >= 100` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `qqjr6zj3` | src/hazards.js:9 | `code > 100` → `code != 100` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `6z4j4v7x` | src/hazards.js:9 | `code > 100` → `code > 101` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `hzy82axy` | src/hazards.js:10 | `1` → `2` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `0j2wrfdx` | src/hazards.js:12 | `code` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `j858vss9` | src/hazards.js:16 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `4z052ndk` | src/hazards.js:17 | `0` → `1` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `ycgvmy53` | src/hazards.js:17 | `index < count` → `index <= count` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `czgj1fh4` | src/hazards.js:17 | `index < count` → `false` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ffwnjee3` | src/hazards.js:17 | `index < count` → `index != count` | — | — | Survived | Survived [batch-survivor] | survived |
| `mqzeg79s` | src/hazards.js:17 | `index++` → `index--` | — | — | Timeout (hit-limit) | Timeout (hit-limit) [batch] | timeout |
| `skb65rw2` | src/hazards.js:18 | `total += index` → `total -= index` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `e38kwzj5` | src/hazards.js:18 | `total += index` → `;` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
| `r17c4s1c` | src/hazards.js:20 | `total` → `undefined` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
| `8srqzzb7` | src/hazards.js:25 | `left > 0` → `left >= 0` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `6ad2kfev` | src/hazards.js:25 | `left > 0` → `left > 1` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `x99m3v0d` | src/hazards.js:25 | `left > 0` → `left != 0` | — | — | Survived | Survived [batch-survivor] | survived |
| `eqs4cv1e` | src/hazards.js:26 | `await check()` → `true` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `e4hvv3f6` | src/hazards.js:26 | `await check()` → `false` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `v9sm16ft` | src/hazards.js:26 | `await check()` → `check()` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `v80nhth2` | src/hazards.js:27 | `true` → `false` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `zycnkcrx` | src/hazards.js:29 | `left--` → `;` | — | — | Survived | Survived [batch-survivor] | survived |
| `ptq7g0ws` | src/hazards.js:29 | `left--` → `left++` | — | — | Survived | Survived [batch-survivor] | survived |
| `9hrfa7tj` | src/hazards.js:31 | `false` → `true` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `wf5wserw` | src/hazards.js:35 | `count <= 0` → `count < 0` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `1xn1s8bm` | src/hazards.js:35 | `count <= 0` → `count == 0` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `d5f72mfp` | src/hazards.js:35 | `count <= 0` → `count <= 1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `d256jfmb` | src/hazards.js:35 | `count <= 0 ? 0 : 1 + depth(count - 1)` → `undefined` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
| `mk50fha2` | src/hazards.js:35 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wbw6xb71` | src/hazards.js:35 | `1 + depth(count - 1)` → `1 - depth(count - 1)` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `bny19hzh` | src/hazards.js:35 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `vge39vdq` | src/hazards.js:35 | `count - 1` → `count + 1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `3hh0cbgx` | src/hazards.js:35 | `1` → `2` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `3eqeqa3a` | src/hazards.js:39 | `queueMicrotask(() => {⏎    if (listen...` → `;` | — | — | Survived | Survived [batch-survivor] | survived |
| `6cm2bm5g` | src/hazards.js:40 | `listener` → `true` | Killed (stray-error) | Killed (stray-error) [doubtful] | Killed (stray-error) | Killed (stray-error) [doubtful] | killed |
| `s8745j8p` | src/hazards.js:40 | `listener` → `false` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `vcqe7m05` | src/hazards.js:48 | `value` → `true` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `d2dn1btq` | src/hazards.js:48 | `value` → `false` | Killed (stray-error) | Killed (stray-error) [doubtful] | Killed (stray-error) | Killed (stray-error) [doubtful] | killed |
| `mbpbapqb` | src/hazards.js:51 | `value` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ejehgjre` | src/hazards.js:55 | `[]` → `[undefined]` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `77yst5xb` | src/hazards.js:56 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `n4j9jy6e` | src/hazards.js:56 | `row < count` → `row <= count` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `wycafw01` | src/hazards.js:56 | `row < count` → `false` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cpbcnwbn` | src/hazards.js:56 | `row < count` → `row != count` | — | — | Survived | Survived [batch-survivor] | survived |
| `s4b8m9bv` | src/hazards.js:56 | `row++` → `row--` | — | — | Timeout (hit-limit) | Timeout (hit-limit) [batch] | timeout |
| `mxpc1030` | src/hazards.js:57 | `rows.push(new Array(width).fill(row))` → `;` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `7k2qyq13` | src/hazards.js:59 | `rows.length` → `0` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
| `eb0ye9vm` | src/hazards.js:63 | `verbose` → `true` | Survived | Timeout (hit-limit) [batch] | Survived | Timeout (hit-limit) [batch] | survived |
| `yf5a3jxz` | src/hazards.js:63 | `verbose` → `false` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `q5dj703r` | src/hazards.js:64 | `0` → `1` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `n0wbkewm` | src/hazards.js:64 | `line < lines` → `line <= lines` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `x4r89a56` | src/hazards.js:64 | `line < lines` → `false` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `v4d5821a` | src/hazards.js:64 | `line < lines` → `line != lines` | — | — | NoCoverage | NoCoverage | survived |
| `4gg3wcaf` | src/hazards.js:64 | `line++` → `line--` | — | — | NoCoverage | NoCoverage | survived |
| `40ny8ajf` | src/hazards.js:65 | `console.log(`line ${line} ${'x'.repea...` → `;` | — | — | NoCoverage | NoCoverage | survived |
| `f8tfnk3r` | src/hazards.js:65 | ``line ${line} ${'x'.repeat(200)}`` → ``${line}${'x'.repeat(200)}`` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `rkp03xt5` | src/hazards.js:65 | `'x'` → `''` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `97xdc07j` | src/hazards.js:65 | `200` → `201` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `wfzfp36s` | src/hazards.js:68 | `lines` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `d12b0wm5` | src/hazards.js:72 | `[]` → `[undefined]` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `h30x6071` | src/hazards.js:73 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `zse6fcfe` | src/hazards.js:73 | `block < count` → `block <= count` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `nwwsd2nv` | src/hazards.js:73 | `block < count` → `false` | Killed (assertion) | Killed (assertion) [batch] | Killed (assertion) | Killed (assertion) [batch] | killed |
| `92etgt13` | src/hazards.js:73 | `block < count` → `block != count` | — | — | Survived | Survived [batch-survivor] | survived |
| `gt34y7x6` | src/hazards.js:73 | `block++` → `block--` | — | — | Killed (crash) | Killed (crash) [doubtful] | killed |
| `w83enk2r` | src/hazards.js:74 | `blocks.push(new Array(4 * 1024 * 1024...` → `;` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
| `r3asxhpv` | src/hazards.js:74 | `4 * 1024 * 1024` → `4 * 1024 / 1024` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `8qs784mw` | src/hazards.js:74 | `4 * 1024` → `4 / 1024` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `4jqez2jg` | src/hazards.js:74 | `4` → `5` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `hmw26zdw` | src/hazards.js:74 | `1024` → `1025` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `79amrkqj` | src/hazards.js:74 | `1024` → `1025` | Survived | Survived [batch-survivor] | Survived | Survived [batch-survivor] | survived |
| `r3e8bq98` | src/hazards.js:76 | `blocks.length` → `0` | — | — | Killed (assertion) | Killed (assertion) [batch] | killed |
