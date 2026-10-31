import type { IdentifierReference } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'

import type { SyntaxHelpers } from '../../../types/syntax/syntax-helpers'

import { createSyntaxHelpers } from '../../../core/syntax/create-syntax-helpers'
import { findLoggingCalls } from '../../../core/syntax/find-logging-calls'
import { solveValueBounds } from '../../../core/syntax/solve-value-bounds'
import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { createTestFile } from '../../helpers/create-test-file'

vi.mock(
  import('../../../core/syntax/solve-value-bounds'),
  async importOriginal => {
    let actual = await importOriginal()
    return { solveValueBounds: vi.fn(actual.solveValueBounds) }
  },
)

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
    'let quiet = options.quiet ?? false',
    'if (quiet) run()',
    'x = date?.toISOString() ?? null',
    'let parts = []',
    "parts.push('a')",
    "x = parts.join('')",
    'x = /(?<a>b)/u.exec(s)?.groups?.a',
    'items.forEach(() => count++)',
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
      'getValueBound',
      syntax => syntax.getValueBound(find('Identifier', 'size')),
      {
        because: '`size` keeps its initial value; a length is never negative',
        nullable: false,
        integer: true,
        lower: 0,
      },
    ],
    [
      'getNeverFalsyFact',
      syntax =>
        syntax.getNeverFalsyFact(
          find('ChainExpression', 'date?.toISOString()'),
        ),
      '`toISOString` never returns an empty string',
    ],
    [
      'getNamedGroupsFact',
      syntax =>
        syntax.getNamedGroupsFact(
          find('MemberExpression', '/(?<a>b)/u.exec(s)?.groups'),
        ),
      'the regex has a named group, so groups is an object whenever the match is',
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
      'isForEachResult',
      syntax => syntax.isForEachResult(find('UpdateExpression', 'count++')),
      true,
    ],
    [
      'isInsideTryBlock',
      syntax => syntax.isInsideTryBlock(find('NewExpression')),
      true,
    ],
    [
      'isJoinedArray',
      syntax => syntax.isJoinedArray(find('ArrayExpression', '[]')),
      true,
    ],
    ['isGlobalName', syntax => syntax.isGlobalName('undefined'), true],
    [
      'isGlobalTypeName',
      syntax =>
        syntax.isGlobalTypeName(
          find('TSTypeReference', 'T').typeName as IdentifierReference,
        ),
      true,
    ],
    [
      'isNonThenable',
      syntax => syntax.isNonThenable(find('Literal', "'x'")),
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
      'getTruthOnlyName',
      syntax =>
        syntax.getTruthOnlyName(
          find('LogicalExpression', 'options.quiet ?? false'),
        ),
      'quiet',
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

  it('binds the shared scopes of the program to getLowerBound and getValueBound', () => {
    let file = createTestFile("let at = s.indexOf(':'); f(at)")
    let [argument] = file.find('CallExpression', 'f(at)').arguments
    let shared = createSyntaxHelpers(file.tree, file.scopes, {
      sharedScopes: new Set([file.parsed.program]),
    })

    expect(
      createSyntaxHelpers(file.tree, file.scopes).getLowerBound(argument!),
    ).toBe(-1)
    expect(shared.getLowerBound(argument!)).toBeNull()
    expect(shared.getValueBound(argument!)).toBeNull()
  })

  it('binds the shared scopes of the program to getNeverFalsyFact and getTruthOnlyName', () => {
    let file = createTestFile(
      [
        'let counts = new Map()',
        'for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
        'let found = counts.get(key) ?? false',
        'if (found) run()',
      ].join('\n'),
    )
    let node = file.find('LogicalExpression', 'counts.get(key) ?? false')
    let own = createSyntaxHelpers(file.tree, file.scopes)
    let shared = createSyntaxHelpers(file.tree, file.scopes, {
      sharedScopes: new Set([file.parsed.program]),
    })

    expect(own.getNeverFalsyFact(node.left)).toBe(
      'it is a number of at least 1, since every value stored in `counts` is at least 1',
    )
    expect(own.getTruthOnlyName(node)).toBe('found')
    expect(shared.getNeverFalsyFact(node.left)).toBeNull()
    expect(shared.getTruthOnlyName(node)).toBeNull()
  })

  it('binds the shared scopes of the program to isLoopAdvanceValue', () => {
    let file = createTestFile(
      'let next = 2; function run() { let i = 0; while (i < 10) i = next }',
    )
    let value = file.find('Literal', '2')
    let own = createSyntaxHelpers(file.tree, file.scopes)
    let shared = createSyntaxHelpers(file.tree, file.scopes, {
      sharedScopes: new Set([file.parsed.program]),
    })

    expect(own.isLoopAdvanceValue(value)).toBe(true)
    expect(shared.isLoopAdvanceValue(value)).toBe(false)
  })

  it('binds the shared scopes of the program to getNamedGroupsFact and isJoinedArray', () => {
    let file = createTestFile(
      [
        'let parts = []',
        "parts.push('a')",
        "x = parts.join('')",
        'let match = s.match(/(?<a>b)/u)',
        'x = match?.groups?.a',
      ].join('\n'),
    )
    let groups = file.find('MemberExpression', 'match?.groups')
    let array = file.find('ArrayExpression', '[]')
    let own = createSyntaxHelpers(file.tree, file.scopes)
    let shared = createSyntaxHelpers(file.tree, file.scopes, {
      sharedScopes: new Set([file.parsed.program]),
    })

    expect(own.getNamedGroupsFact(groups)).toBe(
      'the regex has a named group, so groups is an object whenever the match is',
    )
    expect(own.isJoinedArray(array)).toBe(true)
    expect(shared.getNamedGroupsFact(groups)).toBeNull()
    expect(shared.isJoinedArray(array)).toBe(false)
  })

  it('binds the shared scopes of the program to isGlobalName', () => {
    let file = createTestFile("let parts = []; x = parts.join('')")

    expect(
      createSyntaxHelpers(file.tree, file.scopes).isGlobalName('undefined'),
    ).toBe(true)
    expect(
      createSyntaxHelpers(file.tree, file.scopes, {
        sharedScopes: new Set([file.parsed.program]),
      }).isGlobalName('undefined'),
    ).toBe(false)
  })

  it('solves the bounds of the program once, on the first question about a bound', () => {
    let file = createTestFile('let row = 0; row++; f(row)')
    let [argument] = file.find('CallExpression', 'f(row)').arguments
    vi.mocked(solveValueBounds).mockClear()
    let syntax = createSyntaxHelpers(file.tree, file.scopes)

    expect(syntax.getTruthOnlyName(argument!)).toBeNull()
    expect(syntax.isJoinedArray(argument!)).toBe(false)
    expect(syntax.getNamedGroupsFact(argument!)).toBeNull()
    expect(solveValueBounds).not.toHaveBeenCalled()
    expect(syntax.getValueBound(argument!)).toMatchObject({ lower: 0 })
    expect(syntax.getLowerBound(argument!)).toBe(0)
    expect(syntax.getNeverFalsyFact(argument!)).toBeNull()
    expect(solveValueBounds).toHaveBeenCalledExactlyOnceWith(
      file.tree,
      file.scopes,
      new Set(),
    )
  })

  it('solves no more after the fixed point throws and proves nothing about the names that change', () => {
    let file = createTestFile('let row = 0; row++; f(row, s.length)')
    let [row, length] = file.find(
      'CallExpression',
      'f(row, s.length)',
    ).arguments
    vi.mocked(solveValueBounds)
      .mockClear()
      .mockImplementationOnce(() => {
        throw new Error('Broken solve')
      })
    let syntax = createSyntaxHelpers(file.tree, file.scopes)

    expect(() => syntax.getValueBound(row!)).toThrow('Broken solve')
    expect(syntax.getValueBound(row!)).toBeNull()
    expect(syntax.getNeverFalsyFact(row!)).toBeNull()
    expect(syntax.getLowerBound(length!)).toBe(0)
    expect(solveValueBounds).toHaveBeenCalledExactlyOnceWith(
      file.tree,
      file.scopes,
      new Set(),
    )
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
