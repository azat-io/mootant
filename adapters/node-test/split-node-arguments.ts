/**
 * Node flags that take their value from the next word when it is not given
 * after `=`.
 */
const VALUE_FLAGS = new Set([
  '--experimental-test-tag-filter',
  '--experimental-test-isolation',
  '--test-reporter-destination',
  '--experimental-default-type',
  '--experimental-config-file',
  '--test-coverage-functions',
  '--test-coverage-branches',
  '--test-coverage-exclude',
  '--test-coverage-include',
  '--unhandled-rejections',
  '--experimental-loader',
  '--test-coverage-lines',
  '--test-rerun-failures',
  '--env-file-if-exists',
  '--max-old-space-size',
  '--test-name-pattern',
  '--test-skip-pattern',
  '--test-global-setup',
  '--localstorage-file',
  '--redirect-warnings',
  '--test-random-seed',
  '--test-concurrency',
  '--disable-warning',
  '--test-isolation',
  '--test-reporter',
  '--test-timeout',
  '--inspect-port',
  '--watch-path',
  '--input-type',
  '--stack-size',
  '--conditions',
  '--test-shard',
  '--env-file',
  '--require',
  '--import',
  '--loader',
  '--title',
  '-r',
  '-C',
])

/**
 * Splits the words after `node` into Node flags and test files: every word up
 * to the first that is not a flag is a flag, with the next word as its value
 * when the flag takes one and has no `=`; that word and every word after it, as
 * everything after `--`, are test files or globs, as Node takes them with
 * `--test`.
 *
 * @param words - Words after the Node binary.
 * @returns Flags in order, each with its value, and the test files.
 */
export function splitNodeArguments(words: readonly string[]): {
  flags: string[][]
  files: string[]
} {
  let flags: string[][] = []
  let index = 0
  while (index < words.length) {
    let word = words[index]!
    if (word === '--') {
      index += 1
      break
    }
    if (word === '-' || !word.startsWith('-')) {
      break
    }
    if (index + 1 < words.length && VALUE_FLAGS.has(word)) {
      flags.push([word, words[index + 1]!])
      index += 2
    } else {
      flags.push([word])
      index += 1
    }
  }
  return { files: words.slice(index), flags }
}
