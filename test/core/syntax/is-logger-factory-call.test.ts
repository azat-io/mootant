import { describe, expect, it } from 'vitest'

import { isLoggerFactoryCall } from '../../../core/syntax/is-logger-factory-call'
import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { createTestFile } from '../../helpers/create-test-file'

describe('isLoggerFactoryCall', () => {
  it.each([
    "logger.withContext('Build')",
    "logger?.withContext('Build')",
    "logger['withContext']('Build')",
    "this.logger.child({ module: 'build' })",
    "log.getLogger('build')",
    "Logger.withTag('build')",
    "app.buildLogger.child('build')",
    'logger.withContext(name)',
    "(logger.child as Function)('build')",
    "logger.withContext('a').withContext('b')",
    "logger?.withContext('a').child('b')",
    "(logger.child('a') as Logger).withTag('b')",
    "logger.withTag('a')!.withTag('b')",
    "(logger.withContext('a')?.withTag)('b')",
  ])('accepts %s', source => {
    expect(
      isLoggerFactoryCall(
        createTestFile(source).find('CallExpression'),
        DEFAULT_LOGGERS,
      ),
    ).toBe(true)
  })

  it.each([
    "withContext('Build')",
    "getLogger('build')",
    "node.child('build')",
    "console.child('build')",
    "logger.info('build')",
    "logger.children('build')",
    "this.loggers.child('build')",
    "loggers[0].child('build')",
    "f().child('build')",
    "logger[name]('build')",
    "consola.info('build')",
    "consola.withTag('build')",
    "log4js.getLogger('build')",
    "consola.withTag('a')!.withTag('b')",
    "logger.withContext('a').info('b')",
    "logger.info('a').child('b')",
    "logger.withContext('a')['withTag']('b')",
    "logger.withContext('a')[name]('b')",
    "node.child('a').child('b')",
  ])('rejects %s', source => {
    expect(
      isLoggerFactoryCall(createTestFile(source).find('CallExpression'), []),
    ).toBe(false)
  })

  it.each([
    "consola.withTag('build')",
    "this.consola.withTag('build')",
    "log4js.getLogger('build')",
    "consola.withTag('a')!.withTag('b')",
  ])('accepts %s with the loggers setting', source => {
    expect(
      isLoggerFactoryCall(createTestFile(source).find('CallExpression'), [
        'consola',
        'log4js',
      ]),
    ).toBe(true)
  })

  it.each(["consola.info('build')", "signale.withTag('build')"])(
    'rejects %s with the loggers setting',
    source => {
      expect(
        isLoggerFactoryCall(createTestFile(source).find('CallExpression'), [
          'consola',
        ]),
      ).toBe(false)
    },
  )
})
