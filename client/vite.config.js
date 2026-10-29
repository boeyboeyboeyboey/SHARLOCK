import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // server settings stay in the build process, outside the client bundle
  const env = {
    ...loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), ''),
    ...loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), ''),
  }
  const origin = new URL(process.env.CLIENT_ORIGIN || env.CLIENT_ORIGIN || 'http://localhost:5173')
  const apiPort = process.env.PORT || env.PORT || '3000'

  return {
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: origin.hostname === '[::1]' ? '::1' : origin.hostname,
      port: Number(origin.port || 80),
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, ws: true } },
    },
  }
})
