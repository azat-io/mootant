// Render a Graphviz dot file to SVG with the wasm build of Graphviz
// (@hpcc-js/wasm-graphviz installed in /home/user/tools-arch).
//   node analysis/architecture/scripts/dot-to-svg.mjs in.dot out.svg
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

let require = createRequire('/home/user/tools-arch/package.json')
let { Graphviz } = await import(require.resolve('@hpcc-js/wasm-graphviz'))
let [input, output] = process.argv.slice(2)
let graphviz = await Graphviz.load()
writeFileSync(output, graphviz.dot(readFileSync(input, 'utf8')))
