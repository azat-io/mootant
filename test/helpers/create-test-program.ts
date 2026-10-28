import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TestFile } from './create-test-file'

/**
 * Builds the analyzed program of a parsed snippet.
 *
 * @param file - Parsed snippet.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The runtime tree, scope analysis and shared scopes of the snippet.
 */
export function createTestProgram(
  file: TestFile,
  component = false,
): AnalyzedProgram {
  return {
    shared: new Set(component ? [file.parsed.program] : []),
    scopes: file.scopes,
    tree: file.tree,
  }
}
