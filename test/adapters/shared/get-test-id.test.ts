import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getTestId } from '../../../adapters/shared/get-test-id'
import { createDigest } from '../../../core/cache/create-digest'

describe('getTestId', () => {
  it('hashes the relative path, name and occurrence', () => {
    let root = path.resolve('/project')
    let id = getTestId(root, path.join(root, 'test', 'a.test.js'), {
      name: 'suite > a',
      occurrence: 1,
    })

    expect(id).toBe(
      createDigest(['test/a.test.js', 'suite > a', 1]).slice(0, 16),
    )
    expect(
      getTestId(path.resolve('/other'), path.resolve('/other/test/a.test.js'), {
        name: 'suite > a',
        occurrence: 1,
      }),
    ).toBe(id)
    expect(
      getTestId(root, path.join(root, 'test', 'a.test.js'), {
        name: 'suite > a',
        occurrence: 0,
      }),
    ).not.toBe(id)
  })

  it('gives the same id with no project and with an empty one', () => {
    let root = path.resolve('/project')
    let file = path.join(root, 'test', 'a.test.js')

    expect(
      getTestId(root, file, { name: 'suite > a', occurrence: 1, project: '' }),
    ).toBe(getTestId(root, file, { name: 'suite > a', occurrence: 1 }))
  })

  it('keeps the id a test without a project always had', () => {
    let root = path.resolve('/project')

    expect(
      getTestId(root, path.join(root, 'test', 'a.test.js'), {
        name: 'suite > a',
        occurrence: 1,
      }),
    ).toBe('84486fd70e7912cb')
  })

  it('hashes the project after the other parts when there is one', () => {
    let root = path.resolve('/project')
    let file = path.join(root, 'test', 'a.test.js')
    let first = getTestId(root, file, {
      name: 'suite > a',
      project: 'first',
      occurrence: 1,
    })
    let second = getTestId(root, file, {
      name: 'suite > a',
      project: 'second',
      occurrence: 1,
    })

    expect(first).toBe(
      createDigest(['test/a.test.js', 'suite > a', 1, 'first']).slice(0, 16),
    )
    expect(second).not.toBe(first)
  })
})
