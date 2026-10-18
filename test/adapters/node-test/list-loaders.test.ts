import { describe, expect, it } from 'vitest'

import { listLoaders } from '../../../adapters/node-test/list-loaders'

describe('listLoaders', () => {
  it('lists the modules of loading flags in both forms', () => {
    expect(
      listLoaders([
        '--import',
        'tsx',
        '--require=./a.cjs',
        '-r',
        './b.cjs',
        '--loader=data:x=y',
        '--experimental-loader',
        'ts-node/esm',
        '--test-only',
        '--import',
      ]),
    ).toStrictEqual(['tsx', './a.cjs', './b.cjs', 'data:x=y', 'ts-node/esm'])
  })
})
