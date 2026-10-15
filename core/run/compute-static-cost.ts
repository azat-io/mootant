import type { RunResult } from '../../types/run/run-result'
import type { RunState } from '../../types/run/run-state'

import { compareCodeUnits } from '../compare-code-units'

/**
 * Sums the isolated cost per mutated source file: the units its mutants ran,
 * their file time, and how many of its mutants were static.
 *
 * @param state - State of the run after the isolated phase.
 * @returns Files with isolated units or static mutants, by duration descending,
 *   then by path.
 */
export function computeStaticCost(state: RunState): RunResult['staticCost'] {
  let costs = new Map<string, RunResult['staticCost'][number]>()
  for (let {
    static: isStatic,
    unitDuration,
    mutant,
    units,
  } of state.mutants.values()) {
    if (units === 0 && !isStatic) {
      continue
    }
    let cost = costs.get(mutant.file) ?? {
      file: mutant.file,
      duration: 0,
      mutants: 0,
      units: 0,
    }
    costs.set(mutant.file, cost)
    cost.duration += unitDuration
    cost.units += units
    cost.mutants += Number(isStatic)
  }
  return [...costs.values()].toSorted(
    (left, right) =>
      right.duration - left.duration || compareCodeUnits(left.file, right.file),
  )
}
