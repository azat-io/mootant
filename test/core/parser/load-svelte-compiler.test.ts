import { describe, expect, it, vi } from 'vitest'

describe('loadSvelteCompiler', () => {
  it('loads the compiler once', async () => {
    let { loadSvelteCompiler } =
      await import('../../../core/parser/load-svelte-compiler')
    let compiler = await loadSvelteCompiler()

    expect(compiler?.parse).toBeTypeOf('function')
    expect(compiler?.compile).toBeTypeOf('function')
    await expect(loadSvelteCompiler()).resolves.toBe(compiler)
  })

  it('gives null when svelte is not installed', async () => {
    vi.resetModules()
    vi.doMock(import('svelte/compiler'), () => {
      throw new Error('Cannot find package "svelte"')
    })
    let { loadSvelteCompiler } =
      await import('../../../core/parser/load-svelte-compiler')

    await expect(loadSvelteCompiler()).resolves.toBeNull()
    vi.doUnmock(import('svelte/compiler'))
  })

  it('gives null for Svelte 4, whose parser has no modern tree', async () => {
    vi.resetModules()
    vi.doMock(import('svelte/compiler'), async importOriginal => ({
      ...(await importOriginal()),
      VERSION: '4.2.20',
    }))
    let { loadSvelteCompiler } =
      await import('../../../core/parser/load-svelte-compiler')

    await expect(loadSvelteCompiler()).resolves.toBeNull()
    vi.doUnmock(import('svelte/compiler'))
  })
})
