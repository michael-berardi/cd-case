/**
 * `@overseer/cd-case` — an interactive CD jewel case for three.js.
 *
 * Three entry points are published:
 *
 * - `@overseer/cd-case`          the framework-free API and types
 * - `@overseer/cd-case/element`  the `<cd-case>` custom element
 * - `@overseer/cd-case/react`    a `<CdCase>` component and `useCdCase` hook
 *
 * ```ts
 * import { createCdCase } from "@overseer/cd-case";
 *
 * const cd = createCdCase("#stage", { title: "Refraction", env: "studio" });
 * await cd.open();
 * ```
 */

export { createCdCase, MAX_OPEN_DEG } from "./CdCase.js";
export { CdCaseElement, defineCdCaseElement, CD_CASE_TAG } from "./element.js";
export { CASE, DISC, ENV_PRESETS, QUALITY, resolveOptions } from "./options.js";
export { buildDiscGeometry, buildHingeGeometry, buildLidGeometry, buildTrayGeometry } from "./geometry.js";
export { buildEnvironment } from "./environment.js";
export { createDiscMaterial } from "./materials/disc.js";
export { createLabelTexture, paintLabel } from "./materials/label.js";
export { createPlasticMaterial } from "./materials/plastic.js";
export { PostPipeline } from "./post/pipeline.js";

export type { EnvPreset, BuiltEnvironment, EnvironmentOptions } from "./environment.js";
export type { DiscMaterial, DiscUniforms } from "./materials/disc.js";
export type { GeneratedLabel, LabelDesign } from "./materials/label.js";
export type { PlasticMaterial, PlasticUniforms } from "./materials/plastic.js";
export type { PostOptions } from "./post/pipeline.js";
export type {
  CdCaseApi,
  CdCaseEnvPreset,
  CdCaseInternals,
  CdCaseLabelSource,
  CdCaseOptions,
  CdCaseQuality,
  ResolvedCdCaseOptions,
} from "./types.js";
