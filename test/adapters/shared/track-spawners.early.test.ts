import { describe, expect, it } from 'vitest'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

import { trackSpawners } from '../../../adapters/shared/track-spawners'

/**
 * `execFile` as Node made it, which a preload replaced before the tracking, as
 * a plain function with no promisified form of its own.
 */
let original = childProcess.execFile

childProcess.execFile = ((...parameters: Parameters<typeof original>) =>
  Reflect.apply(original, undefined, parameters)) as typeof original

describe('trackSpawners after an early wrapper', () => {
  it('wraps a function a preload put in place of execFile, with no promisified form of its own, and finds nothing promisified early', async () => {
    let names: string[] = []

    expect(Reflect.get(childProcess.execFile, promisify.custom)).toBeUndefined()
    expect(
      trackSpawners(process.env, name => {
        names.push(name)
      }),
    ).toBe(false)

    // eslint-disable-next-line typescript/strict-void-return -- promisify takes the promise form the function carries.
    let stdout = await promisify(childProcess.execFile)(process.execPath, [
      '-e',
      'process.stdout.write("ok")',
    ])

    expect(stdout).toBe('ok')
    expect(names).toStrictEqual(['*'])

    trackSpawners(process.env, null)
  })
})
