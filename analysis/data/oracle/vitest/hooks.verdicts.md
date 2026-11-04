| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `86e7wwdj` | src/db.js:2 | `!url.startsWith('mem://')` → `true` | Killed (hook-error) [static] | Killed (hook-error) [static] | killed |
| `bnx3tty0` | src/db.js:2 | `!url.startsWith('mem://')` → `false` | Survived [static] | Survived [static] | survived |
| `0ap8zdz3` | src/db.js:2 | `url.startsWith('mem://')` → `url.endsWith('mem://')` | Killed (hook-error) [static] | Killed (hook-error) [static] | killed |
| `2hxt8dgr` | src/db.js:5 | `{⏎    close() {⏎      return true⏎   ...` → `{⏎    close() {⏎      return true⏎   ...` | Killed (assertion) [static] | Killed (assertion) [static] | killed |
| `g733625x` | src/db.js:7 | `true` → `false` | Killed (hook-error) [static] | Killed (hook-error) [static] | killed |
| `z8vzgrgv` | src/db.js:14 | `!db.close()` → `true` | Killed (hook-error) [static] | Killed (hook-error) [static] | killed |
| `1b6tvwex` | src/db.js:14 | `!db.close()` → `false` | Survived [static] | Survived [static] | survived |
| `bw6hqbwf` | src/db.js:20 | `flag` → `true` | Killed (crash) | Killed (crash) [recovery] | killed |
| `xke9q4fr` | src/db.js:20 | `flag` → `false` | Survived | Survived [recovery] | survived |
| `9bhgzt7s` | src/db.js:21 | `'SIGKILL'` → `''` | NoCoverage | NoCoverage | survived |
| `36apdchs` | src/db.js:23 | `'alive'` → `''` | Killed (assertion) | Killed (assertion) [recovery] | killed |
