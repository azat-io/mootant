/**
 * How a mutant was detected:
 *
 * - `assertion`: a test or hook failed;
 * - `stray-error`: an unhandled error (isolated path only; in batch it makes the
 *   try doubtful);
 * - `load-error`: the test file failed to load with the mutant active;
 * - `hook-error`: a suite hook (such as `beforeAll`/`before`, `afterAll`/`after`,
 *   `aroundAll`) or the file teardown, such as the cleanup of a worker-scoped
 *   fixture or the teardown of the test environment, failed with the mutant
 *   active, or the test file failed outside its tests (isolated path);
 * - `crash`: the worker died with the mutant active (isolated path);
 * - `hit-limit`: the hit counter stopped a loop;
 * - `time-limit`: a timer fired (confirmed with doubled bounds);
 * - `hang`: the watchdog stopped a worker stuck with the mutant active (confirmed
 *   like `time-limit`).
 */
export type TryCause =
  | 'stray-error'
  | 'load-error'
  | 'hook-error'
  | 'time-limit'
  | 'assertion'
  | 'hit-limit'
  | 'crash'
  | 'hang'
