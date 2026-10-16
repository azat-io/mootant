import { describe, expect, it, vi } from 'vitest'

describe('loadVueCompiler', () => {
  it('loads the compiler once', async () => {
    let { loadVueCompiler } =
      await import('../../../core/parser/load-vue-compiler')
    let compiler = await loadVueCompiler()

    expect(compiler?.parse).toBeTypeOf('function')
    expect(compiler?.compile).toBeTypeOf('function')
    await expect(loadVueCompiler()).resolves.toBe(compiler)
  })

  it('gives null when @vue/compiler-dom is not installed', async () => {
    vi.resetModules()
    vi.doMock(import('@vue/compiler-dom'), () => {
      throw new Error('Cannot find package "@vue/compiler-dom"')
    })
    let { loadVueCompiler } =
      await import('../../../core/parser/load-vue-compiler')

    await expect(loadVueCompiler()).resolves.toBeNull()
    vi.doUnmock(import('@vue/compiler-dom'))
  })

  it.each(['3.3.13', '3.4.38', '2.7.16', '3.5.0', '4.0.0'])(
    'checks the version %s',
    async version => {
      vi.resetModules()
      vi.doMock(
        import('@vue/compiler-dom/package.json'),
        async importOriginal => {
          let original = await importOriginal()
          return { default: { ...original.default, version } }
        },
      )
      let { loadVueCompiler } =
        await import('../../../core/parser/load-vue-compiler')

      expect((await loadVueCompiler()) !== null).toBe(
        version === '3.5.0' || version === '4.0.0',
      )
      vi.doUnmock(import('@vue/compiler-dom/package.json'))
    },
  )
})
