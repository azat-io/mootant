import type { TestContext } from 'node:test'

import { isMainThread } from 'node:worker_threads'
import * as moduleApi from 'node:module'
import { beforeEach } from 'node:test'
import { realpathSync } from 'node:fs'
import path from 'node:path'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { installMarkerReceivers } from './install-marker-receivers'
import { createSourceSwitcher } from './create-source-switcher'
import { installModuleHooks } from './install-module-hooks'
import { createRecordWriter } from './create-record-writer'
import { createFileRecorder } from './create-file-recorder'
import { captureClock } from '../../shared/capture-clock'
import { trackInputs } from '../../shared/track-inputs'
import { createTryTracker } from './create-try-tracker'
import { readUnit } from './read-unit'

/**
 * Variables node:test reads on its own, which say nothing about the tests.
 */
const NODE_TEST_VARIABLES = ['NODE_TEST_CONTEXT', 'FORCE_COLOR']

/**
 * Preload of mootant's node:test processes, the first `--import` of a test
 * process, or its first `--require` when the project's flags require modules,
 * since Node runs every `--require` before any `--import`; it has no top-level
 * `await`, so `require()` can load it. In the process of a unit it captures the
 * clock, sets the mutant runtime up, installs the module hooks that switch
 * modules, starts recording what the code reads, takes the records of mootant's
 * reporter, passing its todo tests to the tracker, and registers a root
 * `beforeEach` hook that tracks tries and listeners for uncaught errors and the
 * exit. In any other process or thread that loads it, such as one the test code
 * forked, it does nothing.
 */
let time = Date.now()
let clock = captureClock()
let started = clock.now()
let unit = readUnit(process.env, isMainThread)
if (unit !== null) {
  let write = createRecordWriter(unit.out)
  let tracker = createTryTracker({
    runtime: installMutantRuntime(),
    now: clock.now,
    started,
    write,
    unit,
  })
  let main = realpathSync(process.argv[1]!)
  installMarkerReceivers({
    reported: (record, error) => {
      write(record)
      if (record.kind === 'todo') {
        tracker.todo(error)
      }
    },
    loaded: () => {
      tracker.loaded()
    },
    served: createFileRecorder(write, 'served'),
  })
  let name = `hooks${path.extname(import.meta.url)}`
  let hooks = installModuleHooks(moduleApi, {
    switcher: createSourceSwitcher({ plan: unit.plan, write, main }),
    data: { plan: unit.plan, out: unit.out, main },
    record: createFileRecorder(write, 'load'),
    prototype: moduleApi.Module.prototype,
    hooks: new URL(name, import.meta.url),
  })
  write({ node: process.version, pid: process.pid, kind: 'start', hooks, time })
  let inputs = trackInputs(unit.root, { ignored: NODE_TEST_VARIABLES })
  let require = moduleApi.createRequire(import.meta.url)
  beforeEach(context => {
    tracker.open(context as TestContext)
  })
  process.on('uncaughtExceptionMonitor', error => {
    tracker.error(error)
  })
  process.on('unhandledRejection', error => {
    tracker.error(error)
  })
  process.on('exit', code => {
    tracker.exit(code, {
      ...inputs.stop(),
      required: Object.keys(require.cache),
    })
  })
}
