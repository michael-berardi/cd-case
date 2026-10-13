import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough', prerenderEnvironment: 'node' }),
  session: false,
  vite: { server: { fs: { allow: ['..'] } } },
});
