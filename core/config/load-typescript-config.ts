import type { createJiti } from 'jiti'

import { importConfig } from './import-config'

/**
 * Loads a TypeScript configuration file and returns its default export: the
 * `export default` of an ES module, or the `module.exports` of a CommonJS
 * module. Node.js imports it directly when it can strip types (22.18 and
 * later); older versions need the optional `jiti` package.
 *
 * @param file - Absolute path of the configuration file.
 * @returns The default export of the file, or undefined when it has none.
 * @throws Error - When Node.js cannot strip types and `jiti` is not installed.
 */
export async function loadTypescriptConfig(file: string): Promise<unknown> {
  if (process.features.typescript) {
    return importConfig(file)
  }
  let jiti: { createJiti: typeof createJiti }
  try {
    jiti = await import('jiti')
  } catch {
    throw new Error(
      'TypeScript configuration files need Node.js 22.18 or later, or the jiti package.',
    )
  }
  let module = await jiti
    .createJiti(import.meta.url, { interopDefault: false })
    .import<Record<string, unknown>>(file)
  return module['__esModule'] === true ? module['default'] : module
}
