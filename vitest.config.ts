import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/mcp-apps/**', 'src/cli/index.ts', 'src/cli/init.ts', 'src/**/*.d.ts', 'src/**/*.svelte'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'siyuan': path.resolve(__dirname, './tests/mocks/siyuan.ts'),
      'virtual:siyuan-mcp-app-html': path.resolve(__dirname, './tests/fixtures/mcp-app-html.ts'),
    },
  },
});
