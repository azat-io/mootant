// Prints the environment variables createVitest changes in the main process
// (BUG-753). Run from a project with Vitest 5: node <path>/env-probe.mjs
// (copy it into the project first, so that `vitest/node` resolves there).
import { createVitest } from 'vitest/node'
let before = { ...process.env }
let vitest = await createVitest('test', { watch: false, root: process.cwd() })
let changed = Object.keys({ ...before, ...process.env }).filter(name => before[name] !== process.env[name])
console.log(JSON.stringify(changed.map(name => [name, before[name] ?? null, process.env[name] ?? null])))
await vitest.close()
