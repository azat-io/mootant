import { vitestAdapter } from 'mootant/vitest'

import { traceAdapter } from '../../tools/trace-adapter.js'

export default {
  run: {
    runner: traceAdapter(vitestAdapter(), process.env.TRACE_DIR),
    timeout: { constant: 20000 },
    paths: ['src'],
    cache: false,
  },
}
