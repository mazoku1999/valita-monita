/**
 * Color de dibujo animado de los años 30 (fragmentos GLSL para `dibujo.ts`): la paleta de época,
 * el cielo nocturno pintado en acuarela, las aguadas de luz sobre él y el papel.
 *
 * - Paleta: los acetatos se pintaban con pocos colores, cálidos y algo apagados (los del
 *   Technicolor de la época): amarillo dorado, naranja, rojo, crema, un azul y un verde "viejos".
 *   Cada color plano se acerca en OKLab (tono y croma) al más próximo de la paleta.
 * - Cielo: los fondos de Cuphead son acuarelas: aguadas suaves e irregulares con el borde más
 *   oscuro donde el pigmento se secó, grano del pigmento y papel. Anclado a la esfera celeste
 *   (gira con la cámara, como un fondo que se desplaza).
 * - La luz de la escena sobre el cielo (el halo del agujero, la banda de polvo, el Sol) se pinta
 *   con aguadas cálidas en tres tonos, cada una con su borde de acuarela.
 */

/** Paleta de época (sRGB 0–255); se busca el más próximo por tono y croma. */
export const PALETA_EPOCA: readonly { readonly nombre: string; readonly srgb: readonly [number, number, number] }[] = [
  { nombre: 'noche', srgb: [30, 40, 58] },
  { nombre: 'azul viejo', srgb: [62, 108, 150] },
  { nombre: 'celeste', srgb: [130, 170, 184] },
  { nombre: 'verde viejo', srgb: [104, 150, 92] },
  { nombre: 'amarillo dorado', srgb: [242, 192, 78] },
  { nombre: 'naranja', srgb: [232, 132, 60] },
  { nombre: 'rojo', srgb: [205, 55, 44] },
  { nombre: 'marrón', srgb: [124, 78, 46] },
  { nombre: 'ocre', srgb: [200, 150, 86] },
  { nombre: 'crema', srgb: [244, 231, 202] },
  { nombre: 'rosa', srgb: [228, 150, 138] },
]

const lineal = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

