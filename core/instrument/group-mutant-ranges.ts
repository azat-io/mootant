import type { MutantRange } from '../../types/mutant/mutant-range'
import type { Mutant } from '../../types/mutant/mutant'

/**
 * Groups the mutants of one file by the range they replace and the way they are
 * hosted, and nests the groups into a forest: a group is the child of the
 * smallest group whose range holds it. An expression statement can be removed
 * as a block and changed as an expression; its block group then holds its
 * expression group. Mutants keep their list order within a group.
 *
 * @param mutants - Mutants of one file to host.
 * @returns Top-level groups sorted by start, each with its nested groups.
 * @throws Error - When two ranges overlap without one holding the other.
 */
export function groupMutantRanges(mutants: readonly Mutant[]): MutantRange[] {
  let groups = new Map<string, MutantRange>()
  for (let mutant of mutants) {
    let key = `${mutant.kind}:${mutant.start}:${mutant.end}`
    let group = groups.get(key)
    if (group === undefined) {
      groups.set(key, {
        start: mutant.start,
        kind: mutant.kind,
        mutants: [mutant],
        end: mutant.end,
        children: [],
      })
    } else {
      group.mutants.push(mutant)
    }
  }
  let sorted = [...groups.values()].toSorted(
    (left, right) =>
      left.start - right.start ||
      right.end - left.end ||
      Number(left.kind === 'expression') - Number(right.kind === 'expression'),
  )
  let roots: MutantRange[] = []
  let stack: MutantRange[] = []
  for (let group of sorted) {
    while (stack.length > 0 && stack.at(-1)!.end <= group.start) {
      stack.pop()
    }
    let parent = stack.at(-1)
    if (parent === undefined) {
      roots.push(group)
    } else if (group.end > parent.end) {
      throw new Error(
        `Mutant ranges of ${group.mutants[0]!.file} overlap at ${group.start}.`,
      )
    } else {
      parent.children.push(group)
    }
    stack.push(group)
  }
  return roots
}
