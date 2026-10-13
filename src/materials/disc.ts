/**
 * The compact disc.
 *
 * The aluminium layer borrows its colour and highlights from the environment.
 * Its circular data tracks form a reflection grating with radial periodicity:
 * the view/light geometry produces soft colour fans, independent of disc spin.
 * Diffraction tints that mirror reflection instead of replacing it with pigment.
 */

import { Color, DoubleSide, ShaderMaterial, Vector2, type Vector3, type CubeTexture, type Texture } from "three";
import { keyDirection } from "../lighting.js";
import { SAMPLE_ENV, SPECTRUM } from "./chunks.js";

export interface DiscUniforms {
  uEnv: { value: CubeTexture | null };
  uLabel: { value: Texture | null };
  uHasLabel: { value: number };
  uFaceSign: { value: number };
  uTrackPitch: { value: number };
  uDispersion: { value: number };
  uIridescence: { value: number };
  uIriAmount: { value: number };
  uSparkle: { value: number };
  uSparkleThreshold: { value: number };
  uReflectivity: { value: number };
  uAlbedo: { value: Color };
  uRoughness: { value: number };
  uLabelInner: { value: number };
  uLabelOuter: { value: number };
  uHub: { value: number };
  uEnvIntensity: { value: number };
  uKeyDir: { value: Vector3 };
  uOpacity: { value: number };
  // Compatibility-only: CdCase still writes this; neither shader consumes it.
  uTexel: { value: Vector2 };
  [uniform: string]: { value: unknown };
}

export interface DiscMaterial extends ShaderMaterial {
  uniforms: DiscUniforms;
}

