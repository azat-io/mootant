import { describe, expect, it } from 'vitest'

import { renderCommand } from '../../../../cli/html/client/render-command'

describe('renderCommand', () => {
  it('shows the command with a prompt and a button that copies it', () => {
    let html = renderCommand('mootant run "src"')

    expect(html).toContain(
      '<code tabindex="0"><span class="prompt">$ </span>mootant run &quot;src&quot;</code',
    )
    expect(html).toContain('data-copy="mootant run &quot;src&quot;"')
    expect(html).toContain('icon-copy-check')
  })
})
