import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { aiApiPlugin } from './server/vitePlugin'

export default defineConfig({
  plugins: [react(), aiApiPlugin()],
  build: { sourcemap: false, chunkSizeWarningLimit: 400 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})

