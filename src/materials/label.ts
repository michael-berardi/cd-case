/**
 * The generated disc face.
 *
 * A pressed CD is printed from about 23 mm to 58 mm radius, and the ink sits
 * directly on the aluminium, so it stays glossy and lets the diffraction
 * rainbow read straight through it. The generated design leans into that: a
 * printed face built from the accent colour, a fine track-groove texture that gives the rainbow
 * something to play across, and type set inside the printable annulus so
 * nothing is hidden by the tray hub.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

export interface LabelDesign {
  title: string;
  subtitle: string;
  /** Accent used for accent rings and rules. */
  accent: string;
  /** Small caps line above the title. Default `"OVERSEER DESIGN"`. */
  eyebrow?: string;
  /** Left-hand column of track titles. */
  tracks?: string[];
  /** Centred catalogue line below the subtitle. */
  catalogue?: string;
  /** Base ink colour. Default `"#08090d"`. */
  ink?: string;
}

/** Millimetres covered by the label canvas: the full 120 mm disc edge to edge. */
const DISC_MM = 120;

/** Default canvas resolution. 2048 maps 120 mm to 2048 px, about 17 px/mm. */
const DEFAULT_SIZE = 2048;

/**
 * Fine concentric grooves that read as the data spiral. They are drawn with
 * very low contrast so the diffraction shader, not the texture, supplies the
 * colour.
 */
function drawTracks(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const pxPerMm = size / DISC_MM;
  const inner = 17.2 * pxPerMm;
  const outer = 58.4 * pxPerMm;

  ctx.save();
  ctx.lineWidth = 1;
  for (let r = inner; r < outer; r += 2.4) {
    // Slightly irregular alpha so the spiral does not read as a flat moire.
    const t = (r - inner) / (outer - inner);
    const a = 0.028 + 0.02 * Math.sin(r * 0.11) * (1 - t * 0.6);
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(4)})`;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The printed face.
 *
 * A pressed disc is printed across nearly the whole printable annulus, and the
 * ink sits directly on the aluminium, so it stays glossy and any diffraction
 * reads through it. The face here is painted from the accent colour instead of
 * being left bare, and the outer few millimetres of foil are deliberately left
 * unprinted so the grating always has a bright metal annulus to work on.
 */
function drawPrintField(ctx: CanvasRenderingContext2D, size: number, design: LabelDesign): void {
  const c = size / 2;
  const pxPerMm = size / DISC_MM;
  const accent = normaliseHex(design.accent) ?? "#7fb2ff";
  const ink = normaliseHex(design.ink) ?? "#08090d";
  const inner = 23.2 * pxPerMm;
  const outer = 52.6 * pxPerMm;

  ctx.save();
  // The printable annulus: outer circle, then the inner one wound back.
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  ctx.arc(c, c, inner, 0, Math.PI * 2, true);
  ctx.clip();

  // Deep ground: the ink colour lifted toward the accent, brightest at the
  // top, so the face has a direction instead of reading as a flat swatch.
  const ground = ctx.createLinearGradient(0, c - outer, 0, c + outer);
  ground.addColorStop(0, mixHex(ink, accent, 0.36));
  ground.addColorStop(0.46, mixHex(ink, accent, 0.13));
  ground.addColorStop(1, ink);
  ctx.fillStyle = ground;
  ctx.fillRect(c - outer, c - outer, outer * 2, outer * 2);

  // Printed bands: fine concentric registers, denser toward the rim, the way a
  // disc face is actually laid out.
  ctx.lineWidth = Math.max(1, size / 1500);
  ctx.strokeStyle = accent;
  for (let r = inner; r < outer; r += 1.55 * pxPerMm) {
    const t = (r - inner) / (outer - inner);
    ctx.globalAlpha = (0.05 + 0.11 * t) * (0.72 + 0.28 * Math.sin(r * 0.09));
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // A tick burst through the outer third gives the face its colour and grain,
  // and gives the sparkle pass real peaks to catch.
  ctx.lineWidth = Math.max(1, size / 900);
  const burstIn = c - 40 * pxPerMm;
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2 + 0.013 * i;
    const len = (9 + 5.5 * Math.sin(i * 2.399)) * pxPerMm;
    ctx.globalAlpha = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(i * 1.7));
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * burstIn, c + Math.sin(a) * burstIn);
    ctx.lineTo(c + Math.cos(a) * (burstIn + len), c + Math.sin(a) * (burstIn + len));
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** `#rrggbb` when the value parses as one, otherwise `null`. */
function normaliseHex(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  const hex = m?.[1];
  return hex ? `#${hex.toLowerCase()}` : null;
}

