import { parseArgs } from 'node:util'

/**
 * Decimal integer from 1 up, without a sign or leading zeros.
 */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/u

/**
 * Help text shown for `--help` and when no command is given.
 */
let helpText = `Usage:
  $ mootant <command> [options]

Commands:
  list <paths...>      List the mutants of files and directories
  run [paths...]       Run the tests against the mutants of files and
                       directories (default: run.paths of the configuration)

Options:
  --config <path>      Configuration file (default: searched from the current
                       directory up: mootant.config.{js,ts,...}, .mootantrc or
                       the "mootant" key of package.json)
  --preset <name>      Mutator preset: recommended, strict or a plugin preset;
                       replaces the presets of the configuration
                       (default: recommended)
  --json               Print the report as JSON
  --skipped            list: also list the mutants that were considered and
                       skipped, with the reason; code that is never mutated,
                       such as types, decorators and enums, is not listed
  --threshold <score>  run: lowest mutation score from 0 to 100 that passes;
                       below it the exit code is 1
  --concurrency <n>    run: most test files at once (default: CPU cores - 1)
  --fast               run: try many mutants in one test run; faster, but a
                       kill may be false (state left by earlier tries)
  --mutant <id>        run: run only this mutant; repeat for more
  -h, --help           Display this message
  -v, --version        Display version number`

/**
 * ParseArgs configuration of the supported flags.
 */
let parserOptions = {
  mutant: { type: 'string', multiple: true },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
  concurrency: { type: 'string' },
  threshold: { type: 'string' },
  skipped: { type: 'boolean' },
  config: { type: 'string' },
  preset: { type: 'string' },
  fast: { type: 'boolean' },
  json: { type: 'boolean' },
} as const

/**
 * Options that only the `run` command reads.
 */
let runOnlyOptions = ['threshold', 'concurrency', 'fast', 'mutant'] as const

/**
 * Options of the `run` command. Settings left out come from the configuration.
 */
export interface RunOptions {
  /**
   * Most test files at once, when `--concurrency` is given.
   */
  concurrency?: number

  /**
   * Ids of the only mutants to run, from `--mutant`; empty for every mutant.
   */
  mutantIds: string[]

  /**
   * Lowest total score that passes, when `--threshold` is given.
   */
  threshold?: number

  /**
   * Files and directories to mutate, as given on the command line; empty to use
   * `run.paths` of the configuration.
   */
  paths: string[]

  /**
   * Path of the configuration file, when `--config` is given.
   */
  config?: string

  /**
   * Preset id, when `--preset` is given.
   */
  preset?: string

  /**
   * True when `--fast` is given.
   */
  fast?: boolean

  /**
   * Whether to print the report as JSON.
   */
  json: boolean
}

/**
 * Options of the `list` command.
 */
export interface ListOptions {
  /**
   * Whether to list skipped candidates too.
   */
  skipped: boolean

  /**
   * Files and directories to list, as given on the command line.
   */
  paths: string[]

  /**
   * Path of the configuration file, when `--config` is given.
   */
  config?: string

  /**
   * Preset id, when `--preset` is given.
   */
  preset?: string

  /**
   * Whether to print the report as JSON.
   */
  json: boolean
}

/**
 * Result of parsing CLI arguments. `kind` discriminates what the caller should
 * do next.
 */
export type ParseArgumentsResult =
  | { options: ListOptions; kind: 'list' }
  | { options: RunOptions; kind: 'run' }
  | { message: string; kind: 'error' }
  | { kind: 'version'; text: string }
  | { kind: 'help'; text: string }

/**
 * Option values `parseArgs` returns for the supported flags.
 */
type ParsedValues = ReturnType<
  typeof parseArgs<{ options: typeof parserOptions }>
>['values']

/**
 * Parse CLI arguments.
 *
 * `--help` wins over everything, `--version` over the command. Without a
 * command the help text is shown. Options may appear anywhere.
 *
 * @param argv - Raw arguments, typically `process.argv.slice(2)`.
 * @param appVersion - Version string used for `--version`.
 * @returns A discriminated result describing what the caller should do.
 */
export function parseArguments(
  argv: string[],
  appVersion: string,
): ParseArgumentsResult {
  try {
    let { positionals, values } = parseArgs({
      allowPositionals: true,
      options: parserOptions,
      strict: true,
      args: argv,
    })

    if (values.help) {
      return { text: helpText, kind: 'help' }
    }

    if (values.version) {
      return {
        text: `mootant/${appVersion} ${process.platform}-${process.arch} node-${process.version}`,
        kind: 'version',
      }
    }

    let [command, ...paths] = positionals

    if (command === undefined) {
      return { text: helpText, kind: 'help' }
    }

    if (command === 'run') {
      return parseRunOptions(values, paths)
    }

    if (command !== 'list') {
      return {
        message: `Unknown command '${command}'. Run 'mootant --help' for usage.`,
        kind: 'error',
      }
    }

    let runOnly = runOnlyOptions.find(name => values[name] !== undefined)
    if (runOnly !== undefined) {
      return {
        message: `--${runOnly} applies to the run command only.`,
        kind: 'error',
      }
    }

    if (paths.length === 0) {
      return {
        message:
          "The list command expects at least one path, for example 'mootant list src'.",
        kind: 'error',
      }
    }

    return {
      options: {
        ...(values.config !== undefined && { config: values.config }),
        ...(values.preset !== undefined && { preset: values.preset }),
        skipped: values.skipped ?? false,
        json: values.json ?? false,
        paths,
      },
      kind: 'list',
    }
  } catch (error) {
    return { message: (error as Error).message, kind: 'error' }
  }
}

/**
 * Checks and converts the options of the `run` command.
 *
 * @param values - Parsed option values.
 * @param paths - Paths after the command.
 * @returns Run options, or an error for an option out of range or one that only
 *   `list` reads.
 */
function parseRunOptions(
  values: ParsedValues,
  paths: string[],
): ParseArgumentsResult {
  if (values.skipped !== undefined) {
    return {
      message: '--skipped applies to the list command only.',
      kind: 'error',
    }
  }
  let threshold =
    values.threshold === undefined ? undefined : Number(values.threshold)
  if (
    threshold !== undefined &&
    (values.threshold!.trim() === '' ||
      !(threshold >= 0) ||
      !(threshold <= 100))
  ) {
    return {
      message: '--threshold expects a number from 0 to 100.',
      kind: 'error',
    }
  }
  if (
    values.concurrency !== undefined &&
    !POSITIVE_INTEGER_PATTERN.test(values.concurrency)
  ) {
    return {
      message: '--concurrency expects a positive integer.',
      kind: 'error',
    }
  }
  return {
    options: {
      ...(values.concurrency !== undefined && {
        concurrency: Number(values.concurrency),
      }),
      ...(threshold !== undefined && { threshold }),
      ...(values.fast !== undefined && { fast: values.fast }),
      ...(values.config !== undefined && { config: values.config }),
      ...(values.preset !== undefined && { preset: values.preset }),
      mutantIds: values.mutant ?? [],
      json: values.json ?? false,
      paths,
    },
    kind: 'run',
  }
}
