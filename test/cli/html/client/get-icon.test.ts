import { describe, expect, it } from 'vitest'

import { getIcon } from '../../../../cli/html/client/get-icon'

describe('getIcon', () => {
  it('returns an icon of the docs hidden from assistive technology', () => {
    let icon = getIcon('sun')

    expect(icon).toMatch(/^<svg class="icon icon-sun" aria-hidden="true"/u)
    expect(icon).not.toMatch(/\s(?:height|width)="/u)
  })
})
