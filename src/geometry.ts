/**
 * Procedural geometry for the jewel case.
 *
 * Everything is generated from the real moulding dimensions in `options.ts`,
 * so the case reads at true proportions rather than as a stylised box.
 *
 * Coordinates are *case space*: the back of the tray sits on `z = 0` and the
 * front of the lid on `z = CASE.depth`, with the lid hinged at `z =
 * CASE.trayDepth`. `CdCase.ts` drops the whole assembly into a root group and
 * recentres it.
 *
 * Two custom attributes travel with every case vertex:
 *
 * - `aThick` — how much plastic light must cross at this vertex (mm).
 * - `aRim`   — 0 on flat faces, 1 on moulded walls and edges, where light
 *              entering the flat face at a glancing angle travels *along* the
 *              wall and leaves the moulding glowing. This single scalar is what
 *              separates a jewel case from a plain glass slab.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
} from "three";
import { CASE, DISC } from "./options.js";

const CURVE_SEGMENTS = 12;

/**
 * Append a rounded rectangle centred on the origin to `path`.
 *
 * `clockwise` reverses the winding, which is what `ExtrudeGeometry` requires
 * for a hole. Corners are listed in traversal order and the straight edges
 * between them are inserted by `Path` when an arc does not start where the
 * previous one ended.
 */
function roundRectPath(path: Path, w: number, h: number, r: number, clockwise = false): void {
  const hw = Math.max(w / 2, 0.02);
  const hh = Math.max(h / 2, 0.02);
  const radius = Math.max(Math.min(r, hw, hh), 0);

  const corners: Array<[number, number, number]> = clockwise
    ? [
        [hw - radius, hh - radius, Math.PI / 2],
        [hw - radius, -hh + radius, 0],
        [-hw + radius, -hh + radius, -Math.PI / 2],
        [-hw + radius, hh - radius, -Math.PI],
      ]
    : [
        [hw - radius, -hh + radius, -Math.PI / 2],
        [hw - radius, hh - radius, 0],
        [-hw + radius, hh - radius, Math.PI / 2],
        [-hw + radius, -hh + radius, Math.PI],
      ];

  path.moveTo(hw - radius, clockwise ? hh : -hh);
  const dir = clockwise ? -1 : 1;
  for (const [cx, cy, base] of corners) {
    path.absarc(cx, cy, radius, base, base + (dir * Math.PI) / 2, clockwise);
  }
  path.closePath();
}

interface ExtrudeOptions {
  /** Back face of the part, in case-space millimetres. */
  z0: number;
  /** Front face of the part. */
  z1: number;
  /** Chamfer applied to the front and back edges. */
  bevel?: number;
  /** Punch a rounded-rectangle hole through the part. */
  hole?: { w: number; h: number; r: number };
  segments?: number;
}

/**
 * Extrude a rounded rectangle across an exact span of z.
 *
 * `bevelSize` pushes the outline *outwards*, so the shape is drawn already
 * inset by the bevel and the finished part measures exactly `w` x `h` with
 * its flat faces exactly on `z0` and `z1`.
 */
function extrudeRounded(w: number, h: number, corner: number, options: ExtrudeOptions): BufferGeometry {
  const { z0, z1, hole, segments = CURVE_SEGMENTS } = options;
  const span = z1 - z0;
  const bevel = Math.max(
    0,
    Math.min(options.bevel ?? 0, span / 3, corner * 0.9, Math.min(w, h) * 0.45),
  );

  const shape = new Shape();
  roundRectPath(shape, w - bevel * 2, h - bevel * 2, Math.max(corner - bevel, 0));
  if (hole) {
    const cut = new Path();
    roundRectPath(cut, hole.w + bevel * 2, hole.h + bevel * 2, Math.max(hole.r + bevel, 0), true);
    shape.holes.push(cut);
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(span - bevel * 2, 0.02),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: segments,
  });
  geometry.deleteAttribute("uv");
  // ExtrudeGeometry occupies [-bevel, depth + bevel]; slide it onto [z0, z1].
  geometry.translate(0, 0, z0 + bevel);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Concatenate geometries into one draw call.
 *
 * Attributes missing from any input are dropped rather than copied, because a
 * partial copy would desynchronise the vertex streams. Indexed and
 * non-indexed inputs are both normalised to a single index buffer.
 */
