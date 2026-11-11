import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { JestCommand } from './types/jest-command'

import { splitNodeArguments } from '../shared/split-node-arguments'
import { readCommandPrefix } from '../shared/read-command-prefix'
import { readTestScripts } from '../shared/read-test-scripts'
import { parseCommand } from '../shared/parse-command'

/**
 * A path or binary name whose last part is Jest.
 */
const JEST_PATH = /(?:^|[/\\])jest(?:\.js)?$/u

/**
 * A word of a script that names Jest, also as the end of `$(yarn bin jest)`.
 */
const JEST_WORD = /(?:^|[/\\])jest(?:\.js)?\)?$/u

/**
 * A word of a shell redirect, with its target after it or in the word.
 */
const REDIRECT = /^\d*(?:>>?|<)(?<target>\S*)$/u

/**
 * A word that is only a shell variable, whose words mootant cannot know.
 */
const SHELL_VARIABLE = /^\$(?:\w+|\{\w+\}|[*@])$/u

/**
 * What a shell expands in the value of a variable, unless `KEPT` comes before
 * it: a variable, which mootant expands, or another form, which it cannot, such
 * as `${NAME:-word}`, `$(command)`, a backtick, `$1` or `$$`.
 */
const EXPANSION =
  /(?<!\0)\$(?:\{(?<braced>[A-Z_a-z]\w*)\}|(?<plain>[A-Z_a-z]\w*)|[\d!#$(*\-?@{])|(?<!\0)`/gu

/**
 * A word that sets a variable.
 */
const ASSIGNMENT = /^(?<name>[A-Z_a-z]\w*)=(?<value>.*)$/su

/**
 * Mark of a `$` or a backtick the shell keeps as written, in single quotes or
 * after a backslash, which no word of a command can hold.
 */
const KEPT = '\0'

/**
 * A variable in a value `cross-env` sets, with the backslashes before it, as
 * `cross-env` reads it once the shell is done: an odd number of them keeps the
 * variable as written.
 */
const CROSS_ENV_REFERENCE =
  /(?<escapes>\\*)(?<written>\$(?<plain>\w+)|\$\{(?<braced>\w+)\})/gu

/**
 * A variable a command sets, as written.
 */
interface Assignment {
  /**
   * Where the script sets it: `export`ed before the command, before the command
   * name, after `cross-env`, or given to another command, as after `env`.
   */
  place: 'temporary' | 'cross-env' | 'exported' | 'given'

  /**
   * Its value as written, with what the shell keeps marked.
   */
  written: string

  /**
   * Number of the `export` that sets it, from 0 in the order of the script; the
   * command that runs Jest comes after every one.
   */
  command: number

  /**
   * Its name.
   */
  name: string
}

/**
 * Finds the command a project runs Jest with: the given command, else the first
 * command of the test scripts of `package.json` (`readTestScripts`) that runs
 * Jest, else plain `jest`, with a warning when the scripts name Jest in a way
 * that cannot be read. `export NAME=value` before the command counts as its own
 * variable.
 *
 * @param root - Project root, with the `package.json` of the scripts.
 * @param command - Test command the options give, or undefined to read the
 *   scripts.
 * @returns Variables, Node flags and Jest's arguments of the command.
 * @throws {Error} When the given command does not run Jest.
 */
export async function findJestCommand(
  root: string,
  command: undefined | string,
): Promise<JestCommand> {
  let sources = command === undefined ? await readTestScripts(root) : [command]
  for (let source of sources) {
    let exported: string[][] = []
    for (let words of parseCommand(source, KEPT)) {
      if (words[0] === 'export') {
        exported.push(words.slice(1).filter(word => word.includes('=')))
      } else {
        let resolved = readJestCommand(words, exported)
        if (resolved !== null) {
          return resolved
        }
      }
    }
  }
  if (command !== undefined) {
    throw new Error(
      `The command "${command}" does not run Jest; give one such as "jest --config jest.config.js".`,
    )
  }
  let named = sources.some(source =>
    parseCommand(source)
      .flat()
      .some(word => JEST_WORD.test(word)),
  )
  return {
    diagnostics:
      named ?
        [
          createWarning(
            'mootant cannot read how the test scripts run Jest, so it runs plain jest; give the command in the options of the adapter.',
          ),
        ]
      : [],
    nodeFlags: [],
    args: [],
    env: {},
  }
}

/**
 * Expands `$NAME` and `${NAME}` in the variables a command sets, as a shell
 * does, from the environment of mootant and what the script exported before the
 * command; the variables set before the command name also take the ones before
 * them, while the shell expands the words of `env` and `cross-env` before any
 * of those takes effect, and those of one `export` before it sets any. An unset
 * name gives nothing, and a `$` the shell keeps as written stays. A value with
 * an expansion mootant cannot make keeps it as written, with a warning that
 * names the variable alone, as its value may be a secret. What the shell gives
 * `cross-env` it expands once more, as it does itself: a variable after an odd
 * number of backslashes stays as written, without them, and the others take the
 * variables of its own process, those set for it and the environment of
 * mootant, not those it sets.
 *
 * @param assignments - The variables in the order the command sets them, with
 *   quotes removed and what they keep marked.
 * @returns The variables with their values, and the warnings.
 */
function expandVariables(assignments: readonly Assignment[]): {
  env: Record<string, string>
  diagnostics: Diagnostic[]
} {
  let diagnostics: Diagnostic[] = []
  let env: Record<string, string> = {}
  let exported: Record<string, string> = {}
  let temporary: Record<string, string> = {}
  let given: Record<string, string> = {}
  let earlier: Record<string, string> = {}
  let current = -1
  for (let { written, command, place, name } of assignments) {
    if (command !== current) {
      earlier = { ...exported }
      current = command
    }
    let unread: string[] = []
    let known = exported
    if (place === 'exported') {
      known = earlier
    } else if (place === 'temporary') {
      known = { ...exported, ...temporary }
    }
    let value = written
      .replaceAll(
        EXPANSION,
        (
          expansion: string,
          braced: undefined | string,
          plain: undefined | string,
        ) => {
          let reference = braced ?? plain
          if (reference === undefined) {
            unread.push(expansion)
            return expansion
          }
          return lookUp(known, reference) ?? ''
        },
      )
      .replaceAll(KEPT, '')
    if (unread.length > 0) {
      diagnostics.push(
        createWarning(
          `mootant cannot expand the value of ${name} in the test command, so it keeps it as written; give ${name} in the env option of the adapter.`,
        ),
      )
    }
    if (place === 'cross-env') {
      let own = { ...exported, ...given }
      value = value.replaceAll(
        CROSS_ENV_REFERENCE,
        (...parameters: unknown[]) => {
          let {
            written: reference,
            plain: variable,
            escapes,
            braced,
          } = parameters.at(-1) as {
            braced: undefined | string
            plain: undefined | string
            escapes: string
            written: string
          }
          variable ??= braced!
          return escapes.length % 2 === 1 ?
              reference
            : escapes.slice(0, escapes.length / 2) +
                (lookUp(own, variable) ?? '')
        },
      )
    } else if (place === 'exported') {
      exported[name] = value
    } else {
      given[name] = value
      if (place === 'temporary') {
        temporary[name] = value
      }
    }
    env[name] = value
  }
  return { diagnostics, env }
}

/**
 * Reads the test command of one simple command of a script: past what comes
 * before the binary (`readCommandPrefix`), the binary is Jest, or `node` with
 * flags and a path to Jest. `npm exec` and `npm x` keep the first `--` after
 * the binary to themselves. Node's `--inspect*` and `--debug*` flags are left
 * out with a warning, since mootant runs many processes and a debugger attaches
 * to one.
 *
 * @param words - Words of the simple command.
 * @param exported - `NAME=value` words of each `export` of the script before
 *   it.
 * @returns The test command, or null when the words do not run Jest.
 */
function readJestCommand(
  words: readonly string[],
  exported: readonly (readonly string[])[],
): JestCommand | null {
  let all = [...exported.flat(), ...words]
  let prefix = readCommandPrefix(all)
  if (prefix === null) {
    return null
  }
  let { name } = prefix
  let before = all.slice(0, all.length - prefix.rest.length)
  let { diagnostics, env } = expandVariables(
    listAssignments(
      before,
      exported.flatMap((group, index) => group.map(() => index)),
    ),
  )
  let taken =
    before.includes('npm') && !before.includes('--') ?
      prefix.rest.indexOf('--')
    : -1
  let removed = removeShellWords(
    prefix.rest.filter((_, index) => index !== taken),
  )
  let { rest } = removed
  diagnostics.push(...removed.diagnostics)
  if (JEST_PATH.test(name)) {
    return { nodeFlags: [], diagnostics, args: rest, env }
  }
  if (name !== 'node') {
    return null
  }
  let { flags, files } = splitNodeArguments(rest)
  let [file = '', ...jestArguments] = files
  if (!JEST_PATH.test(file)) {
    return null
  }
  let nodeFlags: string[] = []
  for (let flag of flags) {
    if (/^--(?:debug|inspect)/u.test(flag[0]!)) {
      diagnostics.push(
        createWarning(`mootant ignores ${flag[0]} of the test command.`),
      )
    } else {
      nodeFlags.push(...flag)
    }
  }
  return { args: jestArguments, diagnostics, nodeFlags, env }
}

/**
 * Lists the variables the words before the binary set, in order, each with the
 * part of the script that sets it: an `export` before the command, a word
 * before the command name, or a word after `env` or `cross-env`.
 *
 * @param before - Words before the binary, the exported ones first.
 * @param exports - Number of the `export` of each exported word among them, in
 *   order.
 * @returns The variables as written.
 */
function listAssignments(
  before: readonly string[],
  exports: readonly number[],
): Assignment[] {
  let exported = exports.length
  let command = before.findIndex(
    (word, index) => index >= exported && !ASSIGNMENT.test(word),
  )
  let crossEnvironment = before.indexOf('cross-env')

  /**
   * Tells which part of the script a word that sets a variable belongs to.
   *
   * @param index - Place of the word among the words before the binary.
   * @returns Where the variable comes from.
   */
  function findPlace(index: number): Assignment['place'] {
    if (index < exported) {
      return 'exported'
    }
    if (command === -1 || index < command) {
      return 'temporary'
    }
    return crossEnvironment !== -1 && index > crossEnvironment ?
        'cross-env'
      : 'given'
  }

  return before.flatMap((word, index) => {
    let assignment = ASSIGNMENT.exec(word)
    if (assignment === null) {
      return []
    }
    let { value, name } = assignment.groups as { value: string; name: string }
    return [
      {
        command: exports[index] ?? (exports.at(-1) ?? -1) + 1,
        place: findPlace(index),
        written: value,
        name,
      },
    ]
  })
}

/**
 * Removes the words a shell would not hand to the binary: redirects with their
 * targets, and, with a warning, words that are only a variable. What a word
 * keeps as written stays.
 *
 * @param words - Words after the binary, with what they keep marked.
 * @returns The words that stay, without marks, and the warnings.
 */
function removeShellWords(words: readonly string[]): {
  diagnostics: Diagnostic[]
  rest: string[]
} {
  let diagnostics: Diagnostic[] = []
  let rest: string[] = []
  for (let index = 0; index < words.length; index++) {
    let word = words[index]!
    let redirect = REDIRECT.exec(word)
    if (redirect !== null) {
      index += redirect.groups!['target'] === '' ? 1 : 0
    } else if (SHELL_VARIABLE.test(word)) {
      diagnostics.push(
        createWarning(`mootant ignores ${word} of the test command.`),
      )
    } else {
      rest.push(word.replaceAll(KEPT, ''))
    }
  }
  return { diagnostics, rest }
}

/**
 * Creates a warning about the test command.
 *
 * @param message - Text of the warning.
 * @returns The diagnostic.
 */
function createWarning(message: string): Diagnostic {
  return {
    code: 'config-overridden',
    severity: 'warning',
    column: null,
    line: null,
    file: null,
    message,
  }
}

/**
 * Finds the value of a variable among those a command set so far, else in the
 * environment of mootant.
 *
 * @param known - Variables the command set that count here.
 * @param name - Name of the variable.
 * @returns Its value, or undefined when it is unset.
 */
function lookUp(
  known: Record<string, string>,
  name: string,
): undefined | string {
  return Object.hasOwn(known, name) ? known[name] : process.env[name]
}
