import { describe, expect, it } from 'vitest'

import { DEFAULT_LOGGERS } from '../../../core/presets/default-loggers'
import { isLoggerName } from '../../../core/syntax/is-logger-name'

describe('isLoggerName', () => {
  it.each([
    'console',
    'log',
    'logger',
    'Logger',
    'requestLogger',
    'debug',
    'LOG',
    'Log',
    'LOGGER',
  ])('accepts %s with the default loggers', name => {
    expect(isLoggerName(name, DEFAULT_LOGGERS)).toBe(true)
  })

  it.each(['logs', 'loggers', 'catalog', 'blog', 'dialog', 'blogger'])(
    'rejects %s with the default loggers',
    name => {
      expect(isLoggerName(name, DEFAULT_LOGGERS)).toBe(false)
    },
  )

  it('knows no names without the setting', () => {
    expect(isLoggerName('console', [])).toBe(false)
    expect(isLoggerName('logger', [])).toBe(false)
  })

  it('accepts the names of the loggers setting in any letter case', () => {
    expect(isLoggerName('consola', ['signale', 'consola'])).toBe(true)
    expect(isLoggerName('Consola', ['consola'])).toBe(true)
    expect(isLoggerName('consola', ['CONSOLA'])).toBe(true)
    expect(isLoggerName('myConsola', ['consola'])).toBe(false)
  })

  it('accepts a name that ends with the suffix of a * entry as written', () => {
    expect(isLoggerName('auditTrail', ['*Trail'])).toBe(true)
    expect(isLoggerName('Trail', ['*Trail'])).toBe(true)
    expect(isLoggerName('trail', ['*Trail'])).toBe(true)
    expect(isLoggerName('portrait', ['*Trait'])).toBe(false)
  })
})
