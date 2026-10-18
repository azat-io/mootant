import { describe, expect, it, vi } from 'vitest'

import type { SourceSwitcher } from '../../../../adapters/node-test/types/source-switcher'

import { installModuleHooks } from '../../../../adapters/node-test/preload/install-module-hooks'

let switcher: SourceSwitcher = {
  switch: (_, code) => `${code}!`,
  has: () => true,
}

let data = { plan: '/work/plan.json', out: '/work/out.jsonl', main: '/a.js' }

let hooks = new URL('file:///dist/hooks.js')

describe('installModuleHooks', () => {
  it('registers a synchronous load hook where Node has registerHooks', () => {
    let registerHooks = vi.fn<(hooks: object) => unknown>()
    let register = vi.fn<(specifier: URL, options: object) => void>()
    let compile = vi.fn()
    let prototype = { _compile: compile }
    let record = vi.fn<(file: string) => void>()

    expect(
      installModuleHooks(
        { registerHooks, register },
        { prototype, switcher, record, hooks, data },
      ),
    ).toBe('sync')
    expect(register).not.toHaveBeenCalled()

    let { load } = registerHooks.mock.calls[0]![0] as {
      load(
        url: string,
        context: object,
        next: (url: string, context: object) => object,
      ): object
    }
    let next = vi.fn(() => ({ format: 'module', source: 'code' }))

    expect(load('file:///a.js', { conditions: [] }, next)).toStrictEqual({
      format: 'module',
      source: 'code!',
    })
    expect(next).toHaveBeenCalledWith('file:///a.js', { conditions: [] })
    expect(record).toHaveBeenCalledWith('/a.js')

    let commonjs = { format: 'commonjs', source: 'code' }

    expect(load('file:///c.cjs', {}, () => commonjs)).toBe(commonjs)

    prototype._compile('code', '/b.cjs')

    expect(compile).toHaveBeenCalledWith('code!', '/b.cjs')
  })

  it('registers the hooks module and patches _compile on older Node', () => {
    let register = vi.fn<(specifier: URL, options: object) => void>()
    let compile = vi.fn()
    let prototype = { _compile: compile }
    let record = vi.fn<(file: string) => void>()

    expect(
      installModuleHooks(
        { register },
        { prototype, switcher, record, hooks, data },
      ),
    ).toBe('async')
    expect(register).toHaveBeenCalledWith(hooks, { data })

    prototype._compile('code', '/b.cjs')

    expect(compile).toHaveBeenCalledWith('code!', '/b.cjs')
    expect(record).toHaveBeenCalledWith('/b.cjs')
  })
})
