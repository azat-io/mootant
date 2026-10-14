import type { ParserOptions } from 'oxc-parser'

import { isDeclarationFile } from './is-declaration-file'

/**
 * Parser options by lowercased extension. JavaScript is always parsed with JSX
 * enabled, and both the language and the source type are always set, because
 * oxc drops the source type it derives from the extension once `lang` is set.
 */
let optionsByExtension = new Map<string, ParserOptions>([
  ['.tsx', { sourceType: 'unambiguous', lang: 'tsx' }],
  ['.jsx', { sourceType: 'unambiguous', lang: 'jsx' }],
  ['.js', { sourceType: 'unambiguous', lang: 'jsx' }],
  ['.ts', { sourceType: 'unambiguous', lang: 'ts' }],
  ['.cjs', { sourceType: 'commonjs', lang: 'jsx' }],
  ['.cts', { sourceType: 'commonjs', lang: 'ts' }],
  ['.mjs', { sourceType: 'module', lang: 'jsx' }],
  ['.mts', { sourceType: 'module', lang: 'ts' }],
])

/**
 * Extension of a JavaScript or TypeScript source file.
 */
const EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/u

/**
 * Derives the oxc parser options of a file from its lowercased extension.
 *
 * @param file - Path of the file.
 * @returns Language and source type for the parser, or null for declaration
 *   files and files that are not JavaScript or TypeScript sources.
 */
export function getParserOptions(file: string): ParserOptions | null {
  if (isDeclarationFile(file)) {
    return null
  }

  let extension = EXTENSION_PATTERN.exec(file.toLowerCase())?.[0] ?? ''
  let options = optionsByExtension.get(extension)
  return options ? { ...options } : null
}
