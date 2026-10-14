import { parentPort } from 'node:worker_threads'
import { runInThisContext } from 'node:vm'

import { describeValue } from './describe-value.ts'
import { listObjects } from './list-objects.ts'

/**
 * One instance of a program, ready to call `f`.
 */
interface ProgramInstance {
  /**
   * Calls `f` with the arguments of one input.
   */
  call(values: unknown[]): unknown

  /**
   * Number of `settle` and `fail` promises not yet settled.
   */
  state: { pending: number }

  /**
   * Events of the run in the order they happened.
   */
  events: unknown[][]
}

/**
 * Run that the main thread asks for: a program and the arguments of `f`.
 */
interface ProgramJob {
  /**
   * Arguments of `f`, a fresh copy made by the message.
   */
  input: unknown[]

  /**
   * Program text without types; it declares a function `f`.
   */
  code: string
}

/**
 * Functions a program may call to record an effect; each call is an event of
 * the run.
 */
const RECORDERS = [
  'emit',
  'go',
  'grant',
  'notify',
  'persist',
  'reject',
  'render',
  'run',
  'save',
  'show',
  'stop',
  'track',
  'use',
]

/**
 * Text that defines the recorders, `settle` and `fail` around a program and
 * returns an instance of it.
 */
const PRELUDE = [
  'let events = []',
  'let state = { pending: 0 }',
  ...RECORDERS.map(
    name =>
      `function ${name}(...values) { events.push([${JSON.stringify(name)}, ...values]) }`,
  ),
  'function settle(label, value) {',
  '  state.pending++',
  '  return new Promise(resolve => setImmediate(() => {',
  '    state.pending--',
  "    events.push(['settled', label])",
  '    resolve(value)',
  '  }))',
  '}',
  'function fail(label) {',
  '  state.pending++',
  '  let promise = new Promise((resolve, reject) => setImmediate(() => {',
  '    state.pending--',
  "    events.push(['failed', label])",
  '    reject(new Error(label))',
  '  }))',
  '  promise.catch(() => {})',
  '  return promise',
  '}',
].join('\n')

/**
 * Key of the marker that `createReader` puts in an input.
 */
const READER_KEY = '__reader'

/**
 * Events of the run in progress, where errors that escape the program go.
 */
let currentEvents: unknown[][] = []

/**
 * Factory of the last program, so the inputs of one program compile it once.
 */
let cached: { create(): ProgramInstance; code: string } | null = null

process.on('uncaughtException', error => {
  currentEvents.push(['uncaught', getMessage(error)])
})
process.on('unhandledRejection', error => {
  currentEvents.push(['unhandled', getMessage(error)])
})
parentPort!.on('message', (job: ProgramJob) => {
  void runJob(job).then(output => {
    parentPort!.postMessage(output)
  })
})

/**
 * Runs a fresh instance of a program on one input and describes what it
 * observed: the arguments after the run, marked with the objects that existed
 * before it, the events, and the result, the thrown message or `pending`. The
 * run waits until every `settle` and `fail` promise has settled and the work
 * they started is done; the main thread ends a run that never finishes.
 *
 * @param job - Program and arguments.
 * @returns Canonical text of the arguments, the events and the result.
 */
async function runJob(job: ProgramJob): Promise<string> {
  if (cached?.code !== job.code) {
    cached = {
      create: runInThisContext(
        `() => {\n${PRELUDE}\n${job.code}\nreturn { events, state, call: values => f(...values) }\n}`,
      ) as () => ProgramInstance,
      code: job.code,
    }
  }
  let program = cached.create()
  let { events, state } = program
  currentEvents = events
  let values = materialize(job.input, events) as unknown[]
  let before = listObjects({ arguments: values })
  let outcome: { result: Record<string, unknown> | null } = { result: null }

  /**
   * Keeps the first outcome of `f` and marks the moment it settled.
   *
   * @param result - Value or thrown message.
   */
  function finish(result: Record<string, unknown>): void {
    if (outcome.result === null) {
      outcome.result = result
      events.push(['returned'])
    }
  }

  void (async () => {
    try {
      finish({ value: await program.call(values) })
    } catch (error) {
      finish({ thrown: getMessage(error) })
    }
  })()
  await drain(state)
  return describeValue(
    {
      result: outcome.result ?? { pending: true },
      arguments: values,
      events,
    },
    before,
  )
}

/**
 * Replaces the reader markers of an input with objects whose properties are
 * getters that record each read as a `read` event.
 *
 * @param value - Part of the input.
 * @param events - Events of the run.
 * @returns The part with its markers replaced.
 */
function materialize(value: unknown, events: unknown[][]): unknown {
  if (Array.isArray(value)) {
    for (let [index, item] of value.entries()) {
      value[index] = materialize(item, events)
    }
    return value
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return value
  }
  let record = value as Record<string, unknown>
  if (Object.hasOwn(record, READER_KEY)) {
    let reader = {}
    let properties = Object.entries(
      record[READER_KEY] as Record<string, unknown>,
    )
    for (let [key, item] of properties) {
      let content = materialize(item, events)
      Object.defineProperty(reader, key, {
        get: () => {
          events.push(['read', key])
          return content
        },
        enumerable: true,
      })
    }
    return reader
  }
  for (let [key, item] of Object.entries(record)) {
    record[key] = materialize(item, events)
  }
  return record
}

/**
 * Waits until no `settle` or `fail` promise is pending for two turns of the
 * event loop in a row, so the work their continuations start is seen too.
 *
 * @param state - Pending count of the program.
 * @param quiet - Turns in a row already seen without pending promises.
 */
async function drain(state: { pending: number }, quiet = 0): Promise<void> {
  await new Promise(resolve => {
    setImmediate(resolve)
  })
  let next = state.pending === 0 ? quiet + 1 : 0
  if (next < 2) {
    await drain(state, next)
  }
}

/**
 * Reads the message of a thrown value.
 *
 * @param error - Thrown value.
 * @returns Message of an error, or the value as text.
 */
function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
