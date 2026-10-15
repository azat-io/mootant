import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readWorkerPlan } from '../../../../adapters/vitest/worker/read-worker-plan'

/**
 * Name of the test file in the work directory.
 */
const HASH = '0123456789abcdef'

describe('readWorkerPlan', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-plan-'))
    await mkdir(path.join(directory, 'plan'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads the plan of a test file', async () => {
    let plan = { indexes: [3], units: [] }
    await writeFile(
      path.join(directory, 'plan', `${HASH}.json`),
      JSON.stringify(plan),
    )

    expect(readWorkerPlan(directory, HASH)).toStrictEqual(plan)
  })

  it('returns null when nothing is planned for the file', () => {
    expect(readWorkerPlan(directory, HASH)).toBeNull()
  })

  it('throws when the plan cannot be read', async () => {
    await mkdir(path.join(directory, 'plan', `${HASH}.json`))

    expect(() => readWorkerPlan(directory, HASH)).toThrow('EISDIR')
  })
})
