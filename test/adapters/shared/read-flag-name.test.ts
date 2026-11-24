import { describe, expect, it } from 'vitest'

import { readFlagName } from '../../../adapters/shared/read-flag-name'

describe('readFlagName', () => {
  it('reads the name before the value, with underscores after the dashes as dashes', () => {
    expect(readFlagName('--import')).toBe('--import')
    expect(readFlagName('-r')).toBe('-r')
    expect(readFlagName('--experimental_loader=./my_hooks.mjs')).toBe(
      '--experimental-loader',
    )
    expect(readFlagName('--cpu_prof_dir=my_dir=x_y')).toBe('--cpu-prof-dir')
    expect(readFlagName('__import')).toBe('__import')
  })
})
