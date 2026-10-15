import type { SourceBlock } from '../../types/source/source-block'
import type { ScriptBlock } from '../../types/source/script-block'

import { getComponentFramework } from './get-component-framework'
import { getParserOptions } from './get-parser-options'
import { scanScriptBlocks } from './scan-script-blocks'

/**
 * Runs of code units other than line terminators.
 */
const BLANKED_PATTERN = /[^\n\r\u{2028}\u{2029}]+/gu

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
    topLevelReturn: block.frontmatter,
    text: blankOutside(source, block),
    length: block.end,
  }))
}

/**
 * Blanks the text around a block.
 *
 * @param source - Text of the file.
 * @param block - Block to keep.
 * @returns Text of the same length with only the block, the line terminators
 *   and a leading byte order mark left.
 */
function blankOutside(source: string, block: ScriptBlock): string {
  let start = source.codePointAt(0) === 0xfe_ff ? 1 : 0
  return (
    source.slice(0, start) +
    blank(source.slice(start, block.start)) +
    source.slice(block.start, block.end) +
    blank(source.slice(block.end))
  )
}

/**
 * Replaces every code unit of a text except line terminators with a space.
 *
 * @param text - Text to blank.
 * @returns Blank text of the same length and lines.
 */
function blank(text: string): string {
  return text.replaceAll(BLANKED_PATTERN, run => ' '.repeat(run.length))
}
