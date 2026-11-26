import type { WorkerChannel } from '../types/worker-channel'

import { listRuntimeFiles } from './list-runtime-files'

/**
 * Wraps the `resetModules` of Jest's runtime class so that the files a runtime
 * holds in its file cache (`listRuntimeFiles`) join those of the current unit
 * (`WorkerChannel.loads`) before each reset empties the cache: whoever resets,
 * a setup file, a test through `jest.resetModules()` or the test framework
 * under the `resetModules` setting, calls that method of the runtime, which a
 * project's own runtime gets from the class too.
 *
 * @param Runtime - Jest's runtime class, as `jest-runtime` exports it.
 * @param channel - Channel of the worker.
 */
export function keepResetLoads(Runtime: unknown, channel: WorkerChannel): void {
  if (typeof Runtime !== 'function') {
    return
  }
  let prototype: unknown = Reflect.get(Runtime, 'prototype')
  let reset: unknown =
    typeof prototype === 'object' && prototype !== null ?
      Reflect.get(prototype, 'resetModules')
    : undefined
  if (typeof reset !== 'function') {
    return
  }
  Reflect.set(
    prototype as object,
    'resetModules',
    function (this: unknown, ...parameters: unknown[]): unknown {
      for (let file of listRuntimeFiles(this)) {
        channel.loads.add(file)
      }
      return Reflect.apply(reset, this, parameters) as unknown
    },
  )
}
