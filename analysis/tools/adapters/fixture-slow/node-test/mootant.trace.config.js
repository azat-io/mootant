import { nodeTestAdapter } from 'mootant/node-test'

import { traceAdapter } from '../../tools/trace-adapter.js'

export default {
  run: {
    runner: traceAdapter(nodeTestAdapter(), process.env.TRACE_DIR),
    paths: ['src'],
    cache: false,
  },
}
