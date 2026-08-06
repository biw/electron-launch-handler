import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // types.ts is type-only, so v8 always reports it as 0%.
      exclude: ['src/types.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'node',
    hookTimeout: 60000,
    testTimeout: 60000,
  },
})
