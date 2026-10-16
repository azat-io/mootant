import { describe, expect, it } from 'vitest'

import type { SyntaxHelpers } from '../../../types/syntax/syntax-helpers'

import { createSyntaxHelpers } from '../../../core/syntax/create-syntax-helpers'
import { createTestFile } from '../../helpers/create-test-file'

let { scopes, find, tree } = createTestFile(
  [
    'while (!done) {',
    '  done = items?.length > 0',
    '  i++',
    '}',
    'for (;;) {',
    '  if (ready && valid) break',
    '}',
    'try {',
    "  throw new Error('x')",
    '} catch {}',
    'function check(list) {',
    '  let size = list.length',
    '  return (value as T)',
    '}',
    'x = { key: 1 }',
    "console.log('x')",
  ].join('\n'),
)

describe('createSyntaxHelpers', () => {
  it.each<[keyof SyntaxHelpers, (syntax: SyntaxHelpers) => unknown, unknown]>([
    [
      'advancesLoop',
      syntax => syntax.advancesLoop(find('UpdateExpression', 'i++')),
      false,
    ],
    [
      'getChainRoot',
      syntax => syntax.getChainRoot(find('MemberExpression', 'items?.length')),
      find('ChainExpression', 'items?.length'),
    ],
    [
      'getContextSlot',
      syntax => syntax.getContextSlot(find('Identifier', 'value')),
      { parent: find('ReturnStatement'), key: 'argument', index: null },
    ],
    [
      'getEnclosingFunction',
      syntax => syntax.getEnclosingFunction(find('Identifier', 'value')),
      find('FunctionDeclaration'),
    ],
    [
      'getExitedLoops',
      syntax => syntax.getExitedLoops(find('IfStatement')),
      [find('ForStatement')],
    ],
    [
      'getLogicalChain',
      syntax => syntax.getLogicalChain(find('LogicalExpression')),
      [find('Identifier', 'ready'), find('Identifier', 'valid')],
    ],
    [
      'getLowerBound',
      syntax => syntax.getLowerBound(find('Identifier', 'size')),
      0,
    ],
    [
      'getMemberPath',
      syntax => syntax.getMemberPath(find('MemberExpression', 'console.log')),
      ['console', 'log'],
    ],
    [
      'getStatementList',
      syntax => syntax.getStatementList(find('ExpressionStatement', 'i++')),
      find('BlockStatement').body,
    ],
    [
      'isBooleanContext',
      syntax => syntax.isBooleanContext(find('Identifier', 'ready')),
      true,
    ],
    [
      'isConditionTest',
      syntax => syntax.isConditionTest(find('LogicalExpression')),
      true,
    ],
    [
      'isErrorMessage',
      syntax => syntax.isErrorMessage(find('Literal', "'x'")),
      true,
    ],
    [
      'isInsideTryBlock',
      syntax => syntax.isInsideTryBlock(find('NewExpression')),
      true,
    ],
    [
      'isLoggingCall',
      syntax =>
        syntax.isLoggingCall(find('CallExpression', "console.log('x')")),
      true,
    ],
    [
      'isLogicalOperand',
      syntax => syntax.isLogicalOperand(find('Identifier', 'valid')),
      true,
    ],
    [
      'isLoopAdvanceValue',
      syntax => syntax.isLoopAdvanceValue(find('BinaryExpression')),
      true,
    ],
    [
      'isLoopTest',
      syntax => syntax.isLoopTest(find('UnaryExpression', '!done')),
      true,
    ],
    [
      'isPropertyKey',
      syntax => syntax.isPropertyKey(find('Identifier', 'key')),
      true,
    ],
    [
      'isResultUnused',
      syntax => syntax.isResultUnused(find('UpdateExpression', 'i++')),
      true,
    ],
    [
      'isRuntimeNode',
      syntax => syntax.isRuntimeNode(find('Literal', "'x'", 1)),
      false,
    ],
    [
      'isValuePosition',
      syntax => syntax.isValuePosition(find('Identifier', 'key')),
      false,
    ],
    [
      'unwrapExpression',
      syntax => syntax.unwrapExpression(find('ParenthesizedExpression')),
      find('Identifier', 'value'),
    ],
    [
      'unwrapParentheses',
      syntax => syntax.unwrapParentheses(find('ParenthesizedExpression')),
      find('TSAsExpression'),
    ],
  ])('binds %s', (_name, call, expected) => {
    let syntax = createSyntaxHelpers(tree, scopes)

    expect(call(syntax)).toStrictEqual(expected)
  })
  it('binds the discarded arrow functions to isResultUnused', () => {
    let file = createTestFile('f(() => a)')
    let syntax = createSyntaxHelpers(
      file.tree,
      file.scopes,
      new Set([file.find('ArrowFunctionExpression')]),
    )

    expect(syntax.isResultUnused(file.find('Identifier', 'a'))).toBe(true)
  })
})
