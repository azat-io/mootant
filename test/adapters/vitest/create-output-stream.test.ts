import { describe, expect, it } from 'vitest'

import { createOutputStream } from '../../../adapters/vitest/create-output-stream'

describe('createOutputStream', () => {
  it('hands every chunk to the callback as text', async () => {
    let chunks: string[] = []
    let stream = createOutputStream(text => {
      chunks.push(text)
    })

    stream.write('a\n')
    stream.write(Buffer.from('b'))
    await new Promise<void>(resolve => {
      stream.end(resolve)
    })

    expect(chunks).toStrictEqual(['a\n', 'b'])
  })

  it('keeps a character split between chunks whole', async () => {
    let chunks: string[] = []
    let stream = createOutputStream(text => {
      chunks.push(text)
    })
    let bytes = Buffer.from('я😀')

    stream.write(bytes.subarray(0, 1))
    stream.write(bytes.subarray(1, 4))
    stream.write(bytes.subarray(4))
    await new Promise<void>(resolve => {
      stream.end(resolve)
    })

    expect(chunks.join('')).toBe('я😀')
    expect(chunks).not.toContain('�')
  })

  it('hands over the bytes of a cut character at the end', async () => {
    let chunks: string[] = []
    let stream = createOutputStream(text => {
      chunks.push(text)
    })

    stream.write(Buffer.from('a'))
    stream.write(Buffer.from('я').subarray(0, 1))
    await new Promise<void>(resolve => {
      stream.end(resolve)
    })

    expect(chunks).toStrictEqual(['a', '�'])
  })
})
