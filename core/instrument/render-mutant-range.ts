import type { MutantRange } from '../../types/mutant/mutant-range'
import type { SiteSyntax } from '../../types/mutant/site-syntax'
import type { TextEdit } from '../../types/source/text-edit'
import type { Mutant } from '../../types/mutant/mutant'

import { getSiteSyntax } from './get-site-syntax'
import { renderBranch } from './render-branch'

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
   * How the code of the group reaches the mutant runtime.
   */
  syntax: SiteSyntax

  /**
   * Whether a guard may precede the host; false right after the `(` or the `:`
   * of a parent expression host, where it would be a syntax error.
   */
  guarded: boolean
}

/**
 * Mutant that removes an array element or an object member.
 */
type RemovalMutant = Extract<Mutant, { kind: 'property' | 'element' }>

/**
 * Renders the host of one group of mutants, the hosts of its nested groups
 * first. An expression group becomes a chain of conditional expressions, a
 * block group a chain of `if` statements; the last branch holds the original
 * text with the nested hosts in it, and replacement texts are used verbatim.
 * The branches of an expression group are in parentheses (see `renderBranch`).
 * A group of removals of array elements or object members becomes one
 * conditional expression around their literal: while none of them is active it
 * runs the literal as written, with the nested hosts in it, and otherwise a
 * copy of the literal that leaves the active element out (see `renderCopy`). An
 * expression group or a group of removals that starts a statement of a
 * statement list gets the guard of that statement in front.
 *
 * @param range - Group to render.
 * @param source - Text of the file the mutants belong to.
 * @param context - Where the group sits.
 * @param context.statementStarts - Guards by the offsets where the expression
 *   statements of statement lists start (see `findStatementStarts`).
 * @param context.syntax - How the code reaches the mutant runtime; the syntax
 *   of script code when omitted.
 * @returns Text that replaces the range in the switched file.
 */
export function renderMutantRange(
  range: MutantRange,
  source: string,
  context: {
    statementStarts: ReadonlyMap<number, string>
    syntax?: SiteSyntax
  },
): string {
  return renderRange(range, source, {
    syntax: context.syntax ?? getSiteSyntax(false),
    statementStarts: context.statementStarts,
    guarded: true,
  })
}

/**
 * Renders one group with its nested groups.
 *
 * @param range - Group to render.
 * @param source - Text of the file the mutants belong to.
 * @param placement - Statement starts, runtime syntax and whether a guard may
 *   precede the host.
 * @returns Text that replaces the range.
 */
function renderRange(
  range: MutantRange,
  source: string,
  placement: Placement,
): string {
  let { statementStarts, guarded, syntax } = placement
  let { runtime, quote } = syntax
  let original = ''
  let cursor = range.start
  for (let child of range.children) {
    original += source.slice(cursor, child.start)
    original += renderRange(child, source, {
      guarded: range.kind === 'block' || child.start !== range.start,
      statementStarts,
      syntax,
    })
    cursor = child.end
  }
  original += source.slice(cursor, range.end)
  if (range.kind === 'block') {
    let branches = range.mutants.map(
      mutant =>
        `if (${runtime}?.hit(${quote(mutant.id)})) {${mutant.replacement}}`,
    )
    return `{ ${branches.join(' else ')} else {${original}} }`
  }
  let guard = guarded ? (statementStarts.get(range.start) ?? '') : ''
  if (range.kind !== 'expression') {
    let ids = range.mutants.map(mutant => quote(mutant.id)).join(', ')
    let copy = renderCopy(range, source, syntax)
    return `${guard}(${runtime}?.hitAny([${ids}]) ? ${copy} : ${original})`
  }
  let branches = range.mutants.map(
    mutant =>
      `${runtime}?.hit(${quote(mutant.id)}) ? ${renderBranch(mutant.replacement)} : `,
  )
  return `${guard}(${branches.join('')}${renderBranch(original)})`
}

/**
 * Renders the copy of a literal that the switched file runs while one of the
 * removals of its elements or members is active, from the original text, with
 * no nested host, since no other mutant is active then. A removed element of an
 * array becomes the gap of the runtime while its removal is active, which the
 * runtime then cuts out of the built array, and a removed spread spreads an
 * empty iterable of the runtime instead, so neither runs an iterator or a
 * method of the array prototype. A removed member of an object is spread from
 * an object of its own, `...(active ? {} : { b })`, with spaced braces, so a
 * member that ends with `}` does not write `}}`, which would end an
 * interpolation of a Vue template. The copy grows with the literal, not with
 * the number of its removals, but a literal inside it is copied once more, so
 * nested literals with removals grow with the depth of the nesting, as any
 * replacement that keeps the code inside it does.
 *
 * @param range - Group of removals of one literal.
 * @param source - Text of the file the mutants belong to.
 * @param syntax - How the code reaches the mutant runtime.
 * @returns Text of the copy.
 */
function renderCopy(
  range: MutantRange,
  source: string,
  syntax: SiteSyntax,
): string {
  let { runtime, quote } = syntax
  let mutants = range.mutants.filter(isRemoval)
  let removals = new Map<number, { focus: TextEdit; ids: string[] }>()
  for (let { focus, id } of mutants) {
    let removal = removals.get(focus.start)
    if (removal === undefined) {
      removals.set(focus.start, { ids: [id], focus })
    } else {
      removal.ids.push(id)
    }
  }
  let sorted = [...removals.values()].toSorted(
    (left, right) => left.focus.start - right.focus.start,
  )
  let copy = ''
  let cursor = range.start
  for (let { focus, ids } of sorted) {
    let active = ids
      .map(id => `${runtime}.active === ${quote(id)}`)
      .join(' || ')
    let text = source.slice(focus.start, focus.end)
    copy += source.slice(cursor, focus.start)
    if (range.kind === 'property') {
      copy += `...(${active} ? {} : { ${text} })`
    } else if (text.startsWith('...')) {
      copy += `...(${active} ? ${runtime}.none : ${text.slice(3)})`
    } else {
      copy += `(${active} ? ${runtime}.gap : ${text})`
    }
    cursor = focus.end
  }
  copy += source.slice(cursor, range.end)
  return range.kind === 'property' ? copy : `${runtime}.cut(${copy})`
}

/**
 * Tells whether a mutant removes an array element or an object member, as every
 * mutant of a group of removals does.
 *
 * @param mutant - Mutant of the group.
 * @returns Whether it is a removal, with its focus and literal.
 */
function isRemoval(mutant: Mutant): mutant is RemovalMutant {
  return mutant.kind === 'element' || mutant.kind === 'property'
}
