import { parseArgs } from 'node:util'

/**
 * Help text shown for `--help` and when no command is given.
 */
let helpText = `Usage:
  $ mootant <command> [options]

Commands:
  list <paths...>  List the mutants of files and directories

Options:
  --config <path>  Configuration file (default: searched from the current
                   directory up: mootant.config.{js,ts,...}, .mootantrc or
                   the "mootant" key of package.json)
  --preset <name>  Mutator preset: recommended, strict or a plugin preset;
                   replaces the presets of the configuration
                   (default: recommended)
  --json           Print the list as JSON
  --skipped        Also list the mutants that were considered and skipped,
                   with the reason; code that is never mutated, such as
                   types, decorators and enums, is not listed
  -h, --help       Display this message
  -v, --version    Display version number`

/**
 * ParseArgs configuration of the supported flags.
 */
let parserOptions = {
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
  skipped: { type: 'boolean' },
  config: { type: 'string' },
  preset: { type: 'string' },
  json: { type: 'boolean' },
} as const

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
  | { message: string; kind: 'error' }
  | { kind: 'version'; text: string }
  | { kind: 'help'; text: string }

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

    if (command !== 'list') {
      return {
        message: `Unknown command '${command}'. Run 'mootant --help' for usage.`,
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
