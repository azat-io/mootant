import type * as Compiler from '@vue/compiler-dom'

/**
 * Parts of `@vue/compiler-dom` that mootant uses: the parser of component files
 * and the compiler that checks switched templates.
 */
export type VueCompiler = Pick<typeof Compiler, 'compile' | 'parse'>
