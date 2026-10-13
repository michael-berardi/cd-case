# Publishing preparation

Version: `0.1.0`. Intended repository: https://github.com/michael-berardi/cd-case.
Intended showcase: https://cd-case.pages.dev. Neither destination is asserted live.

## Release gates

1. Sol owns verification and final findings: current module appearance, reference fidelity, lifecycle, performance, accessibility, and showcase screenshots at 375px/1920px. No verification wave was run by this implementation session.
2. Resolve those findings and obtain the required release review before public release. The Sonnet implementation workers could not start because the session lacked a first-party Claude subscription login; this is not a completed review.
3. Confirm redistribution rights for any implementation derived from recovered reference GLSL. The local MIT declaration does not grant rights over Ann Nguyen's reference code. Historical reference captures, bundles and extracted shaders stay private, outside this repository's published files.
4. Operator explicitly approves public repository creation and Pages publishing. GitHub Actions are currently banned by the machine's commit hook. No Actions workflow is included or enabled; any future policy exception needs explicit operator approval.

## Local preparation

```sh
npm ci
npm --prefix showcase ci
python3 ~/dev/scripts/build_queue.py --project cd-case --cwd "$PWD" -- npm run ci
```

The Astro site uses `@astrojs/cloudflare` with static output. With this adapter the deployable directory is `showcase/dist/client`, not `showcase/dist`. `npm run build:showcase` copies this repository's README and LICENSE into the site. No images, sessions, KV, analytics or secrets are required. It remains noindex until release is approved.

## After operator approval and Sol's sign-off

Inspect the staged source before committing. Keep `.reference/`, `review/`, `scratch/`, dependency trees and generated output out of Git. Check whether the intended repository and Pages project already exist; do not overwrite them.

Create the repository only with explicit public-repository approval (or use an approved private repository). Push reviewed commits to `main`. `npm run ci` is the local/manual CI command and can also run on an approved external runner. There is no GitHub Actions workflow and no automatic deployment on push.

Use `cf cli search "pages project"`, then the discovered command's `--help`/schema to inspect or create the approved Pages project. The `cloudflare-cf` skill currently permits `wrangler pages deploy` for the Pages deployment gap. The root `npm run deploy` delegates to that prepared script.

Deploy from a clean checkout of the exact `origin/main` commit:

```sh
npm ci
npm --prefix showcase ci
python3 ~/dev/scripts/jsx_glue_check.py showcase
python3 ~/dev/scripts/build_queue.py --project cd-case --cwd "$PWD" -- npm run deploy
```

Retain the Pages deployment ID and previous deployment for rollback. Sol/operator verifies the live URL and release before removing noindex. Update the OverSeer shelf with the actual commit/deployment identity; do not replace a version pin with an unpushed commit claim. No npm registry publication is performed by these scripts.
