/**
 * The renderer.
 *
 * Everything below is generated at runtime: there is not a single model, HDR
 * or texture file in this package. The jewel case is moulded from rounded
 * extrusions, the environment is a baked cube map of an empty room with
 * softboxes in it, and the disc label is painted on a 2D canvas.
 *
 * Coordinates are millimetres and the origin sits at the centre of the closed
 * case, with +Z toward the viewer, so the tray occupies z 0..4.3, the disc
 * 4.4..5.6 and the lid 6.4..12.8.
 */

import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  type WebGLRenderTarget,
} from "three";

import { buildEnvironment } from "./environment.js";
import { buildDiscGeometry, buildHingeGeometry, buildLidGeometry, buildTrayGeometry, hingeAxis } from "./geometry.js";
import { createDiscMaterial } from "./materials/disc.js";
import { createLabelTexture, repaintLabel, type LabelDesign } from "./materials/label.js";
import { createPlasticMaterial } from "./materials/plastic.js";
import { CASE, DISC, ENV_PRESETS, QUALITY, resolveOptions } from "./options.js";
import { PostPipeline } from "./post/pipeline.js";
import type { CdCaseApi, CdCaseInternals, CdCaseLabelSource, CdCaseOptions } from "./types.js";

/** Lid travel at `open === 1`, in degrees. Real jewel cases swing right round. */
export const MAX_OPEN_DEG = 108;

const MODULE = "@overseer/cd-case";

const YAW_REST = MathUtils.degToRad(15);
const PITCH_REST = MathUtils.degToRad(10);
// Camera roll is opposite the object's apparent roll in the image.
const CAMERA_ROLL = MathUtils.degToRad(5);
const FRAME_HEIGHT = 0.70;
const FRAME_WIDTH = 0.88;
const YAW_LIMIT = 1.15;
const PITCH_LIMIT = 0.62;

/** Paint a soft radial glow used to keep the object from floating in a void. */
function createGlowTexture(accent: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, accent);
  g.addColorStop(0.28, `${accent}66`);
  g.addColorStop(0.62, `${accent}14`);
  g.addColorStop(1, "#00000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Opaque ink on paper, not a tint applied to the transparent lid. */
function createBookletTexture(design: LabelDesign): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#eeece5";
  ctx.fillRect(0, 0, 1024, 1024);
  // A restrained offset disc motif leaves generous, visibly paper margins.
  ctx.fillStyle = design.accent;
  ctx.fillRect(72, 280, 880, 500);
  ctx.strokeStyle = "#38414b";
  ctx.lineWidth = 2;
  for (let r = 92; r <= 310; r += 28) {
    ctx.beginPath();
    ctx.arc(660, 530, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#222a32";
  ctx.font = "500 20px sans-serif";
  ctx.fillText("OVERSEER DESIGN  /  OSD-001", 72, 100);
  ctx.font = "600 66px sans-serif";
  ctx.fillText(design.title, 72, 206, 875);
  ctx.font = "400 27px sans-serif";
  ctx.fillText(design.subtitle, 72, 864, 875);
  ctx.font = "400 18px sans-serif";
  ctx.fillText("REFRACTION  /  DIFFRACTION  /  HINGE", 72, 944);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function resolveTarget(target: HTMLElement | string): HTMLElement {
  const element = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!element) {
    throw new Error(`${MODULE}: no element matched ${JSON.stringify(target)}.`);
  }
  return element;
}

/** Wrap a caller-supplied image source in a Texture, if it is already one. */
function textureFromSource(source: CdCaseLabelSource): { texture: Texture; dispose: boolean } | null {
  if (source instanceof Texture) return { texture: source, dispose: false };
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    const texture = new CanvasTexture(source);
    texture.colorSpace = SRGBColorSpace;
    return { texture, dispose: true };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    const texture = new Texture(source);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, dispose: true };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    const texture = new Texture(source);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, dispose: true };
  }
  return null;
}

/**
 * Create an interactive CD jewel case inside `target`.
 *
 * Throws when there is no DOM or no WebGL context: these are programming and
 * environment errors, not runtime failures, so `options.onError` is not used
 * for them.
 */
