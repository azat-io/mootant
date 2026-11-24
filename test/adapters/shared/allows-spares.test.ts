import { describe, expect, it } from 'vitest'

import { allowsSpares } from '../../../adapters/shared/allows-spares'

describe('allowsSpares', () => {
  it('allows flags that neither load code from a file first nor watch the process', () => {
    expect(allowsSpares([])).toBe(true)
    expect(
      allowsSpares([
        '--import',
        './setup.mjs',
        '--max-old-space-size=500',
        '--conditions',
        'node',
        '--title',
        'env-file',
      ]),
    ).toBe(true)
  })

  it('rules out files of flags or code, watchers and time limits, with or without a value, in either spelling', () => {
    for (let flag of [
      '--experimental-default-config-file',
      '--experimental-config-file=node.config.json',
      '--env-file-if-exists=.env',
      '--process-timeout=30s',
      '--process_timeout=30s',
      '--snapshot_blob',
      '--snapshot-blob',
      '--heap_prof',
      '--config-file',
      '--env-file',
      '--diagnostic-dir=/tmp',
      '--heap-prof',
      '--cpu-prof-dir=/tmp',
      '--inspect-brk=9229',
      '--cpu_prof',
      '--inspect',
      '--prof',
    ]) {
      expect(allowsSpares(['--no-warnings', flag])).toBe(false)
    }
  })
})
