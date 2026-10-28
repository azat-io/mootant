import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

import { trackEnvironment } from '../../../adapters/shared/track-environment'
import { trackFileReads } from '../../../adapters/shared/track-file-reads'
import { trackInputs } from '../../../adapters/shared/track-inputs'

vi.mock(import('../../../adapters/shared/track-environment'), () => ({
  trackEnvironment: vi.fn(() => process.env),
}))

vi.mock(import('../../../adapters/shared/track-file-reads'), () => ({
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
    let options = { ignored: ['RUNNER_VARIABLE'] }
    let inputs = trackInputs(root, options)
    let receiver = vi.mocked(trackFileReads).mock.calls[0]![0]!
    let [received, record] = vi.mocked(trackEnvironment).mock.calls[0]!
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

    expect(received).toBe(options)
    expect(inputs.real).toBe(process.env)
    expect([...inputs.files]).toStrictEqual([
      file('b.json'),
      file('a.json'),
      root,
    ])
    expect(inputs.stop()).toStrictEqual({
      files: [root, file('a.json'), file('b.json')],
      modified: [root, file('a.json')],
      environment: ['A', 'B'],
    })
    expect(vi.mocked(trackFileReads)).toHaveBeenLastCalledWith(null)
    expect(vi.mocked(trackEnvironment)).toHaveBeenLastCalledWith(options, null)
  })
})
