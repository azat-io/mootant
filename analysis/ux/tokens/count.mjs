// Token counter: approximation via OpenAI BPE vocabularies (o200k_base, cl100k_base).
import { getEncoding } from 'js-tiktoken'
import { readFileSync } from 'node:fs'

let o200k = getEncoding('o200k_base')
let cl100k = getEncoding('cl100k_base')

export function count(text) {
  return { chars: text.length, o200k: o200k.encode(text).length, cl100k: cl100k.encode(text).length }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (let file of process.argv.slice(2)) {
    let text = readFileSync(file, 'utf8')
    let c = count(text)
    console.log(`${file}\tchars=${c.chars}\to200k=${c.o200k}\tcl100k=${c.cl100k}`)
  }
}
