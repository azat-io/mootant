/**
 * Error that ends a replay of a saved dry run (`DrySnapshot`) once it turns out
 * that the saved dry run cannot decide the run.
 */
class DryReuseMiss extends Error {
  /**
   * Name that tells the error apart (`isDryReuseMiss`).
   */
  public override name = 'DryReuseMiss'
}

/**
 * Creates the error thrown inside a run that replays a saved dry run once the
 * saved dry run turns out to be stale, a mutant has no valid cached verdict and
 * needs the test runner, or the replay fails otherwise. The run then starts
 * over with the test runner; nothing ran or was written before. The message is
 * the note the run gives.
 *
 * @param reason - Why the saved dry run cannot decide the run, as the end of a
 *   sentence, such as `src/a.test.ts changed`.
 * @returns Error named `DryReuseMiss`.
 */
export function createDryReuseMiss(reason: string): Error {
  return new DryReuseMiss(
    `Did not reuse the dry run of an earlier run, as ${reason}.`,
  )
}
