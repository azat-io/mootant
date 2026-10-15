import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { getRunnerPath } from '../../../adapters/vitest/get-runner-path'

describe('getRunnerPath', () => {
  it('finds the source runner next to the adapter', () => {
    expect(getRunnerPath()).toBe(
      path.resolve(import.meta.dirname, '../../../adapters/vitest/runner.ts'),
    )
  })

  it('prefers the built runner', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-dist-'))
    await writeFile(path.join(directory, 'runner.js'), '')

    expect(getRunnerPath(directory)).toBe(path.join(directory, 'runner.js'))

    await rm(directory, { recursive: true })
  })
})
