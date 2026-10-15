import { describe, expect, it } from 'vitest'

import { createTryFacts } from '../../helpers/create-try-facts'
import { readDryRun } from '../../../core/run/read-dry-run'

describe('readDryRun', () => {
  it('reads coverage, first reaches, unrepeatable tests and bounds', () => {
    let analysis = readDryRun({
      tests: [
        {
          tries: [
            createTryFacts({ covers: ['m1', 'm2'], duration: 3, hits: 4 }),
            createTryFacts({ covers: ['m1', 'm3'], duration: 5, hits: 2 }),
          ],
          file: '/t/a.test.ts',
          project: '',
          name: 'a',
          line: 1,
          id: 'a',
        },
        {
          tries: [createTryFacts({ covers: ['m1'], skipped: true })],
          file: '/t/a.test.ts',
          project: '',
          name: 'b',
          line: 2,
          id: 'b',
        },
        {
          tries: [
            createTryFacts({ covers: null }),
            createTryFacts({ covers: null, failed: true }),
          ],
          file: '/t/b.test.ts',
          project: '',
          line: null,
          name: 'c',
          id: 'c',
        },
        {
          tries: [createTryFacts({ strays: ['late'] }), createTryFacts()],
          file: '/t/b.test.ts',
          project: '',
          line: null,
          name: 'd',
          id: 'd',
        },
      ],
      files: [
        {
          file: '/t/a.test.ts',
          loadFailed: false,
          concurrent: false,
          loadDuration: 7,
          hookDuration: 0,
          covers: ['m4'],
          project: '',
          errors: [],
          hits: 1,
        },
        {
          errors: ['stray outside tests'],
          file: '/t/b.test.ts',
          loadFailed: false,
          concurrent: false,
          loadDuration: 2,
          hookDuration: 5,
          covers: ['m4'],
          project: '',
          hits: 1,
        },
      ],
      mismatched: [],
      outside: [],
      served: [],
      hung: [],
    })

    expect(analysis.stable).toStrictEqual(
      new Map([['m1', new Set(['a', 'b'])]]),
    )
    expect(analysis.firstReach).toStrictEqual(
      new Map([
        ['m2', new Set(['a'])],
        ['m3', new Set(['a'])],
      ]),
    )
    expect(analysis.loadCovers).toStrictEqual(
      new Map([['m4', new Set(['/t/a.test.ts', '/t/b.test.ts'])]]),
    )
    expect(analysis.unrepeatable).toStrictEqual(new Set(['c', 'd']))
    expect(analysis.strayTests).toStrictEqual(new Set(['d']))
    expect(analysis.strayFiles).toStrictEqual(new Set(['/t/b.test.ts']))
    expect(analysis.baselines.get('a')).toStrictEqual({ duration: 5, hits: 4 })
    expect(analysis.order).toStrictEqual(
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]),
    )
    expect(analysis.fileTests).toStrictEqual(
      new Map([
        ['/t/a.test.ts', ['a', 'b']],
        ['/t/b.test.ts', ['c', 'd']],
      ]),
    )
    expect(analysis.loads.get('/t/b.test.ts')).toStrictEqual({
      duration: 7,
      hits: 1,
    })
    expect(analysis.tests.get('c')?.name).toBe('c')
  })

  it('records strays of a test tried once without calling it unrepeatable', () => {
    let analysis = readDryRun({
      tests: [
        {
          tries: [createTryFacts({ strays: ['late'], covers: ['m1'] })],
          file: '/t/a.test.ts',
          project: '',
          line: null,
          name: 'a',
          id: 'a',
        },
      ],
      mismatched: [],
      outside: [],
      served: [],
      files: [],
      hung: [],
    })

    expect(analysis.strayTests).toStrictEqual(new Set(['a']))
    expect(analysis.unrepeatable).toStrictEqual(new Set())
    expect(analysis.stable).toStrictEqual(new Map([['m1', new Set(['a'])]]))
  })

  it('keeps a test file of two projects apart', () => {
    let analysis = readDryRun(
      {
        files: ['a', 'b'].map(project => ({
          file: '/t/a.test.ts',
          loadFailed: false,
          concurrent: false,
          hookDuration: 0,
          loadDuration: 1,
          covers: ['m2'],
          errors: [],
          hits: 0,
          project,
        })),
        tests: ['a', 'b'].map(project => ({
          tries: [createTryFacts({ covers: ['m1'] })],
          file: '/t/a.test.ts',
          id: `${project}1`,
          name: 'one',
          line: null,
          project,
        })),
        mismatched: [],
        outside: [],
        served: [],
        hung: [],
      },
      new Set(['/t/a.test.ts\0b']),
    )

    // Only project b failed when its tests ran twice.
    expect(analysis.unrepeatable).toStrictEqual(new Set(['b1']))
    expect(analysis.fileTests).toStrictEqual(
      new Map([
        ['/t/a.test.ts\0a', ['a1']],
        ['/t/a.test.ts\0b', ['b1']],
      ]),
    )
    expect(analysis.loadCovers.get('m2')).toStrictEqual(
      new Set(['/t/a.test.ts\0a', '/t/a.test.ts\0b']),
    )
    expect(analysis.testFiles.get('/t/a.test.ts\0b')).toStrictEqual({
      file: '/t/a.test.ts',
      project: 'b',
    })
  })
})
