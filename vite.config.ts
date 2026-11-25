/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is ~700 kB minified; one 3D bundle around 1 MB is expected for this app.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
