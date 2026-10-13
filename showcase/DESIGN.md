# CD case showcase contract

Audience: developers inspecting the reusable jewel-case module. Primary task: open the case, inspect its material response, then read the usage example.

## Source decisions

Decision vocabulary: `project | corpus | live | capture | original`.

- Hero object — `project`: `../src/index.ts` and `../demo/main.ts`; use the existing public factory without changing shaders or geometry. Reference target remains https://www.bubbbly.com/cd-case.
- Page hierarchy — `corpus`: OverSeer Design `corpus/references/Shop-design-reference.md`, opening description and tokens; let the object lead and keep its controls adjacent. Do not copy product cards, brand, fonts or pill controls.
- Type and action hierarchy — `corpus`: `Dub-design-reference.md`, opening description and typography; distinguish display, native UI and code roles. Do not copy proprietary typefaces, badges or surface colors.
- Control surfaces — `corpus`: `Hex-design-reference.md`, opening description and tokens; thin outlines and low chrome keep attention on product evidence. Do not copy its cream/violet palette or editorial brand lettering.

These three files were returned as admitted by the local corpus search; no award or current live-performance claim is made. No new live examples or capture: the operator supplied the reference and evidence, and explicitly delegated visual verification to Sol. Prior captures are not current shader fidelity proof and are not REA provenance.

## Composition and behavior

- One page: compact header, large title, dominant interactive object, control rail, concise integration example and footer.
- Near-black canvas `#0b0d12`, warm-white text `#eeece5`, secondary text `#b7bcc7`, restrained blue focus `#7fb2ff`; one-pixel separators, 4px control radius, no cards/chips/eyebrows.
- System sans UI/display and system mono code. 8px spacing rhythm, fluid 48–112px heading, 16px UI. Readable maximum width 1440px.
- Native buttons/select/color input with visible labels, focus rings, 44px targets, disabled/loading/error states. Keyboard controls duplicate the pointer-only object's essential lid interaction.
- Mobile: stage remains full width; control rail stacks below; source example wraps rather than overflowing.
- Default quality low on narrow screens, medium otherwise; DPR cap 1.5. No idle camera drift. Reduced motion disables disc spin; visibility and intersection suspend rendering; unload disposes the instance.
- Additional shader: **none**. `overseer design recommend-shader --job atmosphere --placement hero --has-dominant-visual --json` returned no recommendation because the viewport already has a dominant visual.
- HyperFrames: **not used**. This is a live stateful object; rendered media would not replace interaction or prove module behavior.
- No upstream artwork, brand marks, external fonts or analytics.

## Operator-owned acceptance

Sol owns screenshots at 375px and 1920px, material fidelity, keyboard/touch behavior, reduced motion, performance, runtime errors and final sign-off. This build preparation does not claim those checks occurred. Public publishing/deployment remains an operator decision after findings are resolved.
