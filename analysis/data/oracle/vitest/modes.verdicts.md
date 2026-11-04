| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `xbctjwv9` | src/format.js:2 | ``$${(cents / 100).toFixed(2)}`` → ``${(cents / 100).toFixed(2)}`` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `x68gzxj2` | src/format.js:2 | `cents / 100` → `cents * 100` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `bat4nwvs` | src/format.js:2 | `100` → `101` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `x0qwg5ft` | src/format.js:2 | `2` → `3` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `c9zdz6cv` | src/format.js:7 | `setTimeout(resolve, ms)` → `;` | Timeout (time-limit) | Timeout (time-limit) [batch] | killed-timeout |
| `h4ay9v55` | src/format.js:11 | `3` → `4` | NoCoverage | NoCoverage | survived |
| `3fa3g7j8` | src/format.js:13 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `282dtfjk` | src/format.js:13 | `attempt < attempts` → `attempt <= attempts` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `zm7b8azr` | src/format.js:13 | `attempt < attempts` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `3gta7dgd` | src/format.js:15 | `await task(attempt)` → `task(attempt)` | Survived | Survived [batch-survivor] | survived |
| `9pxmzdtx` | src/format.js:17 | `lastError = error` → `;` | Survived | Survived [batch-survivor] | survived |
| `0mhhc82d` | src/format.js:20 | `throw lastError` → `;` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ps0v4syk` | src/format.js:24 | `count === 1` → `count <= 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `nrk292nt` | src/format.js:24 | `count === 1` → `count >= 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cf7bk1fq` | src/format.js:24 | `count === 1` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `p3483dcs` | src/format.js:24 | ``${word}s`` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `xh8g5whf` | src/format.js:28 | `[]` → `[undefined]` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `4yqevy61` | src/format.js:29 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `x90jyavh` | src/format.js:29 | `index < count` → `index <= count` | Killed (assertion) | Killed (assertion) [batch] | survived |
| `mtxm0zsd` | src/format.js:29 | `index < count` → `false` | Survived | Survived [batch-survivor] | survived |
| `pg60nfc8` | src/format.js:30 | `values.push(index)` → `;` | Survived | Survived [batch-survivor] | survived |
