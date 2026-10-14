import type { MutatorSetup } from './generate-mutants'

import { createMutatorRegistry } from '../../core/plugins/create-mutator-registry'
import { generateFileMutants } from '../../core/generate/generate-file-mutants'
import { resolvePreset } from '../../core/plugins/resolve-preset'
import { corePlugin } from '../../core/plugins/core-plugin'

/**
 * Id of the preset a test run resolves.
 */
const TEST_PRESET = 'test-run'

/**
 * Runs the whole pipeline with every built-in mutator over a snippet, as
 * `mootant list --skipped` would, and describes the skipped candidates of one
 * mutator as `original -> replacement (category rule)`.
 *
 * @param id - Id of the mutator whose skipped candidates are returned.
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Skipped candidates of the mutator in canonical order.
 * @throws Error - When the snippet does not parse or a mutator fails.
 */
export function listSkipped(
  id: string,
  source: string,
  setup: MutatorSetup = {},
): string[] {
  let registry = createMutatorRegistry(corePlugin, {})
  registry.presets.set(TEST_PRESET, {
    extends: [setup.preset ?? 'recommended'],
    description: 'Preset of one test run.',
    mutators: setup.mutators ?? {},
    settings: setup.settings ?? {},
  })
  let { mutators, settings } = resolvePreset(registry, TEST_PRESET)
  let result = generateFileMutants({
    knownMutatorIds: new Set(registry.mutators.keys()),
    file: setup.file ?? 'example.ts',
    skipped: true,
    settings,
    mutators,
    source,
  })
  let errors = result.diagnostics.filter(
    diagnostic => diagnostic.severity === 'error',
  )
  if (errors.length > 0) {
    throw new Error(errors.map(diagnostic => diagnostic.message).join('\n'))
  }
  return result.skipped
    .filter(candidate => candidate.mutator === id)
    .map(
      candidate =>
        `${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.category} ${candidate.rule})`,
    )
}
