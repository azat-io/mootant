import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Vitest found in a project.
 */
interface VitestDetection {
  /**
   * Version of Vitest, or null when it is not installed.
   */
  version: string | null

  /**
   * Absolute path of the `vitest/node` entry, or null when Vitest is missing or
   * unsupported.
   */
  node: string | null

  /**
   * Whether Vitest is installed in a supported version.
   */
  available: boolean
}

/**
 * Finds the Vitest a project would run: the copy resolved from the project
 * root, never the one next to mootant.
 *
 * @param root - Project root.
 * @returns Version and entry of Vitest, and whether mootant supports it (major
 *   version 5).
 */
export async function detectVitest(root: string): Promise<VitestDetection> {
  let require = createRequire(path.join(root, 'package.json'))
  let manifest: string
  try {
    manifest = require.resolve('vitest/package.json')
  } catch {
    return { available: false, version: null, node: null }
  }
  let { version } = JSON.parse(await readFile(manifest, 'utf8')) as {
    version: string
  }
  if (version.split('.', 1)[0] !== '5') {
    return { available: false, node: null, version }
  }
  return { node: require.resolve('vitest/node'), available: true, version }
}
