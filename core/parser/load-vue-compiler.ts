import type { VueCompiler } from '../../types/source/vue-compiler'

/**
 * Pending or finished load of the compiler, shared by every caller of the
 * process.
 */
let loading: Promise<VueCompiler | null> | null = null

/**
 * Imports `@vue/compiler-dom`, an optional peer dependency, on first use and
 * keeps it. Runs without Vue components never load it. Versions before 3.5 are
 * not used: their compiler reads `Symbol` in a template as a property of the
 * component, which breaks the check of every mutant site.
 *
 * @returns The compiler, or null when version 3.5 or later cannot be loaded.
 */
export async function loadVueCompiler(): Promise<VueCompiler | null> {
  loading ??= importCompiler()
  return await loading
}

/**
 * Imports the compiler and the version of its package.
 *
 * @returns The compiler, or null when the import fails or the version is older
 *   than 3.5.
 */
async function importCompiler(): Promise<VueCompiler | null> {
  try {
    let [compiler, manifest] = await Promise.all([
      import('@vue/compiler-dom'),
      import('@vue/compiler-dom/package.json', { with: { type: 'json' } }),
    ])
    let [major = 0, minor = 0] = manifest.default.version
      .split('.')
      .map(part => Number.parseInt(part, 10))
    return major > 3 || (major === 3 && minor >= 5) ? compiler : null
  } catch {
    return null
  }
}
