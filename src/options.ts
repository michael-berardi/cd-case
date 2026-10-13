import type { CdCaseEnvPreset, CdCaseOptions, CdCaseQuality, ResolvedCdCaseOptions } from "./types.js";

/** Physical dimensions of a standard jewel case, in millimetres. */
export const CASE = {
  /** Outer width (the spine runs along this edge). */
  width: 142,
  /** Outer height. */
  height: 125,
  /** Total closed depth, front of lid to back of tray. */
  depth: 10.4,
  /** Thickness of the clear lid shell. */
  lidDepth: 4.4,
  /** Thickness of the tray that holds the disc. */
  trayDepth: 6.0,
  /** Wall thickness of the moulded plastic. */
  wall: 1.4,
  /** Outer corner radius of the moulding. */
  corner: 3,
  /** Bevel radius on the moulded edges. */
  bevel: 0.6,
} as const;

/** Physical dimensions of a standard 120 mm compact disc, in millimetres. */
export const DISC = {
  /** Outer radius. */
  radius: 60,
  /** Radius of the centre hole. */
  hole: 7.5,
  /** Radius of the stacking ring / clamping area. */
  hub: 16.5,
  /** Radius where the printed label area begins. */
  labelInner: 23,
  /** Disc thickness. */
  thickness: 1.2,
  /** Track pitch of the data spiral: 1.6 microns, expressed in millimetres. */
  trackPitch: 0.0016,
} as const;

export const QUALITY: Record<
  CdCaseQuality,
  { envSize: number; envSamples: number; bloom: boolean; maxPixelRatio: number; anisotropy: number }
> = {
  low: { envSize: 128, envSamples: 0, bloom: false, maxPixelRatio: 1, anisotropy: 1 },
  medium: { envSize: 256, envSamples: 4, bloom: true, maxPixelRatio: 2, anisotropy: 4 },
  high: { envSize: 1024, envSamples: 16, bloom: true, maxPixelRatio: 2, anisotropy: 8 },
};

export const ENV_PRESETS: Record<CdCaseEnvPreset, { exposure: number; ambient: number; key: number }> = {
  studio: { exposure: 1.0, ambient: 0.35, key: 3.2 },
  void: { exposure: 0.85, ambient: 0.12, key: 2.4 },
  warm: { exposure: 1.05, ambient: 0.4, key: 3.0 },
  night: { exposure: 0.9, ambient: 0.08, key: 1.8 },
};

const DEFAULTS = {
  background: "#0b0d12" as string | null,
  env: "studio" as CdCaseEnvPreset,
  accent: "#7fb2ff",
  labelSide: "front" as const,
  ior: 1.59,
  tint: "#dfe9f2",
  autoSpin: true,
  spinSpeed: 0.35,
  open: 0,
  openOnInteract: true,
  respectReducedMotion: true,
  interactive: true,
  idleDrift: 0.05,
  quality: "medium" as CdCaseQuality,
  pauseWhenOffscreen: true,
};

export function resolveOptions(options: CdCaseOptions = {}): ResolvedCdCaseOptions {
  const quality = options.quality ?? DEFAULTS.quality;
  const tier = QUALITY[quality];

  return {
    ...DEFAULTS,
    ...options,
    quality,
    label: options.label ?? null,
    title: options.title ?? "Untitled",
    subtitle: options.subtitle ?? "OverSeer Design",
    bloom: options.bloom ?? tier.bloom,
    maxPixelRatio: options.maxPixelRatio ?? tier.maxPixelRatio,
  } as ResolvedCdCaseOptions;
}
