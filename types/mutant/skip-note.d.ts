import type { Node } from 'oxc-parser'

import type { SkipRuleId } from './skip-rule-id'

/**
 * Why a mutator does not emit a replacement it would otherwise make.
 */
export interface SkipNote {
  /**
   * Mutant that justifies the skip, named by its mutator and the node it
   * replaces; omitted or null when no single mutant does.
   */
  by?: { mutator: string; node: Node } | null

  /**
   * True when the skip also rests on a guess that its rule does not make, such
   * as a lower bound taken from a `.length` name; the skip is then reported as
   * a heuristic even if its rule is not one.
   */
  heuristic?: boolean

  /**
   * Id of the rule in the registry, which gives the category and whether the
   * rule is a heuristic.
   */
  rule: SkipRuleId

  /**
   * Plain-English reason, worded to follow `skipped: `.
   */
  reason: string
}
