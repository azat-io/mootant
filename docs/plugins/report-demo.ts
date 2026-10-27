import type { ServerResponse } from 'node:http'
import type { AstroIntegration } from 'astro'

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'

/**
 * Root of the repository, where the CLI is built.
 */
let root = path.join(import.meta.dirname, '..', '..')

/**
 * Sample project the demo report is made of.
 */
let project = path.join(import.meta.dirname, '..', 'demo')

/**
 * Directory the CLI writes the report of the sample project to.
 */
let output = path.join(project, '.mootant')

/**
 * What the report is made of: the CLI, the docs files it embeds and the sample
 * project.
 */
let sources = [
  'adapters',
  'cli',
  'core',
  'types',
  'package.json',
  'vite.config.ts',
  'docs/icons',
  'docs/public/fonts',
  'docs/styles',
  'docs/demo',
].map(source => path.join(root, source))

/**
 * Publishes the HTML report of the sample project in `docs/demo` at
 * `/report/demo`. The CLI builds into the output directory of the site, so a
 * build makes the report before Astro empties that directory and writes it once
 * the site is built. The dev server makes the report on the first request, and
 * again after its sources change or an attempt fails.
 *
 * @returns Integration that adds the page.
 */
export function reportDemo(): AstroIntegration {
  let report: Promise<string> | undefined
  let stale = false

  /**
   * Gives the report, made again when it is stale.
   *
   * @returns HTML of the report.
   */
  function getReport(): Promise<string> {
    if (stale || !report) {
      stale = false
      report = queueReport(report)
    }
    return report
  }

  /**
   * Makes the report once the previous attempt is over, since both build the
   * CLI into the same directory. A failure leaves the report stale, so the next
   * request tries again.
   *
   * @param previous - Previous attempt, if any.
   * @returns HTML of the report.
   */
  async function queueReport(
    previous: Promise<string> | undefined,
  ): Promise<string> {
    try {
      await previous
    } catch {
      // The request of that attempt got its error.
    }
    try {
      return await createReport()
    } catch (error) {
      stale = true
      throw error
    }
  }

  /**
   * Answers a request of the dev server with the report.
   *
   * @param response - Response to the request.
   * @param next - Passes an error on to the dev server.
   */
  async function sendReport(
    response: ServerResponse,
    next: (error: unknown) => void,
  ): Promise<void> {
    try {
      let html = await getReport()
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(html)
    } catch (error) {
      next(error)
    }
  }

  return {
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.watcher.add(sources)
        server.watcher.on('all', (_event, file) => {
          if (isSource(file)) {
            stale = true
          }
        })
        server.middlewares.use('/report/demo', (_request, response, next) => {
          void sendReport(response, next)
        })
      },
      'astro:build:done': async ({ dir }) => {
        await mkdir(new URL('report/', dir), { recursive: true })
        await writeFile(new URL('report/demo.html', dir), await getReport())
      },
      'astro:build:start': async () => {
        await getReport()
      },
    },
    name: 'mootant:report-demo',
  }
}

/**
 * Runs a script with the current Node.js.
 *
 * @param script - Path of the script.
 * @param scriptArguments - Arguments after the path.
 * @param cwd - Directory to run the script in.
 * @returns Resolves once the script exits.
 * @throws Error - When the script fails, with what it printed.
 */
function runNode(
  script: string,
  scriptArguments: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...scriptArguments], { cwd }, error => {
      if (error === null) {
        resolve()
      } else {
        reject(new Error(`${path.basename(script)} failed`, { cause: error }))
      }
    })
  })
}

/**
 * Builds the CLI from the current code and runs it on the sample project.
 *
 * @returns HTML of the report.
 */
async function createReport(): Promise<string> {
  await runNode(
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    ['build'],
    root,
  )
  await runNode(
    path.join(root, 'bin', 'mootant.js'),
    ['run', '--html'],
    project,
  )
  return readFile(path.join(output, 'report.html'), 'utf8')
}

/**
 * Tells whether a changed file is one the report is made of. The report the CLI
 * writes into the sample project is not.
 *
 * @param file - Absolute path of the file.
 * @returns True for a source of the report.
 */
function isSource(file: string): boolean {
  return (
    !isInside(file, output) && sources.some(source => isInside(file, source))
  )
}

/**
 * Tells whether a path is a directory or a file inside it.
 *
 * @param file - Absolute path to check.
 * @param directory - Absolute path of the directory or file.
 * @returns True when the path is the directory itself or inside it.
 */
function isInside(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}${path.sep}`)
}
