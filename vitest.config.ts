import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  resolve: {
    alias: {
      '@rhythm-archive/bms-core': resolve(__dirname, '../bms-core/src/index.ts'),
      '@rhythm-archive/bms-player': resolve(__dirname, '../bms-player/src/index.ts'),
      '@rhythm-archive/bms-editor': resolve(__dirname, '../bms-editor/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'src/renderer/stores/**',
        'src/renderer/lib/**',
        'src/main/ipc/**',
      ],
    },
  },
});
