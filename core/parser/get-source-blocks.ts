import type { SourceBlock } from '../../types/source/source-block'

import { getComponentFramework } from './get-component-framework'
import { getParserOptions } from './get-parser-options'
import { scanScriptBlocks } from './scan-script-blocks'
import { blankOutside } from '../text/blank-outside'

/**
 * Splits a file into the programs mootant parses. A JavaScript or TypeScript
 * file is one program. Each script block of a Vue, Svelte or Astro component is
 * its own module, parsed from a copy of the file in which every code unit
 * outside the block except line terminators and a leading byte order mark
 * became a space, so offsets, lines and columns stay those of the file.
 *
 * @param file - Path of the file; its extension must be a supported one.
 * @param source - Text of the file as read from disk.
 * @returns Programs in source order; none for a component without scripts.
 */
export function getSourceBlocks(file: string, source: string): SourceBlock[] {
  let framework = getComponentFramework(file)
  if (framework === null) {
    return [
      {
        options: getParserOptions(file)!,
        length: source.length,
        topLevelReturn: false,
        text: source,
      },
    ]
  }
  return scanScriptBlocks(source, framework).map(block => ({
    options: { sourceType: 'module', lang: block.lang },
    text: blankOutside(source, [block]),
    topLevelReturn: block.frontmatter,
    length: block.end,
  }))
}
