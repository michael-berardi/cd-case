# @overseer/cd-case

An interactive compact-disc jewel case for three.js. The case is modelled from the real
moulding dimensions — a 142 × 125 × 10.4 mm polycarbonate shell with a hinged lid, a clear
front window and a printed booklet — and it holds a 120 mm disc whose aluminium data
surface is shaded as a diffraction grating, so the rainbow fans shift with the view instead
of being painted on. A real hinge assembly swings the lid through 108°, the disc spins, and
the whole thing can be driven from plain JavaScript, a `<cd-case>` custom element or React.
All units are millimetres and the scene is generated at runtime: the package ships no model,
HDRI or texture files.

## Install

The package is prepared locally at version `0.1.0`; registry publication is not claimed.
From this checkout:

```sh
npm ci
npm run build:lib
# In your consuming project, install the built checkout:
npm install /absolute/path/to/cd-case three
```

After an approved npm publication, the intended registry command is
`npm install @overseer/cd-case three`.

`three` (>= 0.170) is a required peer dependency. React (>= 18) is only needed for the React
entry point.

## Usage

### Root factory

```ts
import { createCdCase } from "@overseer/cd-case";

const cd = createCdCase("#stage", {
  title: "Refraction",
  subtitle: "OverSeer Design",
  accent: "#7fb2ff",
  env: "studio",
  quality: "high",
});

await cd.open();

// Later, when the container goes away:
cd.dispose();
```

`createCdCase` needs a DOM element (or a selector that matches one) and a WebGL 2 context; it
throws with a clear message if either is missing, so call it on the client.

### Custom element

Importing `@overseer/cd-case/element` registers `<cd-case>`. Options are exposed as
kebab-case attributes and the element fills its own shadow root.

```html
<script type="module">
  import "@overseer/cd-case/element";
</script>

<cd-case
  title="Refraction"
  subtitle="OverSeer Design"
  accent="#7fb2ff"
  env="studio"
  quality="medium"
  style="display: block; height: 480px"
></cd-case>

<script type="module">
  const element = document.querySelector("cd-case");
  element.addEventListener("cd-case-ready", (event) => event.detail.api.open());
  element.addEventListener("cd-case-open", (event) => console.log(event.detail.open));
</script>
```

Attributes: `title`, `subtitle`, `accent`, `env`, `quality`, `background`, `label`,
`label-side`, `open`, `spin`, `spin-speed`, `interactive`. Events: `cd-case-ready`
(`detail.api`), `cd-case-open` (`detail.open`), `cd-case-error` (`detail.error`). The element
also exposes `api`, `ready`, `open()`, `close()`, `toggle()`, `setLabel()` and `snapshot()`.

### React

```tsx
import { CdCase } from "@overseer/cd-case/react";

export function Cover() {
  return (
    <CdCase
      title="Refraction"
      subtitle="OverSeer Design"
      accent="#7fb2ff"
      quality="high"
      style={{ height: 480 }}
      onReady={(api) => console.log(api.getOpen())}
    />
  );
}
```

`<CdCase>` keeps a live instance in step with its props. Structural options (`env`,
`quality`, `background`, `labelSide`, `ior`, `tint`, `bloom`, `maxPixelRatio`,
`pauseWhenOffscreen`) rebuild the scene; everything else is applied in place. `useCdCase()`
is available for callers that want to own the instance themselves.

## Options

Every option is optional. Defaults below are the values `resolveOptions()` applies.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `background` | `string \| null` | `"#0b0d12"` | CSS colour behind the case; `null` for a transparent canvas. |
| `env` | `"studio" \| "void" \| "warm" \| "night"` | `"studio"` | Environment light rig, built procedurally. |
| `accent` | `string` | `"#7fb2ff"` | Rim-light colour and case-edge sheen. Changeable at runtime with `setAccent()`. |
| `labelSide` | `"front" \| "back" \| "none"` | `"front"` | Which face of the disc carries print. |
| `label` | `string \| HTMLCanvasElement \| HTMLImageElement \| ImageBitmap \| Texture \| null` | `null` | Printed disc face; `null` paints a generated label from `title`/`subtitle`. A URL string is loaded; a broken URL falls back to the generated face. |
| `title` | `string` | `"Untitled"` | Title on the generated disc label. |
| `subtitle` | `string` | `"OverSeer Design"` | Credit line under the title. |
| `ior` | `number` | `1.59` | Refractive index of the case plastic (polycarbonate). |
| `tint` | `string` | `"#dfe9f2"` | Beer-Lambert absorption colour of the plastic. |
| `autoSpin` | `boolean` | `true` | Spin the disc. |
| `spinSpeed` | `number` | `0.35` | Radians per second at unit time scale. |
| `open` | `number` | `0` | Lid progress, `0` closed to `1` fully open. |
| `openOnInteract` | `boolean` | `true` | Open the lid on the first pointer interaction. |
| `respectReducedMotion` | `boolean` | `true` | Follow `prefers-reduced-motion`. |
| `interactive` | `boolean` | `true` | Drag to orbit and to work the hinge. |
| `idleDrift` | `number` | `0.05` | Idle orbit drift, radians per second. `0` disables it. |
| `quality` | `"low" \| "medium" \| "high"` | `"medium"` | Render-cost tier; see the table below. |
| `bloom` | `boolean` | per tier | Bloom on the specular highlights. |
| `maxPixelRatio` | `number` | per tier | Ceiling applied to `devicePixelRatio`. |
| `pauseWhenOffscreen` | `boolean` | `true` | Stop rendering when the canvas is not in the viewport. |
| `onReady` | `(api: CdCaseApi) => void` | — | Called with the live handle. |
| `onError` | `(error: Error) => void` | — | Called for recoverable runtime errors. |

