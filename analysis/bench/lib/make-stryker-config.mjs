#!/usr/bin/env node
// Writes the Stryker configurations of a bench project from its template
// (projects/<name>/stryker.json) and the files Mootant mutates, so both tools
// always mutate the same files:
//   stryker.bench.json      the main comparison: no checker, perTest coverage
//                           (unless the template says otherwise), json report
//   stryker.bench.tsc.json  the same plus @stryker-mutator/typescript-checker
// Usage: make-stryker-config.mjs <template.json> <project-dir> <concurrency> <file...>
import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

let [template, project, concurrency, ...paths] = process.argv.slice(2)
if (!template || !project || !concurrency || paths.length === 0) {
  console.error('usage: make-stryker-config.mjs <template.json> <project-dir> <concurrency> <file...>')
  process.exit(2)
}

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u
const TEST = /(?:\.|-|_)(?:test|spec)\.[^.]+$|(?:^|\/)__tests__\//u

// Directories become their source files, as `mootant run <dir>` lists them;
// test files and declaration files are left out.
function expand(entry) {
  let absolute = path.join(project, entry)
  if (!statSync(absolute).isDirectory()) return [entry]
  return readdirSync(absolute, { recursive: true })
    .map(name => path.posix.join(entry, name.split(path.sep).join('/')))
    .filter(name => SOURCE.test(name) && !name.endsWith('.d.ts') && !TEST.test(name))
    .toSorted()
}

let mutate = paths.flatMap(expand)
let base = JSON.parse(readFileSync(template, 'utf8'))
let config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  coverageAnalysis: 'perTest',
  ...base,
  concurrency: Number(concurrency),
  mutate,
  reporters: ['json'],
  jsonReporter: { fileName: 'reports/bench/mutation.json' },
  incremental: false,
  cleanTempDir: true,
  tempDirName: '.stryker-tmp',
  fileLogLevel: 'off',
  logLevel: 'info',
}
writeFileSync(path.join(project, 'stryker.bench.json'), `${JSON.stringify(config, null, 2)}\n`)
let checked = {
  ...config,
  checkers: ['typescript'],
  plugins: [...(config.plugins ?? []), '@stryker-mutator/typescript-checker'],
  tsconfigFile: base.tsconfigFile ?? 'tsconfig.json',
}
writeFileSync(path.join(project, 'stryker.bench.tsc.json'), `${JSON.stringify(checked, null, 2)}\n`)
// Optional third configuration: Stryker's command runner, for a runner Stryker
// has no plugin for (node:test); it can only run the whole suite per mutant.
let commandTemplate = path.join(path.dirname(template), 'stryker.command.json')
if (existsSync(commandTemplate)) {
  let command = {
    ...config,
    plugins: [],
    ...JSON.parse(readFileSync(commandTemplate, 'utf8')),
    coverageAnalysis: 'off',
  }
  delete command.tap
  writeFileSync(path.join(project, 'stryker.bench.command.json'), `${JSON.stringify(command, null, 2)}\n`)
}
console.log(`stryker: ${mutate.length} files to mutate`)
