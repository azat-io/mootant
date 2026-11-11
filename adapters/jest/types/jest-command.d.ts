import type { Diagnostic } from '../../../types/mutant/diagnostic'

/**
 * Test command of a project as mootant reads it from a script, before Jest's
 * flags are filtered.
 */
export interface JestCommand {
  /**
   * Environment variables the command sets, with the shell variables in their
   * values expanded.
   */
  env: Record<string, string>

  /**
   * Warnings about what the command gives and mootant leaves out.
   */
  diagnostics: Diagnostic[]

  /**
   * Node flags before the binary, each followed by its value.
   */
  nodeFlags: string[]

  /**
   * Words after the binary, which are Jest's arguments.
   */
  args: string[]
}
