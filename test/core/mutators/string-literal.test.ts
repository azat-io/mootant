import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { generateCandidates } from '../../helpers/generate-candidates'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Setup of a run with the `jsxAttributes` option of string-literal.
 */
const JSX_ATTRIBUTES: MutatorSetup = {
  mutators: { 'string-literal': ['on', { jsxAttributes: true }] },
}

/**
 * Login form whose quoted attribute values change what it does.
 */
const LOGIN_FORM = [
  'export function Login() {',
  '  return (',
  '    <form>',
  '      <input type="password" aria-label="Password" />',
  '      <a href="/reset">Reset</a>',
  '    </form>',
  '  )',
  '}',
].join('\n')

/**
 * Lists the mutants of string-literal for a snippet.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants as `original -> replacement`.
 */
function mutate(source: string, setup: MutatorSetup = {}): string[] {
  return runMutator('string-literal', source, setup).map(formatMutant)
}

describe('stringLiteral', () => {
  it.each<{ expected: string[]; source: string; file?: string }>([
    { expected: ["'Hello' -> ''"], source: "x = 'Hello'" },
    { expected: ["'' -> 'mootant'"], source: "x = ''" },
    {
      expected: [`\`/api/\${id}/items\` -> ''`],
      source: `x = \`/api/\${id}/items\``,
    },
    {
      expected: [`\`/api/\${load(id)}\` -> \`\${load(id)}\``],
      source: `x = \`/api/\${load(id)}\``,
    },
    { expected: ["'key' -> ''"], source: "x = obj['key']" },
    { source: "x = parts.join(', ')", expected: ["', ' -> ''"] },
    { source: "const fs = require('fs')", expected: [] },
    { source: "x = Symbol('id')", expected: [] },
    { source: "x = mode === 'dark'", expected: [] },
    { source: "if (map.has('key')) run()", expected: [] },
    { source: "console.log('debug', id)", expected: [] },
    { source: `throw new Error(\`bad \${id}\`)`, expected: [] },
    { source: "invariant(ok, 'msg')", expected: [] },
    { source: "x = { 'a-b': 1 }", expected: [] },
    { source: "switch (x) { case 'x': run() }", expected: [] },
    { source: 'x = <a href="/home" />', file: 'example.tsx', expected: [] },
    { source: 'x = gql`query { a }`', expected: [] },
    {
      source: "function f(name: string | undefined) { x = name || 'anon' }",
      expected: [],
    },
    {
      source: "function f(title: string) { x = title || 'untitled' }",
      expected: [],
    },
    {
      source: "function f(s: string): boolean { return s.startsWith('#') }",
      expected: [],
    },
    {
      source: [
        'function f(s) {',
        "  const found = s.includes('foo')",
        '  return found',
        '}',
      ].join('\n'),
      file: 'example.js',
      expected: [],
    },
    {
      source: "x = <a title={'t'} />",
      expected: ["'t' -> ''"],
      file: 'example.tsx',
    },
  ])('mutates $source as in the catalog', ({ expected, source, file }) => {
    expect(mutate(source, { file })).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    { expected: ['"a" -> ""'], source: 'x = "a"' },
    { expected: ['`` -> `mootant`'], source: 'x = ``' },
    { expected: ['`abc` -> ``'], source: 'x = `abc`' },
    { expected: [`\`a\${x}b\${y}\` -> ''`], source: `x = \`a\${x}b\${y}\`` },
    { expected: [`\`a\${(x)}\` -> ''`], source: `x = \`a\${(x)}\`` },
    {
      expected: [
        `\`<svg \${this.size}>\${icon?.path}\${list[0]}\${map[key].d}\${(a as T)!.b}</svg>\` -> ''`,
      ],
      source: `x = \`<svg \${this.size}>\${icon?.path}\${list[0]}\${map[key].d}\${(a as T)!.b}</svg>\``,
    },
    {
      expected: [`\`a\${x}b\${f(y)}\` -> \`\${x}\${f(y)}\``],
      source: `x = \`a\${x}b\${f(y)}\``,
    },
    {
      expected: [`\`a\${x.y()}\` -> \`\${x.y()}\``],
      source: `x = \`a\${x.y()}\``,
    },
    {
      expected: [`\`a\${tag\`b\`}\` -> \`\${tag\`b\`}\``],
      source: `x = \`a\${tag\`b\`}\``,
    },
    {
      expected: [`\`a\${x[i + 1]}\` -> \`\${x[i + 1]}\``],
      source: `x = \`a\${x[i + 1]}\``,
    },
    {
      expected: [`\`a\${x[f()]}\` -> \`\${x[f()]}\``],
      source: `x = \`a\${x[f()]}\``,
    },
    {
      expected: [`\`a\${x[1n]}\` -> \`\${x[1n]}\``],
      source: `x = \`a\${x[1n]}\``,
    },
    {
      source: `class A extends B { c() { return \`a\${super.b}\` } }`,
      expected: [`\`a\${super.b}\` -> \`\${super.b}\``],
    },
    {
      expected: [`\`a\${x['k'].y}\` -> ''`, "'k' -> ''"],
      source: `x = \`a\${x['k'].y}\``,
    },
    { source: `x = \`\${a}\${b}\``, expected: [] },
    { source: ['x = `\\', `\${a}\``].join('\n'), expected: [] },
    { source: `x = String.raw\`a\${b}\``, expected: [] },
    { source: "export default 'text'", expected: ["'text' -> ''"] },
    { source: "x = 'a' as const", expected: ["'a' -> ''"] },
    { source: "x = Symbol.for('id')", expected: ["'id' -> ''"] },
    { source: ["'use strict'", 'x = 1'].join('\n'), expected: [] },
    { source: ['run()', "'note'"].join('\n'), expected: [] },
    {
      source: ["import a from 'a'", "export * from 'b'"].join('\n'),
      expected: [],
    },
    { source: "x = import('c')", expected: [] },
    { source: "x = { ['a']: 1 }", expected: [] },
    { source: "class A { ['a']() {} }", expected: [] },
    { source: "if (ok && 'x') run()", expected: [] },
    { source: "throw 'bad ' + id", expected: [] },
    { source: "throw new TypeError('bad')", expected: [] },
    { source: "f(void 'x')", expected: [] },
    { source: `f(void \`a\${x}\`)`, expected: [] },
  ])('handles $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    { source: "if (a && s.includes('x')) run()", expected: [] },
    { source: "x = s.indexOf('x') > 0", expected: [] },
    { source: "if (Object.hasOwn(o, 'k')) run()", expected: [] },
    { source: "if (s?.includes('x')) run()", expected: [] },
    { source: "if (m?.get('k').ready) run()", expected: ["'k' -> ''"] },
    { source: 'if (s.includes(`x`)) run()', expected: [] },
    { source: "if (s.includes('x')) run()", expected: [] },
    {
      source: "function f(s: string): boolean { return s.startsWith('#') }",
      expected: [],
    },
    { source: "if (storage.getItem('k')) run()", expected: [] },
    {
      source: [
        'function f(s: string): boolean {',
        '  let found',
        "  found = s.includes('foo')",
        '  return found',
        '}',
      ].join('\n'),
      expected: [],
    },
    {
      source: ["const found = s.includes('foo')", 'use(found)'].join('\n'),
      expected: ["'foo' -> ''"],
    },
    { source: "x = map.get('key')", expected: ["'key' -> ''"] },
    { source: "x = Object.hasOwn(o, 'k')", expected: ["'k' -> ''"] },
    { source: "if (s.includes('')) run()", expected: ["'' -> 'mootant'"] },
    { source: "if (s[method]('x')) run()", expected: ["'x' -> ''"] },
    { source: "if (includes('x')) run()", expected: ["'x' -> ''"] },
    { source: "if (s.includes(a, 'x')) run()", expected: ["'x' -> ''"] },
    { source: "if (Object.keys(o, 'k')) run()", expected: ["'k' -> ''"] },
  ])('treats the lookup key of $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: "x = active ? 'on' : ''",
      expected: ["'' -> 'mootant'"],
    },
    {
      source: [
        'function f(ok) {',
        '  if (ok) {',
        "    return 'yes'",
        '  } else {',
        "    return ''",
        '  }',
        '}',
      ].join('\n'),
      expected: ["'' -> 'mootant'"],
    },
    {
      source: [
        '// mootant-ignore-next-line condition',
        "x = active ? 'on' : ''",
      ].join('\n'),
      expected: ["'' -> 'mootant'"],
    },
    {
      source: "function f(x: number) { return x >= 5 ? '' : 'small' }",
      expected: ["'' -> 'mootant'"],
    },
    {
      source: `x = ok ? \`\${f(a)}\` : \`x\${f(a)}\``,
      expected: [],
    },
    {
      source: `x = ok ? \`\${f(b)}\` : \`x\${f(a)}\``,
      expected: [`\`x\${f(a)}\` -> \`\${f(a)}\``],
    },
    {
      source: `x = ok ? '' : \`x\${a}\``,
      expected: ["'' -> 'mootant'"],
    },
    {
      expected: ['"" -> "mootant"', `\`x\${a}\` -> ''`],
      source: `x = ok ? "" : \`x\${a}\``,
    },
    {
      source: "x = rows.filter(row => { if (row.ok) return 'a'; return '' })",
      expected: ["'' -> 'mootant'"],
    },
    {
      source: "x = rows.sort(row => { if (row.ok) return 'a'; return '' })",
      expected: [],
    },
    {
      source: "x = rows.map(row => { if (row.ok) return 'a'; return '' })",
      expected: ["'' -> 'mootant'"],
    },
  ])(
    'leaves a forced decision to its owner in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator, condition',
        "  return x >= 5 ? '' : 'small'",
        '}',
      ].join('\n'),
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off', condition: 'off' } },
      source: "function f(x: number) { return x >= 5 ? '' : 'small' }",
    },
  ])(
    'copies a branch when no mutant of the test will run in $source',
    ({ source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual([
        "'' -> 'mootant'",
        "'small' -> ''",
      ])
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        '// mootant-ignore-next-line comparison-operator',
        "x = mode === 'dark'",
      ].join('\n'),
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off' } },
      source: "x = mode === 'dark'",
    },
  ])(
    'changes a compared string when the comparison will not run in $source',
    ({ source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(["'dark' -> ''"])
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function f(name: string | undefined) {',
        '  // mootant-ignore-next-line logical-operator',
        "  x = name || 'anon'",
        '}',
      ].join('\n'),
      setup: {},
    },
    {
      source: "function f(name: string | undefined) { x = name || 'anon' }",
      setup: { mutators: { 'logical-operator': 'off' } },
    },
  ])(
    'empties an || default when the swap will not run in $source',
    ({ source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(["'anon' -> ''"])
    },
  )

  it.each<{ setup: MutatorSetup }>([
    { setup: { mutators: { 'string-literal': ['on', { caseTests: true }] } } },
    { setup: { preset: 'strict' } },
  ])('mutates case labels with $setup', ({ setup }) => {
    expect(mutate("switch (x) { case 'x': run() }", setup)).toStrictEqual([
      "'x' -> ''",
    ])
  })

  it('mutates quoted JSX attribute values with jsxAttributes', () => {
    expect(
      mutate(LOGIN_FORM, { ...JSX_ATTRIBUTES, file: 'example.jsx' }),
    ).toStrictEqual(['"password" -> ""', '"Password" -> ""', '"/reset" -> ""'])
  })

  it('keeps quoted JSX attribute values skipped in strict', () => {
    expect(
      listSkipped('string-literal', LOGIN_FORM, {
        file: 'example.jsx',
        preset: 'strict',
      }),
    ).toStrictEqual([
      '"password" -> "" (noise jsx-attribute)',
      '"Password" -> "" (noise jsx-attribute)',
      '"/reset" -> "" (noise jsx-attribute)',
    ])
  })

  it.each<[string, string[]]>([
    ['x = <a href="" />', ['"" -> "mootant"']],
    ["x = <a title='Cart' />", ["'Cart' -> ''"]],
    ['x = <a href="/search?q=a&page=2" />', ['"/search?q=a&page=2" -> ""']],
    [
      'x = <img alt="Logo" src="/logo.svg" />',
      ['"Logo" -> ""', '"/logo.svg" -> ""'],
    ],
    ['x = <input placeholder="Email" />', ['"Email" -> ""']],
    [
      'x = <label htmlFor="email" id="label" />',
      ['"email" -> ""', '"label" -> ""'],
    ],
    ['x = <li data-state="open" />', ['"open" -> ""']],
    ['x = <use xlink:href="#icon" />', ['"#icon" -> ""']],
    ['x = <path d="M0 0" fill="none" />', ['"M0 0" -> ""', '"none" -> ""']],
    ['x = <Menu.Item key="logout" />', ['"logout" -> ""']],
    ['x = <Button variant="primary" />', ['"primary" -> ""']],
    [
      'x = <Button disabled="disabled" value="x" />',
      ['"disabled" -> ""', '"x" -> ""'],
    ],
  ])(
    'mutates the quoted JSX attribute value of %s with jsxAttributes',
    (source, expected) => {
      expect(
        mutate(source, { ...JSX_ATTRIBUTES, file: 'example.tsx' }),
      ).toStrictEqual(expected)
    },
  )

  it('ignores a quoted JSX attribute value under an ignore comment with jsxAttributes', () => {
    let source = [
      'x = (',
      '  <a',
      '    // mootant-ignore-next-line string-literal',
      '    href="/reset"',
      '  />',
      ')',
    ].join('\n')

    expect(
      runMutator('string-literal', source, {
        ...JSX_ATTRIBUTES,
        file: 'example.tsx',
      }).map(mutant => mutant.status),
    ).toStrictEqual(['Ignored'])
  })

  it('drops the coarse return of a component for its quoted JSX attribute values with jsxAttributes', () => {
    expect(
      listSkipped(
        'return-value',
        'function Field() { return <input type="password" /> }',
        { ...JSX_ATTRIBUTES, file: 'example.tsx' },
      ),
    ).toStrictEqual([
      '<input type="password" /> -> undefined (subsumed solitary)',
    ])
  })

  it.each<{ setup: MutatorSetup; expected: string[]; source: string }>([
    {
      setup: { mutators: { condition: 'off' } },
      source: "x = active ? 'on' : ''",
      expected: ["'' -> 'mootant'"],
    },
    {
      source: "function f(title: string) { x = title || 'untitled' }",
      setup: { mutators: { 'logical-operator': 'off' } },
      expected: [],
    },
    {
      setup: { mutators: { 'logical-operator': 'off' } },
      source: "if (ok && map.has('key')) run()",
      expected: [],
    },
  ])(
    'keeps the static owner of $source with $setup',
    ({ expected, source, setup }) => {
      expect(mutate(source, setup)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    { expected: ["'' -> 'mootant'"], source: "if (!'') run()" },
    { source: "x = 'k' in map", expected: [] },
    {
      source: [
        'declare let answer: string',
        "x = answer.toLowerCase() === 'yes'",
      ].join('\n'),
      expected: [],
    },
  ])(
    'decides the literal of $source with its owner',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<[string, string[]]>([
    [
      `declare let s: string; a = s === 'x'; if (s.includes('a')) run(); f = run\`tag \${s}\`; g = Symbol('desc'); x = { ['k']: 1 }; switch (s) { case 'c': break }`,
      [
        "'x' -> '' (subsumed O4)",
        "'a' -> '' (owned O8)",
        `\`tag \${s}\` -> \`\${s}\` (noise tagged-template)`,
        "'desc' -> '' (noise symbol-description)",
        "'k' -> '' (noise property-key)",
        "'c' -> '' (noise case-label)",
      ],
    ],
    [
      `declare let t: string | undefined; declare let u: string; x = u || 'a'; y = t || 'a'; z = ok ? \`a\${s}\` : ''; function f() { throw new TypeError(\`bad \${u}\`) } run(); 'bare'`,
      [
        "'a' -> '' (owned O16)",
        "'a' -> '' (subsumed R7)",
        `\`a\${s}\` -> '' (owned O19)`,
        `\`bad \${u}\` -> '' (noise error-message)`,
        "'bare' -> '' (noise bare-string)",
      ],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('string-literal', source)).toStrictEqual(expected)
  })

  it('lists a JSX attribute string as skipped', () => {
    expect(
      listSkipped('string-literal', 'x = <a href="x" />', {
        file: 'example.tsx',
      }),
    ).toStrictEqual(['"x" -> "" (noise jsx-attribute)'])
  })

  it.each<[string, string[]]>([
    [
      'x = <b className="badge" class="tag" style="color: red" data-testid="badge" />',
      [
        '"badge" -> "" (noise jsx-attribute)',
        '"tag" -> "" (noise jsx-attribute)',
        '"color: red" -> "" (noise jsx-attribute)',
        '"badge" -> "" (noise jsx-attribute)',
      ],
    ],
    ['x = <Button className="wide" />', ['"wide" -> "" (noise jsx-attribute)']],
    ['x = <p className="a\n  b" />', ['"a\n  b" -> "" (noise jsx-attribute)']],
    [
      'x = <button disabled="disabled" />',
      ['"disabled" -> "" (invalid invalid-target)'],
    ],
    [
      'x = <input value="x" readOnly="" checked="" />',
      [
        '"x" -> "" (invalid invalid-target)',
        '"" -> "mootant" (invalid invalid-target)',
        '"" -> "mootant" (invalid invalid-target)',
      ],
    ],
    [
      'x = <input autoFocus="true" />',
      ['"true" -> "" (invalid invalid-target)'],
    ],
    ['x = <my-input label="x" />', ['"x" -> "" (invalid invalid-target)']],
    [
      'x = <button bool:disabled="0" />',
      ['"0" -> "" (invalid invalid-target)'],
    ],
    [
      'x = <button onclick="save()" />',
      ['"save()" -> "" (invalid invalid-target)'],
    ],
    ['x = <input ref="field" />', ['"field" -> "" (invalid invalid-target)']],
    ['x = <ul classList="a" />', ['"a" -> "" (invalid invalid-target)']],
    [
      'x = <div innerHTML="<b>x</b>" />',
      ['"<b>x</b>" -> "" (invalid invalid-target)'],
    ],
    [
      'x = <button is="fancy-button" title="x" />',
      [
        '"fancy-button" -> "" (invalid invalid-target)',
        '"x" -> "" (invalid invalid-target)',
      ],
    ],
    [
      String.raw`x = <input pattern="\d+" />`,
      [String.raw`"\d+" -> "" (invalid invalid-target)`],
    ],
    [
      'x = <a title="a &amp; b" />',
      ['"a &amp; b" -> "" (invalid invalid-target)'],
    ],
    ['x = <a title="a\n  b" />', ['"a\n  b" -> "" (invalid invalid-target)']],
    ['x = <a title="a\tb" />', ['"a\tb" -> "" (invalid invalid-target)']],
  ])(
    'lists the skipped quoted JSX attribute values of %s with jsxAttributes',
    (source, expected) => {
      expect(
        listSkipped('string-literal', source, {
          ...JSX_ATTRIBUTES,
          file: 'example.tsx',
        }),
      ).toStrictEqual(expected)
    },
  )

  it('lists a quoted JSX attribute value with a backslash as noise without jsxAttributes', () => {
    expect(
      listSkipped('string-literal', String.raw`x = <input pattern="\d+" />`, {
        file: 'example.tsx',
      }),
    ).toStrictEqual([String.raw`"\d+" -> "" (noise jsx-attribute)`])
  })

  it.each<{ heuristic: boolean; source: string; reason: string; rule: string }>(
    [
      {
        reason: 'it only changes the class of an element',
        source: 'x = <a className="badge" />',
        rule: 'jsx-attribute',
        heuristic: true,
      },
      {
        reason: 'it only changes the class of an element',
        source: 'x = <a class="tag" />',
        rule: 'jsx-attribute',
        heuristic: true,
      },
      {
        reason: 'it only changes the style of an element',
        source: 'x = <a style="color: red" />',
        rule: 'jsx-attribute',
        heuristic: true,
      },
      {
        reason: 'it only changes the test id of an element',
        source: 'x = <a data-testid="row" />',
        rule: 'jsx-attribute',
        heuristic: true,
      },
      {
        reason:
          "Mootant cannot switch a mutant on for a quoted JSX attribute value that a compiler such as Solid's reads another way once it is in braces",
        source: 'x = <button disabled="disabled" />',
        rule: 'invalid-target',
        heuristic: true,
      },
      {
        reason:
          'Mootant cannot switch a mutant on for a quoted JSX attribute value with a backslash, a control character such as a line break, or a character reference',
        source: 'x = <a title="a &amp; b" />',
        rule: 'invalid-target',
        heuristic: false,
      },
    ],
  )(
    'explains the skipped quoted JSX attribute value of $source with jsxAttributes',
    ({ heuristic, source, reason, rule }) => {
      let { skipped } = generateCandidates(source, {
        ...JSX_ATTRIBUTES,
        file: 'example.tsx',
      })

      expect(
        skipped
          .filter(candidate => candidate.mutator === 'string-literal')
          .map(candidate => [
            candidate.rule,
            candidate.reason,
            candidate.heuristic,
          ]),
      ).toStrictEqual([[rule, reason, heuristic]])
    },
  )

  it.each<{ setup: MutatorSetup; heuristic: boolean }>([
    { setup: JSX_ATTRIBUTES, heuristic: true },
    { heuristic: false, setup: {} },
  ])(
    'marks the skip of a class name with $setup as heuristic: $heuristic',
    ({ heuristic, setup }) => {
      let { skipped } = generateCandidates('x = <a className="badge" />', {
        ...setup,
        file: 'example.tsx',
      })

      expect(
        skipped
          .filter(candidate => candidate.mutator === 'string-literal')
          .map(candidate => candidate.heuristic),
      ).toStrictEqual([heuristic])
    },
  )
  it.each<[string, string[]]>([
    [
      "x = new RegExp('^a', 'g')",
      ["'^a' -> '' (noise regex-argument)", "'g' -> '' (noise regex-argument)"],
    ],
    [`x = RegExp(\`^\${a}$\`)`, [`\`^\${a}$\` -> '' (noise regex-argument)`]],
    [`x = RegExp(\`\${a}a$\`)`, [`\`\${a}a$\` -> '' (noise regex-argument)`]],
    [`x = RegExp(\`^\${a()}$\`)`, []],
    ["x = RegExp(('a' as string))", ["'a' -> '' (noise regex-argument)"]],
    [
      `x = RegExp(\`^\${a()}\`, 'g')`,
      [`\`^\${a()}\` -> \`\${a()}\` (duplicate duplicate)`],
    ],
    ["x = RegExp('(', 'g')", ["'(' -> '' (noise regex-argument)"]],
    ["x = RegExp('a', flags)", []],
    ["let RegExp = f\nx = RegExp('a')", []],
  ])('skips the RegExp arguments of %s', (source, expected) => {
    expect(listSkipped('string-literal', source)).toStrictEqual(expected)
  })

  it.each<[string, string[]]>([
    [`x = RegExp(\`^\${a}\`, 'g')`, ["'g' -> ''"]],
    [`x = RegExp(\`\${a()}a$\`)`, [`\`\${a()}a$\` -> \`\${a()}\``]],
    ["x = RegExp('(', 'g')", ["'g' -> ''"]],
    ["x = RegExp('a', flags)", ["'a' -> ''"]],
    ["x = f('a', 'g')", ["'a' -> ''", "'g' -> ''"]],
  ])('keeps the strings of %s', (source, expected) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it('keeps the flags of a RegExp call when regex-flag is off', () => {
    expect(
      mutate("x = new RegExp('^a$', 'mi')", {
        mutators: { 'regex-flag': 'off' },
      }),
    ).toStrictEqual(["'mi' -> ''"])
  })

  it('keeps the flags of a RegExp call whose regex-flag mutants are ignored', () => {
    expect(
      mutate(
        "// mootant-ignore-next-line regex-flag\nx = new RegExp('^a$', 'mi')",
      ),
    ).toStrictEqual(["'mi' -> ''"])
  })
})
