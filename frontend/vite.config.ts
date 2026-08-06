import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Backend port is overridable via VITE_API_PORT so worktrees can run
// their own backend on a unique port without stepping on each other.
const backendPort = process.env.VITE_API_PORT || '8420'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dedicated port (Vite's default 5173 clashes with any other Vite dev
    // server running in parallel). Overridable via LEDGR_FRONTEND_PORT, which
    // scripts/service.sh and scripts/dev.sh pass through the CLI --port flag.
    port: Number(process.env.LEDGR_FRONTEND_PORT) || 5273,
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
