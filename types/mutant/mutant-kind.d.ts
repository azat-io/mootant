/**
 * How the mutant switch hosts a mutant, and so how a mutant is applied to the
 * file:
 *
 * - `expression`: a conditional expression around the replaced expression; the
 *   replacement is written inside parentheses.
 * - `block`: an `if`/`else` around the replaced statement; the replacement is
 *   written inside braces.
 * - `element`: the removal of an element of an array literal, hosted with the
 *   other removals of the literal: the switched file runs the literal as
 *   written unless one of them is active, and then a copy of it that leaves
 *   that element out. The replacement, an empty text, is written as is, which
 *   deletes the element with its comma.
 * - `property`: the removal of a member of an object literal, hosted and written
 *   like `element`.
 */
export type MutantKind = 'expression' | 'property' | 'element' | 'block'
