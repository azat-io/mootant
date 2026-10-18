import { writeFile, readFile, mkdtemp, cp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Mutant } from '../../types/mutant/mutant'

import { applyMutant } from './apply-mutant'

/**
 * Settings of the reference run.
 */
interface NodeTestReferenceOptions {
  /**
   * Lists the test files that can reach a source file, relative to the root.
   *
   * @param file - Source file of a mutant, relative to the root.
   * @returns Test files the run of that mutant passes to `node`.
   */
  testFiles(file: string): string[]

  /**
   * Milliseconds a run may take before it counts as `Timeout`.
   */
  timeout: number

  /**
   * Arguments after `node` and before the test files, such as `['--test']`.
   */
  args: string[]

  /**
   * Node binary that runs the tests.
   */
  node: string
}

/**
 * Verdicts of the reference run.
 */
interface NodeTestReference {
  /**
   * `killed`, `survived` or `Timeout` by mutant id.
   */
  verdicts: Map<string, string>

  /**
   * Whether the copy without a mutant passed.
   */
  original: boolean
}

/**
 * Runs a project's tests as `node --test` does, once per mutant applied by hand
 * to a copy of the project, two copies at a time. A mutant's run passes only
 * the test files that can reach its file, which keeps the reference fast; the
 * run without a mutant passes the test files of all mutants.
 *
 * @param root - Root of the project.
 * @param mutants - Mutants to apply one at a time.
 * @param options - Node binary, its arguments, the test files of a mutant and
 *   the time limit of a run.
 * @returns Whether the untouched copy passed, and a verdict per mutant.
 */
export async function runNodeTestReference(
  root: string,
  mutants: Mutant[],
  options: NodeTestReferenceOptions,
): Promise<NodeTestReference> {
  let copies = await Promise.all(
    [0, 1].map(async () => {
      let copy = await mkdtemp(path.join(tmpdir(), 'mootant-node-test-'))
      await cp(root, copy, { recursive: true })
      return copy
    }),
  )
  try {
    let files = new Set(
      mutants.flatMap(mutant => options.testFiles(mutant.file)),
    )
    let original =
      (await runTests(copies[0]!, options.node, {
        args: [...options.args, ...files],
        timeout: options.timeout,
      })) === 'survived'
    let verdicts = new Map<string, string>()
    let queue = [...mutants]

    /**
     * Runs the next mutants of the queue in one copy, one after another.
     *
     * @param copy - Root of the copy.
     */
    async function drain(copy: string): Promise<void> {
      let mutant = queue.shift()
      if (!mutant) {
        return
      }
      let file = path.join(copy, mutant.file)
      let text = await readFile(file, 'utf8')
      await writeFile(file, applyMutant(text, mutant))
      verdicts.set(
        mutant.id,
        await runTests(copy, options.node, {
          args: [...options.args, ...options.testFiles(mutant.file)],
          timeout: options.timeout,
        }),
      )
      await writeFile(file, text)
      await drain(copy)
    }

    await Promise.all(copies.map(drain))
    return { verdicts, original }
  } finally {
    await Promise.all(
      copies.map(copy => rm(copy, { recursive: true, force: true })),
    )
  }
}

/**
 * Runs the tests of a copy and stops the whole process group at the time limit.
 *
 * @param copy - Root of the copy.
 * @param node - Node binary that runs the tests.
 * @param options - Arguments of Node and the time limit of the run.
 * @param options.args - Arguments after `node`.
 * @param options.timeout - Milliseconds the run may take.
 * @returns `survived` when the run passed, `killed` when it failed, `Timeout`
 *   when it did not end in time.
 */
function runTests(
  copy: string,
  node: string,
  options: { timeout: number; args: string[] },
): Promise<string> {
  let environment = { ...process.env }
  delete environment['NODE_TEST_CONTEXT']
  delete environment['NODE_OPTIONS']
  let child = spawn(node, options.args, {
    env: environment,
    stdio: 'ignore',
    detached: true,
    cwd: copy,
  })
  return new Promise(resolve => {
    let timer = setTimeout(() => {
      process.kill(-child.pid!, 'SIGKILL')
      resolve('Timeout')
    }, options.timeout)
    child.on('exit', code => {
      clearTimeout(timer)
      resolve(code === 0 ? 'survived' : 'killed')
    })
  })
}
