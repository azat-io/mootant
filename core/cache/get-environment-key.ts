import path from 'node:path'

import type { LimitSettings } from '../../types/run/run-state'

import { INSTRUMENTER_VERSION } from '../instrument/instrumenter-version'
import { RUNTIME_VERSION } from '../runtime/runtime-version'
import { compareCodeUnits } from '../compare-code-units'
import { CACHE_VERSION } from './cache-version'
import { createDigest } from './create-digest'
import { version } from '../../package.json'

/**
 * What every cached verdict of a run depends on beyond its mutant and test
 * file.
 */
interface EnvironmentInput {
  /**
   * Adapter name and version, and the version of the test runner, or null when
   * they do not tell.
   */
  runner: { version: string | null; runner: string | null; adapter: string }

  /**
   * Preset, active mutators with their options and preset settings.
   */
  mutators: { mutators: unknown; settings: unknown; preset: string }

  /**
   * Hashes of the files by absolute path, null for a missing one.
   */
  hashes: ReadonlyMap<string, string | null>

  /**
   * How try limits grow from the dry run.
   */
  limits: LimitSettings

  /**
   * Settings of the test runner that change verdicts (`CacheInputs`).
   */
  settings: unknown

  /**
   * Absolute paths of the files every verdict depends on, such as the test
   * runner configuration, `.env` files and the lockfile.
   */
  files: string[]

  /**
   * Stamp of mootant's own build, so a rebuild of an unreleased version does
   * not reuse verdicts of the previous build.
   */
  build: number

  /**
   * Project root; paths are hashed relative to it.
   */
  root: string
}

/**
 * Builds the environment key of a run: mootant's version and build, the
 * versions of the instrumenter, the runtime and the cache, the adapter and test
 * runner, the hashes of the files every verdict depends on, the settings of the
 * test runner, the try limits, the preset and its mutators, and the major
 * version of Node.js with the platform. Concurrency and fast mode are not part
 * of it.
 *
 * @param input - Versions, files, hashes and settings of the run.
 * @returns SHA-256 in hex.
 */
export function getEnvironmentKey(input: EnvironmentInput): string {
  let { hashes, root } = input
  let files = [...new Set(input.files)]
    .map(file => [
      path.relative(root, file).replaceAll('\\', '/'),
      hashes.get(file) ?? null,
    ])
    .toSorted(([left], [right]) => compareCodeUnits(left!, right!))
  return createDigest([
    CACHE_VERSION,
    version,
    input.build,
    INSTRUMENTER_VERSION,
    RUNTIME_VERSION,
    input.runner,
    files,
    input.settings ?? null,
    input.limits,
    input.mutators,
    process.versions.node.split('.', 1)[0],
    process.platform,
    process.arch,
  ])
}
