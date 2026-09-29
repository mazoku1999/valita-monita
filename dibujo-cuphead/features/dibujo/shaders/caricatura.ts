/**
 * Piezas GLSL comunes a todo lo que la escena dibuja ya en caricatura (el sistema solar, el valle
 * de Cochabamba): la salida con la marca de caricatura (alfa 0.5, ver `TONO_GLSL` en `dibujo.ts`),
 * zonas de color plano y trazos de tinta con el borde a un píxel, y ruido 3D.
 */

/** Alfa con el que sale todo lo que ya está dibujado en caricatura (ver COMPONER_FRAG). */
export const SALIDA_CARICATURA = /* glsl */ `
const vec3 TINTA = vec3(0.075, 0.058, 0.047);

vec4 salidaCaricatura(vec3 srgb) {
  return vec4(pow(clamp(srgb, 0.0, 1.0), vec3(2.2)), 0.5);
}

// Zona de color plano: 0 → 1 al cruzar el umbral, con el borde a un píxel.
float zona(float x, float umbral) {
  float w = max(fwidth(x), 1e-5);
  return smoothstep(umbral - w, umbral + w, x);
}

// Trazo de tinta a lo largo de la línea x = 0, de ancho (en píxeles) dado; w es lo que cambia x en
// un píxel (si x salta en algún sitio, fwidth(x) se dispara allí y pintaría una raya falsa: se da w
// de una magnitud continua).
float trazoConPaso(float x, float anchoPx, float w) {
  w = max(w, 1e-5);
  return 1.0 - smoothstep(anchoPx * 0.5 * w, (anchoPx * 0.5 + 1.0) * w, abs(x));
}

float trazo(float x, float anchoPx) {
  return trazoConPaso(x, anchoPx, fwidth(x));
}
`

export const RUIDO_3D = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float suma = 0.0;
  float amplitud = 0.5;
  for (int k = 0; k < 4; k++) {
    suma += amplitud * ruido3(p);
    p = p * 2.02 + vec3(11.3, 7.1, 3.7);
    amplitud *= 0.5;
  }
  return suma / 0.9375;
}

// Celdas de Worley: distancia al punto más cercano (x) y un azar propio de ese punto (y).
vec2 celdas(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float mejor = 8.0;
  float azar = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 c = i + o;
        vec3 punto = o + vec3(hash13(c), hash13(c + 17.1), hash13(c + 31.7));
        float d = length(punto - f);
        if (d < mejor) {
          mejor = d;
          azar = hash13(c + 5.3);
        }
      }
    }
  }
  return vec2(mejor, azar);
}
`
