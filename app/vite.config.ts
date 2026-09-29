import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        editor: decodeURIComponent(new URL('./editor.html', import.meta.url).pathname),
        offscreen: decodeURIComponent(new URL('./offscreen.html', import.meta.url).pathname),
        options: decodeURIComponent(new URL('./options.html', import.meta.url).pathname),
      },
    },
  },
});
