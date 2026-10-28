import type { TemplateSource } from '../../types/source/template-source'
import type { SourceBlock } from '../../types/source/source-block'

/**
 * Picks the language of the template expressions of a component: TypeScript
 * when one of its script blocks is TypeScript or TSX, JavaScript otherwise.
 *
 * @param blocks - Programs of the component file, as `getSourceBlocks` gives
 *   them.
 * @returns Language oxc parses the template expressions in.
 */
export function getTemplateLanguage(
  blocks: readonly SourceBlock[],
): TemplateSource['lang'] {
  let typescript = blocks.some(block => block.options.lang!.startsWith('ts'))
  return typescript ? 'ts' : 'js'
}
