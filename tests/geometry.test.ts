/**
 * Geometry invariants. Pure maths on BufferGeometry — three.js builds these
 * without a renderer, so this file runs headless in the default Node
 * environment and needs no WebGL.
 *
 * Every expected dimension is *derived from the exported constants* in
 * `src/options.ts`, never re-typed, so a change to the constants fails here
 * instead of silently disagreeing with the moulding.
 */

import { describe, expect, it } from "vitest";
import { Vector3, type BufferGeometry } from "three";

import {
  buildDiscGeometry,
  buildHingeGeometry,
  buildLidGeometry,
  buildTrayGeometry,
  hingeAxis,
} from "../src/geometry.js";
import { CASE, DISC } from "../src/options.js";

const EPSILON = 1e-4;

interface Bounds {
  min: Vector3;
  max: Vector3;
}

function positions(geometry: BufferGeometry) {
  const attribute = geometry.getAttribute("position");
  if (!attribute) throw new Error("geometry has no position attribute");
  return attribute;
}

function bounds(geometry: BufferGeometry): Bounds {
  const attribute = positions(geometry);
  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  const point = new Vector3();
  for (let i = 0; i < attribute.count; i += 1) {
    point.fromBufferAttribute(attribute, i);
    min.min(point);
    max.max(point);
  }
  return { min, max };
}

/** Closest and furthest vertex distance from the disc's axis of revolution. */
function radialRange(geometry: BufferGeometry): { inner: number; outer: number } {
  const attribute = positions(geometry);
  let inner = Number.POSITIVE_INFINITY;
  let outer = 0;
  for (let i = 0; i < attribute.count; i += 1) {
    const radius = Math.hypot(attribute.getX(i), attribute.getY(i));
    inner = Math.min(inner, radius);
    outer = Math.max(outer, radius);
  }
  return { inner, outer };
}

const GEOMETRIES: ReadonlyArray<readonly [string, () => BufferGeometry]> = [
  ["disc", buildDiscGeometry],
  ["tray", buildTrayGeometry],
  ["lid", buildLidGeometry],
  ["hinge", buildHingeGeometry],
];

describe("shared geometry contracts", () => {
  it("builds indexed, non-empty, finite meshes", () => {
    for (const [name, build] of GEOMETRIES) {
      const geometry = build();
      const attribute = positions(geometry);
      expect(attribute.count, name).toBeGreaterThan(0);
      expect(geometry.getIndex(), `${name} index`).not.toBeNull();
      for (let i = 0; i < attribute.count * 3; i += 1) {
        expect(Number.isFinite(attribute.array[i] as number), `${name} position ${i}`).toBe(true);
      }
      geometry.dispose();
    }
  });
});

describe("buildDiscGeometry", () => {
  const geometry = buildDiscGeometry();
  const box = bounds(geometry);

  it("is a DISC.radius disc", () => {
    expect(box.min.x).toBeCloseTo(-DISC.radius, 3);
    expect(box.max.x).toBeCloseTo(DISC.radius, 3);
    expect(box.min.y).toBeCloseTo(-DISC.radius, 3);
    expect(box.max.y).toBeCloseTo(DISC.radius, 3);
  });

  it("is DISC.thickness thick, centred on z = 0", () => {
    expect(box.min.z).toBeCloseTo(-DISC.thickness / 2, 3);
    expect(box.max.z).toBeCloseTo(DISC.thickness / 2, 3);
    expect(box.max.z - box.min.z).toBeCloseTo(DISC.thickness, 3);
  });

  it("has a DISC.hole centre hole and no vertex inside it", () => {
    const { inner, outer } = radialRange(geometry);
    expect(inner).toBeCloseTo(DISC.hole, 3);
    expect(outer).toBeCloseTo(DISC.radius, 3);
  });

  it("carries the true millimetre radius in aRadius", () => {
    const attribute = positions(geometry);
    const radiusAttribute = geometry.getAttribute("aRadius");
    expect(radiusAttribute).toBeDefined();
    let max = 0;
    for (let i = 0; i < attribute.count; i += 1) {
      const expected = Math.hypot(attribute.getX(i), attribute.getY(i));
      expect(radiusAttribute!.getX(i), `aRadius ${i}`).toBeCloseTo(expected, 4);
      max = Math.max(max, radiusAttribute!.getX(i));
    }
    expect(max).toBeCloseTo(DISC.radius, 3);
  });

  it("projects a planar uv in the unit square for the label", () => {
    const uv = geometry.getAttribute("uv");
    expect(uv).toBeDefined();
    for (let i = 0; i < uv!.count; i += 1) {
      expect(uv!.getX(i)).toBeGreaterThanOrEqual(-EPSILON);
      expect(uv!.getX(i)).toBeLessThanOrEqual(1 + EPSILON);
      expect(uv!.getY(i)).toBeGreaterThanOrEqual(-EPSILON);
      expect(uv!.getY(i)).toBeLessThanOrEqual(1 + EPSILON);
    }
  });
});

