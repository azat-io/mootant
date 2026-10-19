import { describe, expect, it } from 'vitest'

import type { LoggingCall } from '../../../types/syntax/logging-call'
import type { SourceRange } from '../../../types/source/source-range'

import { findLoggingCalls } from '../../../core/syntax/find-logging-calls'
import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the logging calls of a snippet with the default loggers, each with the
 * texts of its ranges.
 *
 * @param source - Text of the snippet.
 * @returns Every call with its texts instead of offsets.
 */
function describeCalls(source: string): Record<string, unknown>[] {
  let { parsed, scopes, tree } = createTestFile(source)
  let { text } = parsed
  /**
   * Reads the text of a range.
   *
   * @param range - Range of the snippet, or null.
   * @returns Its text, or null.
   */
  function read(range: SourceRange | null): string | null {
    return range === null ? null : text.slice(range.start, range.end)
  }
  return findLoggingCalls(tree, scopes, DEFAULT_LOGGERS).map(
    (call: LoggingCall) => ({
      statement: read(call.statement),
      texts: call.texts.map(read),
    }),
  )
}

describe('findLoggingCalls', () => {
  it('describes a method call that is a statement', () => {
    expect(describeCalls("console.info('a', 1);")).toStrictEqual([
      { statement: "console.info('a', 1);", texts: ["'a'"] },
    ])
  })

  it('describes a call inside an expression', () => {
    expect(describeCalls("let n = (log('found'), 1)")).toStrictEqual([
      { texts: ["'found'"], statement: null },
    ])
  })

  it('takes the literal texts of the arguments', () => {
    expect(
      describeCalls(
        [
          "logger.info('a', 1);",
          `logger.info(\`b \${c}\`);`,
          "logger.info('d' + e.f + `g`);",
          `logger.info(\`h \${i.j}\`);`,
          "logger.info(ok ? 'k' : 'l');",
          "context.logger?.info!('m');",
        ].join(' '),
      ).map(call => call['texts']),
    ).toStrictEqual([["'a'"], [`\`b \${c}\``], ["'d'", '`g`'], [], [], ["'m'"]])
  })

  it('takes the statement of a call whose arguments are plain', () => {
    expect(
      describeCalls(
        `console.log(('a'), 1, true, null, 2n, \`b \${c}\` + 'd'); console.groupEnd(); (console.warn('w') as void)`,
      ).map(call => call['statement']),
    ).toStrictEqual([
      `console.log(('a'), 1, true, null, 2n, \`b \${c}\` + 'd');`,
      'console.groupEnd();',
      "(console.warn('w') as void)",
    ])
  })

  it.each([
    'console.log(user.name)',
    'console.log(n * 0n)',
    "console.log('a' + b)",
    `console.log(\`a \${b.c}\`)`,
    'console.log(-1)',
    'console.log(...a)',
  ])('takes no statement of %s', source => {
    expect(describeCalls(source).map(call => call['statement'])).toStrictEqual([
      null,
    ])
  })

  it('takes the statement of a method of the console of a global object', () => {
    expect(
      describeCalls(
        "globalThis.console.log('a'); window.console.warn('b')",
      ).map(call => call['statement']),
    ).toStrictEqual([
      "globalThis.console.log('a');",
      "window.console.warn('b')",
    ])
  })

  it.each([
    "logger.info('x')",
    "log('x')",
    "console.write('x')",
    "context.logger.info('x')",
    "this.logger.info('x')",
    "self.console.log('x')",
    "globalThis['console'].log('x')",
    "globalThis?.console.log('x')",
    "globalThis.console?.log('x')",
    "console?.log('x')",
    "console.log?.('x')",
    "log?.('x')",
    "logger?.info!('x')",
    "logger!.info('x')",
    "console['log']('x')",
    "(console.log)('x')",
  ])('takes no statement of %s, whose callee may throw', source => {
    expect(describeCalls(source)).toMatchObject([
      { statement: null, texts: ["'x'"] },
    ])
  })

  it('lists nested calls and leaves out other calls', () => {
    expect(
      describeCalls("logger.info(format(debug('x')), 'y')").map(
        call => call['texts'],
      ),
    ).toStrictEqual([["'y'"], ["'x'"]])
  })

  it('takes no text that may hold a format directive for later arguments', () => {
    expect(
      describeCalls(
        [
          "console.log('%j', value);",
          "console.log('total %d', 1);",
          `console.log(\`at \${t}\`, 'x');`,
          "console.log('a' + 'b', 'c');",
          "console.log('debug', 1, '%s');",
          "console.log('100%');",
          String.raw`console.log('\x25j', value);`,
          'console.log(`\\x25j`, value);',
        ].join(' '),
      ).map(call => [call['texts'], call['statement'] !== null]),
    ).toStrictEqual([
      [[], false],
      [[], false],
      [["'x'"], false],
      [["'c'"], false],
      [["'debug'", "'%s'"], true],
      [["'100%'"], true],
      [[], false],
      [[], false],
    ])
  })

  it('leaves out calls of code the file binds to a non-logger', () => {
    expect(
      describeCalls(
        [
          "function log(t) { messages.push(t) } log('a');",
          "let logger = { info(t) { lines.push(t) } }; logger.info('b');",
          "let debug = (t) => t; debug('c');",
          "class Logger {} Logger.info('d');",
          "let other = class {}; other.info('e');",
          "function shadow(console) { console.log('f') }",
          "function inner() { let warnLogger = function () {}; warnLogger('g') }",
          "function g() { let logger = {}; (logger?.info)('h') }",
          "let rec = { info() {} }; function h() { let logger = rec; logger.info('i') }",
        ].join(' '),
      ).map(call => call['texts']),
    ).toStrictEqual([])
  })

  it('keeps calls of injected and imported loggers, without the statement', () => {
    expect(
      describeCalls(
        [
          "import { log } from './log.js';",
          'let logger = createLogger();',
          "function run(debug) { debug('a'); logger.info('b'); log('c') }",
          "function early() { console.log('d') }",
          "function alias() { let appLogger = logger; appLogger.info('e') }",
          "function loop() { var a = b, b = a, logger = a; logger.info('f') }",
          "function empty() { let logger; logger.info('g') }",
        ].join(' '),
      ),
    ).toStrictEqual([
      { statement: null, texts: ["'a'"] },
      { statement: null, texts: ["'b'"] },
      { statement: null, texts: ["'c'"] },
      { statement: "console.log('d')", texts: ["'d'"] },
      { statement: null, texts: ["'e'"] },
      { statement: null, texts: ["'f'"] },
      { statement: null, texts: ["'g'"] },
    ])
  })

  it('takes no statement of a console owner bound in the file', () => {
    expect(
      describeCalls(
        "function f(window) { window.console.log('a') } console.log('b')",
      ).map(call => call['statement']),
    ).toStrictEqual([null, "console.log('b')"])
  })
})
