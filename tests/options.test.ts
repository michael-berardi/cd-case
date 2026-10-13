/**
 * Option resolution. Pure data — no DOM, no GPU, so this file runs in the
 * default Node environment.
 */

import { describe, expect, it } from "vitest";

import { CASE, DISC, ENV_PRESETS, QUALITY, resolveOptions } from "../src/options.js";

/** The defaults documented in `src/options.ts` and the README. */
const DOCUMENTED_DEFAULTS = {
  background: "#0b0d12",
  env: "studio",
  accent: "#7fb2ff",
  labelSide: "front",
  ior: 1.59,
  tint: "#dfe9f2",
  autoSpin: true,
  spinSpeed: 0.35,
  open: 0,
  openOnInteract: true,
  respectReducedMotion: true,
  interactive: true,
  idleDrift: 0.05,
  quality: "medium",
  pauseWhenOffscreen: true,
} as const;

describe("physical constants", () => {
  it("describes a standard 142 x 125 x 10.4 mm jewel case", () => {
    expect(CASE.width).toBe(142);
    expect(CASE.height).toBe(125);
    expect(CASE.depth).toBe(10.4);
  });

  it("splits the closed depth between the two moulded shells", () => {
    expect(CASE.lidDepth + CASE.trayDepth).toBeCloseTo(CASE.depth, 6);
    expect(CASE.lidDepth).toBeGreaterThan(0);
    expect(CASE.trayDepth).toBeGreaterThan(0);
  });

  it("describes a standard 120 mm compact disc", () => {
    expect(DISC.radius).toBe(60);
    expect(DISC.hole).toBe(7.5);
    expect(DISC.hub).toBe(16.5);
    expect(DISC.thickness).toBe(1.2);
  });

  it("keeps the disc radii in the order the moulding assumes", () => {
    expect(DISC.hole).toBeLessThan(DISC.hub);
    expect(DISC.hub).toBeLessThan(DISC.labelInner);
    expect(DISC.labelInner).toBeLessThan(DISC.radius);
    // The disc has to fit inside the case with room for the tray walls.
    expect(DISC.radius * 2).toBeLessThan(CASE.width);
    expect(DISC.radius * 2).toBeLessThan(CASE.height);
  });
});

describe("quality tiers", () => {
  it("defines every tier with a finite, positive environment size", () => {
    for (const quality of ["low", "medium", "high"] as const) {
      const tier = QUALITY[quality];
      expect(tier, quality).toBeDefined();
      expect(Number.isFinite(tier.envSize)).toBe(true);
      expect(tier.envSize).toBeGreaterThan(0);
      expect(Number.isFinite(tier.anisotropy)).toBe(true);
      expect(tier.anisotropy).toBeGreaterThanOrEqual(1);
    }
  });

  it("raises resolution with the tier", () => {
    expect(QUALITY.medium.envSize).toBeGreaterThan(QUALITY.low.envSize);
    expect(QUALITY.high.envSize).toBeGreaterThan(QUALITY.medium.envSize);
  });

  it("turns bloom off in the cheapest tier only", () => {
    expect(QUALITY.low.bloom).toBe(false);
    expect(QUALITY.medium.bloom).toBe(true);
    expect(QUALITY.high.bloom).toBe(true);
  });
});

describe("environment presets", () => {
  it("covers every preset the public type allows", () => {
    for (const preset of ["studio", "void", "warm", "night"] as const) {
      const rig = ENV_PRESETS[preset];
      expect(rig, preset).toBeDefined();
      expect(rig.exposure).toBeGreaterThan(0);
      expect(rig.ambient).toBeGreaterThanOrEqual(0);
      expect(rig.key).toBeGreaterThan(0);
    }
  });

  it("keeps the darkest preset darker than the studio rig", () => {
    expect(ENV_PRESETS.night.ambient).toBeLessThan(ENV_PRESETS.studio.ambient);
    expect(ENV_PRESETS.night.key).toBeLessThan(ENV_PRESETS.studio.key);
  });
});

describe("resolveOptions", () => {
  it("applies every documented default to an empty call", () => {
    const resolved = resolveOptions();
    for (const [key, value] of Object.entries(DOCUMENTED_DEFAULTS)) {
      expect(resolved[key as keyof typeof DOCUMENTED_DEFAULTS], key).toBe(value);
    }
    expect(resolved.label).toBeNull();
    expect(resolved.title).toBe("Untitled");
    expect(resolved.subtitle).toBe("OverSeer Design");
  });

  it("takes bloom and pixel ratio from the resolved tier", () => {
    for (const quality of ["low", "medium", "high"] as const) {
      const resolved = resolveOptions({ quality });
      expect(resolved.quality).toBe(quality);
      expect(resolved.bloom).toBe(QUALITY[quality].bloom);
      expect(resolved.maxPixelRatio).toBe(QUALITY[quality].maxPixelRatio);
    }
  });

  it("lets explicit options win over the tier defaults", () => {
    const resolved = resolveOptions({ quality: "low", bloom: true, maxPixelRatio: 3 });
    expect(resolved.quality).toBe("low");
    expect(resolved.bloom).toBe(true);
    expect(resolved.maxPixelRatio).toBe(3);
  });

  it("treats an explicit undefined as an omitted option", () => {
    const resolved = resolveOptions({ title: undefined, subtitle: undefined, quality: undefined });
    expect(resolved.title).toBe("Untitled");
    expect(resolved.subtitle).toBe("OverSeer Design");
    expect(resolved.quality).toBe(DOCUMENTED_DEFAULTS.quality);
    expect(resolved.bloom).toBe(QUALITY[DOCUMENTED_DEFAULTS.quality].bloom);
  });

  it("passes caller values straight through", () => {
    const resolved = resolveOptions({
      title: "Refraction",
      subtitle: "Liberty Design Studio",
      accent: "#ff7ab8",
      env: "night",
      open: 1,
      autoSpin: false,
      spinSpeed: 0,
      labelSide: "none",
    });
    expect(resolved.title).toBe("Refraction");
    expect(resolved.subtitle).toBe("Liberty Design Studio");
    expect(resolved.accent).toBe("#ff7ab8");
    expect(resolved.env).toBe("night");
    expect(resolved.open).toBe(1);
    expect(resolved.autoSpin).toBe(false);
    expect(resolved.spinSpeed).toBe(0);
    expect(resolved.labelSide).toBe("none");
  });

  it("supports a transparent canvas", () => {
    expect(resolveOptions({ background: null }).background).toBeNull();
  });

  it("keeps a caller-supplied label source as-is", () => {
    const label = "#painting";
    expect(resolveOptions({ label }).label).toBe(label);
    expect(resolveOptions({ label: null }).label).toBeNull();
  });

  it("does not mutate the object it was given", () => {
    const options = { quality: "high" as const };
    const before = { ...options };
    resolveOptions(options);
    expect(options).toEqual(before);
  });
});
