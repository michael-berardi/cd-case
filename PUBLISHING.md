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

Cloudflare credentials and an existing Pages project are required. Retain the previous
Pages deployment ID for rollback. The site currently uses noindex; remove it only when
public release is cleared. The intended URL is https://cd-case.pages.dev, not a claim
that deployment has occurred.

Resolve the reference-derived code's redistribution rights before any public source,
package or website publication. See the attribution and licence section in README.md.