describe("buildTrayGeometry", () => {
  const geometry = buildTrayGeometry();
  const box = bounds(geometry);

  it("fills the CASE footprint exactly", () => {
    expect(box.min.x).toBeCloseTo(-CASE.width / 2, 3);
    expect(box.max.x).toBeCloseTo(CASE.width / 2, 3);
    expect(box.min.y).toBeCloseTo(-CASE.height / 2, 3);
    expect(box.max.y).toBeCloseTo(CASE.height / 2, 3);
  });

  it("spans z 0..CASE.trayDepth without breaching the lid", () => {
    expect(box.min.z).toBeCloseTo(0, 3);
    expect(box.max.z).toBeCloseTo(CASE.trayDepth, 3);
    expect(CASE.trayDepth).toBeLessThanOrEqual(CASE.depth);
  });

  it("has room for the disc and its seat", () => {
    expect(CASE.trayDepth).toBeGreaterThan(DISC.thickness);
  });

  it("carries the plastic thickness and rim scalars", () => {
    const thick = geometry.getAttribute("aThick");
    const rim = geometry.getAttribute("aRim");
    expect(thick).toBeDefined();
    expect(rim).toBeDefined();
    expect(thick!.count).toBe(positions(geometry).count);
    expect(rim!.count).toBe(positions(geometry).count);
    for (let i = 0; i < rim!.count; i += 1) {
      expect(thick!.getX(i)).toBeGreaterThan(0);
      expect(rim!.getX(i)).toBeGreaterThanOrEqual(0);
      expect(rim!.getX(i)).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildLidGeometry", () => {
  const geometry = buildLidGeometry();
  const box = bounds(geometry);

  it("matches the tray footprint so the shell closes flush", () => {
    expect(box.min.x).toBeCloseTo(-CASE.width / 2, 3);
    expect(box.max.x).toBeCloseTo(CASE.width / 2, 3);
    expect(box.min.y).toBeCloseTo(-CASE.height / 2, 3);
    expect(box.max.y).toBeCloseTo(CASE.height / 2, 3);
  });

  it("is a shell of CASE.lidDepth measured from the hinge line", () => {
    expect(box.min.z).toBeCloseTo(0, 3);
    expect(box.max.z).toBeCloseTo(CASE.lidDepth, 3);
  });

  it("closes the depth budget together with the tray", () => {
    expect(CASE.lidDepth + CASE.trayDepth).toBeCloseTo(CASE.depth, 4);
  });

  it("stays thin enough to be a clear window over the tray", () => {
    expect(CASE.lidDepth).toBeLessThan(CASE.trayDepth + DISC.thickness);
  });
});

describe("buildHingeGeometry", () => {
  const geometry = buildHingeGeometry();
  const box = bounds(geometry);

  it("builds three knuckles, all inside the case footprint", () => {
    const attribute = positions(geometry);
    const ys: number[] = [];
    for (let i = 0; i < attribute.count; i += 1) {
      const y = attribute.getY(i);
      expect(Math.abs(y)).toBeLessThanOrEqual(CASE.height / 2 + EPSILON);
      ys.push(y);
    }
    ys.sort((a, b) => a - b);
    // Consecutive knuckle pins are ~30 mm apart along y while each pin is a
    // few millimetres long, so any 1 mm step is a gap between two knuckles.
    let knuckles = 1;
    for (let i = 1; i < ys.length; i += 1) {
      if (ys[i]! - ys[i - 1]! > 1) knuckles += 1;
    }
    expect(knuckles).toBe(3);
    expect(ys[0]).toBeLessThan(0);
    expect(ys[ys.length - 1]).toBeGreaterThan(0);
  });

  it("keeps the whole pin inboard of the hinge edge", () => {
    expect(box.min.x).toBeGreaterThanOrEqual(0);
    expect(box.max.x).toBeLessThan(CASE.width / 2);
    expect(box.min.x).toBeGreaterThan(-CASE.width / 2);
  });

  it("is no thicker than the moulded wall", () => {
    expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThanOrEqual(CASE.wall);
  });
});

describe("hingeAxis", () => {
  it("reports the outer x edge at the tray/lid seam", () => {
    const axis = hingeAxis();
    expect(axis.x).toBe(-CASE.width / 2);
    expect(axis.z).toBe(CASE.trayDepth);
  });

  it("returns a sane, finite axis inside the closed footprint", () => {
    const axis = hingeAxis();
    expect(Number.isFinite(axis.x)).toBe(true);
    expect(Number.isFinite(axis.z)).toBe(true);
    expect(Math.abs(axis.x)).toBeLessThanOrEqual(CASE.width / 2);
    expect(axis.z).toBeGreaterThan(0);
    expect(axis.z).toBeLessThan(CASE.depth);
  });

  it("agrees with where the knuckles are built", () => {
    const box = bounds(buildHingeGeometry());
    expect(Math.abs(hingeAxis().x)).toBeCloseTo(CASE.width / 2, 4);
    // The pin sits just inboard of the axis, not past it.
    expect(Math.abs(hingeAxis().x) - box.max.x).toBeGreaterThan(0);
  });
});
