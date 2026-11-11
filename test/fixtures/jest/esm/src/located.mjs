import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function locate(depth) {
  let file = fileURLToPath(import.meta.url)
  return depth > 0 ? path.basename(path.dirname(file)) : path.basename(file)
}
