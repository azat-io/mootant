import { describe, expect, it } from 'vitest'

import { parseBinaryPaths } from '../../../core/git/parse-binary-paths'

describe('parseBinaryPaths', () => {
  it('reads the new paths of binary files, renamed ones too', () => {
    expect(
      parseBinaryPaths(
        [
          '1\t1\tsrc/a.ts',
          '-\t-\tsrc/b\tin.ts',
          '-\t-\t',
          'old name.png',
          'new\tname.png',
          '2\t0\t',
          'src/old.ts',
          'src/new.ts',
          '',
        ].join('\0'),
      ),
    ).toStrictEqual(['src/b\tin.ts', 'new\tname.png'])
  })

  it('reads nothing from an empty diff', () => {
    expect(parseBinaryPaths('')).toStrictEqual([])
  })
})
