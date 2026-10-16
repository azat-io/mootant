import type { SvelteCompiler } from '../../types/source/svelte-compiler'

/**
 * Pending or finished load of the compiler, shared by every caller of the
 * process.
 */
let loading: Promise<SvelteCompiler | null> | null = null

/**
 * Imports `svelte/compiler`, an optional peer dependency, on first use and
 * keeps it. Runs without Svelte components never load it. Svelte 4 is not used:
 * its parser has no modern tree of the template.
 *
 * @returns The compiler, or null when Svelte 5 or later cannot be loaded.
 */
export async function loadSvelteCompiler(): Promise<SvelteCompiler | null> {
  loading ??= importCompiler()
  return await loading
}

/**
 * Imports the compiler.
 *
 * @returns The compiler, or null when the import fails or the version is older
 *   than 5.
 */
async function importCompiler(): Promise<SvelteCompiler | null> {
  try {
    let compiler = await import('svelte/compiler')
    return Number.parseInt(compiler.VERSION, 10) >= 5 ? compiler : null
  } catch {
    return null
  }
}
