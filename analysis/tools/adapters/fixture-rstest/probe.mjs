import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { createRstest } from '@rstest/core/api'

let root = import.meta.dirname
let out = path.join(root, 'probe-out.jsonl')
let planFile = path.join(root, 'probe-plan.json')
let SWITCHED = `export function applyDiscount(price, percent) {
  if (percent > 100) {
    throw new RangeError('percent must be at most 100')
  }
  return globalThis.__mootant.hit('m1') ? price + (price * percent) / 100 : price - (price * percent) / 100
}

export function isFree(price) {
  return price <= 0
}
`
let transforms = 0
let results = []
let reporter = {
  onTestCaseResult(result) {
    results.push({ id: result.testId, status: result.status, name: result.name, error: result.errors?.[0]?.message?.split('\n')[0] ?? null })
  },
}
let plugin = {
  name: 'mootant-probe',
  setup(api) {
    api.transform({ test: /src[\\/]price\.js$/u }, () => {
      transforms += 1
      return SWITCHED
    })
  },
}
let started = performance.now()
let rstest = await createRstest({
  cwd: root,
  config: {
    include: ['test/**/*.test.js'],
    setupFiles: ['./setup/mootant-setup.js'],
    plugins: [plugin],
    reporters: [reporter],
    pool: { type: 'forks' },
    isolate: true,
    env: { PROBE_OUT: out, PROBE_PLAN: planFile },
  },
})
console.log('createRstest ms', Math.round(performance.now() - started), 'version', rstest.context.version)
let file = path.join(root, 'test/price.test.js')
for (let [label, active, filters] of [
  ['dry', null, ['"test/price.test.js"']],
  ['unit m1', 'm1', ['"test/price.test.js"']],
  ['unit m1 again', 'm1', ['"test/price.test.js"']],
  ['same file twice', 'm1', ['"test/price.test.js"', '"test/price.test.js"']],
  ['related src/price.js', null, ['src/price.js']],
]) {
  rmSync(out, { force: true })
  writeFileSync(out, '')
  writeFileSync(planFile, JSON.stringify({ [file]: active }))
  results = []
  let before = transforms
  let begun = performance.now()
  let result = await rstest.run({ filters, related: label.startsWith('related') })
  let records = readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  console.log(JSON.stringify({
    label,
    ms: Math.round(performance.now() - begun),
    status: result.status,
    transforms: transforms - before,
    setups: records.filter(record => record.kind === 'setup').map(record => ({ pid: record.pid, testPath: path.relative(root, record.testPath ?? ''), active: record.active })),
    tries: records.filter(record => record.kind === 'close').map(record => ({ id: record.id, reached: record.reached })),
    results: results.map(entry => `${entry.status}:${entry.name}${entry.error ? ` (${entry.error})` : ''}`),
  }))
}
