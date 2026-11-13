import type { MutantRuntime } from '../../types/adapter/mutant-runtime'

/**
 * Builds a mutant runtime for tests that set and read its fields. Unless given,
 * `hit` reaches no mutant, `hitAny` asks `hit` about each id, and the helpers
 * of removals keep an array as it is.
 *
 * @param fields - Fields that differ from those of a fresh runtime.
 * @returns Runtime with every field set.
 */
export function createTestRuntime(
  fields: Partial<MutantRuntime> = {},
): MutantRuntime {
  let runtime: MutantRuntime = {
    none: { [Symbol.iterator]: () => [][Symbol.iterator]() },
    hitAny: ids => ids.some(id => runtime.hit(id)),
    cut: array => array,
    hitLimit: Infinity,
    gap: Symbol('gap'),
    hit: () => false,
    coverage: null,
    reached: false,
    active: null,
    hits: 0,
    ...fields,
  }
  return runtime
}
