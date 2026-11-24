import { describe, expect, it } from 'vitest'

import type { DrySnapshot } from '../../../types/cache/dry-snapshot'

import { createSnapshotSession } from '../../../core/cache/create-snapshot-session'
import { createDryReuseMiss } from '../../../core/cache/create-dry-reuse-miss'

/**
 * Builds a saved dry run with the given session.
 *
 * @param session - Session of the saved run.
 * @returns The saved dry run.
 */
function createSnapshot(session: DrySnapshot['session']): DrySnapshot {
  return { testFiles: ['/p/a.test.ts'], session } as DrySnapshot
}

describe('createSnapshotSession', () => {
  it('tells what the saved session told', async () => {
    let inputs = { files: ['/p/vitest.config.ts'], settings: {} }
    let session = createSnapshotSession(
      createSnapshot({ version: '5.0.0', diagnostics: [], workers: 3, inputs }),
    )

    await expect(session.listTestFiles()).resolves.toStrictEqual([
      '/p/a.test.ts',
    ])
    await expect(session.cacheInputs!()).resolves.toBe(inputs)
    expect(session).toMatchObject({
      version: '5.0.0',
      diagnostics: [],
      workers: 3,
    })
    await expect(session.close()).resolves.toBeUndefined()
  })

  it('leaves out a version and workers the saved session did not tell', () => {
    let session = createSnapshotSession(
      createSnapshot({
        inputs: { settings: {}, files: [] },
        diagnostics: [],
        version: null,
        workers: null,
      }),
    )

    expect(Object.hasOwn(session, 'version')).toBe(false)
    expect(Object.hasOwn(session, 'workers')).toBe(false)
  })

  it('refuses to run anything', async () => {
    let session = createSnapshotSession(
      createSnapshot({
        inputs: { settings: {}, files: [] },
        diagnostics: [],
        version: null,
        workers: null,
      }),
    )

    let miss = createDryReuseMiss('some mutants have no cached verdict')

    await expect(session.runIsolated({ units: [] })).rejects.toThrow(miss)
    await expect(session.runBatch({ units: [] })).rejects.toThrow(miss)
    await expect(session.dryRun({} as never)).rejects.toThrow(miss)
  })
})
