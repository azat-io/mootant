import { describe, expect, it } from 'vitest'

import { getUnitDeadline } from '../../../adapters/node-test/get-unit-deadline'

describe('getUnitDeadline', () => {
  it('counts the timeout from the start of the preload', () => {
    expect(getUnitDeadline({ spawned: 100, records: [], last: 100 }, 500)).toBe(
      10_600,
    )
    expect(
      getUnitDeadline(
        {
          records: [
            {
              node: 'v26.0.0',
              hooks: 'sync',
              kind: 'start',
              time: 300,
              pid: 1,
            },
          ],
          spawned: 100,
          last: 300,
        },
        500,
      ),
    ).toBe(800)
  })
})
