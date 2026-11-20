import { getSourceBlocks } from '../parser/get-source-blocks'
import { parseFile } from '../parser/parse-file'
import { walkTree } from '../tree/walk-tree'

/**
 * Finds where the quoted values of JSX attributes start, such as `"password"`
 * in `type="password"`. A conditional expression stands in place of such a
 * value only inside braces, so the mutant switch hosts it in them.
 *
 * @param file - Name of the file, whose extension selects the language; every
 *   script block of a component file is parsed.
 * @param source - Text of the file as read.
 * @returns Offsets in `source` where quoted attribute values start.
 * @throws Error - When the text does not parse.
 */
export function findAttributeValues(file: string, source: string): Set<number> {
  let starts = new Set<number>()
  for (let block of getSourceBlocks(file, source)) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      throw new Error(`The original text of ${file} does not parse.`)
    }
    walkTree(outcome.parsed.program, node => {
      if (node.type === 'JSXAttribute' && node.value?.type === 'Literal') {
        starts.add(node.value.start)
      }
      return true
    })
  }
  return starts
}
