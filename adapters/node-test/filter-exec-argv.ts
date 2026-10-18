import type { Diagnostic } from '../../types/mutant/diagnostic'

/**
 * Flags left out without a word: mootant runs every test file as a plain `node`
 * process (no `--test`), reads results from its own hooks instead of reporters,
 * decides concurrency itself, and never collects coverage, whose thresholds
 * would fail runs of single test files.
 */
const SILENT = new Set([
  '--experimental-test-coverage',
  '--test-reporter-destination',
  '--test-concurrency',
  '--test-reporter',
  '--test',
])

/**
 * Flags left out with a warning, since a mootant run cannot honour them.
 */
const IGNORED = new Set([
  '--watch-preserve-output',
  '--test-update-snapshots',
  '--test-rerun-failures',
  '--watch-path',
  '--test-shard',
  '--watch',
])

/**
 * Seed of random order every session pins when the command randomizes without
 * one: the dry run and the units order tests the same way, and so do runs one
 * after another, which keeps cached verdicts valid.
 */
const RANDOM_SEED = 1

/**
 * Flags that choose how node:test isolates test files.
 */
const ISOLATION = new Set(['--experimental-test-isolation', '--test-isolation'])

/**
 * Turns the Node flags of a test command into the flags of mootant's test
 * processes, which run one test file each without `--test`: `--test`,
 * reporters, `--test-concurrency` and coverage flags are left out; watch mode,
 * sharding, `--test-rerun-failures` and `--test-update-snapshots` are left out
 * with a warning; the isolation setting is left out, with a warning when it was
 * `none`; `--test-global-setup` is kept with a warning, since it then runs in
 * every test process; `--test-randomize` without a seed gets a fixed seed, so
 * every process of every run orders tests the same way. Every other flag is
 * kept in order.
 *
 * @param flags - Flags of the command, each with its value.
 * @returns Flags of the test processes and `config-overridden` warnings.
 */
export function filterExecArgv(flags: readonly (readonly string[])[]): {
  diagnostics: Diagnostic[]
  execArgv: string[]
} {
  let messages = new Map<string, string>()
  let execArgv: string[] = []
  let names = flags.map(([flag]) => flag!.split('=', 1)[0]!)
  for (let [index, flag] of flags.entries()) {
    let name = names[index]!
    let value = flag[1] ?? flag[0]!.slice(name.length + 1)
    if (IGNORED.has(name)) {
      messages.set(
        name,
        name === '--test-update-snapshots' ?
          'mootant never writes snapshots, so it ignores --test-update-snapshots of the test command.'
        : `mootant ignores ${name} of the test command.`,
      )
    } else if (ISOLATION.has(name)) {
      if (value === 'none') {
        messages.set(
          name,
          `mootant runs every test file in a process of its own, so it ignores ${name}=none of the test command.`,
        )
      }
    } else if (!SILENT.has(name) && !name.startsWith('--test-coverage-')) {
      execArgv.push(...flag)
      if (name === '--test-global-setup') {
        messages.set(
          name,
          'The global setup of --test-global-setup runs in every test process under mootant, not once per run.',
        )
      }
    }
  }
  if (
    names.includes('--test-randomize') &&
    !names.includes('--test-random-seed')
  ) {
    execArgv.push(`--test-random-seed=${RANDOM_SEED}`)
  }
  return {
    diagnostics: [...messages.values()].map(message => ({
      code: 'config-overridden',
      severity: 'warning',
      column: null,
      line: null,
      file: null,
      message,
    })),
    execArgv,
  }
}
