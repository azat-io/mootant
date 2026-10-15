import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { getFileHash } from '../../../adapters/vitest/worker/get-file-hash'
import { writePlanFiles } from '../../../adapters/vitest/write-plan-files'

describe('writePlanFiles', () => {
  it('writes one plan per test file and project with the plan indexes', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-plans-'))
    await mkdir(path.join(directory, 'plan'))
    let limits = { hitLimit: 1, timeout: 1 }
    let units = [
      { file: '/a.test.ts', mutant: 'm1', tests: null, project: '', limits },
      { file: '/b.test.ts', mutant: 'm2', tests: null, project: '', limits },
      { file: '/a.test.ts', tests: ['t'], mutant: 'm3', project: '', limits },
      { file: '/a.test.ts', mutant: 'm4', project: 'b', tests: null, limits },
    ]
    let a = getFileHash('/a.test.ts', '')
    let b = getFileHash('/b.test.ts', '')
    let ab = getFileHash('/a.test.ts', 'b')

    await expect(writePlanFiles(directory, units)).resolves.toStrictEqual([
      `${a}-0`,
      `${b}-0`,
      `${a}-1`,
      `${ab}-0`,
    ])
    expect(
      JSON.parse(
        await readFile(path.join(directory, 'plan', `${a}.json`), 'utf8'),
      ),
    ).toStrictEqual({ units: [units[0], units[2]], indexes: [0, 2] })

    await rm(directory, { recursive: true })
  })
})
