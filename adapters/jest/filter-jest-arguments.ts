import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { FlagKind } from './types/flag-kind'

/**
 * Flags that do not reach Jest, by the name its parser gives them.
 */
const DROPPED_FLAGS = new Map<string, FlagKind>([
  ['coveragePathIgnorePatterns', 'array'],
  ['changedFilesWithAncestor', 'boolean'],
  ['workerIdleMemoryLimit', 'value'],
  ['testResultsProcessor', 'value'],
  ['collectCoverageFrom', 'value'],
  ['openHandlesTimeout', 'value'],
  ['findRelatedTests', 'boolean'],
  ['coverageDirectory', 'value'],
  ['coverageReporters', 'array'],
  ['coverageThreshold', 'value'],
  ['collectCoverage', 'boolean'],
  ['coverageProvider', 'value'],
  ['updateSnapshot', 'boolean'],
  ['workerThreads', 'boolean'],
  ['cacheDirectory', 'value'],
  ['logHeapUsage', 'boolean'],
  ['onlyFailures', 'boolean'],
  ['collectTests', 'boolean'],
  ['detectLeaks', 'boolean'],
  ['onlyChanged', 'boolean'],
  ['changedSince', 'value'],
  ['clearCache', 'boolean'],
  ['lastCommit', 'boolean'],
  ['showConfig', 'boolean'],
  ['forceExit', 'boolean'],
  ['listTests', 'boolean'],
  ['outputFile', 'value'],
  ['notifyMode', 'value'],
  ['coverage', 'boolean'],
  ['showSeed', 'boolean'],
  ['watchAll', 'boolean'],
  ['reporters', 'array'],
  ['version', 'boolean'],
  ['expand', 'boolean'],
  ['notify', 'boolean'],
  ['cache', 'boolean'],
  ['debug', 'boolean'],
  ['watch', 'boolean'],
  ['help', 'boolean'],
  ['init', 'boolean'],
  ['json', 'boolean'],
  ['shard', 'value'],
  ['ci', 'boolean'],
  ['bail', 'bail'],
])

/**
 * Flags that reach Jest with words after them, so that `--findRelatedTests`
 * does not take those words for its files.
 */
const KEPT_FLAGS = new Map<string, FlagKind>([
  ['waitForUnhandledRejections', 'boolean'],
  ['unmockedModulePathPatterns', 'array'],
  ['workerGracefulExitTimeout', 'value'],
  ['modulePathIgnorePatterns', 'array'],
  ['testLocationInResults', 'boolean'],
  ['transformIgnorePatterns', 'array'],
  ['watchPathIgnorePatterns', 'array'],
  ['testEnvironmentOptions', 'value'],
  ['testPathIgnorePatterns', 'array'],
  ['moduleFileExtensions', 'array'],
  ['detectOpenHandles', 'boolean'],
  ['errorOnDeprecated', 'boolean'],
  ['snapshotSerializers', 'array'],
  ['testFailureExitCode', 'value'],
  ['setupFilesAfterEnv', 'array'],
  ['passWithNoTests', 'boolean'],
  ['moduleDirectories', 'array'],
  ['runTestsByPath', 'boolean'],
  ['moduleNameMapper', 'value'],
  ['testPathPatterns', 'array'],
  ['injectGlobals', 'boolean'],
  ['testNamePattern', 'value'],
  ['testPathPattern', 'array'],
  ['testEnvironment', 'value'],
  ['resetModules', 'boolean'],
  ['restoreMocks', 'boolean'],
  ['noStackTrace', 'boolean'],
  ['globalTeardown', 'value'],
  ['ignoreProjects', 'array'],
  ['maxConcurrency', 'value'],
  ['selectProjects', 'array'],
  ['testSequencer', 'value'],
  ['clearMocks', 'boolean'],
  ['resetMocks', 'boolean'],
  ['skipFilter', 'boolean'],
  ['prettierPath', 'value'],
  ['runInBand', 'boolean'],
  ['useStderr', 'boolean'],
  ['randomize', 'boolean'],
  ['globalSetup', 'value'],
  ['modulePaths', 'array'],
  ['testTimeout', 'value'],
  ['automock', 'boolean'],
  ['watchman', 'boolean'],
  ['setupFiles', 'array'],
  ['testRunner', 'value'],
  ['maxWorkers', 'value'],
  ['verbose', 'boolean'],
  ['testMatch', 'array'],
  ['testRegex', 'array'],
  ['transform', 'value'],
  ['silent', 'boolean'],
  ['colors', 'boolean'],
  ['projects', 'array'],
  ['resolver', 'value'],
  ['color', 'boolean'],
  ['globals', 'value'],
  ['rootDir', 'value'],
  ['config', 'value'],
  ['filter', 'value'],
  ['preset', 'value'],
  ['all', 'boolean'],
  ['roots', 'array'],
  ['haste', 'value'],
  ['seed', 'value'],
  ['env', 'value'],
])

