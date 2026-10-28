import type { SkipJustifier } from '../../types/mutant/skip-justifier'
import type { SkipCategory } from '../../types/mutant/skip-category'
import type { Probe } from './find-weak-mutants'

import { getKillSet } from './get-kill-set'

/**
 * Skipped candidates whose outputs contradict the category of their skip.
 */
export interface UnsoundSkips {
  /**
   * Candidates skipped as equivalent that differ from the original.
   */
  equivalent: string[]

  /**
   * Candidates skipped as duplicates whose outputs no justifying mutant has.
   */
  duplicate: string[]

  /**
   * Candidates skipped as subsumed for which no justifying mutant differs from
   * the original only on inputs where they do.
   */
  subsumed: string[]

  /**
   * Candidates skipped as owned whose outputs no justifying mutant has.
   */
  owned: string[]
}

/**
 * Mutant of a run with its outputs, found by the justifier of a skip.
 */
export interface MutantProbe extends Probe {
  /**
   * Id of the mutator.
   */
  mutator: string

  /**
   * Start of the replaced range.
   */
  start: number

  /**
   * Id of the mutant.
   */
  id: string
}

/**
 * Skipped candidate of a run with its outputs.
 */
export interface SkipProbe extends Probe {
  /**
   * Mutant that justifies the skip, or null.
   */
  by: SkipJustifier | null

  /**
   * Category the skip claims.
   */
  category: SkipCategory
}

/**
 * Checks the skipped candidates of a run against its mutants, the way the
 * differential run checks the mutants themselves: an equivalent candidate never
 * differs from the original; a duplicate or an owned candidate has the outputs
 * of its justifying mutant; and a subsumed candidate differs from the original
 * on every input where its justifying mutant does, so a test that kills that
 * mutant kills it too. The justifying mutant is found by its id, or by its
 * mutator and start; a skip that names none is justified by any mutant of the
 * run that passes the check.
 *
 * @param original - Outputs of the original program, in input order.
 * @param mutants - Mutants of the run with their outputs.
 * @param skipped - Skipped candidates with their outputs.
 * @returns Labels of the candidates whose category the outputs contradict.
 */
export function findUnsoundSkips(
  original: string[],
  mutants: MutantProbe[],
  skipped: SkipProbe[],
): UnsoundSkips {
  let result: UnsoundSkips = {
    equivalent: [],
    duplicate: [],
    subsumed: [],
    owned: [],
  }
  for (let candidate of skipped) {
    let { category, label, by } = candidate
    let kills = getKillSet(original, candidate.outputs)
    let justifiers = mutants.filter(
      mutant =>
        !by ||
        (by.id === null ?
          mutant.mutator === by.mutator && mutant.start === by.start
        : mutant.id === by.id),
    )
    switch (category) {
      case 'equivalent':
        if (kills.size > 0) {
          result.equivalent.push(label)
        }
        break
      case 'duplicate':
      case 'owned':
        if (
          justifiers.every(mutant =>
            mutant.outputs.some(
              (output, input) => output !== candidate.outputs[input],
            ),
          )
        ) {
          result[category].push(label)
        }
        break
      case 'subsumed':
        if (
          !justifiers.some(mutant => {
            let mutantKills = getKillSet(original, mutant.outputs)
            return (
              mutantKills.size > 0 &&
              [...mutantKills].every(input => kills.has(input))
            )
          })
        ) {
          result.subsumed.push(label)
        }
        break
      default:
        break
    }
  }
  return result
}
