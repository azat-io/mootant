import { describe, expect, it } from 'vitest'

import { createWorkerChannel } from '../../../../adapters/jest/worker/create-worker-channel'
import { keepResetLoads } from '../../../../adapters/jest/worker/keep-reset-loads'

/**
 * Makes a runtime class of Jest 30 whose `resetModules` empties the file cache
 * of a runtime, as Jest's does.
 *
 * @returns A class whose runtimes hold the files given to them, which a reset
 *   empties.
 */
function createRuntimeClass(): new (files: string[]) => {
  fileCache: { buffers: Map<string, Buffer>; strings: Map<string, string> }
  resetModules(): string
} {
  return class Runtime {
    public fileCache: {
      buffers: Map<string, Buffer>
      strings: Map<string, string>
    }

    public constructor(files: string[]) {
      this.fileCache = {
        buffers: new Map(files.map(file => [file, Buffer.from('')])),
        strings: new Map(),
      }
    }

    public resetModules(): string {
      this.fileCache.buffers.clear()
      return 'reset'
    }
  }
}

describe('keepResetLoads', () => {
  it('gives the unit what a runtime held before each reset of its modules', () => {
    let Runtime = createRuntimeClass()
    let channel = createWorkerChannel()
    keepResetLoads(Runtime, channel)
    let runtime = new Runtime(['/p/node_modules/setup/index.js'])

    expect(runtime.resetModules()).toBe('reset')
    expect(runtime.fileCache.buffers.size).toBe(0)
    expect(channel.loads).toStrictEqual(
      new Set(['/p/node_modules/setup/index.js']),
    )
  })

  it.each([
    ['no class', null],
    ['a function without a prototype', () => {}],
    ['a class without resetModules', class Runtime {}],
  ])('changes nothing for %s', (_name, Runtime) => {
    let channel = createWorkerChannel()
    keepResetLoads(Runtime, channel)

    expect(channel.loads).toStrictEqual(new Set())
  })
})
