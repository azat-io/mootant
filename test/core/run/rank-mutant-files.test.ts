import { describe, expect, it } from 'vitest'

import type { FakeWorld } from '../../helpers/create-fake-adapter'

import { rankMutantFiles } from '../../../core/run/rank-mutant-files'
import { createTestRun } from '../../helpers/create-test-run'

describe('rankMutantFiles', () => {
  it('lists files named after the module first, then by the tests that reach the mutant and by key, with files that reached it while loading', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/c.test.ts', covers: ['m1'], duration: 0, id: 'c1' },
          { file: '/t/d.test.ts', covers: ['m1'], duration: 1, id: 'd1' },
          { file: '/t/d.test.ts', covers: ['m1'], duration: 1, id: 'd2' },
          { file: '/t/b.test.ts', covers: ['m1'], duration: 9, id: 'b1' },
          { file: '/t/b.test.ts', covers: ['m1'], duration: 9, id: 'b2' },
          { file: '/test/a.test.ts', covers: ['m1'], duration: 9, id: 'a1' },
          { file: '/t/e.test.ts', id: 'e1' },
        ],
        files: [{ file: '/t/e.test.ts', loadCovers: ['m1'], loadDuration: 0 }],
      },
      { mutants: ['m1'] },
    )

    expect(rankMutantFiles(state, state.mutants.get('m1')!)).toStrictEqual([
      '/test/a.test.ts',
      '/t/b.test.ts',
      '/t/d.test.ts',
      '/t/c.test.ts',
      '/t/e.test.ts',
    ])
  })

  it('counts the tests that reach any mutant of the module for a static mutant, whatever mutants run', async () => {
    let plans = await Promise.all(
      [['m1'], ['m1', 'm3'], ['m1', 'm2', 'm3']].map(async mutants => {
        let { state } = await createTestRun(
          {
            tests: [
              { file: '/t/e.test.ts', covers: ['m2'], id: 'e1' },
              { file: '/t/f.test.ts', covers: ['m2'], id: 'f1' },
              { file: '/t/f.test.ts', covers: ['m3'], id: 'f2' },
              { file: '/t/g.test.ts', id: 'g1' },
            ],
            files: [
              { file: '/t/e.test.ts', loadCovers: ['m1'] },
              { file: '/t/f.test.ts', loadCovers: ['m1'] },
              { file: '/t/g.test.ts', loadCovers: ['m1'] },
            ],
          },
          { hosted: ['m1', 'm2', 'm3'], mutants },
        )
        return state.mutants.get('m1')!.ranked
      }),
    )

    expect(plans[0]).toStrictEqual([
      '/t/f.test.ts',
      '/t/e.test.ts',
      '/t/g.test.ts',
    ])
    expect(plans[1]).toStrictEqual(plans[0])
    expect(plans[2]).toStrictEqual(plans[0])
  })

  it('gives the same order whatever the durations of the dry run', async () => {
    let plans = await Promise.all(
      [1, 7].map(async scale => {
        let world: FakeWorld = {
          tests: [
            {
              file: '/t/b.test.ts',
              covers: ['m1', 'm2'],
              duration: 3,
              id: 'b1',
            },
            {
              file: '/t/c.test.ts',
              covers: ['m1', 'm2'],
              duration: 4,
              id: 'c1',
            },
            { file: '/t/d.test.ts', covers: ['m2'], duration: 5, id: 'd1' },
            { file: '/t/e.test.ts', covers: ['m2'], duration: 1, id: 'e1' },
          ].map(test => ({ ...test, duration: test.duration ** scale })),
          files: [
            { file: '/t/b.test.ts', loadDuration: scale, loadCovers: ['m3'] },
            { file: '/t/c.test.ts', loadCovers: ['m3'], loadDuration: 5 },
          ],
        }
        let { state } = await createTestRun(world, {
          mutants: ['m1', 'm2', 'm3'],
          isolate: true,
        })
        return [...state.mutants.values()].map(mutant => mutant.ranked)
      }),
    )

    expect(plans[0]).toStrictEqual([
      ['/t/b.test.ts', '/t/c.test.ts'],
      ['/t/b.test.ts', '/t/c.test.ts', '/t/d.test.ts', '/t/e.test.ts'],
      ['/t/b.test.ts', '/t/c.test.ts'],
    ])
    expect(plans[1]).toStrictEqual(plans[0])
  })
})
