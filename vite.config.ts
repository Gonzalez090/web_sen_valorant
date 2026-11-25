/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Root-relative: Vite resolves /src from the project root.
    alias: { '@': '/src' },
  },
  build: {
    // three.js alone is ~700 kB minified; one 3D bundle around 1 MB is expected for this app.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
