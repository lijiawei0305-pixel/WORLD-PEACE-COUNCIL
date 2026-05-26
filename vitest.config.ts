import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 与 vite.config.ts 保持一致：让测试文件能解析 @contracts。
  // vitest 默认不读 vite.config.ts，必须在这里独立声明。
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('./packages/contracts/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
    },
  },
});
