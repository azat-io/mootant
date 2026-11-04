#!/usr/bin/env bash
# Cache staleness scenarios for Vitest inputs (no --incremental).
# Each scenario: r1 (cold, writes the cache) -> change -> r2 (cache on) ->
# r3 (--no-cache, ground truth); compare_runs prints verdicts that differ.
# Usage: s-inputs.sh <scenario>...   (see the case list at the bottom)
# Output: stdout and $DATA_DIR/<scenario>.*.json

source "$(dirname "$0")/lib.sh"

# Survivors of the template: "age >= 18" -> "age > 18" and "age >= 17"
# survive as long as no test asks isAdult(18) / isAdult(17).
# FROM/TO: the boundary age before and after the change. By default 30 -> 18
# (a survivor becomes a kill: the stale verdict is a false "Survived");
# REVERSE=1 gives 18 -> 30 (a kill becomes a survivor: the stale verdict is a
# false "Killed", which hides a gap in the tests). Scenario names get "-rev".
FROM=30
TO=18
SUFFIX=
if [ "${REVERSE:-0}" = 1 ]; then
  FROM=18
  TO=30
  SUFFIX=-rev
fi

# V1: a test imports a virtual module whose plugin reads limits.json and calls
# this.addWatchFile(); editing limits.json turns the "> 18" survivor into a kill.
virtual_module() {
  local d
  d=$(new_project virtual-module$SUFFIX)
  cat >"$d/vitest.config.ts" <<'EOF'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'limits',
      resolveId(id) {
        return id === 'virtual:limits' ? '\0virtual:limits' : null
      },
      load(id) {
        if (id !== '\0virtual:limits') {
          return null
        }
        let file = path.resolve(import.meta.dirname, 'limits.json')
        this.addWatchFile(file)
        return `export default ${readFileSync(file, 'utf8')}`
      },
    },
  ],
  test: { include: ['test/**/*.test.ts'] },
})
EOF
  echo "{ \"age\": $FROM }" >"$d/limits.json"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'
// @ts-expect-error virtual module
import limits from 'virtual:limits'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" virtual
  run_mootant "$d" r1 src
  echo "{ \"age\": $TO }" >"$d/limits.json"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs virtual-module$SUFFIX r2 r3
}

# V2: the same plugin data, but read by a real module (src-side config.ts)
# that the plugin transforms with this.addWatchFile(): control for V1.
watched_real_module() {
  local d
  d=$(new_project watched-real-module)
  cat >"$d/vitest.config.ts" <<'EOF'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'limits',
      transform(code, id) {
        if (!id.endsWith('/test/limits.ts')) {
          return null
        }
        let file = path.resolve(import.meta.dirname, 'limits.json')
        this.addWatchFile(file)
        return code.replace('__LIMITS__', readFileSync(file, 'utf8'))
      },
    },
  ],
  test: { include: ['test/**/*.test.ts'] },
})
EOF
  echo '{ "age": 30 }' >"$d/limits.json"
  echo 'export default __LIMITS__ as { age: number }' >"$d/test/limits.ts"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'
import limits from './limits'

it('isAdult', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" watched
  run_mootant "$d" r1 src
  echo '{ "age": 18 }' >"$d/limits.json"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs watched-real-module r2 r3
}

