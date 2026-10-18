import { describe, expect, it, vi } from 'vitest'

import { patchModuleCompile } from '../../../../adapters/node-test/preload/patch-module-compile'

describe('patchModuleCompile', () => {
  it('compiles the text the switcher gives', () => {
    let compile = vi.fn<(this: unknown, ...parameters: unknown[]) => unknown>(
      function (this: unknown) {
        return this
      },
    )
    let prototype = { _compile: compile }
    let record = vi.fn<(file: string) => void>()
    patchModuleCompile(
      prototype,
      {
        switch: (_, code) => (code === 'same' ? null : `${code}!`),
        has: file => file === '/src/a.js',
      },
      record,
    )
    let module = Object.create(prototype) as typeof prototype

    expect(module._compile('code', '/src/a.js', 'commonjs')).toBe(module)
    expect(module._compile('same', '/src/a.js')).toBe(module)
    expect(module._compile('code', '/src/b.js')).toBe(module)
    expect(compile.mock.calls).toStrictEqual([
      ['code!', '/src/a.js', 'commonjs'],
      ['same', '/src/a.js'],
      ['code', '/src/b.js'],
    ])
    expect(record.mock.calls).toStrictEqual([
      ['/src/a.js'],
      ['/src/a.js'],
      ['/src/b.js'],
    ])
  })
})
