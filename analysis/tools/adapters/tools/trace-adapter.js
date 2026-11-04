// Tracing decorator for a mootant TestAdapter: logs every call across the
// core <-> adapter boundary (requests, results, callbacks) to a JSONL file and
// snapshots the work directory after each session call. Uses only the public
// contract (TestAdapter / AdapterSession / AdapterContext).
import { appendFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

export function traceAdapter(adapter, directory) {
  mkdirSync(directory, { recursive: true })
  let log = path.join(directory, 'calls.jsonl')
  let started = performance.now()
  let step = 0
  let killed = false
  function write(entry) {
    appendFileSync(
      log,
      `${JSON.stringify({ t: Math.round(performance.now() - started), ...entry })}\n`,
    )
  }
  let spawn = childProcess.spawn
  childProcess.spawn = (command, args, options) => {
    let unit = options?.env?.MOOTANT_UNIT
    write({
      event: 'spawn',
      command: path.basename(command),
      args: args.map(arg => (arg.length > 160 ? `${arg.slice(0, 160)}…` : arg)),
      unit: unit === undefined ? null : JSON.parse(unit),
      detached: options?.detached ?? false,
    })
    return spawn(command, args, options)
  }
  syncBuiltinESMExports()
  return {
    ...adapter,
    async start(context) {
      write({
        event: 'start',
        context: {
          root: context.root,
          workDirectory: context.workDirectory,
          concurrency: context.concurrency,
          files: context.files.length,
        },
      })
      let session = await adapter.start({
        ...context,
        get files() {
          return context.files
        },
        onUnitEnd: end => {
          write({ event: 'onUnitEnd', end: end ?? null })
          context.onUnitEnd?.(end)
        },
        onOutput: (text, file) => {
          write({ event: 'onOutput', file, text: text.slice(0, 200) })
          context.onOutput?.(text, file)
        },
      })
      function snapshot(label) {
        step += 1
        let target = path.join(directory, `work-${step}-${label}`)
        if (existsSync(context.workDirectory)) {
          cpSync(context.workDirectory, target, { recursive: true })
        }
      }
      function injectFaults(name) {
        // Fault injection for experiments: kill the test processes of the
        // first isolated run after TRACE_KILL_AFTER ms (simulates an OOM kill
        // or an external SIGKILL that has nothing to do with the mutant).
        let after = Number(process.env.TRACE_KILL_AFTER ?? 'NaN')
        if (name !== 'runIsolated' || Number.isNaN(after) || killed) {
          return
        }
        killed = true
        setTimeout(() => {
          let out = childProcess.execFileSync('ps', ['-o', 'pid=,args=', '--ppid', String(process.pid)], { encoding: 'utf8' })
          for (let line of out.split('\n')) {
            let match = /^\s*(\d+)\s+(.*)$/u.exec(line)
            if (match && /node/u.test(match[2]) && !/\bps\b/u.test(match[2])) {
              write({ event: 'fault:SIGKILL', pid: Number(match[1]), args: match[2].slice(0, 200) })
              try { process.kill(Number(match[1]), 'SIGKILL') } catch {}
            }
          }
        }, after)
      }
      function breakResult(name, output) {
        if (process.env.TRACE_BREAK === 'empty-tries' && name === 'dryRun' && output.tests.length > 0) {
          write({ event: 'fault:empty-tries', test: output.tests[0].id })
          output.tests[0].tries = []
        }
        return output
      }
      function wrap(name) {
        if (typeof session[name] !== 'function') {
          return undefined
        }
        return async input => {
          write({ event: `${name}:call`, input: input ?? null })
          injectFaults(name)
          let begun = performance.now()
          try {
            let output = breakResult(name, await session[name](input))
            write({
              event: `${name}:result`,
              ms: Math.round(performance.now() - begun),
              output,
            })
            snapshot(name)
            return output
          } catch (error) {
            write({ event: `${name}:error`, message: String(error?.message ?? error) })
            snapshot(`${name}-error`)
            throw error
          }
        }
      }
      write({
        event: 'session',
        version: session.version ?? null,
        workers: session.workers ?? null,
        diagnostics: session.diagnostics ?? [],
        hasCacheInputs: typeof session.cacheInputs === 'function',
      })
      return {
        ...session,
        listTestFiles: wrap('listTestFiles'),
        dryRun: wrap('dryRun'),
        runIsolated: wrap('runIsolated'),
        runBatch: wrap('runBatch'),
        cacheInputs: wrap('cacheInputs'),
        close: wrap('close'),
      }
    },
  }
}
