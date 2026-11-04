BUG-305 fixture. In a fresh directory with mootant (0.1.0-170ec52), vitest 5.0.5, vite 8.3.5:
  git init && git add -A && git commit -m base     # src/access.js has door.unlock(user)
  sed -i 's/door.unlock(user)/door.open(user)/' src/access.js
  npx mootant list src --since HEAD --skipped       # mutants 0, skipped 1 (O19)
  npx mootant run src --since HEAD --no-cache       # score none (no mutants to score)
(the copy of src/access.js here is the modified version; revert it to door.unlock(user) for the base commit)
