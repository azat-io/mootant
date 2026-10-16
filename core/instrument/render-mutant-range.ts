import type { MutantRange } from '../../types/mutant/mutant-range'

import { getSiteCheck } from './get-site-check'

/**
 * Where a group sits in the switched text.
 */
interface Placement {
  /**
   * Guards by the offsets where the expression statements of statement lists
   * start.
   */
  statementStarts: ReadonlyMap<number, string>

  /**
   * Builds the check of a mutant site from the id of the mutant.
   */
  getCheck(id: string): string

  /**
   * Whether a guard may precede the host; false right after the `(` of a parent
   * expression host, where it would be a syntax error.
   */
  guarded: boolean
}

/**
 * Renders the host of one group of mutants, the hosts of its nested groups
 * first. An expression group becomes a chain of conditional expressions, a
 * block group a chain of `if` statements; the last branch holds the original
 * text with the nested hosts in it, and replacement texts are used verbatim. An
 * expression group that starts a statement of a statement list gets the guard
 * of that statement in front.
 *
 * @param range - Group to render.
 * @param source - Text of the file the mutants belong to.
 * @param context - Where the group sits.
 * @param context.statementStarts - Guards by the offsets where the expression
 *   statements of statement lists start (see `findStatementStarts`).
 * @param context.getCheck - Builds the check of a site from a mutant id; the
 *   check of the runtime global when omitted.
 * @returns Text that replaces the range in the switched file.
 */
export function renderMutantRange(
  range: MutantRange,
  source: string,
  context: {
    statementStarts: ReadonlyMap<number, string>
    getCheck?(id: string): string
  },
): string {
  return renderRange(range, source, {
    getCheck: context.getCheck ?? getSiteCheck,
    statementStarts: context.statementStarts,
    guarded: true,
  })
}

/**
 * Renders one group with its nested groups.
 *
 * @param range - Group to render.
 * @param source - Text of the file the mutants belong to.
 * @param placement - Statement starts and whether a guard may precede it.
 * @returns Text that replaces the range.
 */
function renderRange(
  range: MutantRange,
  source: string,
  placement: Placement,
): string {
  let { statementStarts, getCheck, guarded } = placement
  let original = ''
  let cursor = range.start
  for (let child of range.children) {
    original += source.slice(cursor, child.start)
    original += renderRange(child, source, {
      guarded: range.kind === 'block' || child.start !== range.start,
      statementStarts,
      getCheck,
    })
    cursor = child.end
  }
  original += source.slice(cursor, range.end)
  if (range.kind === 'block') {
    let branches = range.mutants.map(
      mutant => `if (${getCheck(mutant.id)}) {${mutant.replacement}}`,
    )
    return `{ ${branches.join(' else ')} else {${original}} }`
  }
  let guard = guarded ? (statementStarts.get(range.start) ?? '') : ''
  let branches = range.mutants.map(
    mutant => `${getCheck(mutant.id)} ? (${mutant.replacement}) : `,
  )
  return `${guard}(${branches.join('')}(${original}))`
}
