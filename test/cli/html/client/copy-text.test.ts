// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from '../../../../cli/html/client/copy-text'

describe('copyText', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('copies through the clipboard and marks the button for a while', async () => {
    vi.useFakeTimers()
    let writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    let button = document.createElement('button')
    await copyText(button, 'mootant run src')

    expect(writeText).toHaveBeenCalledWith('mootant run src')
    expect(button.dataset['copied']).toBe('')
    vi.advanceTimersByTime(2000)

    expect(button.dataset['copied']).toBeUndefined()
  })

  it('copies through a selected text area when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied'),
    )
    let copied: string[] = []
    /* Happy DOM has no execCommand, which browsers still keep. */
    Object.defineProperty(document, 'execCommand', {
      value: () => false,
      configurable: true,
      writable: true,
    })
    vi.spyOn(document, 'execCommand').mockImplementation((command: string) => {
      copied.push(`${command}:${document.querySelector('textarea')!.value}`)
      return true
    })
    let button = document.createElement('button')
    document.body.append(button)
    await copyText(button, 'text')

    expect(copied).toStrictEqual(['copy:text'])
    expect(document.querySelector('textarea')).toBeNull()
    expect(button.dataset['copied']).toBe('')
  })
})
