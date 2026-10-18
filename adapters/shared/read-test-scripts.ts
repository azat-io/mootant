import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Names of the scripts a project runs its tests with: `test` and those named
 * like `test:unit`, `test-e2e` or `test_types`.
 */
const TEST_NAME = /^test(?:$|[-:_])/u

/**
 * Package managers that run a script of the package by its name.
 */
const MANAGERS = new Set(['pnpm', 'yarn', 'npm', 'bun'])

/**
 * Tools that run several scripts given by names or `*` patterns.
 */
const RUNNERS = new Set(['npm-run-all', 'run-s', 'run-p'])

/**
 * Lists the commands of the scripts a project runs its tests with: the `test`
 * script first, then the other scripts named like `test:unit`, each followed by
 * the scripts it runs through a package manager (`pnpm run lint`, `npm test`,
 * `yarn unit`, `pnpm run /^test:/`) or through `npm-run-all`, `run-s` and
 * `run-p`, in the order they are found. Every script is listed once, so scripts
 * that run each other end. Commands are split on whitespace and on the shell's
 * `&&`, `||`, `;`, `|` and `&`; they are never run.
 *
 * @param root - Directory of the project's `package.json`.
 * @returns Commands of the test scripts, or an empty list when the file is
 *   missing, broken or has no scripts.
 */
export async function readTestScripts(root: string): Promise<string[]> {
  let scripts: Record<string, string> = {}
  try {
    let manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, unknown> }
    let entries = Object.entries(manifest.scripts ?? {})
    for (let [name, command] of entries) {
      if (typeof command === 'string') {
        scripts[name] = command
      }
    }
  } catch {
    return []
  }
  let names = Object.keys(scripts)
  let queue = names
    .filter(name => TEST_NAME.test(name))
    .toSorted((a, b) => Number(b === 'test') - Number(a === 'test'))
  let seen = new Set(queue)
  let commands: string[] = []
  while (queue.length > 0) {
    let command = scripts[queue.shift()!]!
    commands.push(command)
    for (let name of listReferences(command, names)) {
      if (!seen.has(name)) {
        seen.add(name)
        queue.push(name)
      }
    }
  }
  return commands
}

/**
 * Finds the scripts a command runs.
 *
 * @param command - Command of a script.
 * @param names - Names of every script of the package.
 * @returns Names of the scripts it runs, in the order of the command.
 */
function listReferences(command: string, names: string[]): string[] {
  let references: string[] = []
  for (let segment of command.split(/&&|\|\||[&;|]/u)) {
    let words = segment
      .trim()
      .split(/\s+/u)
      .map(word =>
        word.replace(/^(?<quote>["'])(?<text>.*)\k<quote>$/u, '$<text>'),
      )
      .filter(word => !/^\w+=/u.test(word) && word !== 'cross-env')
    let [tool, ...rest] = words
    let targets = rest.filter(word => !word.startsWith('-'))
    let patterns: (RegExp | null)[] = []
    if (MANAGERS.has(tool!)) {
      let target =
        ['run-script', 'run'].includes(targets[0]!) ? targets[1] : targets[0]
      if (target !== undefined) {
        patterns.push(toPattern(target === 't' ? 'test' : target))
      }
    } else if (RUNNERS.has(tool!)) {
      for (let target of targets) {
        let source = target.split('*').map(escape).join('[^:]*')
        patterns.push(new RegExp(`^${source}$`, 'u'))
      }
    }
    for (let pattern of patterns) {
      references.push(...names.filter(name => pattern?.test(name)))
    }
  }
  return references
}

/**
 * Turns the script argument of a package manager into a pattern of names: a
 * name, or a regular expression between slashes, as pnpm takes it.
 *
 * @param target - Argument after `run`, or the script name itself.
 * @returns Pattern that matches the names it runs, or null for an invalid
 *   regular expression, which runs nothing.
 */
function toPattern(target: string): RegExp | null {
  if (/^\/.+\/$/u.test(target)) {
    try {
      return new RegExp(target.slice(1, -1), 'u')
    } catch {
      return null
    }
  }
  return new RegExp(`^${escape(target)}$`, 'u')
}

/**
 * Escapes the characters of a text that have a meaning in a regular expression.
 *
 * @param text - Text to match literally.
 * @returns Source of a regular expression that matches the text.
 */
function escape(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)
}
