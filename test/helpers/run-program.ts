import { Worker } from 'node:worker_threads'
import { transformWithOxc } from 'vite'

/**
 * Longest time one run may take, its async work included, before it counts as
 * hung and its worker is ended.
 */
const TIME_LIMIT = 1000

/**
 * Worker that runs programs, created on the first run and again after a run
 * hangs.
 */
let worker: Worker | null = null

/**
 * End of the last run asked for; runs go to the worker one at a time.
 */
let queue: Promise<unknown> = Promise.resolve()

/**
 * Runs a program that declares a function `f` on every input, the way the
 * catalog's differential run executes an idiom and each of its mutants (12.6).
 * TypeScript is stripped first. Each input runs in a fresh instance of the
 * program in a worker thread, so a run that hangs, even after an `await`, is
 * ended without stopping the tests; its output is `hung`. The output of an
 * input describes, with reference identity:
 *
 * - The arguments after the run, with the objects that existed before it marked,
 *   so changes to the inputs and replaced objects count.
 * - The events: calls of the recorder functions (`save`, `use`, `run` and the
 *   like) with their arguments, reads of the getters that `createReader` puts
 *   in an input, `settled` when a promise of `settle(label, value)` resolves
 *   one turn of the event loop later, `failed` when a promise of `fail(label)`
 *   rejects one turn of the event loop later with an error whose message is the
 *   label (it never counts as unhandled), and `returned` when the result of `f`
 *   is settled. The run waits for every `settle` and `fail` promise and the
 *   work they start, so a missing `await` changes the order and a late effect
 *   is seen.
 * - The awaited result of `f`, the message it threw, or `pending` when its
 *   promise never settles.
 *
 * Inputs reach the worker as messages, so each run gets its own copy, and two
 * equal values in one input stay one object only if they are one object here.
 *
 * @param source - Program text; it must declare a function `f`.
 * @param file - File name, whose extension selects the language.
 * @param inputs - Arguments of `f`, one list per input.
 * @returns Canonical text of the output on each input.
 */
export async function runProgram(
  source: string,
  file: string,
  inputs: unknown[][],
): Promise<string[]> {
  let { code } = await transformWithOxc(source, file)
  let previous = queue
  let runs = (async () => {
    await previous
    return runInputs(code, inputs)
  })()
  queue = runs
  return runs
}

/**
 * Runs a program on one input in the worker, and ends the worker when the run
 * takes longer than the time limit.
 *
 * @param code - Program text without types.
 * @param input - Arguments of `f`.
 * @returns Canonical text of the output, or `hung`.
 */
function runInput(code: string, input: unknown[]): Promise<string> {
  worker ??= createWorker()
  let current = worker
  return new Promise(resolve => {
    let timer = setTimeout(() => {
      current.removeAllListeners('message')
      void current.terminate()
      worker = null
      resolve('hung')
    }, TIME_LIMIT)
    current.once('message', (output: string) => {
      clearTimeout(timer)
      resolve(output)
    })
    current.postMessage({ input, code })
  })
}

/**
 * Runs a program on inputs one after another.
 *
 * @param code - Program text without types.
 * @param inputs - Arguments of `f`, one list per input.
 * @returns Canonical text of the output on each input.
 */
async function runInputs(code: string, inputs: unknown[][]): Promise<string[]> {
  let [input, ...rest] = inputs
  if (!input) {
    return []
  }
  let output = await runInput(code, input)
  return [output, ...(await runInputs(code, rest))]
}

/**
 * Starts a worker that runs programs; it does not keep the process alive.
 *
 * @returns Worker that takes one run at a time.
 */
function createWorker(): Worker {
  let created = new Worker(new URL('program-worker.ts', import.meta.url))
  created.unref()
  return created
}
