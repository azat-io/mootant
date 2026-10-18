import { describe, expect, it } from 'vitest'

import { runInPool } from '../../../adapters/node-test/run-in-pool'

/**
 * Job that records in a log when it starts and ends.
 *
 * @param log - Events of the pool, appended to.
 * @param job - Name and key of the job, and an error it throws, if any.
 * @param job.name - Text it returns and logs.
 * @param job.key - Key no other job may run with at once.
 * @param job.error - Error it throws after its wait, if any.
 * @returns Job for the pool.
 */
function createJob(
  log: string[],
  job: { error?: Error; name: string; key: string },
): { run(): Promise<string>; key: string } {
  return {
    run: async () => {
      log.push(`start ${job.name}`)
      await new Promise(resolve => {
        setTimeout(resolve, 10)
      })
      log.push(`end ${job.name}`)
      if (job.error !== undefined) {
        throw job.error
      }
      return job.name
    },
    key: job.key,
  }
}

describe('runInPool', () => {
  it('runs jobs in order with a limit, never two of one key at once', async () => {
    let log: string[] = []

    await expect(
      runInPool(
        [
          createJob(log, { name: 'a1', key: 'a' }),
          createJob(log, { name: 'a2', key: 'a' }),
          createJob(log, { name: 'b1', key: 'b' }),
          createJob(log, { name: 'c1', key: 'c' }),
        ],
        2,
      ),
    ).resolves.toStrictEqual(['a1', 'a2', 'b1', 'c1'])
    expect(log.slice(0, 2)).toStrictEqual(['start a1', 'start b1'])
    expect(log.indexOf('start a2')).toBeGreaterThan(log.indexOf('end a1'))
  })

  it('resolves without jobs', async () => {
    await expect(runInPool([], 3)).resolves.toStrictEqual([])
  })

  it('starts nothing after a failure and rejects once the running jobs end', async () => {
    let log: string[] = []
    let error = new Error('broken')

    await expect(
      runInPool(
        [
          createJob(log, { name: 'a', key: 'a', error }),
          createJob(log, { name: 'b', key: 'b' }),
          createJob(log, { name: 'c', key: 'c' }),
        ],
        2,
      ),
    ).rejects.toBe(error)
    expect(log).not.toContain('start c')
    expect(log).toContain('end b')
  })
})
