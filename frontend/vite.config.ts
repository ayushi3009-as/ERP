import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Was pointing at :3001 -- the backend runs on :8000 everywhere
      // else in this project (docker-compose.yml, uvicorn command,
      // /health checks). Local `npm run dev` could never have actually
      // reached the backend with the old value. Fixed.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
