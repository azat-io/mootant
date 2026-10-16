import type * as Compiler from 'svelte/compiler'

/**
 * Parts of `svelte/compiler` that mootant uses: the parser of template
 * expressions and the compiler that checks switched components.
 */
export type SvelteCompiler = Pick<typeof Compiler, 'compile' | 'parse'>
