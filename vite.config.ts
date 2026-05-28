import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    allowedHosts: ['chat.pongpong.cc'],
    proxy: {
      '/api/chat': {
        target: 'http://192.168.1.205:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, '/v1/chat'),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.pem', 'proc/'],
    },
  },
})
