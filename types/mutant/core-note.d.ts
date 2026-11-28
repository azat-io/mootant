import type { SkipRuleId } from './skip-rule-id'
import type { SkipNote } from './skip-note'

/**
 * Skip note of a built-in mutator or of the collection: its rule is a built-in
 * id, so that a rule the registry does not have fails to compile.
 */
export interface CoreNote extends SkipNote {
  /**
   * Id of the rule in the registry.
   */
  rule: SkipRuleId
}
