import { describe, expect, it, vi } from 'vitest'

import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { AdapterSession } from '../../../types/adapter/adapter-session'

import { startVitestSession } from '../../../adapters/vitest/start-vitest-session'
import { vitestAdapter } from '../../../adapters/vitest/index'
import { version } from '../../../package.json'

vi.mock(import('../../../adapters/vitest/start-vitest-session'), () => ({
  startVitestSession: vi.fn(),
}))

describe('vitestAdapter', () => {
  it("creates a batch adapter with mootant's version that starts a Vitest session", async () => {
    let session = {} as AdapterSession
    vi.mocked(startVitestSession).mockResolvedValue(session)
    let context = {} as AdapterContext
    let adapter = vitestAdapter({ config: 'vitest.unit.ts' })

    expect(adapter).toMatchObject({ name: 'vitest', batch: true, version })
    await expect(adapter.start(context)).resolves.toBe(session)
    expect(startVitestSession).toHaveBeenCalledWith(context, {
      config: 'vitest.unit.ts',
    })

    await vitestAdapter().start(context)

    expect(startVitestSession).toHaveBeenLastCalledWith(context, {})
  })
})
