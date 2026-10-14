import type { SkipCategory } from './skip-category'

/**
 * Entry of the registry of skip rules.
 */
export interface SkipRule {
  /**
   * Category of every candidate the rule skips.
   */
  category: SkipCategory

  /**
   * Whether the rule rests on a guess, such as a method name, a syntactic type
   * hint or a name-based lower bound, rather than on a proof from syntax and
   * literals alone.
   */
  heuristic: boolean
}
