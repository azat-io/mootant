import type { Preset } from '../../types/config/preset'

/**
 * Recommended preset with the noisier options of the built-in mutators, the
 * mutants that only a timeout can kill and the coarse mutants that the solitary
 * rule would drop.
 */
export let strict: Preset = {
  mutators: {
    'regex-pattern': [
      'on',
      {
        largeAlternations: true,
        classMembers: true,
        quantifiers: true,
        negations: true,
      },
    ],
    'logical-operator': [
      'on',
      { nullishNormalization: true, nullishSwap: 'always' },
    ],
    'assignment-operator': ['on', { nullishSwap: 'always' }],
    'optional-chaining': ['on', { nonNullable: true }],
    'number-literal': ['on', { caseTests: true }],
    'string-literal': ['on', { caseTests: true }],
    'method-call': ['on', { anyReceiver: true }],
    'statement-removal': ['on', { jumps: true }],
    'regex-flag': ['on', { additions: true }],
  },
  description:
    'Recommended plus noisier or more expensive mutations a team may opt into.',
  settings: { coarseMutants: true, timeouts: true },
  extends: ['recommended'],
}
