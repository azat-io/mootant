import { describe, expect, it } from 'vitest'

import { isLoggerName } from '../../../core/syntax/is-logger-name'

describe('isLoggerName', () => {
  it.each(['log', 'LOG', 'logger', 'Logger', 'requestLogger'])(
    'accepts %s',
    name => {
      expect(isLoggerName(name, [])).toBe(true)
    },
  )

  it.each(['logs', 'loggers', 'catalog', 'blog', 'console', 'dialog'])(
    'rejects %s',
    name => {
      expect(isLoggerName(name, [])).toBe(false)
    },
  )

  it('accepts the exact names of the loggers setting', () => {
    expect(isLoggerName('consola', ['signale', 'consola'])).toBe(true)
    expect(isLoggerName('Consola', ['consola'])).toBe(false)
    expect(isLoggerName('myConsola', ['consola'])).toBe(false)
  })
})
