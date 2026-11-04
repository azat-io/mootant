import { nodeTestAdapter } from 'mootant/node-test'

import { traceAdapter } from '../../tools/trace-adapter.js'

export default {
  run: {
    runner: traceAdapter(nodeTestAdapter(), process.env.TRACE_DIR),
    timeout: { constant: 20000 },
    paths: ['src'],
    cache: false,
  },
}
