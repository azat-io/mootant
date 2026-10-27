import type { MockInstance, Mock } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

import type { RunProgress } from '../../cli/create-run-progress'
import type { RunReport } from '../../types/report/run-report'

import { formatRunTextReport } from '../../cli/report/format-run-text-report'
import { buildRunReport } from '../../cli/report/build-run-report'
import { writeHtmlReport } from '../../cli/html/write-html-report'
import { createRunProgress } from '../../cli/create-run-progress'
import { slimRunReport } from '../../cli/report/slim-run-report'
import { getBuiltInAdapters } from '../../cli/built-in-adapters'
import { getFileScores } from '../../cli/report/get-file-scores'
import { createTextStyle } from '../helpers/create-text-style'
import { createRunResult } from '../helpers/create-run-result'
import { runMutation } from '../../cli/run-mutation'
import { runMutants } from '../../core/run-mutants'

vi.mock(import('../../core/run-mutants'))
vi.mock(import('../../cli/html/write-html-report'))
vi.mock(import('../../cli/create-run-progress'))

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
  let progress: { [Key in keyof RunProgress]: Mock<RunProgress[Key]> }

  beforeEach(() => {
    vi.stubEnv('NO_COLOR', '1')
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    progress = {
      output: vi.fn<RunProgress['output']>(() => ''),
      handle: vi.fn<RunProgress['handle']>(),
      finish: vi.fn<RunProgress['finish']>(),
    }
    vi.mocked(createRunProgress).mockReturnValue(progress)
  })

  afterEach(() => {
    process.exitCode = undefined
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('passes the options, the built-in adapters and the working directory', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({
      config: 'mootant.config.ts',
      mutantIds: ['k3m9x2p7q4w8'],
      incremental: false,
      preset: 'strict',
      paths: ['src'],
      concurrency: 2,
      verbose: true,
      since: 'main',
      threshold: 40,
      cache: false,
      json: false,
      all: false,
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
      incremental: false,
      preset: 'strict',
      paths: ['src'],
      concurrency: 2,
      since: 'main',
      threshold: 40,
      cache: false,
      fast: true,
    })
    expect(createRunProgress).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ width: Infinity }),
      true,
    )
    expect(Object.keys(getBuiltInAdapters())).toStrictEqual([
      'vitest',
      'node-test',
    ])
  })

  it('shows the flags in the header and keeps the paths, the configuration and the mode, but not --since, in the hint', async () => {
    let result = createRunResult()
    result.listedIds = [...result.listedIds, 'survivor-twin']
    vi.mocked(runMutants).mockResolvedValue(result)

    await runMutation({
      config: 'my config.ts',
      mutantIds: ['surv'],
      incremental: true,
      preset: 'strict',
      since: 'HEAD~1',
      paths: ['src'],
      verbose: false,
      threshold: 40,
      json: false,
      all: false,
      fast: true,
    })

    let text = consoleInfoSpy.mock.calls[0]![0] as string

    expect(text.split('\n', 1)[0]).toBe(
      "● mootant run src --config 'my config.ts' --preset strict --since 'HEAD~1' --fast --incremental --threshold 40 --mutant surv  vitest 5.0.4",
    )
    expect(text).toContain('  4:10  comparison-operator  survive\n')
    expect(text.split('\n').at(-1)).toBe(
      "re-check one: mootant run src --config 'my config.ts' --preset strict --fast --incremental --mutant survive",
    )
  })

  it('leaves out the settings the command line does not give', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({
      verbose: false,
      mutantIds: [],
      json: false,
      all: false,
      paths: [],
    })

    expect(Object.keys(vi.mocked(runMutants).mock.calls[0]![0])).toStrictEqual([
      'onProgress',
      'builtIns',
      'mutantIds',
      'paths',
      'cwd',
    ])
  })

  it('hands the events of the run to the progress and ends it before the report', async () => {
    vi.mocked(runMutants).mockImplementation(options => {
      options.onProgress!({ message: 'note', kind: 'note' })
      return Promise.resolve(createPassingResult())
    })

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      all: false,
      json: true,
    })

    expect(progress.handle).toHaveBeenCalledExactlyOnceWith({
      message: 'note',
      kind: 'note',
    })
    expect(progress.finish.mock.invocationCallOrder[0]).toBeLessThan(
      consoleInfoSpy.mock.invocationCallOrder[0]!,
    )
  })

  it('prints the diagnostics, then the text report, and leaves the exit code alone', async () => {
    let result = createPassingResult()
    vi.mocked(runMutants).mockResolvedValue(result)

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      json: false,
      all: false,
    })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      formatRunTextReport(
        buildRunReport(createPassingResult(), {
          recheck: 'mootant run src',
          all: false,
        }),
        {
          command: 'mootant run src',
          recheck: 'mootant run src',
          style: createTextStyle(),
          verbose: false,
          idLength: 4,
        },
      ),
    )
    expect(consoleWarnSpy.mock.calls).toStrictEqual([
      ['▲ pool "threads" changed to "forks". [config-overridden]'],
      [''],
    ])
    expect(consoleWarnSpy.mock.invocationCallOrder[1]).toBeLessThan(
      consoleInfoSpy.mock.invocationCallOrder[0]!,
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints only the JSON document in JSON mode', async () => {
    vi.mocked(runMutants).mockResolvedValue(createPassingResult())

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      all: false,
      json: true,
    })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(
        slimRunReport(
          buildRunReport(createPassingResult(), {
            recheck: 'mootant run src',
            all: false,
          }),
        ),
      ),
    )
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('sets exit code 1 when the run does not pass', async () => {
    vi.mocked(runMutants).mockResolvedValue(createRunResult())

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      all: false,
      json: true,
    })

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(
        slimRunReport(
          buildRunReport(createRunResult(), {
            recheck: 'mootant run src',
            all: false,
          }),
        ),
      ),
    )
    expect(process.exitCode).toBe(1)
  })

  it('lists every mutant in the JSON report with --all', async () => {
    vi.mocked(runMutants).mockResolvedValue(createRunResult())

    await runMutation({
      preset: 'strict',
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      fast: false,
      json: true,
      all: true,
    })

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as RunReport

    expect(report.mutants).toHaveLength(6)
    expect(report.mutants[2]!.recheck).toBe(
      'mootant run src --preset strict --no-fast --mutant survived0001',
    )
    expect(report.mutants[0]).not.toHaveProperty('before')
  })

  it('prints the full JSON report with --verbose', async () => {
    vi.mocked(runMutants).mockResolvedValue(createRunResult())

    await runMutation({
      paths: ['src'],
      mutantIds: [],
      verbose: true,
      json: true,
      all: false,
    })

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as RunReport

    expect(report).toHaveProperty('mutators')
    expect(report.mutants[0]).toMatchObject({
      recheck: 'mootant run src --mutant survived0001',
      cutStart: 0,
      start: 83,
    })
  })

  it('reports a failed run and sets exit code 1', async () => {
    vi.mocked(runMutants).mockRejectedValue(
      new Error('Unknown mutant id "nope".'),
    )

    await expect(
      runMutation({
        mutantIds: ['nope'],
        verbose: false,
        paths: ['src'],
        json: false,
        all: false,
      }),
    ).resolves.toBeUndefined()

    expect(progress.finish).toHaveBeenCalledExactlyOnceWith()
    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      'Error: Unknown mutant id "nope".',
    )
    expect(consoleInfoSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('shows what the tests wrote when the run fails', async () => {
    progress.output.mockReturnValue('(node) Warning: x\nlog\n')
    vi.mocked(runMutants).mockRejectedValue(
      new Error('Tests fail without mutants; fix them first.'),
    )

    await runMutation({
      verbose: false,
      paths: ['src'],
      mutantIds: [],
      json: false,
      all: false,
    })

    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      ['Output of the tests:\n(node) Warning: x\nlog\n'],
      ['Error: Tests fail without mutants; fix them first.'],
    ])
  })

  it('writes the HTML report and prints its path', async () => {
    let result = createPassingResult()
    result.html = '/repo/.mootant/report.html'
    vi.mocked(runMutants).mockResolvedValue(result)
    vi.mocked(writeHtmlReport).mockResolvedValue()

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      json: true,
      all: false,
      html: true,
    })

    expect(vi.mocked(runMutants).mock.calls[0]![0]).toMatchObject({
      html: true,
    })
    expect(writeHtmlReport).toHaveBeenCalledExactlyOnceWith(
      '/repo/.mootant/report.html',
      expect.stringMatching(/^<!doctype html>/u),
    )
    let [, html] = vi.mocked(writeHtmlReport).mock.calls[0]!

    expect(html).toContain('"project":"repo"')
    expect(html).toContain('"command":"mootant run src --html"')
    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      `html report: ${path.relative(process.cwd(), '/repo/.mootant/report.html')}`,
    )
    expect(process.exitCode).toBeUndefined()
  })

  it('fails when the HTML report cannot be written', async () => {
    let result = createPassingResult()
    result.html = '/repo/.mootant/report.html'
    vi.mocked(runMutants).mockResolvedValue(result)
    vi.mocked(writeHtmlReport).mockRejectedValue(new Error('EACCES'))

    await runMutation({
      paths: ['src'],
      verbose: false,
      mutantIds: [],
      json: false,
      all: false,
    })

    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      'Error: The HTML report could not be written to /repo/.mootant/report.html: EACCES',
    )
    expect(process.exitCode).toBe(1)
  })

  it('lists the files with the lowest scores in a terminal', async () => {
    let tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    })
    try {
      vi.mocked(runMutants).mockResolvedValue(createPassingResult())

      await runMutation({
        paths: ['src'],
        verbose: false,
        mutantIds: [],
        json: false,
        all: false,
      })

      expect(getFileScores(createPassingResult())).toHaveLength(1)
      expect(consoleInfoSpy.mock.calls[0]![0]).toContain(
        'files 1 below 100%\n  src/cart.ts   ',
      )
    } finally {
      if (tty) {
        Object.defineProperty(process.stdout, 'isTTY', tty)
      } else {
        delete (process.stdout as { isTTY?: boolean }).isTTY
      }
    }
  })
})
