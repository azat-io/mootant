/**
 * Lines of the working tree that changed since a git revision.
 */
export interface ChangedLines {
  /**
   * Changed files by real absolute path: the changed lines of the file as it is
   * now, from 1, or `all` for a file git does not track.
   */
  files: Map<string, ReadonlySet<number> | 'all'>

  /**
   * Merge-base commit the working tree was compared with.
   */
  base: string
}
