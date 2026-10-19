import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ProcessWatch } from '../../../adapters/node-test/types/process-watch'

import { runTestProcess } from '../../../adapters/node-test/run-test-process'

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Runs a script of Node in a test process with an empty out file passed in
 * `OUT`.
 *
 * @param script - ES module code.
 * @param deadline - Deadline of the watchdog.
 * @param onOutput - Receiver of the output, if any.
 * @returns What the process left behind.
 */
async function run(
  script: string,
  deadline: (watch: ProcessWatch) => number = () => Infinity,
  onOutput?: (text: string) => void,
): ReturnType<typeof runTestProcess> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-process-'))
  let out = path.join(directory, 'out.jsonl')
  await writeFile(out, '')
  return runTestProcess({
    ...(onOutput !== undefined && { onOutput }),
    args: ['--input-type=module', '-e', script],
    env: { ...process.env, OUT: out },
    node: process.execPath,
    cwd: directory,
    deadline,
    out,
  })
}

describe('runTestProcess', () => {
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('collects records and output and the exit', async () => {
    let output: string[] = []
    let watches: ProcessWatch[] = []
    let outcome = await run(
      String.raw`import { appendFileSync } from 'node:fs'
      appendFileSync(process.env.OUT, '{"kind":"loaded"}\nnot json\n')
      await new Promise(resolve => setTimeout(resolve, 150))
      appendFileSync(process.env.OUT, '{"kind":"close","seq":0}\n{"kind":')
      console.log('out')
      console.error('err')
      process.exitCode = 3`,
      watch => {
        watches.push(structuredClone(watch))
        return Infinity
      },
      text => {
        output.push(text)
      },
    )

    expect(outcome).toMatchObject({
      records: [{ kind: 'loaded' }, { kind: 'close', seq: 0 }],
      signal: null,
      hung: false,
      code: 3,
    })
    expect(output.join('').split('\n').toSorted()).toStrictEqual([
      '',
      'err',
      'out',
    ])
    expect(watches.some(watch => watch.records.length === 1)).toBe(true)
    expect(watches.at(-1)!.last).toBeGreaterThanOrEqual(outcome.spawned)
  })

  it('stops the process group past the deadline', async () => {
    let started = Date.now()
    let outcome = await run(
      `import { spawn } from 'node:child_process'
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' })
      setInterval(() => {}, 1000)`,
      watch => watch.spawned + 200,
    )

    expect(outcome).toMatchObject({
      signal: 'SIGKILL',
      records: [],
      code: null,
      hung: true,
    })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('leaves a detached process that holds the output behind', async () => {
    let started = Date.now()
    let outcome = await run(
      `import { spawn } from 'node:child_process'
      spawn('sleep', ['5'], { detached: true, stdio: 'inherit' }).unref()`,
      watch => watch.spawned + 3000,
      () => {},
    )

    expect(outcome).toMatchObject({ signal: null, hung: false, code: 0 })
    expect(Date.now() - started).toBeLessThan(4500)
  })

  it('drops the output without a receiver', async () => {
    await expect(run('console.log("dropped")')).resolves.toMatchObject({
      code: 0,
    })
  })

  it('rejects when the process cannot start', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-process-'))
    let out = path.join(directory, 'out.jsonl')
    await writeFile(out, '')

    await expect(
      runTestProcess({
        node: path.join(directory, 'missing-node'),
        deadline: () => Infinity,
        env: process.env,
        cwd: directory,
        args: [],
        out,
      }),
    ).rejects.toThrow(/ENOENT/u)
  })
})
