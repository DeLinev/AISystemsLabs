import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const proxy = {
  '/ollama': {
    target: 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ollama/, ''),
  },
}

export default defineConfig({
  plugins: [tailwindcss()],
  server: { host: '127.0.0.1', proxy },
  preview: { host: '127.0.0.1', proxy },
})
