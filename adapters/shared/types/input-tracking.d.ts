/**
 * What the code of a test process or worker reads while the tracking runs
 * (`trackInputs`).
 */
export interface InputTracking {
  /**
   * Stops recording what the code reads.
   *
   * @returns Each sorted: the names of the environment variables read, `*` when
   *   the code listed them all, the files read that the code changed itself,
   *   and the files read.
   */
  stop(): { environment: string[]; modified: string[]; files: string[] }

  /**
   * Files and directories read so far through `node:fs` that count as inputs
   * (`createInputFilter`), a missing one included, that the code had not
   * written before; the set stays live until `stop`.
   */
  files: ReadonlySet<string>

  /**
   * `process.env` as Node made it, which reports nothing.
   */
  real: NodeJS.ProcessEnv
}
