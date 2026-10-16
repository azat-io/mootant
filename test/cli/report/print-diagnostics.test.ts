import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { printDiagnostics } from '../../../cli/report/print-diagnostics'
import { createTextStyle } from '../../helpers/create-text-style'
import { showEscapes } from '../../helpers/show-escapes'

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

  it('prints errors and warnings with their place, then an empty line', () => {
    printDiagnostics(
      [
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
      ],
      createTextStyle(),
    )

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      '✖ src/cart.ts: Tests fail with the switched file. [instrumentation-break]',
    )
    expect(consoleWarnSpy.mock.calls).toStrictEqual([
      ['▲ src/cart.ts:2:3: Unknown mutator "x". [unknown-mutator]'],
      [
        '▲ test/a.test.ts:4: "adds" gave different results. [unrepeatable-test]',
      ],
      ['▲ pool "threads" changed to "forks". [config-overridden]'],
      [''],
    ])
  })

  it('colors the marks and codes, in ASCII where Unicode is not shown', () => {
    printDiagnostics(
      [
        {
          code: 'instrumentation-break',
          message: 'Tests fail.',
          severity: 'error',
          column: null,
          file: null,
          line: null,
        },
        {
          code: 'config-overridden',
          severity: 'warning',
          message: 'Changed.',
          column: null,
          file: null,
          line: null,
        },
      ],
      createTextStyle({ unicode: false, colors: true }),
    )

    expect(showEscapes(String(consoleErrorSpy.mock.calls[0]![0]))).toBe(
      '<31>x<39> Tests fail. <90>[instrumentation-break]<39>',
    )
    expect(showEscapes(String(consoleWarnSpy.mock.calls[0]![0]))).toBe(
      '<33>!<39> Changed. <90>[config-overridden]<39>',
    )
  })

  it('prints nothing without diagnostics', () => {
    printDiagnostics([], createTextStyle())

    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })
})
