import { describe, expect, it } from 'vitest'

import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { isLoggingCall } from '../../../core/syntax/is-logging-call'
import { createTestFile } from '../../helpers/create-test-file'

describe('isLoggingCall', () => {
  it.each([
    "console.log('a')",
    'console.time()',
    "console['error'](error)",
    'console?.warn(message)',
    'logger.info(message)',
    'Logger.warn(message)',
    'app.logger.fatal(message)',
    'this.logger.warn(message)',
    'context.log.debug(message)',
    'this.requestLogger.error(error)',
    'log.verbose(message)',
    "log('found %d', count)",
    'debug(`found`)',
    "log(('found'))",
    "(console.log as Function)('a')",
    'globalThis.console.log(message)',
    'window.console.log(message)',
    'globalThis.console.groupEnd()',
    'window.console.table(rows)',
    'globalThis.console.count()',
    'window.console.assert(ok)',
    'LOG.error(message)',
  ])('accepts %s with the default loggers', source => {
    expect(
      isLoggingCall(
        createTestFile(source).find('CallExpression'),
        DEFAULT_LOGGERS,
      ),
    ).toBe(true)
  })

  it.each([
    'log.push(entry)',
    'log(x)',
    'debug(x)',
    'log(1)',
    'log()',
    'log(...entries)',
    "info('found')",
    "print('found')",
    'logger.push(entry)',
    'catalog.info(message)',
    'this.loggers.info(message)',
    'requestLogger.write(message)',
    'console(message)',
    'f()(message)',
    'loggers[0].info(message)',
    "consola.info('found')",
    'self.console.groupEnd()',
    'globalThis.groupEnd()',
  ])('rejects %s with the default loggers', source => {
    expect(
      isLoggingCall(
        createTestFile(source).find('CallExpression'),
        DEFAULT_LOGGERS,
      ),
    ).toBe(false)
  })

  it.each(["console.log('a')", 'logger.info(message)', "log('found')"])(
    'rejects %s without loggers',
    source => {
      expect(
        isLoggingCall(createTestFile(source).find('CallExpression'), []),
      ).toBe(false)
    },
  )

  it.each(["console.log('a')", "log('found')", 'requestLogger.info(message)'])(
    'rejects %s when the loggers setting leaves its name out',
    source => {
      expect(
        isLoggingCall(createTestFile(source).find('CallExpression'), [
          'consola',
        ]),
      ).toBe(false)
    },
  )

  it('accepts a bare call of a name the loggers setting names', () => {
    expect(
      isLoggingCall(createTestFile("trace('found')").find('CallExpression'), [
        'trace',
      ]),
    ).toBe(true)
  })

  it.each(["consola.info('found')", 'this.signale.warn(message)'])(
    'accepts %s with the loggers setting',
    source => {
      expect(
        isLoggingCall(createTestFile(source).find('CallExpression'), [
          'consola',
          'signale',
        ]),
      ).toBe(true)
    },
  )

  it.each(['consola.push(entry)', "myConsola.info('found')"])(
    'rejects %s with the loggers setting',
    source => {
      expect(
        isLoggingCall(createTestFile(source).find('CallExpression'), [
          'consola',
        ]),
      ).toBe(false)
    },
  )
})
