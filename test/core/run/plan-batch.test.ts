import { describe, expect, it } from 'vitest'

import { createTestRun } from '../../helpers/create-test-run'
import { planBatch } from '../../../core/run/plan-batch'

describe('planBatch', () => {
  it('groups tries by file and test in file order with their limits', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/b.test.ts', covers: ['m3'], id: 'b1' },
          { file: '/t/a.test.ts', covers: ['m1'], duration: 2, id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1', 'm2'], duration: 4, id: 'a2' },
        ],
        files: [{ file: '/t/a.test.ts', loadDuration: 10, loadCovers: [] }],
      },
      { mutants: ['m1', 'm2', 'm3'] },
    )

    expect(
      planBatch(
        state,
        [
          { mutant: 'm1', test: 'a2' },
          { mutant: 'm2', test: 'a2' },
          { mutant: 'm3', test: 'b1' },
          { mutant: 'm1', test: 'a1' },
          { mutant: 'm1', test: 'a1' },
        ],
        1,
      ),
    ).toStrictEqual({
      units: [
        {
          tests: [
            { hitLimit: 100_000, mutants: ['m1'], timeout: 256, id: 'a1' },
            {
              mutants: ['m1', 'm2'],
              hitLimit: 100_000,
              timeout: 262,
              id: 'a2',
            },
          ],
          limits: {
            load: { hitLimit: 100_000, timeout: 280 },
            total: 280 + 256 * 3 + 262 * 5,
          },
          file: '/t/a.test.ts',
          project: '',
        },
        {
          tests: [
            { hitLimit: 100_000, mutants: ['m3'], timeout: 253, id: 'b1' },
          ],
          limits: { load: { hitLimit: 100_000, timeout: 250 }, total: 1009 },
          file: '/t/b.test.ts',
          project: '',
        },
      ],
      concurrency: 1,
    })
  })

  it('runs unplanned tests before the last planned one and doubles bounds', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a2' },
          { file: '/t/a.test.ts', id: 'a3' },
        ],
      },
      { mutants: ['m1'] },
    )
    state.analysis.loads.delete('/t/a.test.ts')

    expect(planBatch(state, [{ mutant: 'm1', test: 'a2' }], 2)).toStrictEqual({
      units: [
        {
          limits: {
            load: { hitLimit: 100_000, timeout: 500 },
            total: 500 + 506 + 506 * 3,
          },
          tests: [
            { hitLimit: 100_000, mutants: ['m1'], timeout: 506, id: 'a2' },
          ],
          file: '/t/a.test.ts',
          project: '',
        },
      ],
      concurrency: 1,
    })
  })

  it('plans one unit per test file however much work it has', async () => {
    let ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', duration: 10, covers: ids, id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], duration: 10, id: 'a2' },
          { file: '/t/b.test.ts', covers: ['m1'], id: 'b1' },
        ],
      },
      { mutants: ids, workers: 4 },
    )

    let plan = planBatch(
      state,
      [
        ...ids.map(mutant => ({ test: 'a1', mutant })),
        { mutant: 'm1', test: 'a2' },
        { mutant: 'm1', test: 'b1' },
      ],
      1,
    )

    expect(
      plan.units.map(unit => [
        unit.file,
        unit.tests.map(test => [test.id, test.mutants]),
        unit.limits.total,
      ]),
    ).toStrictEqual([
      [
        '/t/a.test.ts',
        [
          ['a1', ids],
          ['a2', ['m1']],
        ],
        250 + 280 * 13 + 280 * 3,
      ],
      ['/t/b.test.ts', [['b1', ['m1']]], 250 + 253 * 3],
    ])
  })

  it('halves the workers of a run that confirms timeouts', async () => {
    let ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', duration: 10, covers: ids, id: 'a1' },
          { file: '/t/b.test.ts', covers: ['m1'], id: 'b1' },
        ],
      },
      { mutants: ids, workers: 5 },
    )
    let tries = [
      ...ids.map(mutant => ({ test: 'a1', mutant })),
      { mutant: 'm1', test: 'b1' },
    ]

    expect(planBatch(state, tries, 1)).toMatchObject({ concurrency: 5 })
    expect(planBatch(state, tries, 2)).toMatchObject({ concurrency: 2 })
    expect(planBatch(state, tries, 2).units).toHaveLength(2)
  })

  it('plans a test file in the project of its tests with its suite hooks', async () => {
    let { state } = await createTestRun(
      {
        onDry: result => ({
          ...result,
          files: result.files.map(file => ({
            ...file,
            hookDuration: 20,
            project: 'unit',
          })),
          tests: result.tests.map(test => ({ ...test, project: 'unit' })),
        }),
        tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }],
      },
      { mutants: ['m1'] },
    )

    expect(planBatch(state, [{ mutant: 'm1', test: 'a1' }], 1)).toStrictEqual({
      units: [
        {
          limits: {
            load: { hitLimit: 100_000, timeout: 310 },
            total: 310 + 253 * 3,
          },
          tests: [
            { hitLimit: 100_000, mutants: ['m1'], timeout: 253, id: 'a1' },
          ],
          file: '/t/a.test.ts',
          project: 'unit',
        },
      ],
      concurrency: 1,
    })
  })
})