# O1: the test reads a fixture outside the project root through node:fs, as a
# package of a monorepo reading shared fixtures of the repository.
outside_root() {
  local d
  d=$(new_project outside-root$SUFFIX)
  local shared=$CACHE_ROOT/outside-root-shared$SUFFIX
  rm -rf "$shared"
  mkdir -p "$shared"
  echo "{ \"age\": $FROM }" >"$shared/limits.json"
  cat >"$d/test/math.test.ts" <<EOF
import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

let limits = JSON.parse(readFileSync('$shared/limits.json', 'utf8'))

it('isAdult', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" outside
  run_mootant "$d" r1 src
  echo "{ \"age\": $TO }" >"$shared/limits.json"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs outside-root$SUFFIX r2 r3
}

# O2: control for O1, the same fixture inside the root.
inside_root() {
  local d
  d=$(new_project inside-root)
  mkdir -p "$d/fixtures"
  echo '{ "age": 30 }' >"$d/fixtures/limits.json"
  cat >"$d/test/math.test.ts" <<'EOF'
import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

let limits = JSON.parse(readFileSync(new URL('../fixtures/limits.json', import.meta.url), 'utf8'))

it('isAdult', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" inside
  run_mootant "$d" r1 src
  echo '{ "age": 18 }' >"$d/fixtures/limits.json"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs inside-root r2 r3
}

# N1: a dependency in node_modules changes without a lockfile change (as with
# patch-package, a manual patch or a project without a lockfile).
node_modules_patch() {
  local d
  d=$(new_project node-modules-patch$SUFFIX)
  mkdir -p "$d/node_modules/limits-pkg"
  echo '{ "name": "limits-pkg", "version": "1.0.0", "type": "module", "main": "index.js" }' >"$d/node_modules/limits-pkg/package.json"
  echo "export default { age: $FROM }" >"$d/node_modules/limits-pkg/index.js"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'
// @ts-expect-error untyped local package
import limits from 'limits-pkg'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" nm
  run_mootant "$d" r1 src
  echo "export default { age: $TO }" >"$d/node_modules/limits-pkg/index.js"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs node-modules-patch$SUFFIX r2 r3
}

# E1: vitest.config.ts takes a setting that is not in the cache key
# (expect.requireAssertions) from an environment variable of the main process.
env_config_setting() {
  local d
  d=$(new_project env-config-setting)
  cat >"$d/vitest.config.ts" <<'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    expect: { requireAssertions: process.env.STRICT_TESTS === '1' },
  },
})
EOF
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  if (!isAdult(18)) {
    return
  }
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" env
  run_mootant "$d" r1 src
  export STRICT_TESTS=1
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  unset STRICT_TESTS
  compare_runs env-config-setting r2 r3
}

# F1: a file of the environment has a modification time in the future (clock
# skew of a shared folder, an archive, WSL): the cache is never used, silently.
future_mtime() {
  local d
  d=$(new_project future-mtime)
  touch -d '+2 hours' "$d/vitest.config.ts"
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
  echo "  cache file:"
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
  grep -h "Reused\|cache" "$DATA_DIR/future-mtime.r2.json.stderr" | sed 's/^/  stderr: /'
}

# F2: a dependency of the test file has a future modification time: that test
# file gets no key, its verdicts are neither stored nor reused, silently.
future_mtime_dependency() {
  local d
  d=$(new_project future-mtime-dependency)
  touch -d '+2 hours' "$d/src/math.ts"
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
}

# F3: a test writes package.json back unchanged (as tests of tools that edit
# package.json and restore it do): the cache is disabled for the whole run,
# silently; saveRunCache would compare contents, prepareRunCache does not.
write_back_package_json() {
  local d
  d=$(new_project write-back-package-json)
  cat >"$d/test/math.test.ts" <<'EOF2'
import { readFileSync, writeFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  let file = new URL('../package.json', import.meta.url)
  writeFileSync(file, readFileSync(file))
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF2
  commit_all "$d" writeback
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
}

# B1: reinstalling the same mootant tarball (rm -rf node_modules && npm ci in
# CI, with node_modules/.cache/mootant restored) drops every cached verdict,
# because the build stamp is the modification time of a file of the package.
reinstall_stamp() {
  local d
  d=$(new_project reinstall-stamp)
  run_mootant "$d" r1 src
  cp "$d/node_modules/.cache/mootant/run-v3.json" "$d/saved-cache.json"
  stat -c '  before: %y %n' "$d/node_modules/mootant/dist/core/cache/prepare-run-cache.js"
  rm -rf "$d/node_modules/mootant"
  (cd "$d" && timeout 300 npm i --no-save --legacy-peer-deps --offline /home/user/artifacts/mootant-0.1.0-170ec52.tgz >/dev/null 2>&1)
  stat -c '  after:  %y %n' "$d/node_modules/mootant/dist/core/cache/prepare-run-cache.js"
  mkdir -p "$d/node_modules/.cache/mootant"
  cp "$d/saved-cache.json" "$d/node_modules/.cache/mootant/run-v3.json"
  run_mootant "$d" r2 src
  # Control: give the reinstalled file the old modification time; nothing
  # else differs, so every verdict must be reused again.
  touch -r "$TEMPLATE_VITEST/node_modules/mootant/dist/core/cache/prepare-run-cache.js" \
    "$d/node_modules/mootant/dist/core/cache/prepare-run-cache.js"
  cp "$d/saved-cache.json" "$d/node_modules/.cache/mootant/run-v3.json"
  run_mootant "$d" r3-old-mtime src
}

# D1: one unparsable file among the listed paths: the cache is never saved,
# for the verdicts of every other file too.
error_diagnostic() {
  local d
  d=$(new_project error-diagnostic)
  printf 'export const broken = (\n' >"$d/src/broken.ts"
  commit_all "$d" broken
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
}

# C1: a custom test environment: verdicts are never cached, silently.
custom_environment() {
  local d
  d=$(new_project custom-environment)
  cat >"$d/custom-env.ts" <<'EOF'
import type { Environment } from 'vitest/environments'

export default {
  name: 'custom',
  viteEnvironment: 'ssr',
  setup() {
    return { teardown() {} }
  },
} satisfies Environment
EOF
  cat >"$d/vitest.config.ts" <<'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: './custom-env.ts' },
})
EOF
  commit_all "$d" env
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
  ls -la "$d/node_modules/.cache/mootant/" 2>&1 | sed 's/^/    /'
}

