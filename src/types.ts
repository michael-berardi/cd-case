/**
 * Public types for `@overseer/cd-case`.
 *
 * The module renders an interactive CD jewel case with three.js. All scene
 * units are millimetres, so a standard jewel case is 142 x 125 x 10.4.
 */

import type { Camera, Group, Mesh, Object3D, Scene, Texture, WebGLRenderer } from "three";

/** Named environment light rigs, built procedurally at runtime. */
export type CdCaseEnvPreset = "studio" | "void" | "warm" | "night";

/**
 * Render-cost tiers.
 *
 * - `low`    — no bloom, half-resolution environment, 1x pixel ratio ceiling.
 * - `medium` — bloom on, 256px cube environment, device pixel ratio ceiling 2.
 * - `high`   — bloom on, 512px cube environment, device pixel ratio ceiling 2,
 *              plus soft contact shadow.
 */
export type CdCaseQuality = "low" | "medium" | "high";

/** Anything that can be turned into the printed disc face. */
export type CdCaseLabelSource =
  | string
  | HTMLCanvasElement
  | HTMLImageElement
  | ImageBitmap
  | Texture;

export interface CdCaseOptions {
  // ---- appearance -------------------------------------------------------
  /** CSS colour behind the case, or `null` for a transparent canvas. */
  background?: string | null;
  /** Environment light rig. Default `"studio"`. */
  env?: CdCaseEnvPreset;
  /**
   * Accent colour used by the rim lights in the environment rig and by the
   * case-edge sheen. Default `"#7fb2ff"`.
   */
  accent?: string;
  /** Which face of the disc carries a printed label. Default `"front"`. */
  labelSide?: "front" | "back" | "none";
  /** Printed disc face. Falls back to a generated label using `title`. */
  label?: CdCaseLabelSource | null;
  /** Title drawn on the generated label when no `label` is supplied. */
  title?: string;
  /** Artist/credit line drawn under the title on the generated label. */
  subtitle?: string;
  /** Refractive index of the case plastic. Default `1.52` (polycarbonate-ish). */
  ior?: number;
  /** Beer-Lambert absorption for the plastic, per millimetre, 0..1. */
  tint?: string;

  // ---- motion -----------------------------------------------------------
  /** Spin the disc. Default `true`. */
  autoSpin?: boolean;
  /** Radians per second at unit time scale. Default `0.35`. */
  spinSpeed?: number;
  /** `0` closed, `1` fully open. Default `0`. */
  open?: number;
  /** Open the lid on first pointer interaction. Default `true` when interactive. */
  openOnInteract?: boolean;
  /** Respect `prefers-reduced-motion`. Default `true`. */
  respectReducedMotion?: boolean;

  // ---- interaction ------------------------------------------------------
  /** Drag to orbit and open/close the lid. Default `true`. */
  interactive?: boolean;
  /** Idle orbit drift, radians per second. Default `0.05`. */
  idleDrift?: number;

  // ---- rendering --------------------------------------------------------
  quality?: CdCaseQuality;
  /** Enable bloom on the specular highlights. Default per quality tier. */
  bloom?: boolean;
  /** Cap on `devicePixelRatio`. Default per quality tier. */
  maxPixelRatio?: number;
  /** Render only while visible in the viewport. Default `true`. */
  pauseWhenOffscreen?: boolean;

  // ---- hooks ------------------------------------------------------------
  onReady?: (instance: CdCaseApi) => void;
  onError?: (error: Error) => void;
}

/** Options after defaults are applied. */
export type ResolvedCdCaseOptions = Required<
  Omit<CdCaseOptions, "label" | "title" | "subtitle" | "background" | "onReady" | "onError" | "tint">
> & {
  label: CdCaseLabelSource | null;
  title: string;
  subtitle: string;
  background: string | null;
  tint: string;
  onReady?: (instance: CdCaseApi) => void;
  onError?: (error: Error) => void;
};

/** Constructed three.js objects, exposed for advanced composition. */
export interface CdCaseInternals {
  scene: Scene;
  camera: Camera;
  renderer: WebGLRenderer;
  root: Group;
  lid: Object3D;
  tray: Object3D;
  disc: Mesh;
  env: Texture;
}

/** Imperative handle returned by `createCdCase` and the React binding. */
export interface CdCaseApi {
  readonly internals: CdCaseInternals;
  /** Animate the lid. Resolves when the motion settles. */
  setOpen(value: number): Promise<void>;
  open(): Promise<void>;
  close(): Promise<void>;
  toggle(): Promise<void>;
  /** Current lid progress, 0..1. */
  getOpen(): number;
  /** Replace the printed disc face. */
  setLabel(source: CdCaseLabelSource | null): void;
  setTitle(title: string, subtitle?: string): void;
  setAccent(accent: string): void;
  /** Pause or resume the render loop without tearing down the context. */
  setPaused(paused: boolean): void;
  /** Force a single render. Useful for deterministic screenshots. */
  render(): void;
  /** Resize to the container. */
  resize(): void;
  /** PNG data URL of the current frame. */
  snapshot(type?: "image/png" | "image/jpeg", quality?: number): string;
  dispose(): void;
}