function concat(geometries: BufferGeometry[]): BufferGeometry {
  const merged = new BufferGeometry();

  const counts = geometries.map((geometry) => geometry.getAttribute("position").count);
  let vertexTotal = 0;
  for (const count of counts) vertexTotal += count;

  const names = new Set<string>();
  for (const geometry of geometries) {
    for (const name of Object.keys(geometry.attributes)) names.add(name);
  }

  for (const name of names) {
    if (geometries.some((geometry) => !geometry.getAttribute(name))) continue;
    const first = geometries[0]!.getAttribute(name);
    const itemSize = first.itemSize;
    const normalized = first.normalized;
    const out = new Float32Array(vertexTotal * itemSize);
    let offset = 0;
    for (const geometry of geometries) {
      const attribute = geometry.getAttribute(name);
      out.set(attribute.array as never, offset);
      offset += attribute.count * itemSize;
    }
    merged.setAttribute(name, new BufferAttribute(out, itemSize, normalized));
  }

  const index = new Uint32Array(geometries.reduce(
    (total, geometry) => total + (geometry.index ? geometry.index.count : geometry.getAttribute("position").count),
    0,
  ));
  let cursor = 0;
  let base = 0;
  for (let i = 0; i < geometries.length; i += 1) {
    const geometry = geometries[i]!;
    const source = geometry.index;
    if (source) {
      for (let j = 0; j < source.count; j += 1) index[cursor + j] = source.getX(j) + base;
      cursor += source.count;
    } else {
      for (let j = 0; j < counts[i]!; j += 1) index[cursor + j] = j + base;
      cursor += counts[i]!;
    }
    base += counts[i]!;
  }
  if (index.length > 0) merged.setIndex(new BufferAttribute(index, 1));

  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Revolve a closed, clockwise (radius, z) profile around +z. Both periodic
 * seams share indices, so every edge belongs to exactly two triangles.
 */
function revolveProfile(profile: ReadonlyArray<readonly [number, number]>, segments = 160): BufferGeometry {
  const positions = new Float32Array(profile.length * segments * 3);
  const indices = new Uint32Array(profile.length * segments * 6);
  let cursor = 0;
  for (let row = 0; row < profile.length; row += 1) {
    const [radius, z] = profile[row]!;
    for (let column = 0; column < segments; column += 1) {
      const angle = column * Math.PI * 2 / segments;
      const a = row * segments + column;
      positions[a * 3] = radius * Math.cos(angle);
      positions[a * 3 + 1] = radius * Math.sin(angle);
      positions[a * 3 + 2] = z;
      const b = row * segments + (column + 1) % segments;
      const c = ((row + 1) % profile.length) * segments + column;
      const d = ((row + 1) % profile.length) * segments + (column + 1) % segments;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Attach the two case-specific scalars, filling every vertex uniformly. */
function withCaseAttributes(geometry: BufferGeometry, thickness: number, rim: number): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("aThick", new BufferAttribute(new Float32Array(count).fill(thickness), 1));
  geometry.setAttribute("aRim", new BufferAttribute(new Float32Array(count).fill(rim), 1));
  return geometry;
}

/**
 * The clear lid: four moulded walls and the front window they carry, fused
 * into one mesh. Local origin sits on the hinge line, so opening the case is a
 * single rotation about y.
 */
export function buildLidGeometry(): BufferGeometry {
  const { width, height, lidDepth, wall, corner, bevel } = CASE;
  const windowDepth = 1.6;
  const wallTop = lidDepth - windowDepth;

  // The wall wraps the outside of the tray; its opening accepts the tray body.
  const rim = extrudeRounded(width, height, corner, {
    z0: 0,
    z1: wallTop,
    bevel: bevel * 0.8,
    hole: {
      w: width - wall * 2,
      h: height - wall * 2,
      r: Math.max(corner - wall, 0.4),
    },
  });

  // The front window, which is what the printed cover would sit behind.
  const window_ = extrudeRounded(width, height, corner, {
    z0: wallTop - 0.4,
    z1: lidDepth,
    bevel: bevel * 0.6,
  });

  return concat([
    withCaseAttributes(rim, wall, 1),
    withCaseAttributes(window_, windowDepth, 0),
  ]);
}

/**
 * The tray: a full-footprint back plate, the inset wall of the disc well, the
 * supporting lip around the well, four outer guide pads and the central hub.
 */
export function buildTrayGeometry(): BufferGeometry {
  const { width, height, trayDepth, corner, wall, bevel } = CASE;
  const floor = 1.6;
  // The well wall is thinner than the outer shell; the disc needs the room.
  const wellWall = 0.9;
  const parts: BufferGeometry[] = [];

  // The back plate runs the whole footprint so the case reads as one slab from
  // behind; the well wall then steps in so it nests inside the lid.
  const back = extrudeRounded(width, height, corner, {
    z0: 0,
    z1: floor + 0.4,
    bevel: bevel * 0.7,
  });
  parts.push(withCaseAttributes(back, trayDepth, 0.2));

  const well = extrudeRounded(width - wall * 2, height - wall * 2, Math.max(corner - wall, 0.4), {
    z0: floor - 0.4,
    z1: trayDepth,
    bevel: bevel * 0.7,
    hole: {
      w: width - wall * 2 - wellWall * 2,
      h: height - wall * 2 - wellWall * 2,
      r: Math.max(corner - wall - wellWall, 0.4),
    },
  });
  parts.push(withCaseAttributes(well, wall, 1));

  // The disc's lower face is 0.4 mm below the rim, less its 1.2 mm
  // thickness. CdCase positions its centre at seat + DISC.thickness / 2.
  const seat = trayDepth - 0.4 - DISC.thickness;
  const edgeRound = 0.35;

  // The lip supports the lower outer bevel rather than hovering outside it.
  // Its inner boundary is the SAME polygonal arc as the disc, so the solids
  // share contact triangles without overlap. Both use 160 angular segments.
  const lipProfile: Array<[number, number]> = [
    [DISC.radius - edgeRound, seat],
  ];
  for (let step = 1; step <= 8; step += 1) {
    const angle = -Math.PI / 2 + step * Math.PI / 16;
    lipProfile.push([
      DISC.radius - edgeRound + edgeRound * Math.cos(angle),
      seat + edgeRound + edgeRound * Math.sin(angle),
    ]);
  }
  lipProfile.push(
    [DISC.radius + 1, seat + edgeRound],
    [DISC.radius + 1, floor + 0.4],
    [DISC.radius - edgeRound, floor + 0.4],
  );
  parts.push(withCaseAttributes(revolveProfile(lipProfile), 1.35, 0.7));

  // An annular hub supports the flat underside of the clamping area; the
  // spindle itself is wholly inside the hole and must NOT carry the disc.
  const hub = revolveProfile([
    [DISC.hole + 0.3, seat],
    [DISC.hub - 0.5, seat],
    [DISC.hub - 0.5, floor + 0.4],
    [DISC.hole + 0.3, floor + 0.4],
  ]);
  parts.push(withCaseAttributes(hub, seat - floor - 0.4, 0.4));

  // Guide pads touch r=60 on the OUTSIDE only, never underneath the face.
  const padRadius = 3.4;
  const padOffset = (DISC.radius + padRadius) / Math.SQRT2;
  const pad = new CylinderGeometry(padRadius, padRadius, 3, 32);
  pad.rotateX(Math.PI / 2);
  pad.deleteAttribute("uv");
  for (const [x, y] of [
    [-padOffset, padOffset],
    [padOffset, padOffset],
    [-padOffset, -padOffset],
    [padOffset, -padOffset],
  ] as Array<[number, number]>) {
    const clone = pad.clone();
    clone.translate(x, y, floor + 0.4 + 1.5);
    parts.push(withCaseAttributes(clone, 3, 0.4));
  }
  pad.dispose();

  // A tapered snap post clears the 7.5 mm hole by at least 0.4 mm radially.
  // Top = 5.8 mm, 0.2 mm above the seated disc and below the tray rim.
  const spindleHeight = trayDepth - 0.2 - (floor + 0.4);
  const spindle = new CylinderGeometry(6.3, DISC.hole - 0.4, spindleHeight, 32);
  spindle.rotateX(Math.PI / 2);
  spindle.deleteAttribute("uv");
  spindle.translate(0, 0, floor + 0.4 + spindleHeight / 2);
  parts.push(withCaseAttributes(spindle, spindleHeight, 0.5));

  return concat(parts);
}

/**
 * The disc: a beveled annulus with a centre hole. UVs are a plain planar
 * projection so a square label image maps straight onto the face; `aRadius`
 * carries the true millimetre radius for the diffraction ramp.
 */
export function buildDiscGeometry(): BufferGeometry {
  const { radius, hole, thickness } = DISC;
  const bevel = 0.35;
  const half = thickness / 2;
  // A recessed clamping area rises smoothly onto the full-thickness face.
  // One closed profile includes BOTH outer bevels and the entire hole wall.
  const profile: Array<[number, number]> = [
    [hole, half - 0.12],
    [DISC.hub - 0.3, half - 0.12],
    [DISC.hub, half],
    [DISC.labelInner, half],
    [radius - 1.5, half],
    [radius - bevel, half],
  ];
  for (let step = 1; step <= 8; step += 1) {
    const angle = Math.PI / 2 - step * Math.PI / 16;
    profile.push([
      radius - bevel + bevel * Math.cos(angle),
      half - bevel + bevel * Math.sin(angle),
    ]);
  }
  profile.push([radius, -half + bevel]);
  for (let step = 1; step <= 8; step += 1) {
    const angle = -step * Math.PI / 16;
    profile.push([
      radius - bevel + bevel * Math.cos(angle),
      -half + bevel + bevel * Math.sin(angle),
    ]);
  }
  profile.push([radius - 1.5, -half], [DISC.hub, -half], [hole, -half]);
  const merged = revolveProfile(profile);

  const position = merged.getAttribute("position");
  const count = position.count;
  const uv = new Float32Array(count * 2);
  const radiusAttr = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    uv[i * 2] = x / (radius * 2) + 0.5;
    uv[i * 2 + 1] = y / (radius * 2) + 0.5;
    radiusAttr[i] = Math.hypot(x, y);
  }
  merged.setAttribute("uv", new BufferAttribute(uv, 2));
  merged.setAttribute("aRadius", new BufferAttribute(radiusAttr, 1));

  return merged;
}

/** Three inset knuckles joining lid and tray without enlarging the footprint. */
export function buildHingeGeometry(): BufferGeometry {
  const { height, wall } = CASE;
  const parts: BufferGeometry[] = [];
  for (const y of [height * 0.32, 0, -height * 0.32]) {
    const knuckle = new CylinderGeometry(wall * 0.85, wall * 0.85, 9, 16);
    knuckle.rotateZ(Math.PI / 2);
    knuckle.deleteAttribute("uv");
    // hingeAxis() is the outer x edge: the whole 9 mm pin sits INBOARD.
    knuckle.translate(4.5, y, 0);
    parts.push(withCaseAttributes(knuckle, 1.2, 0.8));
  }
  return concat(parts);
}

/** Convenience: the world-space hinge axis in case coordinates. */
export function hingeAxis(): { x: number; z: number } {
  return { x: -CASE.width / 2, z: CASE.trayDepth };
}
