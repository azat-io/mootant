import { describe, expect, it } from 'vitest'

import type { NodeTestUnit } from '../../../../adapters/node-test/types/node-test-unit'

import { readUnit } from '../../../../adapters/node-test/preload/read-unit'

let unit: NodeTestUnit = {
  expected: [{ occurrence: 0, name: 'a' }],
  plan: '/work/plan.json',
  out: '/work/out.jsonl',
  mode: 'isolated',
  hitLimit: 100,
  root: '/root',
  mutant: 'm1',
  bail: true,
}

describe('readUnit', () => {
  it('reads the unit and removes the variable', () => {
    let environment: NodeJS.ProcessEnv = {
      MOOTANT_UNIT: JSON.stringify(unit),
      OTHER: '1',
    }

    expect(readUnit(environment, true)).toStrictEqual(unit)
    expect(environment).toStrictEqual({ OTHER: '1' })
  })

  it('stays inert outside the main thread', () => {
    let environment: NodeJS.ProcessEnv = { MOOTANT_UNIT: JSON.stringify(unit) }

    expect(readUnit(environment, false)).toBeNull()
    expect(environment).toStrictEqual({})
  })

  it('stays inert without the variable', () => {
    expect(readUnit({}, true)).toBeNull()
  })
})
