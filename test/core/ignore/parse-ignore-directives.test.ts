import { describe, expect, it } from 'vitest'

import type { IgnoreDirective } from '../../../types/ignore-directive'

import { parseIgnoreDirectives } from '../../../core/ignore/parse-ignore-directives'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Directive fields that depend on the comment text only.
 */
interface DirectiveSummary {
  /**
   * Accepted mutator ids, or null for every mutator.
   */
  mutators: IgnoreDirective['mutators']

  /**
   * Directive keyword without the prefix.
   */
  kind: IgnoreDirective['kind']

  /**
   * Given reason, or null.
   */
  reason: string | null
}

/**
 * Ids registered in the tests.
 */
let knownMutatorIds = new Set([
  'arithmetic-operator',
  'string-literal',
  'number-literal',
])

/**
 * Message of a malformed directive.
 */
const UNRECOGNIZED =
  'Use mootant-ignore-next-line, mootant-ignore-start, mootant-ignore-end or mootant-ignore-file.'

/**
 * Reads the directives of a snippet and keeps the fields that depend on the
 * comment text, and the warning messages.
 *
 * @param source - Text of the snippet.
 * @returns Directive summaries and warning messages.
 */
function summarize(source: string): {
  directives: DirectiveSummary[]
  messages: string[]
} {
  let { diagnostics, directives } = parseIgnoreDirectives(
    createTestFile(source).parsed,
    knownMutatorIds,
  )
  return {
    directives: directives.map(({ mutators, reason, kind }) => ({
      mutators,
      reason,
      kind,
    })),
    messages: diagnostics.map(({ message }) => message),
  }
}

