import path from 'node:path'

/**
 * Query or hash at the end of a module id.
 */
const SUFFIX_PATTERN = /[#?].*$/u

/**
 * Tells which file a Vite module id stands for: the id without its query or
 * hash, when that is an absolute path, under `node_modules` too.
 *
 * @param id - Module id or path.
 * @returns Absolute path of the file, or null for a virtual or built-in module.
 */
export function getModuleFile(id: string): string | null {
  let file = id.replace(SUFFIX_PATTERN, '')
  return path.isAbsolute(file) ? file : null
}
