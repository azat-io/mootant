import { describe, expect, it } from 'vitest'

import { listFileHashes } from '../../../core/cache/list-file-hashes'

describe('listFileHashes', () => {
  it('lists each file once by path in code unit order', () => {
    let hashes = new Map([
      ['/p/a.ts', 'a'],
      ['/p/B.ts', 'b'],
    ])

    expect(
      listFileHashes(['/p/a.ts', '/p/B.ts', '/p/a.ts'], { root: '/p', hashes }),
    ).toStrictEqual([
      ['B.ts', 'b'],
      ['a.ts', 'a'],
    ])
  })

  it('gives null for a file hashed as missing or not hashed', () => {
    let hashes = new Map([['/p/a.ts', null]])

    expect(
      listFileHashes(['/p/b.ts', '/p/a.ts'], { root: '/p', hashes }),
    ).toStrictEqual([
      ['a.ts', null],
      ['b.ts', null],
    ])
  })
})
