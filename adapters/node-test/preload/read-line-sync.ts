import { closeSync, readSync } from 'node:fs'

/**
 * Bytes read at once.
 */
const CHUNK_SIZE = 65_536

/**
 * Milliseconds to wait before reading again when no data is ready yet.
 */
const RETRY_DELAY = 10

/**
 * Error codes after which a read is tried again: no data yet on a non-blocking
 * descriptor, or a signal that interrupted the read.
 */
const RETRY_CODES = new Set(['EAGAIN', 'EINTR'])

/**
 * Reads the first line of a file descriptor, blocking the thread until its end
 * arrives, then closes the descriptor. A read that finds no data ready yet or
 * is interrupted by a signal is tried again; an error of another kind ends the
 * input.
 *
 * @param descriptor - File descriptor to read, such as a pipe.
 * @returns The line without its line feed, or null when the input ended before
 *   one.
 */
export function readLineSync(descriptor: number): string | null {
  let buffer = Buffer.alloc(CHUNK_SIZE)
  let pause = new Int32Array(new SharedArrayBuffer(4))
  let chunks: Buffer[] = []
  try {
    for (;;) {
      let count: number
      try {
        count = readSync(descriptor, buffer, 0, buffer.length, null)
      } catch (error) {
        if (!RETRY_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
          return null
        }
        Atomics.wait(pause, 0, 0, RETRY_DELAY)
        continue
      }
      if (count === 0) {
        return null
      }
      let chunk = buffer.subarray(0, count)
      let end = chunk.indexOf(10)
      chunks.push(Buffer.from(end === -1 ? chunk : chunk.subarray(0, end)))
      if (end !== -1) {
        return Buffer.concat(chunks).toString('utf8')
      }
    }
  } finally {
    try {
      closeSync(descriptor)
    } catch {}
  }
}
