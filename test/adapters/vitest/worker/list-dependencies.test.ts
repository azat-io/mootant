import { describe, expect, it } from 'vitest'

import { listDependencies } from '../../../../adapters/vitest/worker/list-dependencies'

describe('listDependencies', () => {
  it('lists evaluated and required modules and snapshot files, sorted', () => {
    let workerState = {
      evaluatedModules: {
        idToModuleMap: new Map<string, unknown>([
          ['/p/test/a.test.ts', {}],
          ['/p/src/a.ts', {}],
        ]),
      },
    }

    expect(
      listDependencies(workerState, ['/p/test/edge.cjs'], {
        getSnapshotFiles: () => [
          '/p/test/__snapshots__/a.test.ts.snap',
          '/p/test/output.txt',
        ],
        snapshotPath: '/p/test/__snapshots__/a.test.ts.snap',
      }),
    ).toStrictEqual([
      '/p/src/a.ts',
      '/p/test/__snapshots__/a.test.ts.snap',
      '/p/test/a.test.ts',
      '/p/test/edge.cjs',
      '/p/test/output.txt',
    ])
    expect(listDependencies(workerState, [], undefined)).toStrictEqual([
      '/p/src/a.ts',
      '/p/test/a.test.ts',
    ])
  })
})
