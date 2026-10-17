import { describe, expect, it } from 'vitest'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

import { trackEnvironment } from '../../../../adapters/vitest/worker/track-environment'

/**
 * Promisified functions made before the tracking is installed, as a custom test
 * environment may make them: Node returns `util.promisify.custom` of the
 * function, which then names itself as its own `util.promisify.custom`.
 */
let early = {
  execFile: Reflect.apply(promisify, undefined, [
    childProcess.execFile,
  ]) as object,
  exec: Reflect.apply(promisify, undefined, [childProcess.exec]) as object,
}

describe('trackEnvironment after an early promisify', () => {
  it('wraps a function that names itself as its promisified form once', async () => {
    expect(Reflect.get(early.execFile, promisify.custom)).toBe(early.execFile)
    expect(Reflect.get(early.exec, promisify.custom)).toBe(early.exec)

    let names: string[] = []
    let state = { metaEnv: {} }
    trackEnvironment(state, name => {
      names.push(name)
    })
    let { execFile, exec } = childProcess
    trackEnvironment(state, name => {
      names.push(name)
    })

    expect(childProcess.execFile).toBe(execFile)
    expect(childProcess.exec).toBe(exec)

    let custom = Reflect.get(execFile, promisify.custom) as unknown

    expect(custom).not.toBe(early.execFile)
    expect(Reflect.get(custom as object, promisify.custom)).toBe(custom)
    expect(Reflect.apply(promisify, undefined, [execFile])).toBe(custom)
    expect(
      Reflect.get(
        Reflect.get(exec, promisify.custom) as object,
        promisify.custom,
      ),
    ).toBe(Reflect.get(exec, promisify.custom))

    names.length = 0
    let { stdout } = await (
      custom as (
        file: string,
        parameters: string[],
      ) => Promise<{ stdout: string }>
    )(process.execPath, ['-e', 'process.stdout.write("ok")'])

    expect(stdout).toBe('ok')
    expect(new Set(names)).toStrictEqual(new Set(['*']))

    trackEnvironment(state, null)
  })

  it('reports all variables to every receiver, as the early form spawns unseen', async () => {
    let names: string[] = []
    trackEnvironment({ metaEnv: {} }, name => {
      names.push(name)
    })

    expect(names).toStrictEqual(['*'])

    let { stdout } = await (
      early.execFile as (
        file: string,
        parameters: string[],
      ) => Promise<{ stdout: string }>
    )(process.execPath, ['-e', 'process.stdout.write("ok")'])

    expect(stdout).toBe('ok')
    expect(new Set(names)).toStrictEqual(new Set(['*']))

    trackEnvironment({ metaEnv: {} }, null)
  })
})
