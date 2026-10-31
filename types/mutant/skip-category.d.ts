/**
 * Why a candidate was skipped, as a closed set: `equivalent` cannot change
 * behavior, `noise` touches something Mootant leaves untested on purpose,
 * `timeout` may keep a loop running forever, `owned` is emitted by another
 * mutator under its own name, `subsumed` is covered by a mutant that runs,
 * `duplicate` produces the same file as an earlier mutant, and `invalid` cannot
 * be hosted.
 */
export type SkipCategory =
  | 'equivalent'
  | 'duplicate'
  | 'subsumed'
  | 'timeout'
  | 'invalid'
  | 'owned'
  | 'noise'
