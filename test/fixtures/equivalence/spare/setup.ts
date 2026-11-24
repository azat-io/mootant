import { appendFileSync } from 'node:fs'
import path from 'node:path'

// Notes every load of the setup file, and whether Vitest had given the worker
// its task by then.
let directory = process.env['SPARE_JOURNAL']

if (directory) {
  appendFileSync(
    path.join(directory, 'setup.jsonl'),
    `${JSON.stringify({ task: process.env['VITEST_POOL_ID'] !== undefined })}\n`,
  )
}
