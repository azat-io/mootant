import { describe, expect, it } from 'vitest'

import { routeIsolated } from '../../../core/run/route-isolated'
import { createTestRun } from '../../helpers/create-test-run'

describe('routeIsolated', () => {
  it('lists the test files of one rank cheapest first and keeps an earlier reason', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/b.test.ts', covers: ['m1'], duration: 1, id: 'b1' },
          { file: '/t/c.test.ts', covers: ['m1'], duration: 1, id: 'c1' },
          { file: '/t/d.test.ts', covers: ['m1'], duration: 5, id: 'd1' },
        ],
        files: [{ file: '/t/c.test.ts', loadDuration: 2 }],
      },
      { mutants: ['m1'] },
    )
    state.analysis.loads.delete('/t/b.test.ts')
    state.analysis.fileTests.delete('/t/b.test.ts')
    let mutant = state.mutants.get('m1')!
    mutant.confirm.push({ cause: 'time-limit', test: 'b1' })

    routeIsolated(state, 'm1', 'doubtful')
    routeIsolated(state, 'm1', 'recovery')

    expect(mutant).toMatchObject({
      files: ['/t/b.test.ts', '/t/c.test.ts', '/t/d.test.ts'],
      isolatedBecause: 'doubtful',
      path: 'isolated',
      confirm: [],
      queue: [],
    })
  })

  it('costs a file by all its tests and drops batch passes', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/d.test.ts', covers: ['m1'], duration: 1, id: 'd1' },
          { file: '/t/d.test.ts', duration: 10, id: 'd2' },
          { file: '/t/b.test.ts', covers: ['m1'], duration: 5, id: 'b1' },
        ],
      },
      { mutants: ['m1'] },
    )
    let mutant = state.mutants.get('m1')!
    mutant.survived = true

    routeIsolated(state, 'm1', 'batch-survivor')

    expect(mutant).toMatchObject({
      files: ['/t/b.test.ts', '/t/d.test.ts'],
      isolatedBecause: 'batch-survivor',
      survived: false,
    })
  })

  it('adds the files that reached a static mutant while loading', async () => {
    let { state } = await createTestRun(
      {
        files: [
          { file: '/t/b.test.ts', loadCovers: ['m1'], loadDuration: 1 },
          { file: '/t/a.test.ts', loadCovers: ['m1'], loadDuration: 1 },
        ],
        tests: [
          { file: '/t/b.test.ts', id: 'b1' },
          { file: '/t/a.test.ts', id: 'a1' },
        ],
      },
      { mutants: ['m1'] },
    )

    expect(state.mutants.get('m1')).toMatchObject({
      files: ['/t/a.test.ts', '/t/b.test.ts'],
      isolatedBecause: 'static',
      static: true,
    })
  })

  it('lists test files named after the module first, then direct importers', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/cheap.test.ts', covers: ['m1'], duration: 0, id: 't1' },
          { file: '/t/imports.test.ts', covers: ['m1'], duration: 1, id: 't2' },
          { file: '/other/a.test.ts', covers: ['m1'], duration: 2, id: 't3' },
          { file: '/src/a.test.ts', covers: ['m1'], duration: 9, id: 't4' },
          { file: '/test/a.spec.ts', covers: ['m1'], duration: 8, id: 't5' },
        ],
      },
      { mutants: ['m1'] },
    )
    let mutant = state.mutants.get('m1')!
    mutant.path = 'batch'
    state.imports = new Map([['/t/imports.test.ts', ['/src/a.js']]])

    routeIsolated(state, 'm1', 'batch-survivor')

    expect(mutant.files).toStrictEqual([
      '/test/a.spec.ts',
      '/src/a.test.ts',
      '/t/imports.test.ts',
      '/other/a.test.ts',
      '/t/cheap.test.ts',
    ])
    expect(mutant.ranked).toStrictEqual(mutant.files)
  })
})
