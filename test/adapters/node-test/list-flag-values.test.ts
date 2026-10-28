import { describe, expect, it } from 'vitest'

import { listFlagValues } from '../../../adapters/node-test/list-flag-values'
import { LOADER_FLAGS } from '../../../adapters/node-test/loader-flags'

describe('listFlagValues', () => {
  it('lists the values of the flags in both forms', () => {
    expect(
      listFlagValues(
        [
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
        ],
        LOADER_FLAGS,
      ),
    ).toStrictEqual(['tsx', './a.cjs', './b.cjs', 'data:x=y', 'ts-node/esm'])
    expect(
      listFlagValues(
        ['--env-file=a=b', '--import', 'x', '--env-file', 'c', '--env-file'],
        new Set(['--env-file']),
      ),
    ).toStrictEqual(['a=b', 'c'])
  })
})
