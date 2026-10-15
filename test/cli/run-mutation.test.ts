import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { formatRunTextReport } from '../../cli/format-run-text-report'
import { getBuiltInAdapters } from '../../cli/built-in-adapters'
import { createRunResult } from '../helpers/create-run-result'
import { buildRunReport } from '../../cli/build-run-report'
import { runMutation } from '../../cli/run-mutation'
import { runMutants } from '../../core/run-mutants'

vi.mock(import('../../core/run-mutants'))

/**
 * Builds a run result that passes: its mutant without a verdict is killed.
 *
 * @returns Result of a run.
 */
function createPassingResult(): ReturnType<typeof createRunResult> {
  let result = createRunResult()
  result.results[3]!.status = 'Killed'
  return result
}

describe('runMutation', () => {
  let consoleErrorSpy: MockInstance<typeof console.error>
  let consoleInfoSpy: MockInstance<typeof console.info>
  let consoleWarnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('passes the options, the built-in adapters and the working directory', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({
      config: 'mootant.config.ts',
      mutantIds: ['k3m9x2p7q4w8'],
      preset: 'strict',
      paths: ['src'],
      concurrency: 2,
      threshold: 40,
      json: false,
      fast: true,
    })

    expect(runMutants).toHaveBeenCalledExactlyOnceWith({
      builtIns: expect.objectContaining({
        vitest: expect.any(Object) as unknown,
      }) as unknown,
      onProgress: expect.any(Function) as unknown,
      config: 'mootant.config.ts',
      mutantIds: ['k3m9x2p7q4w8'],
      cwd: process.cwd(),
      preset: 'strict',
      paths: ['src'],
      concurrency: 2,
      threshold: 40,
      fast: true,
    })
    expect(Object.keys(getBuiltInAdapters())).toStrictEqual(['vitest'])
  })

  it('leaves out the settings the command line does not give', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({ mutantIds: [], json: false, paths: [] })

    expect(Object.keys(vi.mocked(runMutants).mock.calls[0]![0])).toStrictEqual([
      'onProgress',
      'builtIns',
      'mutantIds',
      'paths',
      'cwd',
    ])
  })

  it('prints notes of the run to stderr', async () => {
    vi.mocked(runMutants).mockImplementation(options => {
      options.onProgress!('1 test is not repeatable.')
      return Promise.resolve(createPassingResult())
    })

    await runMutation({ paths: ['src'], mutantIds: [], json: true })

    expect(consoleWarnSpy).toHaveBeenCalledExactlyOnceWith(
      '1 test is not repeatable.',
    )
  })

  it('prints the text report and diagnostics and leaves the exit code alone', async () => {
    let result = createPassingResult()
    vi.mocked(runMutants).mockResolvedValue(result)

    await runMutation({ paths: ['src'], mutantIds: [], json: false })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      formatRunTextReport(buildRunReport(createPassingResult())),
    )
    expect(consoleWarnSpy).toHaveBeenCalledExactlyOnceWith(
      'warning: pool "threads" changed to "forks". [config-overridden]',
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints only the JSON document in JSON mode', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({ paths: ['src'], mutantIds: [], json: true })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(buildRunReport(createPassingResult()), null, 2),
    )
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('sets exit code 1 when the run does not pass', async () => {
    vi.mocked(runMutants).mockResolvedValue(createRunResult())

    await runMutation({ paths: ['src'], mutantIds: [], json: true })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(buildRunReport(createRunResult()), null, 2),
    )
    expect(process.exitCode).toBe(1)
  })

  it('reports a failed run and sets exit code 1', async () => {
    vi.mocked(runMutants).mockRejectedValue(
      new Error('Unknown mutant id "nope".'),
    )

    await expect(
      runMutation({ mutantIds: ['nope'], paths: ['src'], json: false }),
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      '\nError:',
      'Unknown mutant id "nope".',
    )
    expect(consoleInfoSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
