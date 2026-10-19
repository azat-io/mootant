import { describe, expect, it } from 'vitest'

import { isConsolePath } from '../../../core/syntax/is-console-path'

describe('isConsolePath', () => {
  it.each([
    'console.log',
    'console.groupEnd',
    'globalThis.console.table',
    'window.console.count',
  ])('accepts %s', names => {
    expect(isConsolePath(names.split('.'))).toBe(true)
  })

  it.each([
    'console',
    'log.console',
    'self.console.log',
    'globalThis.log',
    'globalThis.logger.log',
    'window.console.log.bind',
  ])('rejects %s', names => {
    expect(isConsolePath(names.split('.'))).toBe(false)
  })
})
