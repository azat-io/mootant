// Does rolldown drop unused exports of a module when preserveModules is on?
let { rolldown } = await import('/home/user/wt/base/node_modules/.pnpm/rolldown@1.2.16/node_modules/rolldown/dist/index.mjs')
let bundle = await rolldown({ input: process.argv[2], treeshake: true, tsconfig: false })
let { output } = await bundle.generate({ preserveModules: true, format: 'es' })
for (let chunk of output) console.log('---', chunk.fileName, '\n' + chunk.code)
