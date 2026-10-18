import { afterEach, describe, expect, it, vi } from 'vitest'

import { stopLiveProcessGroups } from '../../../adapters/node-test/stop-live-process-groups'
import { LIVE_PROCESS_GROUPS } from '../../../adapters/node-test/live-process-groups'

describe('stopLiveProcessGroups', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('kills every live process group and forgets them', () => {
    let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    LIVE_PROCESS_GROUPS.add(41).add(42)
    stopLiveProcessGroups()

    expect(kill.mock.calls).toStrictEqual([
      [-41, 'SIGKILL'],
      [-42, 'SIGKILL'],
    ])
    expect(LIVE_PROCESS_GROUPS.size).toBe(0)
  })
})