const aOklab = ([r8, g8, b8]: readonly [number, number, number]): [number, number, number] => {
  const r = lineal(r8 / 255)
  const g = lineal(g8 / 255)
  const b = lineal(b8 / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const vec3 = (v: readonly number[]): string => `vec3(${v.map((x) => x.toFixed(5)).join(', ')})`

/** Necesita OKLAB_GLSL. */
export const PALETA_EPOCA_GLSL = /* glsl */ `
const int N_EPOCA = ${PALETA_EPOCA.length};
const vec3 EPOCA_LAB[${PALETA_EPOCA.length}] = vec3[](
  ${PALETA_EPOCA.map((p) => vec3(aOklab(p.srgb))).join(',\n  ')}
);

// Acerca el color al de la paleta más próximo en tono y croma (la claridad la deciden las bandas).
vec3 colorDeEpoca(vec3 srgb, float fuerza) {
  vec3 lab = oklab(srgb);
  float mejor = 1e9;
  vec3 elegido = lab;
  for (int k = 0; k < N_EPOCA; k++) {
    vec3 d = lab - EPOCA_LAB[k];
    float distancia = 0.35 * d.x * d.x + dot(d.yz, d.yz) * 2.0;
    if (distancia < mejor) {
      mejor = distancia;
      elegido = EPOCA_LAB[k];
    }
  }
  lab.yz = mix(lab.yz, elegido.yz, fuerza);
  return srgbDesdeOklab(lab);
}
`

/** Ruido de valor 3D y fbm (sobre la dirección de vista). */
export const RUIDO3_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}

float fbm3(vec3 p) {
  return 0.55 * ruido3(p) + 0.3 * ruido3(p * 2.03 + 11.7) + 0.15 * ruido3(p * 4.11 + 23.1);
}
`

/**
 * Cielo nocturno en acuarela, sobre la dirección de vista en el mundo (necesita RUIDO3_GLSL).
 * Dos aguadas: una base azul noche que varía despacio y manchas verdosas más claras, cada una con
 * el borde oscurecido donde el agua se secó, y el grano del pigmento en las zonas oscuras.
 */
export const CIELO_ACUARELA_GLSL = /* glsl */ `
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;

vec3 direccionMundo(vec2 uv) {
  vec4 ojo = uProyInversa * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  return normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
}

// Borde de acuarela: una aguada con umbral u sobre el campo n deja el pigmento acumulado en su orilla.
float aguada(float n, float u, float suavidad) {
  return smoothstep(u - suavidad, u + suavidad, n);
}

float orilla(float n, float u, float ancho) {
  float x = (n - u) / ancho;
  return exp(-x * x);
}

vec3 cieloAcuarela(vec3 dir) {
  // Azul noche vivo (como las noches de Cuphead), más oscuro hacia arriba y algo morado hacia abajo.
  vec3 alto = vec3(0.090, 0.160, 0.370);
  vec3 bajo = vec3(0.190, 0.170, 0.430);
  vec3 claro = vec3(0.230, 0.360, 0.680);
  vec3 oscuro = vec3(0.060, 0.100, 0.260);
  float grande = fbm3(dir * 1.2 + vec3(2.0, 5.0, 1.0));
  float medio = fbm3(dir * 2.6 + vec3(-4.0, 1.5, 7.0));
  float fino = ruido3(dir * 19.0);
  vec3 c = mix(bajo, alto, smoothstep(-0.35, 0.55, dir.y));
  c = mix(c, oscuro, 0.35 * smoothstep(0.5, 0.75, medio) * (1.0 - smoothstep(0.4, 0.6, grande)));
  // Manchas claras de la aguada, con la orilla más oscura donde se secó el agua.
  float campo = grande + 0.35 * (medio - 0.5);
  float mancha = aguada(campo, 0.58, 0.012);
  c = mix(c, claro, 0.28 * mancha);
  c *= 1.0 - 0.12 * orilla(campo, 0.58, 0.018);
  float mancha2 = aguada(medio + 0.2 * (grande - 0.5), 0.66, 0.012);
  c = mix(c, mix(claro, bajo, 0.4), 0.22 * mancha2);
  c *= 1.0 - 0.12 * orilla(medio + 0.2 * (grande - 0.5), 0.66, 0.016);
  // Grano del pigmento.
  c *= 0.93 + 0.1 * fino;
  return c;
}
`

/**
 * Cielo de la mañana en acuarela, para el valle de Cochabamba (necesita CIELO_ACUARELA_GLSL): azul
 * limpio arriba y claro hacia el horizonte; hacia el Sol, un resplandor dorado bajo; al lado
 * contrario, la franja rosada del cinturón de Venus sobre la sombra azulada de la Tierra, como en
 * los amaneceres de verdad; nubecillas de aguada con su orilla y el grano del pigmento. La dirección
 * y el Sol van en coordenadas del valle (y hacia arriba).
 */
export const CIELO_MANANA_GLSL = /* glsl */ `
vec3 cieloManana(vec3 d, vec3 sol) {
  float y = clamp(d.y, -0.1, 1.0);
  vec3 c = mix(vec3(0.84, 0.88, 0.96), vec3(0.45, 0.62, 0.88), smoothstep(0.0, 0.75, y));
  float haciaSol = 0.5 + 0.5 * dot(normalize(d.xz + 1e-5), normalize(sol.xz + 1e-5));
  float bajo = 1.0 - smoothstep(0.0, 0.4, y);
  c = mix(c, vec3(1.0, 0.86, 0.68), pow(haciaSol, 4.0) * bajo * 0.85);
  float contrario = 1.0 - haciaSol;
  float cinturon = smoothstep(0.015, 0.06, y) * (1.0 - smoothstep(0.1, 0.22, y));
  c = mix(c, vec3(0.98, 0.79, 0.85), cinturon * pow(contrario, 1.3) * 0.8);
  float sombraTierra = 1.0 - smoothstep(-0.01, 0.035, y);
  c = mix(c, vec3(0.7, 0.73, 0.88), sombraTierra * pow(contrario, 1.3) * 0.65);
  // Nubecillas de aguada, más en lo alto, con la orilla donde se secó el agua.
  float campo = fbm3(d * vec3(2.2, 5.5, 2.2) + vec3(3.0, 0.0, 1.0));
  float alto = smoothstep(0.03, 0.25, y);
  c = mix(c, vec3(1.0, 0.97, 0.97), 0.45 * aguada(campo, 0.6, 0.015) * alto);
  c *= 1.0 - 0.08 * orilla(campo, 0.6, 0.02) * alto;
  c *= 0.97 + 0.05 * ruido3(d * 19.0);
  return c;
}
`

/** Papel de acuarela (en píxeles de pantalla): grano de prensado en frío a dos escalas. */
export const PAPEL_GLSL = /* glsl */ `
float hash21p(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ruidoPapel(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21p(i), hash21p(i + vec2(1.0, 0.0)), u.x), mix(hash21p(i + vec2(0.0, 1.0)), hash21p(i + vec2(1.0, 1.0)), u.x), u.y);
}

float papel(vec2 px, float escala) {
  vec2 p = px / escala;
  return 0.55 * ruidoPapel(p) + 0.3 * ruidoPapel(p * 2.3 + 17.0) + 0.15 * ruidoPapel(p * 0.37 + 5.0);
}
`
