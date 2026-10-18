import { describe, expect, it } from 'vitest'

import { readNodeRuntime } from '../../../adapters/node-test/read-node-runtime'

describe('readNodeRuntime', () => {
  it('reads the version and type stripping of a binary', async () => {
    await expect(readNodeRuntime(process.execPath)).resolves.toStrictEqual({
      typescript: typeof process.features.typescript === 'string',
      version: process.version,
    })
  })

  it('rejects for a binary that cannot run', async () => {
    await expect(readNodeRuntime('/missing/node')).rejects.toThrow(
      /^mootant cannot run Node at \/missing\/node: /u,
    )
  })
})
