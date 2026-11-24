import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ProcessWatch } from '../../../adapters/node-test/types/process-watch'

import { startTestProcess } from '../../../adapters/node-test/start-test-process'
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
 * @param options - Deadline of the watchdog, receiver of the output and unit
 *   for file descriptor 3, if any.
 * @param options.deadline - Deadline of the watchdog; none by default.
 * @param options.onOutput - Receiver of the output.
 * @param options.unit - Unit to send on file descriptor 3.
 * @returns What the process left behind.
 */
async function run(
  script: string,
  options: {
    deadline?(watch: ProcessWatch): number
    onOutput?(text: string): void
    unit?: string
  } = {},
): ReturnType<typeof runTestProcess> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-process-'))
  let out = path.join(directory, 'out.jsonl')
  await writeFile(out, '')
  let { deadline = () => Infinity, ...extra } = options
  return runTestProcess({
    ...extra,
    args: ['--input-type=module', '-e', script],
    env: { ...process.env, OUT: out },
    node: process.execPath,
    groups: new Set(),
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
      {
        deadline: watch => {
          watches.push(structuredClone(watch))
          return Infinity
        },
        onOutput: text => {
          output.push(text)
        },
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
      { deadline: watch => watch.spawned + 200 },
    )

    expect(outcome).toMatchObject({
      signal: 'SIGKILL',
      lingering: true,
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
      { deadline: watch => watch.spawned + 3000, onOutput: () => {} },
    )

    expect(outcome).toMatchObject({ signal: null, hung: false, code: 0 })
    expect(Date.now() - started).toBeLessThan(4500)
  })

  it('holds its group in the set of its session while it runs, and not after', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-process-'))
    let out = path.join(directory, 'out.jsonl')
    await writeFile(out, '')
    let groups = new Set<number>()
    let running = runTestProcess({
      args: [
        '--input-type=module',
        '-e',
        'await new Promise(resolve => setTimeout(resolve, 300))',
      ],
      deadline: () => Infinity,
      node: process.execPath,
      env: process.env,
      cwd: directory,
      groups,
      out,
    })

    expect(groups.size).toBe(1)

    await running

    expect(groups.size).toBe(0)
  })

  it('sends a new process its unit on file descriptor 3, and runs a spare process instead of a new one', async () => {
    let script = String.raw`import { appendFileSync, readFileSync } from 'node:fs'
      appendFileSync(process.env.OUT, JSON.stringify({ kind: readFileSync(3, 'utf8').trim() }) + '\n')`

    await expect(run(script, { unit: 'fresh' })).resolves.toMatchObject({
      records: [{ kind: 'fresh' }],
      lingering: false,
    })

    let out = path.join(directory, 'spare.jsonl')
    await writeFile(out, '')
    let groups = new Set<number>()
    let spare = startTestProcess({
      args: ['--input-type=module', '-e', script],
      env: { ...process.env, OUT: out },
      node: process.execPath,
      output: 'ignore',
      cwd: directory,
      pipe: true,
      groups,
    })
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
    let handout = Date.now()
    let outcome = await runTestProcess({
      deadline: () => Infinity,
      node: '/never/started',
      env: process.env,
      cwd: directory,
      unit: 'spare',
      args: [],
      groups,
      spare,
      out,
    })

    expect(outcome).toMatchObject({ records: [{ kind: 'spare' }], code: 0 })
    expect(outcome.spawned).toBeGreaterThanOrEqual(handout)
    expect(groups.size).toBe(0)
  })

  it('tells when a process of its group outlived it, and stops it', async () => {
    let started = Date.now()
    let outcome = await run(
      `import { spawn } from 'node:child_process'
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }).unref()`,
    )

    expect(outcome).toMatchObject({ lingering: true, hung: false, code: 0 })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('takes no harm when a process ends before it read its unit', async () => {
    await expect(
      run('process.exit(0)', { unit: 'x'.repeat(4_000_000) }),
    ).resolves.toMatchObject({ records: [], code: 0 })
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
        groups: new Set(),
        env: process.env,
        cwd: directory,
        unit: 'never',
        args: [],
        out,
      }),
    ).rejects.toThrow(/ENOENT/u)
  })
})
