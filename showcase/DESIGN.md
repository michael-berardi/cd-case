# Showcase design

The showcase imports the module's public factory rather than maintaining a separate renderer.
The interactive case is the focal surface; native controls sit immediately below it.

- Canvas: `#0b0d12`; text: `#eeece5`; secondary text: `#b7bcc7`; focus: `#7fb2ff`.
- System sans-serif display/UI and system monospace examples. One-pixel separators and 4px control radii.
- Fluid title, maximum width 1440px, stacked controls/example at narrow widths.
- Low quality on narrow screens, medium otherwise; pixel-ratio ceiling 1.5.
- Reduced motion disables disc spin. Hidden and offscreen states pause rendering; page exit disposes the instance.
- Explicit lid buttons provide keyboard access to the object's essential interaction.
- No additional shader, autoplay video, external fonts, artwork or analytics.

These are implementation choices, not a claim of completed visual or accessibility review.