/**
 * Dropped flags that ask for what mootant does not do, so dropping them gets a
 * warning.
 */
const WARNED_FLAGS = new Set([
  'changedFilesWithAncestor',
  'findRelatedTests',
  'updateSnapshot',
  'collectTests',
  'changedSince',
  'onlyFailures',
  'onlyChanged',
  'clearCache',
  'lastCommit',
  'showConfig',
  'listTests',
  'watchAll',
  'version',
  'watch',
  'shard',
  'bail',
  'help',
  'init',
])

/**
 * Long names of Jest's single-letter flags, by letter.
 */
const LETTER_FLAGS = new Map([
  ['t', 'testNamePattern'],
  ['u', 'updateSnapshot'],
  ['f', 'onlyFailures'],
  ['o', 'onlyChanged'],
  ['w', 'maxWorkers'],
  ['i', 'runInBand'],
  ['c', 'config'],
  ['e', 'expand'],
  ['b', 'bail'],
  ['h', 'help'],
])

/**
 * What the one word a flag of each kind can take looks like. A value can be `-`
 * or a negative number, which Jest's parser reads as no flag.
 */
const VALUE_WORDS: Record<Exclude<FlagKind, 'array'>, RegExp> = {
  bail: /^(?:true|false|\d+)$/u,
  boolean: /^(?:false|true)$/u,
  value: /^(?!-(?!\.?\d).)/u,
}

/**
 * A word Jest's parser reads as a flag; a negative number is none.
 */
const FLAG = /^-(?!\.?\d)/u

/**
 * A word of letters, each a flag of its own to Jest's parser.
 */
const BUNDLE = /^-[A-Za-z]{2,}$/u

/**
 * A short flag that holds its number of workers in the word, as Jest's parser
 * reads `-w4`.
 */
const WORKERS_IN_WORD = /^-w\d/u

/**
 * Flag that goes where a dropped flag was, before a positional, so that the
 * flag before it does not take the positional for its value. It changes
 * nothing, since mootant gives Jest `--ci` anyway.
 */
const SEPARATOR = '--ci=true'

/**
 * Removes from Jest's arguments of a test command what must not reach the host:
 * flags that print and exit, write files, change what runs or report, and those
 * mootant sets itself. Names are looked up as Jest's parser reads them, so
 * `--update-snapshot` is `--updateSnapshot`, `--no-coverage` is `--coverage`
 * and `--u` is `-u`; what stays is left as written. A word of letters that are
 * all single-letter flags is split only when it holds a dropped one. `--` ends
 * the flags: it and what follows stay. `--findRelatedTests`, when Jest reads it
 * as true, also drops every positional. A concurrency drops what says how many
 * workers Jest uses, as mootant then says it: Jest refuses `--runInBand` next
 * to `--maxWorkers`, and of two `--maxWorkers` it takes the first.
 * `--detectOpenHandles` stays, as it decides how many workers Jest would use,
 * which the resolved configuration tells, and it changes nothing in a worker.
 * `--silent` and `--verbose` stay too: they pick the console of tests, which
 * the resolved configuration tells, while the host's reporters are mootant's.
 * So does `--useStderr`, which sends a console that writes at once to standard
 * error. Jest sets it for `--json` too, so a `--json` Jest reads as true adds
 * it before any `--`.
 *
 * @param given - Words after Jest's binary.
 * @param concurrency - Most test files at once, or null to keep Jest's own.
 * @returns The words that stay, in order, the warnings about those dropped, and
 *   `--runInBand` as written, if Jest reads it as true.
 * @throws {Error} When the arguments hold `--runner`, which Jest would read as
 *   a list together with mootant's own.
 */
export function filterJestArguments(
  given: readonly string[],
  concurrency: number | null,
): {
  diagnostics: Diagnostic[]
  serial: string | null
  args: string[]
} {
  /**
   * Tells whether a flag does not reach Jest.
   *
   * @param name - Name of the flag; the word itself for an unknown short flag.
   * @returns Whether it goes.
   */
  function isDropped(name: string): boolean {
    return (
      DROPPED_FLAGS.has(name) ||
      (concurrency !== null &&
        (name === 'maxWorkers' ||
          name === 'runInBand' ||
          WORKERS_IN_WORD.test(name)))
    )
  }

  let end = given.indexOf('--')
  let words = (end === -1 ? given : given.slice(0, end)).flatMap(word =>
    splitBundle(word, isDropped),
  )
  let tail = end === -1 ? [] : given.slice(end)
  let related = findTrueFlag(words, 'findRelatedTests') !== null
  let diagnostics: Diagnostic[] = []
  let kept: string[] = []
  let afterDropped = false
  for (let index = 0; index < words.length; index++) {
    let word = words[index]!
    if (FLAG.test(word)) {
      let name = readName(word)
      if (name === 'runner') {
        throw new Error(
          'mootant gives Jest its own runner, and Jest fails on a second one; remove --runner from the test command.',
        )
      }
      let count = countValues(
        word,
        readKind(word, name),
        words.slice(index + 1),
      )
      afterDropped = isDropped(name)
      if (!afterDropped) {
        kept.push(...words.slice(index, index + count + 1))
      } else if (WARNED_FLAGS.has(name)) {
        let written = word.split('=', 1)[0]!
        diagnostics.push({
          message:
            name === 'updateSnapshot' ?
              `mootant never writes snapshots, so it ignores ${written} of the test command.`
            : `mootant ignores ${written} of the test command.`,
          code: 'config-overridden',
          severity: 'warning',
          column: null,
          line: null,
          file: null,
        })
      }
      index += count
    } else if (!related) {
      kept.push(...(afterDropped && kept.length > 0 ? [SEPARATOR] : []), word)
      afterDropped = false
    }
  }
  if (findTrueFlag(words, 'json') !== null) {
    kept.push('--useStderr')
  }
  return {
    serial: findTrueFlag(words, 'runInBand')?.split('=', 1)[0] ?? null,
    args: related ? kept : [...kept, ...tail],
    diagnostics,
  }
}

