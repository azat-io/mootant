import { describe, expect, it } from 'vitest'

import type { ActiveMutator } from '../../../types/mutator/active-mutator'
import type { FileMutants } from '../../../types/mutant/file-mutants'
import type { ListResult } from '../../../types/report/list-result'
import type { Diagnostic } from '../../../types/mutant/diagnostic'
import type { Mutant } from '../../../types/mutant/mutant'

import { buildListReport } from '../../../cli/report/build-list-report'

/**
 * Creates a pending mutant of `example.ts`.
 *
 * @param overrides - Fields that differ from the default mutant.
 * @returns Mutant as core returns it.
 */
function createMutant(overrides: Partial<Mutant>): Mutant {
  return {
    mutator: 'string-literal',
    id: '000000000001',
    kind: 'expression',
    file: 'example.ts',
    status: 'Pending',
    replacement: "''",
    ignoredBy: null,
    reason: null,
    scope: null,
    start: 0,
    end: 0,
    ...overrides,
  }
}

/**
 * Creates the result of a run with one mutator and the given files.
 *
 * @param files - Results of the listed files.
 * @param diagnostics - Problems of the run.
 * @returns List result.
 */
function createResult(
  files: FileMutants[],
  diagnostics: Diagnostic[] = [],
): ListResult {
  return {
    mutators: [
      createActiveMutator('string-literal', 'Empties a string literal.'),
    ],
    preset: 'recommended',
    skipped: false,
    diagnostics,
    files,
  }
}

/**
 * Creates a warning of `example.ts` at line 1, column 1.
 *
 * @param overrides - Fields that differ from the default diagnostic.
 * @returns Diagnostic with the given fields.
 */
function createDiagnostic(overrides: Partial<Diagnostic>): Diagnostic {
  return {
    message: 'Something needs attention.',
    code: 'malformed-directive',
    severity: 'warning',
    file: 'example.ts',
    column: 1,
    line: 1,
    ...overrides,
  }
}

/**
 * Creates a mutator a preset turned on.
 *
 * @param id - Full id the registry gave the mutator.
 * @param description - Sentence of its meta.
 * @returns Active mutator without visitors.
 */
function createActiveMutator(id: string, description: string): ActiveMutator {
  return {
    mutator: { meta: { description }, create: () => ({}) },
    options: {},
    rank: 0,
    id,
  }
}

