import { describe, expect, it } from 'vitest'

import { getWordmark } from '../../../../cli/html/client/get-wordmark'

describe('getWordmark', () => {
  it('takes the svg of the docs wordmark without Astro attributes', () => {
    let wordmark = getWordmark()

    expect(wordmark).toMatch(/^<svg class="wordmark" aria-hidden="true"/u)
    expect(wordmark).toContain('viewBox="0 0 1063 256"')
    expect(wordmark).toMatch(/<\/svg>$/u)
    expect(wordmark).not.toMatch(/[{}]/u)
  })
})
