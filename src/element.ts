/**
 * `<cd-case>` — the custom element binding.
 *
 * Attributes are mirror images of `CdCaseOptions`, using kebab-case, and the
 * element emits one event per observable state change. Importing this module
 * has the side effect of defining the element, unless `defineCdCaseElement()`
 * has already run.
 */

import { createCdCase } from "./CdCase.js";
import type { CdCaseApi, CdCaseEnvPreset, CdCaseLabelSource, CdCaseOptions, CdCaseQuality } from "./types.js";

export const CD_CASE_TAG = "cd-case";

/** Fired once the renderer is live. `detail` is the `CdCaseApi`. */
export interface CdCaseReadyDetail {
  api: CdCaseApi;
}

const TEMPLATE = `
  <style>
    :host {
      display: block;
      position: relative;
      min-height: 240px;
      contain: layout paint;
    }
    :host([hidden]) { display: none; }
    .stage { position: absolute; inset: 0; }
  </style>
  <div class="stage" part="stage"></div>
`;

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value !== "false" && value !== "0";
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export class CdCaseElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "title",
      "subtitle",
      "accent",
      "env",
      "quality",
      "background",
      "label",
      "label-side",
      "open",
      "spin",
      "spin-speed",
      "interactive",
    ];
  }

  #api: CdCaseApi | null = null;
  #stage: HTMLElement | null = null;
  #ready = false;
  #disconnected = false;

  /** The live instance, or `null` before the element connects. */
  get api(): CdCaseApi | null {
    return this.#api;
  }

  /** Resolves once the renderer has started. */
  get ready(): Promise<CdCaseApi> {
    if (this.#api) return Promise.resolve(this.#api);
    return new Promise<CdCaseApi>((resolve) => {
      this.addEventListener("cd-case-ready", (event) => {
        resolve((event as CustomEvent<CdCaseReadyDetail>).detail.api);
      }, { once: true });
    });
  }

  connectedCallback(): void {
    if (this.#ready) return;
    this.#ready = true;
    this.#disconnected = false;

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot!;
    if (!root.querySelector(".stage")) root.innerHTML = TEMPLATE;
    this.#stage = root.querySelector<HTMLElement>(".stage");

    try {
      this.#api = createCdCase(this.#stage ?? this, this.#options());
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent("cd-case-error", {
          detail: { error: error as Error },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent<CdCaseReadyDetail>("cd-case-ready", {
        detail: { api: this.#api },
        bubbles: true,
        composed: true,
      }),
    );
  }

  disconnectedCallback(): void {
    this.#disconnected = true;
    this.#api?.dispose();
    this.#api = null;
    this.#ready = false;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.#api) return;
    const api = this.#api;
    switch (name) {
      case "title":
        api.setTitle(newValue ?? "Untitled", this.getAttribute("subtitle") ?? undefined);
        break;
      case "subtitle":
        api.setTitle(this.getAttribute("title") ?? "Untitled", newValue ?? undefined);
        break;
      case "accent":
        if (newValue) api.setAccent(newValue);
        break;
      case "open": {
        const value = parseNumber(newValue) ?? 0;
        void api.setOpen(value);
        break;
      }
      case "label":
        if (newValue) api.setLabel(newValue);
        break;
      default:
        // env, quality, background, label-side and interactive are structural:
        // they are applied when the element connects.
        break;
    }
  }

  // ---- imperative mirror of the API --------------------------------------

  async open(): Promise<void> {
    await this.#api?.open();
    this.#announce("cd-case-open", true);
  }

  async close(): Promise<void> {
    await this.#api?.close();
    this.#announce("cd-case-open", false);
  }

  async toggle(): Promise<void> {
    await this.#api?.toggle();
    this.#announce("cd-case-open", (this.#api?.getOpen() ?? 0) > 0.5);
  }

  setLabel(source: CdCaseLabelSource | null): void {
    this.#api?.setLabel(source);
  }

  snapshot(type?: "image/png" | "image/jpeg", quality?: number): string | null {
    return this.#api?.snapshot(type, quality) ?? null;
  }

  #announce(name: string, open: boolean): void {
    this.dispatchEvent(
      new CustomEvent(name, { detail: { open }, bubbles: true, composed: true }),
    );
  }

  #options(): CdCaseOptions {
    const labelSide = this.getAttribute("label-side");
    const env = this.getAttribute("env");
    const quality = this.getAttribute("quality");
    const background = this.getAttribute("background");
    return {
      title: this.getAttribute("title") ?? undefined,
      subtitle: this.getAttribute("subtitle") ?? undefined,
      accent: this.getAttribute("accent") ?? undefined,
      env: (env as CdCaseEnvPreset | null) ?? undefined,
      quality: (quality as CdCaseQuality | null) ?? undefined,
      background: background === "transparent" ? null : (background ?? undefined),
      labelSide: (labelSide as CdCaseOptions["labelSide"]) ?? undefined,
      label: this.getAttribute("label") ?? undefined,
      open: parseNumber(this.getAttribute("open")) ?? undefined,
      autoSpin: parseBoolean(this.getAttribute("spin"), true),
      spinSpeed: parseNumber(this.getAttribute("spin-speed")),
      interactive: parseBoolean(this.getAttribute("interactive"), true),
    };
  }
}

let defined = false;

/** Register `<cd-case>`. Safe to call more than once. */
export function defineCdCaseElement(): void {
  if (defined || typeof customElements === "undefined") return;
  if (customElements.get(CD_CASE_TAG)) {
    defined = true;
    return;
  }
  customElements.define(CD_CASE_TAG, CdCaseElement);
  defined = true;
}

defineCdCaseElement();
