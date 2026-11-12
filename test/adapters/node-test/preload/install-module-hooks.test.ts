import { describe, expect, it, vi } from 'vitest'

import type { SourceSwitcher } from '../../../../adapters/node-test/types/source-switcher'

import { installModuleHooks } from '../../../../adapters/node-test/preload/install-module-hooks'

let switcher: SourceSwitcher = {
  switch: (_, code) => `${code}!`,
  has: () => true,
}

let data = { plan: '/work/plan.json', out: '/work/out.jsonl', main: '/a.js' }

let hooks = new URL('file:///dist/hooks.js')

/**
 * Synchronous `load` hook as `registerHooks` receives it.
 */
type LoadHook = (
  url: string,
  context: object,
  next: (url: string, context: object) => object,
) => object

/**
 * Gives the `load` hook the mocked `registerHooks` received.
 *
 * @param registerHooks - Stand-in the hooks were registered with.
 * @returns The `load` function of the hooks it received.
 */
function readLoadHook(
  registerHooks: ReturnType<typeof vi.fn<(hooks: object) => unknown>>,
): LoadHook {
  return (registerHooks.mock.calls[0]![0] as { load: LoadHook }).load
}

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
        { commonjs: false, prototype, switcher, record, hooks, data },
      ),
    ).toBe('sync')
    expect(register).not.toHaveBeenCalled()

    let load = readLoadHook(registerHooks)
    let next = vi.fn(() => ({ format: 'module', source: 'code' }))

    expect(load('file:///a.js', { conditions: [] }, next)).toStrictEqual({
      format: 'module',
      source: 'code!',
    })
    expect(next).toHaveBeenCalledWith('file:///a.js', { conditions: [] })
    expect(record).toHaveBeenCalledWith('/a.js')

    let commonjs = { source: Buffer.from('code'), format: 'commonjs' }

    expect(load('file:///c.cjs', {}, () => commonjs)).toBe(commonjs)

    prototype._compile('code', '/b.cjs')

    expect(compile).toHaveBeenCalledWith('code!', '/b.cjs')
  })

  it('sends switched CommonJS through the CommonJS loader where Node compiles it past _compile', () => {
    let registerHooks = vi.fn<(hooks: object) => unknown>()
    let findPackageJSON = vi.fn<(specifier: string) => undefined | string>()
    let compile = vi.fn()
    let prototype = { _compile: compile }

    installModuleHooks(
      {
        register: vi.fn<(specifier: URL, options: object) => void>(),
        findPackageJSON,
        registerHooks,
      },
      {
        record: vi.fn<(file: string) => void>(),
        commonjs: true,
        prototype,
        switcher,
        hooks,
        data,
      },
    )
    let load = readLoadHook(registerHooks)
    let source = Buffer.from('code')

    expect(
      load('file:///c.js', {}, () => ({ format: 'commonjs', source })),
    ).toStrictEqual({ format: 'commonjs-sync', source })
    expect(findPackageJSON).toHaveBeenCalledWith('file:///c.js')
    expect(
      load('file:///a.js', {}, () => ({ format: 'module', source: 'code' })),
    ).toStrictEqual({ format: 'module', source: 'code!' })

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
        { commonjs: true, prototype, switcher, record, hooks, data },
      ),
    ).toBe('async')
    expect(register).toHaveBeenCalledWith(hooks, { data })

    prototype._compile('code', '/b.cjs')

    expect(compile).toHaveBeenCalledWith('code!', '/b.cjs')
    expect(record).toHaveBeenCalledWith('/b.cjs')
  })
})
