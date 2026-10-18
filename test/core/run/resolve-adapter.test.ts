import { describe, expect, it, vi } from 'vitest'

import type {
  BuiltInAdapters,
  DetectionScore,
} from '../../../types/adapter/built-in-adapters'
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
 * @param answers - Detection answer of each built-in, by name, in detection
 *   order.
 * @returns Built-ins that load `ADAPTER` with the name of the built-in.
 */
function createBuiltIns(
  answers: Record<string, DetectionScore> | [string, DetectionScore][],
): BuiltInAdapters {
  return Object.fromEntries(
    (Array.isArray(answers) ? answers : Object.entries(answers)).map(
      ([name, answer]) => [
        name,
        {
          load: vi.fn(() => Promise.resolve({ ...ADAPTER, name })),
          detect: vi.fn(() => Promise.resolve(answer)),
        },
      ],
    ),
  )
}

describe('resolveAdapter', () => {
  it('uses the first built-in that detects its test runner', async () => {
    let builtIns = createBuiltIns({ first: false, second: true, third: 0 })

    await expect(
      resolveAdapter(undefined, '/project', builtIns),
    ).resolves.toMatchObject({
      adapter: { name: 'second' },
      note: null,
    })
    expect(builtIns['first']!.detect).toHaveBeenCalledWith('/project')
    expect(builtIns['third']!.load).not.toHaveBeenCalled()
  })

  it('prefers the test runner the scripts call to one only installed', async () => {
    let builtIns = createBuiltIns([
      ['installed', 1],
      ['called', 2],
      ['other', true],
    ])

    await expect(
      resolveAdapter(undefined, '/project', builtIns),
    ).resolves.toMatchObject({
      adapter: { name: 'called' },
      note: null,
    })
    expect(builtIns['installed']!.load).not.toHaveBeenCalled()
  })

  it('takes the first of equally likely test runners with a note', async () => {
    let builtIns = createBuiltIns([
      ['low', 1],
      ['first', 2],
      ['second', 2],
    ])

    await expect(
      resolveAdapter(undefined, '/project', builtIns),
    ).resolves.toMatchObject({
      note: 'Found several test runners (first, second) and used first; set run.runner to choose another.',
      adapter: { name: 'first' },
    })
    await expect(
      resolveAdapter(
        undefined,
        '/project',
        createBuiltIns({ one: true, two: 1 }),
      ),
    ).resolves.toMatchObject({
      note: 'Found several test runners (one, two) and used one; set run.runner to choose another.',
      adapter: { name: 'one' },
    })
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

    await expect(
      resolveAdapter(ADAPTER, '/project', builtIns),
    ).resolves.toStrictEqual({ adapter: ADAPTER, note: null })
    await expect(
      resolveAdapter({ ...ADAPTER, name: 'Bad' }, '/project', builtIns),
    ).rejects.toThrow('The test runner adapter "run.runner" is invalid')
    await expect(
      resolveAdapter('vitest', '/project', builtIns),
    ).resolves.toMatchObject({
      adapter: { name: 'vitest' },
      note: null,
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
