import { describe, expect, it } from 'vitest'

import { formatCommand } from '../../../cli/report/format-command'

describe('formatCommand', () => {
  it('prints the paths and the options that change the command', () => {
    expect(
      formatCommand('run', {
        mutantIds: ['3f2a', 'b9c0'],
        config: 'mootant.config.ts',
        paths: ['src', 'lib'],
        preset: 'strict',
        concurrency: 2,
        since: 'main',
        threshold: 80,
        fast: true,
      }),
    ).toBe(
      'mootant run src lib --config mootant.config.ts --preset strict --since main --fast --threshold 80 --concurrency 2 --mutant 3f2a --mutant b9c0',
    )
    expect(formatCommand('run', { incremental: true, paths: ['src'] })).toBe(
      'mootant run src --incremental',
    )
    expect(formatCommand('run', { incremental: false, paths: [] })).toBe(
      'mootant run --no-incremental',
    )
    expect(formatCommand('run', { fast: false, paths: [] })).toBe(
      'mootant run --no-fast',
    )
    expect(formatCommand('list', { paths: ['src'], skipped: true })).toBe(
      'mootant list src --skipped',
    )
    expect(formatCommand('list', { paths: ['src'], skipped: false })).toBe(
      'mootant list src',
    )
  })

  it('quotes arguments a shell would split or read', () => {
    expect(
      formatCommand('list', { paths: ["my src/it's.ts", '@scope/a-b_c.ts'] }),
    ).toBe(String.raw`mootant list 'my src/it'\''s.ts' @scope/a-b_c.ts`)
  })
})
