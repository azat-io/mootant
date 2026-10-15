import { describe, expect, it } from 'vitest'

import type { FakeWorld } from '../../helpers/create-fake-adapter'

import { classifyMutants } from '../../../core/run/classify-mutants'
import { createTestRun } from '../../helpers/create-test-run'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Project whose tests reach mutants in every way the classification tells
 * apart.
 */
const WORLD: FakeWorld = {
  tests: [
    {
      covers: ['batch', 'unrepeatable', 'static'],
      file: '/t/a.test.ts',
      firstOnly: ['first'],
      duration: 2,
      id: 'a1',
    },
    { file: '/t/a.test.ts', covers: ['batch'], duration: 1, id: 'a2' },
    {
      covers: ['unrepeatable'],
      file: '/t/b.test.ts',
      dry: 'flaky',
      id: 'b1',
    },
  ],
  files: [{ loadCovers: ['static'], file: '/t/b.test.ts' }],
}

/**
 * Ids of the mutants of the project.
 */
const IDS = ['static', 'unrepeatable', 'first', 'batch', 'none']

/**
 * Classifies the mutants of the project.
 *
 * @param settings - Whether the run is in fast mode and whether batch is
 *   available.
 * @param settings.fast - Whether the run is in fast mode.
 * @param settings.batch - Batch mode of the adapter.
 * @returns Routes by mutant id.
 */
async function classify(settings: {
  batch: boolean
  fast: boolean
}): Promise<ReturnType<typeof classifyMutants>> {
  let { state } = await createTestRun(WORLD, { mutants: IDS })
  return classifyMutants(
    IDS.map(id => createMutant({ start: 0, end: 1, id })),
    state.analysis,
    settings,
  )
}

describe('classifyMutants', () => {
  it('routes mutants by how the dry run reached them', async () => {
    let classes = await classify({ batch: true, fast: true })

    expect(Object.fromEntries(classes)).toStrictEqual({
      unrepeatable: {
        coveredBy: ['b1', 'a1'],
        reason: 'unrepeatable',
        path: 'isolated',
        static: false,
      },
      first: {
        reason: 'first-reach',
        coveredBy: ['a1'],
        path: 'isolated',
        static: false,
      },
      static: {
        coveredBy: ['a1'],
        path: 'isolated',
        reason: 'static',
        static: true,
      },
      batch: {
        coveredBy: ['a2', 'a1'],
        static: false,
        path: 'batch',
        reason: null,
      },
      none: { static: false, coveredBy: [], reason: null, path: null },
    })
  })

  it('isolates every covered mutant outside fast mode or without batch mode', async () => {
    let isolated = await classify({ batch: true, fast: false })
    let unbatched = await classify({ batch: false, fast: true })

    expect(Object.fromEntries(isolated)).toStrictEqual({
      unrepeatable: {
        coveredBy: ['b1', 'a1'],
        path: 'isolated',
        static: false,
        reason: null,
      },
      batch: {
        coveredBy: ['a2', 'a1'],
        path: 'isolated',
        static: false,
        reason: null,
      },
      static: {
        coveredBy: ['a1'],
        path: 'isolated',
        reason: 'static',
        static: true,
      },
      first: {
        coveredBy: ['a1'],
        path: 'isolated',
        static: false,
        reason: null,
      },
      none: { static: false, coveredBy: [], reason: null, path: null },
    })
    expect(unbatched.get('batch')).toMatchObject({
      reason: 'no-batch',
      path: 'isolated',
    })
    expect(unbatched.get('none')?.path).toBeNull()
  })
})
