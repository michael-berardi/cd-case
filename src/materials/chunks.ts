/**
 * Shared GLSL fragments.
 *
 * Kept as plain strings so both materials compile from one definition and the
 * package needs no shader-chunk plugin.
 */

/** Fresnel reflectance at a dielectric interface (Schlick). */
export const FRESNEL = /* glsl */ `
float fresnelSchlick(float cosTheta, float f0) {
  float m = clamp(1.0 - cosTheta, 0.0, 1.0);
  float m2 = m * m;
  return f0 + (1.0 - f0) * m2 * m2 * m;
}

/** Both interfaces of a sheet: front reflection, plus what the back sends back. */
float sheetReflectance(float cosTheta, float f0) {
  float f = fresnelSchlick(cosTheta, f0);
  return f + (1.0 - f) * (1.0 - f) * f;
}
`;

/**
 * Environment sampling with a cheap fixed-tap blur. Polished plastic needs
 * almost none; the disc and the moulded walls use a little to keep highlight
 * edges from aliasing.
 */
export const SAMPLE_ENV = /* glsl */ `
vec3 sampleEnv(samplerCube env, vec3 dir, float roughness) {
  vec3 d = normalize(dir);
  vec3 up = abs(d.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(up, d));
  vec3 b = cross(d, t);
  float r = max(roughness, 0.0);
  vec3 acc = textureCube(env, d).rgb * 0.4;
  acc += textureCube(env, normalize(d + t * r)).rgb * 0.15;
  acc += textureCube(env, normalize(d - t * r)).rgb * 0.15;
  acc += textureCube(env, normalize(d + b * r * 0.7)).rgb * 0.15;
  acc += textureCube(env, normalize(d - b * r * 0.7)).rgb * 0.15;
  return acc;
}
`;

/**
 * Wavelength to linear RGB, as three gaussian bands fitted to the eye's
 * response. Cheaper than a CIE table and smooth enough that the rainbow never
 * bands.
 */
export const SPECTRUM = /* glsl */ `
vec3 wavelengthToRGB(float nm) {
  vec3 q = (vec3(nm) - vec3(608.0, 548.0, 462.0)) / vec3(44.0, 44.0, 38.0);
  vec3 c = exp(-0.5 * q * q);
  float violet = (nm - 424.0) / 20.0;
  c.b += 0.42 * exp(-0.5 * violet * violet);
  return c;
}
`;
