import { describe, expect, it } from 'vitest'

import { planIsolated } from '../../../core/run/plan-isolated'
import { createTestRun } from '../../helpers/create-test-run'

describe('planIsolated', () => {
  it('runs whole files and adds up the limits of all their tests', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', duration: 2, id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a2' },
          { file: '/t/a.test.ts', id: 'a3' },
        ],
        files: [{ file: '/t/a.test.ts', loadCovers: ['m2'], loadDuration: 10 }],
      },
      { mutants: ['m1', 'm2'], isolate: true },
    )

    expect(
      planIsolated(state, [
        {
          file: '/t/a.test.ts',
          confirming: false,
          retried: false,
          raised: false,
          mutant: 'm1',
        },
        {
          file: '/t/a.test.ts',
          confirming: true,
          retried: false,
          raised: false,
          mutant: 'm2',
        },
      ]),
    ).toStrictEqual({
      units: [
        {
          limits: { timeout: 280 + 256 + 253 + 253, hitLimit: 400_000 },
          file: '/t/a.test.ts',
          mutant: 'm1',
          project: '',
        },
        {
          limits: { timeout: 2 * (280 + 256 + 253 + 253), hitLimit: 400_000 },
          file: '/t/a.test.ts',
          mutant: 'm2',
          project: '',
        },
      ],
    })
  })

  it('gives a unit that confirms a hit-limit timeout factor × floor more evaluations', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }] },
      { mutants: ['m1'], isolate: true },
    )

    expect(
      planIsolated(state, [
        {
          file: '/t/a.test.ts',
          confirming: true,
          retried: false,
          mutant: 'm1',
          raised: true,
        },
      ]).units[0]!.limits,
    ).toStrictEqual({
      hitLimit: 200_000 + 100 * 100_000,
      timeout: 2 * (250 + 253),
    })
  })

  it('plans a file the dry run did not load or saw no tests of', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }] },
      { mutants: ['m1'], isolate: true },
    )
    state.analysis.loads.clear()

    expect(
      planIsolated(state, [
        {
          file: '/t/a.test.ts',
          confirming: false,
          retried: false,
          raised: false,
          mutant: 'm1',
        },
      ]).units[0]!.limits,
    ).toStrictEqual({ hitLimit: 200_000, timeout: 503 })

    state.analysis.fileTests.clear()

    expect(
      planIsolated(state, [
        {
          file: '/t/a.test.ts',
          confirming: false,
          retried: false,
          raised: false,
          mutant: 'm1',
        },
      ]).units[0]!.limits,
    ).toStrictEqual({ hitLimit: 100_000, timeout: 250 })
  })
})
