import type { ChildProcess } from 'node:child_process'

import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import * as moduleApi from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildNodeTestPreload } from '../helpers/build-node-test-preload'
import { listMutants } from '../../core/list-mutants'

/**
 * Polls of the processes, 250 ms apart, in which a process must have run to
 * count as the unit the mutant hangs.
 */
const HUNG_POLLS = 8

/**
 * Fixtures of the tests: a Vitest and a node:test project whose mutant makes a
 * test loop forever outside the mutated files, a Vitest project whose global
 * setup never ends, and the entry that runs the command line from the sources,
 * which needs `module.registerHooks`.
 */
let fixtures = path.resolve(import.meta.dirname, '../fixtures/interrupt')

/**
 * Command line of a test, running on a fixture.
 */
interface Running {
  /**
   * How the process ended, once it did.
   */
  end: { signal: NodeJS.Signals | null; code: number | null } | null

  /**
   * What the command line wrote.
   */
  output: { stdout: string; stderr: string }

  /**
   * Polls in a row in which each process the command line started ran, by
   * process id; a process stays once seen.
   */
  seen: Map<number, number>

  /**
   * Process of the command line.
   */
  child: ChildProcess

  /**
   * Private temporary directory of the command line.
   */
  temporary: string
}

/**
 * Command lines of the current test.
 */
let runs: Running[] = []

/**
 * Starts the command line on a fixture with the mutant that hangs its test.
 *
 * @param runner - Fixture, named after its test runner.
 * @param preload - Absolute path of the built node:test preload.
 * @returns The running command line.
 */
async function start(runner: string, preload: string): Promise<Running> {
  let cwd = path.join(fixtures, runner)
  let { files } = await listMutants({ paths: ['src'], cwd })
  let [mutant, ...others] = files
    .flatMap(file => file.mutants)
    .filter(entry => entry.replacement === 'false')
  expect(others).toStrictEqual([])
  let temporary = await mkdtemp(path.join(tmpdir(), 'mootant-interrupt-'))
  let child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(fixtures, 'cli.js'),
      'run',
      'src',
      '--mutant',
      mutant!.id,
    ],
    {
      env: createEnvironment(temporary, preload),
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    },
  )
  let run: Running = {
    output: { stdout: '', stderr: '' },
    seen: new Map(),
    end: null,
    temporary,
    child,
  }
  runs.push(run)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (text: string) => {
    run.output.stdout += text
  })
  child.stderr.on('data', (text: string) => {
    run.output.stderr += text
  })
  child.once('exit', (code, signal) => {
    run.end = { signal, code }
  })
  return run
}

/**
 * Looks at the processes the command line started, directly or not, and counts
 * for each the polls in a row in which it ran.
 *
 * @param run - Command line to look at.
 * @returns The command line.
 */
function look(run: Running): Running {
  let rows = listProcesses()
  let below = new Set([run.child.pid!])
  for (let size = 0; size !== below.size;) {
    ;({ size } = below)
    for (let row of rows) {
      if (below.has(row.ppid)) {
        below.add(row.pid)
      }
    }
  }
  for (let row of rows) {
    if (below.has(row.pid) && row.pid !== run.child.pid) {
      let polls = row.stat.startsWith('R') ? (run.seen.get(row.pid) ?? 0) : -1
      run.seen.set(row.pid, polls + 1)
    }
  }
  return run
}

/**
 * Waits until the unit of the hanging mutant runs: past the dry run, a process
 * the command line started runs in every poll for two seconds.
 *
 * @param run - Command line to watch.
 * @returns Resolves once the unit hangs.
 */
async function waitForHungUnit(run: Running): Promise<void> {
  await expect
    .poll(() => look(run).output.stderr, { timeout: 60_000, interval: 250 })
    .toContain('dry run')
  run.seen = new Map([...run.seen.keys()].map(pid => [pid, 0]))
  await expect
    .poll(() => Math.max(0, ...look(run).seen.values()), {
      timeout: 30_000,
      interval: 250,
    })
    .toBeGreaterThanOrEqual(HUNG_POLLS)
}

