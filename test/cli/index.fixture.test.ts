import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import type { ListReport } from '../../types/list-report'

import expectedStrictReport from '../fixtures/list/expected-mutants-strict.json'
import { getSourceBlocks } from '../../core/parser/get-source-blocks'
import expectedReport from '../fixtures/list/expected-mutants.json'
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

    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
  })

  it('lists the fixture exactly as expected-mutants.json', async () => {
    await runCli('list', 'test/fixtures/list/source', '--json')

    let report = JSON.parse(
      consoleInfoSpy.mock.calls[0]![0] as string,
    ) as unknown
    expect(report).toStrictEqual(expected)
    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(expect.any(String))
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('lists the fixture with the strict preset exactly as expected-mutants-strict.json', async () => {
    await runCli(
      'list',
      'test/fixtures/list/source',
      '--json',
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
    let [list = '', summary] = text.split('\n\n', 2)
    let printed = list
      .split('\n')
      .map(line => line.split(/\s+/u).slice(0, 2).join(' '))
    expect(printed).toStrictEqual(
      expected.mutants.map(
        mutant => `${mutant.file}:${mutant.line}:${mutant.column} ${mutant.id}`,
      ),
    )
    let {
      totalWarnings,
      totalPending,
      totalIgnored,
      totalMutants,
      totalFiles,
    } = expected.summary
    expect(summary).toBe(
      `${totalMutants} mutants in ${totalFiles} files: ${totalPending} pending, ${totalIgnored} ignored, ${totalWarnings} warnings (preset: recommended)`,
    )
    expect(process.exitCode).toBeUndefined()
  })
})
