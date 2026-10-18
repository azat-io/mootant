import { describe, expect, it } from 'vitest'

import { getDryDeadline } from '../../../adapters/node-test/get-dry-deadline'

describe('getDryDeadline', () => {
  it('gives the test budget while a try runs, else the file budget', () => {
    let timeouts = { file: 1000, test: 50 }

    expect(
      getDryDeadline({ records: [], spawned: 5, last: 10 }, timeouts, 0),
    ).toBe(1010)
    expect(
      getDryDeadline(
        {
          records: [
            { occurrence: 0, kind: 'open', name: 'a', seq: 0 },
            { occurrence: 0, kind: 'open', name: 'b', seq: 1 },
            { kind: 'close', seq: 0 },
          ],
          spawned: 5,
          last: 10,
        },
        timeouts,
        7,
      ),
    ).toBe(67)
    expect(
      getDryDeadline(
        {
          records: [
            { occurrence: 0, kind: 'open', name: 'a', seq: 0 },
            { kind: 'close', seq: 0 },
            { kind: 'loaded' },
          ],
          spawned: 5,
          last: 10,
        },
        { file: Infinity, test: 50 },
        0,
      ),
    ).toBe(Infinity)
  })
})
