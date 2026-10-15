import type { MutatorSetting } from '../../types/mutator/mutator-setting'
import type { PresetSettings } from '../../types/config/preset-settings'
import type { FileMutants } from '../../types/mutant/file-mutants'

import { createMutatorRegistry } from '../../core/plugins/create-mutator-registry'
import { generateFileMutants } from '../../core/generate/generate-file-mutants'
import { resolvePreset } from '../../core/plugins/resolve-preset'
import { corePlugin } from '../../core/plugins/core-plugin'

/**
 * How a test run differs from the `recommended` preset on `example.ts`.
 */
export interface MutatorSetup {
  /**
   * Mutator settings over those of the preset, such as `'off'` or options.
   */
  mutators?: Record<string, MutatorSetting>

  /**
   * Preset settings over those of the preset, such as `timeouts`.
   */
  settings?: Partial<PresetSettings>

  /**
   * Id of the preset the run extends; `recommended` when omitted.
   */
  preset?: string

  /**
   * File name of the snippet, whose extension selects the language;
   * `example.ts` when omitted.
   */
  file?: string
}

/**
 * Id of the preset a test run resolves.
 */
const TEST_PRESET = 'test-run'

/**
 * Runs the whole pipeline with every built-in mutator over a snippet, as
 * `mootant list --skipped` would, and returns the mutants and the skipped
 * candidates of the run with their offsets, so a property test can apply and
 * execute each of them.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants and skipped candidates of the snippet in canonical order.
 * @throws Error - When the snippet does not parse or a mutator fails.
 */
export function generateCandidates(
  source: string,
  setup: MutatorSetup = {},
): Omit<FileMutants, 'absolute'> {
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
  return result
}
