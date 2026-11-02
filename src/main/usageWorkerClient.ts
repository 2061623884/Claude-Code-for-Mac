/// <reference types="electron-vite/node" />
import createWorker from './usageWorker?nodeWorker'
import type { Worker } from 'node:worker_threads'
import type { UsageAnalytics } from '../shared/usageAnalytics'

/** Keep JSON parsing, deduplication and index serialization off Electron's UI/main thread. */
export class UsageWorkerClient {
  private worker: Worker | null = null
  private sequence = 0
  private requests = new Map<number, { resolve(value: any): void; reject(error: Error): void }>()
  constructor(private root: string, private cachePath: string) {}
  private call<T>(action: string, duration?: number): Promise<T> {
    if (!this.worker) {
      const worker = createWorker({ workerData: { root: this.root, cachePath: this.cachePath } })
      this.worker = worker
      worker.on('message', ({ id, result, error }) => {
        const request = this.requests.get(id); this.requests.delete(id)
        if (error) request?.reject(new Error(error)); else request?.resolve(result)
      })
      const failed = (error: Error): void => {
        if (this.worker !== worker) return
        this.worker = null
        for (const request of this.requests.values()) request.reject(error)
        this.requests.clear()
        void worker.terminate()
      }
      worker.on('error', failed)
      worker.on('exit', () => failed(new Error('统计进程已退出，请重试')))
      worker.unref()
    }
    return new Promise<T>((resolve, reject) => { const id = ++this.sequence; this.requests.set(id, { resolve, reject }); this.worker!.postMessage({ id, action, duration }) })
  }
  get(): Promise<UsageAnalytics> { return this.call('get') }
  refresh(): Promise<UsageAnalytics> { return this.call('refresh') }
  recordDuration(duration: number): Promise<void> { return this.call('duration', duration) }
}
