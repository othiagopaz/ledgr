import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Backend port is overridable via VITE_API_PORT so worktrees can run
// their own backend on a unique port without stepping on each other.
const backendPort = process.env.VITE_API_PORT || '8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      }
    }
  },
  test: {
    globals: true,
  },
})
