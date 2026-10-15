import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { version } from '../../package.json'
import { runList } from '../../cli/run-list'
import { run } from '../../cli/index'

vi.mock(import('../../cli/run-list'))

describe('run', () => {
  let originalArgv: string[]

  let consoleInfoSpy: MockInstance<typeof console.info>
  let consoleErrorSpy: MockInstance<typeof console.error>
  let processExitSpy: MockInstance<typeof process.exit>

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

    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    /**
     * The real `process.exit` never returns.
     */
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it.each([
    { given: 'no arguments', argv: [] },
    { argv: ['--help'], given: '--help' },
  ])('prints the help text for $given', async ({ argv }) => {
    await runCli(...argv)

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Usage:\n  $ mootant <command> [options]'),
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(processExitSpy).not.toHaveBeenCalled()
  })

  it('prints the version from package.json', async () => {
    await runCli('--version')

    expect(consoleInfoSpy).toHaveBeenCalledExactlyOnceWith(
      `mootant/${version} ${process.platform}-${process.arch} node-${process.version}`,
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(processExitSpy).not.toHaveBeenCalled()
  })

  it('reports an invalid argument and sets exit code 1', async () => {
    await expect(runCli('--bogus')).resolves.toBeUndefined()

    expect(process.exitCode).toBe(1)
    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
      '\nError:',
      expect.stringContaining("'--bogus'"),
    )
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it('delegates the list command with the parsed options', async () => {
    vi.mocked(runList).mockResolvedValue()

    await runCli('list', 'src', '--json', '--skipped')

    expect(runList).toHaveBeenCalledExactlyOnceWith({
      paths: ['src'],
      skipped: true,
      json: true,
    })
    expect(consoleInfoSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(processExitSpy).not.toHaveBeenCalled()
  })
})
