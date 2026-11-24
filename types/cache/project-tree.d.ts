/**
 * Everything under the project root as `hashProjectTree` saw it.
 */
export interface ProjectTree {
  /**
   * Each path under the root, relative to it with `/` separators, with what it
   * is as text: a directory, a file with the hash of its contents, or a
   * symbolic link with its target.
   */
  entries: ReadonlyMap<string, string>

  /**
   * SHA-256 in hex over every entry.
   */
  hash: string
}
