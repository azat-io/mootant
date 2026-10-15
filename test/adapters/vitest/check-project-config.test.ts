import type { TestProject } from 'vitest/node'

import { describe, expect, it } from 'vitest'

import { checkProjectConfig } from '../../../adapters/vitest/check-project-config'

/**
 * Creates a project with a supported configuration and the given changes.
 *
 * @param config - Settings to change.
 * @returns Fake project.
 */
function createProject(config: Record<string, unknown> = {}): TestProject {
  return {
    config: {
      browser: { enabled: false },
      experimental: {},
      pool: 'forks',
      ...config,
    },
    name: 'unit',
  } as never
}

describe('checkProjectConfig', () => {
  it('accepts the forks and threads pools', () => {
    expect(checkProjectConfig(createProject())).toBeNull()
    expect(checkProjectConfig(createProject({ pool: 'threads' }))).toBeNull()
  })

  it.each([
    [{ runner: './runner.ts' }, 'cannot use the custom runner ./runner.ts'],
    [{ browser: { enabled: true } }, 'enables browser mode'],
    [{ pool: 'vmThreads' }, 'uses the vmThreads pool'],
    [
      { experimental: { viteModuleRunner: false } },
      'experimental.viteModuleRunner: false in project "unit"',
    ],
  ])('rejects %o', (config, message) => {
    expect(checkProjectConfig(createProject(config))).toContain(message)
  })
})
