/**
 * What code reads through `node:fs` while the tracking runs
 * (`trackFileInputs`).
 */
export interface FileInputTracking {
  /**
   * Stops recording what the code reads.
   *
   * @returns Each sorted: the files counted that the code changed itself, and
   *   the files counted.
   */
  stop(): { modified: string[]; files: string[] }

  /**
   * Files and directories read so far, a missing one included, that the filter
   * accepted and the code had not written before; the set stays live until
   * `stop`.
   */
  files: ReadonlySet<string>
}
