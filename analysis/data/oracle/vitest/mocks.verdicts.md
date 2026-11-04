| id | where | change | default | fast | oracle |
|---|---|---|---|---|---|
| `18v42cm0` | src/api.js:2 | `{ id, name: `user${id}` }` → `{ name: `user${id}` }` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `jnhjhh9w` | src/api.js:2 | ``user${id}`` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `3kcfkvb5` | src/api.js:6 | `user.id === 1` → `user.id <= 1` | Survived | Survived [batch-survivor] | survived |
| `sn1134re` | src/api.js:6 | `user.id === 1` → `user.id >= 1` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `czqs1pqk` | src/api.js:6 | `user.id === 1` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `cv04c482` | src/service.js:4 | `await fetchUser(id)` → `fetchUser(id)` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `15y2qgzk` | src/service.js:5 | `isAdmin(user)` → `true` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `2hmxc740` | src/service.js:5 | `isAdmin(user)` → `false` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `b5w7amee` | src/service.js:5 | ``Welcome back, ${user.name}!`` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
| `pfsw50c3` | src/service.js:5 | ``Hello, ${user.name}!`` → `''` | Killed (assertion) | Killed (assertion) [batch] | killed |