describe('parseIgnoreDirectives', () => {
  it.each<{
    expected: DirectiveSummary
    messages: string[]
    source: string
  }>([
    {
      expected: { kind: 'next-line', mutators: null, reason: null },
      source: '// mootant-ignore-next-line',
      messages: [],
    },
    {
      expected: {
        mutators: ['string-literal', 'arithmetic-operator'],
        reason: 'log text',
        kind: 'next-line',
      },
      source:
        '// mootant-ignore-next-line string-literal, arithmetic-operator: log text',
      messages: [],
    },
    {
      expected: { reason: 'log text', kind: 'next-line', mutators: null },
      source: '// mootant-ignore-next-line: log text',
      messages: [],
    },
    {
      expected: { reason: 'spaced colon', kind: 'next-line', mutators: null },
      source: '// mootant-ignore-next-line : spaced colon',
      messages: [],
    },
    {
      expected: {
        reason: 'reason: with: colons',
        kind: 'next-line',
        mutators: null,
      },
      source: '// mootant-ignore-next-line: reason: with: colons',
      messages: [],
    },
    {
      expected: { kind: 'next-line', mutators: null, reason: null },
      source: '// mootant-ignore-next-line:   ',
      messages: [],
    },
    {
      messages: ['Unknown mutator "acme/no-await" in mootant-ignore-start.'],
      expected: { kind: 'start', mutators: [], reason: null },
      source: '// mootant-ignore-start acme/no-await',
    },
    {
      expected: {
        mutators: ['string-literal'],
        reason: 'done with strings',
        kind: 'end',
      },
      source: '// mootant-ignore-end string-literal: done with strings',
      messages: [],
    },
    {
      expected: { mutators: null, reason: null, kind: 'end' },
      source: '// mootant-ignore-end',
      messages: [],
    },
    {
      source: [
        '/* mootant-ignore-next-line',
        '   string-literal: multi',
        '   line reason */',
      ].join('\n'),
      expected: {
        mutators: ['string-literal'],
        reason: 'multi line reason',
        kind: 'next-line',
      },
      messages: [],
    },
    {
      messages: [
        'Unknown mutator "a" in mootant-ignore-next-line.',
        'Empty item in the mutator list of mootant-ignore-next-line.',
      ],
      expected: {
        mutators: ['string-literal'],
        kind: 'next-line',
        reason: null,
      },
      source: '// mootant-ignore-next-line a,,string-literal',
    },
    {
      expected: { mutators: ['string-literal'], reason: null, kind: 'file' },
      messages: ['Empty item in the mutator list of mootant-ignore-file.'],
      source: '// mootant-ignore-file string-literal,',
    },
    {
      messages: [
        'Invalid mutator id "StringLiteral" in mootant-ignore-next-line.',
        // spell-checker: disable-next-line
        'Unknown mutator "aritmetic-operator" in mootant-ignore-next-line. Did you mean "arithmetic-operator"?',
      ],
      // spell-checker: disable-next-line
      source: '// mootant-ignore-next-line StringLiteral, aritmetic-operator',
      expected: { kind: 'next-line', reason: null, mutators: [] },
    },
    {
      expected: {
        mutators: ['string-literal', 'number-literal'],
        kind: 'next-line',
        reason: null,
      },
      source:
        '// mootant-ignore-next-line string-literal, string-literal, number-literal',
      messages: [],
    },
    {
      expected: {
        mutators: ['string-literal'],
        reason: 'spaced reason',
        kind: 'start',
      },
      source: '//   mootant-ignore-start\tstring-literal  :  spaced \t reason ',
      messages: [],
    },
    {
      expected: { mutators: null, kind: 'file', reason: null },
      source: '/** mootant-ignore-file */',
      messages: [],
    },
    {
      source: [
        '/**',
        ' * Mootant-ignore-next-line string-literal: unit name',
        ' */',
      ].join('\n'),
      expected: {
        mutators: ['string-literal'],
        reason: 'unit name',
        kind: 'next-line',
      },
      messages: [],
    },
    {
      source: [
        '/*',
        ' * mootant-ignore-start string-literal,',
        ' * number-literal: legacy',
        ' */',
      ].join('\n'),
      expected: {
        mutators: ['string-literal', 'number-literal'],
        reason: 'legacy',
        kind: 'start',
      },
      messages: [],
    },
    {
      source: [
        '/*\r',
        ' ** mootant-ignore-start\u{2028}',
        ' * string-literal\u{2029}',
        ' */',
      ].join('\n'),
      expected: { mutators: ['string-literal'], kind: 'start', reason: null },
      messages: [],
    },
    {
      expected: {
        reason: 'shouting works too',
        kind: 'next-line',
        mutators: null,
      },
      source: '// MOOTANT-IGNORE-NEXT-LINE: shouting works too',
      messages: [],
    },
    {
      expected: { mutators: null, kind: 'start', reason: null },
      source: '// Mootant-Ignore-Start',
      messages: [],
    },
    {
      messages: [
        'Invalid mutator id "String-literal" in mootant-ignore-next-line.',
      ],
      expected: { kind: 'next-line', reason: null, mutators: [] },
      source: '// Mootant-ignore-next-line String-literal',
    },
  ])('reads $source', ({ messages, expected, source }) => {
    expect(summarize(source)).toStrictEqual({
      directives: [expected],
      messages,
    })
  })

  it.each([
    // spell-checker: disable-next-line
    ['// mootant-ignore-nextline', 'mootant-ignore-nextline'],
    ['// mootant-ignore', 'mootant-ignore'],
    [
      // spell-checker: disable-next-line
      '// mootant-ignore-next-linestring-literal',
      // spell-checker: disable-next-line
      'mootant-ignore-next-linestring-literal',
    ],
    ['// mootant-ignore: reason', 'mootant-ignore: reason'],
    ['// mootant-ignore-', 'mootant-ignore-'],
    ['/* mootant-ignore-everything */', 'mootant-ignore-everything'],
  ])('warns about the malformed directive %j', (source, text) => {
    expect(summarize(source)).toStrictEqual({
      messages: [`Unrecognized ignore directive "${text}". ${UNRECOGNIZED}`],
      directives: [],
    })
  })

  it.each([
    '// mootant-ignored on purpose',
    '// TODO mootant-ignore-next-line',
    '/** Unit of the value. mootant-ignore-next-line */',
    ['/**', ' * Unit of the value.', ' * mootant-ignore-next-line', ' */'].join(
      '\n',
    ),
    '// an ordinary comment',
    "let text = '// mootant-ignore-file'",
    'let text = `/* mootant-ignore-file */`',
  ])('ignores the ordinary comment or text %j', source => {
    expect(summarize(source)).toStrictEqual({ directives: [], messages: [] })
  })

  it('records the offsets and positions of the comment', () => {
    let source = [
      'let a = 1',
      '  /* mootant-ignore-next-line',
      '     string-literal */',
      'let b = 2 // mootant-ignore-file',
    ].join('\n')

    expect(
      parseIgnoreDirectives(createTestFile(source).parsed, knownMutatorIds),
    ).toStrictEqual({
      directives: [
        {
          mutators: ['string-literal'],
          kind: 'next-line',
          reason: null,
          endLine: 3,
          column: 3,
          start: 12,
          line: 2,
          end: 62,
        },
        {
          mutators: null,
          kind: 'file',
          reason: null,
          column: 11,
          endLine: 4,
          start: 73,
          line: 4,
          end: 95,
        },
      ],
      diagnostics: [],
    })
  })

  it('positions warnings at the comment start', () => {
    let source = [
      'let a = 1',
      // spell-checker: disable-next-line
      '  // mootant-ignore-nextline',
      // spell-checker: disable-next-line
      'let b = 2 /* mootant-ignore-start strng-literal */',
    ].join('\n')

    expect(
      parseIgnoreDirectives(createTestFile(source).parsed, knownMutatorIds)
        .diagnostics,
    ).toStrictEqual([
      {
        // spell-checker: disable-next-line
        message: `Unrecognized ignore directive "mootant-ignore-nextline". ${UNRECOGNIZED}`,
        code: 'malformed-directive',
        severity: 'warning',
        file: 'example.ts',
        column: 3,
        line: 2,
      },
      {
        message:
          // spell-checker: disable-next-line
          'Unknown mutator "strng-literal" in mootant-ignore-start. Did you mean "string-literal"?',
        code: 'unknown-mutator',
        severity: 'warning',
        file: 'example.ts',
        column: 11,
        line: 3,
      },
    ])
  })

  it('reads every directive of a file in source order', () => {
    let source = [
      '// mootant-ignore-start',
      'let a = 1 // mootant-ignore-next-line',
      '/* mootant-ignore-end */ let b = 2',
      '// mootant-ignore-file: generated',
    ].join('\n')

    expect(summarize(source).directives.map(({ kind }) => kind)).toStrictEqual([
      'start',
      'next-line',
      'end',
      'file',
    ])
  })

  it('suggests nothing when no mutator is registered', () => {
    let { parsed } = createTestFile(
      '// mootant-ignore-next-line string-literal',
    )

    expect(
      parseIgnoreDirectives(parsed, new Set()).diagnostics.map(
        ({ message }) => message,
      ),
    ).toStrictEqual([
      'Unknown mutator "string-literal" in mootant-ignore-next-line.',
    ])
  })
})
