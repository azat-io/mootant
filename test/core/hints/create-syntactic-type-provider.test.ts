import type { Node } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'

import type { TypeHintProvider } from '../../../types/hints/type-hint-provider'

import { createSyntacticTypeProvider } from '../../../core/hints/create-syntactic-type-provider'
import { inferExpressionType } from '../../../core/hints/infer-expression-type'
import { createTestFile } from '../../helpers/create-test-file'

vi.mock(
  import('../../../core/hints/infer-expression-type'),
  async importOriginal => {
    let actual = await importOriginal()
    return { inferExpressionType: vi.fn(actual.inferExpressionType) }
  },
)

/**
 * Provider of a snippet with a lookup by text.
 */
interface ProvidedSnippet {
  /**
   * Finds the first node with the text and the type.
   *
   * @param text - Text of the node.
   * @param type - Type of the node.
   * @returns The node.
   */
  find(text: string, type: string): Node

  /**
   * Syntactic provider of the snippet.
   */
  provider: TypeHintProvider
}

/**
 * Parses a snippet and builds its provider. A snippet that does not parse fails
 * the test.
 *
 * @param source - Text of the snippet.
 * @param file - Name of the file, which selects the language.
 * @returns The provider and a lookup by text.
 */
function provide(source: string, file = 'example.ts'): ProvidedSnippet {
  let { parsed, scopes, find, tree } = createTestFile(source, file)
  return {
    provider: createSyntacticTypeProvider(parsed, tree, scopes),
    find: (text, type) => find(type as Node['type'], text),
  }
}

describe('createSyntacticTypeProvider', () => {
  it('memoizes the type of a node', () => {
    let { provider, find } = provide('let a = 1; a + 1')
    let node = find('a + 1', 'BinaryExpression')
    let type = provider.getType(node)
    expect(type).toStrictEqual({ kinds: ['number'] })
    expect(provider.getType(node)).toBe(type)
  })

  it('memoizes the type of an annotation', () => {
    let { provider, find } = provide('let a: string | null')
    let node = find('string | null', 'TSUnionType')
    let type = provider.getAnnotationType(node)
    expect(type).toStrictEqual({ kinds: ['null', 'string'] })
    expect(provider.getAnnotationType(node)).toBe(type)
  })

  it('gives unknown for a cycle of initializers', () => {
    let { provider, find } = provide('let a = b; let b = a; a + b')
    expect(provider.getType(find('a', 'Identifier'))).toStrictEqual({
      kinds: null,
    })
    expect(provider.getType(find('a + b', 'BinaryExpression'))).toStrictEqual({
      kinds: null,
    })
  })

  it('infers a node once its cycle has ended', () => {
    let { provider, find } = provide('const a = b - 1; const b = a; b')
    expect(provider.getType(find('b - 1', 'BinaryExpression'))).toStrictEqual({
      kinds: ['number'],
    })
  })

  it('infers a chain of 20,000 operators', () => {
    let chain = Array.from({ length: 20_000 }, (_, index) => `v * ${index}`)
    let { provider, find } = provide(`let total = ${chain.join(' + ')}`)

    expect(
      provider.getType(find(chain.join(' + '), 'BinaryExpression')),
    ).toStrictEqual({ kinds: ['number'] })
  })

  it.each<{ expected: string[]; source: string; type: string }>([
    {
      type: 'SequenceExpression',
      source: '(f(), a * 2)',
      expected: ['number'],
    },
    {
      expected: ['number', 'string'],
      type: 'ConditionalExpression',
      source: "(c ? a : 'b')",
    },
    { type: 'AssignmentExpression', expected: ['number'], source: '(y = (a))' },
    { type: 'LogicalExpression', expected: ['number'], source: '(a || 2)' },
  ])('infers the operands of $source first', ({ expected, source, type }) => {
    let { provider, find } = provide(`let a = 1; x = ${source}`)

    expect(provider.getType(find(source.slice(1, -1), type))).toStrictEqual({
      kinds: expected,
    })
  })

  it('reads an operand whose inference is in progress as unknown', () => {
    let { provider, find } = provide('let z = (y = z * 2)')

    expect(provider.getType(find('z * 2', 'BinaryExpression'))).toStrictEqual({
      kinds: ['number'],
    })
    expect(
      provider.getType(find('y = z * 2', 'AssignmentExpression')),
    ).toStrictEqual({ kinds: null })
  })

  it('infers the nodes of an inference that threw again', () => {
    let { provider, find } = provide('let a = 1; a + a * 2')
    let node = find('a + a * 2', 'BinaryExpression')
    vi.mocked(inferExpressionType).mockImplementationOnce(() => {
      throw new RangeError('Maximum call stack size exceeded')
    })

    expect(() => provider.getType(node)).toThrow(RangeError)
    expect(provider.getType(node)).toStrictEqual({ kinds: ['number'] })
  })

  it.each([
    ['let a: string = x', 'string', 'TSStringKeyword'],
    ["import.meta.glob('./a')", "'./a'", 'Literal'],
    ['let a = 1', 'let a = 1', 'VariableDeclaration'],
    ['let a = 1', 'let a = 1', 'Program'],
  ])('gives unknown for %s at %s', (source, text, type) => {
    let { provider, find } = provide(source)
    expect(provider.getType(find(text, type))).toStrictEqual({ kinds: null })
  })

  it('gives unknown for an annotation of a node that is not a type', () => {
    let { provider, find } = provide('let a = 1')
    expect(provider.getAnnotationType(find('1', 'Literal'))).toStrictEqual({
      kinds: null,
    })
  })

  it.each([
    ['example.ts', ['number']],
    ['example.js', ['null', 'number', 'undefined']],
  ])('passes the language of %s to the rules', (file, expected) => {
    let { provider, find } = provide('let a = 1; a', file)
    let reference = find('a', 'Identifier')
    expect(provider.getType(reference)).toStrictEqual({ kinds: expected })
  })
})
