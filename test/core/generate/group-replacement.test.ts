import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { groupReplacement } from '../../../core/generate/group-replacement'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Replacement of a node in a snippet.
 */
interface Case {
  /**
   * Type and source text of the replaced node.
   */
  found: { type: Node['type']; text: string }

  /**
   * Whether a plugin mutator wrote the replacement; false when omitted.
   */
  custom?: boolean

  /**
   * File name, which picks the language; `example.ts` when omitted.
   */
  file?: string

  /**
   * Text of the replacement.
   */
  text: string

  /**
   * Text of the snippet.
   */
  code: string
}

/**
 * Groups the replacement of a node found by its type and text.
 *
 * @param entry - Snippet, replaced node and replacement text.
 * @returns The text after grouping.
 */
function group(entry: Case): string {
  let { parsed, find, tree } = createTestFile(entry.code, entry.file)
  let node = find(entry.found.type, entry.found.text)
  return groupReplacement(
    { text: entry.text, node },
    { parsed, tree },
    entry.custom ?? false,
  ).text
}

describe('groupReplacement', () => {
  it.each<{ expected: string } & Case>([
    {
      found: { type: 'BinaryExpression', text: 'b & c' },
      code: 'x = a ^ b & c',
      expected: '(b | c)',
      text: 'b | c',
    },
    {
      found: { type: 'BinaryExpression', text: 'a & b' },
      code: 'x = a & b & c',
      expected: '(a | b)',
      text: 'a | b',
    },
    {
      found: { type: 'BinaryExpression', text: 'a < b' },
      code: 'x = q === a < b',
      expected: '(a != b)',
      text: 'a != b',
    },
    {
      found: { type: 'LogicalExpression', text: 'a ?? b' },
      code: 'x = a ?? b ?? c',
      expected: '(a || b)',
      text: 'a || b',
    },
    {
      found: { type: 'BinaryExpression', text: 'a < b' },
      code: 'x = a < b as boolean',
      expected: '(a != b)',
      text: 'a != b',
    },
    {
      found: { type: 'BinaryExpression', text: 'a < b' },
      code: 'x = a < b satisfies boolean',
      expected: '(a != b)',
      text: 'a != b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(flag ? c : d)',
      text: 'flag ? c : d',
      code: 'x = a + b',
    },
    {
      found: { type: 'BinaryExpression', text: 'b & (yield c)' },
      code: 'function* f() { x = a ^ b & (yield c) }',
      expected: '(b | (yield c))',
      text: 'b | (yield c)',
    },
    {
      found: { text: 'b & read(<Mask />)', type: 'BinaryExpression' },
      code: 'x = a ^ b & read(<Mask />)',
      expected: '(b | read(<Mask />))',
      text: 'b | read(<Mask />)',
      file: 'example.tsx',
    },
    {
      found: { type: 'BinaryExpression', text: 'b & c' },
      code: 'x = a ^ b & c',
      expected: '(b | c)',
      file: 'example.js',
      text: 'b | c',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c + d)',
      code: 'x = -b',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c + d)',
      code: 'x = <T>b',
      text: 'c + d',
    },
    {
      code: 'async function f() { x = await b }',
      found: { type: 'Identifier', text: 'b' },
      expected: '(c || d)',
      text: 'c || d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c, d)',
      code: 'fn(b)',
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c, d)',
      code: 'x = [b]',
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c + d)',
      code: 'x = b.y',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c?.d)',
      code: 'x = b.y',
      text: 'c?.d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(new C)',
      code: 'x = b.y',
      text: 'new C',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c || d)',
      code: 'x = b()',
      text: 'c || d',
    },
    {
      found: { type: 'Identifier', text: 'B' },
      code: 'x = new B()',
      expected: '(c())',
      text: 'c()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c + d)',
      code: 'x = b`t`',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c || d)',
      code: 'x = b!',
      text: 'c || d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'class A extends b {}',
      expected: '(c || d)',
      text: 'c || d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c ? d : e)',
      code: 'x = b ? 1 : 2',
      text: 'c ? d : e',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'x = a ? b : 2',
      expected: '(c, d)',
      text: 'c, d',
    },
    {
      found: { type: 'MemberExpression', text: 'a?.b' },
      expected: '(c + d)',
      code: 'x = -a?.b',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '({})',
      code: 'b.y()',
      text: '{}',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(function () {})',
      text: 'function () {}',
      code: 'b.y()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'f = () => b.y',
      expected: '({})',
      text: '{}',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'export default b',
      expected: '(class {})',
      text: 'class {}',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'for (x = f(b); ;) {}',
      expected: '(c in d)',
      text: 'c in d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c +)',
      code: 'x = a + b',
      text: 'c +',
    },
    {
      code: 'function f(a, await, c) { return a ^ await & c }',
      found: { type: 'BinaryExpression', text: 'await & c' },
      expected: '(await | c)',
      file: 'example.cjs',
      text: 'await | c',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(/* note */ { value: 1 })',
      text: '/* note */ { value: 1 }',
      code: 'f = () => b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(// note\n{})',
      text: '// note\n{}',
      code: 'b.y()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(/* note */ class {})',
      text: '/* note */ class {}',
      code: 'export default b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(let[0])',
      text: 'let[0]',
      code: 'b.y()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '({ a } = c)',
      code: 'f = () => b',
      text: '{ a } = c',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c + d)',
      code: 'fn(b)',
      text: 'c + d',
      custom: true,
    },
    {
      expected: '(async /* note */ function () {})',
      found: { type: 'Identifier', text: 'b' },
      text: 'async /* note */ function () {}',
      code: 'b.y()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      expected: '(c), (d)',
      text: 'c), (d',
      code: 'fn(b)',
    },
  ])('wraps $text in place of $found.text in $code', entry => {
    expect(group(entry)).toBe(entry.expected)
  })

  it.each<Case>([
    {
      found: { type: 'BinaryExpression', text: 'b & c' },
      code: 'x = a ^ (b & c)',
      text: 'b | c',
    },
    {
      found: { type: 'BinaryExpression', text: 'a < b' },
      code: 'x = q === a < b',
      text: 'a <= b',
    },
    {
      found: { type: 'BinaryExpression', text: 'a < b' },
      code: 'x = q === a < b',
      text: 'false',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'c ? d : e',
      code: 'x = b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'c + d',
      code: 'fn(b)',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'f = () => b',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'function f() { return b }',
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'if (b) {}',
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: `x = \`\${b}\``,
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'x = a[b]',
      text: 'c, d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'x = -b',
      text: '!c',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'x = b.y',
      text: 'c()',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'x = b ? 1 : 2',
      text: 'c || d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'b.y()',
      text: 'c',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'for (x = b; ;) {}',
      text: 'c + d',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'for (;;) { x = b }',
      text: 'c in d',
    },
    {
      found: { type: 'TSAsExpression', text: 'a as T' },
      code: 'x = a as T as U',
      text: 'a as T',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: '/* note */ c',
      code: 'f = () => b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: "'value'",
      code: 'fn(b)',
      custom: true,
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'if (b) {}',
      text: 'c + d',
      custom: true,
    },
    {
      found: { type: 'Identifier', text: 'b' },
      file: 'example.tsx',
      code: 'render(b)',
      text: '<B />',
    },
    {
      found: { type: 'ExpressionStatement', text: 'b.y()' },
      code: 'b.y()',
      text: ';',
    },
    {
      found: { type: 'TSNumberKeyword', text: 'number' },
      code: 'let n: number = 1',
      text: 'string',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'export default b',
      text: '{}',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'function () {}',
      code: 'f = () => b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'async function () {}',
      code: 'f = () => b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'async () => c',
      code: 'b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'let',
      code: 'b',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      code: 'f = () => b',
      text: 'let[0]',
    },
    {
      found: { type: 'Identifier', text: 'b' },
      text: 'c + d',
      custom: true,
      code: 'b',
    },
  ])('keeps $text in place of $found.text in $code', entry => {
    expect(group(entry)).toBe(entry.text)
  })
})
