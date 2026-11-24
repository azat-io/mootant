import { readFlagName } from './read-flag-name'

/**
 * Flags with which Node takes flags or code from a file before any module the
 * command line loads: an env file may set `NODE_OPTIONS`, a config file may
 * import modules, and a snapshot blob runs code of its own.
 */
const EARLY_FLAGS = new Set([
  '--experimental-default-config-file',
  '--experimental-config-file',
  '--env-file-if-exists',
  '--snapshot-blob',
  '--config-file',
  '--env-file',
])

/**
 * Starts of flags that make a process do more than wait while it is idle: an
 * inspector that listens, a profiler that writes a profile as the process ends,
 * or a timeout that counts from the start of the process and would count the
 * wait for the unit.
 */
const WATCHING_FLAGS = [
  '--process-timeout',
  '--diagnostic-dir',
  '--heap-prof',
  '--cpu-prof',
  '--inspect',
  '--prof',
]

/**
 * Tells whether Node flags let a test process start before its unit, as a
 * spare: none of them takes flags or code from a file before the modules of the
 * command line, which mootant cannot see, and none makes an idle process listen
 * for a debugger, write a profile or spend its time limit. Names are read as
 * Node's option parser reads them (`readFlagName`).
 *
 * @param flags - Node flags of the process, those of `NODE_OPTIONS` too.
 * @returns Whether the process may start as a spare.
 */
export function allowsSpares(flags: readonly string[]): boolean {
  return flags.every(flag => {
    let name = readFlagName(flag)
    return (
      !EARLY_FLAGS.has(name) &&
      WATCHING_FLAGS.every(start => !name.startsWith(start))
    )
  })
}
