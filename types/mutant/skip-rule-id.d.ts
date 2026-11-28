import type { skipRules } from '../../core/skips/skip-rules'

/**
 * Id of a built-in skip rule, a key of the registry: a catalog label such as
 * `O3` or `R2`, or a short kebab-case name such as `lower-bound`. Rules of a
 * plugin are not among them.
 */
export type SkipRuleId = keyof typeof skipRules
