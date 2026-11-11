import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestReady } from './types/jest-ready'
import type { HostTest } from './types/host-test'

/**
 * The host's `--runner`. Jest loads it once it has read its configuration,
 * built the haste map and run global setup.
 */
export default class MootantHostRunner {
  /**
   * Parks Jest until mootant asks to close or goes away.
   */
  public runTests: (tests: readonly HostTest[]) => Promise<void>

  /**
   * Tells Jest this runner has no workers of its own; Jest only passes this on
   * as `serial`, which this runner ignores.
   */
  public isSerial = true

  /**
   * Keeps the global configuration for `ready`.
   *
   * @param globalConfig - Global configuration Jest resolved.
   */
  public constructor(globalConfig: JestGlobalConfig) {
    this.runTests = tests => parkHost(tests, globalConfig)
  }
}

/**
 * Sends what workers need to know and waits; once this returns, Jest runs
 * global teardown. Listeners are installed here only, because a listener keeps
 * the channel, and with it a host that never gets here, alive. A channel that
 * closed before Jest got here ends the wait at once, so teardown runs then
 * too.
 *
 * @param tests - Every test file Jest would run, of every project.
 * @param globalConfig - Global configuration Jest resolved.
 * @returns A promise that resolves on `close` or when the channel closes.
 */
function parkHost(
  tests: readonly HostTest[],
  globalConfig: JestGlobalConfig,
): Promise<void> {
  return new Promise(resolve => {
    if (!process.connected) {
      resolve()
      return
    }
    process.on('disconnect', resolve)
    process.on('message', message => {
      if ((message as { type: string }).type === 'close') {
        resolve()
      }
    })
    let ready: JestReady = {
      moduleMaps: Object.fromEntries(
        tests.map(test => [
          test.context.config.id,
          test.context.moduleMap.toJSON(),
        ]),
      ),
      configs: Object.fromEntries(
        tests.map(test => [test.context.config.id, test.context.config]),
      ),
      tests: tests.map(test => ({
        project: test.context.config.id,
        path: test.path,
      })),
      env: process.env as Record<string, string>,
      loaded: Object.keys(require.cache),
      umask: process.umask(),
      cwd: process.cwd(),
      type: 'ready',
      globalConfig,
    }
    process.send!(ready)
  })
}
