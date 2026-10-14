/**
 * Mutants that a property test rejects, and faults that no mutant probes.
 */
export interface WeakMutants {
  /**
   * Pairs of mutants that differ from the original on the same inputs with the
   * same outputs, as `first | second`.
   */
  duplicates: string[]

  /**
   * Mutants that never differ from the original.
   */
  equivalent: string[]

  /**
   * Alternatives that differ from the original, but no mutant differs only on
   * inputs where the alternative differs: no test that kills a mutant is forced
   * to detect them.
   */
  uncovered: string[]

  /**
   * Mutants whose differing inputs contain those of another mutant, with the
   * same outputs there, as `subsumed < subsuming`: every test that kills the
   * subsuming mutant kills the subsumed one.
   */
  subsumed: string[]
}

/**
 * Program run on every input of a property test, with its outputs.
 */
export interface Probe {
  /**
   * Canonical text of the output on each input, in input order.
   */
  outputs: string[]

  /**
   * Text that names the program in a finding.
   */
  label: string
}

/**
 * Compares the outputs of mutants and alternatives with those of the original
 * program, the checks of the catalog's brute force and differential run (12.2
 * to 12.6). A mutant's kill set is the set of inputs where its output differs
 * from the original's.
 *
 * @param original - Outputs of the original program, in input order.
 * @param mutants - Mutants the pipeline kept.
 * @param alternatives - Classic faults the mutants should cover.
 * @returns The equivalent, duplicate and subsumed mutants and the uncovered
 *   alternatives, in the order of the mutants and alternatives.
 */
export function findWeakMutants(
  original: string[],
  mutants: Probe[],
  alternatives: Probe[] = [],
): WeakMutants {
  let killed = mutants.map(mutant => getKillSet(original, mutant))
  let result: WeakMutants = {
    equivalent: [],
    duplicates: [],
    uncovered: [],
    subsumed: [],
  }
  for (let [index, mutant] of mutants.entries()) {
    let kills = killed[index]!
    if (kills.size === 0) {
      result.equivalent.push(mutant.label)
      continue
    }
    for (let [otherIndex, other] of mutants.entries()) {
      let otherKills = killed[otherIndex]!
      if (
        otherIndex === index ||
        otherKills.size === 0 ||
        otherKills.size > kills.size ||
        !isInside(otherKills, kills, input => {
          let output = mutant.outputs[input]
          return output === other.outputs[input]
        })
      ) {
        continue
      }
      if (otherKills.size < kills.size) {
        result.subsumed.push(`${mutant.label} < ${other.label}`)
      } else if (otherIndex > index) {
        result.duplicates.push(`${mutant.label} | ${other.label}`)
      }
    }
  }
  for (let alternative of alternatives) {
    let kills = getKillSet(original, alternative)
    let covered = killed.some(
      mutantKills => mutantKills.size > 0 && isInside(mutantKills, kills),
    )
    if (!covered && kills.size > 0) {
      result.uncovered.push(alternative.label)
    }
  }
  return result
}

/**
 * Lists the inputs where a program differs from the original.
 *
 * @param original - Outputs of the original program.
 * @param probe - Program to compare.
 * @returns Indexes of the differing inputs.
 */
function getKillSet(original: string[], probe: Probe): Set<number> {
  let kills = new Set<number>()
  for (let [input, output] of probe.outputs.entries()) {
    if (output !== original[input]) {
      kills.add(input)
    }
  }
  return kills
}

/**
 * Tells whether every input of one kill set is in another and passes a check.
 *
 * @param inner - Kill set that should lie inside.
 * @param outer - Kill set that should contain it.
 * @param check - Further condition on each input of the inner set.
 * @returns Whether the inner set lies inside the outer one.
 */
function isInside(
  inner: Set<number>,
  outer: Set<number>,
  check: (input: number) => boolean = () => true,
): boolean {
  for (let input of inner) {
    if (!outer.has(input) || !check(input)) {
      return false
    }
  }
  return true
}
