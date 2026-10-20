import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import type { SlimListReport } from '../../types/report/slim-list-report'
import type { ListReport } from '../../types/report/list-report'

import expectedStrictSkipped from '../fixtures/list/expected-skipped-strict.json'
import expectedStrictReport from '../fixtures/list/expected-mutants-strict.json'
import { getShortIdLength } from '../../cli/report/get-short-id-length'
import { getSourceBlocks } from '../../core/parser/get-source-blocks'
import expectedSkipped from '../fixtures/list/expected-skipped.json'
import expectedReport from '../fixtures/list/expected-mutants.json'
import { slimListReport } from '../../cli/report/slim-list-report'
import { parseFile } from '../../core/parser/parse-file'
import { applyMutant } from '../helpers/apply-mutant'
import { run } from '../../cli/index'

/**
 * The oracle's report of the fixture with the `recommended` preset.
 */
let expected = expectedReport as ListReport

/**
 * The oracle's report of the fixture with the `strict` preset.
 */
let expectedStrict = expectedStrictReport as ListReport

describe('run', () => {
  let originalArgv: string[]
  let originalExitCode: typeof process.exitCode

  let consoleInfoSpy: MockInstance<typeof console.info>
  let consoleWarnSpy: MockInstance<typeof console.warn>
  let consoleErrorSpy: MockInstance<typeof console.error>

  /**
   * Run the CLI as if it was started with the given arguments.
   *
   * @param argv - Arguments after the executable name.
   * @returns Promise of the command.
   */
  function runCli(...argv: string[]): Promise<void> {
    process.argv = ['node', 'mootant', ...argv]
    return run()
  }

  beforeEach(() => {
    originalArgv = process.argv
    originalExitCode = process.exitCode
    process.exitCode = undefined
    vi.stubEnv('NO_COLOR', '1')

    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('lists the fixture exactly as expected-mutants.json', async () => {
    await runCli('list', 'test/fixtures/list/source', '--json', '--verbose')

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as unknown
    expect(report).toStrictEqual(expected)
    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(expect.any(String))
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints the slim form of expected-mutants.json without --verbose', async () => {
    await runCli('list', 'test/fixtures/list/source', '--json')

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as SlimListReport
    expect(report).toStrictEqual(slimListReport(expected))
    let marked = expected.mutants.map(({ cutStart, cutEnd, before, after }) => {
      let start = cutStart > 0 ? '…' : ''
      let end = cutEnd > 0 ? '…' : ''
      return [before, after].map(lines =>
        `${start}${lines.join('\n')}${end}`.split('\n'),
      )
    })
    expect(
      report.mutants.map(({ before, after }) => [before, after]),
    ).toStrictEqual(marked)
    expect(process.exitCode).toBeUndefined()
  })

  it('lists the fixture with the strict preset exactly as expected-mutants-strict.json', async () => {
    await runCli(
      'list',
      'test/fixtures/list/source',
      '--json',
      '--verbose',
      '--preset',
      'strict',
    )

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as unknown
    expect(report).toStrictEqual(expectedStrict)
    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(expect.any(String))
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('keeps every script block of each fixture file parseable with each mutant applied', async () => {
    let sources = new Map(
      await Promise.all(
        expected.files.map(
          async ({ file }) => [file, await readFile(file, 'utf8')] as const,
        ),
      ),
    )
    let mutants = [...expected.mutants, ...expectedStrict.mutants]

    let outcomes = mutants.map(mutant => {
      let source = sources.get(mutant.file)!
      let blocks = getSourceBlocks(mutant.file, applyMutant(source, mutant))
      return {
        parsed: blocks.map(
          block => parseFile(mutant.file, block.text, block).kind,
        ),
        original: source.slice(mutant.start, mutant.end),
        id: mutant.id,
      }
    })
    expect(outcomes).toStrictEqual(
      mutants.map(mutant => ({
        parsed: getSourceBlocks(mutant.file, sources.get(mutant.file)!).map(
          () => 'parsed',
        ),
        original: mutant.original,
        id: mutant.id,
      })),
    )
  })

  it('prints the same mutants in the text format', async () => {
    await runCli('list', 'test/fixtures/list/source')

    let text = consoleInfoSpy.mock.calls[0]![0] as string
    let [, summary = '', ...groups] = text.split('\n\n')
    let body = groups.join('\n\n')
    let length = getShortIdLength(expected.mutants.map(mutant => mutant.id))
    let file = ''
    let printed: string[] = []
    for (let line of body.split('\n')) {
      if (line.startsWith('  ')) {
        let [location, mutator] = line.trim().split(/\s+/u, 2)
        printed.push(`${file}:${location} ${mutator} ${line}`)
      } else if (line !== '') {
        file = line
      }
    }
    expect(printed.map(row => row.split(' ', 2).join(' '))).toStrictEqual(
      expected.mutants.map(mutant => {
        let { column, line } = mutant.focus ?? mutant
        return `${mutant.file}:${line}:${column} ${mutant.mutator}`
      }),
    )
    expect(
      printed.every((row, index) =>
        row.includes(`  ${expected.mutants[index]!.id.slice(0, length)}`),
      ),
    ).toBe(true)
    let { totalIgnored, totalMutants, totalFiles } = expected.summary
    expect(summary.split('\n')).toStrictEqual([
      `${'mutants'.padEnd(16)}${totalMutants} in ${totalFiles} files, ${totalIgnored} ignored`,
      `${'warnings'.padEnd(16)}${expected.summary.totalWarnings}`,
    ])
    expect(process.exitCode).toBeUndefined()
  })

  it.each([
    { skipped: expectedSkipped, preset: 'recommended', report: expected },
    {
      skipped: expectedStrictSkipped,
      report: expectedStrict,
      preset: 'strict',
    },
  ])(
    'lists the same mutants and ids, and the expected skipped ones, with --skipped ($preset)',
    async ({
      skipped: expectedPresetSkipped,
      report: expectedPresetReport,
      preset,
    }) => {
      await runCli(
        'list',
        'test/fixtures/list/source',
        '--json',
        '--verbose',
        '--skipped',
        '--preset',
        preset,
      )

      let { skipped, ...report } = JSON.parse(
        consoleInfoSpy.mock.calls[0]![0] as string,
      ) as ListReport
      let { skippedByCategory, totalSkipped, ...summary } = report.summary

      expect({ ...report, summary }).toStrictEqual(expectedPresetReport)
      expect({
        summary: { skippedByCategory, totalSkipped },
        skipped,
      }).toStrictEqual(expectedPresetSkipped)
      expect(skipped!.length).toBeGreaterThan(0)
      expect(totalSkipped).toBe(skipped!.length)
      expect(
        Object.values(skippedByCategory!).reduce(
          (sum, count) => sum + count,
          0,
        ),
      ).toBe(skipped!.length)
    },
  )

  it('prints the same mutants before the skipped section in the text format', async () => {
    await runCli('list', 'test/fixtures/list/source')
    let plain = consoleInfoSpy.mock.calls[0]![0] as string
    await runCli('list', 'test/fixtures/list/source', '--skipped')
    let withSkipped = consoleInfoSpy.mock.calls[1]![0] as string

    let body = plain.split('\n\n').slice(2).join('\n\n')
    let [, summary = '', ...rest] = withSkipped.split('\n\n')
    expect(rest.join('\n\n').startsWith(`${body}\n\nskipped:\n\n`)).toBe(true)
    expect(summary.split('\n', 2)[1]).toMatch(/^skipped {9}\d+: /u)
  })
})
