import { pathToFileURL } from 'node:url'

/**
 * Imports a configuration script by its path and reads its default export: the
 * `export default` of an ES module, or the `module.exports` of a CommonJS
 * module.
 *
 * @param file - Absolute path of the script.
 * @returns The default export, or undefined when the script has none.
 */
export async function importConfig(file: string): Promise<unknown> {
  let module = (await import(pathToFileURL(file).href)) as Record<
    string,
    unknown
  >
  return module['default']
}
