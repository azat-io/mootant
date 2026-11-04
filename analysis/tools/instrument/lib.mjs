// Shared helpers of the instrumentation harness (analysis, not part of mootant).
//
// Everything is parametrized by MOOTANT_ROOT: a checkout or installed package
// of mootant with a built `dist/` and its `node_modules` (oxc-parser, vite).
// Default: /home/user/wt/instrument (worktree of 170ec52 with dist copied from
// the base build).

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const MOOTANT_ROOT = process.env.MOOTANT_ROOT ?? '/home/user/wt/instrument'

let require = createRequire(path.join(MOOTANT_ROOT, 'package.json'))

/** Imports a module of mootant's dist by its path under dist/. */
export async function importDist(relative) {
  return import(pathToFileURL(path.join(MOOTANT_ROOT, 'dist', relative)).href)
}

/** oxc-parser of the mootant checkout. */
export const oxc = require('oxc-parser')

/** vite of the mootant checkout (transformWithOxc). */
export async function loadVite() {
  return import(pathToFileURL(require.resolve('vite')).href)
}

/**
 * Lists mutants with the mootant CLI (the given bin, run in `cwd`).
 * Returns the parsed `--json --verbose` report.
 */
export function listMutants({ cwd, paths, bin, preset, extra = [] }) {
  let args = [bin, 'list', ...paths, '--json', '--verbose']
  if (preset) args.push('--preset', preset)
  args.push(...extra)
  let out = execFileSync(process.execPath, args, {
    maxBuffer: 1 << 30,
    encoding: 'utf8',
    cwd,
  })
  return JSON.parse(out)
}

/** Groups report mutants by display path (file). */
export function groupByFile(mutants) {
  let files = new Map()
  for (let mutant of mutants) {
    let list = files.get(mutant.file)
    if (!list) files.set(mutant.file, (list = []))
    list.push(mutant)
  }
  return files
}

/** Parser options mootant uses for a file (see core/parser/get-parser-options.ts). */
export function parserOptions(file) {
  let lower = file.toLowerCase()
  let table = [
    ['.tsx', { sourceType: 'unambiguous', lang: 'tsx' }],
    ['.jsx', { sourceType: 'unambiguous', lang: 'jsx' }],
    ['.cjs', { sourceType: 'commonjs', lang: 'jsx' }],
    ['.cts', { sourceType: 'commonjs', lang: 'ts' }],
    ['.mjs', { sourceType: 'module', lang: 'jsx' }],
    ['.mts', { sourceType: 'module', lang: 'ts' }],
    ['.js', { sourceType: 'unambiguous', lang: 'jsx' }],
    ['.ts', { sourceType: 'unambiguous', lang: 'ts' }],
  ]
  for (let [extension, options] of table) {
    if (lower.endsWith(extension)) return { ...options }
  }
  return null
}

/** Applies a mutant physically: raw replacement text in place of its range. */
export function applyRaw(source, mutant) {
  return source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end)
}

/** Reads a file as UTF-8. */
export function read(file) {
  return readFileSync(file, 'utf8')
}

/** Deterministic PRNG (mulberry32) for reproducible samples. */
export function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks `count` distinct items with a seeded PRNG. */
export function sample(items, count, seed = 1) {
  let random = createRandom(seed)
  let copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    let other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy.slice(0, count)
}
