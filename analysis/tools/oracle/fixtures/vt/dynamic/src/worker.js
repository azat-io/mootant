import { parentPort, workerData } from 'node:worker_threads'

import { add } from './math.js'

parentPort.postMessage(add(workerData.a, workerData.b))
