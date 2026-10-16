import { describe, expect, it } from 'vitest'

import type { ParsedFile } from '../../../types/source/parsed-file'
import type { IgnoreRule } from '../../../types/mutant/ignore-rule'
import type { Diagnostic } from '../../../types/mutant/diagnostic'

import { parseIgnoreDirectives } from '../../../core/ignore/parse-ignore-directives'
import { createIgnoreRules } from '../../../core/ignore/create-ignore-rules'
import { getSourcePosition } from '../../../core/text/get-source-position'
import { findIgnoreRule } from '../../../core/ignore/find-ignore-rule'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Rules of a snippet with the parsed file they belong to.
 */
interface SnippetRules {
  /**
   * Warnings about unbalanced region markers.
   */
  diagnostics: Diagnostic[]

  /**
   * Rules of the snippet.
   */
  rules: IgnoreRule[]

  /**
   * Parsed snippet.
   */
  parsed: ParsedFile
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
 * Finds the reason a mutant of a mutator gets when it starts at the first
 * occurrence of a text.
 *
 * @param snippet - Rules of a snippet.
 * @param text - Text the mutant starts at.
 * @param mutator - Mutator id of the mutant.
 * @returns Reason of the winning rule, or null when the mutant runs.
 */
function findReason(
  snippet: SnippetRules,
  text: string,
  mutator: string = 'string-literal',
): string | null {
  let start = snippet.parsed.text.indexOf(text)
  let { line } = getSourcePosition(snippet.parsed.lineStarts, start)
  return findIgnoreRule(snippet.rules, { mutator, start, line })?.reason ?? null
}

/**
 * Parses a snippet and builds its ignore rules.
 *
 * @param lines - Source lines, joined with line feeds.
 * @returns Parsed file, rules and warnings.
 */
function createSnippetRules(lines: string[]): SnippetRules {
  let { parsed } = createTestFile(lines.join('\n'))
  let { directives } = parseIgnoreDirectives(parsed, knownMutatorIds)
  return { ...createIgnoreRules(parsed, directives), parsed }
}

describe('createIgnoreRules', () => {
  it('covers the line after the last line of a multi-line block comment', () => {
    let { diagnostics, parsed, rules } = createSnippetRules([
      'let a = 1',
      '/* mootant-ignore-next-line',
      '   string-literal */',
      "let b = 'b'",
      "let c = 'c'",
    ])

    expect(rules).toStrictEqual([
      {
        source: { directive: 'mootant-ignore-next-line', column: 1, line: 2 },
        reason: 'Ignored by mootant-ignore-next-line on line 2',
        start: parsed.text.indexOf('let b'),
        end: parsed.text.indexOf('let c'),
        mutators: ['string-literal'],
        kind: 'next-line',
        order: 10,
        line: 4,
      },
    ])
    expect(diagnostics).toStrictEqual([])
  })

  it.each([
    {
      lines: ['// mootant-ignore-next-line', 'let b = 1'],
      start: '// mootant-ignore-next-line\n'.length,
      name: 'the last line',
    },
    {
      start: 'let a = 1 // mootant-ignore-next-line'.length,
      lines: ['let a = 1 // mootant-ignore-next-line'],
      name: 'a line past the end of the file',
    },
  ])('bounds a next-line rule that covers $name', ({ lines, start }) => {
    let { parsed, rules } = createSnippetRules(lines)

    expect(rules.map(rule => [rule.start, rule.end])).toStrictEqual([
      [start, parsed.text.length],
    ])
  })

  it('covers the whole file with a file directive, wherever it is', () => {
    let { parsed, rules } = createSnippetRules([
      'let a = 1',
      '  // mootant-ignore-file: generated',
    ])

    expect(rules).toStrictEqual([
      {
        source: { directive: 'mootant-ignore-file', column: 3, line: 2 },
        end: parsed.text.length,
        reason: 'generated',
        mutators: null,
        kind: 'file',
        line: null,
        order: 12,
        start: 0,
      },
    ])
  })

  it('credits a region to its start comment and spans the text between the comments', () => {
    let { diagnostics, parsed, rules } = createSnippetRules([
      'let a = 1 // MOOTANT-IGNORE-START string-literal',
      "let b = 'b'",
      '/* mootant-ignore-end string-literal: done */ let c = 2',
    ])
    let startComment = parsed.comments[0]!

    expect(rules).toStrictEqual([
      {
        source: { directive: 'mootant-ignore-start', column: 11, line: 1 },
        reason: 'Ignored by mootant-ignore-start on line 1',
        end: parsed.comments[1]!.start,
        mutators: ['string-literal'],
        order: startComment.start,
        start: startComment.end,
        kind: 'region',
        line: null,
      },
    ])
    expect(diagnostics).toStrictEqual([])
  })

  it('keeps a mutant that starts before a trailing start comment out of the region', () => {
    let snippet = createSnippetRules([
      'x = 1 + 2 // mootant-ignore-start',
      'y = 3 * 4 // mootant-ignore-end',
      'z = 5 + 6',
    ])

    expect(
      ['1 + 2', '3 * 4', '5 + 6'].map(text =>
        findReason(snippet, text, 'arithmetic-operator'),
      ),
    ).toStrictEqual([null, 'Ignored by mootant-ignore-start on line 1', null])
  })

  it('nests regions, the innermost region winning', () => {
    let snippet = createSnippetRules([
      '// mootant-ignore-start: outer',
      "log('line 2')",
      '// mootant-ignore-start string-literal: inner',
      "log('line 4')",
      '// mootant-ignore-end string-literal: done with strings',
      "log('line 6')",
      '// mootant-ignore-end: done',
      "log('line 8')",
    ])

    expect(
      ["'line 2'", "'line 4'", "'line 6'", "'line 8'"].map(text =>
        findReason(snippet, text),
      ),
    ).toStrictEqual(['outer', 'inner', 'outer', null])
    expect(snippet.diagnostics).toStrictEqual([])
  })

  it('closes the region with the same ids, so regions overlap', () => {
    let snippet = createSnippetRules([
      '// mootant-ignore-start string-literal, number-literal: strings',
      '// mootant-ignore-start arithmetic-operator: numbers',
      "log('line 3', 1 + 1)",
      '// mootant-ignore-end number-literal, string-literal',
      "log('line 5', 2 + 2)",
      '// mootant-ignore-end',
      "log('line 7', 3 + 3)",
    ])

    expect([
      findReason(snippet, "'line 3'"),
      findReason(snippet, '1 + 1', 'arithmetic-operator'),
      findReason(snippet, "'line 5'"),
      findReason(snippet, '2 + 2', 'arithmetic-operator'),
      findReason(snippet, '3 + 3', 'arithmetic-operator'),
    ]).toStrictEqual(['strings', 'numbers', null, 'numbers', null])
    expect(snippet.diagnostics).toStrictEqual([])
  })

  it.each([
    {
      lines: [
        '// mootant-ignore-start',
        '// mootant-ignore-end string-literal',
      ],
      name: 'a start without a list',
    },
    {
      lines: [
        '// mootant-ignore-start string-literal, number-literal',
        '// mootant-ignore-end string-literal, arithmetic-operator',
      ],
      name: 'a start with other ids',
    },
    {
      lines: [
        '// mootant-ignore-start string-literal, number-literal',
        '// mootant-ignore-end string-literal',
      ],
      name: 'a start with more ids',
    },
  ])('does not close $name with an end that has a list', ({ lines }) => {
    let { diagnostics, rules } = createSnippetRules(lines)

    expect(diagnostics.map(({ code }) => code)).toStrictEqual([
      'unmatched-ignore-end',
      'unclosed-ignore-start',
    ])
    expect(rules).toHaveLength(1)
  })

  it('closes a region whose ids are all unknown with an end that lists them', () => {
    let { diagnostics, rules } = createSnippetRules([
      '// mootant-ignore-start acme/no-await',
      '// mootant-ignore-end acme/no-await',
    ])

    expect(diagnostics).toStrictEqual([])
    expect(rules.map(({ mutators }) => mutators)).toStrictEqual([[]])
  })

  it('warns about an end without a start and a start without an end', () => {
    let { diagnostics, parsed, rules } = createSnippetRules([
      'let a = 1',
      '  // mootant-ignore-end',
      '// an ordinary comment',
      'let b = 2 // mootant-ignore-start: legacy',
      "let c = 'c'",
    ])

    expect(diagnostics).toStrictEqual([
      {
        message: 'mootant-ignore-end has no matching mootant-ignore-start.',
        code: 'unmatched-ignore-end',
        severity: 'warning',
        file: 'example.ts',
        column: 3,
        line: 2,
      },
      {
        message:
          'mootant-ignore-start has no matching mootant-ignore-end; it covers the rest of the file.',
        code: 'unclosed-ignore-start',
        severity: 'warning',
        file: 'example.ts',
        column: 11,
        line: 4,
      },
    ])
    expect(
      rules.map(({ reason, start, end }) => [reason, start, end]),
    ).toStrictEqual([['legacy', parsed.comments[2]!.end, parsed.text.length]])
  })

  it.each([
    { scope: 'script block', file: 'widget.svelte' },
    { scope: 'script block', file: 'Page.ASTRO' },
    { file: 'example.ts', scope: 'file' },
  ])('says an unclosed start in $file covers its $scope', ({ scope, file }) => {
    let { parsed } = createTestFile('// mootant-ignore-start\nlet a = 1')
    let component = { ...parsed, file }
    let { directives } = parseIgnoreDirectives(component, knownMutatorIds)

    expect(
      createIgnoreRules(component, directives).diagnostics.map(
        ({ message }) => message,
      ),
    ).toStrictEqual([
      `mootant-ignore-start has no matching mootant-ignore-end; it covers the rest of the ${scope}.`,
    ])
  })

  it('says an unclosed start in a template covers the rest of it', () => {
    let { parsed } = createTestFile('/* mootant-ignore-start */ a + 1')
    let component = { ...parsed, file: 'widget.svelte' }
    let { directives } = parseIgnoreDirectives(component, knownMutatorIds)

    expect(
      createIgnoreRules(component, directives, 'template').diagnostics.map(
        ({ message }) => message,
      ),
    ).toStrictEqual([
      'mootant-ignore-start has no matching mootant-ignore-end; it covers the rest of the template.',
    ])
  })

  it('lists rules in the order of the directives they are credited to', () => {
    let { rules } = createSnippetRules([
      '// mootant-ignore-start: first',
      '// mootant-ignore-next-line: second',
      'let a = 1',
      '// mootant-ignore-end',
      '// mootant-ignore-start: third',
      '// mootant-ignore-file: fourth',
    ])

    expect(rules.map(({ reason }) => reason)).toStrictEqual([
      'first',
      'second',
      'third',
      'fourth',
    ])
  })
})
