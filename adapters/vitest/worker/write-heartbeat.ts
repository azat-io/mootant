import { writeSync } from 'node:fs'

import type { VitestHeartbeat } from '../types/vitest-worker'

/**
 * Overwrites the heartbeat file of a worker in place through its open
 * descriptor, which costs one system call. The JSON text is padded with spaces
 * to the length of the previous beat, so no old text is left after it. The main
 * process notices the new sequence number and gives the worker the beat's
 * budget from then on.
 *
 * @param descriptor - File descriptor of the heartbeat file, open for writing.
 * @param beat - Content of the beat.
 * @param length - Length of the text the file holds now.
 * @returns Length of the text the file holds after the write.
 */
export function writeHeartbeat(
  descriptor: number,
  beat: VitestHeartbeat,
  length: number,
): number {
  let text = JSON.stringify(beat).padEnd(length)
  writeSync(descriptor, text, 0)
  return text.length
}
