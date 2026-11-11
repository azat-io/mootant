import type { ChildProcess } from 'node:child_process'

/**
 * A worker process of a Jest session, the leader of a process group of its own.
 */
export interface JestWorker {
  /**
   * Resolves with how the process ended, once its output closed or the grace
   * passed, and what is left of its group is stopped by then. Never settles for
   * a process that could not start, so nothing awaits it in that case.
   */
  exited: Promise<{ signal: string | null; code: number | null }>

  /**
   * Resolves with true once the worker booted, and with false when it exits
   * first or stays silent past the limit, which stops its group.
   *
   * @throws {Error} When the process cannot start.
   */
  ready: Promise<boolean>

  /**
   * Heap limit in megabytes the process got from mootant, or null when it got
   * none: the project gives its own, or this worker serves a clean attempt.
   */
  heapCap: number | null

  /**
   * Tells whether the process ended by running out of memory: V8's words on
   * standard error, and SIGABRT or code 134. Whether the words came is known
   * once `exited` resolved.
   */
  outOfMemory(): boolean

  /**
   * Test file of the unit last sent, or null; a chunk of output belongs to it,
   * so late output of a unit stays with its file until the next unit is sent.
   */
  file: string | null

  /**
   * The process.
   */
  child: ChildProcess

  /**
   * Tells whether the process started and has not exited.
   */
  alive(): boolean
}
