import type { TryFacts } from '../../types/adapter/try-facts'

/**
 * Builds the facts of a try for tests that read only some of them.
 *
 * @param fields - Fields that differ from the defaults: a passing control try
 *   of the test `t1` that took 1 ms and evaluated no site.
 * @returns Facts with every field set.
 */
export function createTryFacts(fields: Partial<TryFacts> = {}): TryFacts {
  return {
    timedOut: false,
    reached: false,
    skipped: false,
    message: null,
    failed: false,
    mutant: null,
    covers: null,
    duration: 1,
    strays: [],
    test: 't1',
    hits: 0,
    ...fields,
  }
}
