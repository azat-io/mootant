import type { JestFileResult } from './jest-file-result'

/**
 * What a worker uses of the `TestRunner` of `jest-runner`.
 */
export interface JestTestRunner {
  /**
   * Runs test files, here always one, in this process.
   */
  runTests(
    tests: {
      /**
       * What Jest needs of the project.
       */
      context: { moduleMap: unknown; resolver: unknown; config: object }

      /**
       * Time of the last run, which a worker never has.
       */
      duration: undefined

      /**
       * Absolute path of the test file.
       */
      path: string
    }[],
    watcher: { isInterrupted(): boolean },
    options: { serial: boolean },
  ): Promise<unknown>

  /**
   * Listens for a test file that gave a result, whether its tests passed or
   * not.
   */
  on(
    event: 'test-file-success',
    listener: (payload: [test: unknown, result: JestFileResult]) => void,
  ): unknown

  /**
   * Listens for a test file that could not run.
   */
  on(
    event: 'test-file-failure',
    listener: (payload: [test: unknown, error: unknown]) => void,
  ): unknown
}
