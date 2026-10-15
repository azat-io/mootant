import { getStatementList } from '../syntax/get-statement-list'
import { getSourceBlocks } from '../parser/get-source-blocks'
import { parseFile } from '../parser/parse-file'
import { indexTree } from '../tree/index-tree'

/**
 * Finds where the expression statements that sit in a statement list, such as
 * the body of a block, start. An expression hosted in parentheses at one of
 * these offsets needs a `;` in front, so a previous line without a semicolon
 * does not take the parentheses as call arguments.
 *
 * @param file - Name of the file, whose extension selects the language; every
 *   script block of a component file is parsed.
 * @param source - Text of the file as read.
 * @returns Offsets in `source` where such statements start.
 * @throws Error - When the text does not parse.
 */
export function findStatementStarts(file: string, source: string): Set<number> {
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
  return starts
}
