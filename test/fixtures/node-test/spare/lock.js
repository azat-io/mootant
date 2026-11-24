import { appendFileSync, closeSync, openSync, rmSync } from 'node:fs'
import path from 'node:path'

// Holds a lock file while the process runs code of the project, as a test of a
// fixed resource would. Two processes that run code of this test file at once,
// or a spare process that ran it before its unit, find the lock taken.
let directory = process.env.SPARE_JOURNAL

if (directory) {
  let lock = path.join(directory, 'lock')
  try {
    closeSync(openSync(lock, 'wx'))
    process.on('exit', () => {
      rmSync(lock, { force: true })
    })
  } catch (error) {
    appendFileSync(path.join(directory, 'contended'), `${error.code}\n`)
  }
}
