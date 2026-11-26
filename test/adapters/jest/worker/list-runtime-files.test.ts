import { describe, expect, it } from 'vitest'

import { listRuntimeFiles } from '../../../../adapters/jest/worker/list-runtime-files'

describe('listRuntimeFiles', () => {
  it('lists the files in the file cache of a runtime of Jest 30', () => {
    expect(
      listRuntimeFiles({
        fileCache: {
          strings: new Map([
            ['/p/node_modules/a/index.js', ''],
            ['/p/test/a.test.js', ''],
          ]),
          buffers: new Map([['/p/node_modules/a/index.js', Buffer.from('')]]),
        },
      }),
    ).toStrictEqual(
      new Set(['/p/node_modules/a/index.js', '/p/test/a.test.js']),
    )
  })

  it('lists the files in the caches of a runtime of Jest 29.7', () => {
    expect(
      listRuntimeFiles({
        _cacheFSBuffer: new Map([['/p/node_modules/b.js', Buffer.from('')]]),
        _cacheFS: new Map([['/p/test/b.test.js', '']]),
      }),
    ).toStrictEqual(new Set(['/p/node_modules/b.js', '/p/test/b.test.js']))
  })

  it.each([
    ['a runtime that keeps its files otherwise', { fileCache: { files: [] } }],
    ['caches that are no maps', { fileCache: null, _cacheFS: {} }],
    ['keys that are no paths', { _cacheFS: new Map([[1, '']]) }],
    ['no runtime', null],
  ])('lists none for %s', (_name, runtime) => {
    expect(listRuntimeFiles(runtime)).toStrictEqual(new Set())
  })
})
