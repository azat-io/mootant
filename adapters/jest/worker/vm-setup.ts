import type { WorkerChannel } from '../types/worker-channel'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { installVmSide } from './install-vm-side'
import { CHANNEL_SLOT } from './channel-slot'

/**
 * First of a project's `setupFiles`. It runs inside the test's vm, where
 * `require` goes through `moduleNameMapper` and automock, so neither this file
 * nor what it imports has a `node:` import. The channel comes on the vm's
 * `process`, since Jest 30.5 sends `process.getBuiltinModule` through
 * `moduleNameMapper` as well.
 */
installVmSide({
  channel: Reflect.get(process, CHANNEL_SLOT) as WorkerChannel,
  install: installMutantRuntime,
  target: globalThis,
})
