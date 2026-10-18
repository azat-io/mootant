import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { initialize, load } from '../../../../adapters/node-test/preload/hooks'

describe('hooks', () => {
  it('switches modules loaded through the hooks thread', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-hooks-'))
    let file = path.join(directory, 'a.js')
    let entry = path.join(directory, '0.json')
    await writeFile(
      entry,
      JSON.stringify({ switched: 'a - b', original: 'a + b', file }),
    )
    let plan = path.join(directory, 'plan.json')
    await writeFile(plan, JSON.stringify({ [file]: entry }))
    let out = path.join(directory, 'out.jsonl')
    initialize({ main: path.join(directory, 'a.test.js'), plan, out })
    let next = vi.fn(() =>
      Promise.resolve({ format: 'module' as const, source: 'a + b' }),
    )
    let url = pathToFileURL(file).href
    let result = await load(url, { conditions: [] } as never, next)

    expect(result.source).toBe(
      `a - b\n;globalThis[Symbol.for("mootant.served")]?.(${JSON.stringify(file)})`,
    )
    expect(next).toHaveBeenCalledWith(url, { conditions: [] })
    await expect(readFile(out, 'utf8')).resolves.toBe(
      `${JSON.stringify({ kind: 'load', file })}\n`,
    )

    await rm(directory, { recursive: true })
  })
})
