// @vitest-environment jsdom
/**
 * Label design handling.
 *
 * jsdom has no canvas backend — `getContext("2d")` returns null and logs a
 * "not implemented" error — so the tests below never ask for a real context.
 * They drive `paintLabel` with a recording stub context, which is enough to
 * check that a design is accepted and normalised (case, fallbacks, track
 * clamping). Actually painting pixels needs a browser and is exercised by the
 * demo page rather than faked here; the one test that would need a real
 * backend is skipped with that reason.
 */

import { describe, expect, it } from "vitest";

import { createLabelTexture, paintLabel, type LabelDesign } from "../src/index.js";

interface Recorder {
  ctx: CanvasRenderingContext2D;
  /** Every character drawn, in order, joined back into its text run. */
  painted: () => string;
  fills: string[];
  strokes: string[];
}

/** A 2D context stand-in that records what `paintLabel` draws. */
function recorder(): Recorder {
  const runs: string[] = [];
  const fills: string[] = [];
  const strokes: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const noop = (): void => undefined;
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    rect: noop,
    clip: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    fillRect: noop,
    fill: noop,
    stroke: () => {
      strokes.push(String(ctx.strokeStyle));
    },
    fillText: (text: string) => {
      runs.push(text);
      fills.push(String(ctx.fillStyle));
    },
    measureText: (text: string) => ({ width: text.length * 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    painted: () => runs.join(""),
    fills,
    strokes,
  };
}

function canvasWith(context: CanvasRenderingContext2D | null, size = 1024): HTMLCanvasElement {
  return {
    width: size,
    height: size,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

/**
 * Run `body` with `getContext` stubbed to null.
 *
 * jsdom throws a "not implemented" error into the console for every canvas
 * request; the stub gives the same answer it already gives (null) without the
 * noise, so the assertions stay deterministic.
 */
function withoutCanvasBackend<T>(body: () => T): T {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  try {
    return body();
  } finally {
    HTMLCanvasElement.prototype.getContext = original;
  }
}

const design = (overrides: Partial<LabelDesign> = {}): LabelDesign => ({
  title: "Refraction",
  subtitle: "Liberty Design Studio",
  accent: "#ff7ab8",
  ...overrides,
});

/**
 * Which channel wins in each recorded fill. Used to prove the accent's hue
 * actually reaches the printed face, without pinning the exact mixed tone.
 */
function dominantChannels(fills: string[]): string[] {
  const out = new Set<string>();
  for (const value of fills) {
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(value);
    if (!m) continue;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (r >= g && r >= b && r > 0) out.add("r");
    if (g >= r && g >= b && g > 0) out.add("g");
    if (b >= r && b >= g && b > 0) out.add("b");
  }
  return [...out];
}

describe("paintLabel", () => {
  it("accepts a design and sets it in upper case", () => {
    const recording = recorder();
    paintLabel(canvasWith(recording.ctx), design());
    const painted = recording.painted();
    expect(painted).toContain("OVERSEER DESIGN");
    expect(painted).toContain("REFRACTION");
    expect(painted).toContain("LIBERTY DESIGN STUDIO");
    expect(painted).toContain("OS — COMPACT DISC / STEREO");
    // The face is printed from the accent, so the accent's hue has to reach
    // the canvas even though every tone is mixed before it is filled.
    expect(dominantChannels(recording.fills)).toContain("r");
    expect(recording.strokes).toContain("#ff7ab8");
  });

  it("fills in defaults for an empty design", () => {
    const recording = recorder();
    paintLabel(canvasWith(recording.ctx), { title: "", subtitle: "", accent: "" });
    const painted = recording.painted();
    expect(painted).toContain("UNTITLED");
    expect(painted).toContain("OVERSEER DESIGN");
    // An empty accent falls back to the documented default, so the printed
    // face is tinted blue rather than pink.
    expect(dominantChannels(recording.fills)).toContain("b");
    // No tracks, so no numbered index line.
    expect(painted).not.toContain("01 ");
  });

  it("indexes at most the first four tracks", () => {
    const recording = recorder();
    paintLabel(
      canvasWith(recording.ctx),
      design({
        tracks: ["Refraction", "Diffraction", "Hinge", "Crystal Clear", "Beer-Lambert", "Bake"],
      }),
    );
    const painted = recording.painted();
    expect(painted).toContain("01 REFRACTION");
    expect(painted).toContain("04 CRYSTAL CLEAR");
    expect(painted).not.toContain("05 ");
    expect(painted).not.toContain("BEER-LAMBERT");
  });

  it("honours a custom eyebrow and catalogue line", () => {
    const recording = recorder();
    paintLabel(canvasWith(recording.ctx), design({ eyebrow: "limited edition", catalogue: "osd-042" }));
    const painted = recording.painted();
    expect(painted).toContain("LIMITED EDITION");
    expect(painted).toContain("OSD-042");
  });

  it("fails loudly when the canvas has no 2D context", () => {
    withoutCanvasBackend(() => {
      expect(() => paintLabel(canvasWith(null), design())).toThrow(/2D canvas context/i);
    });
  });
});

describe("createLabelTexture", () => {
  it("returns null instead of throwing where no canvas backend exists", () => {
    withoutCanvasBackend(() => {
      expect(createLabelTexture(design())).toBeNull();
    });
  });

  // Needs a real 2D canvas: jsdom does not implement one (the optional
  // `canvas` npm package is not installed), so this is skipped rather than run
  // against a mock, which would only assert on the mock.
  it.skip("paints a real canvas and wraps it in a texture", () => {
    const generated = createLabelTexture(design());
    expect(generated).not.toBeNull();
    expect(generated!.canvas.width).toBeGreaterThanOrEqual(1024);
    expect(generated!.texture.image).toBe(generated!.canvas);
  });
});
