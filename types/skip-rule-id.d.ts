import type { skipRules } from '../core/skips/skip-rules'

/**
 * Id of a skip rule of the registry: a catalog label such as `O3` or `R2`, or a
 * short kebab-case name such as `lower-bound`.
 */
export type SkipRuleId = keyof typeof skipRules
