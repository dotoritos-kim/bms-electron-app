/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  mutate: [
    'src/renderer/stores/editorStore.ts',
    'src/renderer/lib/autoChart.ts',
    'src/renderer/lib/keyBindings.ts',
    'src/main/ipc/file.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  concurrency: 4,
  timeoutMS: 60000,
};
