# Contributing

Use Node 22.12 or later for the complete library and showcase workspace.

```sh
npm ci
npm --prefix showcase ci
npm run ci
```

Keep the JavaScript, custom-element and React entry points compatible. Add regression
tests for behavior changes and update the README when the public API changes.

Use the module's factory in demos rather than duplicating the renderer. Check narrow
and wide layouts, keyboard controls and reduced-motion behavior for UI changes.

Contribute only code and assets you have permission to distribute under the project's
licence. Do not include captured third-party bundles, images, fonts or artwork.
