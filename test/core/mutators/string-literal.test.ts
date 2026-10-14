import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { formatMutant } from '../../helpers/format-mutant'
import { runMutator } from '../../helpers/run-mutator'

describe('stringLiteral', () => {
  it.each<{ expected: string[]; source: string; file?: string }>([
    { expected: ["'Hello' -> ''"], source: "x = 'Hello'" },
    { expected: ["'' -> 'mootant'"], source: "x = ''" },
    {
      expected: [`\`/api/\${id}/items\` -> \`\${id}\``],
      source: `x = \`/api/\${id}/items\``,
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
    expect(
      runMutator('string-literal', source, { file }).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    { expected: ['"a" -> ""'], source: 'x = "a"' },
    { expected: ['`` -> `mootant`'], source: 'x = ``' },
    { expected: ['`abc` -> ``'], source: 'x = `abc`' },
    {
      expected: [`\`a\${x}b\${y}\` -> \`\${x}\${y}\``],
      source: `x = \`a\${x}b\${y}\``,
    },
    { expected: [`\`a\${(x)}\` -> \`\${(x)}\``], source: `x = \`a\${(x)}\`` },
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
    expect(
      runMutator('string-literal', source).map(formatMutant),
    ).toStrictEqual(expected)
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
    expect(
      runMutator('string-literal', source).map(formatMutant),
    ).toStrictEqual(expected)
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
      source: `x = ok ? \`\${a}\` : \`x\${a}\``,
      expected: [],
    },
    {
      source: `x = ok ? \`\${b}\` : \`x\${a}\``,
      expected: [`\`x\${a}\` -> \`\${a}\``],
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
      expect(
        runMutator('string-literal', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator',
        "  return x >= 5 ? '' : 'small'",
        '}',
      ].join('\n'),
      setup: {},
    },
    {
      source: "function f(x: number) { return x >= 5 ? '' : 'small' }",
      setup: { mutators: { 'comparison-operator': 'off' } },
    },
  ])(
    'copies a branch when the comparison will not run in $source',
    ({ source, setup }) => {
      expect(
        runMutator('string-literal', source, setup).map(formatMutant),
      ).toStrictEqual(["'' -> 'mootant'", "'small' -> ''"])
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
      expect(
        runMutator('string-literal', source, setup).map(formatMutant),
      ).toStrictEqual(["'anon' -> ''"])
    },
  )

  it.each<{ setup: MutatorSetup }>([
    { setup: { mutators: { 'string-literal': ['on', { caseTests: true }] } } },
    { setup: { preset: 'strict' } },
  ])('mutates case labels with $setup', ({ setup }) => {
    expect(
      runMutator('string-literal', "switch (x) { case 'x': run() }", setup).map(
        formatMutant,
      ),
    ).toStrictEqual(["'x' -> ''"])
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
      setup: { mutators: { 'comparison-operator': 'off' } },
      source: "x = mode === 'dark'",
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
      expect(
        runMutator('string-literal', source, setup).map(formatMutant),
      ).toStrictEqual(expected)
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
      expect(
        runMutator('string-literal', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )
})
