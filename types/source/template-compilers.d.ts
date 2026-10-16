import type { SvelteCompiler } from './svelte-compiler'
import type { VueCompiler } from './vue-compiler'

/**
 * Framework compilers that read and check component templates. A compiler is
 * null when its package cannot be loaded or no component needs it.
 */
export interface TemplateCompilers {
  /**
   * Svelte compiler, version 5 or later.
   */
  svelte: SvelteCompiler | null

  /**
   * Vue template compiler, version 3.5 or later.
   */
  vue: VueCompiler | null
}
