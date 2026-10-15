import { describe, expect, it } from 'vitest'

import type { VitestSessionState } from '../../../adapters/vitest/types/vitest-session-state'

import { indexSwitchedFiles } from '../../../adapters/vitest/index-switched-files'

describe('indexSwitchedFiles', () => {
  it('indexes switched files by real path', () => {
    let state = { keys: new Map() } as VitestSessionState
    let entry = { file: '/missing/a.ts', original: 'a', switched: 'b' }

    expect(indexSwitchedFiles([entry], state)).toStrictEqual(
      new Map([['/missing/a.ts', entry]]),
    )
    expect(state.keys.get('/missing/a.ts')).toBe('/missing/a.ts')
  })
})
