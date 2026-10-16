import { getTextStyle } from './terminal/get-text-style'
import { parseArguments } from './parse-arguments'
import { runMutation } from './run-mutation'
import { version } from '../package.json'
import { runList } from './run-list'

/**
 * Run the CLI.
 *
 * @returns Promise that settles when the command has printed its output.
 */
export function run(): Promise<void> {
  let parsed = parseArguments(process.argv.slice(2), version)

  if (parsed.kind === 'error') {
    let { colors } = getTextStyle(process.stderr)
    console.error(`${colors.red('Error:')} ${parsed.message}`)
    process.exitCode = 1
    return Promise.resolve()
  }

  if (parsed.kind === 'list') {
    return runList(parsed.options)
  }

  if (parsed.kind === 'run') {
    return runMutation(parsed.options)
  }

  console.info(parsed.text)
  return Promise.resolve()
}
