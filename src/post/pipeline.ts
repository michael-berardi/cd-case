/**
 * A compact HDR post chain.
 *
 * The scene renders once into a float target, a bright pass feeds a two-level
 * gaussian pyramid, and the composite adds the pyramid back over the scene
 * before encoding to sRGB. Output conversion is done here rather than by
 * three, so `renderer.toneMapping` and `renderer.outputColorSpace` never
 * affect the image and there is exactly one place where the transfer function
 * is applied.
 *
 * Bloom matters for this scene because the case is almost entirely specular:
 * the only bright pixels are softbox reflections off the moulded edges and the
 * aluminium, and they need to bleed to read as glints.
 */

import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Soft shoulder above `k`, identity below it, C1 continuous at the knee. */
const SHOULDER = /* glsl */ `
  vec3 shoulder(vec3 c, float k) {
    vec3 s = max(c - k, 0.0);
    return min(c, vec3(k)) + (1.0 - k) * s / (s + (1.0 - k));
  }

  vec3 linearToSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.4166667)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }
`;

export interface PostOptions {
  /** Bloom strength. 0 disables the pyramid entirely. */
  bloomStrength: number;
  /** Luminance above which a pixel contributes to bloom. */
  bloomThreshold: number;
  /** Extra spread, in half-resolution texels. */
  bloomRadius: number;
  /** Exposure applied immediately before the shoulder. */
  exposure: number;
  /**
   * Preserve the scene's alpha channel so the canvas can sit on a page
   * background. Set false when the scene clears to an opaque colour.
   */
  alpha: boolean;
}

export class PostPipeline {
  private readonly renderer: WebGLRenderer;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh<PlaneGeometry, ShaderMaterial>;

  private readonly sceneRT: WebGLRenderTarget;
  private mips: Array<{ rt: WebGLRenderTarget; tmp: WebGLRenderTarget }> = [];
  private readonly bloomRT: WebGLRenderTarget;

  private readonly brightMaterial: ShaderMaterial;
  private readonly downsampleMaterial: ShaderMaterial;
  private readonly blurMaterial: ShaderMaterial;
  private readonly combineMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;

  private width = 1;
  private height = 1;
  private readonly texel = new Vector2();

  /** Whether the bloom pyramid is active. */
  enabled: boolean;
  bloomStrength: number;
  /** Extra blur radius in half-resolution texels. */
  bloomRadius: number;

