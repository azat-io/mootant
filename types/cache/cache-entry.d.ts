import type { TryCause } from '../run/try-cause'

/**
 * Verdict evidence of one mutant in one test file (isolated) or one test
 * (batch), stored in the cache file.
 */
export interface CacheEntry {
  /**
   * `Killed` with the test of the kill, or `Survived` for an isolated unit that
   * reached the mutant and passed, or for a batch try that passed, whether it
   * reached the mutant or not.
   */
  status: 'Survived' | 'Killed'

  /**
   * Path the evidence came from; batch entries are only reused in fast mode.
   */
  path: 'isolated' | 'batch'

  /**
   * Key over the region of the mutant (see `getMutantRegions`) in place of its
   * whole file, and over what its test file reads outside the mutated files,
   * which incremental runs accept too; null when the mutant had no region.
   */
  incremental: string | null

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
   * Whether a batch kill came from the first covering test of the mutant in the
   * order of its run (`getBatchOrder`), which phase 1 tries alone: such a kill
   * follows no pass of another test, so a later run reuses it whatever test
   * comes first then. False for any other evidence.
   */
  first: boolean

  /**
   * Milliseconds since the epoch when a run last wrote or reused the entry.
   */
  used: number

  /**
   * Hash of everything the evidence depends on; a different key makes the entry
   * stale. An incremental run that reuses the entry by its `incremental` key
   * keeps this one, so other runs never take its verdict for the current code.
   */
  key: string
}
