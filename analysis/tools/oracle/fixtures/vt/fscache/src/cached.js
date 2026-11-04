import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { compute } from './compute.js'

export function cachedCompute(value, directory) {
  let file = path.join(directory, `${value}.json`)
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  let result = compute(value)
  mkdirSync(directory, { recursive: true })
  writeFileSync(file, JSON.stringify(result))
  return result
}
