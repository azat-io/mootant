import { StringDecoder } from 'node:string_decoder'
import { Writable } from 'node:stream'

/**
 * Creates a stream that hands everything written to it to a callback as text,
 * such as what Vitest's workers and logger print. Bytes are decoded as UTF-8
 * across chunks, so a character split between two chunks of a pipe stays
 * whole.
 *
 * @param onOutput - Receives each chunk as text.
 * @returns Writable stream.
 */
export function createOutputStream(onOutput: (text: string) => void): Writable {
  let decoder = new StringDecoder('utf8')
  return new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      let text = decoder.write(chunk)
      if (text !== '') {
        onOutput(text)
      }
      callback()
    },
    final: callback => {
      let rest = decoder.end()
      if (rest !== '') {
        onOutput(rest)
      }
      callback()
    },
  })
}
