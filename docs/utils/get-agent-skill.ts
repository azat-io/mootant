import { parseFrontmatter } from '@astrojs/markdown-remark'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

/**
 * Agent skill of Mootant as agent skill discovery publishes it.
 */
export interface AgentSkill {
  /**
   * Files of the skill packed into a gzipped tar archive.
   */
  archive: Uint8Array<ArrayBuffer>

  /**
   * When to use the skill, from the frontmatter of `SKILL.md`.
   */
  description: string

  /**
   * Name of the skill, from the frontmatter of `SKILL.md`.
   */
  name: string
}

/**
 * Size of a header and of a data block in a tar archive.
 */
const BLOCK_SIZE = 512

/**
 * Longest file path that the name field of a tar header holds.
 */
const MAX_NAME_LENGTH = 100

/**
 * Directory of the skill. Endpoints are bundled, so it is found from the
 * directory the docs are built in.
 */
let directory = path.join(process.cwd(), 'skills', 'mootant')

/**
 * Reads the agent skill of the repository and packs its files, with `SKILL.md`
 * and its references at the root of the archive. Every entry gets the same
 * mode, owner and time, so the bytes of the archive change only with the files
 * and with the platform, whose code gzip writes into its header. Hidden files,
 * such as `.DS_Store`, are left out.
 *
 * @returns The skill with its archive.
 */
export async function getAgentSkill(): Promise<AgentSkill> {
  let { frontmatter } = parseFrontmatter(
    await readFile(path.join(directory, 'SKILL.md'), 'utf8'),
  )
  let entries = await readdir(directory, {
    withFileTypes: true,
    recursive: true,
  })
  let names = entries
    .filter(entry => entry.isFile())
    .map(entry =>
      path.relative(directory, path.join(entry.parentPath, entry.name)),
    )
    .filter(name => name.split(path.sep).every(part => !part.startsWith('.')))
    .map(name => name.split(path.sep).join('/'))
    .toSorted()
  let files = await Promise.all(
    names.map(async name => {
      let content = await readFile(path.join(directory, name))
      return [
        createHeader(name, content.length),
        content,
        Buffer.alloc((BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE),
      ]
    }),
  )
  return {
    archive: gzipSync(
      Buffer.concat([...files.flat(), Buffer.alloc(BLOCK_SIZE * 2)]),
      {
        level: 9,
      },
    ),
    description: String(frontmatter['description']),
    name: String(frontmatter['name']),
  }
}

/**
 * Writes the ustar header of a regular file.
 *
 * @param name - Path of the file in the archive.
 * @param size - Size of the file in bytes.
 * @returns Header block.
 * @throws Error - When the path does not fit the name field.
 */
function createHeader(name: string, size: number): Buffer {
  if (Buffer.byteLength(name) > MAX_NAME_LENGTH) {
    throw new Error(`Skill file path is too long for a tar header: ${name}`)
  }
  let header = Buffer.alloc(BLOCK_SIZE)
  header.write(name, 0)
  header.write('0000644\0', 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  header.write('00000000000\0', 136)
  header.write(' '.repeat(8), 148)
  header.write('0', 156)
  header.write('ustar\0', 257)
  header.write('00', 263)
  let checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148)
  return header
}
