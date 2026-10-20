import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { ListResult } from '../../types/report/list-result'
import type { Diagnostic } from '../../types/mutant/diagnostic'

import { listMutants } from '../../core/list-mutants'
import { runList } from '../../cli/run-list'

vi.mock(import('../../core/list-mutants'))

/**
 * Warning of the run without a file.
 */
let skippedPath: Diagnostic = {
  message: 'Skipped notes.md: not a JavaScript or TypeScript source file.',
  code: 'skipped-path',
  severity: 'warning',
  column: null,
  file: null,
  line: null,
}

/**
 * Warning of a file with a position.
 */
let unknownMutator: Diagnostic = {
  // spell-checker: disable-next-line
  message: 'Unknown mutator "strng-literal" in mootant-ignore-next-line.',
  code: 'unknown-mutator',
  severity: 'warning',
  file: 'example.ts',
  column: 1,
  line: 1,
}

/**
 * Error of a file without a position.
 */
let readError: Diagnostic = {
  message: 'Cannot read the file (EACCES).',
  code: 'read-error',
  severity: 'error',
  file: 'locked.ts',
  column: null,
  line: null,
}

/**
 * Creates the result of a run that lists one mutant of `example.ts`.
 *
 * @param diagnostics - Problems of the run.
 * @returns List result.
 */
function createResult(diagnostics: Diagnostic[]): ListResult {
  return {
    files: [
      {
        mutants: [
          {
            mutator: 'string-literal',
            id: '000000000001',
            kind: 'expression',
            file: 'example.ts',
            status: 'Pending',
            replacement: "''",
            ignoredBy: null,
            reason: null,
            scope: null,
            start: 11,
            end: 15,
          },
        ],
        absolute: '/repo/example.ts',
        source: "let unit = 'cm'",
        file: 'example.ts',
        diagnostics: [],
        parsed: true,
        skipped: [],
      },
    ],
    mutators: [
      {
        mutator: {
          meta: { description: 'Empties a string literal.' },
          create: () => ({}),
        },
        id: 'string-literal',
        options: {},
        rank: 0,
      },
    ],
    preset: 'recommended',
    skipped: false,
    since: null,
    diagnostics,
  }
}

describe('runList', () => {
  let consoleErrorSpy: MockInstance<typeof console.error>
  let consoleInfoSpy: MockInstance<typeof console.info>
  let consoleWarnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    vi.stubEnv('NO_COLOR', '1')
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = undefined
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('passes the options and the working directory to the run', async () => {
    vi.mocked(listMutants).mockResolvedValue(createResult([]))

    await runList({
      paths: ['src', 'lib'],
      preset: 'strict',
      verbose: false,
      skipped: true,
      since: 'main',
      json: false,
    })

    expect(listMutants).toHaveBeenCalledExactlyOnceWith({
      paths: ['src', 'lib'],
      cwd: process.cwd(),
      preset: 'strict',
      since: 'main',
      skipped: true,
    })
  })

  it('prints the text report and leaves the exit code alone', async () => {
    vi.mocked(listMutants).mockResolvedValue(createResult([]))

    await runList({
      preset: 'recommended',
      paths: ['src'],
      skipped: false,
      verbose: false,
      json: false,
    })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      [
        `● mootant list src --preset recommended${' '.repeat(3)}preset recommended`,
        '',
        'mutants         1 in 1 file',
        '',
        'example.ts',
        "  1:12  string-literal  'cm' → ''  0000",
      ].join('\n'),
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints diagnostics to stderr in text mode', async () => {
    vi.mocked(listMutants).mockResolvedValue(
      createResult([readError, unknownMutator, skippedPath]),
    )

    await runList({
      preset: 'recommended',
      paths: ['src'],
      skipped: false,
      verbose: false,
      json: false,
    })

    expect(consoleWarnSpy.mock.calls).toStrictEqual([
      [
        '▲ Skipped notes.md: not a JavaScript or TypeScript source file. [skipped-path]',
      ],
      [
        // spell-checker: disable-next-line
        '▲ example.ts:1:1: Unknown mutator "strng-literal" in mootant-ignore-next-line. [unknown-mutator]',
      ],
      [''],
    ])
    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      '✖ locked.ts: Cannot read the file (EACCES). [read-error]',
    )
    expect(consoleWarnSpy.mock.invocationCallOrder.at(-1)).toBeLessThan(
      consoleInfoSpy.mock.invocationCallOrder[0]!,
    )
    expect(process.exitCode).toBe(1)
  })

  it('prints only the JSON document in JSON mode', async () => {
    vi.mocked(listMutants).mockResolvedValue(
      createResult([readError, skippedPath]),
    )

    await runList({
      preset: 'recommended',
      paths: ['src'],
      skipped: false,
      verbose: false,
      json: true,
    })

    let [[output]] = consoleInfoSpy.mock.calls as [[string]]

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^\{"[^\n]+\}$/u),
    )
    expect(JSON.parse(output)).toMatchObject({
      summary: { totalWarnings: 1, totalErrors: 1 },
      diagnostics: [skippedPath, readError],
      schemaVersion: 3,
    })
    expect(JSON.parse(output)).not.toHaveProperty('mutators')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('prints the full JSON report with --verbose', async () => {
    vi.mocked(listMutants).mockResolvedValue(createResult([]))

    await runList({
      preset: 'recommended',
      paths: ['src'],
      skipped: false,
      verbose: true,
      json: true,
    })

    let [[output]] = consoleInfoSpy.mock.calls as [[string]]

    expect(JSON.parse(output)).toMatchObject({
      mutants: [{ kind: 'expression', start: 11 }],
      mutators: [{ id: 'string-literal' }],
      since: null,
    })
  })

  it('reports a failed run and sets the exit code', async () => {
    vi.mocked(listMutants).mockRejectedValue(
      new Error('Paths not found: src/missing.ts, lib.'),
    )

    await runList({
      preset: 'recommended',
      paths: ['src'],
      skipped: false,
      verbose: false,
      json: false,
    })

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      'Error: Paths not found: src/missing.ts, lib.',
    )
    expect(consoleInfoSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
