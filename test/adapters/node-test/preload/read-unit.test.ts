import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NodeTestUnit } from '../../../../adapters/node-test/types/node-test-unit'

import { readLineSync } from '../../../../adapters/node-test/preload/read-line-sync'
import { readUnit } from '../../../../adapters/node-test/preload/read-unit'

vi.mock(
  import('../../../../adapters/node-test/preload/read-line-sync'),
  () => ({
    readLineSync: vi.fn(),
  }),
)

let unit: NodeTestUnit = {
  expected: [{ occurrence: 0, name: 'a' }],
  plan: '/work/plan.json',
  out: '/work/out.jsonl',
  directory: '/work',
  mode: 'isolated',
  commonjs: false,
  hitLimit: 100,
  root: '/root',
  mutant: 'm1',
  bail: true,
}

/**
 * Exit of a fake process, which throws instead.
 */
let exit = vi.fn((): never => {
  throw new Error('exited')
})

describe('readUnit', () => {
  afterEach(() => {
    vi.mocked(readLineSync).mockReset()
    exit.mockClear()
  })

  it('reads the unit and removes the variable', () => {
    let environment: NodeJS.ProcessEnv = {
      MOOTANT_UNIT: JSON.stringify(unit),
      OTHER: '1',
    }

    expect(readUnit({ env: environment, exit }, true)).toStrictEqual(unit)
    expect(environment).toStrictEqual({ OTHER: '1' })
  })

  it('stays inert outside the main thread', () => {
    let environment: NodeJS.ProcessEnv = { MOOTANT_UNIT: JSON.stringify(unit) }

    expect(readUnit({ env: environment, exit }, false)).toBeNull()
    expect(environment).toStrictEqual({})
  })

  it('stays inert without the variable', () => {
    expect(readUnit({ env: {}, exit }, true)).toBeNull()
  })

  it('waits for the unit of a spare process on its descriptor', () => {
    vi.mocked(readLineSync).mockReturnValue(JSON.stringify(unit))
    let environment: NodeJS.ProcessEnv = { MOOTANT_UNIT_FD: '3', OTHER: '1' }

    expect(readUnit({ env: environment, exit }, true)).toStrictEqual(unit)
    expect(readLineSync).toHaveBeenCalledExactlyOnceWith(3)
    expect(environment).toStrictEqual({ OTHER: '1' })
  })

  it('ends a spare process that gets no unit', () => {
    vi.mocked(readLineSync).mockReturnValue(null)

    expect(() =>
      readUnit({ env: { MOOTANT_UNIT_FD: '3' }, exit }, true),
    ).toThrow('exited')
    expect(exit).toHaveBeenCalledExactlyOnceWith()
  })

  it('never reads the descriptor outside the main thread', () => {
    let environment: NodeJS.ProcessEnv = { MOOTANT_UNIT_FD: '3' }

    expect(readUnit({ env: environment, exit }, false)).toBeNull()
    expect(readLineSync).not.toHaveBeenCalled()
    expect(environment).toStrictEqual({})
  })
})
