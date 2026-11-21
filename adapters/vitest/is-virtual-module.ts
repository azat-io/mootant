import { isBuiltin } from 'node:module'
import path from 'node:path'

/**
 * Query or hash at the end of a module id.
 */
const SUFFIX_PATTERN = /[#?].*$/u

/**
 * Tells whether a Vite module id names a virtual module, which a plugin makes
 * up instead of loading a file, such as `\0virtual:limits` or `virtual:limits`:
 * an id that, without its query or hash, is neither empty, nor an absolute
 * path, nor a Node built-in, nor under `node_modules`, which the lockfile
 * stands for.
 *
 * @param id - Module id, as a worker reports it or Vite's module graph has it.
 * @returns Whether the id names a virtual module.
 */
export function isVirtualModule(id: string): boolean {
  let bare = id.replace(SUFFIX_PATTERN, '')
  return (
    bare !== '' &&
    !path.isAbsolute(bare) &&
    !isBuiltin(bare) &&
    !bare.includes('/node_modules/')
  )
}
