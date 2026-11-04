// Starts a Mootant CLI with the experiment hook of the unskip patch enabled for
// this process only: MOOTANT_UNSKIP_PID makes child processes (test workers)
// ignore MOOTANT_UNSKIP, so the tests of Mootant itself are not affected.
// Usage: node mootant-unskip.mjs /path/to/bin/mootant.js run ...
let [bin, ...rest] = process.argv.slice(2)
process.env.MOOTANT_UNSKIP_PID = String(process.pid)
process.argv = [process.argv[0], bin, ...rest]
await import(bin)
