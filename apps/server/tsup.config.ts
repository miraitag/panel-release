import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // El paquete shared se publica como fuente TS: hay que empaquetarlo.
  noExternal: ['@release-panel/shared'],
});
