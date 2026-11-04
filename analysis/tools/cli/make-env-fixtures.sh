#!/bin/bash
# Recreates the environment fixtures of analysis/bugs/cli-env.md in
# /home/user/projects/cli (needs base-vt: npm project with the mootant tgz,
# vitest 5.0.5 and vite 8.3.5 installed with --legacy-peer-deps).
# usage: make-env-fixtures.sh
set -euo pipefail
T=$(cd "$(dirname "$0")" && pwd)
P=/home/user/projects/cli
MF=$T/make-fixture.sh

math_js='export function add(a, b) {
  return a + b
}

export function isAdult(age) {
  return age >= 18
}

export function label(n) {
  if (n > 10) {
    return '"'"'big'"'"'
  }
  return '"'"'small'"'"'
}'
math_cjs='function add(a, b) {
  return a + b
}

function isAdult(age) {
  return age >= 18
}

module.exports = { add, isAdult }'

# basic projects
D=$($MF vt-basic vitest); mkdir -p $D/src $D/test; echo "$math_js" > $D/src/math.js
cat > $D/test/math.test.js <<'EOF'
import { expect, it } from 'vitest'

import { add, isAdult, label } from '../src/math.js'

it('adds', () => {
  expect(add(2, 3)).toBe(5)
})

it('checks adults', () => {
  expect(isAdult(30)).toBe(true)
  expect(isAdult(3)).toBe(false)
})

it('labels', () => {
  expect(label(100)).toBe('big')
})
EOF
D=$($MF nt-basic node-test); mkdir -p $D/src $D/test; echo "$math_js" > $D/src/math.js
sed -e "s#import { expect, it } from 'vitest'#import { it } from 'node:test'\nimport assert from 'node:assert/strict'#" \
    -e 's/expect(\(.*\)).toBe(\(.*\))/assert.equal(\1, \2)/' $P/vt-basic/test/math.test.js > $D/test/math.test.js

# CommonJS
D=$($MF nt-cjs node-test); sed -i 's/"type": "module"/"type": "commonjs"/' $D/package.json
mkdir -p $D/src $D/test; echo "$math_cjs" > $D/src/math.js
cat > $D/test/math.test.js <<'EOF'
const { it } = require('node:test')
const assert = require('node:assert/strict')

const { add, isAdult } = require('../src/math.js')

it('adds', () => {
  assert.equal(add(2, 3), 5)
})

it('checks adults', () => {
  assert.equal(isAdult(30), true)
  assert.equal(isAdult(3), false)
})
EOF
D=$($MF vt-cjs vitest); mkdir -p $D/src $D/test; echo "$math_cjs" > $D/src/math.cjs
cat > $D/test/math.test.js <<'EOF'
import { expect, it } from 'vitest'

import { add, isAdult } from '../src/math.cjs'

it('adds', () => {
  expect(add(2, 3)).toBe(5)
})

it('checks adults', () => {
  expect(isAdult(30)).toBe(true)
  expect(isAdult(3)).toBe(false)
})
EOF
D=$($MF vt-require vitest); sed -i 's/"type": "module"/"type": "commonjs"/' $D/package.json
mkdir -p $D/src $D/test; echo "$math_cjs" > $D/src/math.js
cat > $D/test/require.test.mjs <<'EOF'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { add, isAdult } = require('../src/math.js')

it('adds through require', () => {
  expect(add(2, 2)).toBe(4)
})

it('treats 18 as adult through require', () => {
  expect(isAdult(18)).toBe(true)
  expect(isAdult(17)).toBe(false)
})
EOF
echo "import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['test/**/*.test.mjs'] } })" > $D/vitest.config.mjs
D=$($MF vt-cjs-chain vitest); mkdir -p $D/src $D/test
cat > $D/src/a.cjs <<'EOF'
const { isAdult } = require('./b.cjs')

function canVote(age) {
  return isAdult(age)
}

