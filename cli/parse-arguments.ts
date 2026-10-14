import { parseArgs } from 'node:util'

/**
 * Help text shown for `--help` and when no command is given.
 */
let helpText = `Usage:
  $ mootant <command> [options]

Commands:
  list <paths...>  List the mutants of files and directories

Options:
  --preset <name>  Mutator preset: recommended or strict (default: recommended)
  --json           Print the list as JSON
  -h, --help       Display this message
  -v, --version    Display version number`

/**
 * ParseArgs configuration of the supported flags.
 */
let parserOptions = {
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
  preset: { type: 'string' },
  json: { type: 'boolean' },
} as const

/**
 * Options of the `list` command.
 */
export interface ListOptions {
  /**
   * Files and directories to list, as given on the command line.
   */
  paths: string[]

  /**
   * Preset id; `recommended` unless `--preset` is given.
   */
  preset: string

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
        preset: values.preset ?? 'recommended',
        json: values.json ?? false,
        paths,
      },
      kind: 'list',
    }
  } catch (error) {
    return { message: (error as Error).message, kind: 'error' }
  }
}
