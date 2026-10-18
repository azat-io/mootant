import { describe, expect, it, vi } from 'vitest'

import type { SourceSwitcher } from '../../../../adapters/node-test/types/source-switcher'

import { createLoadHook } from '../../../../adapters/node-test/preload/create-load-hook'

/**
 * Creates a switcher that changes `/src/a.js` only.
 *
 * @returns Switcher that appends `!` to the text of `/src/a.js`.
 */
function createSwitcher(): SourceSwitcher {
  return {
    switch: (_, code) => (code === 'same' ? null : `${code}!`),
    has: file => file === '/src/a.js',
  }
}

describe('createLoadHook', () => {
  it('switches the source of a file and keeps the format', () => {
    let record = vi.fn<(file: string) => void>()
    let apply = createLoadHook(createSwitcher(), record, true)

    expect(
      apply('file:///src/a.js', { format: 'module', source: 'code' }),
    ).toStrictEqual({ format: 'module', source: 'code!' })
    expect(
      apply('file:///src/a.js', {
        source: Buffer.from('bytes'),
        format: 'module',
      }),
    ).toStrictEqual({ source: 'bytes!', format: 'module' })
    expect(record).toHaveBeenCalledWith('/src/a.js')
  })

  it('leaves results it does not switch as they are', () => {
    let record = vi.fn<(file: string) => void>()
    let apply = createLoadHook(createSwitcher(), record, true)
    let builtin = { format: 'builtin', source: null }
    let same = { format: 'module', source: 'same' }
    let other = { format: 'module', source: 'x' }
    let commonjs = { format: 'commonjs', source: null }

    expect(apply('node:fs', builtin as never)).toBe(builtin)
    expect(apply('file:///src/a.js', same)).toBe(same)
    expect(apply('file:///src/b.js', other)).toBe(other)
    expect(apply('file:///src/a.js', commonjs as never)).toBe(commonjs)
    expect(apply('file:///src/a.js', { format: 'module' })).toStrictEqual({
      format: 'module',
    })
    expect(record.mock.calls).toStrictEqual([
      ['/src/a.js'],
      ['/src/b.js'],
      ['/src/a.js'],
      ['/src/a.js'],
    ])
  })
  it('leaves CommonJS to _compile without commonjs', () => {
    let record = vi.fn<(file: string) => void>()
    let apply = createLoadHook(createSwitcher(), record, false)
    let commonjs = { format: 'commonjs', source: 'code' }

    expect(apply('file:///src/a.js', commonjs)).toBe(commonjs)
    expect(
      apply('file:///src/a.js', {
        format: 'commonjs-typescript',
        source: 'ts',
      }),
    ).toStrictEqual({ format: 'commonjs-typescript', source: 'ts!' })
    expect(record.mock.calls).toStrictEqual([['/src/a.js'], ['/src/a.js']])
  })

  it('skips the modules mock.module() generates', () => {
    let record = vi.fn<(file: string) => void>()
    let apply = createLoadHook(createSwitcher(), record, true)
    let mock = { format: 'module', source: 'mock' }

    expect(apply('file:///src/a.js?node-test-mock=0', mock)).toBe(mock)
    expect(apply('file:///src/a.js?v=1', mock)).toStrictEqual({
      format: 'module',
      source: 'mock!',
    })
    expect(record.mock.calls).toStrictEqual([['/src/a.js']])
  })
})
