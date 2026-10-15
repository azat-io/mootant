import { describe, expect, it } from 'vitest'

import type { TryFacts } from '../../../types/adapter/try-facts'

import { createTryFacts } from '../../helpers/create-try-facts'
import { classifyTry } from '../../../core/run/classify-try'

/**
 * Limits of the tries of the table.
 */
const LIMITS = { hitLimit: 10, timeout: 100 }

describe('classifyTry', () => {
  it.each<{
    isolated: [string, string | null]
    batch: [string, string | null]
    facts: Partial<TryFacts>
  }>([
    {
      facts: { timedOut: true, hits: 11 },
      isolated: ['timeout', 'hit-limit'],
      batch: ['timeout', 'hit-limit'],
    },
    {
      facts: { timedOut: true, reached: true },
      isolated: ['timeout', 'time-limit'],
      batch: ['timeout', 'time-limit'],
    },
    {
      isolated: ['doubtful', null],
      facts: { timedOut: true },
      batch: ['doubtful', null],
    },
    {
      facts: { strays: ['boom'], reached: true, failed: true },
      isolated: ['killed', 'stray-error'],
      batch: ['doubtful', null],
    },
    {
      facts: { strays: ['boom'], failed: true },
      isolated: ['doubtful', null],
      batch: ['doubtful', null],
    },
    {
      facts: { reached: true, failed: true },
      isolated: ['killed', 'assertion'],
      batch: ['killed', 'assertion'],
    },
    {
      isolated: ['doubtful', null],
      batch: ['doubtful', null],
      facts: { failed: true },
    },
    {
      facts: { skipped: true, reached: true },
      isolated: ['survived', null],
      batch: ['survived', null],
    },
    {
      facts: { reached: true, hits: 10 },
      isolated: ['survived', null],
      batch: ['survived', null],
    },
    { isolated: ['unreached', null], batch: ['unreached', null], facts: {} },
  ])('classifies $facts', ({ isolated, batch, facts }) => {
    let tried = createTryFacts({ mutant: 'm1', ...facts })

    expect(classifyTry(tried, LIMITS, 'batch')).toStrictEqual({
      outcome: batch[0],
      cause: batch[1],
    })
    expect(classifyTry(tried, LIMITS, 'isolated')).toStrictEqual({
      outcome: isolated[0],
      cause: isolated[1],
    })
  })
})
