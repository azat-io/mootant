import {
  readFile,
  realpath,
  symlink,
  readdir,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeWorkerFiles } from '../../../adapters/jest/write-worker-files'

/**
 * Key of what the worker sets on its global object.
 */
const WORKER_SLOT = Symbol.for('mootant.worker')

/**
 * Temporary work directory of the current test.
 */
let directory = ''

/**
 * Loads CommonJS modules by path.
 */
let load = createRequire(import.meta.url)

describe('writeWorkerFiles', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-worker-files-'))
  })

  afterEach(async () => {
    Reflect.deleteProperty(globalThis, WORKER_SLOT)
    await rm(directory, { recursive: true, force: true })
  })

  it('writes under the real path of the work directory', async () => {
    let real = await realpath(directory)
    let link = path.join(real, 'link')
    await symlink(real, link)

    await expect(writeWorkerFiles(link)).resolves.toStrictEqual({
      results: path.join(real, 'jest/results.cjs'),
      runner: path.join(real, 'jest/runner.host'),
      worker: path.join(real, 'jest/worker.cjs'),
      noop: path.join(real, 'jest/noop.cjs'),
      directory: path.join(real, 'jest'),
    })
  })

  it('writes a runner Jest can load: the module itself, as it has no __esModule', async () => {
    let files = await writeWorkerFiles(directory)
    let Runner = load(files.runner) as new () => { isSerial: boolean }
    let runner = new Runner()

    expect(runner.isSerial).toBe(true)
  })

  it('writes a module that serves as reporter and results processor', async () => {
    let files = await writeWorkerFiles(directory)
    let noop = load(files.noop) as (results: object) => object
    let results = {}

    expect(noop(results)).toBe(results)
    expect(() => {
      Reflect.construct(noop, [results])
    }).not.toThrow()
  })

  it('writes the constant modules, which export what the worker made at boot', async () => {
    let files = await writeWorkerFiles(directory)
    let made = { transformer: {}, testRunner() {} }
    Reflect.set(globalThis, WORKER_SLOT, made)

    await expect(
      readFile(path.join(files.directory, 'test-runner.cjs'), 'utf8'),
    ).resolves.toBe(
      "module.exports = globalThis[Symbol.for('mootant.worker')].testRunner\n",
    )
    await expect(
      readFile(path.join(files.directory, 'transformer.cjs'), 'utf8'),
    ).resolves.toBe(
      "module.exports = globalThis[Symbol.for('mootant.worker')].transformer\n",
    )
    expect(load(path.join(files.directory, 'test-runner.cjs'))).toBe(
      made.testRunner,
    )
    expect(load(path.join(files.directory, 'transformer.cjs'))).toBe(
      made.transformer,
    )
  })

  it('writes a results processor that hands the results on and leaves its mark beside it, with the snapshot files whose test file is gone', async () => {
    let files = await writeWorkerFiles(directory)
    let processResults = load(files.results) as (value: object) => object
    let mark = path.join(files.directory, 'results-reached')
    let results = {
      snapshot: { filesRemovedList: ['/p/__snapshots__/a.test.js.snap'] },
      success: false,
    }

    expect(processResults(results)).toBe(results)
    await expect(readFile(mark, 'utf8')).resolves.toBe(
      '["/p/__snapshots__/a.test.js.snap"]',
    )
    await expect(readdir(files.directory)).resolves.not.toContain(
      'results-reached.part',
    )
  })

  it('writes a last setup file that enters the store of the test environment through the channel', async () => {
    let files = await writeWorkerFiles(directory)
    let channel = { enterEnvironment: vi.fn<() => void>() }
    Reflect.set(process, Symbol.for('mootant.channel'), channel)
    load(path.join(files.directory, 'vm-setup-end.cjs'))
    Reflect.deleteProperty(process, Symbol.for('mootant.channel'))

    expect(channel.enterEnvironment).toHaveBeenCalledExactlyOnceWith()
  })

  it('writes the bundles of the worker and of the setup of a vm', async () => {
    let files = await writeWorkerFiles(directory)

    await expect(readFile(files.worker, 'utf8')).resolves.toContain(
      'MOOTANT_SESSION',
    )
    await expect(
      readFile(path.join(files.directory, 'vm-setup.cjs'), 'utf8'),
    ).resolves.toContain('mootant.channel')
  })
})
