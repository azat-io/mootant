import { getComponentFramework } from '../parser/get-component-framework'
import { getParserOptions } from '../parser/get-parser-options'

/**
 * Tells whether a file is one mootant lists: a JavaScript or TypeScript source
 * that is not a declaration file, or a Vue, Svelte or Astro component.
 *
 * @param file - Path of the file.
 * @returns Whether the file is listed.
 */
export function isSourceFile(file: string): boolean {
  return getParserOptions(file) !== null || getComponentFramework(file) !== null
}