/**
 * Lists every process of the system with its parent and state.
 *
 * @returns Id, parent id and state of each process.
 */
function listProcesses(): { stat: string; ppid: number; pid: number }[] {
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,stat='], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map(line => {
      let [pid, ppid, stat] = line.trim().split(/\s+/u, 3)
      return { ppid: Number(ppid), pid: Number(pid), stat: stat! }
    })
}

/**
 * Builds the environment of the command line: that of this process without what
 * Vitest sets for its workers, with a private temporary directory, the built
 * node:test preload and the cache of tsx off, since it would write into the
 * temporary directory.
 *
 * @param temporary - Private temporary directory.
 * @param preload - Absolute path of the built preload.
 * @returns Variables of the command line.
 */
function createEnvironment(
  temporary: string,
  preload: string,
): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !/^(?:NODE_OPTIONS$|TEST$|VITEST)/u.test(name),
      ),
    ),
    MOOTANT_TEST_PRELOAD: preload,
    TSX_DISABLE_CACHE: '1',
    TMPDIR: temporary,
  }
}

/**
 * Tells which processes the command line started still live; a zombie does not.
 *
 * @param run - Command line whose processes to check.
 * @returns Ids of the live processes.
 */
function listLive(run: Running): number[] {
  let live = new Set(
    listProcesses()
      .filter(row => !row.stat.startsWith('Z'))
      .map(row => row.pid),
  )
  return [...run.seen.keys()].filter(pid => live.has(pid))
}

describe.skipIf(
  process.platform === 'win32' || !('registerHooks' in moduleApi),
)('run', { timeout: 120_000 }, () => {
  let preload = { remove: () => Promise.resolve(), path: '' }

  beforeAll(async () => {
    preload = await buildNodeTestPreload()
  })

  afterEach(async () => {
    for (let run of runs) {
      run.child.kill('SIGKILL')
      for (let pid of run.seen.keys()) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
      }
    }
    await Promise.all(
      runs.map(run => rm(run.temporary, { recursive: true, force: true })),
    )
    runs = []
  })

  afterAll(async () => {
    await preload.remove()
  })

  it.each([
    { runner: 'vitest', signal: 'SIGINT' },
    { signal: 'SIGTERM', runner: 'vitest' },
    { runner: 'vitest', signal: 'SIGHUP' },
    { runner: 'node-test', signal: 'SIGHUP' },
    { runner: 'node-test', signal: 'SIGTERM' },
  ] as const)(
    'leaves no process and no temporary file after $signal to the command line alone with $runner, and ends by it',
    async ({ runner, signal }) => {
      let run = await start(runner, preload.path)
      await waitForHungUnit(run)
      run.child.kill(signal)

      await expect
        .poll(() => look(run).end, { timeout: 10_000, interval: 100 })
        .toStrictEqual({ code: null, signal })
      expect(run.output.stdout).toBe('')
      expect(run.output.stderr).not.toContain('Error:')
      await expect
        .poll(() => listLive(run), { timeout: 2000, interval: 100 })
        .toStrictEqual([])
      await expect(readdir(run.temporary)).resolves.toStrictEqual([])
    },
  )

  it('ends by the signal once the cleanup ran out of time while a global setup of Vitest hangs, and leaves no file of its own', async () => {
    let run = await start('setup', preload.path)
    await expect
      .poll(() => look(run).output.stderr, { timeout: 60_000, interval: 250 })
      .toContain('global setup waits for a service')
    let signalled = Date.now()
    run.child.kill('SIGTERM')

    await expect
      .poll(() => look(run).end, { timeout: 10_000, interval: 100 })
      .toStrictEqual({ signal: 'SIGTERM', code: null })
    expect(Date.now() - signalled).toBeGreaterThanOrEqual(4500)
    expect(run.output.stdout).toBe('')
    await expect
      .poll(() => listLive(run), { timeout: 2000, interval: 100 })
      .toStrictEqual([])
    await expect(readdir(run.temporary)).resolves.toStrictEqual([])
  })
})
