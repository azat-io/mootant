/**
 * Words after a package manager that run a script of the package, not a binary.
 */
const SCRIPT_WORDS = new Set(['run-script', 'test', 'run', 't'])

/**
 * Reads what comes before the binary of one simple command of a script
 * (`parseCommand`): leading `NAME=value` words and `env` or `cross-env` set
 * variables; `pnpm`, `pnpm exec`, `npx`, `npm exec`, `yarn` and `yarn exec` run
 * the binary that follows.
 *
 * @param words - Words of the simple command.
 * @returns The variables the command sets, the words after the binary and the
 *   base name of the binary without `.cmd` or `.exe`, or null when the words
 *   run a script of the package or hold no binary.
 */
export function readCommandPrefix(words: readonly string[]): {
  environment: Record<string, string>
  rest: string[]
  name: string
} | null {
  let environment: Record<string, string> = {}
  let rest = [...words]
  let binary: undefined | string
  while ((binary = rest.shift()) !== undefined) {
    let assignment = /^(?<name>[A-Z_a-z]\w*)=(?<value>.*)$/su.exec(binary)
    if (assignment !== null) {
      environment[assignment.groups!['name']!] = assignment.groups!['value']!
    } else if (['cross-env', 'env', 'npx'].includes(binary)) {
      while (rest[0]?.startsWith('-')) {
        rest.shift()
      }
    } else if (['pnpm', 'yarn', 'npm'].includes(binary)) {
      let word = rest[0] ?? 'run'
      if (word === 'exec' || (binary === 'npm' && word === 'x')) {
        rest.shift()
        if (rest[0] === '--') {
          rest.shift()
        }
      } else if (binary === 'npm' || SCRIPT_WORDS.has(word)) {
        return null
      }
    } else {
      break
    }
  }
  if (binary === undefined) {
    return null
  }
  return {
    name: binary
      .split(/[/\\]/u)
      .at(-1)!
      .replace(/\.(?:cmd|exe)$/iu, ''),
    environment,
    rest,
  }
}
