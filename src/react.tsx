/**
 * React binding.
 *
 * `react` is an optional peer dependency: nothing in the core entry point
 * imports this file, so a vanilla three.js consumer never pulls React in.
 *
 * ```tsx
 * import { CdCase } from "@overseer/cd-case/react";
 *
 * <CdCase title="Refraction" accent="#7fb2ff" style={{ height: 480 }} />
 * ```
 */

import { useEffect, useRef, type CSSProperties, type ReactElement } from "react";

import { createCdCase } from "./CdCase.js";
import type { CdCaseApi, CdCaseLabelSource, CdCaseOptions } from "./types.js";

/** Options that can be changed on a live instance without a rebuild. */
const LIVE_KEYS = new Set([
  "accent",
  "label",
  "title",
  "subtitle",
  "open",
  "autoSpin",
  "spinSpeed",
  "interactive",
  "idleDrift",
  "background",
  "env",
  "quality",
]);

/** Options that require tearing the instance down and rebuilding it. */
const STRUCTURAL_KEYS = new Set([
  "env",
  "quality",
  "background",
  "labelSide",
  "ior",
  "tint",
  "bloom",
  "maxPixelRatio",
  "pauseWhenOffscreen",
]);

export interface CdCaseProps extends CdCaseOptions {
  /** Receives the live API once the renderer starts. */
  onReady?: (api: CdCaseApi) => void;
  /** Style applied to the container element. Height is required. */
  style?: CSSProperties;
  className?: string;
  /** Forwarded to the container. The case is decorative to assistive tech. */
  "aria-label"?: string;
}

function applyLive(api: CdCaseApi, options: CdCaseOptions): void {
  if (options.accent !== undefined) api.setAccent(options.accent);
  if (options.label !== undefined) api.setLabel(options.label as CdCaseLabelSource | null);
  if (options.title !== undefined || options.subtitle !== undefined) {
    api.setTitle(options.title ?? "", options.subtitle);
  }
  if (options.open !== undefined) void api.setOpen(options.open);
}

/**
 * Mount a CD jewel case and keep it in step with `props`.
 *
 * Changes to structural options (`env`, `quality`, `background`, `labelSide`,
 * `ior`, `tint`) rebuild the renderer, because they are baked into the
 * environment cube or the clear state. Everything else is applied in place.
 */
export function CdCase(props: CdCaseProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<CdCaseApi | null>(null);
  const optionsRef = useRef(props);
  optionsRef.current = props;

  const structuralSignature = [...STRUCTURAL_KEYS]
    .map((key) => `${key}=${String((props as Record<string, unknown>)[key] ?? "")}`)
    .join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const current = optionsRef.current;
    const api = createCdCase(host, current);
    apiRef.current = api;
    current.onReady?.(api);
    return () => {
      apiRef.current = null;
      api.dispose();
    };
  }, [structuralSignature]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    applyLive(api, props);
  });

  const { style, className } = props;
  return <div ref={hostRef} className={className} style={style} aria-label={props["aria-label"]} />;
}

/**
 * Imperative hook for callers that want to drive the case themselves.
 * Returns a ref to attach and a getter for the live API.
 */
export function useCdCase(options: CdCaseOptions = {}): {
  ref: (node: HTMLDivElement | null) => void;
  getApi: () => CdCaseApi | null;
} {
  const apiRef = useRef<CdCaseApi | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const ref = (node: HTMLDivElement | null): void => {
    if (apiRef.current) {
      apiRef.current.dispose();
      apiRef.current = null;
    }
    if (node) apiRef.current = createCdCase(node, optionsRef.current);
  };

  return { ref, getApi: () => apiRef.current };
}

export { LIVE_KEYS };
