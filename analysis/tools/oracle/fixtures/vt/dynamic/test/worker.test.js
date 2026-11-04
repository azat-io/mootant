import { Worker } from 'node:worker_threads'
import { expect, test } from 'vitest'

test('worker thread adds', async () => {
  let worker = new Worker(new URL('../src/worker.js', import.meta.url), {
    workerData: { a: 20, b: 22 },
  })
  let result = await new Promise((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
  })
  expect(result).toBe(42)
})
