import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeHtmlReport } from '../../../cli/html/write-html-report'

describe('writeHtmlReport', () => {
  it('writes the report, creating its directory', async () => {
    let root = await mkdtemp(path.join(tmpdir(), 'mootant-html-'))
    try {
      let file = path.join(root, '.mootant', 'nested', 'report.html')
      await writeHtmlReport(file, '<!doctype html>')

      await expect(readFile(file, 'utf8')).resolves.toBe('<!doctype html>')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
