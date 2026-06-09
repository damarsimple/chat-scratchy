import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    allowedHosts: ['chat.pongpong.cc'],
    proxy: {
      '/api/chat': {
        target: 'http://10.0.0.2:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, '/v1/chat'),
      },
      '/api': {
        target: 'http://localhost:3500',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.pem', 'proc/'],
    },
  },
})
