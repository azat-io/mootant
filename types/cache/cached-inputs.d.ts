/**
 * Inputs a run read beyond the dry run of its test file, stored once in the
 * cache file for every entry that shares them: an entry that names them is
 * reused only while each still has its hash.
 */
export interface CachedInputs {
  /**
   * Names of environment variables with the hash of their values, or null for a
   * variable that was not set, sorted.
   */
  environment: [string, string | null][]

  /**
   * Paths relative to the project root with the hash of their contents, or null
   * for a missing file, sorted.
   */
  files: [string, string | null][]
}
