import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { generateCandidates } from '../../helpers/generate-candidates'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Every option of the mutator turned on.
 */
const ALL_OPTIONS: MutatorSetup = {
  mutators: {
    'regex-pattern': [
      'on',
      {
        largeAlternations: true,
        classMembers: true,
        quantifiers: true,
        negations: true,
      },
    ],
  },
}

/**
 * Lists the mutants of regex-pattern for a regular expression.
 *
 * @param regex - Literal, written into `x = ...`.
 * @param setup - Preset, mutator settings and preset settings of the run.
 * @returns Mutants as `original -> replacement`.
 */
function mutate(regex: string, setup: MutatorSetup = {}): string[] {
  return runMutator('regex-pattern', `x = ${regex}`, setup).map(formatMutant)
}

describe('regexPattern', () => {
  it.each<[string, string[]]>([
    ['/^a$/', ['/^a$/ -> /a$/', '/^a$/ -> /^a/']],
    ['/^[^]*?X/', ['/^[^]*?X/ -> /[^]*?X/', '/^[^]*?X/ -> /^[^]+?X/']],
    [
      '/^[^]*(?=X)|X/',
      [
        '/^[^]*(?=X)|X/ -> /X/',
        '/^[^]*(?=X)|X/ -> /[^]*(?=X)|X/',
        '/^[^]*(?=X)|X/ -> /^[^]+(?=X)|X/',
        '/^[^]*(?=X)|X/ -> /^[^]*|X/',
        '/^[^]*(?=X)|X/ -> /^[^]*(?=X)/',
      ],
    ],
    [
      String.raw`/\bword\B/`,
      [String.raw`/\bword\B/ -> /word\B/`, String.raw`/\bword\B/ -> /\bword/`],
    ],
    ['/a(?=b)/', ['/a(?=b)/ -> /a/']],
    ['/a(?!b)/', ['/a(?!b)/ -> /a/']],
    ['/(?<=a)b/', ['/(?<=a)b/ -> /b/']],
    ['/(?<!a)b/', ['/(?<!a)b/ -> /b/']],
    [
      '/a(?=b|c)/',
      ['/a(?=b|c)/ -> /a/', '/a(?=b|c)/ -> /a(?=c)/', '/a(?=b|c)/ -> /a(?=b)/'],
    ],
    ['/a|b/', ['/a|b/ -> /b/', '/a|b/ -> /a/']],
    ['/a|/', ['/a|/ -> /(?:)/', '/a|/ -> /a/']],
    ['/(?:a|bc)d/', ['/(?:a|bc)d/ -> /(?:bc)d/', '/(?:a|bc)d/ -> /(?:a)d/']],
    [
      String.raw`/(a|b)\1/`,
      [String.raw`/(a|b)\1/ -> /(b)\1/`, String.raw`/(a|b)\1/ -> /(a)\1/`],
    ],
    ['/a?/', ['/a?/ -> /a/']],
    ['/a*/', ['/a*/ -> /a+/']],
    ['/a{0,3}/', ['/a{0,3}/ -> /a{1,3}/']],
    ['/a{0,}/', ['/a{0,}/ -> /a+/']],
    ['/a*?b/', ['/a*?b/ -> /a+?b/']],
    ['/a??b/', ['/a??b/ -> /ab/']],
    ['/a+b{2}/', []],
    ['/[a-z]/', ['/[a-z]/ -> /[^]/']],
    ['/[^a]/', ['/[^a]/ -> /[^]/']],
    [
      String.raw`/\d\W\s/`,
      [
        String.raw`/\d\W\s/ -> /[^]\W\s/`,
        String.raw`/\d\W\s/ -> /\d[^]\s/`,
        String.raw`/\d\W\s/ -> /\d\W[^]/`,
      ],
    ],
    [String.raw`/\p{L}/u`, [String.raw`/\p{L}/u -> /[^]/u`]],
    [String.raw`/[\w--\d]/v`, [String.raw`/[\w--\d]/v -> /[^]/v`]],
    ['/[[a-z]--[aei]]/v', ['/[[a-z]--[aei]]/v -> /[^]/v']],
    [
      String.raw`/(?<year>\d{4})-\k<year>/`,
      [String.raw`/(?<year>\d{4})-\k<year>/ -> /(?<year>[^]{4})-\k<year>/`],
    ],
    ['/[/]a/', ['/[/]a/ -> /[^]a/']],
    ['/./', []],
  ])('mutates %s', (regex, expected) => {
    expect(mutate(regex)).toStrictEqual(expected)
  })

  it.each([['/(/'], ['/a{2,1}/'], ['/[z-a]/']])(
    'leaves alone %s, which does not compile',
    regex => {
      expect(mutate(regex, { file: 'example.js' })).toStrictEqual([])
    },
  )

  it('mutates every option with them turned on', () => {
    expect(mutate(String.raw`/[a-c\d]x+y{2,3}\./`, ALL_OPTIONS)).toStrictEqual([
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[^]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[\d]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[b-c\d]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[^a-c\d]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-b\d]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\D]x+y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]xy{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x*y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x{2,}y{2,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x+y{2}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x+y{1,3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x+y{3}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x+y{2,4}\./`,
      String.raw`/[a-c\d]x+y{2,3}\./ -> /[a-c\d]x+y{2,3}./`,
    ])
  })

  it.each<[string, string[]]>([
    ['/[^a]/', ['/[^a]/ -> /[^]/', '/[^a]/ -> /[a]/']],
    [
      String.raw`/[\w--\d]/v`,
      [
        String.raw`/[\w--\d]/v -> /[^]/v`,
        String.raw`/[\w--\d]/v -> /[^\w--\d]/v`,
        String.raw`/[\w--\d]/v -> /[\W--\d]/v`,
        String.raw`/[\w--\d]/v -> /[\w--\D]/v`,
      ],
    ],
    [
      String.raw`/[^\w--\d]/v`,
      [
        String.raw`/[^\w--\d]/v -> /[^]/v`,
        String.raw`/[^\w--\d]/v -> /[\w--\d]/v`,
        String.raw`/[^\w--\d]/v -> /[^\W--\d]/v`,
        String.raw`/[^\w--\d]/v -> /[^\w--\D]/v`,
      ],
    ],
    [
      String.raw`/\P{L}/u`,
      [String.raw`/\P{L}/u -> /[^]/u`, String.raw`/\P{L}/u -> /\p{L}/u`],
    ],
    [
      String.raw`/[\0-\x7f]/`,
      [
        String.raw`/[\0-\x7f]/ -> /[^]/`,
        String.raw`/[\0-\x7f]/ -> /[\u0001-\x7f]/`,
        String.raw`/[\0-\x7f]/ -> /[^\0-\x7f]/`,
        String.raw`/[\0-\x7f]/ -> /[\0-\u007E]/`,
      ],
    ],
    [
      String.raw`/[a-\u{1F600}]/u`,
      [
        String.raw`/[a-\u{1F600}]/u -> /[^]/u`,
        String.raw`/[a-\u{1F600}]/u -> /[b-\u{1F600}]/u`,
        String.raw`/[a-\u{1F600}]/u -> /[^a-\u{1F600}]/u`,
        String.raw`/[a-\u{1F600}]/u -> /[a-\u{1F5FF}]/u`,
      ],
    ],
    ['/[a-a]/', ['/[a-a]/ -> /[^]/', '/[a-a]/ -> /[^a-a]/']],
    [
      '/a{2}b{0,1}/',
      [
        '/a{2}b{0,1}/ -> /a{1,2}b{0,1}/',
        '/a{2}b{0,1}/ -> /a{3}b{0,1}/',
        '/a{2}b{0,1}/ -> /a{2,3}b{0,1}/',
        '/a{2}b{0,1}/ -> /a{2}b/',
      ],
    ],
    [
      '/a{0,2}?/',
      [
        '/a{0,2}?/ -> /a{1,2}?/',
        '/a{0,2}?/ -> /a??/',
        '/a{0,2}?/ -> /a{0,3}?/',
      ],
    ],
  ])('handles %s with every option', (regex, expected) => {
    expect(mutate(regex, ALL_OPTIONS)).toStrictEqual(expected)
  })

  it('removes alternatives of a long list in strict', () => {
    expect(mutate('/a|b|c|d|e|f|g|h|i/', { preset: 'strict' })).toHaveLength(9)
  })

  it.each<[string, string[], MutatorSetup?]>([
    ['x = /(a)|b/', ['/(a)|b/ -> /b/ (noise regex-capturing-group)']],
    ['x = /a(?=(b))/', ['/a(?=(b))/ -> /a/ (noise regex-capturing-group)']],
    [
      String.raw`x = /^[^]*a[\s\S]*$/`,
      [
        String.raw`/^[^]*a[\s\S]*$/ -> /[^]*a[\s\S]*$/ (equivalent edge-wildcard)`,
        String.raw`/^[^]*a[\s\S]*$/ -> /^[^]*a[^]*$/ (equivalent any-character)`,
        String.raw`/^[^]*a[\s\S]*$/ -> /^[^]*a[\s\S]*/ (equivalent edge-wildcard)`,
      ],
    ],
    [
      'x = /^.*?a.*$/s',
      ['/^.*?a.*$/s -> /^.*?a.*/s (equivalent edge-wildcard)'],
    ],
    ['x = /a.*?$/s', []],
    ['x = /^[^]*?X/', []],
    ['x = /^[^]*(?=X)|X/', []],
    ['x = /^.*a/', []],
    ['x = /^[^]*a/g', []],
    ['x = /(?:^[^]*a)/', []],
    [
      String.raw`x = /[\d\D]/`,
      [String.raw`/[\d\D]/ -> /[^]/ (equivalent any-character)`],
    ],
    [
      'x = /a|b|c|d|e|f|g|h|i/',
      Array.from(
        { length: 9 },
        (_, index) =>
          `/a|b|c|d|e|f|g|h|i/ -> /${'abcdefghi'.replace('abcdefghi'[index]!, '').split('').join('|')}/ (noise large-alternation)`,
      ),
    ],
    [
      String.raw`x = /[\q{ab}c]/v`,
      [String.raw`/[\q{ab}c]/v -> /[^\q{ab}c]/v (invalid invalid-regex)`],
      ALL_OPTIONS,
    ],
    ['x = /a+/g', ['/a+/g -> /a*/g (timeout empty-match)'], ALL_OPTIONS],
    ['x = /[^]*$b/', []],
    ['x = /a^[^]*/', []],
    [
      String.raw`x = /(a)\1?0/`,
      [String.raw`/(a)\1?0/ -> /(a)\10/ (invalid invalid-regex)`],
    ],
    [
      String.raw`x = /(a)\1(?=x)0/`,
      [String.raw`/(a)\1(?=x)0/ -> /(a)\10/ (invalid invalid-regex)`],
    ],
    [
      String.raw`x = /[a\w-z]/`,
      [String.raw`/[a\w-z]/ -> /[a-z]/ (invalid invalid-regex)`],
      { mutators: { 'regex-pattern': ['on', { classMembers: true }] } },
    ],
  ])('lists the skipped mutants of %s', (source, expected, setup) => {
    expect(listSkipped('regex-pattern', source, setup)).toStrictEqual(expected)
  })

  it('keeps a pattern that starts to match the empty string with timeouts', () => {
    expect(
      mutate('/a+/g', {
        ...ALL_OPTIONS,
        settings: { timeouts: true },
      }),
    ).toContain('/a+/g -> /a*/g')
  })

  it('keeps an empty match under g when the pattern already had one', () => {
    expect(mutate('/a?|b+/g', ALL_OPTIONS)).toContain('/a?|b+/g -> /a?|b*/g')
  })

  it('names the changed part of the pattern as the focus', () => {
    let { mutants } = generateCandidates(String.raw`x = s.split(/,\s*/)`)

    expect(
      mutants
        .filter(mutant => mutant.mutator === 'regex-pattern')
        .map(mutant => mutant.focus),
    ).toStrictEqual([
      { text: '[^]', start: 14, end: 16 },
      { start: 16, text: '+', end: 17 },
    ])
  })

  it.each<[string, string[]]>([
    [
      String.raw`x = new RegExp('^\\d+$')`,
      [
        String.raw`'^\\d+$' -> '\\d+$'`,
        String.raw`'^\\d+$' -> '^[^]+$'`,
        String.raw`'^\\d+$' -> '^\\d+'`,
      ],
    ],
    [
      String.raw`x = RegExp("a\"|b", 'g')`,
      [String.raw`"a\"|b" -> "b"`, String.raw`"a\"|b" -> "a\""`],
    ],
    [
      'x = new RegExp(`^a\\\\.b$`)',
      ['`^a\\\\.b$` -> `a\\\\.b$`', '`^a\\\\.b$` -> `^a\\\\.b`'],
    ],
    [
      String.raw`x = new RegExp(String.raw${'`'}\b\d${'`'})`,
      [
        String.raw`String.raw${'`'}\b\d${'`'} -> String.raw${'`'}\d${'`'}`,
        String.raw`String.raw${'`'}\b\d${'`'} -> String.raw${'`'}\b[^]${'`'}`,
      ],
    ],
    [
      `x = new RegExp(\`^\${a}|b?$\`)`,
      [`\`^\${a}|b?$\` -> \`\${a}|b?$\``, `\`^\${a}|b?$\` -> \`^\${a}|b?\``],
    ],
    [`x = new RegExp(\`(?:\${a})?\`)`, []],
    [`x = new RegExp(\`\${a}\\\\$\`)`, []],
    [`x = new RegExp(\`\${part}$\`)`, []],
    [`x = new RegExp(\`^\${part}$\`)`, [`\`^\${part}$\` -> \`\${part}$\``]],
    [`x = new RegExp(\`a\${part}(?:)$\`)`, []],
    [`x = new RegExp(\`\${a}\\\\\\\\$\`)`, []],
    [`x = new RegExp(\`\${a}b$\`)`, [`\`\${a}b$\` -> \`\${a}b\``]],
    [
      `x = new RegExp(\`\${part}.*$\`, 's')`,
      [`\`\${part}.*$\` -> \`\${part}.*\``],
    ],
    [`x = new RegExp(\`\${a}b[^]*$\`)`, [`\`\${a}b[^]*$\` -> \`\${a}b[^]*\``]],
    [
      `x = new RegExp(\`^[\\\\s\${a}\\\\S]*\`)`,
      [`\`^[\\\\s\${a}\\\\S]*\` -> \`[\\\\s\${a}\\\\S]*\``],
    ],
    [
      `x = new RegExp(\`^[\\\\s(?:)\\\\S]*\${a}\`)`,
      [`\`^[\\\\s(?:)\\\\S]*\${a}\` -> \`[\\\\s(?:)\\\\S]*\${a}\``],
    ],
    [`x = new RegExp(\`^[^]*\${a}\`)`, [`\`^[^]*\${a}\` -> \`[^]*\${a}\``]],
    [`x = new RegExp(\`^.*\${a}\`, 's')`, [`\`^.*\${a}\` -> \`.*\${a}\``]],
    ["x = new RegExp('^a', flags)", []],
    ["let RegExp = f\nx = new RegExp('^a')", []],
    ["x = new RegExp('(')", []],
  ])('mutates the pattern argument of %s', (source, expected) => {
    expect(runMutator('regex-pattern', source).map(formatMutant)).toStrictEqual(
      expected,
    )
  })

  it.each<[string, string]>([
    [String.raw`x = new RegExp('\0?1')`, String.raw`'\0?1' -> '\x001'`],
    ['x = new RegExp(`\\0?1`)', '`\\0?1` -> `\\x001`'],
  ])(
    'keeps the null escape of %s apart from the digit after it',
    (source, expected) => {
      expect(
        runMutator('regex-pattern', source).map(formatMutant),
      ).toStrictEqual([expected])
    },
  )

  it.each<[string, string]>([
    [String.raw`/[\😀a]/`, String.raw`/[\😀a]/ -> /[\uD83Da]/`],
    [
      'String.raw`[\\😀a]`',
      String.raw`String.raw${'`'}[\😀a]${'`'} -> String.raw${'`'}[\uD83Da]${'`'}`,
    ],
  ])(
    'writes the rest of an escaped surrogate pair in %s as one escape',
    (regex, expected) => {
      let source = regex.startsWith('/') ? regex : `new RegExp(${regex})`

      expect(mutate(source, { preset: 'strict' })).toContain(expected)
    },
  )

  it.each([
    'x = new RegExp(`^a\\\\.b$`)',
    `x = new RegExp(String.raw\`\\b\\d\`)`,
    `x = new RegExp(\`^\${a}|b?$\`)`,
  ])('mutates the template of %s in JavaScript as in TypeScript', source => {
    let typescript = runMutator('regex-pattern', source).map(formatMutant)

    expect(typescript).not.toStrictEqual([])
    expect(
      runMutator('regex-pattern', source, { file: 'example.js' }).map(
        formatMutant,
      ),
    ).toStrictEqual(typescript)
  })

  it.each<[string, string[]]>([
    [
      "x = RegExp('^[^]*a')",
      ["'^[^]*a' -> '[^]*a' (equivalent edge-wildcard)"],
    ],
    [`x = RegExp(\`^[^]*\${a}\`)`, []],
    [`x = RegExp(\`^.*\${a}\`, 's')`, []],
    [`x = RegExp(\`^[^]*\${a}|X\`)`, []],
    [`x = RegExp(\`\${part}.*$\`, 's')`, []],
    [`x = RegExp(\`a\${part}[^]*$\`)`, []],
    [`x = RegExp(\`^[\\\\s\${a}\\\\S]*\`)`, []],
  ])('lists the skipped mutants of the call %s', (source, expected) => {
    expect(listSkipped('regex-pattern', source)).toStrictEqual(expected)
  })

  it('names the changed part of a string pattern as the focus', () => {
    let { mutants } = generateCandidates(String.raw`x = RegExp('a\\d')`)

    expect(
      mutants
        .filter(mutant => mutant.mutator === 'regex-pattern')
        .map(mutant => [mutant.replacement, mutant.focus]),
    ).toStrictEqual([["'a[^]'", { text: '[^]', start: 13, end: 16 }]])
  })
})
