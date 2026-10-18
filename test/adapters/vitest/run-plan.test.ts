import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { VitestSessionState } from '../../../adapters/vitest/types/vitest-session-state'
import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'
import type { IsolatedUnit } from '../../../types/adapter/isolated-plan'

import { watchHeartbeats } from '../../../adapters/vitest/watch-heartbeats'
import { getFileHash } from '../../../adapters/vitest/worker/get-file-hash'
import { stopHungWorker } from '../../../adapters/vitest/stop-hung-worker'
import { runPlan } from '../../../adapters/vitest/run-plan'

vi.mock(import('../../../adapters/vitest/watch-heartbeats'), () => ({
  watchHeartbeats: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/stop-hung-worker'), () => ({
  stopHungWorker: vi.fn(),
}))

/**
 * Builds a heartbeat of a unit.
 *
 * @param unit - Index of the unit.
 * @returns Heartbeat.
 */
function createBeat(unit: number): VitestHeartbeat {
  return {
    file: '/a.test.ts',
    name: 'suite > t',
    pid: 10 + unit,
    sequence: 1,
    mutant: 'm',
    budget: 1,
    test: 't',
    unit,
  }
}

describe('runPlan', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-run-plan-'))
    vi.mocked(stopHungWorker).mockImplementation(pid =>
      Promise.resolve(pid === 11),
    )
    vi.mocked(watchHeartbeats).mockImplementation((_directory, onHung) => {
      let reactions = Promise.all([
        onHung(createBeat(1)),
        onHung(createBeat(2)),
      ])
      return {
        stop: async () => {
          await reactions
        },
      }
    })
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('runs one specification per unit and collects what they left', async () => {
    let created: string[] = []
    let configs = [{ maxWorkers: 4 }, { maxWorkers: 1 }]
    let seen: number[] = []
    let hash = getFileHash('/a.test.ts', 'a')
    let other = getFileHash('/b.test.ts', '')
    let spawns = new Map([[1, 1]])
    let onUnitEnd = vi.fn()
    let handle = {
      vitest: {
        runTestSpecifications: async () => {
          seen.push(...configs.map(config => config.maxWorkers), spawns.size)
          await writeFile(path.join(directory, 'claim', `${hash}-0`), '12')
          await writeFile(
            path.join(directory, 'out', `${hash}-0.jsonl`),
            '{"kind":"late","message":"x","mutant":null,"test":"t"}\n',
          )
          await writeFile(path.join(directory, 'claim', `${other}-0`), '13')
          await writeFile(path.join(directory, 'done', `${other}-0`), '')
          return { unhandledErrors: [new Error('worker died')] }
        },
        getProjectByName: (name: string) => ({
          createSpecification: (file: string) => {
            created.push(`${name} ${file}`)
            return { moduleId: file }
          },
        }),
        projects: configs.map(config => ({ config })),
        provide: vi.fn(),
      },
      context: { workDirectory: directory, onUnitEnd },
      state: { spawns } as Partial<VitestSessionState>,
    } as never
    let limits = { hitLimit: 1, timeout: 1 }
    let units: IsolatedUnit[] = [
      { file: '/a.test.ts', project: 'a', mutant: 'a', limits },
      { file: '/b.test.ts', project: '', mutant: 'b', limits },
      { file: '/a.test.ts', project: 'b', mutant: 'c', limits },
    ]

    await expect(
      runPlan(handle, { mode: 'isolated', concurrency: 2, units }),
    ).resolves.toStrictEqual({
      units: [
        {
          records: [{ message: 'x', kind: 'late', mutant: null, test: 't' }],
          claimed: true,
          hung: null,
          pid: 12,
        },
        { hung: createBeat(1), claimed: true, records: [], pid: 13 },
        { claimed: false, records: [], hung: null, pid: null },
      ],
      error: 'worker died',
    })
    expect(created).toStrictEqual([
      'a /a.test.ts',
      ' /b.test.ts',
      'b /a.test.ts',
    ])
    expect(seen).toStrictEqual([2, 1, 0])
    // The unit marked done counts as it ends; the claimed unit without a
    // mark counts once the run is over.
    expect(onUnitEnd).toHaveBeenCalledTimes(2)
    expect(configs).toStrictEqual([{ maxWorkers: 4 }, { maxWorkers: 1 }])
  })

  it('stops the watchdog when the run fails', async () => {
    let stop = vi.fn(() => Promise.resolve())
    vi.mocked(watchHeartbeats).mockReturnValue({ stop })
    let handle = {
      vitest: {
        runTestSpecifications: () => Promise.reject(new Error('broken')),
        provide: vi.fn(),
        projects: [],
      },
      context: { workDirectory: directory },
      state: { spawns: new Map() },
    } as never

    await expect(runPlan(handle, { mode: 'batch', units: [] })).rejects.toThrow(
      'broken',
    )
    expect(stop).toHaveBeenCalledExactlyOnceWith()
  })
})
