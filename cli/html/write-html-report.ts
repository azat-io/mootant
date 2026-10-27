import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Writes the HTML report, creating its directory when it does not exist yet.
 *
 * @param file - Absolute path of the report.
 * @param html - Text of the report.
 */
export async function writeHtmlReport(
  file: string,
  html: string,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, html)
}
