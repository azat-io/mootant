import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Reads the SVG markup of an icon from the icons of the docs.
 *
 * @param name - File name of the icon without the extension.
 * @returns SVG markup of the icon.
 */
export function readIcon(name: string): string {
  return readFileSync(
    path.join(import.meta.dirname, '..', 'icons', `${name}.svg`),
    'utf8',
  )
}
