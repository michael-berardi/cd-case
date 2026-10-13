# Build and publish

The library and showcase have separate build outputs. The package version is `0.1.0`.

## Install dependencies

```sh
npm ci
npm --prefix showcase ci
```

Node 22.12 or later is required for the Astro showcase.

## Local CI

```sh
npm run ci
```

This checks TypeScript, runs the module tests, checks Astro, and builds the library,
Vite demo and Astro showcase. No GitHub Actions or automatic deployments are configured.
Some headless tests require a real canvas/WebGL context and are skipped without it.

## Package

```sh
npm run build:lib
npm pack
```

The package contains `dist/`, `README.md` and `LICENSE`. Three.js is a required peer;
React is optional. No npm registry publication has been performed.

## Cloudflare Pages

```sh
npm run build:showcase
```

Deploy `showcase/dist/client/` as static files. The Astro Cloudflare adapter also emits
`showcase/dist/server/`, but that directory is not needed for this static showcase.
No sessions, KV, image-processing bindings, analytics or application secrets are required.
The build copies the README and licence into the site's public files.

The provided deployment script targets the Pages project `cd-case`:

```sh
npm run deploy
```

Cloudflare credentials and the `cd-case` Pages project are required. `wrangler pages deploy`
is used because `cf pages deploy` is still a stub in the beta CLI. Record the new deployment
ID and keep the previous one for rollback: https://cd-case.pages.dev serves the latest
production deployment.

Current production deployment: `3b9b47b7-472c-45b1-9dfb-c712ce9254b2` (source commit
`603cfd7`). The previous production deployment `df0177ef-f4ee-4987-8b13-5a46e93e462b`
(source commit `11179a2`) is kept as the rollback target; before it, no deployment existed.
