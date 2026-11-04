import { scale } from './math.js'

let [value, factor] = process.argv.slice(2).map(Number)
console.log(String(scale(value, factor)))
