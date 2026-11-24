import {
  writeFileSync,
  mkdtempSync,
  fstatSync,
  openSync,
  rmSync,
} from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readLineSync } from '../../../../adapters/node-test/preload/read-line-sync'

vi.mock(import('node:fs'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, readSync: vi.fn(actual.readSync) as never }
})

let { readSync } = await import('node:fs')

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Opens a file with the given text for reading.
 *
 * @param text - Text of the file.
 * @returns File descriptor.
 */
function open(text: string): number {
  directory = mkdtempSync(path.join(tmpdir(), 'mootant-line-'))
  let file = path.join(directory, 'input')
  writeFileSync(file, text)
  return openSync(file, 'r')
}

/**
 * Tells whether a file descriptor is closed.
 *
 * @param descriptor - File descriptor.
 * @returns Whether it is closed.
 */
function isClosed(descriptor: number): boolean {
  try {
    fstatSync(descriptor)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EBADF'
  }
}

describe('readLineSync', () => {
  afterEach(() => {
    vi.mocked(readSync).mockReset()
    rmSync(directory, { recursive: true, force: true })
  })

  it('reads the first line and closes the descriptor', () => {
    let descriptor = open('{"a":1}\nrest\n')

    expect(readLineSync(descriptor)).toBe('{"a":1}')
    expect(isClosed(descriptor)).toBe(true)
  })

  it('reads a line longer than one chunk', () => {
    let line = 'x'.repeat(200_000)
    let descriptor = open(`${line}\n`)

    expect(readLineSync(descriptor)).toBe(line)
  })

  it('gives null when the input ends before a line', () => {
    let descriptor = open('no line feed')

    expect(readLineSync(descriptor)).toBeNull()
    expect(isClosed(descriptor)).toBe(true)
  })

  it('reads again when no data is ready or a signal interrupted the read', () => {
    let descriptor = open('line\n')
    for (let code of ['EAGAIN', 'EINTR']) {
      vi.mocked(readSync).mockImplementationOnce(() => {
        throw Object.assign(new Error(code), { code })
      })
    }

    expect(readLineSync(descriptor)).toBe('line')
    expect(readSync).toHaveBeenCalledTimes(3)
  })

  it('gives null on any other error, also without a code', () => {
    let descriptor = open('line\n')
    vi.mocked(readSync).mockImplementationOnce(() => {
      throw new Error('broken')
    })

    expect(readLineSync(descriptor)).toBeNull()
    expect(readLineSync(-1)).toBeNull()
    expect(isClosed(descriptor)).toBe(true)
  })

  it('waits for a pipe until a line arrives, and gives null when it closes empty', async () => {
    let module = pathToFileURL(
      path.resolve(
        import.meta.dirname,
        '../../../../adapters/node-test/preload/read-line-sync.ts',
      ),
    ).href
    /**
     * Starts a process that reads a line from its descriptor 3 and prints it.
     *
     * @param write - Writes to the pipe of descriptor 3.
     * @returns What the process printed.
     */
    async function readThroughPipe(
      write: (pipe: NodeJS.WritableStream) => void,
    ): Promise<string> {
      let child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { readLineSync } from ${JSON.stringify(module)}
          console.log(JSON.stringify(readLineSync(3)))`,
        ],
        { stdio: ['ignore', 'pipe', 'inherit', 'pipe'] },
      )
      let output = ''
      child.stdout!.setEncoding('utf8').on('data', (text: string) => {
        output += text
      })
      setTimeout(() => {
        write(child.stdio[3] as NodeJS.WritableStream)
      }, 200)
      await new Promise(resolve => {
        child.on('close', resolve)
      })
      return output.trim()
    }

    await expect(
      readThroughPipe(pipe => {
        pipe.end('unit\n')
      }),
    ).resolves.toBe('"unit"')
    await expect(
      readThroughPipe(pipe => {
        pipe.end()
      }),
    ).resolves.toBe('null')
  })
})
