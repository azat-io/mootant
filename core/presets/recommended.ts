import type { Preset } from '../../types/preset'

/**
 * Default preset: every built-in mutator with its default options, without
 * mutants that only a timeout can kill.
 */
export let recommended: Preset = {
  mutators: {
    'arithmetic-operator': 'on',
    'assignment-operator': 'on',
    'comparison-operator': 'on',
    'optional-chaining': 'on',
    'statement-removal': 'on',
    'bitwise-operator': 'on',
    'logical-operator': 'on',
    'boolean-literal': 'on',
    'object-property': 'on',
    'update-operator': 'on',
    'number-literal': 'on',
    'string-literal': 'on',
    'unary-operator': 'on',
    'array-element': 'on',
    'missing-await': 'on',
    'return-value': 'on',
    'method-call': 'on',
    condition: 'on',
  },
  description:
    'Precise, low-noise mutators without subsumed or equivalent variants.',
  settings: { coarseMutants: false, timeouts: false },
}
