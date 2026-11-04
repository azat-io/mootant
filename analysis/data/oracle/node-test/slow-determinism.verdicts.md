| id | where | change | default | det-1 | det-2 | det-3 | det-c1 | oracle |
|---|---|---|---|---|---|---|---|---|
| `82cmm02j` | src/retry.js:1 | `3` → `4` | Survived | Survived | Survived | Survived | Survived | survived |
| `bagh1yfb` | src/retry.js:1 | `10` → `11` | Survived | Survived | Survived | Survived | Survived | survived |
| `8wqrx8cn` | src/retry.js:2 | `0` → `1` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `22gm282g` | src/retry.js:2 | `attempt < attempts` → `attempt <= attempts` | Survived | Survived | Survived | Survived | Survived | survived |
| `tr0vqedx` | src/retry.js:2 | `attempt < attempts` → `attempt != attempts` | Survived | Survived | Survived | Survived | Survived | survived |
| `bwk9nyfm` | src/retry.js:2 | `attempt < attempts` → `false` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `y6azxg47` | src/retry.js:2 | `attempt++` → `attempt--` | Survived | Survived | Survived | Survived | Survived | survived |
| `2ne2q4n8` | src/retry.js:4 | `await task(attempt)` → `task(attempt)` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `hdz4fv9c` | src/retry.js:4 | `await task(attempt)` → `undefined` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `9trb33kh` | src/retry.js:6 | `Math.min(base * 2 ** attempt, 1000)` → `Math.max(base * 2 ** attempt, 1000)` | Survived | Timeout (hang) | Timeout (hang) | Timeout (hang) | Timeout (hang) | survived |
| `vzw976kf` | src/retry.js:6 | `base * 2 ** attempt` → `base / 2 ** attempt` | Survived | Survived | Survived | Survived | Survived | survived |
| `p1pmctv7` | src/retry.js:6 | `2 ** attempt` → `(2 * attempt)` | Survived | Survived | Survived | Survived | Survived | survived |
| `c3y4warx` | src/retry.js:6 | `2` → `3` | Survived | Survived | Survived | Survived | Survived | survived |
| `1yz35m0j` | src/retry.js:6 | `1000` → `1001` | Survived | Survived | Survived | Survived | Survived | survived |
| `53mpqnvx` | src/retry.js:7 | `await new Promise(resolve => {⏎      ...` → `new Promise(resolve => {⏎      setTim...` | Survived | Survived | Survived | Survived | Survived | survived |
| `2rqf9mht` | src/retry.js:7 | `await new Promise(resolve => {⏎      ...` → `;` | Survived | Survived | Survived | Survived | Survived | survived |
| `c54q4t9c` | src/retry.js:8 | `setTimeout(resolve, delay)` → `;` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `zh4fry12` | src/retry.js:11 | `throw new Error('gave up')` → `;` | NoCoverage | NoCoverage | NoCoverage | NoCoverage | NoCoverage | survived |
| `8172hqvv` | src/retry.js:16 | `left > 0` → `left >= 0` | Survived | Survived | Survived | Survived | Survived | survived |
| `0x43029n` | src/retry.js:16 | `left > 0` → `left != 0` | Survived | Survived | Survived | Survived | Survived | survived |
| `vfg3hmrh` | src/retry.js:16 | `left > 0` → `left > 1` | Survived | Survived | Survived | Survived | Survived | survived |
| `5x3bkhwc` | src/retry.js:17 | `await new Promise(resolve => {⏎      ...` → `new Promise(resolve => {⏎      setTim...` | Survived | Survived | Survived | Survived | Survived | survived |
| `r23021q0` | src/retry.js:17 | `await new Promise(resolve => {⏎      ...` → `;` | Survived | Survived | Survived | Survived | Survived | survived |
| `ytg8ja3g` | src/retry.js:18 | `setTimeout(resolve, 1)` → `;` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
| `6nb7t7bq` | src/retry.js:20 | `left--` → `;` | Timeout (hang) | Timeout (hang) | Timeout (hang) | Timeout (hang) | Timeout (hang) | timeout |
| `05ztzkkx` | src/retry.js:20 | `left--` → `left++` | Timeout (hang) | Timeout (hang) | Timeout (hang) | Timeout (hang) | Timeout (hang) | timeout |
| `anysb77k` | src/retry.js:22 | `items.length` → `0` | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | Killed (assertion) | killed |
