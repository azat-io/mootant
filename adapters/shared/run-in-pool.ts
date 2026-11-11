/**
 * Job of a pool with its place in the order.
 */
interface PoolJob<Result> {
  /**
   * Runs the job.
   */
  run(): Promise<Result>

  /**
   * Position of the job in the order given.
   */
  index: number

  /**
   * Key no other job may run with at the same time.
   */
  key: string
}

/**
 * Runs jobs with at most `limit` at once, never two with the same key at once,
 * such as two units of one test file: each time a slot is free, the first
 * waiting jobs whose keys are free start, in the order given, so other keys
 * keep the pool busy while one key waits. After a job fails no other job
 * starts.
 *
 * @param jobs - Jobs in order, each with its key.
 * @param limit - Most jobs at once, at least 1.
 * @returns Results in the order of the jobs.
 * @throws {Error} The first error of a job, once the running jobs ended.
 */
export function runInPool<Result>(
  jobs: readonly { run(): Promise<Result>; key: string }[],
  limit: number,
): Promise<Result[]> {
  let results: Result[] = Array.from({ length: jobs.length })
  let waiting: PoolJob<Result>[] = jobs.map((job, index) => ({ ...job, index }))
  let busy = new Set<string>()
  let errors: Error[] = []
  let running = 0
  return new Promise((resolve, reject) => {
    /**
     * Starts the waiting jobs that may start, or settles once none runs.
     */
    function start(): void {
      for (let job of waiting) {
        if (running < limit && errors.length === 0 && !busy.has(job.key)) {
          waiting = waiting.filter(entry => entry !== job)
          busy.add(job.key)
          running += 1
          void run(job)
        }
      }
      if (running > 0) {
        return
      }
      if (errors.length > 0) {
        reject(errors[0]!)
      } else {
        resolve(results)
      }
    }
    /**
     * Runs one job, then starts what may start next.
     *
     * @param job - Job to run.
     * @returns Resolves when the job ended.
     */
    async function run(job: PoolJob<Result>): Promise<void> {
      try {
        results[job.index] = await job.run()
      } catch (error) {
        errors.push(error as Error)
      }
      busy.delete(job.key)
      running -= 1
      start()
    }
    start()
  })
}
