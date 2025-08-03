import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  mode: 'development',
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.REACT_APP_RECAPTCHA_SITE_KEY': JSON.stringify('6LcDoJMrAAAAAA-mQl-L1TYgUXYM5LYz1Y4oJO4u'),
    'process.env.REACT_APP_SUPPORT_EMAIL': JSON.stringify('achraf.bayi@sna-gz.com'),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'build',
  },
}) 