/** Linear blend of two `#rrggbb` colours; `t` of 0 gives `a`, 1 gives `b`. */
function mixHex(a: string, b: string, t: number): string {
  const parts = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parts(a);
  const [r2, g2, b2] = parts(b);
  const k = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${k(r1, r2)}, ${k(g1, g2)}, ${k(b1, b2)})`;
}

function setFont(ctx: CanvasRenderingContext2D, size: number, px: number, weight = 600): void {
  const family =
    '"Inter", "Helvetica Neue", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
  ctx.font = `${weight} ${(px * size) / DEFAULT_SIZE}px ${family}`;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  px: number,
  weight: number,
  maxWidth: number,
): void {
  setFont(ctx, size, px, weight);
  const width = ctx.measureText(text).width;
  if (width > maxWidth) setFont(ctx, size, px * maxWidth / width, weight);
}

function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  maxWidth = Infinity,
): void {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.min(1, maxWidth / Math.max(total, 1)), 1);
  ctx.textAlign = "left";
  let cursor = -total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i]!, cursor, 0);
    cursor += widths[i]! + spacing;
  }
  ctx.restore();
}

/**
 * Paint the disc face onto a canvas. Exported so callers can composite their
 * own artwork on top before handing it back via `setLabel`.
 */
export function paintLabel(canvas: HTMLCanvasElement, design: LabelDesign): void {
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("cd-case: 2D canvas context unavailable");
  const c = size / 2;
  const pxPerMm = size / DISC_MM;
  const accent = design.accent || "#7fb2ff";

  ctx.clearRect(0, 0, size, size);

  // The face is printed from the accent, and the metal is left bare outside
  // it, so the rainbow reads as a metal annulus rather than as the design.
  drawTracks(ctx, size);
  drawPrintField(ctx, size, design);

  // Accent hairline rings frame the printable annulus without hiding foil.
  ctx.strokeStyle = accent;
  ctx.lineWidth = size / 620;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(c, c, 57.2 * pxPerMm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(c, c, 23.6 * pxPerMm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // All type lives inside the printed face, clear of the 23 mm hub and of the
  // bare metal annulus the grating needs.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = mixHex(accent, "#ffffff", 0.66);
  setFont(ctx, size, 30, 600);
  tracked(ctx, (design.eyebrow ?? "OVERSEER DESIGN").toUpperCase(), c,
    c - 15 * pxPerMm, 7 * (size / DEFAULT_SIZE), 52 * pxPerMm);

  const title = (design.title || "Untitled").toUpperCase();
  ctx.fillStyle = "#f6f8fb";
  fitFont(ctx, size, title, 236, 800, 80 * pxPerMm);
  ctx.fillText(title, c, c + 1 * pxPerMm);

  if (design.subtitle) {
    ctx.fillStyle = "#e8edf5";
    setFont(ctx, size, 44, 600);
    tracked(ctx, design.subtitle.toUpperCase(), c, c + 12 * pxPerMm,
      3 * (size / DEFAULT_SIZE), 66 * pxPerMm);
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = size / 512;
  ctx.beginPath();
  ctx.moveTo(c - 26 * pxPerMm, c + 6 * pxPerMm);
  ctx.lineTo(c + 26 * pxPerMm, c + 6 * pxPerMm);
  ctx.stroke();

  // The index runs as one tracked line so the band stays shallow and most of
  // the disc keeps its bare foil.
  const tracks = design.tracks ?? [];
  if (tracks.length > 0) {
    const line = tracks
      .slice(0, 4)
      .map((track, i) => `${String(i + 1).padStart(2, "0")} ${track.toUpperCase()}`)
      .join("   /   ");
    ctx.fillStyle = "rgba(240,244,250,0.82)";
    setFont(ctx, size, 21, 500);
    tracked(ctx, line, c, c + 17 * pxPerMm, 1.4 * (size / DEFAULT_SIZE), 78 * pxPerMm);
  }

  ctx.fillStyle = "rgba(240,244,250,0.72)";
  setFont(ctx, size, 20, 500);
  tracked(ctx, (design.catalogue ?? "OS — COMPACT DISC / STEREO").toUpperCase(),
    c, c + 20.5 * pxPerMm, 2 * (size / DEFAULT_SIZE), 60 * pxPerMm);
}

/** True when a canvas 2D context is available in this environment. */
export function canPaintLabel(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas");
  return !!probe.getContext("2d");
}

export interface GeneratedLabel {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
}

/**
 * Build a label texture for `design`. Returns `null` when there is no DOM
 * (server-side rendering), so callers can fall back to an unlabelled disc.
 */
export function createLabelTexture(design: LabelDesign, size = DEFAULT_SIZE): GeneratedLabel | null {
  if (!canPaintLabel()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1024, size);
  canvas.height = canvas.width;
  paintLabel(canvas, design);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { canvas, texture };
}

/** Re-paint an existing label texture in place, for `setTitle`. */
export function repaintLabel(texture: Texture, design: LabelDesign, size = DEFAULT_SIZE): boolean {
  const image = texture.image as HTMLCanvasElement | undefined;
  if (!image || typeof image.getContext !== "function") return false;
  const paintSize = Math.max(1024, size);
  if (image.width !== paintSize || image.height !== paintSize) {
    image.width = paintSize;
    image.height = paintSize;
  }
  paintLabel(image, design);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return true;
}
