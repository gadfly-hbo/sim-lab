import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'kernel/index': 'src/kernel/index.ts',
    'store/index': 'src/store/index.ts',
    'service/index': 'src/service/index.ts',
    'tools/index': 'src/tools/index.ts',
    'pi/index': 'src/pi/index.ts',
    'plugin/index': 'src/plugin/index.ts',
    'ui/server': 'src/ui/server.ts',
    'cli/index': 'src/cli/index.ts'
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  splitting: false,
  shims: true
});
