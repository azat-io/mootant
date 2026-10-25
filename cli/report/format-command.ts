/**
 * Arguments a shell takes as they are, without quotes.
 */
const PLAIN_ARGUMENT_PATTERN = /^[\w%+,\-./:=@]+$/u

/**
 * Options of a command that change what it does, as a report shows them.
 */
interface CommandOptions {
  /**
   * Whether verdicts are reused by region, from `--incremental` or
   * `--no-incremental`.
   */
  incremental?: boolean

  /**
   * Ids of the only mutants to run, from `--mutant`.
   */
  mutantIds?: string[]

  /**
   * Most test files at once, from `--concurrency`.
   */
  concurrency?: number

  /**
   * Lowest score that passes, from `--threshold`.
   */
  threshold?: number

  /**
   * Whether skipped candidates are listed, from `--skipped`.
   */
  skipped?: boolean

  /**
   * Files and directories, as given.
   */
  paths: string[]

  /**
   * Configuration file, from `--config`.
   */
  config?: string

  /**
   * Preset id, from `--preset`.
   */
  preset?: string

  /**
   * Git revision, from `--since`.
   */
  since?: string

  /**
   * Whether batch tries are on, from `--fast` or `--no-fast`.
   */
  fast?: boolean
}

/**
 * Builds a mootant command line from its options, such as `mootant run src
 * --fast --mutant 3f2a`: the paths, then the options that change what the
 * command does, in a fixed order; options that only change the output, such as
 * `--json` or `--verbose`, are left out. Arguments a shell would split are
 * quoted, so the line can be copied and run.
 *
 * @param command - Name of the command.
 * @param options - Paths and options as given.
 * @returns The command line.
 */
export function formatCommand(
  command: 'list' | 'run',
  options: CommandOptions,
): string {
  let parts = ['mootant', command, ...options.paths.map(quote)]
  if (options.config !== undefined) {
    parts.push('--config', quote(options.config))
  }
  if (options.preset !== undefined) {
    parts.push('--preset', quote(options.preset))
  }
  if (options.since !== undefined) {
    parts.push('--since', quote(options.since))
  }
  if (options.skipped === true) {
    parts.push('--skipped')
  }
  if (options.fast !== undefined) {
    parts.push(options.fast ? '--fast' : '--no-fast')
  }
  if (options.incremental !== undefined) {
    parts.push(options.incremental ? '--incremental' : '--no-incremental')
  }
  if (options.threshold !== undefined) {
    parts.push('--threshold', String(options.threshold))
  }
  if (options.concurrency !== undefined) {
    parts.push('--concurrency', String(options.concurrency))
  }
  if (options.mutantIds !== undefined) {
    for (let id of options.mutantIds) {
      parts.push('--mutant', quote(id))
    }
  }
  return parts.join(' ')
}

/**
 * Quotes an argument for a shell when it holds characters the shell would read,
 * such as spaces.
 *
 * @param argument - Argument as given.
 * @returns The argument, in single quotes when needed.
 */
function quote(argument: string): string {
  return PLAIN_ARGUMENT_PATTERN.test(argument) ? argument : (
      `'${argument.replaceAll("'", String.raw`'\''`)}'`
    )
}
