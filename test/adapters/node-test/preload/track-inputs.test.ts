import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

import { trackInputs } from '../../../../adapters/node-test/preload/track-inputs'
import { trackEnvironment } from '../../../../adapters/shared/track-environment'
import { trackFileReads } from '../../../../adapters/shared/track-file-reads'

vi.mock(import('../../../../adapters/shared/track-environment'), () => ({
  trackEnvironment: vi.fn(() => process.env),
}))

vi.mock(import('../../../../adapters/shared/track-file-reads'), () => ({
  trackFileReads: vi.fn<(receiver: unknown) => void>(),
}))

/**
 * Gives the path of a file in the project root.
 *
 * @param name - Path relative to the root.
 * @returns Absolute path.
 */
function file(name: string): string {
  return path.join(path.resolve('/project'), name)
}

describe('trackInputs', () => {
  it('records project files, changed files and variables until it stops', () => {
    let root = path.resolve('/project')
    let stop = trackInputs(root)
    let receiver = vi.mocked(trackFileReads).mock.calls[0]![0]!
    let [options, record] = vi.mocked(trackEnvironment).mock.calls[0]!
    receiver.read(file('b.json'))
    receiver.read(file('a.json'))
    receiver.read(root)
    receiver.read(path.resolve('/other/c.json'))
    receiver.read(file('node_modules/x/index.js'))
    receiver.write(file('a.json'))
    receiver.write(file('out/new.txt'))
    receiver.read(file('out/new.txt'))
    record!('B')
    record!('A')

    expect(options).toStrictEqual({
      ignored: ['NODE_TEST_CONTEXT', 'FORCE_COLOR'],
    })
    expect(stop()).toStrictEqual({
      files: [root, file('a.json'), file('b.json')],
      modified: [root, file('a.json')],
      environment: ['A', 'B'],
    })
    expect(vi.mocked(trackFileReads)).toHaveBeenLastCalledWith(null)
    expect(vi.mocked(trackEnvironment)).toHaveBeenLastCalledWith(options, null)
  })
})
