import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { TestFile } from './create-test-file'

import { parseIgnoreDirectives } from '../../core/ignore/parse-ignore-directives'
import { createIgnoreRules } from '../../core/ignore/create-ignore-rules'
import { getSourcePosition } from '../../core/text/get-source-position'
import { findIgnoreRule } from '../../core/ignore/find-ignore-rule'
import { corePlugin } from '../../core/plugins/core-plugin'
import { createTestFile } from './create-test-file'

/**
 * How a test context differs from a `recommended` run on `example.ts`.
 */
export interface TestContextSetup {
  /**
   * Ids of core mutators the preset turns off.
   */
  disabled?: string[]

  /**
   * Whether timeout-only mutants are emitted; false when omitted.
   */
  timeouts?: boolean

  /**
   * File name of the snippet, whose extension selects the language;
   * `example.ts` when omitted.
   */
  file?: string
}

/**
 * Snippet parsed for a test, with the context a mutator would get.
 */
export interface TestContext {
  /**
   * Mutator context of the snippet, with ignore directives applied.
   */
  context: MutatorContext

  /**
   * Finds a node of the whole tree, as `TestFile.find` does.
   */
  find: TestFile['find']
}

/**
 * Parses a snippet and builds the mutator context the pipeline would build for
 * it: every core mutator enabled unless the setup turns it off, the ignore
 * directives of the snippet read first, so `isActive` answers as in a run.
 *
 * @param source - Text of the snippet.
 * @param setup - Disabled mutators, the timeouts setting and the file name.
 * @returns The context and a node finder.
 * @throws Error - When the snippet has a parse error.
 */
export function createTestContext(
  source: string,
  setup: TestContextSetup = {},
): TestContext {
  let file = createTestFile(source, setup.file)
  let { parsed } = file
  let ids = Object.keys(corePlugin.mutators)
  let enabled = new Set(ids.filter(id => !setup.disabled?.includes(id)))
  let { directives } = parseIgnoreDirectives(parsed, new Set(ids))
  let { rules } = createIgnoreRules(parsed, directives)
  return {
    context: {
      isActive(id: string, node: Node): boolean {
        return (
          enabled.has(id) &&
          findIgnoreRule(rules, {
            line: getSourcePosition(parsed.lineStarts, node.start).line,
            start: node.start,
            mutator: id,
          }) === null
        )
      },
      isEnabled(id: string): boolean {
        return enabled.has(id)
      },
      settings: { timeouts: setup.timeouts ?? false, coarseMutants: false },
      sourceCode: file.sourceCode,
      syntax: file.syntax,
      file: parsed.file,
      hints: file.hints,
      options: {},
      id: 'test',
    },
    find: file.find,
  }
}
