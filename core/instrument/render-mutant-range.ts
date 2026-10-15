import type { MutantRange } from '../../types/mutant/mutant-range'

import { getSiteCheck } from './get-site-check'

/**
 * Where a group sits in the switched text.
 */
interface Placement {
  /**
   * Offsets where the expression statements of statement lists start.
   */
  statementStarts: ReadonlySet<number>

  /**
   * Whether a `;` may precede the host; false right after the `(` of a parent
   * expression host, where it would be a syntax error.
   */
  guarded: boolean
}

/**
 * Renders the host of one group of mutants, the hosts of its nested groups
 * first. An expression group becomes a chain of conditional expressions, a
 * block group a chain of `if` statements; the last branch holds the original
 * text with the nested hosts in it, and replacement texts are used verbatim. An
 * expression group that starts a statement of a statement list gets a `;` in
 * front.
 *
 * @param range - Group to render.
 * @param source - Text of the file the mutants belong to.
 * @param statementStarts - Offsets where the expression statements of statement
 *   lists start (see `findStatementStarts`).
 * @returns Text that replaces the range in the switched file.
 */
export function renderMutantRange(
  range: MutantRange,
  source: string,
  statementStarts: ReadonlySet<number>,
): string {
  return renderRange(range, source, { statementStarts, guarded: true })
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
  let { statementStarts, guarded } = placement
  let original = ''
  let cursor = range.start
  for (let child of range.children) {
    original += source.slice(cursor, child.start)
    original += renderRange(child, source, {
      guarded: range.kind === 'block' || child.start !== range.start,
      statementStarts,
    })
    cursor = child.end
  }
  original += source.slice(cursor, range.end)
  if (range.kind === 'block') {
    let branches = range.mutants.map(
      mutant => `if (${getSiteCheck(mutant.id)}) {${mutant.replacement}}`,
    )
    return `{ ${branches.join(' else ')} else {${original}} }`
  }
  let guard = guarded && statementStarts.has(range.start) ? ';' : ''
  let branches = range.mutants.map(
    mutant => `${getSiteCheck(mutant.id)} ? (${mutant.replacement}) : `,
  )
  return `${guard}(${branches.join('')}(${original}))`
}