  constructor(renderer: WebGLRenderer, options: PostOptions) {
    this.renderer = renderer;
    this.enabled = options.bloomStrength > 0;
    this.bloomStrength = options.bloomStrength;
    this.bloomRadius = options.bloomRadius;

    const rtOptions = {
      type: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: renderer.capabilities.isWebGL2 ? 4 : 0,
    } as const;

    this.sceneRT = new WebGLRenderTarget(1, 1, { ...rtOptions });
    this.sceneRT.texture.name = "cd-case.scene";

    const bloomOptions = {
      type: HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    } as const;

    this.bloomRT = new WebGLRenderTarget(1, 1, { ...bloomOptions });
    this.bloomRT.texture.name = "cd-case.bloom";
    for (let i = 0; i < 2; i += 1) {
      this.mips.push({
        rt: new WebGLRenderTarget(1, 1, { ...bloomOptions }),
        tmp: new WebGLRenderTarget(1, 1, { ...bloomOptions }),
      });
      this.mips[i]!.rt.texture.name = `cd-case.bloom.mip${i}`;
    }

    this.brightMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: options.bloomThreshold },
        // Start at 85% of the threshold, not the old 40%: diffuse whites
        // must not leak into the HDR highlight pyramid.
        uKnee: { value: 0.15 },
        uTexel: { value: new Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uThreshold;
        uniform float uKnee;
        uniform vec2 uTexel;
        varying vec2 vUv;

        void main() {
          // 4-tap box on the way down: half resolution for free.
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(0.5, -0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(0.5, 0.5)).rgb;
          c *= 0.25;

          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float knee = uThreshold * uKnee + 1e-5;
          float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee);
          float contrib = max(soft, lum - uThreshold) / max(lum, 1e-5);
          gl_FragColor = vec4(c * contrib, 1.0);
        }
      `,
    });

    this.downsampleMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(0.5, -0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
          c += texture2D(tDiffuse, vUv + uTexel * vec2(0.5, 0.5)).rgb;
          gl_FragColor = vec4(c * 0.25, 1.0);
        }
      `,
    });

    this.blurMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new Vector2(1, 0) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uDirection;
        varying vec2 vUv;

        void main() {
          // 9-tap gaussian, sigma ~ 2 texels.
          float w0 = 0.2270270270;
          float w1 = 0.1945945946;
          float w2 = 0.1216216216;
          float w3 = 0.0540540541;
          float w4 = 0.0162162162;
          vec3 acc = texture2D(tDiffuse, vUv).rgb * w0;
          acc += texture2D(tDiffuse, vUv + uDirection * 1.0).rgb * w1;
          acc += texture2D(tDiffuse, vUv - uDirection * 1.0).rgb * w1;
          acc += texture2D(tDiffuse, vUv + uDirection * 2.0).rgb * w2;
          acc += texture2D(tDiffuse, vUv - uDirection * 2.0).rgb * w2;
          acc += texture2D(tDiffuse, vUv + uDirection * 3.0).rgb * w3;
          acc += texture2D(tDiffuse, vUv - uDirection * 3.0).rgb * w3;
          acc += texture2D(tDiffuse, vUv + uDirection * 4.0).rgb * w4;
          acc += texture2D(tDiffuse, vUv - uDirection * 4.0).rgb * w4;
          gl_FragColor = vec4(acc, 1.0);
        }
      `,
    });

    this.combineMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uWeightB: { value: 1.5 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tA;
        uniform sampler2D tB;
        uniform float uWeightB;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(tA, vUv).rgb + texture2D(tB, vUv).rgb * uWeightB, 1.0);
        }
      `,
    });

    this.compositeMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      // This is a replacement pass, never an alpha blend over the clear
      // colour. The browser composites the finished straight-alpha canvas.
      transparent: false,
      blending: NoBlending,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloom: { value: options.bloomStrength },
        uExposure: { value: options.exposure },
        uKnee: { value: 0.72 },
        uEnabled: { value: options.bloomStrength > 0 ? 1 : 0 },
        uAlpha: { value: options.alpha ? 1 : 0 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uBloom;
        uniform float uExposure;
        uniform float uKnee;
        uniform float uEnabled;
        uniform float uAlpha;
        varying vec2 vUv;

        ${SHOULDER}

        void main() {
          vec4 scene = texture2D(tScene, vUv);
          float alpha = uAlpha > 0.5 ? scene.a : 1.0;
          // Scene blending and MSAA store coverage-weighted LINEAR radiance.
          // Recover straight colour before the nonlinear shoulder/encoding;
          // never un-premultiply sRGB or blend this fullscreen pass again.
          vec3 color = uAlpha > 0.5 ? scene.rgb / max(alpha, 1e-5) : scene.rgb;
          if (uEnabled > 0.5) color += texture2D(tBloom, vUv).rgb * uBloom;
          color = shoulder(max(color, vec3(0.0)) * uExposure, uKnee);
          gl_FragColor = vec4(alpha > 1e-5 ? linearToSRGB(color) : vec3(0.0), alpha);
        }
      `,
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.brightMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** The target the scene must be rendered into. */
  get sceneTarget(): WebGLRenderTarget {
    return this.sceneRT;
  }

  setExposure(exposure: number): void {
    this.compositeMaterial.uniforms.uExposure!.value = exposure;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    this.sceneRT.setSize(w, h);
    this.bloomRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.mips[0]!.rt.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.mips[0]!.tmp.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    // Half the dimensions of level one = one quarter of its pixel count.
    this.mips[1]!.rt.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.mips[1]!.tmp.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }

  private blit(material: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  /**
   * Run the chain. `renderScene` draws the scene into `sceneTarget`; keeping it
   * a callback means the caller never has to know about the intermediate
   * target.
   */
  render(renderScene: (target: WebGLRenderTarget) => void, outputTarget: WebGLRenderTarget | null = null): void {
    renderScene(this.sceneRT);

    const bloomActive = this.enabled && this.bloomStrength > 0;
    if (bloomActive) {
      const mip0 = this.mips[0]!;
      this.brightMaterial.uniforms.tDiffuse!.value = this.sceneRT.texture;
      this.brightMaterial.uniforms.uTexel!.value.set(1 / this.width, 1 / this.height);
      this.blit(this.brightMaterial, mip0.rt);

      let source = mip0.rt;
      for (let i = 0; i < this.mips.length; i += 1) {
        const mip = this.mips[i]!;
        if (i > 0) {
          this.downsampleMaterial.uniforms.tDiffuse!.value = source.texture;
          this.downsampleMaterial.uniforms.uTexel!.value.set(1 / source.width, 1 / source.height);
          this.blit(this.downsampleMaterial, mip.rt);
        }
        this.texel.set(this.bloomRadius / mip.rt.width, 0);
        this.blurMaterial.uniforms.tDiffuse!.value = mip.rt.texture;
        this.blurMaterial.uniforms.uDirection!.value = this.texel;
        this.blit(this.blurMaterial, mip.tmp);

        this.texel.set(0, this.bloomRadius / mip.rt.height);
        this.blurMaterial.uniforms.tDiffuse!.value = mip.tmp.texture;
        this.blurMaterial.uniforms.uDirection!.value = this.texel;
        this.blit(this.blurMaterial, mip.rt);

        source = mip.rt;
      }

      this.combineMaterial.uniforms.tA!.value = this.mips[0]!.rt.texture;
      this.combineMaterial.uniforms.tB!.value = this.mips[1]!.rt.texture;
      this.combineMaterial.uniforms.uWeightB!.value = 1.4;
      this.blit(this.combineMaterial, this.bloomRT);
    }

    this.compositeMaterial.uniforms.tScene!.value = this.sceneRT.texture;
    this.compositeMaterial.uniforms.tBloom!.value = this.bloomRT.texture;
    this.compositeMaterial.uniforms.uBloom!.value = this.bloomStrength;
    this.compositeMaterial.uniforms.uEnabled!.value = bloomActive ? 1 : 0;
    this.blit(this.compositeMaterial, outputTarget);
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.bloomRT.dispose();
    for (const mip of this.mips) {
      mip.rt.dispose();
      mip.tmp.dispose();
    }
    this.mips = [];
    this.quad.geometry.dispose();
    for (const material of [
      this.brightMaterial,
      this.downsampleMaterial,
      this.blurMaterial,
      this.combineMaterial,
      this.compositeMaterial,
    ]) {
      material.dispose();
    }
  }
}
