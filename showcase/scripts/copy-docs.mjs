import { copyFile, mkdir } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
await mkdir(publicDir, { recursive: true });
await copyFile(new URL('../../README.md', import.meta.url), new URL('README.md', publicDir));
await copyFile(new URL('../../LICENSE', import.meta.url), new URL('LICENSE.txt', publicDir));
