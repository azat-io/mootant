import type { SkipRule } from './skip-rule'

/**
 * Skip rule with the id that reports give it.
 */
export interface RegisteredSkipRule extends SkipRule {
  /**
   * Full id: `namespace/name` for a rule of a plugin, the name itself for a
   * built-in rule.
   */
  id: string
}
