import type { ChildProcess } from 'node:child_process'

import { setTimeout } from 'node:timers/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { SwitchedFile } from '../../types/adapter/switched-file'

import { runOnWorker } from '../../adapters/jest/run-on-worker'
import { createJestProject } from './create-jest-project'
import { jestAdapter } from '../../adapters/jest/index'

/**
 * What a test file of the Jest adapter uses to copy fixtures and start sessions
 * in a test, and to clean up after it.
 */
interface JestScope {
  /**
   * Copies a fixture for the current test.
   *
   * @param name - Directory of the fixture.
   * @param major - Major version of Jest the copy gets.
   * @returns Root of the copy.
   */
  createProject(name: string, major?: 29 | 30): Promise<string>

  /**
   * Starts a real session on a project, closing it after the test.
   *
   * @param root - Root of the project.
   * @returns The session, the files it reads, what it wrote, and the units that
   *   ended.
   */
  start(root: string): Promise<StartedSession>

  /**
   * Copies the `cache` fixture for the current test and waits past the
   * millisecond of the copy.
   *
   * @returns Root of the copy.
   */
  createCacheProject(): Promise<string>

  /**
   * Sessions of the current test, closed after it.
   */
  closes: (() => Promise<unknown>)[]

  /**
   * Closes the sessions of the current test and removes its directories.
   */
  cleanUp(): Promise<void>

  /**
   * Lists the processes forked in the current test: the host, then the workers.
   *
   * @returns Their ids.
   */
  listForked(): number[]

  /**
   * Clears the variables that must not reach a fixture's Jest.
   */
  clearVariables(): void

  /**
   * Directories of the current test, removed after it.
   */
  directories: string[]
}

/**
 * A real session on a project, started by `start`.
 */
interface StartedSession {
  /**
   * What the session wrote, with the test file it wrote it for.
   */
  output: { file: string | null; text: string }[]

  /**
   * The session.
   */
  session: AdapterSession

  /**
   * Number of units that ended.
   */
  ends: { count: number }

  /**
   * Files the session reads.
   */
  files: SwitchedFile[]
}

/**
 * Creates what a test file of the Jest adapter shares between its tests: the
 * copies of fixtures and the sessions of the current test, and their cleanup.
 * The test file mocks `fork` of `node:child_process` and `runOnWorker` with
 * spies on the real functions, whose calls `listForked` reads and `cleanUp`
 * clears.
 *
 * @returns Functions and lists of the current test.
 */
export function createJestScope(): JestScope {
  /**
   * Directories of the current test, removed after it.
   */
  let directories: string[] = []

  /**
   * Sessions of the current test, closed after it.
   */
  let closes: (() => Promise<unknown>)[] = []

  /**
   * Starts a real session on a project, closing it after the test.
   *
   * @param root - Root of the project.
   * @returns The session, the files it reads, what it wrote, and the units that
   *   ended.
   */
  async function start(root: string): Promise<StartedSession> {
    let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
    directories.push(workDirectory)
    let output: { file: string | null; text: string }[] = []
    let files: SwitchedFile[] = []
    let ends = { count: 0 }
    let session = await jestAdapter().start({
      onOutput: (text, file) => {
        output.push({ file, text })
      },
      onUnitEnd: () => {
        ends.count += 1
      },
      concurrency: 2,
      workDirectory,
      files,
      root,
    })
    closes.push(session.close)
    return { session, output, files, ends }
  }

  /**
   * Closes the sessions of the current test and removes its directories.
   */
  async function cleanUp(): Promise<void> {
    await Promise.all(closes.map(close => close()))
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    await Promise.all(
      directories.map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    )
    closes.length = 0
    directories.length = 0
    vi.mocked(fork).mockClear()
    vi.mocked(runOnWorker).mockClear()
  }

  /**
   * Clears what must not reach a fixture's Jest: pnpm's shims put
   * `.pnpm/node_modules` in `NODE_PATH`, where `testEnvironment: node` on Jest
   * 30 would resolve to the environment of Jest 29.
   */
  function clearVariables(): void {
    for (let name of Object.keys(process.env)) {
      if (/^(?:NODE_OPTIONS$|NODE_PATH$|TEST$|VITEST)/u.test(name)) {
        vi.stubEnv(name, undefined)
      }
    }
  }

  /**
   * Copies a fixture for the current test.
   *
   * @param name - Directory of the fixture.
   * @param major - Major version of Jest the copy gets.
   * @returns Root of the copy.
   */
  async function createProject(
    name: string,
    major: 29 | 30 = 30,
  ): Promise<string> {
    let root = await createJestProject(name, major)
    directories.push(root)
    return root
  }

  /**
   * Lists the processes forked in the current test: the host, then the workers.
   *
   * @returns Their ids.
   */
  function listForked(): number[] {
    return vi
      .mocked(fork)
      .mock.results.map(result => (result.value as ChildProcess).pid!)
  }

  /**
   * Copies the `cache` fixture for the current test and waits past the
   * millisecond of the copy, as a file modified in the millisecond a run starts
   * counts as changed during it.
   *
   * @returns Root of the copy.
   */
  async function createCacheProject(): Promise<string> {
    let root = await createProject('cache')
    await setTimeout(5)
    return root
  }

  return {
    createCacheProject,
    clearVariables,
    createProject,
    directories,
    listForked,
    cleanUp,
    closes,
    start,
  }
}
