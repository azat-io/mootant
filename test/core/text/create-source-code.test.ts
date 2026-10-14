import { describe, expect, it } from 'vitest'

import { createSourceCode } from '../../../core/text/create-source-code'
import { createTestFile } from '../../helpers/create-test-file'

let source = [
  '// Sum of the parts.',
  'let total = ((a + b)) * 2',
  'f(total, other)',
].join('\n')

let { parsed, scopes, find, tree } = createTestFile(source)

describe('createSourceCode', () => {
  it('exposes the fields of the parsed file', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)

    expect(sourceCode).toMatchObject({
      sourceType: parsed.sourceType,
      comments: parsed.comments,
      program: parsed.program,
      language: 'typescript',
      text: source,
    })
  })

  it('reads the text of a node', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)

    expect(sourceCode.getText(find('BinaryExpression', 'a + b'))).toBe('a + b')
  })

  it('finds the position of an offset', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)

    expect(sourceCode.getPosition(source.indexOf('total'))).toStrictEqual({
      column: 5,
      line: 2,
    })
  })

  it('navigates through parentheses', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)
    let sum = find('BinaryExpression', 'a + b')
    let product = find('BinaryExpression', '((a + b)) * 2')

    expect(sourceCode.getParent(sum)).toBe(product)
    expect(sourceCode.getSlot(sum)).toStrictEqual({
      parent: product,
      index: null,
      key: 'left',
    })
    expect(sourceCode.getAncestors(sum)).toStrictEqual([
      parsed.program,
      find('VariableDeclaration'),
      find('VariableDeclarator'),
      product,
    ])
    expect(sourceCode.getAncestors(parsed.program)).toStrictEqual([])
  })

  it('resolves bindings', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)
    let declared = find('Identifier', 'total', 0)

    expect(sourceCode.getBinding(find('Identifier', 'total', 1))).toMatchObject(
      { identifier: declared, kind: 'let' },
    )
    expect(sourceCode.getBinding(declared)).toMatchObject({
      identifier: declared,
    })
    expect(sourceCode.getBinding(find('Identifier', 'other'))).toBeNull()
  })

  it('finds tokens and operators', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)
    let product = find('BinaryExpression', '((a + b)) * 2')
    let start = source.indexOf('*')

    expect(sourceCode.findTokenStart(product.left.end, product.end)).toBe(start)
    expect(sourceCode.getOperatorRange(product)).toStrictEqual({
      end: start + 1,
      start,
    })
  })

  it('builds replacement texts', () => {
    let sourceCode = createSourceCode(parsed, tree, scopes)
    let call = find('CallExpression')
    let sum = find('BinaryExpression', 'a + b')

    expect(sourceCode.replaceOperator(sum, '-')).toBe('a - b')
    expect(sourceCode.removeListElement(call, 0)).toBe('f(other)')
    expect(
      sourceCode.editText(sum, [{ start: sum.end, end: sum.end, text: 'c' }]),
    ).toBe('a + b c')
  })
})
