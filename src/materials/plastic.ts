/**
 * The clear moulded plastic of the jewel case.
 *
 * The model is an alpha-composited transparent shell rather than a screen-space
 * refraction pass, which is what lets the disc and tray stay visible through the
 * closed lid without a second scene render:
 *
 *   eye = reflectance * env + (1 - reflectance) * absorbed * background
 *
 * Matching that to `src * alpha + dst * (1 - alpha)` gives the alpha and colour
 * written in `main`. On top of it, light piped along the moulded walls is added
 * back (`vRim`), which is the effect that reads as *thick* plastic.
 */

import { Color, DoubleSide, ShaderMaterial, Vector3, type CubeTexture } from "three";
import { FRESNEL, SAMPLE_ENV } from "./chunks.js";

export interface PlasticUniforms {
  uEnv: { value: CubeTexture | null };
  uIor: { value: number };
  uAbsorb: { value: Vector3 };
  uTint: { value: Color };
  uThickScale: { value: number };
  uRimGain: { value: number };
  uEdgeSheen: { value: number };
  uRoughness: { value: number };
  uOpacity: { value: number };
  uEnvIntensity: { value: number };
  [uniform: string]: { value: unknown };
}

export interface PlasticMaterial extends ShaderMaterial {
  uniforms: PlasticUniforms;
}

export function createPlasticMaterial(env: CubeTexture | null): PlasticMaterial {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uEnv: { value: env },
      uIor: { value: 1.59 },
      // Per millimetre: a 6 mm run still transmits 99.4%, without a colour cast.
      uAbsorb: { value: new Vector3(0.001, 0.001, 0.001) },
      uTint: { value: new Color(0xffffff) },
      uThickScale: { value: 1 },
      uRimGain: { value: 1.35 },
      uEdgeSheen: { value: 0.12 },
      uRoughness: { value: 0.05 },
      uOpacity: { value: 1 },
      uEnvIntensity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aThick;
      attribute float aRim;

      uniform float uThickScale;

      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vView;
      varying float vThick;
      varying float vRim;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        vThick = aThick * uThickScale;
        vRim = aRim;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform samplerCube uEnv;
      uniform float uIor;
      uniform vec3 uAbsorb;
      uniform vec3 uTint;
      uniform float uRimGain;
      uniform float uEdgeSheen;
      uniform float uRoughness;
      uniform float uOpacity;
      uniform float uEnvIntensity;

      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vView;
      varying float vThick;
      varying float vRim;

      ${FRESNEL}
      ${SAMPLE_ENV}

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(vView);
        if (dot(N, V) < 0.0) N = -N;

        float cosv = clamp(abs(dot(N, V)), 0.0, 1.0);
        float interfaceRatio = (uIor - 1.0) / (uIor + 1.0);
        float f0 = interfaceRatio * interfaceRatio;

        // The moulded edge sheen reflects the rig; it is not an opacity-only
        // layer that darkens the scene without supplying reflected radiance.
        float reflectance = clamp(sheetReflectance(cosv, f0)
          + uEdgeSheen * vRim * pow(1.0 - cosv, 3.0), 0.0, 1.0);
        float cosT = sqrt(max(1.0 - (1.0 - cosv * cosv) / (uIor * uIor), 0.0));

        // Path length through the moulding at this angle, plus the extra run
        // along the wall where glancing light is piped to the edge.
        float path = vThick / max(cosT, 0.2);
        float piped = vRim * uRimGain * pow(1.0 - cosv, 1.6) * (vThick + 6.0);
        float transmittance = exp(-dot(uAbsorb, vec3(0.3333)) * (path + piped));

        vec3 reflectDir = reflect(-V, N);
        vec3 env = sampleEnv(uEnv, reflectDir, uRoughness) * uEnvIntensity;

        // Refracted light reaching the eye after crossing the moulding.
        vec3 refractDir = refract(-V, N, 1.0 / uIor);
        vec3 through = sampleEnv(uEnv, refractDir, uRoughness) * uEnvIntensity;

        float pipedAmount = clamp(vRim * (1.0 - reflectance) * (1.0 - transmittance)
          * (0.35 + 0.65 * pow(1.0 - cosv, 1.2)), 0.0, 1.0);
        // Tint modulates refracted edge light only. No flat grey/blue source is
        // added, and the broad faces retain the real scene behind the shell.
        vec3 pipedColor = through * uTint * pipedAmount;

        float alpha = clamp(1.0 - (1.0 - reflectance) * transmittance, 0.0, 1.0);

        vec3 color = env * reflectance + pipedColor;
        color = color / max(alpha, 1e-3);

        // Straight alpha: opacity scales coverage, not the radiance twice.
        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });

  return material as unknown as PlasticMaterial;
}
