| id | where | change | default | oracle |
|---|---|---|---|---|
| `hj0yd0hb` | src/constants.js:1 | `3 * 2` → `3 / 2` | Killed (assertion) [static] | killed |
| `rxsvnd3e` | src/constants.js:1 | `3` → `4` | Killed (assertion) [static] | killed |
| `458nm0qp` | src/constants.js:1 | `2` → `3` | Killed (assertion) [static] | killed |
| `eaq39dwt` | src/constants.js:3 | `'a'` → `''` | Killed (assertion) [static] | killed |
| `y7ackhg1` | src/constants.js:3 | `'b'` → `''` | Killed (assertion) [static] | killed |
| `945bxqk4` | src/constants.js:3 | `name.toUpperCase()` → `name.toLowerCase()` | Killed (assertion) [static] | killed |
| `e7cxkzve` | src/constants.js:5 | `LIMIT > 5` → `LIMIT >= 5` | Survived [static] | survived |
| `v7rr6cgx` | src/constants.js:5 | `LIMIT > 5` → `LIMIT != 5` | Survived [static] | survived |
| `3w43mcgj` | src/constants.js:5 | `LIMIT > 5` → `LIMIT > 6` | Killed (assertion) [static] | killed |
| `m9q2903w` | src/constants.js:5 | `2` → `3` | Killed (assertion) [static] | killed |
| `j9rnz5kn` | src/constants.js:5 | `0` → `1` | NoCoverage | survived |
| `r8ehextk` | src/greeting.js:2 | ``Hi ${name}`` → `''` | Killed (assertion) [static] | killed |
| `n7xv1vc7` | src/lazy.js:1 | `10 + 5` → `10 - 5` | Killed (assertion) | killed |
| `ytypve5b` | src/lazy.js:1 | `10` → `11` | Killed (assertion) | killed |
| `cn93dk2e` | src/lazy.js:1 | `5` → `6` | Killed (assertion) | killed |
| `rf8vp0ar` | src/lazy.js:4 | `LAZY - 1` → `LAZY + 1` | Killed (assertion) | killed |
| `n6xvk4sr` | src/lazy.js:4 | `1` → `2` | Killed (assertion) | killed |
