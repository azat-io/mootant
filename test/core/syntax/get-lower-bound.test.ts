import type { CallExpression, Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'

import type { TestFile } from '../../helpers/create-test-file'

import { parseComponentTemplate } from '../../../core/parser/parse-component-template'
import { solveValueBounds } from '../../../core/syntax/solve-value-bounds'
import { getSharedScopes } from '../../../core/parser/get-shared-scopes'
import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { getLowerBound } from '../../../core/syntax/get-lower-bound'
import { analyzeScopes } from '../../../core/hints/analyze-scopes'
import { createTestFile } from '../../helpers/create-test-file'
import { indexTree } from '../../../core/tree/index-tree'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Bounds the argument of the call of a name in the template of a Svelte
 * component, with the shared scopes that generateFileMutants gives the template
 * program.
 *
 * @param source - Text of the component, whose template calls one name.
 * @returns Lower bound of the argument of that call.
 * @throws Error - When the template does not parse.
 */
function boundInSvelteTemplate(source: string): number | null {
  let file = 'Card.svelte'
  let template = parseComponentTemplate(
    { vue: null, svelte },
    { lang: 'js', source, file },
  )
  if (template.kind !== 'parsed') {
    throw new Error('The template does not parse.')
  }
  let { program } = template.parsed
  let calls: CallExpression[] = []
  walkTree(program, node => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      calls.push(node)
    }
    return true
  })
  let bounds = solveValueBounds(
    indexTree(program, DEFAULT_LOGGERS),
    analyzeScopes(program),
    getSharedScopes(file, program, template.expressions),
  )
  return getLowerBound(bounds, calls[0]!.arguments[0]!)
}

/**
 * Bounds an expression of a snippet, with the scopes that other code shares.
 *
 * @param file - Parsed snippet.
 * @param node - Expression of the snippet.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Lower bound of the expression.
 */
function boundOf(file: TestFile, node: Node, component = false): number | null {
  let shared = new Set(component ? [file.parsed.program] : [])
  return getLowerBound(solveValueBounds(file.tree, file.scopes, shared), node)
}

