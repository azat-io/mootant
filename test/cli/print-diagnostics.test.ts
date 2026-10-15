import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { printDiagnostics } from '../../cli/print-diagnostics'

describe('printDiagnostics', () => {
  let consoleErrorSpy: MockInstance<typeof console.error>
  let consoleWarnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints errors and warnings with their place', () => {
    printDiagnostics([
      {
        message: 'Tests fail with the switched file.',
        code: 'instrumentation-break',
        file: 'src/cart.ts',
        severity: 'error',
        column: null,
        line: null,
      },
      {
        message: 'Unknown mutator "x".',
        code: 'unknown-mutator',
        severity: 'warning',
        file: 'src/cart.ts',
        column: 3,
        line: 2,
      },
      {
        message: '"adds" gave different results.',
        code: 'unrepeatable-test',
        file: 'test/a.test.ts',
        severity: 'warning',
        column: null,
        line: 4,
      },
      {
        message: 'pool "threads" changed to "forks".',
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      },
    ])

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      'src/cart.ts: error: Tests fail with the switched file. [instrumentation-break]',
    )
    expect(consoleWarnSpy.mock.calls).toStrictEqual([
      ['src/cart.ts:2:3: warning: Unknown mutator "x". [unknown-mutator]'],
      [
        'test/a.test.ts:4: warning: "adds" gave different results. [unrepeatable-test]',
      ],
      ['warning: pool "threads" changed to "forks". [config-overridden]'],
    ])
  })
})
