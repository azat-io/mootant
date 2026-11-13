import type { IgnoreSource } from './ignore-source'
import type { MutantStatus } from './mutant-status'
import type { MutantHost } from './mutant-host'

/**
 * Change to the source code that tests are expected to detect, with how the
 * mutant switch hosts it (see `MutantHost`).
 */
export type Mutant = MutantFields & MutantHost

/**
 * Fields of every mutant, whatever its host.
 */
interface MutantFields {
  /**
   * Ignore directive comment that excluded the mutant, or null while the mutant
   * is pending.
   */
  ignoredBy: IgnoreSource | null

  /**
   * Why the mutant is not tested: the reason of the ignore directive that
   * covers it. Null while the mutant is pending.
   */
  reason: string | null

  /**
   * Dotted names of the declarations around the mutant, such as
   * `Calculator.add`. Null at the top level of the file.
   */
  scope: string | null

  /**
   * Whether the mutant will be tested or an ignore directive excluded it.
   */
  status: MutantStatus

  /**
   * Text written in place of the range from `start` to `end`.
   */
  replacement: string

  /**
   * Id of the mutator that produced the mutant: `name` or `plugin/name`.
   */
  mutator: string

  /**
   * Offset of the first replaced UTF-16 code unit in the text as read from
   * disk, byte order mark included.
   */
  start: number

  /**
   * Path of the mutated file relative to the working directory, with `/` as the
   * separator.
   */
  file: string

  /**
   * Offset just past the last replaced UTF-16 code unit.
   */
  end: number

  /**
   * Stable identifier: 12 characters from the digits and the lowercase letters
   * without i, l, o and u.
   */
  id: string
}
