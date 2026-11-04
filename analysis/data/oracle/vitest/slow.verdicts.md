| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `82cmm02j` | src/retry.js:1 | `3` → `4` | Survived | Survived [batch-survivor] | survived |
| `bagh1yfb` | src/retry.js:1 | `10` → `11` | Survived | Survived [batch-survivor] | survived |
| `8wqrx8cn` | src/retry.js:2 | `0` → `1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `22gm282g` | src/retry.js:2 | `attempt < attempts` → `attempt <= attempts` | Survived | Survived [batch-survivor] | survived |
| `tr0vqedx` | src/retry.js:2 | `attempt < attempts` → `attempt != attempts` | Survived | Survived [batch-survivor] | survived |
| `bwk9nyfm` | src/retry.js:2 | `attempt < attempts` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `y6azxg47` | src/retry.js:2 | `attempt++` → `attempt--` | Survived | Survived [batch-survivor] | survived |
| `2ne2q4n8` | src/retry.js:4 | `await task(attempt)` → `task(attempt)` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `hdz4fv9c` | src/retry.js:4 | `await task(attempt)` → `undefined` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `9trb33kh` | src/retry.js:6 | `Math.min(base * 2 ** attempt, 1000)` → `Math.max(base * 2 ** attempt, 1000)` | Timeout (time-limit) | Timeout (time-limit) [batch] | survived |
| `vzw976kf` | src/retry.js:6 | `base * 2 ** attempt` → `base / 2 ** attempt` | Survived | Survived [batch-survivor] | survived |
| `p1pmctv7` | src/retry.js:6 | `2 ** attempt` → `(2 * attempt)` | Survived | Survived [batch-survivor] | survived |
| `c3y4warx` | src/retry.js:6 | `2` → `3` | Survived | Survived [batch-survivor] | survived |
| `1yz35m0j` | src/retry.js:6 | `1000` → `1001` | Survived | Survived [batch-survivor] | survived |
| `53mpqnvx` | src/retry.js:7 | `await new Promise(resolve => {⏎      ...` → `new Promise(resolve => {⏎      setTim...` | Survived | Survived [batch-survivor] | survived |
| `2rqf9mht` | src/retry.js:7 | `await new Promise(resolve => {⏎      ...` → `;` | Survived | Survived [batch-survivor] | survived |
| `c54q4t9c` | src/retry.js:8 | `setTimeout(resolve, delay)` → `;` | Timeout (time-limit) | Timeout (time-limit) [recovery] | killed-timeout |
| `zh4fry12` | src/retry.js:11 | `throw new Error('gave up')` → `;` | NoCoverage | NoCoverage | survived |
| `8172hqvv` | src/retry.js:16 | `left > 0` → `left >= 0` | Survived | Survived [batch-survivor] | survived |
| `0x43029n` | src/retry.js:16 | `left > 0` → `left != 0` | Survived | Survived [batch-survivor] | survived |
| `vfg3hmrh` | src/retry.js:16 | `left > 0` → `left > 1` | Survived | Survived [batch-survivor] | survived |
| `5x3bkhwc` | src/retry.js:17 | `await new Promise(resolve => {⏎      ...` → `new Promise(resolve => {⏎      setTim...` | Survived | Survived [batch-survivor] | survived |
| `r23021q0` | src/retry.js:17 | `await new Promise(resolve => {⏎      ...` → `;` | Survived | Survived [batch-survivor] | survived |
| `ytg8ja3g` | src/retry.js:18 | `setTimeout(resolve, 1)` → `;` | Timeout (time-limit) | Timeout (time-limit) [recovery] | killed-timeout |
| `6nb7t7bq` | src/retry.js:20 | `left--` → `;` | Timeout (time-limit) | Timeout (time-limit) [recovery] | killed-timeout |
| `05ztzkkx` | src/retry.js:20 | `left--` → `left++` | Timeout (time-limit) | Timeout (time-limit) [recovery] | killed-timeout |
| `anysb77k` | src/retry.js:22 | `items.length` → `0` | Killed (assertion) | Killed (assertion) [recovery] | killed |
