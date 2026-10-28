import { describe, expect, it } from 'vitest'

import { resolveRunSettings } from '../../../core/config/resolve-run-settings'

describe('resolveRunSettings', () => {
  it('fills in the defaults without options and configuration', () => {
    let settings = resolveRunSettings({}, {})

    expect(settings).toStrictEqual({
      limits: {
        hitLimit: { floor: 100_000, factor: 100 },
        timeout: { constant: 250, factor: 3 },
      },
      incremental: false,
      concurrency: null,
      threshold: null,
      cache: true,
      fast: false,
    })
    expect(JSON.stringify(settings.limits)).toBe(
      '{"hitLimit":{"floor":100000,"factor":100},"timeout":{"constant":250,"factor":3}}',
    )
  })

  it('takes the settings of the configuration over the defaults', () => {
    let settings = resolveRunSettings(
      {},
      {
        hitLimit: { factor: 2, floor: 5 },
        timeout: { factor: 1 },
        incremental: true,
        concurrency: 3,
        threshold: 50,
        cache: false,
        fast: true,
      },
    )

    expect(settings).toStrictEqual({
      limits: {
        timeout: { constant: 250, factor: 1 },
        hitLimit: { factor: 2, floor: 5 },
      },
      incremental: true,
      concurrency: 3,
      threshold: 50,
      cache: false,
      fast: true,
    })
    expect(JSON.stringify(settings.limits)).toBe(
      '{"hitLimit":{"floor":5,"factor":2},"timeout":{"constant":250,"factor":1}}',
    )
  })

  it('lets the options win over the configuration', () => {
    expect(
      resolveRunSettings(
        {
          incremental: false,
          concurrency: 2,
          threshold: 80,
          cache: true,
          fast: false,
        },
        {
          incremental: true,
          concurrency: 5,
          threshold: 10,
          cache: false,
          fast: true,
        },
      ),
    ).toMatchObject({
      incremental: false,
      concurrency: 2,
      threshold: 80,
      cache: true,
      fast: false,
    })
  })
})
