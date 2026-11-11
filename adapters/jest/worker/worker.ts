import { AsyncLocalStorage } from 'node:async_hooks'
import { stripTypeScriptTypes } from 'node:module'

import { bootWorker } from './boot-worker'

/**
 * Entry of a worker process. It stays this small because a file imported only
 * through `?inline-cjs` reads as covered without ever running.
 */
bootWorker({
  stores: AsyncLocalStorage.prototype,
  stripTypes: stripTypeScriptTypes,
  global: globalThis,
  process,
})