export function createCdCase(target: HTMLElement | string, options: CdCaseOptions = {}): CdCaseApi {
  if (typeof document === "undefined") {
    throw new Error(`${MODULE}: createCdCase needs a DOM. Render it on the client only.`);
  }
  const element = resolveTarget(target);
  const resolved = resolveOptions(options);
  const tier = QUALITY[resolved.quality];

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });
  } catch (error) {
    throw new Error(
      `${MODULE}: could not create a WebGL context (${(error as Error).message}). ` +
        `This module needs WebGL 2.`,
    );
  }
  if (!renderer.getContext()) {
    renderer.dispose();
    throw new Error(`${MODULE}: the WebGL context was created but is unusable.`);
  }

  renderer.toneMapping = NoToneMapping; // tone mapping lives in the post chain
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio));
  if (resolved.background) {
    // setClearColor parses the CSS colour through the working colour space, so
    // the stored value is already linear and matches what the shaders emit.
    renderer.setClearColor(resolved.background, 1);
  } else {
    renderer.setClearColor(0x000000, 0);
  }

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "pan-y";
  canvas.setAttribute("aria-hidden", "true");
  element.appendChild(canvas);

  const scene = new Scene();
  // A tight near/far pair keeps depth precision high across the ~14 mm gap
  // between the disc faces and the tray, where z-fighting would be obvious.
  const camera = new PerspectiveCamera(30, 1, 10, 8000);
  camera.position.set(0, 0, 420);

  const environment = buildEnvironment(renderer, {
    accent: resolved.accent,
    preset: resolved.env,
    size: tier.envSize,
  });

  const preset = ENV_PRESETS[resolved.env];
  const envIntensity = 1 + preset.ambient;

  const plastic = createPlasticMaterial(environment.texture);
  plastic.uniforms.uIor!.value = resolved.ior;
  plastic.uniforms.uTint!.value.set(resolved.tint);
  plastic.uniforms.uEnvIntensity!.value = envIntensity;

  const discMaterial = createDiscMaterial(environment.texture);
  discMaterial.uniforms.uEnvIntensity!.value = envIntensity;
  discMaterial.uniforms.uFaceSign!.value = resolved.labelSide === "back" ? -1 : 1;

  // Geometry is authored in case space: the back of the tray on z = 0 and the
  // front of the lid on z = CASE.depth. The root recentres the assembly.
  const root = new Group();
  root.position.z = -CASE.depth / 2;
  scene.add(root);

  const tray = new Mesh(buildTrayGeometry(), plastic);
  tray.name = "tray";
  root.add(tray);

  const hinge = new Mesh(buildHingeGeometry(), plastic);
  hinge.name = "hinge";
  hinge.position.set(hingeAxis().x, 0, hingeAxis().z);
  root.add(hinge);

  const disc = new Mesh(buildDiscGeometry(), discMaterial);
  disc.name = "disc";
  // The disc rests on the seating pads, whose top face is 2.2 mm above the
  // back plate; the rim of the case then hides the disc's edge.
  disc.position.z = DISC.thickness / 2 + 2.2;
  root.add(disc);

  const lidGroup = new Group();
  lidGroup.name = "lidHinge";
  lidGroup.position.set(-CASE.width / 2, 0, CASE.trayDepth);
  root.add(lidGroup);
  const lid = new Mesh(buildLidGeometry(), plastic);
  lid.name = "lid";
  lid.position.x = CASE.width / 2;
  lidGroup.add(lid);

  // ---- backdrop glow ------------------------------------------------------
  const glowTexture = createGlowTexture(resolved.accent);
  let backdrop: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  if (glowTexture && resolved.background) {
    backdrop = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0.1,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    backdrop.renderOrder = -1;
    backdrop.frustumCulled = false;
    scene.add(backdrop);
  }

  const post = new PostPipeline(renderer, {
    bloomStrength: resolved.bloom ? 0.55 : 0,
    bloomThreshold: 1.2,
    bloomRadius: 1.35,
    exposure: preset.exposure,
    alpha: resolved.background === null,
  });

  // ---- label --------------------------------------------------------------
  let labelTexture: Texture | null = null;
  let ownsLabel = false;
  let labelDesign: LabelDesign = {
    title: resolved.title,
    subtitle: resolved.subtitle,
    accent: resolved.accent,
  };

  function designFor(title: string, subtitle: string, accent: string): LabelDesign {
    return {
      title,
      subtitle,
      accent,
      eyebrow: "OVERSEER DESIGN",
      tracks: [
        "Refraction",
        "Diffraction",
        "Hinge",
        "Beer-Lambert",
        "Bake",
      ],
      catalogue: "OSD-001",
    };
  }

  function useGeneratedLabel(): void {
    if (labelTexture && ownsLabel) labelTexture.dispose();
    const generated = createLabelTexture(labelDesign);
    if (!generated) {
      labelTexture = null;
      discMaterial.uniforms.uLabel!.value = null;
      discMaterial.uniforms.uHasLabel!.value = 0;
      return;
    }
    labelTexture = generated.texture;
    ownsLabel = true;
    discMaterial.uniforms.uLabel!.value = labelTexture;
    discMaterial.uniforms.uHasLabel!.value = resolved.labelSide === "none" ? 0 : 1;
    discMaterial.uniforms.uTexel!.value.set(1 / generated.canvas.width, 1 / generated.canvas.height);
  }

  function applyLabel(source: CdCaseLabelSource | null): void {
    if (source === null) {
      useGeneratedLabel();
      return;
    }
    const direct = textureFromSource(source);
    if (direct) {
      if (labelTexture && ownsLabel) labelTexture.dispose();
      labelTexture = direct.texture;
      ownsLabel = direct.dispose;
      discMaterial.uniforms.uLabel!.value = labelTexture;
      discMaterial.uniforms.uHasLabel!.value = resolved.labelSide === "none" ? 0 : 1;
      const image = labelTexture.image as { width?: number; height?: number } | undefined;
      if (image?.width && image.height) {
        discMaterial.uniforms.uTexel!.value.set(1 / image.width, 1 / image.height);
      }
      return;
    }
    if (typeof source === "string") {
      new TextureLoader().load(
        source,
        (loaded) => {
          if (labelTexture && ownsLabel) labelTexture.dispose();
          loaded.colorSpace = SRGBColorSpace;
          loaded.anisotropy = tier.anisotropy;
          labelTexture = loaded;
          ownsLabel = true;
          discMaterial.uniforms.uLabel!.value = loaded;
          discMaterial.uniforms.uHasLabel!.value = resolved.labelSide === "none" ? 0 : 1;
        },
        undefined,
        () => {
          // A broken label URL is recoverable: fall back to the generated face.
          useGeneratedLabel();
        },
      );
      return;
    }
    useGeneratedLabel();
  }

  labelDesign = designFor(resolved.title, resolved.subtitle, resolved.accent);
  applyLabel(resolved.label);

  // ---- printed lid insert -------------------------------------------------
  // A 120 x 120 x 0.3 mm booklet fits the ~138 x 121 mm lid interior.
  // The window starts at lidDepth - 2 in buildLidGeometry; retain a 0.15 mm
  // air gap so the opaque paper never intersects the transparent window.
  const bookletThickness = 0.3;
  const bookletZ = CASE.lidDepth - 2 - 0.15 - bookletThickness / 2;
  let bookletTexture = createBookletTexture(labelDesign);
  if (bookletTexture) bookletTexture.anisotropy = tier.anisotropy;
  const bookletPrint = new MeshBasicMaterial({ map: bookletTexture, color: 0xffffff });
  const bookletEdge = new MeshBasicMaterial({ color: 0xeeece5 });
  const booklet = new Mesh(
    new BoxGeometry(120, 120, bookletThickness),
    [bookletEdge, bookletEdge, bookletEdge, bookletEdge, bookletPrint, bookletPrint],
  );
  booklet.name = "printedBooklet";
  booklet.position.set(CASE.width / 2, 0, bookletZ);
  // Both sides are printed: the outer cover reads through the closed window,
  // and the inner page faces the viewer when the lid swings past 90 degrees.
  lidGroup.add(booklet);

  function repaintBooklet(): void {
    const next = createBookletTexture(labelDesign);
    if (next) next.anisotropy = tier.anisotropy;
    bookletTexture?.dispose();
    bookletTexture = next;
    bookletPrint.map = next;
    bookletPrint.needsUpdate = true;
  }

  // ---- camera framing -----------------------------------------------------
  const box = new Box3();
  const boxCenter = new Vector3();
  const boxSize = new Vector3();
  const viewRight = new Vector3();
  const viewUp = new Vector3();
  const unrolledRight = new Vector3();
  const unrolledUp = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  const relative = new Vector3();
  // Use the actual vertices, not a bounding sphere (the latter shrinks a
  // shallow rectangular case badly, especially with its lid fully open).
  const frameMeshes: Array<{ mesh: Mesh; local: Vector3[]; world: Vector3[] }> = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    if (!positions) return;
    const local = Array.from({ length: positions.count }, (_, i) =>
      new Vector3().fromBufferAttribute(positions, i));
    frameMeshes.push({ mesh: object, local, world: local.map(() => new Vector3()) });
  });
  const lookAt = new Vector3(0, 0, 0);
  const desiredLookAt = new Vector3(0, 0, 0);
  const orbit = new Vector3();
  const worldDir = new Vector3();

  let yaw = YAW_REST;
  let pitch = PITCH_REST;
  let camDist = 420;
  let targetDist = 420;

  function syncOrbit(): void {
    orbit.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  function measure(): void {
    root.updateWorldMatrix(true, true);
    box.setFromObject(root);
    box.getCenter(boxCenter);
    box.getSize(boxSize);
    for (const entry of frameMeshes) {
      for (let i = 0; i < entry.local.length; i += 1) {
        entry.world[i]!.copy(entry.local[i]!).applyMatrix4(entry.mesh.matrixWorld);
      }
    }
  }

  function distanceFor(target: Vector3): number {
    const tanV = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * Math.max(camera.aspect, 1e-4);
    let distance = camera.near + 1;
    for (const entry of frameMeshes) {
      for (const point of entry.world) {
        relative.copy(point).sub(target);
        const depth = relative.dot(orbit);
        // Exact perspective inequalities for the rolled camera, including
        // the depth of an open lid. Width takes precedence in portrait views.
        distance = Math.max(distance,
          depth + Math.abs(relative.dot(viewRight)) / (tanH * FRAME_WIDTH),
          depth + Math.abs(relative.dot(viewUp)) / (tanV * FRAME_HEIGHT),
          depth + camera.near + 1);
      }
    }
    return distance;
  }

  function fit(dt: number, snap: boolean): void {
    // Apply opening before measuring, including initial/synchronous renders.
    renderFrame();
    syncOrbit();
    measure();
    unrolledRight.crossVectors(worldUp, orbit).normalize();
    unrolledUp.crossVectors(orbit, unrolledRight).normalize();
    viewRight.copy(unrolledRight).multiplyScalar(Math.cos(CAMERA_ROLL))
      .addScaledVector(unrolledUp, Math.sin(CAMERA_ROLL));
    viewUp.copy(unrolledUp).multiplyScalar(Math.cos(CAMERA_ROLL))
      .addScaledVector(unrolledRight, -Math.sin(CAMERA_ROLL));
    // Subtle editorial offset rather than a dead-centred product diagram.
    desiredLookAt.copy(boxCenter)
      .addScaledVector(viewRight, -boxSize.y * 0.035)
      .addScaledVector(viewUp, boxSize.y * 0.025);
    targetDist = distanceFor(desiredLookAt);

    const k = snap ? 1 : Math.min(1, dt * 5.5);
    lookAt.lerp(desiredLookAt, k);
    camDist += (targetDist - camDist) * k;
    // Expansion is immediate, contraction damped: an opening lid or quick
    // drag must never outrun the camera and clip during the transition.
    camDist = Math.max(camDist, distanceFor(lookAt));
    camera.far = Math.max(8000, camDist + boxSize.length() + 2000);
    camera.updateProjectionMatrix();
  }

  // ---- motion state -------------------------------------------------------
  const reducedMotion =
    resolved.respectReducedMotion &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const autoSpin = reducedMotion ? false : resolved.autoSpin;
  const idleDrift = reducedMotion ? 0 : resolved.idleDrift;

  let open = MathUtils.clamp(resolved.open, 0, 1);
  let openFrom = open;
  let openTo = open;
  let openT = 1;
  let openDuration = 0;
  let openResolve: (() => void) | null = null;

  let spin = 0;
  let spinExtra = 0;
  let paused = false;
  let offscreen = false;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let needsRender = true;
  let pointerActive = false;
  let dragged = false;
  let pointerId = -1;
  let pointerX = 0;
  let pointerY = 0;
  let yawVelocity = 0;
  let pitchVelocity = 0;
  let clock = 0;

  function settleOpen(): void {
    const resolve = openResolve;
    openResolve = null;
    openT = 1;
    open = openTo;
    if (resolve) resolve();
  }

  // ---- rendering ----------------------------------------------------------
  function renderFrame(): void {
    const alpha = open >= 0 && openT >= 1 ? openTo : open;
    lidGroup.rotation.y = -alpha * MathUtils.degToRad(MAX_OPEN_DEG);
  }

  function drawScene(renderTarget: WebGLRenderTarget | null): void {
    renderFrame();
    syncOrbit();
    camera.position.copy(lookAt).addScaledVector(orbit, camDist);
    camera.up.copy(worldUp);
    camera.lookAt(lookAt);
    camera.rotateZ(CAMERA_ROLL);

    if (backdrop && glowTexture) {
      camera.getWorldDirection(worldDir);
      backdrop.position.copy(camera.position).addScaledVector(worldDir, camDist + 1500);
      backdrop.quaternion.copy(camera.quaternion);
      const h = 2 * (camDist + 1500) * Math.tan(MathUtils.degToRad(camera.fov) / 2) * 1.5;
      backdrop.scale.set(h * camera.aspect, h, 1);
    }

    post.render((target) => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }, renderTarget);
  }

  function update(dt: number): void {
    clock += dt;
    renderFrame();

    // Orbit damping: drag velocity decays, then a slow idle drift takes over.
    if (!pointerActive) {
      yaw += yawVelocity * dt;
      pitch += pitchVelocity * dt;
      const decay = Math.exp(-dt * 3.4);
      yawVelocity *= decay;
      pitchVelocity *= decay;
      if (idleDrift > 0) yaw += Math.sin(clock * 0.32) * idleDrift * dt;
      pitch = MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
      yaw = MathUtils.clamp(yaw, YAW_REST - YAW_LIMIT, YAW_REST + YAW_LIMIT);
      if (Math.abs(yawVelocity) < 1e-4) yawVelocity = 0;
      if (Math.abs(pitchVelocity) < 1e-4) pitchVelocity = 0;
    }

    orbit.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    spinExtra *= Math.exp(-dt * 1.6);
    if (Math.abs(spinExtra) < 1e-4) spinExtra = 0;
    spin += (autoSpin ? resolved.spinSpeed : 0) * dt + spinExtra * dt;
    disc.rotation.z = spin;

    if (openT < 1) {
      openDuration = Math.max(openDuration, 1e-4);
      openT = Math.min(1, openT + dt / openDuration);
      const t = openT;
      // Critically damped ease: fast out of the gate, no overshoot at the stop.
      const eased = 1 - Math.exp(-6.2 * t) * (1 + 6.2 * t);
      open = openFrom + (openTo - openFrom) * eased;
      if (openT >= 1) settleOpen();
    }
  }

  function frame(now: number): void {
    raf = window.requestAnimationFrame(frame);
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (paused || offscreen) return;
    if (dt === 0 && !needsRender) return;
    needsRender = false;
    update(dt);
    fit(dt, false);
    drawScene(null);
  }

  function resize(): void {
    const width = element.clientWidth || 1;
    const height = element.clientHeight || 1;
    const ratio = Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    post.setSize(width * ratio, height * ratio);
    needsRender = true;
    fit(0, true);
    if (paused || offscreen) drawScene(null);
  }

  // ---- events -------------------------------------------------------------
  function onPointerDown(event: PointerEvent): void {
    if (!resolved.interactive || event.button !== 0) return;
    pointerActive = true;
    dragged = false;
    pointerId = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    yawVelocity = 0;
    pitchVelocity = 0;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerActive || event.pointerId !== pointerId) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!dragged && Math.hypot(dx, dy) < 3) return;
    dragged = true;
    const dyaw = dx * 0.0075;
    const dpitch = dy * 0.0055;
    yaw = MathUtils.clamp(yaw + dyaw, YAW_REST - YAW_LIMIT, YAW_REST + YAW_LIMIT);
    pitch = MathUtils.clamp(pitch + dpitch, -PITCH_LIMIT, PITCH_LIMIT);
    yawVelocity = dyaw / 0.016;
    pitchVelocity = dpitch / 0.016;
    // A horizontal swipe across the face also throws the disc, the way a real
    // disc keeps turning after you let go of it.
    spinExtra += dx * 0.055;
    spinExtra = MathUtils.clamp(spinExtra, -14, 14);
    needsRender = true;
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    const wasDragged = dragged;
    pointerActive = false;
    pointerId = -1;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!wasDragged && resolved.interactive && resolved.openOnInteract) {
      void toggle();
    }
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    paused = true;
    resolved.onError?.(new Error(`${MODULE}: the WebGL context was lost.`));
  }

  function onContextRestored(): void {
    paused = false;
    needsRender = true;
    resize();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("webglcontextlost", onContextLost as EventListener);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(element);
  } else {
    window.addEventListener("resize", resize);
  }

  let intersectionObserver: IntersectionObserver | null = null;
  if (resolved.pauseWhenOffscreen && typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        offscreen = !entry || entry.intersectionRatio <= 0;
        needsRender = true;
        if (!offscreen && !paused) {
          last = performance.now();
          fit(0, true);
          drawScene(null);
        }
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(element);
  }

  // ---- animation helpers --------------------------------------------------
  function animateOpen(value: number, duration: number): Promise<void> {
    const target = MathUtils.clamp(value, 0, 1);
    if (openResolve) settleOpen();
    if (Math.abs(target - open) < 1e-3) {
      open = target;
      openTo = target;
      openT = 1;
      needsRender = true;
      return Promise.resolve();
    }
    openFrom = open;
    openTo = target;
    openT = 0;
    openDuration = reducedMotion ? 0 : duration;
    if (openDuration <= 0) {
      open = target;
      openT = 1;
      needsRender = true;
      return Promise.resolve();
    }
    needsRender = true;
    return new Promise<void>((resolve) => {
      openResolve = resolve;
    });
  }

  async function toggle(): Promise<void> {
    await animateOpen(openTo > 0.5 ? 0 : 1, 0.95);
  }

  resize();
  syncOrbit();
  fit(0, true);
  renderFrame();
  drawScene(null);
  last = performance.now();
  raf = window.requestAnimationFrame(frame);

  const internals: CdCaseInternals = {
    scene,
    camera,
    renderer,
    root,
    lid: lidGroup,
    tray,
    disc,
    env: environment.texture,
  };

  const api: CdCaseApi = {
    internals,
    setOpen: (value) => animateOpen(value, 0.95),
    open: () => animateOpen(1, 0.95),
    close: () => animateOpen(0, 0.95),
    toggle,
    getOpen: () => open,
    setLabel: (source) => {
      applyLabel(source);
      needsRender = true;
    },
    setTitle: (title, subtitle) => {
      labelDesign = designFor(title, subtitle ?? labelDesign.subtitle, labelDesign.accent);
      repaintBooklet();
      if (labelTexture && ownsLabel && repaintLabel(labelTexture, labelDesign)) {
        needsRender = true;
      } else {
        useGeneratedLabel();
        needsRender = true;
      }
    },
    setAccent: (accent) => {
      resolved.accent = accent;
      plastic.uniforms.uTint!.value.set(accent);
      labelDesign = { ...labelDesign, accent };
      repaintBooklet();
      environment.rebake({ accent, preset: resolved.env });
      if (labelTexture && ownsLabel) repaintLabel(labelTexture, labelDesign);
      needsRender = true;
    },
    setPaused: (value) => {
      paused = value;
      if (!value) {
        last = performance.now();
        needsRender = true;
      }
    },
    render: () => {
      fit(0, true);
      drawScene(null);
    },
    resize,
    snapshot: (type = "image/png", quality) => {
      fit(0, true);
      drawScene(null);
      return canvas.toDataURL(type, quality);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("webglcontextlost", onContextLost as EventListener);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (labelTexture && ownsLabel) labelTexture.dispose();
      const geometries = new Set<{ dispose(): void }>();
      root.traverse((child) => {
        const geometry = (child as Mesh).geometry as { dispose(): void } | undefined;
        if (geometry) geometries.add(geometry);
      });
      for (const geometry of geometries) geometry.dispose();
      plastic.dispose();
      discMaterial.dispose();
      bookletTexture?.dispose();
      bookletPrint.dispose();
      bookletEdge.dispose();
      glowTexture?.dispose();
      backdrop?.geometry.dispose();
      backdrop?.material.dispose();
      post.dispose();
      environment.dispose();
      renderer.dispose();
      if (canvas.parentNode === element) element.removeChild(canvas);
    },
  };

  resolved.onReady?.(api);
  return api;
}
