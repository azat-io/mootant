/**
 * The events of jest-circus the tracker reads, with as much of each as it
 * reads; the other events reach the handler too and pass by.
 */
export type CircusEvent =
  | {
      /**
       * Kind of the event: a hook failed.
       */
      name: 'hook_failure'

      /**
       * Hook that failed.
       */
      hook: CircusHook

      /**
       * What the hook threw or rejected with, or the text of its timeout.
       */
      error: unknown
    }
  | {
      /**
       * Kind of the event: an attempt of a test began running or ended.
       */
      name: 'test_started' | 'test_done'

      /**
       * Test of the attempt.
       */
      test: CircusEventTest
    }
  | {
      /**
       * Value that was thrown or rejected with outside circus's own calls.
       */
      error: unknown

      /**
       * Kind of the event: an uncaught error came.
       */
      name: 'error'
    }
  | {
      /**
       * Kind of the event: the file loaded and its tests are about to run, or
       * they all ended and nothing adds to their errors any more.
       */
      name: 'run_finish' | 'run_start'
    }
  | {
      /**
       * Whether the test is concurrent.
       */
      concurrent: boolean

      /**
       * Kind of the event: the file defined a test.
       */
      name: 'add_test'
    }
  | {
      /**
       * Kind of the event: a hook began running.
       */
      name: 'hook_start'

      /**
       * Hook that began running.
       */
      hook: CircusHook
    }

/**
 * Test as these events carry it.
 */
interface CircusEventTest {
  /**
   * Own timeout in milliseconds; circus takes 0 and none for the default.
   */
  timeout: undefined | number

  /**
   * What circus keeps for each failure: a value, or `[error, asyncError]`. It
   * can grow after `test_done`.
   */
  errors: unknown[]
}

/**
 * Hook as these events carry it.
 */
interface CircusHook {
  /**
   * When the hook runs.
   */
  type: 'beforeEach' | 'beforeAll' | 'afterEach' | 'afterAll'

  /**
   * Own timeout in milliseconds; circus takes 0 and none for the default.
   */
  timeout: undefined | number
}
