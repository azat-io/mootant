import type { Mutant } from '../../types/mutant/mutant'

/**
 * Builds a pending mutant of `example.ts` for tests that only read its range,
 * kind, replacement and id.
 *
 * @param fields - Fields that differ from the defaults: an expression mutant
 *   with the id `m1` that replaces the range with `x`.
 * @returns Mutant with every field set.
 */
export function createMutant(
  fields: Pick<Mutant, 'start' | 'end'> & Partial<Mutant>,
): Mutant {
  return {
    mutator: 'arithmetic-operator',
    kind: 'expression',
    file: 'example.ts',
    status: 'Pending',
    replacement: 'x',
    ignoredBy: null,
    reason: null,
    scope: null,
    id: 'm1',
    ...fields,
  }
}
