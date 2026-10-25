import type { BindingIdentifier, Program, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { Binding } from '../../types/syntax/binding'
import type { Mutant } from '../../types/mutant/mutant'

import { createDigest } from '../cache/create-digest'

/**
 * Most steps that finding the regions of one file may take, each a link from a
 * statement to one it uses or a link that a region follows: past it, every
 * mutant of the file gets the whole text as its region, so names that many
 * statements write, which link each of them to all the others, cannot make the
 * work grow with the cube of the number of statements.
 */
const MAX_STEPS = 100_000

/**
 * Program of a JavaScript or TypeScript file with what tells which of its
 * top-level statements use which.
 */
interface RegionProgram {
  /**
   * Scope analysis of the program.
   */
  scopes: ScopeAnalysis

  /**
   * Root of the program, whose top-level statements make up the regions.
   */
  program: Program

  /**
   * Runtime tree of the program, whose JSX elements name what they render.
   */
  tree: TreeIndex
}

/**
 * Steps left for finding the regions of a file (see `MAX_STEPS`).
 */
interface Budget {
  /**
   * Number of steps left; below zero once the budget is spent.
   */
  left: number
}

/**
 * Finds the region of every mutant of a file, which incremental runs key the
 * cached verdicts of the mutant by (see `createRunCache`): the top-level
 * statement that holds the mutant, with every top-level statement of the file
 * that it uses, also through others: one that declares or writes a name it
 * reads or writes, an import included, or renders as a JSX element. Other
 * statements of the file, such as its callers, comments between statements and
 * other files keep the region, though a change there may turn a verdict, so
 * incremental reuse is a heuristic. The whole text is the region of every
 * mutant of a component, whose template and script blocks use each other's
 * names, of a program whose names code may reach where the scope analysis does
 * not see it (see `ScopeAnalysis.opaque`), and of a file whose regions would
 * take more than `MAX_STEPS` steps.
 *
 * @param input - Mutants, text and program of the file.
 * @param input.mutants - Mutants of the file.
 * @param input.program - Program of a JavaScript or TypeScript file, or null
 *   for a component.
 * @param input.source - Text of the file the mutant ranges index into.
 * @returns Digest of the texts of the region of every mutant, by id.
 */
export function getMutantRegions(input: {
  mutants: readonly Pick<Mutant, 'start' | 'id'>[]
  program: RegionProgram | null
  source: string
}): Map<string, string> {
  let { mutants, program, source } = input
  let regions = new Map<string, string>()
  if (mutants.length === 0) {
    return regions
  }
  if (program === null || program.scopes.opaque) {
    return fillWhole(mutants, source)
  }
  let statements = program.program.body
  let budget: Budget = { left: MAX_STEPS }
  let uses = collectUses(program, statements, budget)
  let texts: (undefined | string)[] = []
  let digests = new Map<number, string>()
  for (let mutant of mutants) {
    let index = findStatement(statements, mutant.start)
    let digest = digests.get(index)
    if (digest === undefined) {
      let region = uses && collectRegion(index, uses, budget)
      if (!region) {
        return fillWhole(mutants, source)
      }
      digest = createDigest(
        [...region]
          .toSorted((left, right) => left - right)
          .map(statement => {
            let { start, end } = statements[statement]!
            texts[statement] ??= createDigest(source.slice(start, end))
            return texts[statement]
          }),
      )
      digests.set(index, digest)
    }
    regions.set(mutant.id, digest)
  }
  return regions
}

/**
 * Finds which top-level statements each one uses: every statement that declares
 * or writes a name of the program scope it reads or writes, such as each
 * overload and the implementation of a function or an assignment that sets the
 * value it reads, and every statement that declares the name of a JSX element
 * it renders, such as `Header` in `<Header />` or `Menu` in `<Menu.Item />`,
 * which the scope analysis does not resolve.
 *
 * @param program - Program with its scopes and runtime tree.
 * @param statements - Top-level statements of the program, in source order.
 * @param budget - Steps left, one per link, spent in place.
 * @returns Indexes of the statements each statement uses, by its index, or null
 *   when the budget runs out.
 */
function collectUses(
  program: RegionProgram,
  statements: readonly Node[],
  budget: Budget,
): Set<number>[] | null {
  let owners = new Map<Binding, Set<number>>()
  let references = new Set<Node>()
  let bindings = new Set(program.scopes.bindings.values())
  for (let binding of bindings) {
    if (binding.scope === program.program) {
      owners.set(binding, new Set())
      for (let reference of binding.references) {
        references.add(reference)
      }
    }
  }
  let declared = new Map<string, Set<number>>()
  for (let [identifier, binding] of program.scopes.bindings) {
    let statementsOfName = owners.get(binding)
    if (statementsOfName && !references.has(identifier)) {
      statementsOfName.add(findStatement(statements, identifier.start))
      declared.set((identifier as BindingIdentifier).name, statementsOfName)
    }
  }
  let links: [number, ReadonlySet<number>][] = []
  for (let [binding, statementsOfName] of owners) {
    for (let write of binding.writes) {
      statementsOfName.add(findStatement(statements, write.start))
    }
    for (let reference of binding.references) {
      links.push([findStatement(statements, reference.start), statementsOfName])
    }
  }
  for (let node of program.tree.order) {
    if (node.type !== 'JSXOpeningElement') {
      continue
    }
    let { name } = node
    while (name.type === 'JSXMemberExpression') {
      name = name.object
    }
    let rendered =
      name.type === 'JSXIdentifier' ? declared.get(name.name) : undefined
    if (rendered) {
      links.push([findStatement(statements, node.start), rendered])
    }
  }
  let uses = statements.map(() => new Set<number>())
  for (let [user, used] of links) {
    budget.left -= used.size
    if (budget.left < 0) {
      return null
    }
    for (let owner of used) {
      uses[user]!.add(owner)
    }
  }
  return uses
}

/**
 * Collects a top-level statement with every statement it uses, also through
 * others.
 *
 * @param index - Index of the statement.
 * @param uses - Indexes of the statements each statement uses.
 * @param budget - Steps left, one per link followed, spent in place.
 * @returns Indexes of the statements of the region, or null when the budget
 *   runs out.
 */
function collectRegion(
  index: number,
  uses: readonly ReadonlySet<number>[],
  budget: Budget,
): Set<number> | null {
  let region = new Set([index])
  let pending = [index]
  let current = pending.pop()
  while (current !== undefined) {
    let used = uses[current]!
    budget.left -= used.size
    if (budget.left < 0) {
      return null
    }
    for (let next of used) {
      if (!region.has(next)) {
        region.add(next)
        pending.push(next)
      }
    }
    current = pending.pop()
  }
  return region
}

/**
 * Finds the top-level statement that holds an offset: the last one that starts
 * at or before it.
 *
 * @param statements - Top-level statements in source order, one of which holds
 *   the offset.
 * @param offset - Offset in the text of the file.
 * @returns Index of the statement.
 */
function findStatement(statements: readonly Node[], offset: number): number {
  let low = 0
  let high = statements.length - 1
  while (low < high) {
    let middle = Math.ceil((low + high) / 2)
    if (statements[middle]!.start <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return low
}

/**
 * Gives every mutant of a file the whole text as its region.
 *
 * @param mutants - Mutants of the file.
 * @param source - Text of the file.
 * @returns Digest of the text, by the id of every mutant.
 */
function fillWhole(
  mutants: readonly Pick<Mutant, 'start' | 'id'>[],
  source: string,
): Map<string, string> {
  let whole = createDigest([source])
  return new Map(mutants.map(mutant => [mutant.id, whole]))
}
