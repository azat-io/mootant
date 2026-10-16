import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { readImport } from '../../../core/syntax/read-import'

describe('readImport', () => {
  it.each([
    [
      "import { setTimeout as wait } from 'node:timers'\nwait()",
      { source: 'node:timers', name: 'setTimeout' },
    ],
    [
      "import { setTimeout as wait } from 'timers/promises'\nwait()",
      { source: 'timers/promises', name: 'setTimeout' },
    ],
    [
      "import { 'setTimeout' as wait } from 'timers'\nwait()",
      { name: 'setTimeout', source: 'timers' },
    ],
    [
      "import * as wait from 'node:timers/promises'\nwait()",
      { source: 'node:timers/promises', name: '*' },
    ],
    [
      "import wait from 'node:timers/promises'\nwait()",
      { source: 'node:timers/promises', name: 'default' },
    ],
  ])('reads the import of %s', (source, expected) => {
    let { scopes, find } = createTestFile(source)

    expect(readImport(scopes, find('Identifier', 'wait', 1))).toStrictEqual(
      expected,
    )
  })

  it('reads a name used before its import', () => {
    let { scopes, find } = createTestFile(
      "setTimeout()\nimport { setTimeout } from 'node:timers'",
    )

    expect(readImport(scopes, find('Identifier', 'setTimeout'))).toStrictEqual({
      source: 'node:timers',
      name: 'setTimeout',
    })
  })

  it.each([
    'wait()',
    'let wait = f\nwait()',
    "import type { wait } from 'a'\nwait()",
    'namespace N { export let x = 1 }\nimport wait = N.x\nwait()',
    'namespace M { import wait = N.x; wait() }',
  ])('reads no import of %s', source => {
    let { scopes, find } = createTestFile(source)

    expect(readImport(scopes, find('Identifier', 'wait', 0))).toBeNull()
  })
})
