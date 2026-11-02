import { parentPort, workerData } from 'node:worker_threads'
import { UsageIndexer } from './usageAnalytics'
const index = new UsageIndexer(workerData.root, workerData.cachePath)
parentPort!.on('message', async ({ id, action, duration }) => {
  try {
    const result = action === 'get' ? await index.get() : action === 'refresh' ? await index.refresh() : await index.recordDuration(duration)
    parentPort!.postMessage({ id, result })
  } catch (error: any) { parentPort!.postMessage({ id, error: String(error.message ?? error) }) }
})
