import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import type { Mutant } from '../../types/mutant/mutant'

import { findStatementStarts } from '../../core/instrument/find-statement-starts'
import { findAttributeValues } from '../../core/instrument/find-attribute-values'
import { renderBranch } from '../../core/instrument/render-branch'

/**
 * Starts of the expression statements that sit in a statement list and of the
 * quoted JSX attribute values, found in one text of a file.
 */
interface ListedStatements {
  /**
   * Guards by the offsets where those statements start.
   */
  starts: Map<number, string>

  /**
   * Offsets where quoted JSX attribute values start.
   */
  values: Set<number>

  /**
   * Text the starts were found in.
   */
  source: string
}

/**
 * Fields of a mutant that applying it needs; a mutant of the full report
 * (`--json --verbose`) has them too.
 */
type AppliedMutant = Pick<
  Mutant,
  'replacement' | 'start' | 'file' | 'kind' | 'end'
>

/**
 * Listed statements of the last text applied for each file name, so the mutants
 * of one text do not parse it again.
 */
let listedStatements = new Map<string, ListedStatements>()

/**
 * Applies a mutant the way the mutant switch will host it: an expression
 * replacement is written inside parentheses, as a branch of the switch (see
 * `renderBranch`), and a block replacement inside braces, and the removal of an
 * array element or an object member is written as is, which deletes the element
 * with its comma. An expression that starts an expression statement of a
 * statement list gets the guard of that statement in front, so a previous line
 * without a semicolon does not take the parentheses as call arguments; the
 * statements of Svelte and Vue templates count too. An expression in place of a
 * quoted JSX attribute value gets braces around the parentheses.
 *
 * @param source - Text of the file the mutant belongs to.
 * @param mutant - Mutant with its range, replacement, kind and file name.
 * @returns Text of the file with the mutant applied.
 * @throws Error - When the original text does not parse.
 */
export function applyMutant(source: string, mutant: AppliedMutant): string {
  let { replacement, start, kind, end } = mutant
  let before = source.slice(0, start)
  let after = source.slice(end)
  if (kind === 'block') {
    return `${before}{${replacement}}${after}`
  }
  if (kind === 'element' || kind === 'property') {
    return `${before}${replacement}${after}`
  }
  let { starts, values } = getListedStatements(source, mutant.file)
  let guard = starts.get(start) ?? ''
  let branch = `${guard}${renderBranch(replacement)}`
  return `${before}${values.has(start) ? `{${branch}}` : branch}${after}`
}

/**
 * Finds the statement starts and the quoted JSX attribute values of a text once
 * per file name and text, so the mutants of one text do not parse it again.
 *
 * @param source - Text of the file the mutant belongs to.
 * @param file - Name of the file, whose extension selects the language.
 * @returns Guards by the offsets where expression statements of statement lists
 *   start, and the offsets where quoted attribute values start.
 * @throws Error - When the text does not parse.
 */
function getListedStatements(source: string, file: string): ListedStatements {
  let cached = listedStatements.get(file)
  if (cached?.source === source) {
    return cached
  }
  let listed = {
    starts: findStatementStarts(file, source, { svelte, vue }),
    values: findAttributeValues(file, source),
    source,
  }
  listedStatements.set(file, listed)
  return listed
}