# ---- Controls: inputs that must invalidate the cache (expected: no stale) ----

# K1: snapshot file edited by hand.
snapshot_change() {
  local d
  d=$(new_project snapshot-change)
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect([isAdult(30), isAdult(5), isAdult(18)]).toMatchSnapshot()
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  (cd "$d" && timeout 120 ./node_modules/.bin/vitest run >/dev/null 2>&1)
  commit_all "$d" snap
  run_mootant "$d" r1 src
  # Make the snapshot weaker: drop the isAdult(18) entry from the test and the snapshot.
  sed -i 's/, isAdult(18)\]/]/' "$d/test/math.test.ts"
  (cd "$d" && rm -rf test/__snapshots__ && timeout 120 ./node_modules/.bin/vitest run >/dev/null 2>&1)
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs snapshot-change r2 r3
}

# K2: a setup file changes what tests see.
setup_file_change() {
  local d
  d=$(new_project setup-file-change)
  cat >"$d/vitest.config.ts" <<'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], setupFiles: ['test/setup.ts'] },
})
EOF
  echo 'globalThis.BOUNDARY_AGE = 30' >"$d/test/setup.ts"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult((globalThis as any).BOUNDARY_AGE)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" setup
  run_mootant "$d" r1 src
  echo 'globalThis.BOUNDARY_AGE = 18' >"$d/test/setup.ts"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs setup-file-change r2 r3
}

# K3: a __mocks__ file appears for a module the test mocks without a factory.
mocks_appear() {
  local d
  d=$(new_project mocks-appear)
  echo 'export const BOUNDARY_AGE = 30' >"$d/src/limits.ts"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it, vi } from 'vitest'

import { isAdult, add } from '../src/math'
import { BOUNDARY_AGE } from '../src/limits'

vi.mock('../src/limits')

