import type { RegisteredMutator } from '../mutator/registered-mutator'
import type { SourceRange } from '../source/source-range'
import type { IgnoreRule } from './ignore-rule'
import type { MutantHost } from './mutant-host'

/**
 * Replacement accepted from a visitor, before ids, the solitary rule and
 * deduplication, with how the mutant switch would host it (see `MutantHost`).
 */
export type MutantCandidate = CandidateFields & MutantHost

/**
 * Fields of every candidate, whatever its host.
 */
interface CandidateFields {
  /**
   * Ranges of the nodes whose effect the mutant removes as a whole, or null
   * when the solitary rule does not apply.
   */
  solitary: readonly SourceRange[] | null

  /**
   * Ignore rule that covers the mutant, or null when it will run.
   */
  ignoreRule: IgnoreRule | null

  /**
   * Mutator that returned the replacement.
   */
  registered: RegisteredMutator

  /**
   * Dotted names of the declarations around the replaced node.
   */
  scope: string | null

  /**
   * Position in the order in which visitors returned replacements.
   */
  emission: number

  /**
   * Start of the replaced range.
   */
  start: number

  /**
   * Text written in place of the range.
   */
  text: string

  /**
   * End of the replaced range.
   */
  end: number
}
