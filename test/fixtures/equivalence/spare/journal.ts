import { appendFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Notes every setup of the environment, and whether Vitest had given the worker
 * its task by then.
 */
export default {
  setup() {
    let directory = process.env['SPARE_JOURNAL']
    if (directory) {
      appendFileSync(
        path.join(directory, 'environment.jsonl'),
        `${JSON.stringify({ task: process.env['VITEST_POOL_ID'] !== undefined })}\n`,
      )
    }
    return {
      teardown() {},
    }
  },
  viteEnvironment: 'ssr',
  name: 'journal',
}
