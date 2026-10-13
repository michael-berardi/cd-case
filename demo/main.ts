/**
 * Showcase page entry.
 *
 * Everything here goes through the published API re-exported by `src/index.ts`
 * — `createCdCase`, `paintLabel` and the exported option tables. There is no
 * framework, no CDN, no network request and no external asset: the case, the
 * environment lighting and the disc label are all generated at runtime.
 */

import {
  createCdCase,
  paintLabel,
  QUALITY,
  type CdCaseApi,
  type CdCaseEnvPreset,
  type CdCaseOptions,
  type CdCaseQuality,
  type LabelDesign,
} from "../src/index.js";

const ENVS: readonly CdCaseEnvPreset[] = ["studio", "void", "warm", "night"];
const QUALITIES: readonly CdCaseQuality[] = ["low", "medium", "high"];
const DEFAULT_TRACKS = ["Refraction", "Diffraction", "Hinge"];
const LABEL_PIXELS = 1024;

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`demo: #${id} is missing from demo/index.html`);
  }
  return node as T;
}

function selected<T extends string>(select: HTMLSelectElement, allowed: readonly T[], fallback: T): T {
  const value = select.value;
  return allowed.some((candidate) => candidate === value) ? (value as T) : fallback;
}

const stage = requireElement<HTMLDivElement>("stage");
const openButton = requireElement<HTMLButtonElement>("open");
const closeButton = requireElement<HTMLButtonElement>("close");
const toggleButton = requireElement<HTMLButtonElement>("toggle");
const openSlider = requireElement<HTMLInputElement>("open-slider");
const openReadout = requireElement<HTMLSpanElement>("open-value");
const titleInput = requireElement<HTMLInputElement>("title");
const subtitleInput = requireElement<HTMLInputElement>("subtitle");
const tracksArea = requireElement<HTMLTextAreaElement>("tracks");
const accentInput = requireElement<HTMLInputElement>("accent");
const qualitySelect = requireElement<HTMLSelectElement>("quality");
const envSelect = requireElement<HTMLSelectElement>("env");
const printLabelButton = requireElement<HTMLButtonElement>("print-label");
const generatedLabelButton = requireElement<HTMLButtonElement>("generated-label");
const snapshotButton = requireElement<HTMLButtonElement>("snapshot");
const remountButton = requireElement<HTMLButtonElement>("remount");
const status = requireElement<HTMLParagraphElement>("status");

let api: CdCaseApi | null = null;

function say(message: string): void {
  status.textContent = message;
}

function tracks(): string[] {
  const lines = tracksArea.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : DEFAULT_TRACKS;
}

/** A full label design, including the track list, painted onto a fresh canvas. */
function design(): LabelDesign {
  return {
    title: titleInput.value.trim() || "Untitled",
    subtitle: subtitleInput.value.trim() || "OverSeer Design",
    accent: accentInput.value,
    eyebrow: "OverSeer Design",
    catalogue: "OSD-001",
    tracks: tracks(),
  };
}

function options(open: number): CdCaseOptions {
  return {
    title: titleInput.value.trim() || "Untitled",
    subtitle: subtitleInput.value.trim() || "OverSeer Design",
    accent: accentInput.value,
    env: selected(envSelect, ENVS, "studio"),
    quality: selected(qualitySelect, QUALITIES, "medium"),
    background: "#0b0d12",
    interactive: true,
    autoSpin: true,
    open,
    onReady: (instance) => {
      const quality = selected(qualitySelect, QUALITIES, "medium");
      const tier = QUALITY[quality];
      say(`ready — ${quality} tier, bloom ${tier.bloom ? "on" : "off"}, pixel ratio ≤ ${tier.maxPixelRatio}`);
    },
    onError: (error) => say(`error — ${error.message}`),
  };
}

/** Structural options (`env`, `quality`) are baked at construction, so rebuild. */
function mount(): void {
  const open = api?.getOpen() ?? 0;
  api?.dispose();
  api = createCdCase(stage, options(open));
  document.documentElement.style.setProperty("--accent", accentInput.value);
}

openButton.addEventListener("click", () => {
  void api?.setOpen(1);
});

closeButton.addEventListener("click", () => {
  void api?.setOpen(0);
});

toggleButton.addEventListener("click", () => {
  void api?.toggle();
});

openSlider.addEventListener("input", () => {
  void api?.setOpen(Number(openSlider.value));
});

accentInput.addEventListener("input", () => {
  document.documentElement.style.setProperty("--accent", accentInput.value);
  api?.setAccent(accentInput.value);
  say(`accent → ${accentInput.value}`);
});

titleInput.addEventListener("change", () => {
  api?.setTitle(titleInput.value.trim() || "Untitled", subtitleInput.value.trim());
});

subtitleInput.addEventListener("change", () => {
  api?.setTitle(titleInput.value.trim() || "Untitled", subtitleInput.value.trim());
});

printLabelButton.addEventListener("click", () => {
  if (!api) return;
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_PIXELS;
  canvas.height = LABEL_PIXELS;
  paintLabel(canvas, design());
  api.setLabel(canvas);
  say(`printed label — ${tracks().length} track${tracks().length === 1 ? "" : "s"}`);
});

generatedLabelButton.addEventListener("click", () => {
  api?.setLabel(null);
  say("back to the generated label");
});

qualitySelect.addEventListener("change", () => {
  mount();
});

envSelect.addEventListener("change", () => {
  mount();
});

remountButton.addEventListener("click", () => {
  mount();
});

snapshotButton.addEventListener("click", () => {
  if (!api) return;
  const link = document.createElement("a");
  link.href = api.snapshot("image/png");
  link.download = "cd-case.png";
  link.click();
  say("saved cd-case.png");
});

function tick(): void {
  const instance = api;
  if (instance) {
    const open = instance.getOpen();
    openReadout.textContent = open.toFixed(2);
    if (document.activeElement !== openSlider) openSlider.value = open.toFixed(2);
  }
  requestAnimationFrame(tick);
}

mount();
requestAnimationFrame(tick);
