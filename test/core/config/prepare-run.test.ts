import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

import type { LoadedConfig } from '../../../core/config/load-config'
import type { Plugin } from '../../../types/config/plugin'

import { prepareRun } from '../../../core/config/prepare-run'
import { loadConfig } from '../../../core/config/load-config'

vi.mock(import('../../../core/config/load-config'), () => ({
  loadConfig: vi.fn(),
}))

/**
 * Directory of the configuration file of the tests.
 */
const ROOT = path.resolve('/project')

/**
 * Plugin with one mutator and one preset.
 */
const ACME: Plugin = {
  presets: {
    all: { mutators: { 'acme/zero': 'on' }, description: 'Everything.' },
  },
  mutators: { zero: { meta: { description: 'Zero.' }, create: () => ({}) } },
}

/**
 * Makes the run find a configuration file in the root. The configuration is
 * taken as the loader would return it, so a test can pass a plugin of the wrong
 * shape.
 *
 * @param config - Configuration of the file.
 */
function useConfig(config: object): void {
  let loaded: LoadedConfig = {
    file: path.join(ROOT, 'mootant.config.ts'),
    directory: ROOT,
    config,
  }
  vi.mocked(loadConfig).mockResolvedValue(loaded)
}

/**
 * Lists the ids of the active mutators of a run.
 *
 * @param setup - Prepared run.
 * @param setup.mutators - Active mutators.
 * @returns Mutator ids in rank order.
 */
function listIds(setup: { mutators: { id: string }[] }): string[] {
  return setup.mutators.map(mutator => mutator.id)
}

describe('prepareRun', () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockResolvedValue(null)
  })

  it('runs recommended from the working directory without a configuration', async () => {
    let setup = await prepareRun({ cwd: '/work' })

    expect(loadConfig).toHaveBeenCalledExactlyOnceWith(undefined, '/work')
    expect(setup).toMatchObject({
      settings: { coarseMutants: false, timeouts: false },
      preset: 'recommended',
      root: '/work',
      run: {},
    })
    expect(listIds(setup)).toContain('string-literal')
    expect(setup.knownMutatorIds.has('string-literal')).toBe(true)
  })

  it('passes --config to the loader and --preset to the run', async () => {
    let setup = await prepareRun({
      config: 'mootant.json',
      preset: 'strict',
      cwd: '/work',
    })

    expect(loadConfig).toHaveBeenCalledExactlyOnceWith('mootant.json', '/work')
    expect(setup).toMatchObject({
      settings: { coarseMutants: true },
      preset: 'strict',
    })
  })

  it('applies the presets, mutators and settings of the configuration', async () => {
    useConfig({
      mutators: { 'string-literal': 'off', 'acme/zero': 'on' },
      settings: { templates: false, timeouts: true },
      plugins: { acme: ACME },
      extends: ['strict'],
    })
    let setup = await prepareRun({ cwd: path.join(ROOT, 'src') })

    expect(setup).toMatchObject({
      settings: { coarseMutants: true, templates: false, timeouts: true },
      preset: 'strict',
      root: ROOT,
    })
    expect(listIds(setup)).not.toContain('string-literal')
    expect(listIds(setup).at(-1)).toBe('acme/zero')
    expect(setup.knownMutatorIds.has('acme/zero')).toBe(true)
  })

  it('returns the run settings of the configuration', async () => {
    useConfig({ run: { paths: ['src'], threshold: 80 } })

    let setup = await prepareRun({ cwd: ROOT })

    expect(setup.run).toStrictEqual({ paths: ['src'], threshold: 80 })
  })

  it('replaces the presets of the configuration with --preset', async () => {
    useConfig({
      mutators: { 'string-literal': 'off' },
      extends: ['recommended', 'acme/all'],
      plugins: { acme: ACME },
    })

    let configured = await prepareRun({ cwd: ROOT })
    let replaced = await prepareRun({ preset: 'strict', cwd: ROOT })

    expect(configured.preset).toBe('recommended, acme/all')
    expect(listIds(configured)).toContain('acme/zero')
    expect(replaced.preset).toBe('strict')
    expect(listIds(replaced)).not.toContain('acme/zero')
    expect(listIds(replaced)).not.toContain('string-literal')
  })

  it('checks the shape of the plugins of the configuration', async () => {
    useConfig({ plugins: { acme: { presets: {} } } })

    await expect(prepareRun({ cwd: ROOT })).rejects.toThrow(
      'Plugin "acme" is invalid: "mutators" must be an object.',
    )
  })

  it('reports an unknown preset of the configuration', async () => {
    useConfig({ extends: ['struct'] })

    await expect(prepareRun({ cwd: ROOT })).rejects.toThrow(
      'Unknown preset "struct". Did you mean "strict"?',
    )
  })

  it.each([
    [
      'sting-literal',
      'Unknown mutator "sting-literal" in mootant.config.ts. Did you mean "string-literal"?',
    ],
    ['acme/zero', 'Unknown mutator "acme/zero" in mootant.config.ts.'],
  ])('reports the unknown mutator %s', async (id, message) => {
    useConfig({ mutators: { [id]: 'off' } })

    await expect(prepareRun({ cwd: ROOT })).rejects.toThrow(message)
  })
})
