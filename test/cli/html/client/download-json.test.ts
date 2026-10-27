// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadJson } from '../../../../cli/html/client/download-json'

describe('downloadJson', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('saves a value as a JSON file and frees its address later', async () => {
    vi.useFakeTimers()
    let blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      blobs.push(blob as Blob)
      return 'blob:report'
    })
    let revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let links: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      links.push(`${this.download} ${this.getAttribute('href')}`)
    })
    downloadJson(document, 'report.json', { score: 50 })

    expect(links).toStrictEqual(['report.json blob:report'])
    expect(blobs[0]!.type).toBe('application/json')
    await expect(blobs[0]!.text()).resolves.toBe('{"score":50}')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)

    expect(revoke).toHaveBeenCalledWith('blob:report')
  })
})
