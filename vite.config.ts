import { defineConfig } from 'vitest/config';

// Library build: one self-contained IIFE bundle (CSS is inlined into the
// shadow root by the component, so no separate stylesheet is emitted).
export default defineConfig({
  root: '.',
  server: { port: 5173, open: '/demo/index.html' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/index.ts',
      name: 'AIChatWidget',
      formats: ['iife', 'es'],
      fileName: (format) => (format === 'iife' ? 'chat-widget.js' : 'chat-widget.esm.js'),
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
