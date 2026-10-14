import type { Mutant } from '../../types/mutant'

import { getStatementList } from '../../core/syntax/get-statement-list'
import { getSourceBlocks } from '../../core/parser/get-source-blocks'
import { parseFile } from '../../core/parser/parse-file'
import { indexTree } from '../../core/tree/index-tree'

/**
 * Starts of the expression statements that sit in a statement list, found in
 * one text of a file.
 */
interface ListedStatements {
  /**
   * Offsets where those statements start.
   */
  starts: Set<number>

  /**
   * Text the starts were found in.
   */
  source: string
}

/**
 * Fields of a mutant that applying it needs; a mutant of the `--json` report
 * has them too.
 */
type AppliedMutant = Pick<
  Mutant,
  'replacement' | 'start' | 'file' | 'kind' | 'end'
>

/**
 * Listed statements of the last text applied for each file name, so the mutants
 * of one text parse it once.
 */
let listedStatements = new Map<string, ListedStatements>()

/**
 * Applies a mutant the way the mutant switch will host it: an expression
 * replacement is written inside parentheses and a block replacement inside
 * braces. An expression that starts an expression statement of a statement list
 * gets a `;` in front, so a previous line without a semicolon does not take the
 * parentheses as call arguments.
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
  let starts = getListedStatementStarts(source, mutant.file)
  let guard = starts.has(start) ? ';' : ''
  return `${before}${guard}(${replacement})${after}`
}

/**
 * Finds where the expression statements that sit in a statement list, such as
 * the body of a block, start: a mutant that starts at one of them needs a `;`
 * in front.
 *
 * @param source - Text of the file the mutant belongs to.
 * @param file - Name of the file, whose extension selects the language; every
 *   script block of a component file is parsed.
 * @returns Offsets where such statements start.
 * @throws Error - When the text does not parse.
 */
function getListedStatementStarts(source: string, file: string): Set<number> {
  let cached = listedStatements.get(file)
  if (cached?.source === source) {
    return cached.starts
  }
  let starts = new Set<number>()
  for (let block of getSourceBlocks(file, source)) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      throw new Error(`The original text of ${file} does not parse.`)
    }
    let tree = indexTree(outcome.parsed.program)
    for (let node of tree.slots.keys()) {
      if (
        node.type === 'ExpressionStatement' &&
        getStatementList(tree, node) !== null
      ) {
        starts.add(node.start)
      }
    }
  }
  listedStatements.set(file, { starts, source })
  return starts
}
