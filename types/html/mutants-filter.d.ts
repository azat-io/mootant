import type { RunStatus } from '../run/run-status'

/**
 * What the page of every mutant shows.
 */
export interface MutantsFilter {
  /**
   * Status to show, or `all`.
   */
  filter: RunStatus | 'all'

  /**
   * Id of the mutator to show, or null for every mutator.
   */
  mutator: string | null

  /**
   * Text to match: an id or its start, a mutator, a `file:line` or a piece of
   * the change; empty for every mutant.
   */
  query: string

  /**
   * Most rows to show.
   */
  limit: number
}
