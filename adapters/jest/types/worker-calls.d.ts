import type { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Calls into the resolver, the transformers and the test environment of a
 * project that run in a worker, which tell what they read apart from what tests
 * read.
 */
export interface WorkerCalls {
  /**
   * Holds true inside an asynchronous key or transform of a transformer of a
   * project, and in what it goes on with until it settles: a count would also
   * take what Jest reads meanwhile for another module, as it links the imports
   * of an ES module at once.
   */
  asyncTransformer: AsyncLocalStorage<true>

  /**
   * Holds true inside an asynchronous method of Jest's resolver of a project,
   * one whose name ends with `Async`, and in what it goes on with until it
   * settles: the count of `resolver` ends when the method returns its promise,
   * while a project's own asynchronous resolver may read after an `await`. Jest
   * calls such methods for ES modules alone.
   */
  asyncResolver: AsyncLocalStorage<true>

  /**
   * Holds true inside the calls of the test environment and the load of the
   * real test runner, and in what they go on with, as such code may read a file
   * once in a worker: the last setup file enters it, for `environment.setup()`
   * and the load, the real test framework runs out of it, the rest of the unit,
   * `environment.teardown()` among it, runs in it again, and each call of the
   * environment's own event handler runs inside it. A store, not a count, so
   * what setup files queued and what tests leave behind keeps its own context.
   */
  environment: AsyncLocalStorage<true>

  /**
   * Calls of the default resolver of Jest 29.7 that have not returned, whose
   * reads do not count inside a call of Jest's resolver of a project, also when
   * the project's own resolver hands it a request: they are Jest's own probes.
   * It is 0 while a `packageFilter` or `pathFilter` of the project runs inside
   * one. Jest 30's reads nothing through `node:fs`.
   */
  defaultResolver: number

  /**
   * Other calls of a transformer of a project that have not ended: a
   * synchronous call until it returns, the load of its module and its factory
   * until they settle, since Jest awaits them before it loads a test file.
   */
  transformer: number

  /**
   * Asynchronous keys and transforms that have not settled. One left when a
   * unit's run ended belongs to an import the unit never awaited: what it reads
   * from then on reaches no unit, and the module it gives would stay in the
   * worker's memory.
   */
  unsettled: number

  /**
   * Calls of a method of Jest's resolver of a project that have not returned,
   * whose reads count only for a project with a resolver of its own, as what
   * that one reads decides what loads.
   */
  resolver: number
}
