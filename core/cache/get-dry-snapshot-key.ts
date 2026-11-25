import { availableParallelism } from 'node:os'
import { createHash } from 'node:crypto'

import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { TestAdapter } from '../../types/adapter/test-adapter'
import type { LimitSettings } from '../../types/run/run-state'

import { INSTRUMENTER_VERSION } from '../instrument/instrumenter-version'
import { RUNTIME_VERSION } from '../runtime/runtime-version'
import { getPortablePath } from './get-portable-path'
import { CACHE_VERSION } from './cache-version'
import { createDigest } from './create-digest'
import { version } from '../../package.json'
import { getBuildId } from './get-build-id'

/**
 * Builds the key of a saved dry run (`DrySnapshot`) over what the dry run was
 * asked to do and how the run reads it: the versions of mootant, its build, the
 * cache, the instrumenter and the runtime; the adapter; the version of Node.js
 * with the platform; the project root and the configuration file, whose text
 * the hash of the project tree takes in, so a run of another configuration in
 * the same root never replays it; the working directory, which configuration
 * and tests may read; what the test runner starts with: the concurrency, which
 * a global setup may read, the number of cores a default one comes from, and
 * whether units run in parallel; the try limits; the preset and its mutators;
 * the switched files given to the dry run with their texts, which name every
 * hosted mutant; and the files it relates tests to.
 *
 * @param input - Settings, adapter and files of the dry run.
 * @param input.setup - Preset, active mutators, preset settings and the
 *   configuration file.
 * @param input.context - Concurrency and parallel units the test runner starts
 *   with (`AdapterContext`).
 * @param input.switched - Switched files given to the dry run, in order.
 * @param input.related - Absolute paths of the files the dry run relates tests
 *   to, in order.
 * @param input.limits - How try limits grow from the dry run.
 * @param input.adapter - Adapter of the run.
 * @param input.root - Project root.
 * @returns SHA-256 in hex.
 */
export function getDrySnapshotKey(input: {
  setup: {
    mutators: ActiveMutator[]
    file: string | null
    settings: unknown
    preset: string
  }
  context: { concurrency: number | null; parallelUnits: boolean }
  switched: readonly SwitchedFile[]
  related: readonly string[]
  limits: LimitSettings
  adapter: TestAdapter
  root: string
}): string {
  let { context, setup, root } = input
  return createDigest([
    CACHE_VERSION,
    version,
    getBuildId(),
    INSTRUMENTER_VERSION,
    RUNTIME_VERSION,
    [input.adapter.name, input.adapter.version ?? null],
    [process.version, process.platform, process.arch],
    root,
    setup.file === null ? null : getPortablePath(setup.file, root),
    process.cwd(),
    [context.concurrency, availableParallelism(), context.parallelUnits],
    input.limits,
    [
      setup.mutators.map(mutator => [mutator.id, mutator.options]),
      setup.settings,
      setup.preset,
    ],
    input.switched.map(file => [
      getPortablePath(file.file, root),
      createHash('sha256').update(file.switched).digest('hex'),
      createHash('sha256').update(file.original).digest('hex'),
    ]),
    input.related.map(file => getPortablePath(file, root)),
  ])
}
