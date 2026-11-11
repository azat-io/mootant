import type { JestReady } from './jest-ready'

/**
 * How the host ended once `close` was asked.
 */
export interface JestHostEnd {
  /**
   * Exit code, or null when a signal ended it.
   */
  code: number | null

  /**
   * Snapshot files whose test file is gone, as the results processor found
   * them, which fail a plain run of Jest too.
   */
  obsolete: string[]

  /**
   * Whether Jest reached its results processor, which it calls once global
   * teardown ended.
   */
  finished: boolean

  /**
   * Whether `close` stopped the group of the host, which had not ended in time.
   */
  stopped: boolean

  /**
   * Whether the host had exited before `close` was asked, so global teardown
   * never ran.
   */
  early: boolean

  /**
   * The tail of what the host wrote.
   */
  output: string

  /**
   * How it ended, such as `exited with code 1`.
   */
  how: string
}

/**
 * Host process: the project's Jest, parked in mootant's runner for the session.
 */
export interface JestHost {
  /**
   * Ends the host, so that Jest runs its global teardown, and tells how it
   * ended. Returns one promise, which never rejects.
   */
  close(): Promise<JestHostEnd>

  /**
   * Resolves with an error whose message says that the host exited before
   * `close` was asked, since what its global setup started died with it; never
   * resolves otherwise.
   */
  died: Promise<Error>

  /**
   * Test files of every project, the skipped ones too, one per project a file
   * is in, which is what a plain run of the command counts.
   */
  testCount: number

  /**
   * The `ready` message, with the test files of the kept projects only.
   */
  ready: JestReady
}