export function createDiscMaterial(env: CubeTexture | null): DiscMaterial {
  const material = new ShaderMaterial({
    transparent: false,
    side: DoubleSide,
    uniforms: {
      uEnv: { value: env },
      uLabel: { value: null },
      uHasLabel: { value: 0 },
      uFaceSign: { value: 1 },
      uTrackPitch: { value: 0.0016 },
      uDispersion: { value: 1.0 },
      uIridescence: { value: 0.55 },
      uIriAmount: { value: 0.78 },
      uSparkle: { value: 0.9 },
      uSparkleThreshold: { value: 0.30 },
      uReflectivity: { value: 1.0 },
      uAlbedo: { value: new Color(0xf2f4f8) },
      uRoughness: { value: 0.045 },
      uLabelInner: { value: 23 },
      uLabelOuter: { value: 58.5 },
      uHub: { value: 16.5 },
      uEnvIntensity: { value: 1 },
      uKeyDir: { value: keyDirection() },
      uOpacity: { value: 1 },
      uTexel: { value: new Vector2(1 / 1024, 1 / 1024) },
    },
    vertexShader: /* glsl */ `
      attribute float aRadius;

      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vRadial;
      varying vec2 vUv;
      varying float vRadius;
      varying float vFaceSign;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        // Tracks run around the disc; their periodicity is along the radius.
        // Transform that grating vector into the same world frame as V and L.
        vec2 radial = normalize(position.xy);
        vRadial = normalize(mat3(modelMatrix) * vec3(radial, 0.0));
        vUv = uv;
        vRadius = aRadius;
        vFaceSign = step(0.0, normal.z) * 2.0 - 1.0;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform samplerCube uEnv;
      uniform sampler2D uLabel;
      uniform float uHasLabel;
      uniform float uFaceSign;
      uniform float uTrackPitch;
      uniform float uDispersion;
      uniform float uIridescence;
      uniform float uReflectivity;
      uniform vec3 uAlbedo;
      uniform float uRoughness;
      uniform float uLabelInner;
      uniform float uLabelOuter;
      uniform float uHub;
      uniform float uEnvIntensity;
      uniform vec3 uKeyDir;
      uniform float uOpacity;
      uniform vec2 uTexel;
      uniform float uIriAmount;
      uniform float uSparkle;
      uniform float uSparkleThreshold;

      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vRadial;
      varying vec2 vUv;
      varying float vRadius;
      varying float vFaceSign;

      ${SAMPLE_ENV}
      ${SPECTRUM}

      /**
       * A reflection grating with radial periodicity closes m wavelengths
       * across one track: lambda_m = pitch * abs(dot(g, V + L)) / m.
       * V and L point away from the surface; the incident wave travels along
       * -L. The radial projection draws fans, with gentle curvature from the
       * finite-distance camera. With V and L both normal, lambda is zero and
       * only the ordinary mirror reflection remains.
       */
      float gratingNm(vec3 g, vec3 V, vec3 L, float pitch) {
        return pitch * 1.0e6 * abs(dot(g, normalize(V) + normalize(L)));
      }

      /**
       * How much of the spectrum one order hands back to the eye. A real disc
       * is mostly bare metal: each order is a narrow streak grazing the
       * surface, not a wedge painted across it, so the passband is kept tight
       * and the shoulders are long enough to stay free of hard edges.
       */
      float visibleBand(float nm) {
        return smoothstep(392.0, 500.0, nm) * (1.0 - smoothstep(596.0, 700.0, nm));
      }

      /** Luminance of the printed art, weighted by its coverage. */
      float labelLuma(vec2 uv) {
        vec4 c = texture2D(uLabel, uv);
        return dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)) * c.a;
      }

      /**
       * Printed discs glint. A bright spot on the artwork flashes where it is
       * brighter than the ring of pixels around it, so only true local peaks
       * catch the key light and flat colour stays flat.
       */
      float sparkle(vec2 uv) {
        float here = labelLuma(uv);
        if (here < uSparkleThreshold) return 0.0;
        float ring = 0.0;
        for (int k = 0; k < 8; k++) {
          float a = float(k) * 0.7853982;
          vec2 o = vec2(cos(a), sin(a));
          ring += labelLuma(uv + o * uTexel * 3.0);
        }
        return max(here - ring * 0.125, 0.0);
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;

        float radius = vRadius;

        // Mirror: the aluminium layer returns the environment almost intact.
        vec3 R = reflect(-V, N);
        vec3 env = sampleEnv(uEnv, R, uRoughness) * uEnvIntensity;

        vec3 grating = normalize(vRadial);
        vec3 light = normalize(uKeyDir);

        float nm = gratingNm(grating, V, light, uTrackPitch * uDispersion);
        // Half the wavelength spans twice the projected-angle interval:
        // second order is a distinct, broader and fainter fan.
        float nm2 = nm * 0.5;
        float band1 = visibleBand(nm);
        float band2 = visibleBand(nm2);
        vec3 iri = wavelengthToRGB(nm) * band1 + wavelengthToRGB(nm2) * band2 * 0.50;
        float iriCoverage = clamp(band1 * 1.05 + band2 * 0.58, 0.0, 1.0);

        vec3 mirror = env * uReflectivity * uAlbedo;

        // The data area starts just outside the stacking ring. Inside it the
        // disc is bare polycarbonate and never difracts -- that is why the
        // clamping area reads as plain plastic on a real disc.
        float dataMask = smoothstep(uHub, uHub + 1.4, radius);
        float hubMask = 1.0 - dataMask;
        float ringDistance = (radius - (uHub - 0.35)) / 0.55;
        float ringMask = exp(-ringDistance * ringDistance);
        vec3 foil = mix(mirror, env * 0.55 + vec3(0.05), hubMask * 0.55);
        foil += ringMask * env * 0.5;

        // The grating is a narrowband filter, not a coat of paint: it hands
        // back the hue it selected at the brightness of the light that
        // reached it, so the foil keeps the room's reflections and gains a
        // saturated colour instead of being tinted toward grey.
        float peak = max(max(iri.r, iri.g), iri.b);
        vec3 tint = peak > 1e-4 ? iri / peak : vec3(1.0);
        float foilLuma = dot(foil, vec3(0.2126, 0.7152, 0.0722));
        // A real disc's rainbow is the brightest thing on its surface: the
        // selected wavelength is the light that actually reaches the eye,
        // every other wavelength having been diffracted away. The fan is
        // therefore pushed above the brightness of the plain mirror.
        vec3 spectral = tint * (foilLuma * 3.2 + 0.12);
        foil = mix(foil, spectral, clamp(uIridescence * iriCoverage * dataMask * uIriAmount, 0.0, 0.92));

        // Printed face: ink sits on the foil and dulls it. Where the printed
        // art is transparent the foil passes through untouched, which is what
        // a spot print over a metalised data surface actually does.
        vec3 color = foil;
        if (uHasLabel > 0.5 && vFaceSign * uFaceSign > 0.0) {
          float labelMask = smoothstep(uLabelInner - 0.8, uLabelInner + 0.8, radius)
                          * (1.0 - smoothstep(uLabelOuter - 1.2, uLabelOuter + 0.6, radius));
          vec4 printed = texture2D(uLabel, vUv);
          float ink = printed.a * labelMask;
          vec3 inkColor = printed.rgb * (env * 0.34 + 0.42);
          color = mix(color, inkColor, ink);

          // Sparkle is added on top of the print, never mixed into it: it is
          // specular light off the ink, so it brightens without replacing the
          // colour underneath. It tracks the key light, so turning the object
          // sweeps the glints across the face the way a disc does.
          float glint = sparkle(vUv);
          float ndl = pow(max(dot(N, light), 0.0), 3.0);
          vec3 glintTint = mix(vec3(1.0), printed.rgb / max(max(printed.r, max(printed.g, printed.b)), 1e-3), 0.35);
          color += glintTint * glint * (0.35 + 2.1 * ndl) * ink * uSparkle;
        }

        // A touch of edge darkening so the rim does not clip.
        float edge = 1.0 - smoothstep(56.0, 60.0, radius) * 0.35;

        gl_FragColor = vec4(color * edge * uOpacity, uOpacity);
      }
    `,
  });

  return material as unknown as DiscMaterial;
}
