import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Imports a fresh copy of the switch's module.
 *
 * @returns The function that reads the switch.
 */
async function load(): Promise<() => boolean> {
  vi.resetModules()
  let module = await import('../../../adapters/shared/read-prefork-switch')
  return module.readPreforkSwitch
}

describe('readPreforkSwitch', () => {
  afterEach(() => {
    delete process.env['MOOTANT_PREFORK']
  })

  it('allows spare processes unless the variable is 0, reads it once and removes it', async () => {
    let read = await load()

    expect(read()).toBe(true)

    process.env['MOOTANT_PREFORK'] = '0'

    expect(read()).toBe(true)
    expect(process.env['MOOTANT_PREFORK']).toBeUndefined()

    process.env['MOOTANT_PREFORK'] = '0'
    read = await load()

    expect(read()).toBe(false)
    expect(process.env['MOOTANT_PREFORK']).toBeUndefined()

    process.env['MOOTANT_PREFORK'] = '1'

    expect(read()).toBe(false)

    process.env['MOOTANT_PREFORK'] = '1'
    read = await load()

    expect(read()).toBe(true)
  })
})
