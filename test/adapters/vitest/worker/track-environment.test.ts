import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

import { trackEnvironment } from '../../../../adapters/vitest/worker/track-environment'

/**
 * Lets the current synchronous run end, so a listing of the variables no longer
 * covers the names read after it.
 */
async function nextRun(): Promise<void> {
  await Promise.resolve()
}

describe('trackEnvironment', () => {
  it('reports the variables code reads, and all of them when it lists them', async () => {
    let names: string[] = []
    let state = { metaEnv: { MODE: 'test' } as object }
    let real = trackEnvironment(state, name => {
      names.push(name)
    })
    process.env['MOOTANT_SET'] = 'value'

    expect(process.env['MOOTANT_SET']).toBe('value')
    expect('MOOTANT_HAS' in process.env).toBe(false)
    expect(Object.hasOwn(process.env, 'MOOTANT_OWN')).toBe(false)
    expect(process.env['VITEST_POOL_ID']).toBeDefined()
    expect(Reflect.get(process.env, Symbol.iterator)).toBeUndefined()
    expect(real['MOOTANT_SET']).toBe('value')
    expect(names).toStrictEqual(['MOOTANT_SET', 'MOOTANT_HAS', 'MOOTANT_OWN'])

    names.length = 0
    let copy = { ...process.env }

    expect(copy['MOOTANT_SET']).toBe('value')
    expect(Object.keys(process.env)).toContain('MOOTANT_SET')
    expect(Object.entries(process.env).length).toBeGreaterThan(0)
    expect(JSON.stringify(process.env)).toContain('MOOTANT_SET')
    expect(process.env['MOOTANT_SET']).toBe('value')
    expect(names).toStrictEqual(['*', '*', '*', '*'])

    await nextRun()
    names.length = 0
    let { metaEnv } = state

    expect(Reflect.get(metaEnv, 'MODE')).toBe('test')
    expect('DEV' in metaEnv).toBe(false)
    expect(Object.keys(metaEnv)).toStrictEqual(['MODE'])
    expect(names).toStrictEqual(['MODE', 'DEV', '*'])

    await nextRun()
    names.length = 0

    expect(process.env['MOOTANT_SET']).toBe('value')
    expect(names).toStrictEqual(['MOOTANT_SET'])

    delete process.env['MOOTANT_SET']
  })

  it('reports all variables when a child process gets those of the worker', async () => {
    let names: string[] = []
    let real = trackEnvironment({ metaEnv: {} }, name => {
      names.push(name)
    })
    let node = process.execPath

    expect(
      spawnSync(node, ['-e', '0'], { env: { PATH: '' }, stdio: 'ignore' })
        .status,
    ).toBe(0)

    await nextRun()

    expect(names).toStrictEqual([])

    expect(String(execFileSync(node, ['-e', '0']))).toBe('')
    expect(spawnSync(node, ['-e', '0'], { env: process.env }).status).toBe(0)
    expect(spawnSync(node, ['-e', '0'], { env: real }).status).toBe(0)
    expect(spawnSync(node, ['-e', '0'], { env: null as never }).status).toBe(0)

    await nextRun()

    expect(names.length).toBeGreaterThanOrEqual(4)
    expect(new Set(names)).toStrictEqual(new Set(['*']))

    names.length = 0
    let execute = Reflect.get(childProcess.execFile, promisify.custom) as (
      file: string,
      parameters: string[],
    ) => Promise<{ stdout: string }>
    let { stdout } = await execute(node, ['-e', 'process.stdout.write("ok")'])

    expect(stdout).toBe('ok')
    expect(names[0]).toBe('*')

    trackEnvironment({ metaEnv: {} }, null)
  })

  it('installs once and passes reads to the current receiver only', async () => {
    let first: string[] = []
    let second: string[] = []
    let state = { metaEnv: {} as object }
    trackEnvironment(state, name => {
      first.push(name)
    })
    let { metaEnv } = state
    let proxy = process.env
    trackEnvironment(state, name => {
      second.push(name)
    })

    expect(process.env).toBe(proxy)
    expect(state.metaEnv).toBe(metaEnv)
    expect(process.env['MOOTANT_A']).toBeUndefined()

    trackEnvironment(state, null)

    expect(process.env['MOOTANT_B']).toBeUndefined()
    expect(Object.keys(process.env).length).toBeGreaterThan(0)
    expect(Object.keys(process.env).length).toBeGreaterThan(0)

    await nextRun()

    expect(first).toStrictEqual([])
    expect(second).toStrictEqual(['MOOTANT_A'])
  })
})
