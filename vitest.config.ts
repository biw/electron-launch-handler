import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default test configuration
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**/*.test.ts'],

    // Projects for different test types (renamed from workspace)
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
})
