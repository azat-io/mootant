import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { SwitchedFile } from '../../../types/adapter/switched-file'
import type { SwitchPlan } from '../../shared/types/switch-plan'
import type { WorkerProject } from '../types/worker-project'
import type { WorkerChannel } from '../types/worker-channel'
import type { WorkerCalls } from '../types/worker-calls'

import { getErrorMessage } from '../../shared/get-error-message'
import { TS_JEST_PATH } from '../ts-jest-path'
import { switchSource } from './switch-source'

/**
 * `fs.readFileSync` as this module loads: CommonJS output reads a named import
 * on the real module at each use, where a test's `jest.spyOn(fs, ...)` reaches
 * it, and files load during tests.
 */
let readFile = readFileSync

/**
 * `crypto.createHash` as this module loads.
 */
let hash = createHash

/**
 * `path.extname` as this module loads.
 */
let readExtension = path.extname

/**
 * Extensions of the files Jest strips types from. Not `.tsx`: Node's strip-only
 * mode cannot parse JSX.
 */
const TYPESCRIPT_EXTENSIONS = new Set(['.cts', '.mts', '.ts'])

/**
 * A transformer of the project.
 */
interface RealTransformer {
  /**
   * Gives the key of a text for Jest's cache without blocking.
   */
  getCacheKeyAsync?(
    text: string,
    file: string,
    options: TransformOptions,
  ): Promise<string>

  /**
   * Transforms a text without blocking.
   */
  processAsync?(
    text: string,
    file: string,
    options: TransformOptions,
  ): Promise<unknown>

  /**
   * Makes the transformer of a module that is a factory.
   */
  createTransformer?(
    config: unknown,
  ): Promise<RealTransformer> | RealTransformer

  /**
   * Gives the key of a text for Jest's cache.
   */
  getCacheKey?(text: string, file: string, options: TransformOptions): string

  /**
   * Transforms a text.
   */
  process?(text: string, file: string, options: TransformOptions): unknown

  /**
   * Whether the transformer adds coverage counters itself.
   */
  canInstrument?: boolean
}

/**
 * The transformer Jest gets. All are closures: Jest calls them unbound on the
 * ESM path.
 */
interface WrappedTransformer {
  /**
   * Present when the real one has it, and writes what `getCacheKey` writes.
   */
  getCacheKeyAsync?(
    source: string,
    file: string,
    options: TransformOptions,
  ): Promise<string>

  /**
   * Present when the real one has it.
   */
  processAsync?(
    source: string,
    file: string,
    options: TransformOptions,
  ): Promise<unknown>

  /**
   * Always present, since Jest calls it before every read of its disk cache, so
   * it writes `served` and `mismatched`.
   */
  getCacheKey(source: string, file: string, options: TransformOptions): string

  /**
   * Present when the real one has it, since Jest 30's `canTransformSync` looks
   * at it.
   */
  process?(source: string, file: string, options: TransformOptions): unknown

  /**
   * Whether the real one adds coverage counters itself.
   */
  canInstrument: boolean
}

/**
 * What a worker works with to wrap transformers.
 */
interface TransformerFactoryInput {
  /**
   * Node's `stripTypeScriptTypes` when the project's Jest strips with it the
   * types of a TypeScript file no transformer of the project claims, else
   * null.
   */
  stripTypes: ((code: string, options: { mode: 'strip' }) => string) | null

  /**
   * Jest's own loader of the real transformer.
   */
  requireOrImportModule(file: string): Promise<unknown>

  /**
   * Projects of the session by id.
   */
  projects: ReadonlyMap<string, WorkerProject>

  /**
   * Channel of the worker.
   */
  channel: WorkerChannel

  /**
   * Calls running in the worker, whose `transformer` counts those of the real
   * transformers.
   */
  calls: WorkerCalls
}

/**
 * What Jest passes a transformer, as far as this wrapper reads it.
 */
interface TransformOptions {
  /**
   * Options of the transformer's entry in the configuration.
   */
  transformerConfig: unknown

  /**
   * Configuration of the project.
   */
  config: { id: string }

  /**
   * The configuration as JSON.
   */
  configString: string

  /**
   * Whether Jest asks the transformer to add coverage counters.
   */
  instrument: boolean
}

/**
 * Options of a transformer entry of a project copy.
 */
interface TransformerConfig {
  /**
   * Options the project gives the real transformer.
   */
  realConfig?: unknown

  /**
   * Absolute path of the switch plan, or null when the run switches nothing.
   */
  plan: string | null

  /**
   * Absolute path of the real transformer, or null for the catch-all entry.
   */
  real: string | null
}

