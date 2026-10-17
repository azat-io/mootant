import { describe, expect, it, vi } from 'vitest'

import type { VitestHandle } from '../../../adapters/vitest/types/vitest-session-state'

import { collectDependencies } from '../../../adapters/vitest/collect-dependencies'
import { readUnitInputs } from '../../../adapters/vitest/read-unit-inputs'

vi.mock(import('../../../adapters/vitest/collect-dependencies'), () => ({
  collectDependencies: vi.fn(({ reported }: { reported?: string[] | null }) =>
    Promise.resolve(reported === null ? null : ['/p/a.test.ts']),
  ),
}))

describe('readUnitInputs', () => {
  it('collects the dependencies of a unit in its project', async () => {
    let project = { name: 'web' }
    let getProjectByName = vi.fn(() => project)
    let handle: VitestHandle = { vitest: { getProjectByName } } as never
    let tsconfigs = new Map<string, string[]>()

    await expect(
      readUnitInputs(
        handle,
        { file: '/p/a.test.ts', project: 'web', tsconfigs },
        { dependencies: ['/p/src/a.ts?v=1'], environment: ['MODE'] },
      ),
    ).resolves.toStrictEqual({
      dependencies: ['/p/a.test.ts'],
      environment: ['MODE'],
    })
    expect(getProjectByName).toHaveBeenCalledWith('web')
    expect(collectDependencies).toHaveBeenCalledWith({
      reported: ['/p/src/a.ts?v=1'],
      file: '/p/a.test.ts',
      tsconfigs,
      project,
    })
    await expect(
      readUnitInputs(
        handle,
        { file: '/p/a.test.ts', project: 'web', tsconfigs },
        undefined,
      ),
    ).resolves.toBeNull()
    await expect(
      readUnitInputs(
        handle,
        { file: '/p/a.test.ts', project: 'web', tsconfigs },
        { dependencies: null, environment: [] },
      ),
    ).resolves.toBeNull()
  })
})
