| id | where | change | default | oracle |
|---|---|---|---|---|
| `0swmyqec` | src/cli.js:3 | `process.argv.slice(2)` → `process.argv` | NoCoverage | killed |
| `jzwjemtt` | src/cli.js:3 | `2` → `3` | NoCoverage | killed |
| `wc2dv0zj` | src/cli.js:4 | `console.log(String(scale(value, facto...` → `;` | NoCoverage | killed |
| `pz3vjm44` | src/legacy.cjs:2 | `Math.min(high, Math.max(low, value))` → `Math.max(high, Math.max(low, value))` | Killed (assertion) | killed |
| `217j5vwz` | src/legacy.cjs:2 | `Math.max(low, value)` → `Math.min(low, value)` | Killed (assertion) | killed |
| `5xcnmns9` | src/legacy.cjs:5 | `module.exports = { clamp }` → `;` | Killed (assertion) [static] | killed |
| `f99hstzg` | src/legacy.cjs:5 | `{ clamp }` → `{}` | Killed (assertion) [static] | killed |
| `y1rmnxcp` | src/math.js:2 | `a + b` → `a` | Killed (assertion) | killed |
| `nm73mfs7` | src/math.js:6 | `value * factor` → `value / factor` | NoCoverage | killed |
| `tzcw9x1g` | src/plugins.js:2 | `value * 2` → `value / 2` | Killed (assertion) | killed |
| `tw7j08nf` | src/plugins.js:2 | `2` → `3` | Killed (assertion) | killed |
| `ywk2y943` | src/worker.js:5 | `parentPort.postMessage(add(workerData...` → `;` | NoCoverage | killed |
