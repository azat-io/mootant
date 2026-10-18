import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Package name of tsx, which the project has, never mootant.
 */
const TSX = 'tsx'

/**
 * Finds the tsx loader a project has, as better-node-test adds it for
 * TypeScript tests on Node versions without type stripping.
 *
 * @param root - Project root.
 * @returns `file:` URL of tsx's loader, or null when tsx is missing.
 */
export function resolveTsx(root: string): string | null {
  try {
    let require = createRequire(path.join(root, 'package.json'))
    return pathToFileURL(require.resolve(TSX)).href
  } catch {
    return null
  }
}
