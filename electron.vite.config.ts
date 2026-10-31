import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 保留 PDF.js 资源原名；开发服务器和离线安装包使用同一 URL 路径。
function pdfAssets(): Plugin {
  const assets = new Map<string, Buffer>()
  for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
    const root = resolve('node_modules/pdfjs-dist', directory)
    for (const name of readdirSync(root)) assets.set(`pdfjs/${directory}/${name}`, readFileSync(resolve(root, name)))
  }
  return {
    name: 'pdfjs-offline-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0].replace(/^\//, '') ?? ''
        const data = assets.get(path)
        if (!data) return next()
        response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        response.end(data)
      })
    },
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source })
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    worker: { format: 'es' },
    plugins: [react(), tailwindcss(), pdfAssets()]
  }
})
