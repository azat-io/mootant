import { describe, expect, it } from 'vitest'

import type { SyntaxHelpers } from '../../../types/syntax/syntax-helpers'

import { createSyntaxHelpers } from '../../../core/syntax/create-syntax-helpers'
import { findLoggingCalls } from '../../../core/syntax/find-logging-calls'
import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
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
    'setTimeout(run, 100)',
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
      true,
    ],
    [
      'isTimerDelay',
      syntax => syntax.isTimerDelay(find('Literal', '100')),
      true,
    ],
    [
      'isValuePosition',
      syntax => syntax.isValuePosition(find('Identifier', 'key')),
      false,
    ],
    [
      'readTimerCall',
      syntax =>
        syntax.readTimerCall(find('CallExpression', 'setTimeout(run, 100)')),
      { waits: false, delay: 1 },
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
    let syntax = createSyntaxHelpers(tree, scopes, {
      loggers: DEFAULT_LOGGERS,
    })

    expect(call(syntax)).toStrictEqual(expected)
  })
  it('binds the discarded arrow functions to isResultUnused', () => {
    let file = createTestFile('f(() => a)')
    let syntax = createSyntaxHelpers(file.tree, file.scopes, {
      discarded: new Set([file.find('ArrowFunctionExpression')]),
    })

    expect(syntax.isResultUnused(file.find('Identifier', 'a'))).toBe(true)
  })

  it('binds the logging calls of the program to isLogMessage', () => {
    let file = createTestFile("console.info('x'); run('y')")
    let syntax = createSyntaxHelpers(file.tree, file.scopes, {
      loggingCalls: findLoggingCalls(file.tree, file.scopes, ['console']),
    })

    expect(syntax.isLogMessage(file.find('Literal', "'x'"))).toBe(true)
    expect(
      syntax.isLogMessage(
        file.find('ExpressionStatement', "console.info('x');"),
      ),
    ).toBe(true)
    expect(syntax.isLogMessage(file.find('Literal', "'y'"))).toBe(false)
    expect(
      createSyntaxHelpers(file.tree, file.scopes).isLogMessage(
        file.find('Literal', "'x'"),
      ),
    ).toBe(false)
  })

  it('binds the shared scopes of the program to getLowerBound', () => {
    let file = createTestFile("let at = s.indexOf(':'); f(at)")
    let [argument] = file.find('CallExpression', 'f(at)').arguments

    expect(
      createSyntaxHelpers(file.tree, file.scopes).getLowerBound(argument!),
    ).toBe(-1)
    expect(
      createSyntaxHelpers(file.tree, file.scopes, {
        sharedScopes: new Set([file.parsed.program]),
      }).getLowerBound(argument!),
    ).toBeNull()
  })

  it('binds the names of the loggers setting to isLoggingCall', () => {
    let file = createTestFile("consola.info('x')")
    let call = file.find('CallExpression')

    expect(
      createSyntaxHelpers(file.tree, file.scopes).isLoggingCall(call),
    ).toBe(false)
    expect(
      createSyntaxHelpers(file.tree, file.scopes, {
        loggers: ['consola'],
      }).isLoggingCall(call),
    ).toBe(true)
  })
})
