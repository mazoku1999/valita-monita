/**
 * Piezas GLSL del valle de Cochabamba de dibujo animado (ver `constantes/valle.ts`): el corazón con
 * signo, la bruma de la mañana y el ruido 2D. El suelo se pinta en `shaders/suelo.ts`, el mismo en
 * el valle y en el relieve de la región que se ve al bajar.
 */

/** Corazón con signo (Íñigo Quílez): la punta en (0, 0), los lóbulos hacia +y (hasta ~1.25). */
export const CORAZON_GLSL = /* glsl */ `
float dot2(vec2 v) {
  return dot(v, v);
}

float sdCorazon(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// El corazón en el suelo del valle (distancia en metros, negativa dentro): uCorazon = (metros por
// unidad, eje x, eje z, ribete). El eje va de la punta a los lóbulos; su centro, en el origen.
float corazonEn(vec2 xz, vec4 corazon) {
  vec2 eje = corazon.yz;
  vec2 derecha = vec2(-eje.y, eje.x);
  vec2 q = vec2(dot(xz, derecha), dot(xz, eje)) / corazon.x + vec2(0.0, 0.6);
  return sdCorazon(q) * corazon.x;
}
`

/** La bruma de la mañana en el valle: azulada lejos del Sol, dorada hacia él. */
export const BRUMA_GLSL = /* glsl */ `
vec3 colorBruma(vec3 haciaPunto, vec3 sol) {
  float haciaSol = 0.5 + 0.5 * dot(normalize(haciaPunto.xz + 1e-5), normalize(sol.xz + 1e-5));
  return mix(vec3(0.76, 0.8, 0.94), vec3(0.98, 0.88, 0.8), pow(haciaSol, 3.0));
}
`

export const RUIDO_2D = /* glsl */ `
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float ruido2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm2(vec2 p) {
  return (0.5 * ruido2(p) + 0.25 * ruido2(p * 2.03 + 17.1) + 0.125 * ruido2(p * 4.1 + 3.7)) / 0.875;
}

// Celdas de Voronoi: distancia al centro más cercano (x), al segundo (y) y el azar de la celda (z).
vec3 celdas2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = vec2(float(x), float(y));
      vec2 punto = c + 0.15 + 0.7 * hash22(i + c);
      float d = length(punto - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash21(i + c + 7.7);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(d1, d2, id);
}
`
