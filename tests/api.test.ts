// @vitest-environment jsdom
/**
 * Public entry points that cannot be exercised without a GPU.
 *
 * Everything below either needs no WebGL (registration, option mirroring and
 * the failure paths) or is explicitly skipped because it does. jsdom defines
 * no `WebGL2RenderingContext` and its `getContext("webgl2")` returns null, so
 * the imperative handle (`setOpen` / `getOpen` / `dispose`) and the custom
 * element's live API are skipped here rather than run against a mocked
 * renderer, which would only assert on the mock.
 */

import { describe, expect, it } from "vitest";

import { CdCaseElement, CD_CASE_TAG, createCdCase, defineCdCaseElement } from "../src/index.js";

/** True only in a browser (or any environment with a real WebGL 2 implementation). */
const HAS_WEBGL2 = typeof WebGL2RenderingContext !== "undefined";

/**
 * Answer every canvas context request with null.
 *
 * jsdom already returns null and logs a "not implemented" error; the stub keeps
 * the same answer (so `createCdCase` still fails exactly as it would) without
 * the console noise.
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

function stage(): HTMLDivElement {
  const element = document.createElement("div");
  element.style.width = "640px";
  element.style.height = "480px";
  document.body.appendChild(element);
  return element;
}

describe("custom element registration", () => {
  it("defines <cd-case> once, on import", () => {
    expect(CD_CASE_TAG).toBe("cd-case");
    expect(customElements.get(CD_CASE_TAG)).toBe(CdCaseElement);
  });

  it("is safe to define again", () => {
    defineCdCaseElement();
    defineCdCaseElement();
    expect(customElements.get(CD_CASE_TAG)).toBe(CdCaseElement);
  });

  it("observes every option it mirrors", () => {
    expect(CdCaseElement.observedAttributes).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });
});

describe("failure paths without a WebGL context", () => {
  it("throws a WebGL error instead of half-mounting", () => {
    withoutCanvasBackend(() => {
      const host = stage();
      expect(() => createCdCase(host, { title: "Refraction" })).toThrow(
        /could not create a WebGL context[\s\S]*needs WebGL 2/i,
      );
      // Nothing should be left behind for a caller to clean up.
      expect(host.querySelector("canvas")).toBeNull();
    });
  });

  it("throws when the target selector matches nothing", () => {
    expect(() => createCdCase("#definitely-not-in-the-document")).toThrow(/no element matched/i);
  });

  it("reports the failure from <cd-case> as an error event", () => {
    withoutCanvasBackend(() => {
      const element = document.createElement(CD_CASE_TAG) as CdCaseElement;
      const errors: Error[] = [];
      element.addEventListener("cd-case-error", (event) => {
        errors.push((event as CustomEvent<{ error: Error }>).detail.error);
      });
      document.body.appendChild(element);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toMatch(/WebGL/i);
      expect(element.api).toBeNull();
      expect(element.shadowRoot?.querySelector(".stage")).not.toBeNull();
    });
  });
});

/**
 * Skipped: jsdom has no WebGL 2 implementation. These are the checks that
 * verify the public handle's behaviour, so they are left visible here rather
 * than replaced by a mock; the demo page exercises them in a browser.
 */
describe.skipIf(!HAS_WEBGL2)("CdCaseApi handle (needs a real WebGL 2 context)", () => {
  it("starts closed, animates setOpen and reports getOpen", async () => {
    const host = stage();
    const api = createCdCase(host, { title: "Refraction", quality: "low" });
    expect(api.getOpen()).toBe(0);

    await api.setOpen(1);
    expect(api.getOpen()).toBe(1);

    await api.close();
    expect(api.getOpen()).toBe(0);
  });

  it("removes its canvas and stops the loop on dispose", () => {
    const host = stage();
    const api = createCdCase(host, { quality: "low" });
    expect(host.querySelector("canvas")).not.toBeNull();

    api.dispose();
    api.dispose(); // idempotent
    expect(host.querySelector("canvas")).toBeNull();
  });

  it("drives <cd-case> through the same handle", async () => {
    const element = document.createElement(CD_CASE_TAG) as CdCaseElement;
    document.body.appendChild(element);
    const api = await element.ready;
    expect(api.getOpen()).toBe(0);
    await element.open();
    expect(element.api?.getOpen()).toBe(1);
    element.remove();
    expect(element.api).toBeNull();
  });
});
