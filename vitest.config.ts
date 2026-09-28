import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': here('./src'),
      // Astro virtual modules, stubbed so domain code can be tested in isolation.
      'astro:env/client': here('./src/test/astro-env-client.ts'),
      'astro:env/server': here('./src/test/astro-env-server.ts'),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
