import type { SvelteCompiler } from '../../types/source/svelte-compiler'
import type { SwitchedFile } from '../../types/adapter/switched-file'

/**
 * Checks that a switched Svelte component still compiles, so a mutant that the
 * compiler rejects does not fail the tests of every other mutant of the file.
 * The original text is compiled first: a component that Svelte compiles only
 * after the project's preprocessors, such as one with SCSS styles, cannot be
 * checked, and is let through.
 *
 * @param compiler - Svelte compiler of the project.
 * @param component - Path of the component, which Svelte names in its messages,
 *   its text as read and its switched text.
 * @returns Message of the compiler for the switched text, or null when it
 *   compiles or the original does not.
 */
export function checkSvelteCompile(
  compiler: SvelteCompiler,
  component: SwitchedFile,
): string | null {
  let { original, switched, file } = component
  try {
    compiler.compile(original, { filename: file })
  } catch {
    return null
  }
  try {
    compiler.compile(switched, { filename: file })
  } catch (error) {
    return (error as Error).message.replaceAll(/\s*\n\s*/gu, ' ')
  }
  return null
}
