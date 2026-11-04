| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `0swmyqec` | src/cli.js:3 | `process.argv.slice(2)` → `process.argv` | NoCoverage | NoCoverage | killed |
| `jzwjemtt` | src/cli.js:3 | `2` → `3` | NoCoverage | NoCoverage | killed |
| `wc2dv0zj` | src/cli.js:4 | `console.log(String(scale(value, facto...` → `;` | NoCoverage | NoCoverage | killed |
| `pz3vjm44` | src/legacy.cjs:2 | `Math.min(high, Math.max(low, value))` → `Math.max(high, Math.max(low, value))` | NoCoverage | NoCoverage | killed |
| `217j5vwz` | src/legacy.cjs:2 | `Math.max(low, value)` → `Math.min(low, value)` | NoCoverage | NoCoverage | killed |
| `5xcnmns9` | src/legacy.cjs:5 | `module.exports = { clamp }` → `;` | NoCoverage | NoCoverage | killed |
| `f99hstzg` | src/legacy.cjs:5 | `{ clamp }` → `{}` | NoCoverage | NoCoverage | killed |
| `y1rmnxcp` | src/math.js:2 | `a + b` → `a` | Survived | Survived [batch-survivor] | killed |
| `nm73mfs7` | src/math.js:6 | `value * factor` → `value / factor` | NoCoverage | NoCoverage | killed |
| `tzcw9x1g` | src/plugins.js:2 | `value * 2` → `value / 2` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `tw7j08nf` | src/plugins.js:2 | `2` → `3` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `ywk2y943` | src/worker.js:5 | `parentPort.postMessage(add(workerData...` → `;` | NoCoverage | NoCoverage | killed-timeout |
