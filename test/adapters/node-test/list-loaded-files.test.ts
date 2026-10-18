import { describe, expect, it } from 'vitest'

import type { NodeTestEnd } from '../../../adapters/node-test/types/node-test-record'

import { listLoadedFiles } from '../../../adapters/node-test/list-loaded-files'

describe('listLoadedFiles', () => {
  it('lists the files of load records and of the require cache', () => {
    expect(
      listLoadedFiles([
        { file: '/a.js', kind: 'load' },
        { kind: 'served', file: '/s.js' },
        { required: ['/b.cjs', '/a.js'], kind: 'end' } as NodeTestEnd,
      ]),
    ).toStrictEqual(new Set(['/b.cjs', '/a.js']))
  })
})
