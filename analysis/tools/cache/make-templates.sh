#!/usr/bin/env bash
# Creates the two template projects the scenarios copy (sources as files,
# node_modules as hard links): template-vitest (Vitest 5.0.5, Vite 8.3.5) and
# template-node (node:test, the same node_modules).
# npm 10 fails to resolve the peer set of vitest@5.0.5 ("Cannot read
# properties of null (reading 'edgesOut')"), hence --legacy-peer-deps and the
# explicit vite.
set -eu
root=${CACHE_ROOT:-/home/user/projects/cache}
tgz=/home/user/artifacts/mootant-0.1.0-170ec52.tgz

mkdir -p "$root/template-vitest/src" "$root/template-vitest/test"
cd "$root/template-vitest"
cat >package.json <<'JSON'
{
  "name": "cache-fixture",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
JSON
cat >vitest.config.ts <<'TS'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
TS
cat >src/math.ts <<'TS'
export function isAdult(age: number): boolean {
  return age >= 18
}

export function add(a: number, b: number): number {
  return a + b
}
TS
cat >test/math.test.ts <<'TS'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'

it('isAdult', () => {
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
TS
npm i -D --legacy-peer-deps "$tgz" vitest@5.0.5 vite@8.3.5

mkdir -p "$root/template-node/src" "$root/template-node/test"
cd "$root/template-node"
cat >package.json <<'JSON'
{
  "name": "cache-fixture-node",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
JSON
cat >src/math.js <<'JS'
export function isAdult(age) {
  return age >= 18
}

export function add(a, b) {
  return a + b
}
JS
cat >test/math.test.js <<'JS'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isAdult, add } from '../src/math.js'

test('isAdult', () => {
  assert.equal(isAdult(30), true)
  assert.equal(isAdult(5), false)
})

test('add', () => {
  assert.equal(add(2, 2), 4)
})
JS
rm -rf node_modules
cp -al "$root/template-vitest/node_modules" node_modules
cp "$root/template-vitest/package-lock.json" .
