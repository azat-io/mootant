import { describe, expect, it, vi } from 'vitest'

import type { BuiltInAdapters } from '../../../types/adapter/built-in-adapters'
import type { TestAdapter } from '../../../types/adapter/test-adapter'

import { resolveAdapter } from '../../../core/run/resolve-adapter'

/**
 * Adapter returned by built-ins.
 */
const ADAPTER: TestAdapter = {
  start: () => Promise.reject(new Error('not started')),
  name: 'first',
  batch: true,
}

/**
 * Creates built-in adapters whose detection gives the given answers.
 *
 * @param answers - Detection answer of each built-in, by name.
 * @returns Built-ins that load `ADAPTER` with the name of the built-in.
 */
function createBuiltIns(answers: Record<string, boolean>): BuiltInAdapters {
  return Object.fromEntries(
    Object.entries(answers).map(([name, answer]) => [
      name,
      {
        load: vi.fn(() => Promise.resolve({ ...ADAPTER, name })),
        detect: vi.fn(() => Promise.resolve(answer)),
      },
    ]),
  )
}

describe('resolveAdapter', () => {
  it('uses the first built-in that detects its test runner', async () => {
    let builtIns = createBuiltIns({ first: false, second: true, third: true })

    await expect(
      resolveAdapter(undefined, '/project', builtIns),
    ).resolves.toMatchObject({
      name: 'second',
    })
    expect(builtIns['first']!.detect).toHaveBeenCalledWith('/project')
    expect(builtIns['third']!.load).not.toHaveBeenCalled()
  })

  it('fails when no built-in detects its test runner', async () => {
    await expect(
      resolveAdapter(
        undefined,
        '/project',
        createBuiltIns({ one: false, two: false }),
      ),
    ).rejects.toThrow(
      'No supported test runner found in /project. Install one (one, two) or set run.runner in the configuration.',
    )
  })

  it('checks an adapter object and loads a built-in by name', async () => {
    let builtIns = createBuiltIns({ vitest: false })

    await expect(resolveAdapter(ADAPTER, '/project', builtIns)).resolves.toBe(
      ADAPTER,
    )
    await expect(
      resolveAdapter({ ...ADAPTER, name: 'Bad' }, '/project', builtIns),
    ).rejects.toThrow('The test runner adapter "run.runner" is invalid')
    await expect(
      resolveAdapter('vitest', '/project', builtIns),
    ).resolves.toMatchObject({
      name: 'vitest',
    })
  })

  it('rejects a name that is not built in instead of importing it', async () => {
    let builtIns = createBuiltIns({ vitest: false })

    await expect(
      resolveAdapter('mootant-adapter-jest', '/project', builtIns),
    ).rejects.toThrow(
      'Unknown test runner "mootant-adapter-jest" in run.runner: use a built-in name (vitest) or import an adapter object in the configuration.',
    )
    expect(builtIns['vitest']!.load).not.toHaveBeenCalled()
  })
})
