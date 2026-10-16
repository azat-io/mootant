import { describe, expect, it } from 'vitest'

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
    'LOG.error(message)',
    'app.logger.fatal(message)',
    'this.logger.warn(message)',
    'context.log.debug(message)',
    'this.requestLogger.error(error)',
    'log.verbose(message)',
    "log('found %d', count)",
    'debug(`found`)',
    "log(('found'))",
    "(console.log as Function)('a')",
  ])('accepts %s', source => {
    expect(
      isLoggingCall(createTestFile(source).find('CallExpression'), []),
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
    'window.console.log(message)',
    'logger.push(entry)',
    'catalog.info(message)',
    'this.loggers.info(message)',
    'requestLogger.write(message)',
    'console(message)',
    'f()(message)',
    'loggers[0].info(message)',
    "consola.info('found')",
  ])('rejects %s', source => {
    expect(
      isLoggingCall(createTestFile(source).find('CallExpression'), []),
    ).toBe(false)
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
