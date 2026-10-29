import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // leave /images/... urls as plain strings: they are served from client/public, so tests
  // that import the router or the town need not resolve them
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'client', environment: 'jsdom', include: ['client/src/**/*.test.js'] },
      },
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['server/tests/unit/**/*.test.js'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['server/tests/integration/**/*.test.js'],
          setupFiles: ['server/tests/integration/setup-database.js'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
})