/**
 * Creates the object `transformer.cjs` exports. Plans and their entries are
 * read once and kept for the life of the worker, since a plan is a new path and
 * a worker sees few. The entry for files no pattern of the project matches
 * hands on the text, or strips its types where the project's Jest would: in a
 * `.ts`, `.mts` or `.cts` file, with Node's function, whose output depends on
 * Node, so the version of Node joins its key. Each call into a real
 * transformer, from loading its module and making it to every key and
 * transform, is marked until it ends, so that what it reads, its configuration
 * among it, is told apart from what tests read: a warm worker does not read
 * that again, as Jest keeps what a transformer gave and a transformer keeps
 * what it read. An asynchronous key or transform holds `calls.asyncTransformer`
 * rather than a count, since Jest loads the other imports of an ES module while
 * it waits.
 *
 * @param input - What a worker works with.
 * @returns Object with the `createTransformer` Jest calls for each entry of a
 *   project copy.
 */
export function createTransformerFactory(input: TransformerFactoryInput): {
  createTransformer(config: TransformerConfig): Promise<WrappedTransformer>
} {
  let { requireOrImportModule, stripTypes, projects, channel, calls } = input
  let files = new Map<string, unknown>()
  let warned = false

  /**
   * Makes a synchronous call into a real transformer, which counts until it
   * returns.
   *
   * @param call - Makes the call.
   * @returns What the call returns.
   */
  function enter<Result>(call: () => Result): Result {
    calls.transformer += 1
    try {
      return call()
    } finally {
      calls.transformer -= 1
    }
  }

  /**
   * Loads the module of a real transformer or calls its factory, which counts
   * until it settles: Jest awaits both before it loads a test file, so no read
   * of the test file can come meanwhile.
   *
   * @param call - Makes the call.
   * @returns What the call settles with.
   */
  async function enterLoad<Result>(
    call: () => Promise<Result> | Result,
  ): Promise<Result> {
    calls.transformer += 1
    try {
      return await call()
    } finally {
      calls.transformer -= 1
    }
  }

  /**
   * Makes an asynchronous key or transform of a real transformer, inside which,
   * and in what it goes on with, `calls.asyncTransformer` holds true until it
   * settles. A count would take what Jest reads for another module meanwhile,
   * so the count of these, `calls.unsettled`, only tells whether one is left.
   *
   * @param call - Makes the call.
   * @returns What the call settles with.
   */
  async function enterAsync<Result>(
    call: () => Promise<Result> | Result,
  ): Promise<Result> {
    calls.unsettled += 1
    try {
      return await calls.asyncTransformer.run(true, async () => await call())
    } finally {
      calls.unsettled -= 1
    }
  }

  /**
   * Tells whether the project's Jest strips the types of a file no transformer
   * of the project claims.
   *
   * @param file - Absolute path of the module.
   * @returns Whether it does.
   */
  function strips(file: string): boolean {
    return stripTypes !== null && TYPESCRIPT_EXTENSIONS.has(readExtension(file))
  }

  /**
   * Strips types as Jest does: Node's one warning about the function is spent
   * on an empty text with warnings off, and a failure gets Jest's words.
   *
   * @param text - Text of the module.
   * @param file - Absolute path of the module.
   * @returns The text with its types erased.
   * @throws {Error} When Node cannot strip the text, such as one with an
   *   `enum`.
   */
  function strip(text: string, file: string): string {
    if (!warned) {
      warned = true
      let emitWarning = Object.getOwnPropertyDescriptor(process, 'emitWarning')!
      process.emitWarning = () => {}
      try {
        stripTypes!('', { mode: 'strip' })
      } finally {
        Object.defineProperty(process, 'emitWarning', emitWarning)
      }
    }
    try {
      return stripTypes!(text, { mode: 'strip' })
    } catch (error) {
      throw new Error(
        `jest: failed to strip TypeScript types from ${file}\n\n${(error as Error).message}\n\nNode.js only erases type annotations - it cannot compile TypeScript features that emit code, such as \`enum\`, \`namespace\` and parameter properties. Configure a \`transform\` using \`@babel/preset-typescript\` or \`ts-jest\` to handle this file.`,
        { cause: error },
      )
    }
  }

  /**
   * Transformer of a file no pattern of the project matches.
   */
  let identity: RealTransformer = {
    getCacheKey(text, file, options) {
      return hashText(text, file, options)
        .update(strips(file) ? process.version : '')
        .digest('hex')
    },
    process(text, file) {
      return { code: strips(file) ? strip(text, file) : text }
    },
  }

  /**
   * Reads a JSON file of a plan, once.
   *
   * @param file - Absolute path of the file.
   * @returns Its value.
   */
  function readJson(file: string): unknown {
    if (!files.has(file)) {
      files.set(file, JSON.parse(readFile(file, 'utf8')) as unknown)
    }
    return files.get(file)
  }

  /**
   * Finds the switched file of a module.
   *
   * @param plan - Absolute path of the plan, or null.
   * @param file - Absolute path of the module.
   * @returns The switched file, if the plan has it.
   */
  function findEntry(
    plan: string | null,
    file: string,
  ): SwitchedFile | undefined {
    let entry = plan === null ? undefined : (readJson(plan) as SwitchPlan)[file]
    return entry === undefined ? undefined : (readJson(entry) as SwitchedFile)
  }

  /**
   * Wraps a transformer: it gets the switched text, and options with the plain
   * project, so the plan and mootant's paths never reach its cache key.
   *
   * @param real - Transformer to wrap.
   * @param handed - Options the transformer was made with.
   * @param plan - Absolute path of the plan, or null.
   * @returns The transformer Jest gets.
   */
  function wrap(
    real: RealTransformer,
    handed: unknown,
    plan: string | null,
  ): WrappedTransformer {
    /**
     * Gives the options of the real transformer.
     *
     * @param options - Options from Jest.
     * @returns The options with the plain project.
     */
    function plain(options: TransformOptions): TransformOptions {
      let project = projects.get(options.config.id)!
      return {
        ...options,
        configString: project.configString,
        transformerConfig: handed,
        config: project.config,
      }
    }

    /**
     * Switches the text of a module.
     *
     * @param source - Text from Jest.
     * @param file - Absolute path of the module.
     * @returns The text and what happened to it.
     */
    function switchText(
      source: string,
      file: string,
    ): ReturnType<typeof switchSource> {
      return switchSource(findEntry(plan, file), source)
    }

    /**
     * Writes that a text was served or mismatched; the disk cache may then
     * spare the transformer, so this happens where the key is made.
     *
     * @param kind - What happened to the text.
     * @param file - Absolute path of the module.
     */
    function note(
      kind: ReturnType<typeof switchSource>['kind'],
      file: string,
    ): void {
      if (kind !== null) {
        channel.write(channel.token, { kind, file })
      }
    }

    /**
     * Writes that the transformer failed on a switched text; a failure on any
     * other text is the project's own.
     *
     * @param error - What the transformer threw.
     * @param kind - What happened to the text.
     * @param file - Absolute path of the module.
     */
    function noteFailure(
      error: unknown,
      kind: ReturnType<typeof switchSource>['kind'],
      file: string,
    ): void {
      if (kind === 'served') {
        channel.write(channel.token, {
          message: getErrorMessage(error),
          kind: 'rejected',
          file,
        })
      }
    }

    let wrapped: WrappedTransformer = {
      getCacheKey(source, file, options) {
        let { text, kind } = switchText(source, file)
        note(kind, file)
        try {
          return enter(() =>
            real.getCacheKey ?
              real.getCacheKey(text, file, plain(options))
            : hashText(text, file, plain(options)).digest('hex'),
          )
        } catch (error) {
          noteFailure(error, kind, file)
          throw error
        }
      },
      canInstrument: Boolean(real.canInstrument),
    }
    if (real.process) {
      wrapped.process = (source, file, options) => {
        let { text, kind } = switchText(source, file)
        try {
          return enter(() => real.process!(text, file, plain(options)))
        } catch (error) {
          noteFailure(error, kind, file)
          throw error
        }
      }
    }
    if (real.processAsync) {
      wrapped.processAsync = async (source, file, options) => {
        let { text, kind } = switchText(source, file)
        try {
          return await enterAsync(() =>
            real.processAsync!(text, file, plain(options)),
          )
        } catch (error) {
          noteFailure(error, kind, file)
          throw error
        }
      }
    }
    if (real.getCacheKeyAsync) {
      wrapped.getCacheKeyAsync = async (source, file, options) => {
        let { text, kind } = switchText(source, file)
        note(kind, file)
        try {
          return await enterAsync(() =>
            real.getCacheKeyAsync!(text, file, plain(options)),
          )
        } catch (error) {
          noteFailure(error, kind, file)
          throw error
        }
      }
    }
    return wrapped
  }

  return {
    async createTransformer({ realConfig, plan, real }) {
      if (real === null) {
        return wrap(identity, undefined, plan)
      }
      // A clone, since `@swc/jest` changes its options in place: that changes
      // the project copy and every worker's second unit misses Jest's in-memory
      // transforms.
      let clone = structuredClone(realConfig)
      let handed =
        TS_JEST_PATH.test(real) ?
          { ...(clone as object), diagnostics: false }
        : clone
      let loaded = (await enterLoad(() =>
        requireOrImportModule(real),
      )) as RealTransformer
      return wrap(
        typeof loaded.createTransformer === 'function' ?
          await enterLoad(() => loaded.createTransformer!(handed))
        : loaded,
        handed,
        plan,
      )
    },
  }
}

/**
 * Starts the key of a text for a transformer that has no key of its own: the
 * text, the plain project, whether Jest asks for coverage counters, and the
 * file.
 *
 * @param text - Text of the module.
 * @param file - Absolute path of the module.
 * @param options - Plain options.
 * @returns The hash, to update further or digest.
 */
function hashText(
  text: string,
  file: string,
  options: TransformOptions,
): ReturnType<typeof createHash> {
  return hash('sha1')
    .update(text)
    .update(options.configString)
    .update(options.instrument ? 'instrument' : '')
    .update(file)
}
