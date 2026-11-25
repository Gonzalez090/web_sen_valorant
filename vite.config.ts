/// <reference types="vitest/config" />
/// <reference types="node" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// `vite preview` serves the same security headers as Vercel, so the CSP can be checked locally.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
const securityHeaders = Object.fromEntries(vercel.headers.flatMap((h) => h.headers).map((h) => [h.key, h.value]))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Root-relative: Vite resolves /src from the project root.
    alias: { '@': '/src' },
  },
  preview: { headers: securityHeaders },
  build: {
    // three.js alone is ~700 kB minified; one 3D bundle around 1 MB is expected for this app.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
