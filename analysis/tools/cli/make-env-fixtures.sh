#!/bin/bash
# Recreates the environment fixtures of analysis/bugs/cli-env.md in
# /home/user/projects/cli (needs base-vt: npm project with the mootant tgz,
# vitest 5.0.5 and vite 8.3.5 installed with --legacy-peer-deps).
# usage: make-env-fixtures.sh [--with-installs]
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
# TypeScript under node:test (type stripping, Node >= 22.18)
D=$($MF nt-ts node-test); mkdir -p $D/src $D/test
printf 'export function add(a: number, b: number): number {\n  return a + b\n}\n\nexport function isAdult(age: number): boolean {\n  return age >= 18\n}\n' > $D/src/math.ts
printf "import { it } from 'node:test'\nimport assert from 'node:assert/strict'\n\nimport { add, isAdult } from '../src/math.ts'\n\nit('adds', () => {\n  assert.equal(add(2, 3), 5)\n})\n\nit('checks adults', () => {\n  assert.equal(isAdult(30), true)\n  assert.equal(isAdult(3), false)\n})\n" > $D/test/math.test.ts

# Vitest path aliases: resolve.alias and tsconfig paths
D=$($MF vt-alias vitest); mkdir -p $D/src/lib $D/test; cp $P/nt-ts/src/math.ts $D/src/lib/math.ts
printf "import { expect, it } from 'vitest'\n\nimport { add } from '@lib/math'\nimport { isAdult } from '~/lib/math'\n\nit('adds', () => {\n  expect(add(2, 3)).toBe(5)\n})\n\nit('checks adults', () => {\n  expect(isAdult(30)).toBe(true)\n  expect(isAdult(3)).toBe(false)\n})\n" > $D/test/math.test.ts
printf '{\n  "compilerOptions": {\n    "target": "es2022",\n    "module": "esnext",\n    "moduleResolution": "bundler",\n    "baseUrl": ".",\n    "paths": { "~/*": ["src/*"] }\n  }\n}\n' > $D/tsconfig.json
printf "import { fileURLToPath } from 'node:url'\nimport { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  resolve: {\n    alias: { '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)) },\n    tsconfigPaths: true,\n  },\n})\n" > $D/vitest.config.ts

# fixtures that need packages from the registry: pass --with-installs
if [ "${1:-}" = --with-installs ]; then
  D=$($MF vt-vue vitest)
  (cd $D && npm i -D --legacy-peer-deps vue@3.5.44 @vue/compiler-dom@3.5.44 @vitejs/plugin-vue@6.0.10 @vue/test-utils happy-dom@21.0.4 >/dev/null)
  mkdir -p $D/src $D/test
  printf '<script setup lang="ts">\nimport { ref, computed } from '"'"'vue'"'"'\n\nconst props = defineProps<{ start: number; max: number }>()\nconst count = ref(props.start)\nconst atMax = computed(() => count.value >= props.max)\n\nfunction increment(): void {\n  if (!atMax.value) {\n    count.value += 1\n  }\n}\n</script>\n\n<template>\n  <button :disabled="atMax" @click="increment">{{ count > 0 ? count : '"'"'zero'"'"' }}</button>\n</template>\n' > $D/src/Counter.vue
  printf "import { mount } from '@vue/test-utils'\nimport { expect, it } from 'vitest'\n\nimport Counter from '../src/Counter.vue'\n\nit('counts up to max', async () => {\n  let wrapper = mount(Counter, { props: { start: 1, max: 2 } })\n  expect(wrapper.text()).toBe('1')\n  await wrapper.get('button').trigger('click')\n  expect(wrapper.text()).toBe('2')\n  expect(wrapper.get('button').attributes('disabled')).toBeDefined()\n})\n" > $D/test/counter.test.ts
  printf "import vue from '@vitejs/plugin-vue'\nimport { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  plugins: [vue()],\n  test: { environment: 'happy-dom' },\n})\n" > $D/vitest.config.ts
  D=$($MF vt-svelte vitest)
  (cd $D && npm i -D --legacy-peer-deps svelte@5.57.3 @sveltejs/vite-plugin-svelte@7.3.1 happy-dom@21.0.4 >/dev/null)
  mkdir -p $D/src $D/test
  printf '<script>\n  let { start = 0, max = 10 } = $props()\n  let count = $state(start)\n  let atMax = $derived(count >= max)\n\n  function increment() {\n    if (!atMax) {\n      count += 1\n    }\n  }\n</script>\n\n<button disabled={atMax} onclick={increment}>{count > 0 ? count : '"'"'zero'"'"'}</button>\n' > $D/src/Counter.svelte
  printf "import { flushSync, mount, unmount } from 'svelte'\nimport { expect, it } from 'vitest'\n\nimport Counter from '../src/Counter.svelte'\n\nit('counts up to max', () => {\n  let component = mount(Counter, { target: document.body, props: { start: 1, max: 2 } })\n  let button = document.body.querySelector('button')\n  expect(button.textContent).toBe('1')\n  button.click()\n  flushSync()\n  expect(button.textContent).toBe('2')\n  expect(button.disabled).toBe(true)\n  unmount(component)\n})\n" > $D/test/counter.test.js
  printf "import { svelte } from '@sveltejs/vite-plugin-svelte'\nimport { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  plugins: [svelte()],\n  resolve: { conditions: ['browser'] },\n  test: { environment: 'happy-dom' },\n})\n" > $D/vitest.config.js
  D=$($MF nt-tsx node-test)
  (cd $D && npm i -D --legacy-peer-deps tsx@4.23.15 >/dev/null)
  mkdir -p $D/src $D/test; cp $P/nt-ts/src/math.ts $D/src/
  sed "s#'../src/math.ts'#'~/math'#" $P/nt-ts/test/math.test.ts > $D/test/math.test.ts
  sed -i 's/"test": "node --test"/"test": "tsx --test test\/math.test.ts"/' $D/package.json
  printf '{\n  "compilerOptions": {\n    "target": "es2022",\n    "module": "esnext",\n    "moduleResolution": "bundler",\n    "baseUrl": ".",\n    "paths": { "~/*": ["src/*"] }\n  }\n}\n' > $D/tsconfig.json
fi
echo "fixtures ready in $P"
