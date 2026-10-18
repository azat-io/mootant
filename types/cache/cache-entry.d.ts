import type { TryCause } from '../run/try-cause'

/**
 * Verdict evidence of one mutant in one test file (isolated) or one test
 * (batch), stored in the cache file.
 */
export interface CacheEntry {
  /**
   * `Killed` with the test of the kill, or `Survived` for an isolated unit or a
   * batch try that reached the mutant and passed.
   */
  status: 'Survived' | 'Killed'

  /**
   * Path the evidence came from; batch entries are only reused in fast mode.
   */
  path: 'isolated' | 'batch'

  /**
   * First line of the failure of a kill, or null.
   */
  message: string | null

  /**
   * How the kill was detected, or null for `Survived`.
   */
  cause: TryCause | null

  /**
   * Id of the inputs the run read beyond the dry run of its test file, in
   * `RunCacheFile.inputs`, or null when it read nothing more.
   */
  inputs: string | null

  /**
   * Id of the test that failed, or null (load-time kills, `Survived`).
   */
  test: string | null

  /**
   * Milliseconds since the epoch when a run last wrote or reused the entry.
   */
  used: number

  /**
   * Hash of everything the evidence depends on; a different key makes the entry
   * stale.
   */
  key: string
}
