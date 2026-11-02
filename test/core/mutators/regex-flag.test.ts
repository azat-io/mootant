import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { generateCandidates } from '../../helpers/generate-candidates'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Lists the mutants of regex-flag for a snippet.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings and preset settings of the run.
 * @returns Mutants as `original -> replacement`.
 */
function mutate(source: string, setup: MutatorSetup = {}): string[] {
  return runMutator('regex-flag', source, setup).map(formatMutant)
}

describe('regexFlag', () => {
  it.each<[string, string[]]>([
    ['x = /a/i', ['/a/i -> /a/']],
    ['x = /^a/m', ['/^a/m -> /^a/']],
    ['x = /a.b/s', ['/a.b/s -> /a.b/']],
    ['x = /[a-z]/i', ['/[a-z]/i -> /[a-z]/']],
    ['x = /[!-~]/i', ['/[!-~]/i -> /[!-~]/']],
    [
      String.raw`x = /[\u0400-\u04FF]/i`,
      [String.raw`/[\u0400-\u04FF]/i -> /[\u0400-\u04FF]/`],
    ],
    [String.raw`x = /\p{Lu}/iu`, [String.raw`/\p{Lu}/iu -> /\p{Lu}/u`]],
    [String.raw`x = /\w/iu`, [String.raw`/\w/iu -> /\w/u`]],
    [String.raw`x = /\b1/iv`, [String.raw`/\b1/iv -> /\b1/v`]],
    [String.raw`x = /(1)\1/i`, [String.raw`/(1)\1/i -> /(1)\1/`]],
    ['x = /ß/i', ['/ß/i -> /ß/']],
    ['x = /a/dy', []],
    ['x = /a/gu', []],
    ['x = /a/v', []],
    ['x = /a/g.exec(s)', []],
    ['x = s.replaceAll(/a/g, b)', []],
    ['x = s.matchAll(/a/g)', []],
    ['x = s.replace(/a/g, b)', ['/a/g -> /a/']],
    ['x = s.match(/a/g)', ['/a/g -> /a/']],
    ['x = s.match(/^a/g)', ['/^a/g -> /^a/']],
    ['x = s.replace(/^a/gm, b)', ['/^a/gm -> /^a/m', '/^a/gm -> /^a/g']],
    ['x = s.replace(/^a|b/g, c)', ['/^a|b/g -> /^a|b/']],
    ['x = s.replace((/a/g as RegExp), b)', ['/a/g -> /a/']],
    ['x = s.replace(b, /a/g)', []],
    ['x = s[method](/a/g)', []],
    ['x = replace(/a/g)', []],
    ['x = s.split(/a/g)', []],
  ])('mutates %s', (source, expected) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it('leaves alone a literal that does not compile', () => {
    expect(mutate('x = /(/i', { file: 'example.js' })).toStrictEqual([])
  })

  it.each<[string, string[]]>([
    ['x = /a/', ['/a/ -> /a/i']],
    ['x = /1/', []],
    ['x = s.replace(/a/i, b)', ['/a/i -> /a/', '/a/i -> /a/ig']],
    ['x = s.replace(/1/, b)', ['/1/ -> /1/g']],
    ['x = s.match(/a/i)', ['/a/i -> /a/']],
  ])('adds flags to %s with the additions option', (source, expected) => {
    expect(
      mutate(source, {
        mutators: { 'regex-flag': ['on', { additions: true }] },
      }),
    ).toStrictEqual(expected)
  })

  it.each<[string, string[]]>([
    ['x = /1/i', ['/1/i -> /1/ (equivalent unused-flag)']],
    [
      String.raw`x = /\d/i`,
      [String.raw`/\d/i -> /\d/ (equivalent unused-flag)`],
    ],
    [
      String.raw`x = /\w/i`,
      [String.raw`/\w/i -> /\w/ (equivalent unused-flag)`],
    ],
    ['x = /a/m', ['/a/m -> /a/ (equivalent unused-flag)']],
    ['x = /a/s', ['/a/s -> /a/ (equivalent unused-flag)']],
    [
      'x = s.replace(/^a|^b/g, c)',
      ['/^a|^b/g -> /^a|^b/ (equivalent anchored-global)'],
    ],
    [
      String.raw`x = s.replace(/\s+$/g, '')`,
      [String.raw`/\s+$/g -> /\s+$/ (equivalent anchored-global)`],
    ],
    [
      'x = s.replace(/a$|b$/g, c)',
      ['/a$|b$/g -> /a$|b$/ (equivalent anchored-global)'],
    ],
    [String.raw`x = s.replace(/\s*$/g, '')`, []],
    [String.raw`x = s.replace(/[\q{ab|}--\q{z}]$/gv, c)`, []],
    [String.raw`x = s.replace(/[[\q{|a}]&&\q{|b}]$/gv, c)`, []],
    [
      String.raw`x = s.replace(/[\q{ab|}--\q{z|}]$/gv, c)`,
      [
        String.raw`/[\q{ab|}--\q{z|}]$/gv -> /[\q{ab|}--\q{z|}]$/v (equivalent anchored-global)`,
      ],
    ],
    ['x = s.replace(/a$|b/g, c)', []],
    ['x = s.replace(/a$/gm, c)', []],
    [
      String.raw`if (s.match(/\d/g)) x()`,
      [String.raw`/\d/g -> /\d/ (equivalent unused-flag)`],
    ],
    [
      'x = Boolean(s.match(/a/g)) ? 1 : 2',
      ['/a/g -> /a/ (equivalent unused-flag)'],
    ],
    ['x = !s.match(/a/g)', ['/a/g -> /a/ (equivalent unused-flag)']],
    ['x = s.match(/a/g) ?? []', []],
    ['x = /a/g', []],
    ...[
      'x = s.match(/^a/g)',
      'x = s.match(/a$/g)',
      'f(s.match(/^a/g))',
      'function g(t: string) { return t.match(/^a/g) }',
      'x = s.match(/^a/g)?.index',
      'x = s.match(/^a/g)?.[1]',
      'x = s.match(/a/g)?.length',
      'x = s.match(/^a/gm)?.length',
      'x = s.match(/^a|b/g)?.length',
      'x = s.match(/a*$/g)?.length',
      'x = s.match(/^(a)/g)?.length',
      'let m = s.match(/^a/g); x = m',
      'let m = s.match(/^a/g); x = m ? m[0] : m',
      'let m = s.match(/a/g); m[0] = f; x = m[0]()',
      'let m = s.match(/a/g); delete m[0]; x = m[0]',
      'let m = s.match(/^a/g); m.length = 0; x = m.length',
      'x = s.match(/a/g, 1)?.[0]',
      'x = s.match(/a/g)?.[0]; y = RegExp.lastMatch',
      'if (s.match(/a/g)) y = RegExp.$1',
      'x = s.match(/^a/g)?.length; y = (RegExp as any).lastMatch',
    ].map<[string, string[]]>(line => [`declare let s: string; ${line}`, []]),
    ...[
      'x = stream.match(/a/g)?.[0]',
      'x = stream.match(/^a/g)?.length',
      'x = stream.match(/a/g) === null',
      'x = this.match(/a/g)[0]',
      'x = super.match(/a/g)[0]',
      'let [y] = stream.match(/a/g) ?? []',
      'x = s.match(/a/g)?.[0]',
    ].map<[string, string[]]>(line => [line, []]),
    ...(
      [
        ['x = s.match(/a/g)?.[0]', '/a/g -> /a/ (equivalent unused-flag)'],
        [
          'x = (s.match(/a/g) || [])[0]',
          '/a/g -> /a/ (equivalent unused-flag)',
        ],
        ['x = s.match(/(a)/g)![0]', '/(a)/g -> /(a)/ (equivalent unused-flag)'],
        ['x = s.match(/a/g) === null', '/a/g -> /a/ (equivalent unused-flag)'],
        [
          'let [y] = s.match(/a/g) ?? []',
          '/a/g -> /a/ (equivalent unused-flag)',
        ],
        [
          'let m = s.match(/a/g); x = m && m[0]',
          '/a/g -> /a/ (equivalent unused-flag)',
        ],
        [
          'x = s.match(/^a/g)?.length',
          '/^a/g -> /^a/ (equivalent anchored-global)',
        ],
        [
          'x = (s.match(/a$|b$/g) ?? []).length',
          '/a$|b$/g -> /a$|b$/ (equivalent anchored-global)',
        ],
        [
          'let m = s.match(/^a/g); x = m ? m.length : 0',
          '/^a/g -> /^a/ (equivalent anchored-global)',
        ],
        [
          "x = s.match(RegExp('^a', 'g'))?.length",
          "'g' -> '' (equivalent anchored-global)",
        ],
      ] satisfies [string, string][]
    ).map<[string, string[]]>(([line, skip]) => [
      `declare let s: string; ${line}`,
      [skip],
    ]),
    [
      'function g(s?: string) { if (s?.match(/a/g)) x() }',
      ['/a/g -> /a/ (equivalent unused-flag)'],
    ],
    [
      "x = s.replace(/^a/g, ''); y = RegExp.lastMatch",
      ['/^a/g -> /^a/ (equivalent anchored-global)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('regex-flag', source)).toStrictEqual(expected)
  })

  it('marks a skip of g as a guess, since it rests on the name of a method', () => {
    let { skipped } = generateCandidates(
      [
        'declare let s: string',
        'a = s.match(/b/g)?.[0]',
        'c = s.match(/^d/g)?.length',
        'if (s.match(/e/g)) f()',
        "g = s.replace(/^h/g, '')",
        'i = /1/i',
      ].join('\n'),
    )

    expect(
      skipped
        .filter(candidate => candidate.mutator === 'regex-flag')
        .map(candidate => [candidate.rule, candidate.heuristic]),
    ).toStrictEqual([
      ['unused-flag', true],
      ['anchored-global', true],
      ['unused-flag', true],
      ['anchored-global', true],
      ['unused-flag', false],
    ])
  })

  it.each<[string, string[]]>([
    ["x = s.replace(/^a/, '')", ['/^a/ -> /^a/g (equivalent anchored-global)']],
    [
      String.raw`x = s.replace(/\s+$/, '')`,
      [String.raw`/\s+$/ -> /\s+$/g (equivalent anchored-global)`],
    ],
    [
      "x = s.replace(/^a|^b/i, '')",
      ['/^a|^b/i -> /^a|^b/ig (equivalent anchored-global)'],
    ],
    [
      "x = s.replace(RegExp('^a'), '')",
      ["RegExp('^a') -> RegExp('^a', 'g') (equivalent anchored-global)"],
    ],
    ["x = s.replace(/a/, '')", []],
    ["x = s.replace(/^a/m, '')", []],
    ["x = s.replace(/^a|b/, '')", []],
    [String.raw`x = s.replace(/\s*$/, '')`, []],
  ])('lists the skipped additions of %s', (source, expected) => {
    expect(
      listSkipped('regex-flag', source, {
        mutators: { 'regex-flag': ['on', { additions: true }] },
      }),
    ).toStrictEqual(expected)
  })

  it('names the flags as the focus', () => {
    let { mutants } = generateCandidates('x = /a/gi.test(s)')

    expect(
      mutants
        .filter(mutant => mutant.mutator === 'regex-flag')
        .map(mutant => mutant.focus),
    ).toStrictEqual([{ text: 'g', start: 7, end: 9 }])
  })
  it.each<[string, string[], MutatorSetup?]>([
    ["x = new RegExp('a', 'i')", ["'i' -> ''"]],
    ['x = RegExp(`a.`, `si`)', ['`si` -> `i`', '`si` -> `s`']],
    ["x = s.replace(new RegExp('a', 'g'), b)", ["'g' -> ''"]],
    [
      "x = s.match(RegExp(String.raw`a`, 'gi'))",
      ["'gi' -> 'i'", "'gi' -> 'g'"],
    ],
    [`x = new RegExp(\`^\${a}\`, 'm')`, []],
    ["x = new RegExp('a', flags)", []],
    ["let RegExp = f\nx = RegExp('a', 'i')", []],
    [
      "x = s.replace(new RegExp('a'), b)",
      [
        "new RegExp('a') -> new RegExp('a', 'i')",
        "new RegExp('a') -> new RegExp('a', 'g')",
      ],
      { mutators: { 'regex-flag': ['on', { additions: true }] } },
    ],
  ])('mutates the flags of the call %s', (source, expected, setup) => {
    expect(mutate(source, setup)).toStrictEqual(expected)
  })

  it.each<[string, string[]]>([
    ["x = new RegExp('1', 'i')", ["'i' -> '' (equivalent unused-flag)"]],
    [
      "x = s.replace(RegExp('^a', 'g'), b)",
      ["'g' -> '' (equivalent anchored-global)"],
    ],
    [
      "if (s.match(new RegExp('a', 'g'))) x()",
      ["'g' -> '' (equivalent unused-flag)"],
    ],
  ])('lists the skipped mutants of the call %s', (source, expected) => {
    expect(listSkipped('regex-flag', source)).toStrictEqual(expected)
  })

  it('names the flags of a call as the focus', () => {
    let { mutants } = generateCandidates("x = new RegExp('a', 'gi').test(s)")

    expect(
      mutants
        .filter(mutant => mutant.mutator === 'regex-flag')
        .map(mutant => [mutant.replacement, mutant.focus]),
    ).toStrictEqual([["'g'", { text: 'g', start: 21, end: 23 }]])
  })
})
