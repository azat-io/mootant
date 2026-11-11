const { getHeapStatistics } = require('node:v8')

process.send({
  limit: getHeapStatistics().heap_size_limit,
  flags: process.execArgv,
})