/**
 * Splits a word of single-letter flags such as `-iu` when it holds a dropped
 * flag. A value flag that is not the last letter reads as empty, as if it were
 * not there, so it goes and leaves the next word to the flag that takes it.
 *
 * @param word - A word of the arguments.
 * @param isDropped - Tells whether a flag does not reach Jest.
 * @returns One word per letter that stays, or the word itself.
 */
function splitBundle(
  word: string,
  isDropped: (name: string) => boolean,
): string[] {
  if (!BUNDLE.test(word)) {
    return [word]
  }
  let letters = [...word.slice(1)]
  let names = letters.map(letter => LETTER_FLAGS.get(letter))
  return (
      names.every(name => name !== undefined) &&
        names.some(name => isDropped(name))
    ) ?
      letters
        .filter(
          (_, index) =>
            index === letters.length - 1 ||
            KEPT_FLAGS.get(names[index]!) !== 'value',
        )
        .map(letter => `-${letter}`)
    : [word]
}

/**
 * Counts the words after a flag that belong to it; a `--no-` form takes none.
 *
 * @param word - The flag as written.
 * @param kind - How Jest's parser reads it, if it takes words at all.
 * @param following - Words after the flag.
 * @returns How many of them are its values.
 */
function countValues(
  word: string,
  kind: undefined | FlagKind,
  following: readonly string[],
): number {
  if (kind === undefined || word.startsWith('--no-')) {
    return 0
  }
  if (kind === 'array') {
    let next = following.findIndex(value => FLAG.test(value))
    return next === -1 ? following.length : next
  }
  return !word.includes('=') && VALUE_WORDS[kind].test(following[0] ?? '--') ?
      1
    : 0
}

/**
 * Finds a boolean flag Jest's parser reads as true, which its last mention
 * decides: `=false`, any other text after `=`, a following `false` and `--no-`
 * all read as false.
 *
 * @param words - Words before `--`.
 * @param name - What Jest's parser calls it.
 * @returns Its last mention when Jest reads it as true, or null.
 */
function findTrueFlag(words: readonly string[], name: string): string | null {
  let last = words.findLastIndex(
    word => FLAG.test(word) && readName(word) === name,
  )
  let word = words[last]
  if (word === undefined || word.startsWith('--no-')) {
    return null
  }
  let isTrue =
    word.includes('=') ? word.endsWith('=true') : words[last + 1] !== 'false'
  return isTrue ? word : null
}

/**
 * Reads the name Jest's parser gives a flag, whose `--no-` form sets the same
 * name and whose letters also go with two dashes.
 *
 * @param word - The flag as written, with its value after `=` if any.
 * @returns Name in camel case; the word itself for an unknown short flag.
 */
function readName(word: string): string {
  let written = word.split('=', 1)[0]!
  if (!written.startsWith('--')) {
    return LETTER_FLAGS.get(written.slice(1)) ?? written
  }
  let name = toCamelCase(written.replace(/^--(?:no-)?/u, ''))
  return LETTER_FLAGS.get(name) ?? name
}

/**
 * Reads how Jest's parser reads the words after a flag; a word of letters gives
 * them to its last letter.
 *
 * @param word - The flag as written.
 * @param name - Its name.
 * @returns Its kind, if it takes words at all.
 */
function readKind(word: string, name: string): undefined | FlagKind {
  let last = BUNDLE.test(word) ? LETTER_FLAGS.get(word.at(-1)!) : name
  return DROPPED_FLAGS.get(last ?? name) ?? KEPT_FLAGS.get(last ?? name)
}

/**
 * Turns a flag name into the form Jest's parser also reads it in.
 *
 * @param name - Name such as `update-snapshot`.
 * @returns Name such as `updateSnapshot`.
 */
function toCamelCase(name: string): string {
  return name.replaceAll(/-(?<letter>.)/gu, (_, letter: string) =>
    letter.toUpperCase(),
  )
}
