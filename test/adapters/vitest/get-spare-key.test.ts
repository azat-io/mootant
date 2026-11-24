import { describe, expect, it } from 'vitest'

import { getSpareKey } from '../../../adapters/vitest/get-spare-key'

/**
 * Vitest's own preload, which it gives every forks worker.
 */
let own = ['--require', '/vitest/suppress-warnings.cjs']

describe('getSpareKey', () => {
  it('keys a worker by its environment, flags, Vitest and working directory', () => {
    let options = {
      env: { NODE_OPTIONS: '--max-old-space-size=500', A: '1' },
      execArgv: [...own, '--conditions', 'node'],
      distPath: '/vitest/dist',
    }

    expect(getSpareKey(options)).toBe(
      JSON.stringify([
        options.env,
        options.execArgv,
        '/vitest/dist',
        process.cwd(),
      ]),
    )
    expect(getSpareKey({ ...options, env: { A: '2' } })).not.toBe(
      getSpareKey(options),
    )
  })

  it('gives no key to a worker that loads other modules first, takes flags from a file or is watched', () => {
    for (let [execArgv, nodeOptions] of [
      [[...own, '--import', 'tsx'], ''],
      [['--require=/vitest/other.cjs'], ''],
      [own, '-r ./setup.cjs'],
      [own, '--loader=./loader.mjs'],
      [own, '--experimental_loader=./loader.mjs'],
      [own, '"--require" ./setup.cjs'],
      [[...own, '--env-file=.env'], ''],
      [[...own, '--inspect-brk'], ''],
      [[...own, '--process-timeout=30s'], ''],
      [own, '--cpu-prof'],
    ] as const) {
      expect(
        getSpareKey({
          env: { NODE_OPTIONS: nodeOptions },
          distPath: '/vitest/dist',
          execArgv: [...execArgv],
        }),
      ).toBeNull()
    }
  })
})