module.exports = { canVote }
EOF
cat > $D/src/b.cjs <<'EOF'
function isAdult(age) {
  return age >= 18
}

module.exports = { isAdult }
EOF
cat > $D/test/a.test.js <<'EOF'
import { expect, it } from 'vitest'

import { canVote } from '../src/a.cjs'

it('lets 18-year-olds vote', () => {
  expect(canVote(18)).toBe(true)
  expect(canVote(17)).toBe(false)
})
EOF

# leaked handle in globalSetup, and console output in the Vitest config
D=$($MF vt-handle vitest); cp -r $P/vt-basic/src $P/vt-basic/test $D/
cat > $D/global-setup.js <<'EOF'
import http from 'node:http'

export default function setup() {
  http.createServer((request, response) => response.end('ok')).listen(0)
}
EOF
echo "import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globalSetup: ['./global-setup.js'] },
})" > $D/vitest.config.js
D=$($MF vt-log vitest); cp -r $P/vt-basic/src $P/vt-basic/test $D/
echo "import { defineConfig } from 'vitest/config'

console.log('[dotenv@17.2.3] injecting env (1) from .env')

export default defineConfig({})" > $D/vitest.config.js

# slow tests for signals in the dry run
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($MF $short-slow $kind); mkdir -p $D/src $D/test; echo "$math_js" > $D/src/math.js
  if [ $kind = vitest ]; then IMP="import { expect, it } from 'vitest'"; EXP="expect(add(2, 3)).toBe(5)"
  else IMP="import { it } from 'node:test'
import assert from 'node:assert/strict'"; EXP="assert.equal(add(2, 3), 5)"; fi
  printf "%s\n\nimport { add } from '../src/math.js'\n\nit('adds slowly', async () => {\n  await new Promise(resolve => setTimeout(resolve, 4000))\n  %s\n})\n" "$IMP" "$EXP" > $D/test/math.test.js
done

# monorepo with Vitest projects (each package its own root)
D=$P/mono; rm -rf "${D:?}"; mkdir -p $D; cp -al $P/base-vt/node_modules $D/node_modules
echo '{ "name": "mono", "private": true, "type": "module", "workspaces": ["packages/*"], "scripts": { "test": "vitest --run" } }' > $D/package.json
echo "import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { projects: ['packages/*'] },
})" > $D/vitest.config.js
for p in a b; do mkdir -p $D/packages/$p/src $D/packages/$p/test
  echo "{ \"name\": \"$p\", \"version\": \"1.0.0\", \"type\": \"module\", \"exports\": \"./src/index.js\", \"scripts\": { \"test\": \"vitest --run\" } }" > $D/packages/$p/package.json
  ln -sfn ../packages/$p $D/node_modules/$p
done
printf 'export function add(a, b) {\n  return a + b\n}\n' > $D/packages/a/src/index.js
printf "import { expect, it } from 'vitest'\n\nimport { add } from '../src/index.js'\n\nit('adds', () => {\n  expect(add(2, 3)).toBe(5)\n})\n" > $D/packages/a/test/index.test.js
printf "import { add } from 'a'\n\nexport function double(x) {\n  return add(x, x)\n}\n" > $D/packages/b/src/index.js
printf "import { expect, it } from 'vitest'\n\nimport { double } from '../src/index.js'\n\nit('doubles', () => {\n  expect(double(4)).toBe(8)\n})\n" > $D/packages/b/test/index.test.js

# hang fixtures, then the long-timeout copies used for signals
$T/make-hang-fixtures.sh >/dev/null
for s in vt nt; do
  rm -rf "${P:?}/${s:?}-hang-long"; cp -a "$P/$s-hang" "$P/$s-hang-long"
  printf "export default {\n  run: { timeout: { constant: 30000 } },\n}\n" > "$P/$s-hang-long/mootant.config.js"
done
echo "fixtures ready in $P (vt-vue, vt-svelte, vt-alias, nt-ts, nt-tsx: see cli-env.md)"
