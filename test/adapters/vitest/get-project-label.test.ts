import { describe, expect, it } from 'vitest'

import { getProjectLabel } from '../../../adapters/vitest/get-project-label'

describe('getProjectLabel', () => {
  it('names a project', () => {
    expect(getProjectLabel({ name: '' } as never)).toBe('the Vitest project')
    expect(getProjectLabel({ name: 'unit' } as never)).toBe('project "unit"')
  })
})
