import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import * as moduleApi from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readNodeRuntime } from '../../../adapters/node-test/read-node-runtime'

/**
 * Directory of the current test.
 */
let directory = ''

/**
 * Whether the running Node has `registerHooks`, so that the probe imports a
 * CommonJS module.
 */
let synchronous = 'registerHooks' in moduleApi

/**
 * Tells whether a test process of the running Node compiles a CommonJS module
 * that its test file imports through `Module.prototype._compile`, once a
 * preload that `--import` loads patched `_compile` and registered a synchronous
 * `load` hook, as mootant's preload does.
 *
 * @returns Whether `_compile` compiled the module.
 */
async function observeCompile(): Promise<boolean> {
  let preload = path.join(directory, 'preload.mjs')
  let main = path.join(directory, 'a.test.mjs')
  await writeFile(path.join(directory, 'a.cjs'), '')
  await writeFile(
    main,
    "import './a.cjs'\nconsole.log(String(globalThis.compiled))\n",
  )
  await writeFile(
    preload,
    [
      "import api from 'node:module'",
      'globalThis.compiled = false',
      'let compile = api.Module.prototype._compile',
      'api.Module.prototype._compile = function (content, filename, ...rest) {',
      "  globalThis.compiled ||= filename.endsWith('a.cjs')",
      '  return compile.call(this, content, filename, ...rest)',
      '}',
      'api.registerHooks?.({ load: (url, context, next) => next(url, context) })',
    ].join('\n'),
  )
  let output = execFileSync(
    process.execPath,
    ['--import', pathToFileURL(preload).href, main],
    {
      env: { ...process.env, NODE_OPTIONS: undefined },
      encoding: 'utf8',
      stdio: 'pipe',
    },
  )
  return output.trim() === 'true'
}

/**
 * Makes a stand-in Node binary that requires a module first, whatever the
 * environment of its process.
 *
 * @param lines - Lines of the CommonJS module.
 * @returns Absolute path of the stand-in.
 */
async function wrapNode(lines: string[]): Promise<string> {
  let shim = path.join(directory, 'shim.cjs')
  await writeFile(shim, lines.join('\n'))
  return writeNode(`exec "${process.execPath}" --require "${shim}" "$@"`)
}

/**
 * Makes a stand-in Node binary, a shell script.
 *
 * @param body - Lines of the script after its first.
 * @returns Absolute path of the stand-in.
 */
async function writeNode(body: string): Promise<string> {
  let wrapper = path.join(directory, 'node')
  await writeFile(wrapper, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return wrapper
}

describe('readNodeRuntime', () => {
  afterEach(async () => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })

  it('reads the version, type stripping and CommonJS compiling of a binary', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))

    await expect(
      readNodeRuntime(process.execPath, directory),
    ).resolves.toStrictEqual({
      typescript: typeof process.features.typescript === 'string',
      compiles: await observeCompile(),
      version: process.version,
    })
  })

  it('asks Node itself whether CommonJS compiles, without NODE_OPTIONS', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
    let shim = path.join(directory, 'shim.cjs')
    await writeFile(
      shim,
      [
        "let { writeFileSync } = require('node:fs')",
        "let probe = process.argv[1]?.endsWith('probe.cjs')",
        `writeFileSync(${JSON.stringify(directory)} + (probe ? '/probe' : '/runtime'), '')`,
      ].join('\n'),
    )
    let compiles = await observeCompile()
    vi.stubEnv('NODE_OPTIONS', `--require ${shim}`)

    await expect(
      readNodeRuntime(process.execPath, directory),
    ).resolves.toMatchObject({ compiles })
    expect(existsSync(path.join(directory, 'runtime'))).toBe(true)
    expect(existsSync(path.join(directory, 'probe'))).toBe(false)
  })

  it('says CommonJS compiles through _compile without registerHooks', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
    let node = await wrapNode(["delete require('node:module').registerHooks"])

    await expect(readNodeRuntime(node, directory)).resolves.toMatchObject({
      compiles: true,
    })
  })

  it.skipIf(!synchronous)(
    'says CommonJS skips _compile where Node compiles it past _compile',
    async () => {
      directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
      let node = await wrapNode([
        "let api = require('node:module')",
        'let compile = api.Module.prototype._compile',
        'let register = api.registerHooks',
        'api.registerHooks = hooks => {',
        '  api.Module.prototype._compile = compile',
        '  return register(hooks)',
        '}',
      ])

      await expect(readNodeRuntime(node, directory)).resolves.toMatchObject({
        compiles: false,
      })
    },
  )

  it.skipIf(!synchronous)(
    'rejects when Node cannot import the module of the probe',
    async () => {
      directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
      let node = await wrapNode([
        "require('node:module').registerHooks({",
        '  load: (url, context, next) => {',
        "    if (url.endsWith('/probe.cjs')) {",
        "      throw new Error('Refused')",
        '    }',
        '    return next(url, context)',
        '  },',
        '})',
      ])

      await expect(readNodeRuntime(node, directory)).rejects.toThrow(
        /^mootant cannot ask Node at .+ whether it compiles CommonJS modules through Module\.prototype\._compile: [\s\S]*Error: Refused/u,
      )
    },
  )

  it('tells how a probe that printed nothing ended', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
    let exits = await writeNode(
      `if [ "$1" = "-e" ]; then exit 3; fi\nexec "${process.execPath}" "$@"`,
    )

    await expect(readNodeRuntime(exits, directory)).rejects.toThrow(
      new Error(
        `mootant cannot ask Node at ${exits} whether it compiles CommonJS modules through Module.prototype._compile: it exited with code 3`,
      ),
    )

    let killed = await writeNode(
      `if [ "$1" = "-e" ]; then kill -KILL $$; fi\nexec "${process.execPath}" "$@"`,
    )

    await expect(readNodeRuntime(killed, directory)).rejects.toThrow(
      new Error(
        `mootant cannot ask Node at ${killed} whether it compiles CommonJS modules through Module.prototype._compile: it was stopped by SIGKILL`,
      ),
    )
  })

  it('rejects for a binary that cannot run', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))

    await expect(readNodeRuntime('/missing/node', directory)).rejects.toThrow(
      /^mootant cannot run Node at \/missing\/node: /u,
    )
  })

  it('rejects with what Node printed when it cannot start', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runtime-'))
    vi.stubEnv('NODE_OPTIONS', '--no-such-option')
    let node = process.execPath

    await expect(readNodeRuntime(node, directory)).rejects.toThrow(
      new Error(
        `mootant cannot run Node at ${node}: ${node}: --no-such-option is not allowed in NODE_OPTIONS`,
      ),
    )
  })
})