describe('buildListReport', () => {
  it.each([
    {
      expected: {
        diff: {
          before: ['let total = first +', '  second'],
          after: ["let total = ''"],
          cutStart: 0,
          cutEnd: 0,
        },
        endColumn: 9,
        column: 13,
        endLine: 2,
        line: 1,
      },
      source: ['let total = first +', '  second', 'done()'].join('\n'),
      fragment: 'first +\n  second',
      given: 'a multi-line mutant',
    },
    {
      expected: {
        diff: {
          before: ['let total = first +', '  second'],
          after: ["let total = ''"],
          cutStart: 0,
          cutEnd: 0,
        },
        endColumn: 9,
        column: 13,
        endLine: 2,
        line: 1,
      },
      source: ['let total = first +', '  second', 'done()'].join('\r\n'),
      fragment: 'first +\r\n  second',
      given: 'CRLF line breaks',
    },
    {
      expected: {
        diff: {
          before: ['let value = 1'],
          after: ["let value = ''"],
          cutStart: 0,
          cutEnd: 0,
        },
        endColumn: 14,
        column: 13,
        endLine: 1,
        line: 1,
      },
      source: `${String.fromCodePoint(0xfe_ff)}let value = 1`,
      given: 'a byte order mark',
      fragment: '1',
    },
    {
      expected: {
        diff: { before: ['second()'], after: ["''"], cutStart: 0, cutEnd: 0 },
        endColumn: 9,
        endLine: 2,
        column: 1,
        line: 2,
      },
      given: 'the last line without a line break',
      source: ['first()', 'second()'].join('\n'),
      fragment: 'second()',
    },
    {
      expected: {
        diff: { before: ['first()'], after: ["''"], cutStart: 0, cutEnd: 0 },
        endColumn: 8,
        endLine: 1,
        column: 1,
        line: 1,
      },
      source: ['first()', 'second()'].join('\r'),
      given: 'a CR line break',
      fragment: 'first()',
    },
    {
      expected: {
        diff: { before: ['first()'], after: ["''"], cutStart: 0, cutEnd: 0 },
        endColumn: 8,
        endLine: 1,
        column: 1,
        line: 1,
      },
      source: ['first()', 'second()'].join('\u{2028}'),
      given: 'a line separator',
      fragment: 'first()',
    },
  ])('computes positions for $given', ({ fragment, expected, source }) => {
    let start = source.indexOf(fragment)
    let end = start + fragment.length

    let report = buildListReport(
      createResult([
        {
          mutants: [createMutant({ start, end })],
          absolute: '/repo/example.ts',
          file: 'example.ts',
          diagnostics: [],
          parsed: true,
          skipped: [],
          source,
        },
      ]),
    )

    expect(report.mutants).toStrictEqual([
      {
        mutator: 'string-literal',
        id: '000000000001',
        kind: 'expression',
        original: fragment,
        file: 'example.ts',
        status: 'Pending',
        replacement: "''",
        ignoredBy: null,
        reason: null,
        scope: null,
        start,
        end,
        ...expected,
      },
    ])
  })

  it('builds the report of a run with unparsed files', () => {
    let source = ["emit('add')", "let unit = 'cm'"].join('\n')
    let readError = createDiagnostic({
      message: 'Cannot read the file (EACCES).',
      code: 'read-error',
      severity: 'error',
      file: 'locked.ts',
      column: null,
      line: null,
    })
    let parseError = createDiagnostic({
      message: 'Unexpected token',
      code: 'parse-error',
      file: 'broken.ts',
      severity: 'error',
      column: 9,
      line: 3,
    })
    let skippedPath = createDiagnostic({
      message: 'Skipped notes.md: not a JavaScript or TypeScript source file.',
      code: 'skipped-path',
      column: null,
      file: null,
      line: null,
    })
    let ignoreSource = {
      directive: 'mootant-ignore-next-line',
      column: 1,
      line: 1,
    } as const
    let result: ListResult = {
      files: [
        {
          mutants: [
            createMutant({
              ignoredBy: ignoreSource,
              reason: 'event name',
              status: 'Ignored',
              file: 'cart.ts',
              start: 5,
              end: 10,
            }),
            createMutant({
              id: '000000000002',
              file: 'cart.ts',
              scope: 'unit',
              start: 23,
              end: 27,
            }),
          ],
          absolute: '/repo/example.ts',
          diagnostics: [],
          file: 'cart.ts',
          parsed: true,
          skipped: [],
          source,
        },
        {
          absolute: '/repo/example.ts',
          diagnostics: [parseError],
          source: 'let value = (',
          file: 'broken.ts',
          parsed: false,
          skipped: [],
          mutants: [],
        },
        {
          absolute: '/repo/example.ts',
          diagnostics: [readError],
          file: 'locked.ts',
          parsed: false,
          source: null,
          skipped: [],
          mutants: [],
        },
        {
          absolute: '/repo/example.ts',
          source: 'export {}',
          file: 'empty.ts',
          diagnostics: [],
          parsed: true,
          skipped: [],
          mutants: [],
        },
      ],
      mutators: [
        createActiveMutator(
          'arithmetic-operator',
          'Replaces an arithmetic operator with its inverse.',
        ),
        createActiveMutator('string-literal', 'Empties a string literal.'),
      ],
      diagnostics: [skippedPath],
      preset: 'strict',
      skipped: false,
    }

    let report = buildListReport(result)

    expect(report).toStrictEqual({
      mutants: [
        {
          diff: {
            before: ["emit('add')"],
            after: ["emit('')"],
            cutStart: 0,
            cutEnd: 0,
          },
          mutator: 'string-literal',
          ignoredBy: ignoreSource,
          reason: 'event name',
          id: '000000000001',
          kind: 'expression',
          original: "'add'",
          replacement: "''",
          status: 'Ignored',
          file: 'cart.ts',
          endColumn: 11,
          scope: null,
          endLine: 1,
          column: 6,
          start: 5,
          line: 1,
          end: 10,
        },
        {
          diff: {
            before: ["let unit = 'cm'"],
            after: ["let unit = ''"],
            cutStart: 0,
            cutEnd: 0,
          },
          mutator: 'string-literal',
          id: '000000000002',
          kind: 'expression',
          replacement: "''",
          status: 'Pending',
          original: "'cm'",
          ignoredBy: null,
          file: 'cart.ts',
          endColumn: 16,
          scope: 'unit',
          reason: null,
          column: 12,
          endLine: 2,
          start: 23,
          line: 2,
          end: 27,
        },
      ],
      mutators: [
        {
          description: 'Replaces an arithmetic operator with its inverse.',
          id: 'arithmetic-operator',
          mutants: 0,
        },
        {
          description: 'Empties a string literal.',
          id: 'string-literal',
          mutants: 2,
        },
      ],
      files: [
        { file: 'cart.ts', parsed: true, mutants: 2 },
        { file: 'broken.ts', parsed: false, mutants: 0 },
        { file: 'locked.ts', parsed: false, mutants: 0 },
        { file: 'empty.ts', parsed: true, mutants: 0 },
      ],
      summary: {
        totalWarnings: 1,
        totalMutants: 2,
        totalPending: 1,
        totalIgnored: 1,
        totalErrors: 2,
        totalFiles: 4,
      },
      diagnostics: [skippedPath, parseError, readError],
      schemaVersion: 2,
      preset: 'strict',
      command: 'list',
    })
  })

  it.each([
    {
      second: createDiagnostic({ file: 'example.ts' }),
      first: createDiagnostic({ file: null }),
      given: 'problems of the run first',
    },
    {
      second: createDiagnostic({ file: 'b.ts' }),
      first: createDiagnostic({ file: 'a.ts' }),
      given: 'files by name',
    },
    {
      first: createDiagnostic({ column: null, line: null }),
      given: 'problems without a line first',
      second: createDiagnostic({ line: 1 }),
    },
    {
      second: createDiagnostic({ line: 10 }),
      first: createDiagnostic({ line: 2 }),
      given: 'lines as numbers',
    },
    {
      first: createDiagnostic({ column: null }),
      given: 'problems without a column first',
      second: createDiagnostic({ column: 1 }),
    },
    {
      second: createDiagnostic({ column: 12 }),
      first: createDiagnostic({ column: 3 }),
      given: 'columns as numbers',
    },
    {
      first: createDiagnostic({ code: 'malformed-directive' }),
      second: createDiagnostic({ code: 'unknown-mutator' }),
      given: 'codes',
    },
    {
      second: createDiagnostic({ message: 'Second problem.' }),
      first: createDiagnostic({ message: 'First problem.' }),
      given: 'messages',
    },
  ])('sorts diagnostics by $given', ({ second, first }) => {
    let forward = buildListReport(createResult([], [first, second]))
    let backward = buildListReport(createResult([], [second, first]))

    expect(forward.diagnostics).toStrictEqual([first, second])
    expect(backward.diagnostics).toStrictEqual([first, second])
  })

  it('lists skipped candidates with positions and counts them by category', () => {
    let source = ['let unit = a === null', "f('cm')"].join('\n')
    let files: FileMutants[] = [
      {
        skipped: [
          {
            reason: 'the type hints prove the comparison is always false',
            mutator: 'comparison-operator',
            rule: 'proven-comparison',
            category: 'equivalent',
            replacement: 'false',
            file: 'example.ts',
            kind: 'expression',
            heuristic: true,
            start: 11,
            by: null,
            end: 21,
          },
          {
            by: { mutator: 'string-literal', id: '000000000001', start: 24 },
            reason: 'it produces the same mutated file',
            mutator: 'string-literal',
            category: 'duplicate',
            file: 'example.ts',
            kind: 'expression',
            rule: 'duplicate',
            replacement: "''",
            heuristic: false,
            start: 24,
            end: 28,
          },
        ],
        mutants: [createMutant({ start: 24, end: 28 })],
        absolute: '/repo/example.ts',
        file: 'example.ts',
        diagnostics: [],
        parsed: true,
        source,
      },
      {
        absolute: '/repo/example.ts',
        file: 'locked.ts',
        diagnostics: [],
        parsed: false,
        source: null,
        skipped: [],
        mutants: [],
      },
    ]
    let report = buildListReport({ ...createResult(files), skipped: true })

    expect(report.skipped).toStrictEqual([
      {
        reason: 'the type hints prove the comparison is always false',
        mutator: 'comparison-operator',
        rule: 'proven-comparison',
        category: 'equivalent',
        original: 'a === null',
        replacement: 'false',
        file: 'example.ts',
        heuristic: true,
        column: 12,
        start: 11,
        by: null,
        line: 1,
        end: 21,
      },
      {
        by: {
          mutator: 'string-literal',
          id: '000000000001',
          column: 3,
          line: 2,
        },
        reason: 'it produces the same mutated file',
        mutator: 'string-literal',
        category: 'duplicate',
        file: 'example.ts',
        rule: 'duplicate',
        replacement: "''",
        heuristic: false,
        original: "'cm'",
        column: 3,
        start: 24,
        line: 2,
        end: 28,
      },
    ])
    expect(report.summary).toMatchObject({
      skippedByCategory: {
        equivalent: 1,
        duplicate: 1,
        subsumed: 0,
        timeout: 0,
        invalid: 0,
        owned: 0,
        noise: 0,
      },
      totalSkipped: 2,
    })
  })

  it('leaves the skipped fields out of a run that did not ask for them', () => {
    let report = buildListReport(createResult([]))

    expect(Object.keys(report)).not.toContain('skipped')
    expect(Object.keys(report.summary)).toStrictEqual([
      'totalWarnings',
      'totalIgnored',
      'totalFiles',
      'totalMutants',
      'totalPending',
      'totalErrors',
    ])
  })

  it('reports the focus of a mutant and of a skipped candidate', () => {
    let source = 'x = /^a$/'
    let focus = { start: 5, text: '', end: 6 }
    let report = buildListReport({
      ...createResult([
        {
          skipped: [
            {
              reason: 'the new regular expression would not compile',
              mutator: 'string-literal',
              rule: 'invalid-regex',
              category: 'invalid',
              replacement: '/a$/',
              file: 'example.ts',
              kind: 'expression',
              heuristic: false,
              start: 4,
              by: null,
              end: 9,
              focus,
            },
          ],
          mutants: [
            createMutant({ replacement: '/a$/', start: 4, end: 9, focus }),
          ],
          absolute: '/repo/example.ts',
          file: 'example.ts',
          diagnostics: [],
          parsed: true,
          source,
        },
      ]),
      skipped: true,
    })
    let expected = {
      replacement: '',
      original: '^',
      column: 6,
      start: 5,
      line: 1,
      end: 6,
    }

    expect(report.mutants[0]).toMatchObject({ focus: expected, column: 5 })
    expect(report.skipped![0]).toMatchObject({ focus: expected, column: 5 })
  })
})
