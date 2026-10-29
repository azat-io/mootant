import type { SkipRule } from '../../types/mutant/skip-rule'

/**
 * Registry of the rules that skip a candidate, keyed by rule id: the ownership
 * (O) and redundancy (R) labels of the catalog, and short kebab-case names for
 * the other rules. Each rule has one category and is a heuristic or not; a skip
 * names only its rule, so ids, categories and flags stay consistent.
 */
export let skipRules = {
  'canonical-falsy-default': {
    category: 'equivalent',
    heuristic: true,
  },
  'number-literal-plus': {
    category: 'equivalent',
    heuristic: false,
  },
  'length-keeping-swap': {
    category: 'equivalent',
    heuristic: true,
  },
  'fall-through-break': {
    category: 'equivalent',
    heuristic: false,
  },
  'awaited-by-caller': {
    category: 'equivalent',
    heuristic: false,
  },
  'truth-keeping-swap': {
    category: 'equivalent',
    heuristic: true,
  },
  'regex-capturing-group': {
    category: 'noise',
    heuristic: false,
  },
  'identity-operand': {
    category: 'equivalent',
    heuristic: false,
  },
  'hook-dependencies': {
    category: 'equivalent',
    heuristic: true,
  },
  'proven-comparison': {
    category: 'equivalent',
    heuristic: true,
  },
  'nullish-normalization': {
    category: 'noise',
    heuristic: false,
  },
  'swap-subsumes-drop': {
    category: 'subsumed',
    heuristic: false,
  },
  'caseless-literal': {
    category: 'equivalent',
    heuristic: false,
  },
  'anchored-global': {
    category: 'equivalent',
    heuristic: false,
  },
  'numeric-identity': {
    category: 'equivalent',
    heuristic: true,
  },
  'one-way-counter': {
    category: 'equivalent',
    heuristic: false,
  },
  'comparison-region': {
    category: 'subsumed',
    heuristic: false,
  },
  'default-option': {
    category: 'equivalent',
    heuristic: false,
  },
  'comparator-sign-flip': {
    category: 'owned',
    heuristic: true,
  },
  'comparator-sign': {
    category: 'equivalent',
    heuristic: true,
  },
  'any-character': {
    category: 'equivalent',
    heuristic: false,
  },
  'edge-wildcard': {
    category: 'equivalent',
    heuristic: false,
  },
  'unused-result': {
    category: 'equivalent',
    heuristic: false,
  },
  'typed-constant': {
    category: 'equivalent',
    heuristic: true,
  },
  'falsy-default': {
    category: 'equivalent',
    heuristic: false,
  },
  'literal-truth': {
    category: 'equivalent',
    heuristic: false,
  },
  'large-alternation': {
    category: 'noise',
    heuristic: false,
  },
  'reference-equality': {
    category: 'noise',
    heuristic: true,
  },
  'settled-value': {
    category: 'equivalent',
    heuristic: true,
  },
  'identity-call': {
    category: 'equivalent',
    heuristic: true,
  },
  'tail-return-false': {
    category: 'noise',
    heuristic: false,
  },
  'void-operand': {
    category: 'equivalent',
    heuristic: false,
  },
  'symbol-description': {
    category: 'noise',
    heuristic: true,
  },
  'fixed-operand': {
    category: 'equivalent',
    heuristic: true,
  },
  'min-max-idiom': {
    category: 'equivalent',
    heuristic: true,
  },
  'never-nullish': {
    category: 'equivalent',
    heuristic: true,
  },
  'joined-array': {
    category: 'equivalent',
    heuristic: false,
  },
  'unused-flag': {
    category: 'equivalent',
    heuristic: false,
  },
  'non-nullable': {
    category: 'equivalent',
    heuristic: true,
  },
  'tail-return': {
    category: 'equivalent',
    heuristic: false,
  },
  'numeric-plus': {
    category: 'equivalent',
    heuristic: true,
  },
  'literal-coercion': {
    category: 'noise',
    heuristic: false,
  },
  'invalid-target': {
    category: 'invalid',
    heuristic: false,
  },
  'compiler-macro': {
    category: 'invalid',
    heuristic: false,
  },
  'named-groups': {
    category: 'equivalent',
    heuristic: true,
  },
  'shifted-literal': {
    category: 'owned',
    heuristic: false,
  },
  'never-falsy': {
    category: 'equivalent',
    heuristic: true,
  },
  'template-text': {
    category: 'invalid',
    heuristic: false,
  },
  'invalid-regex': {
    category: 'invalid',
    heuristic: false,
  },
  'void-result': {
    category: 'equivalent',
    heuristic: true,
  },
  'non-numeric-plus': {
    category: 'noise',
    heuristic: true,
  },
  'same-truth': {
    category: 'equivalent',
    heuristic: false,
  },
  'tagged-template': {
    category: 'noise',
    heuristic: false,
  },
  'lower-bound': {
    category: 'equivalent',
    heuristic: true,
  },
  'loop-advance': {
    category: 'timeout',
    heuristic: false,
  },
  'loop-running': {
    category: 'timeout',
    heuristic: false,
  },
  'regex-argument': {
    category: 'noise',
    heuristic: false,
  },
  'constant-test': {
    category: 'noise',
    heuristic: false,
  },
  'loop-end': {
    category: 'equivalent',
    heuristic: false,
  },
  'jsx-attribute': {
    category: 'noise',
    heuristic: false,
  },
  'empty-match': {
    category: 'timeout',
    heuristic: true,
  },
  'receiver-type': {
    category: 'noise',
    heuristic: true,
  },
  'error-message': {
    category: 'noise',
    heuristic: true,
  },
  'property-key': {
    category: 'noise',
    heuristic: false,
  },
  'logging-call': {
    category: 'noise',
    heuristic: true,
  },
  'bare-string': {
    category: 'noise',
    heuristic: false,
  },
  'nullish-swap': {
    category: 'noise',
    heuristic: true,
  },
  duplicate: {
    category: 'duplicate',
    heuristic: false,
  },
  'log-message': {
    category: 'noise',
    heuristic: true,
  },
  'case-label': {
    category: 'noise',
    heuristic: false,
  },
  'timer-delay': {
    category: 'noise',
    heuristic: true,
  },
  solitary: {
    category: 'subsumed',
    heuristic: true,
  },
  R2: {
    category: 'subsumed',
    heuristic: false,
  },
  R3: {
    category: 'subsumed',
    heuristic: false,
  },
  R4: {
    category: 'subsumed',
    heuristic: false,
  },
  R5: {
    category: 'subsumed',
    heuristic: false,
  },
  R6: {
    category: 'subsumed',
    heuristic: false,
  },
  O4: {
    category: 'subsumed',
    heuristic: false,
  },
  R7: {
    category: 'subsumed',
    heuristic: true,
  },
  R8: {
    category: 'subsumed',
    heuristic: true,
  },
  O11: {
    category: 'owned',
    heuristic: false,
  },
  O13: {
    category: 'owned',
    heuristic: false,
  },
  O14: {
    category: 'owned',
    heuristic: false,
  },
  O15: {
    category: 'owned',
    heuristic: false,
  },
  O19: {
    category: 'owned',
    heuristic: false,
  },
  O12: {
    category: 'owned',
    heuristic: true,
  },
  O16: {
    category: 'owned',
    heuristic: true,
  },
  O17: {
    category: 'owned',
    heuristic: true,
  },
  O18: {
    category: 'owned',
    heuristic: true,
  },
  O1: {
    category: 'owned',
    heuristic: false,
  },
  O3: {
    category: 'owned',
    heuristic: false,
  },
  O7: {
    category: 'owned',
    heuristic: false,
  },
  O8: {
    category: 'owned',
    heuristic: true,
  },
} satisfies Record<string, SkipRule>
