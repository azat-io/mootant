/**
 * Whether adapters may start spare test processes, once read, or null before.
 */
let prefork: boolean | null = null

/**
 * Tells whether the adapters may start spare test processes: processes started
 * ahead of the unit that will run in them, which load no module of the project
 * before it. `MOOTANT_PREFORK=0` turns them off, for comparing runs with and
 * without them. The variable is read once per process and removed, so the test
 * processes never see it.
 *
 * @returns Whether spare processes may start.
 */
export function readPreforkSwitch(): boolean {
  prefork ??= process.env['MOOTANT_PREFORK'] !== '0'
  delete process.env['MOOTANT_PREFORK']
  return prefork
}