it('isAdult', () => {
  expect(isAdult(BOUNDARY_AGE ?? 30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" mocks
  run_mootant "$d" r1 src/math.ts
  mkdir -p "$d/src/__mocks__"
  echo 'export const BOUNDARY_AGE = 18' >"$d/src/__mocks__/limits.ts"
  run_mootant "$d" r2 src/math.ts
  run_mootant "$d" r3 src/math.ts --no-cache
  compare_runs mocks-appear r2 r3
}

# K4: VITE_ variable in .env read through import.meta.env.
dotenv_change() {
  local d
  d=$(new_project dotenv-change)
  echo 'VITE_BOUNDARY_AGE=30' >"$d/.env"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult(Number(import.meta.env.VITE_BOUNDARY_AGE))).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" env
  run_mootant "$d" r1 src
  echo 'VITE_BOUNDARY_AGE=18' >"$d/.env"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs dotenv-change r2 r3
}

# K5: an environment variable the test reads by name.
env_variable_change() {
  local d
  d=$(new_project env-variable-change)
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult(Number(process.env.BOUNDARY_AGE ?? 30))).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" env
  run_mootant "$d" r1 src
  BOUNDARY_AGE=18 run_mootant "$d" r2 src
  BOUNDARY_AGE=18 run_mootant "$d" r3 src --no-cache
  compare_runs env-variable-change r2 r3
}

# K6: the project directory moves (CI vs local checkout path): reuse expected.
move_project() {
  local d
  d=$(new_project move-project)
  run_mootant "$d" r1 src
  rm -rf "$CACHE_ROOT/move-project-moved"
  mv "$d" "$CACHE_ROOT/move-project-moved"
  run_mootant "$CACHE_ROOT/move-project-moved" r2 src
}

# K7: renames: the source file (ids include the path) and the test file.
renames() {
  local d
  d=$(new_project renames)
  run_mootant "$d" r1 src
  (cd "$d" && git mv test/math.test.ts test/math-renamed.test.ts)
  run_mootant "$d" r2-test-renamed src
  (cd "$d" && git mv src/math.ts src/arith.ts && sed -i 's#../src/math#../src/arith#' test/math-renamed.test.ts)
  run_mootant "$d" r3-source-renamed src
}

# K8: Node major version 22 -> 24 for Vitest.
node_major() {
  local d
  d=$(new_project node-major)
  run_mootant "$d" r1-node22 src
  PATH=/opt/node24/bin:$PATH run_mootant "$d" r2-node24 src
  PATH=/opt/node24/bin:$PATH run_mootant "$d" r3-node24-again src
  # Back to Node 22: the slots now hold the Node 24 entries (a slot keeps one
  # entry whatever its environment key), so nothing is reused.
  run_mootant "$d" r4-node22-back src
}

# K9: tsconfig at the root changes how Vite transforms class fields.
tsconfig_root_change() {
  local d
  d=$(new_project tsconfig-root-change)
  echo '{ "compilerOptions": { "target": "ES2022", "useDefineForClassFields": true } }' >"$d/tsconfig.json"
  run_mootant "$d" r1 src
  echo '{ "compilerOptions": { "target": "ES2022", "useDefineForClassFields": false } }' >"$d/tsconfig.json"
  run_mootant "$d" r2 src
}

# G1: import.meta.glob picks up a new file: the fresh dry run evaluates it, so
# the dependency list (and the key) changes. Control.
glob_new_file() {
  local d
  d=$(new_project glob-new-file)
  mkdir -p "$d/test/checks"
  cat >"$d/test/checks/a.ts" <<'EOF2'
import { expect } from 'vitest'

import { isAdult } from '../../src/math'

export function check(): void {
  expect(isAdult(30)).toBe(true)
}
EOF2
  cat >"$d/test/math.test.ts" <<'EOF2'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

let checks = import.meta.glob<{ check(): void }>('./checks/*.ts', { eager: true })

it('isAdult', () => {
  for (let module of Object.values(checks)) {
    module.check()
  }
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF2
  commit_all "$d" glob
  run_mootant "$d" r1 src
  sed 's/isAdult(30)/isAdult(18)/' "$d/test/checks/a.ts" >"$d/test/checks/b.ts"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs glob-new-file r2 r3
}

# M1: npm workspaces: the test of packages/app imports the workspace package
# "lib" through node_modules/lib -> ../packages/lib, and a helper of app.
monorepo_workspace() {
  local d=$CACHE_ROOT/monorepo-workspace
  rm -rf "$d" && mkdir -p "$d/packages/lib/src" "$d/packages/app/test" "$d/packages/app/src"
  cp -al "$TEMPLATE_VITEST/node_modules" "$d/node_modules"
  rm -rf "$d/node_modules/.cache"
  ln -s ../packages/lib "$d/node_modules/lib"
  cp "$TEMPLATE_VITEST/package-lock.json" "$d/package-lock.json"
  echo '{ "name": "mono", "private": true, "type": "module", "workspaces": ["packages/*"], "scripts": { "test": "vitest run" } }' >"$d/package.json"
  echo '{ "name": "lib", "version": "1.0.0", "type": "module", "exports": "./src/math.ts" }' >"$d/packages/lib/package.json"
  cp "$TEMPLATE_VITEST/src/math.ts" "$d/packages/lib/src/math.ts"
  echo '{ "name": "app", "version": "1.0.0", "type": "module" }' >"$d/packages/app/package.json"
  echo 'export const BOUNDARY_AGE = 30' >"$d/packages/app/src/helper.ts"
  cat >"$d/vitest.config.ts" <<'EOF2'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['packages/*/test/**/*.test.ts'] },
})
EOF2
  cat >"$d/packages/app/test/app.test.ts" <<'EOF2'
import { expect, it } from 'vitest'
import { isAdult, add } from 'lib'

import { BOUNDARY_AGE } from '../src/helper'

it('isAdult', () => {
  expect(isAdult(BOUNDARY_AGE)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF2
  (cd "$d" && git init -q -b main && printf 'node_modules\n' >.gitignore && git add -A && git -c user.email=a@b -c user.name=f commit -qm init)
  run_mootant "$d" r1 packages/lib/src
  echo 'export const BOUNDARY_AGE = 18' >"$d/packages/app/src/helper.ts"
  run_mootant "$d" r2 packages/lib/src
  run_mootant "$d" r3 packages/lib/src --no-cache
  compare_runs monorepo-workspace r2 r3
}

# MC1: a preset setting that cannot change the verdict of a listed mutant
# (settings.loggers) drops every cached verdict.
mootant_setting() {
  local d
  d=$(new_project mootant-setting)
  run_mootant "$d" r1 src
  echo "export default { settings: { loggers: ['audit'] } }" >"$d/mootant.config.js"
  run_mootant "$d" r2 src
}

# P1: a globalSetup provides a value that differs on every run (a server on a
# random port, a container URL, a temp dir): it is part of the environment key
# (describeProjectSettings, values), so nothing is ever reused.
volatile_provide() {
  local d
  d=$(new_project volatile-provide)
  cat >"$d/test/global-setup.ts" <<'EOF2'
import { createServer } from 'node:http'

import type { TestProject } from 'vitest/node'

export default async function setup(project: TestProject) {
  let server = createServer((_request, response) => response.end('ok'))
  await new Promise<void>(resolve => server.listen(0, resolve))
  let { port } = server.address() as { port: number }
  project.provide('apiUrl', `http://127.0.0.1:${port}`)
  return () => new Promise<void>(resolve => server.close(() => resolve()))
}
EOF2
  cat >"$d/vitest.config.ts" <<'EOF2'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], globalSetup: ['test/global-setup.ts'] },
})
EOF2
  commit_all "$d" provide
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
}

