/**
 * Procedural lighting environment.
 *
 * Rather than shipping an HDRI, the rig is built from emissive geometry and
 * captured into a cube render target with a `CubeCamera`. That keeps the
 * package asset-free, lets the `accent` colour drive the rim lights, and gives
 * the plastic real HDR highlights to refract (the cube target is half-float, so
 * a softbox can sit well above 1.0 and still bloom correctly).
 */

import {
  BackSide,
  BoxGeometry,
  Color,
  CubeCamera,
  DoubleSide,
  Group,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import { KEY_POSITION } from "./lighting.js";

export type EnvPreset = "studio" | "void" | "warm" | "night";

export interface EnvironmentOptions {
  accent: string;
  preset: EnvPreset;
  size: number;
}

export interface BuiltEnvironment {
  texture: WebGLCubeRenderTarget["texture"];
  /** Re-bake the same rig with new accent/preset settings. */
  rebake(options: Omit<EnvironmentOptions, "size">): void;
  dispose(): void;
}

const PRESET_TUNING: Record<
  EnvPreset,
  {
    room: number;
    ceiling: number;
    floor: number;
    key: number;
    keySize: number;
    fill: number;
    rim: number;
    bounce: number;
  }
> = {
  studio: { room: 0.055, ceiling: 0.36, floor: 0.1, key: 5.2, keySize: 1500, fill: 0.85, rim: 0.85, bounce: 0.5 },
  void: { room: 0.012, ceiling: 0.09, floor: 0.02, key: 3.6, keySize: 1100, fill: 0.3, rim: 0.6, bounce: 0.14 },
  warm: { room: 0.07, ceiling: 0.4, floor: 0.16, key: 4.8, keySize: 1500, fill: 1.0, rim: 0.75, bounce: 0.7 },
  night: { room: 0.02, ceiling: 0.1, floor: 0.03, key: 2.4, keySize: 900, fill: 0.24, rim: 0.75, bounce: 0.12 },
};

interface Softbox {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  color: Color;
  intensity: number;
  position: [number, number, number];
  lookAt?: [number, number, number];
}

function makeSoftbox(
  width: number,
  height: number,
  color: Color,
  intensity: number,
  position: [number, number, number],
): Softbox {
  const material = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false });
  material.color.copy(color).multiplyScalar(intensity);
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  mesh.position.set(...position);
  mesh.lookAt(0, 0, 0);
  return { mesh, color, intensity, position };
}

function applySoftbox(box: Softbox): void {
  (box.mesh.material as MeshBasicMaterial).color.copy(box.color).multiplyScalar(box.intensity);
  box.mesh.position.set(...box.position);
  box.mesh.lookAt(0, 0, 0);
}

/**
 * Build and bake the environment cube.
 *
 * The renderer is used only as a baking device here; its own render state is
 * restored (target, clear colour, tone mapping) before returning.
 */
export function buildEnvironment(renderer: WebGLRenderer, options: EnvironmentOptions): BuiltEnvironment {
  const scene = new Scene();
  const group = new Group();
  scene.add(group);

  const roomUniforms = {
    uFloor: { value: new Color(1, 1, 1) },
    uCeiling: { value: new Color(1, 1, 1) },
    uFloorLevel: { value: 0.1 },
  };

  const roomMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: roomUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFloor;
      uniform vec3 uCeiling;
      uniform float uFloorLevel;
      varying vec3 vDir;
      void main() {
        float up = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        float t = pow(up, 1.6);
        vec3 c = mix(uFloor, uCeiling, t);
        // Neutral horizon; multiplication is defined on both hemispheres.
        float horizon = vDir.y * 5.0;
        float band = exp(-(horizon * horizon));
        c += band * 0.05 * vec3(1.0);
        c *= uFloorLevel + (1.0 - uFloorLevel) * t;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const room = new Mesh(new BoxGeometry(5000, 5000, 5000), roomMaterial);
  scene.add(room);

  const accent = new Color(options.accent);
  const white = new Color(1, 1, 1);

  const key = makeSoftbox(1500, 1080, white, 5.2, [...KEY_POSITION]);
  const fill = makeSoftbox(2600, 1800, new Color(0.9, 0.9, 0.9), 0.85, [2500, 400, 1200]);
  const rimA = makeSoftbox(420, 3000, accent, 0.85, [-900, 200, -2400]);
  const rimB = makeSoftbox(300, 2400, accent.clone(), 0.595, [1500, -300, -2200]);
  const bounce = makeSoftbox(4000, 4000, new Color(0.93, 0.93, 0.93), 0.5, [0, -1500, 300]);

  const boxes = [key, fill, rimA, rimB, bounce];
  for (const box of boxes) group.add(box.mesh);

  // Current high tier arrives as 512; lift it to 1024 without changing options.
  // Smaller tiers still need 512 to avoid stair-stepped softbox boundaries.
  const bakeSize = Math.max(options.size, options.size >= 512 ? 1024 : 512);
  const renderTarget = new WebGLCubeRenderTarget(bakeSize, {
    type: HalfFloatType,
    generateMipmaps: false,
    colorSpace: LinearSRGBColorSpace,
  });
  const cubeCamera = new CubeCamera(1, 20000, renderTarget);

  function tune(preset: EnvPreset, accentColor: string): void {
    const t = PRESET_TUNING[preset];
    roomUniforms.uFloorLevel.value = t.floor;
    roomUniforms.uFloor.value.setRGB(t.room * 0.4, t.room * 0.4, t.room * 0.408);
    roomUniforms.uCeiling.value.setRGB(t.ceiling, t.ceiling, t.ceiling);

    key.intensity = t.key;
    key.position = [...KEY_POSITION];
    key.mesh.geometry.dispose();
    key.mesh.geometry = new PlaneGeometry(t.keySize, t.keySize * 0.72);

    fill.intensity = t.fill;
    fill.color.setRGB(0.9, 0.9, 0.9);

    const rimColor = new Color(accentColor);
    rimA.color.copy(rimColor);
    rimA.intensity = t.rim;
    rimB.color.copy(rimColor);
    rimB.intensity = t.rim * 0.7;

    bounce.intensity = t.bounce;

    for (const box of boxes) applySoftbox(box);
  }

  function bake(): void {
    const previousTarget = renderer.getRenderTarget();
    const previousToneMapping = renderer.toneMapping;
    const previousAlpha = renderer.getClearAlpha();
    const previousClear = renderer.getClearColor(new Color());

    renderer.toneMapping = NoToneMapping;
    cubeCamera.update(renderer, scene);

    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousToneMapping;
    renderer.setClearColor(previousClear, previousAlpha);
  }

  tune(options.preset, options.accent);
  bake();

  return {
    texture: renderTarget.texture,
    rebake(next) {
      tune(next.preset, next.accent);
      bake();
    },
    dispose() {
      roomMaterial.dispose();
      room.geometry.dispose();
      for (const box of boxes) {
        box.mesh.geometry.dispose();
        (box.mesh.material as MeshBasicMaterial).dispose();
      }
      renderTarget.dispose();
    },
  };
}
