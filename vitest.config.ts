import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  plugins: [react()],
  test: { exclude: [...configDefaults.exclude, '.local/**'] }
})