# P1b: a define with the build time, as apps show it in an about box:
# Vite's define values are in the environment key, so nothing is reused.
volatile_define() {
  local d
  d=$(new_project volatile-define)
  cat >"$d/vitest.config.ts" <<'EOF2'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  test: { include: ['test/**/*.test.ts'] },
})
EOF2
  commit_all "$d" define
  run_mootant "$d" r1 src
  run_mootant "$d" r2 src
}

# P2: a test that starts a child process with the inherited environment reads
# "*": any variable that differs between two shells (CI run ids, npm_* of
# npm run, SSH_AUTH_SOCK, VSCODE_*) drops its verdicts.
spawn_star() {
  local d
  d=$(new_project spawn-star)
  cat >"$d/test/math.test.ts" <<'EOF2'
import { execFileSync } from 'node:child_process'

import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(execFileSync(process.execPath, ['-e', 'process.stdout.write("1")'], { encoding: 'utf8' })).toBe('1')
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF2
  commit_all "$d" spawn
  GITHUB_RUN_ID=1 run_mootant "$d" r1 src
  GITHUB_RUN_ID=1 run_mootant "$d" r2-same src
  GITHUB_RUN_ID=2 run_mootant "$d" r3-other-run-id src
  (cd "$d" && node -e 'let p=require("./package.json"); p.scripts.mutate="mootant run --json --all --verbose src"; require("fs").writeFileSync("package.json", JSON.stringify(p, null, 2))' && git add -A && git -c user.email=a@b -c user.name=f commit -qm script)
  GITHUB_RUN_ID=2 run_mootant "$d" r4-before-npm-run src
  (cd "$d" && GITHUB_RUN_ID=2 timeout 300 npm run -s mutate >"$DATA_DIR/spawn-star.r5-npm-run.json" 2>"$DATA_DIR/spawn-star.r5-npm-run.json.stderr")
  echo "[spawn-star/r5-npm-run] via npm run"
  summarize "$DATA_DIR/spawn-star.r5-npm-run.json"
}

