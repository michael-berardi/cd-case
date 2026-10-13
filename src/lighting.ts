/**
 * The one place the light rig's key direction is written down.
 *
 * The environment bake hangs its key softbox at `KEY_POSITION`. Anything that
 * needs to reason about where the light is coming from -- the disc's
 * diffraction grating and the plastic's specular sheen both do -- reads the
 * direction from here instead of carrying its own copy that silently drifts
 * out of step with the rig.
 */

import { Vector3 } from "three";

/** World-space position of the key softbox, in scene units. */
export const KEY_POSITION: readonly [number, number, number] = [-1400, 1700, 2200];

/** Unit vector pointing from the origin towards the key softbox. */
export const KEY_DIR = new Vector3(KEY_POSITION[0], KEY_POSITION[1], KEY_POSITION[2]).normalize();

/**
 * Normalised key direction as a fresh vector.
 *
 * Uniforms are shared state, so hand out copies rather than the module
 * singleton; a consumer that mutates its uniform must not move the rig.
 */
export function keyDirection(): Vector3 {
  return KEY_DIR.clone();
}
