import { createRequire } from 'node:module'

export async function pickImport(flag: boolean): Promise<number> {
  if (flag) {
    return 1
  }
  let name = '../lib/extra.js'
  let extra = (await import(/* @vite-ignore */ name)) as { value: number }
  return extra.value
}

export function pickRequire(flag: boolean): number {
  if (flag) {
    return 1
  }
  let name = '../lib/extra.cjs'
  return (createRequire(import.meta.url)(name) as { value: number }).value
}
