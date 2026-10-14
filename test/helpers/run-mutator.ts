import type { MutantStatus } from '../../types/mutant-status'
import type { MutatorSetup } from './generate-mutants'

import { getSourcePosition } from '../../core/text/get-source-position'
import { getLineStarts } from '../../core/text/get-line-starts'
import { corePlugin } from '../../core/plugins/core-plugin'
import { parseFile } from '../../core/parser/parse-file'
import { generateMutants } from './generate-mutants'
import { applyMutant } from './apply-mutant'

/**
 * Mutant of a test run, with the fields a test compares.
 */
export interface MutantSummary {
  /**
   * How the mutant will be switched on.
   */
  kind: 'expression' | 'block'

  /**
   * Reason of the ignore directive that covers the mutant, or null.
   */
  reason: string | null

  /**
   * Dotted names of the declarations around the mutant, or null.
   */
  scope: string | null

  /**
   * Whether the mutant will be tested or an ignore directive excluded it.
   */
  status: MutantStatus

  /**
   * Text written in place of the original.
   */
  replacement: string

  /**
   * Text of the snippet that the mutant replaces.
   */
  original: string

  /**
   * Id of the mutator that produced the mutant.
   */
  mutator: string

  /**
   * 1-based UTF-16 column where the mutant starts.
   */
  column: number

  /**
   * 1-based line where the mutant starts.
   */
  line: number
}

/**
 * Runs the whole pipeline with every built-in mutator over a snippet, as
 * `mootant list` would, and returns the mutants of one mutator. Cross-mutator
 * rules, the solitary rule, deduplication and ignore statuses apply as in a
 * real run. Fails when the snippet does not parse, when a mutator reports an
 * error, or when any mutant of the run does not parse once it is hosted.
 *
 * @param id - Id of the mutator whose mutants are returned.
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants of the mutator in canonical order.
 * @throws Error - When the mutator is unknown, the snippet does not parse, a
 *   mutator fails, or a hosted mutant does not parse.
 */
export function runMutator(
  id: string,
  source: string,
  setup: MutatorSetup = {},
): MutantSummary[] {
  if (!Object.hasOwn(corePlugin.mutators, id)) {
    throw new Error(`Unknown mutator "${id}".`)
  }
  let file = setup.file ?? 'example.ts'
  let mutants = generateMutants(source, setup)

  for (let mutant of mutants) {
    if (parseFile(file, applyMutant(source, mutant)).kind === 'failed') {
      throw new Error(
        `Mutant of ${mutant.mutator} does not parse when hosted: ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
      )
    }
  }

  let lineStarts = getLineStarts(source)
  return mutants
    .filter(mutant => mutant.mutator === id)
    .map(mutant => ({
      ...getSourcePosition(lineStarts, mutant.start),
      original: source.slice(mutant.start, mutant.end),
      replacement: mutant.replacement,
      mutator: mutant.mutator,
      status: mutant.status,
      reason: mutant.reason,
      scope: mutant.scope,
      kind: mutant.kind,
    }))
}
