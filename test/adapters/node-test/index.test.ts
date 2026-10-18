import { describe, expect, it, vi } from 'vitest'

import { startNodeTestSession } from '../../../adapters/node-test/start-node-test-session'
import { nodeTestAdapter } from '../../../adapters/node-test/index'
import { version } from '../../../package.json'

vi.mock(import('../../../adapters/node-test/start-node-test-session'), () => ({
  startNodeTestSession: vi.fn(),
}))

describe('nodeTestAdapter', () => {
  it('creates the node-test adapter without batch mode', async () => {
    let adapter = nodeTestAdapter({ command: 'bnt' })
    let context = {
      workDirectory: '/w',
      concurrency: null,
      files: [],
      root: '/',
    }
    await adapter.start(context)

    expect(adapter).toMatchObject({ name: 'node-test', batch: false, version })
    expect(startNodeTestSession).toHaveBeenCalledWith(context, {
      command: 'bnt',
    })

    await nodeTestAdapter().start(context)

    expect(vi.mocked(startNodeTestSession).mock.calls[1]![1]).toStrictEqual({})
  })
})