### Quality tiers

| Tier | Environment | Bloom | Pixel ratio | Anisotropy |
| --- | --- | --- | --- | --- |
| `low` | 128 px cube | off | 1 | 1 |
| `medium` | 256 px cube, 4 samples | on | 2 | 4 |
| `high` | 1024 px cube, 16 samples | on | 2 | 8 |

`quality` can also be overridden field by field: passing `bloom` or `maxPixelRatio`
explicitly wins over the tier default.

## Handle

`createCdCase()`, `<CdCase>`'s `onReady` and `<cd-case>`'s `ready` all hand back the same
imperative handle.

| Member | Type | Description |
| --- | --- | --- |
| `internals` | `CdCaseInternals` | `scene`, `camera`, `renderer`, `root`, `lid`, `tray`, `disc`, `env` for advanced composition. |
| `setOpen(value)` | `Promise<void>` | Animate the lid to `0`–`1`; resolves when the motion settles. |
| `open()` / `close()` / `toggle()` | `Promise<void>` | Shorthands for the same motion. |
| `getOpen()` | `number` | Current lid progress. |
| `setLabel(source)` | `void` | Replace the printed disc face, or `null` for the generated label. |
| `setTitle(title, subtitle?)` | `void` | Repaint the generated label and the printed booklet. |
| `setAccent(accent)` | `void` | Re-tint the env rig and case edge. |
| `setPaused(paused)` | `void` | Pause or resume the loop without tearing down the context. |
| `render()` | `void` | Force one frame; useful for deterministic screenshots. |
| `resize()` | `void` | Re-measure the container. |
| `snapshot(type?, quality?)` | `string` | PNG (default) or JPEG data URL of the current frame. |
| `dispose()` | `void` | Stop the loop, release the GPU resources and remove the canvas. Safe to call twice. |

```ts
const cd = createCdCase("#stage", { quality: "low", pauseWhenOffscreen: true });

cd.setAccent("#ff7ab8");
cd.setTitle("Diffraction", "Liberty Design Studio");
await cd.setOpen(0.5);
cd.setPaused(true);
```

## Assets

Nothing is loaded from disk and nothing is fetched over the network. The shell, the tray,
the hinge and the disc are moulded from rounded extrusions and revolutions, the environment
lighting is a cube map baked from an empty room with softboxes in it, and the disc label is
painted onto a 2D canvas. There is no model file, no HDRI and no texture file to ship or
host.

The Vite demo under `demo/` uses this package's public API; run `npm run dev` locally.

## Astro showcase

The first-class showcase lives in [`showcase/`](./showcase/) and uses Astro with
`@astrojs/cloudflare`. It imports this module, not a second renderer.

```sh
npm --prefix showcase ci
npm run dev:showcase
npm run ci
npm run build:showcase
```

API examples and the licence are available from the built site's local links. The source is
public at [github.com/michael-berardi/cd-case](https://github.com/michael-berardi/cd-case)
and the showcase is deployed at [cd-case.pages.dev](https://cd-case.pages.dev). See
[PUBLISHING.md](./PUBLISHING.md) for build and deployment commands.

## OverSeer Design shelf

From the OverSeer checkout:

```sh
overseer design modules --category three.js --json
overseer design module cd-case --json
overseer design modules --verify --json
```

The module is catalogued in place. The shelf does not vendor module files, and its check
of zero pinned files is not source or visual verification.

The cloning capability can request REA evidence for a new reference capture:

```sh
overseer design capture https://www.bubbbly.com/cd-case \
  --out /tmp/overseer-design --rea-provenance --module cd-case --json
```

A failing or missing REA reports no recorded provenance without replacing REA with an
ad-hoc engine. Existing observations are not REA evidence, and no REA Evidence ID is
claimed for them.

## Reference and licence

Reference: [CD Case by Ann Nguyen](https://www.bubbbly.com/cd-case). The reconstruction was
informed by the reference's recovered GLSL. The MIT licence covers Liberty Design Studio's
own work in this repository. Captured reference bundles, shaders, artwork and screenshots
are not included in this package.

MIT © Liberty Design Studio for its own work. See [LICENSE](./LICENSE).
