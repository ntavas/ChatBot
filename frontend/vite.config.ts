// vite.config.ts
// Vite configuration for the frontend dev server.
// Adds the Tailwind CSS v4 Vite plugin and proxies /api requests to the backend.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Forward all /api/* requests to the backend container.
      // This avoids CORS issues during development without changing fetch call URLs.
      '/api': 'http://localhost:3000',
    },
  },
})