# T1: a solution-style packages/web/tsconfig.json references
# tsconfig.app.json, which sets useDefineForClassFields; listTsconfigFiles
# follows "extends" only, and the root pattern of prepareRunCache only sees
# files at the root. Flipping the option changes class field semantics.
tsconfig_reference() {
  local d
  d=$(new_project tsconfig-reference)
  rm -rf "$d/src" "$d/test"
  mkdir -p "$d/packages/web/src" "$d/packages/web/test"
  echo '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }' >"$d/packages/web/tsconfig.json"
  echo '{ "compilerOptions": { "target": "ES2022", "useDefineForClassFields": true }, "include": ["src", "test"] }' >"$d/packages/web/tsconfig.app.json"
  cat >"$d/packages/web/src/math.ts" <<'EOF2'
export function double(value: number): number {
  return value * 2
}

class Base {
  stored = 0

  set value(value: number) {
    this.stored = double(value)
  }

  get value(): number {
    return this.stored
  }
}

export class Child extends Base {
  // @ts-expect-error a field over an accessor, as in older code bases
  value = 5
}
EOF2
  cat >"$d/packages/web/test/math.test.ts" <<'EOF2'
import { expect, it } from 'vitest'

import { Child, double } from '../src/math'

it('child', () => {
  expect([5, 10]).toContain(new Child().value)
  expect(double(0)).toBe(0)
})
EOF2
  cat >"$d/vitest.config.ts" <<'EOF2'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['packages/*/test/**/*.test.ts'] },
})
EOF2
  commit_all "$d" tsconfig
  run_mootant "$d" r1 packages/web/src
  sed -i 's/"useDefineForClassFields": true/"useDefineForClassFields": false/' "$d/packages/web/tsconfig.app.json"
  run_mootant "$d" r2 packages/web/src
  run_mootant "$d" r3 packages/web/src --no-cache
  compare_runs tsconfig-reference r2 r3
}

# ---- node:test ----

TEMPLATE_NODE=$CACHE_ROOT/template-node

# NT1: node:test, fixture read outside the root.
nt_outside_root() {
  local d
  d=$(new_project nt-outside-root$SUFFIX "$TEMPLATE_NODE")
  local shared=$CACHE_ROOT/nt-outside-root-shared$SUFFIX
  rm -rf "$shared" && mkdir -p "$shared"
  echo "{ \"age\": $FROM }" >"$shared/limits.json"
  cat >"$d/test/math.test.js" <<EOF
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { isAdult, add } from '../src/math.js'

let limits = JSON.parse(readFileSync('$shared/limits.json', 'utf8'))

test('isAdult', () => {
  assert.equal(isAdult(limits.age), true)
  assert.equal(isAdult(5), false)
})

test('add', () => {
  assert.equal(add(2, 2), 4)
})
EOF
  commit_all "$d" outside
  run_mootant "$d" r1 src
  echo "{ \"age\": $TO }" >"$shared/limits.json"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs nt-outside-root$SUFFIX r2 r3
}

# NT2: node:test, a dependency in node_modules changes without lockfile change.
nt_node_modules_patch() {
  local d
  d=$(new_project nt-node-modules-patch "$TEMPLATE_NODE")
  mkdir -p "$d/node_modules/limits-pkg"
  echo '{ "name": "limits-pkg", "version": "1.0.0", "type": "module", "main": "index.js" }' >"$d/node_modules/limits-pkg/package.json"
  echo 'export default { age: 30 }' >"$d/node_modules/limits-pkg/index.js"
  sed -i "s#^import { isAdult, add } from '../src/math.js'#import limits from 'limits-pkg'\nimport { isAdult, add } from '../src/math.js'#; s#isAdult(30)#isAdult(limits.age)#" "$d/test/math.test.js"
  commit_all "$d" nm
  run_mootant "$d" r1 src
  echo 'export default { age: 18 }' >"$d/node_modules/limits-pkg/index.js"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs nt-node-modules-patch r2 r3
}

# NT3: node:test, the test loads an env file with process.loadEnvFile(), which
# Node reads in C++, past the node:fs wrappers; the variable it sets was not
# set when the process started, so its tracked hash is "not set" both times.
nt_load_env_file() {
  local d
  d=$(new_project nt-load-env-file$SUFFIX "$TEMPLATE_NODE")
  mkdir -p "$d/config"
  echo "BOUNDARY_AGE=$FROM" >"$d/config/test.env"
  sed -i "s#^import { isAdult, add } from '../src/math.js'#import { isAdult, add } from '../src/math.js'\n\nprocess.loadEnvFile(new URL('../config/test.env', import.meta.url))#; s#isAdult(30)#isAdult(Number(process.env.BOUNDARY_AGE))#" "$d/test/math.test.js"
  commit_all "$d" envfile
  run_mootant "$d" r1 src
  echo "BOUNDARY_AGE=$TO" >"$d/config/test.env"
  run_mootant "$d" r2 src
  run_mootant "$d" r3 src --no-cache
  compare_runs nt-load-env-file$SUFFIX r2 r3
}

for scenario in "$@"; do
  echo "=== $scenario ($(date -u +%H:%M:%S))"
  "$scenario"
done
