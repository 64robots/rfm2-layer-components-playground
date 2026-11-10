import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const host = fileURLToPath(new URL('../../builder-frontend/', import.meta.url))
const require = createRequire(resolve(host, 'package.json'))
const { defineConfig } = await import(pathToFileURL(require.resolve('vitest/config')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)

export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [vue()],
  resolve: { alias: {
    vue: require.resolve('vue'),
    '@vue/test-utils': require.resolve('@vue/test-utils'),
    vitest: resolve(host, 'node_modules/vitest/dist/index.js'),
  } },
  test: {
    environment: 'happy-dom',
    include: ['tests/enum-select-control.spec.ts'],
  },
})
