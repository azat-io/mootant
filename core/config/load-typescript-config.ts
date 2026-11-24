import type { createJiti } from 'jiti'

import { realpathSync } from 'node:fs'
import path from 'node:path'

import { listPackageFiles } from '../files/list-package-files'
import { readPackageType } from '../files/read-package-type'
import { importConfig } from './import-config'

/**
 * Loads a TypeScript configuration file and returns its default export: the
 * `export default` of an ES module, or the `module.exports` of a CommonJS
 * module. Node.js imports it directly when it can strip types (22.18 and
 * later); older versions need the optional `jiti` package, where version 1,
 * without `createJiti`, counts as missing. A `.ts` file of a package whose
 * `type` is not `module` loads with `jiti` too when it is installed: Node.js
 * reads it as CommonJS, where `import` and `export` fail or, without a `type`
 * field, draw a warning. A link counts as the file it points to, as in
 * Node.js.
 *
 * @param file - Absolute path of the configuration file.
 * @returns The default export of the file, or undefined when it has none.
 * @throws Error - When Node.js cannot strip types and `jiti` is not installed.
 */
export async function loadTypescriptConfig(file: string): Promise<unknown> {
  let strips = Boolean(process.features.typescript)
  if (strips && !file.endsWith('.ts')) {
    return importConfig(file)
  }
  let real = realpathSync(file)
  let type =
    strips ?
      readPackageType(
        listPackageFiles(path.dirname(real), new Map()).at(-1)!,
        new Map(),
      )
    : null
  if (type === 'module') {
    return importConfig(file)
  }
  let jiti: { createJiti?: typeof createJiti } = {}
  try {
    jiti = await import('jiti')
  } catch {}
  if (jiti.createJiti) {
    let module = await jiti
      .createJiti(import.meta.url, { interopDefault: false })
      .import<Record<string, unknown>>(real)
    return module['__esModule'] === true ? module['default'] : module
  }
  if (!strips) {
    throw new Error(
      'TypeScript configuration files need Node.js 22.18 or later, or the jiti package.',
    )
  }
  return type === 'commonjs' ? importCommonJsConfig(file) : importConfig(file)
}

/**
 * Imports a `.ts` configuration file of a `"type": "commonjs"` package when
 * `jiti` is not installed. Node.js reads it as CommonJS and rejects `import`
 * and `export` with a `SyntaxError` that has no code, unlike the errors of type
 * stripping, so such an error gets advice on loading the file as an ES module.
 *
 * @param file - Absolute path of the file.
 * @returns The default export of the file, or undefined when it has none.
 * @throws Error - When Node.js cannot import the file.
 */
async function importCommonJsConfig(file: string): Promise<unknown> {
  try {
    return await importConfig(file)
  } catch (error) {
    if (error instanceof SyntaxError && !('code' in error)) {
      throw new Error(
        `${error.message}. Node.js reads the file as CommonJS because its package.json has "type": "commonjs"; to use import and export, install jiti or rename it to ${path.basename(file, '.ts')}.mts.`,
        { cause: error },
      )
    }
    throw error
  }
}