describe('getLowerBound', () => {
  it.each([
    { source: 'f(s.length)', expected: 0 },
    { source: 'f(s.size)', expected: null },
    { source: 'f(s.byteLength)', expected: null },
    { source: 'f((s.length as number))', expected: 0 },
    { source: 'f(s.indexOf(x))', expected: -1 },
    { source: 'f(s.lastIndexOf(x))', expected: -1 },
    { source: 'f(s.findIndex(g))', expected: -1 },
    { source: 'f(s.findLastIndex(g))', expected: -1 },
    { source: 'f((s.search)(x))', expected: -1 },
    { source: 'f(s?.length)', expected: null },
    { source: 'f(s?.indexOf(x))', expected: null },
    { source: 'f(s[length])', expected: null },
    { source: 'f(s.count)', expected: null },
    { source: 'f(s.includes(x))', expected: null },
    { source: 'f(s[indexOf](x))', expected: null },
    { source: 'f(indexOf(x))', expected: null },
    { source: 'f(Math.abs(x))', expected: null },
    { source: 'f(1)', expected: null },
  ])('gives $expected for the argument of $source', ({ expected, source }) => {
    let file = createTestFile(source)

    let node = file.find('CallExpression', source).arguments[0]!

    expect(boundOf(file, node)).toBe(expected)
  })

  it.each([
    {
      source: 'let m = new Map(); m.set(k, 1); f(m.get(k))',
      call: 'f(m.get(k))',
      expected: null,
    },
    {
      source: 'let m = new Map(); m.set(k, 1); f(m.get(k) ?? 2)',
      call: 'f(m.get(k) ?? 2)',
      expected: 1,
    },
    {
      source: 'let set = new Set(s); f(set.size)',
      call: 'f(set.size)',
      expected: 0,
    },
    { source: 'let row = 0; row++; f(row)', call: 'f(row)', expected: 0 },
  ])(
    'gives only a bound that is never nullish for the argument of f in $source',
    ({ expected, source, call }) => {
      let file = createTestFile(source)

      let [argument] = file.find('CallExpression', call).arguments

      expect(boundOf(file, argument!)).toBe(expected)
    },
  )

  it('gives null for a private length field', () => {
    let file = createTestFile(
      ['class C {', '  #length = 1', '  m() { return this.#length }', '}'].join(
        '\n',
      ),
    )

    expect(boundOf(file, file.find('MemberExpression'))).toBeNull()
  })

  it.each([
    { source: "const at = s.indexOf(':'); f(at)", call: 'f(at)', expected: -1 },
    { source: 'let n = s.length; f(n)', call: 'f(n)', expected: 0 },
    {
      source: 'const a = b; const b = s.length; f(a)',
      call: 'f(a)',
      expected: 0,
    },
    {
      source: 'const n = (s.length as number); f((n!))',
      call: 'f((n!))',
      expected: 0,
    },
    { source: 'let n = s.length; n *= 2; f(n)', expected: null, call: 'f(n)' },
    { source: 'let n = s.length; n = -1; f(n)', expected: -1, call: 'f(n)' },
    { source: 'let n = s.length; n = 1; f(n)', call: 'f(n)', expected: 0 },
    { source: 'let n = s.length; n++; f(n)', call: 'f(n)', expected: 0 },
    { source: 'var n = s.length; f(n)', expected: null, call: 'f(n)' },
    { source: 'let n; f(n)', expected: null, call: 'f(n)' },
    { source: 'const { length: n } = s; f(n)', expected: null, call: 'f(n)' },
    { source: 'for (const n of s) f(n)', expected: null, call: 'f(n)' },
    {
      source: 'function g(n = s.length) { f(n) }',
      expected: null,
      call: 'f(n)',
    },
    { source: 'const n = b; const b = n; f(n)', expected: null, call: 'f(n)' },
    { source: 'f(n)', expected: null, call: 'f(n)' },
  ])(
    'follows the binding of the argument of f in $source',
    ({ expected, source, call }) => {
      let file = createTestFile(source)

      let [argument] = file.find('CallExpression', call).arguments

      expect(boundOf(file, argument!)).toBe(expected)
    },
  )

  it.each([
    {
      source: "export let at = s.indexOf(':'); f(at)",
      title: 'a Svelte prop',
      component: true,
      call: 'f(at)',
      file: 'a.ts',
    },
    {
      title: 'a Vue setup let that the template may write',
      source: "let cursor = s.indexOf(':'); f(cursor)",
      call: 'f(cursor)',
      component: true,
      file: 'a.ts',
    },
    {
      title: 'an Astro frontmatter let',
      source: 'let n = s.length; f(n)',
      component: true,
      call: 'f(n)',
      file: 'a.ts',
    },
    {
      source:
        "namespace N { export let at = s.indexOf(':'); export function g() { f(at) } }",
      title: 'an exported let of a namespace',
      component: false,
      call: 'f(at)',
      file: 'a.ts',
    },
    {
      source:
        "namespace N { export const at = s.indexOf(':'); export function g() { f(at) } }",
      title: 'an exported const of a namespace',
      component: false,
      call: 'f(at)',
      file: 'a.ts',
    },
    {
      source: 'let n = s.length; eval(code); f(n)',
      title: 'a program with a direct eval',
      component: false,
      call: 'f(n)',
      file: 'a.ts',
    },
    {
      source: 'function check(eval) { let n = s.length; eval(code); f(n) }',
      title: 'a program that calls a parameter named eval',
      component: false,
      file: 'a.cjs',
      call: 'f(n)',
    },
    {
      source: "const at = s.indexOf(':'); with (o) { f(at) }",
      title: 'a program with a with statement',
      component: false,
      call: 'f(at)',
      file: 'a.js',
    },
  ])('gives no bound through $title', ({ component, source, call, file }) => {
    let snippet = createTestFile(source, file)

    let [argument] = snippet.find('CallExpression', call).arguments

    expect(boundOf(snippet, argument!, component)).toBeNull()
  })

  it.each([
    {
      source: 'export let n = s.length; f(n)',
      title: 'a module-level export let',
      component: false,
      call: 'f(n)',
      expected: 0,
    },
    {
      source: "const at = s.indexOf(':'); f(at)",
      title: 'a top-level const of a component',
      component: true,
      call: 'f(at)',
      expected: -1,
    },
    {
      source: "function g() { let at = s.indexOf(':'); f(at) }",
      title: 'a function-local let of a component',
      component: true,
      call: 'f(at)',
      expected: -1,
    },
  ])(
    'keeps the bound through $title',
    ({ component, expected, source, call }) => {
      let file = createTestFile(source)

      let [argument] = file.find('CallExpression', call).arguments

      expect(boundOf(file, argument!, component)).toBe(expected)
    },
  )

  it.each([
    {
      source:
        "{let at = s.indexOf(':'), missing = () => f(at)}\n<button onclick={() => (at = -5)}>x</button>",
      title: 'a Svelte declaration tag let that the template writes',
      expected: null,
    },
    {
      source: "{const at = s.indexOf(':'), missing = () => f(at)}",
      title: 'a Svelte declaration tag const',
      expected: -1,
    },
  ])('gives $expected through $title', ({ expected, source }) => {
    expect(boundInSvelteTemplate(source)).toBe(expected)
  })
})
