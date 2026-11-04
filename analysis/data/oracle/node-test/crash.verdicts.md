| id | where | change | default | oracle |
|---|---|---|---|---|
| `424vqnce` | src/boot.js:1 | `process.env.ORACLE_CONFIG ?? '{"mode"...` → `process.env.ORACLE_CONFIG` | Killed (load-error) [static] | killed |
| `xy73ng73` | src/boot.js:1 | `process.env.ORACLE_CONFIG ?? '{"mode"...` → `process.env.ORACLE_CONFIG \|\| '{"mod...` | Survived [static] | survived |
| `1q7p1tzs` | src/boot.js:1 | `'{"mode":"test"}'` → `''` | Killed (load-error) [static] | killed |
| `sbj931tm` | src/boot.js:4 | `CONFIG.mode` → `undefined` | Killed (assertion) | killed |
| `5nbbr7jm` | src/hazards.js:2 | `code > 100` → `code >= 100` | Survived | survived |
| `qnee4fhc` | src/hazards.js:2 | `code > 100` → `code != 100` | Survived | survived |
| `bnw2zp6g` | src/hazards.js:2 | `code > 100` → `code > 101` | Survived | survived |
| `qaqjk1ta` | src/hazards.js:3 | `0` → `1` | NoCoverage | survived |
| `wx591560` | src/hazards.js:5 | `code` → `undefined` | Killed (assertion) | killed |
| `t8tvwwbe` | src/hazards.js:9 | `code > 100` → `code >= 100` | Killed (hook-error) | killed |
| `qqjr6zj3` | src/hazards.js:9 | `code > 100` → `code != 100` | Survived | survived |
| `6z4j4v7x` | src/hazards.js:9 | `code > 100` → `code > 101` | Survived | survived |
| `hzy82axy` | src/hazards.js:10 | `1` → `2` | NoCoverage | survived |
| `0j2wrfdx` | src/hazards.js:12 | `code` → `undefined` | Killed (assertion) | killed |
| `j858vss9` | src/hazards.js:16 | `0` → `1` | Killed (assertion) | killed |
| `4z052ndk` | src/hazards.js:17 | `0` → `1` | Survived | survived |
| `ycgvmy53` | src/hazards.js:17 | `index < count` → `index <= count` | Killed (assertion) | killed |
| `czgj1fh4` | src/hazards.js:17 | `index < count` → `false` | Killed (assertion) | killed |
| `skb65rw2` | src/hazards.js:18 | `total += index` → `total -= index` | Killed (assertion) | killed |
| `8srqzzb7` | src/hazards.js:25 | `left > 0` → `left >= 0` | Survived | survived |
| `6ad2kfev` | src/hazards.js:25 | `left > 0` → `left > 1` | Survived | survived |
| `eqs4cv1e` | src/hazards.js:26 | `await check()` → `true` | Survived | survived |
| `e4hvv3f6` | src/hazards.js:26 | `await check()` → `false` | Killed (assertion) | killed |
| `v9sm16ft` | src/hazards.js:26 | `await check()` → `check()` | Survived | survived |
| `v80nhth2` | src/hazards.js:27 | `true` → `false` | Killed (assertion) | killed |
| `9hrfa7tj` | src/hazards.js:31 | `false` → `true` | NoCoverage | survived |
| `wf5wserw` | src/hazards.js:35 | `count <= 0` → `count < 0` | Killed (assertion) | killed |
| `1xn1s8bm` | src/hazards.js:35 | `count <= 0` → `count == 0` | Survived | survived |
| `d5f72mfp` | src/hazards.js:35 | `count <= 0` → `count <= 1` | Killed (assertion) | killed |
| `mk50fha2` | src/hazards.js:35 | `0` → `1` | Killed (assertion) | killed |
| `wbw6xb71` | src/hazards.js:35 | `1 + depth(count - 1)` → `1 - depth(count - 1)` | Killed (assertion) | killed |
| `bny19hzh` | src/hazards.js:35 | `1` → `2` | Killed (assertion) | killed |
| `vge39vdq` | src/hazards.js:35 | `count - 1` → `count + 1` | Killed (assertion) | killed |
| `3hh0cbgx` | src/hazards.js:35 | `1` → `2` | Killed (assertion) | killed |
| `6cm2bm5g` | src/hazards.js:40 | `listener` → `true` | Killed (stray-error) | killed |
| `s8745j8p` | src/hazards.js:40 | `listener` → `false` | Survived | survived |
| `vcqe7m05` | src/hazards.js:48 | `value` → `true` | Survived | survived |
| `d2dn1btq` | src/hazards.js:48 | `value` → `false` | Killed (stray-error) | killed |
| `mbpbapqb` | src/hazards.js:51 | `value` → `undefined` | Killed (assertion) | killed |
| `ejehgjre` | src/hazards.js:55 | `[]` → `[undefined]` | Killed (assertion) | killed |
| `77yst5xb` | src/hazards.js:56 | `0` → `1` | Killed (assertion) | killed |
| `n4j9jy6e` | src/hazards.js:56 | `row < count` → `row <= count` | Killed (assertion) | killed |
| `wycafw01` | src/hazards.js:56 | `row < count` → `false` | Killed (assertion) | killed |
| `mxpc1030` | src/hazards.js:57 | `rows.push(new Array(width).fill(row))` → `;` | Killed (assertion) | killed |
| `eb0ye9vm` | src/hazards.js:63 | `verbose` → `true` | Survived | survived |
| `yf5a3jxz` | src/hazards.js:63 | `verbose` → `false` | Survived | survived |
| `q5dj703r` | src/hazards.js:64 | `0` → `1` | NoCoverage | survived |
| `n0wbkewm` | src/hazards.js:64 | `line < lines` → `line <= lines` | NoCoverage | survived |
| `x4r89a56` | src/hazards.js:64 | `line < lines` → `false` | NoCoverage | survived |
| `f8tfnk3r` | src/hazards.js:65 | ``line ${line} ${'x'.repeat(200)}`` → ``${line}${'x'.repeat(200)}`` | NoCoverage | survived |
| `rkp03xt5` | src/hazards.js:65 | `'x'` → `''` | NoCoverage | survived |
| `97xdc07j` | src/hazards.js:65 | `200` → `201` | NoCoverage | survived |
| `wfzfp36s` | src/hazards.js:68 | `lines` → `undefined` | Killed (assertion) | killed |
| `d12b0wm5` | src/hazards.js:72 | `[]` → `[undefined]` | Killed (assertion) | killed |
| `h30x6071` | src/hazards.js:73 | `0` → `1` | Killed (assertion) | killed |
| `zse6fcfe` | src/hazards.js:73 | `block < count` → `block <= count` | Killed (assertion) | killed |
| `nwwsd2nv` | src/hazards.js:73 | `block < count` → `false` | Killed (assertion) | killed |
| `r3asxhpv` | src/hazards.js:74 | `4 * 1024 * 1024` → `4 * 1024 / 1024` | Survived | survived |
| `8qs784mw` | src/hazards.js:74 | `4 * 1024` → `4 / 1024` | Survived | survived |
| `4jqez2jg` | src/hazards.js:74 | `4` → `5` | Survived | survived |
| `hmw26zdw` | src/hazards.js:74 | `1024` → `1025` | Survived | survived |
| `79amrkqj` | src/hazards.js:74 | `1024` → `1025` | Survived | survived |
