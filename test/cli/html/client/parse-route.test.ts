import { describe, expect, it } from 'vitest'

import { parseRoute } from '../../../../cli/html/client/parse-route'

describe('parseRoute', () => {
  it.each([
    ['', { name: 'overview' }],
    ['#/', { name: 'overview' }],
    ['#/unknown', { name: 'overview' }],
    ['#/files', { name: 'files', path: null, line: null }],
    ['#/file/src/a.ts', { path: 'src/a.ts', name: 'files', line: null }],
    ['#/file/src/a%20b.ts:12', { path: 'src/a b.ts', name: 'files', line: 12 }],
    ['#/file/', { name: 'files', path: null, line: null }],
    ['#/mutant/abcd', { name: 'mutant', id: 'abcd' }],
    ['#/mutants', { name: 'mutants' }],
    ['#/mutators', { name: 'mutators' }],
    ['#/tests', { name: 'tests' }],
    ['#/tests/12', { name: 'test', index: 12 }],
    ['#/tests/x', { name: 'overview' }],
    ['#/file/a%.ts', { name: 'files', path: 'a%.ts', line: null }],
    ['#/file/a%3A5', { name: 'files', path: 'a:5', line: null }],
    ['#/mutant/ab%63d', { name: 'mutant', id: 'abcd' }],
  ])('reads %j', (hash, route) => {
    expect(parseRoute(hash)).toStrictEqual(route)
  })
})
