// Feeds Windows-style test scripts to mootant's own parser and resolver (dist
// of the installed package) to see what a node:test run would take from them.
// usage: node win-script-parse.mjs <project with mootant installed>
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let dist = path.join(process.argv[2], 'node_modules/mootant/dist/adapters/node-test')
let { parseCommand } = await import(pathToFileURL(path.join(dist, 'parse-command.js')).href)
let { resolveCommand } = await import(pathToFileURL(path.join(dist, 'resolve-command.js')).href)
let scripts = [
  'node --test test\\unit\\math.test.js',
  'node_modules\\.bin\\tsx.cmd --test',
  'node --test "test\\unit\\*.test.js"',
  "node --test 'test/*.test.js'",
  'set NODE_ENV=test&& node --test',
  'cross-env NODE_ENV=test node --test',
]
for (let script of scripts) {
  let parsed = parseCommand(script)
  let resolved = parsed.map(words => resolveCommand(words)).find(Boolean) ?? null
  console.log(JSON.stringify(script), '->', JSON.stringify(parsed), '->', JSON.stringify(resolved))
}
