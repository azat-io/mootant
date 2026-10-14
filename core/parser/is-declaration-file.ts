/**
 * Declaration files such as `.d.ts`, `.d.mts`, `.d.cts` and `.d.css.ts`.
 */
const DECLARATION_FILE_PATTERN = /\.d(?:\.[^./\\]+)?\.[cm]?ts$/u

/**
 * Tells whether a path names a TypeScript declaration file, by its lowercased
 * extension.
 *
 * @param file - Path of the file.
 * @returns Whether the file is a declaration file, which has nothing to mutate.
 */
export function isDeclarationFile(file: string): boolean {
  return DECLARATION_FILE_PATTERN.test(file.toLowerCase())
}
