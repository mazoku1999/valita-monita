/**
 * Color al modo de Van Gogh (fragmentos GLSL que comparten los shaders de `pintura.ts`).
 *
 * - Una paleta corta de pigmentos (los de sus cartas a Theo y los que se ven en La noche
 *   estrellada, Los girasoles o el Café de noche): azul de Prusia, ultramar, cobalto, amarillos de
 *   cromo, naranja, ocre, bermellón, verde esmeralda y blanco de zinc. Cada color de la escena se
 *   satura, se aclara un poco y se acerca al pigmento más próximo en OKLab (un espacio donde la
 *   distancia se parece a la diferencia que percibe el ojo).
 * - Nunca negro puro: las sombras se pintan con azul de Prusia muy oscuro.
 * - El cielo abierto no es negro sino un azul nocturno con bandas que siguen los remolinos (la
 *   misma función de corriente que orienta los trazos), anclado a la esfera celeste.
 * - La luz de la escena sobre el cielo (el resplandor del agujero, la banda de chispas) se pinta
 *   como en los halos de las estrellas del cuadro: del azul pasa a un anillo verdoso claro y de
 *   ahí al amarillo.
 */

export const OKLAB_GLSL = /* glsl */ `
vec3 linealDesdeSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 srgbDesdeLineal(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 oklab(vec3 srgb) {
  vec3 c = linealDesdeSRGB(srgb);
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}

vec3 srgbDesdeOklab(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  vec3 c = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return srgbDesdeLineal(c);
}
`

/**
 * Pigmentos (sRGB 0–255). El orden no importa: se busca el más próximo. Sus coordenadas OKLab se
 * calculan aquí una vez y entran al shader como constantes (buscar el pigmento más próximo en
 * cada vértice de cada pincelada no cuesta más que unas restas).
 */
export const PIGMENTOS: readonly { readonly nombre: string; readonly srgb: readonly [number, number, number] }[] = [
  { nombre: 'negro azulado', srgb: [12, 18, 35] },
  { nombre: 'azul de Prusia', srgb: [25, 40, 76] },
  { nombre: 'ultramar', srgb: [40, 69, 148] },
  { nombre: 'cobalto', srgb: [59, 108, 184] },
  { nombre: 'celeste', srgb: [138, 181, 217] },
  { nombre: 'blanco azulado', srgb: [213, 228, 236] },
  { nombre: 'verde esmeralda', srgb: [54, 118, 97] },
  { nombre: 'verde amarillo', srgb: [154, 179, 89] },
  { nombre: 'amarillo limón', srgb: [244, 224, 115] },
  { nombre: 'amarillo de cromo', srgb: [240, 184, 48] },
  { nombre: 'naranja de cromo', srgb: [227, 126, 45] },
  { nombre: 'ocre', srgb: [184, 137, 62] },
  { nombre: 'tierra', srgb: [110, 74, 47] },
  { nombre: 'bermellón', srgb: [196, 73, 50] },
  { nombre: 'blanco de zinc', srgb: [247, 241, 219] },
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

export const PALETA_GLSL = /* glsl */ `
const int N_PIGMENTOS = ${PIGMENTOS.length};
const vec3 PIGMENTOS_LAB[${PIGMENTOS.length}] = vec3[](
  ${PIGMENTOS.map((p) => vec3(aOklab(p.srgb))).join(',\n  ')}
);

// Distancia en OKLab con más peso al tono/croma que a la claridad: el pigmento se elige por su
// color, y la claridad de la escena se conserva.
float distanciaPigmento(vec3 a, vec3 b) {
  vec3 d = a - b;
  return d.x * d.x * 0.6 + dot(d.yz, d.yz) * 1.6;
}

// Los dos pigmentos más próximos (índices) y sus distancias.
void pigmentosCercanos(vec3 lab, out int k1, out int k2, out float d1, out float d2) {
  k1 = 0;
  k2 = 0;
  d1 = 1e9;
  d2 = 1e9;
  for (int k = 0; k < N_PIGMENTOS; k++) {
    float d = distanciaPigmento(lab, PIGMENTOS_LAB[k]);
    if (d < d1) {
      d2 = d1;
      k2 = k1;
      d1 = d;
      k1 = k;
    } else if (d < d2) {
      d2 = d;
      k2 = k;
    }
  }
}

// Color de la escena → color de pintura: más saturado, algo más luminoso, las sombras hacia el
// azul de Prusia y todo acercado al pigmento más próximo.
vec3 mapaVanGogh(vec3 srgb) {
  vec3 lab = oklab(srgb);
  // Claridad: los medios tonos suben (sus cuadros son luminosos), el negro no.
  float L = lab.x;
  L = L + 0.10 * L * (1.0 - L) * 2.0;
  vec2 ab = lab.yz * 1.35;
  // Sombras frías: lo oscuro se inclina al azul (b negativo) en vez de quedarse neutro.
  float sombra = 1.0 - smoothstep(0.12, 0.45, L);
  ab += sombra * vec2(-0.012, -0.045);
  vec3 ajustado = vec3(L, ab);
  int k1;
  int k2;
  float d1;
  float d2;
  pigmentosCercanos(ajustado, k1, k2, d1, d2);
  vec3 pigmento = PIGMENTOS_LAB[k1];
  // Se acerca al pigmento en tono y croma y sólo un poco en claridad.
  vec3 mezcla = vec3(mix(ajustado.x, pigmento.x, 0.25), mix(ajustado.yz, pigmento.yz, 0.5));
  return srgbDesdeOklab(mezcla);
}
`

/**
 * Cielo pintado: la función de corriente sobre la esfera celeste (dirección de vista en el mundo)
 * da a la vez la dirección de los trazos (sus curvas de nivel) y las bandas de color, así las
 * bandas corren a lo largo de las pinceladas como en los remolinos del cuadro.
 */
export const CORRIENTE_GLSL = /* glsl */ `
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;

vec3 direccionMundo(vec2 uv) {
  vec4 ojo = uProyInversa * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  return normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}

// Remolinos con nombre propio: grandes espirales fijas en el cielo (dirección, radio angular en
// cuerda, intensidad con signo = sentido de giro), como la gran ola del centro del cuadro.
const int N_REMOLINOS = 7;
const vec4 REMOLINOS[7] = vec4[](
  vec4(0.62, 0.35, -0.70, 0.30),
  vec4(-0.55, 0.40, 0.73, 0.26),
  vec4(-0.20, -0.30, -0.93, 0.24),
  vec4(0.85, -0.25, 0.46, 0.22),
  vec4(-0.75, -0.15, -0.64, 0.28),
  vec4(0.10, 0.62, -0.78, 0.22),
  vec4(0.30, -0.45, 0.84, 0.25)
);
const float GIRO_REMOLINOS[7] = float[](1.0, -0.9, 0.8, -1.0, 0.9, -0.8, 1.0);

// Corriente del cielo: la componente principal crece con la altura sobre el plano del disco, así
// que las líneas de flujo corren paralelas a él (en pantalla, a lo largo de la banda de chispas,
// como las ondas del cielo sobre el horizonte del cuadro); el ruido las ondula y los remolinos
// las enrollan en espirales aquí y allá.
float corrienteCielo(vec3 dir) {
  float s = 1.1 * dir.y;
  s += 0.22 * ruido3(dir * 2.4 + vec3(3.1, 7.7, 1.3));
  s += 0.08 * ruido3(dir * 5.2 + vec3(-1.3, 2.9, 5.1));
  for (int k = 0; k < N_REMOLINOS; k++) {
    vec3 centro = normalize(REMOLINOS[k].xyz);
    float r = REMOLINOS[k].w;
    vec3 d = dir - centro;
    s += 0.42 * GIRO_REMOLINOS[k] * exp(-dot(d, d) / (r * r));
  }
  return s;
}
`

/** Color del cielo nocturno y de la luz sobre él (necesita OKLAB, PALETA y CORRIENTE). */
export const CIELO_GLSL = /* glsl */ `
// Cielo nocturno: azul profundo que varía despacio, bandas suaves a lo largo de la corriente y,
// sólo en algunas zonas, hilos claros de celeste y blanco azulado (los remolinos luminosos del
// cuadro), más algún toque verdoso. Las fases de las bandas dependen SÓLO de la corriente: así son
// curvas de nivel exactas, paralelas a los trazos (si se mezclaba otro ruido en la fase, las
// bandas cruzaban los trazos y se veían escalonadas); el ruido lento sólo cambia su intensidad.
vec3 colorCielo(vec3 dir, float psi) {
  float lento = ruido3(dir * 1.6 + vec3(11.0, 3.0, 7.0));
  float zonas = smoothstep(0.5, 0.78, ruido3(dir * 1.15 + vec3(-4.0, 8.0, 2.5)));
  vec3 noche = vec3(0.045, 0.075, 0.190);
  vec3 ultramar = vec3(0.100, 0.180, 0.430);
  vec3 cobalto = vec3(0.180, 0.330, 0.620);
  vec3 celeste = vec3(0.500, 0.660, 0.830);
  vec3 blancoAzul = vec3(0.800, 0.860, 0.900);
  vec3 turquesa = vec3(0.130, 0.360, 0.420);
  float banda = 0.5 + 0.5 * sin(6.2831853 * psi * 3.2);
  vec3 c = mix(noche, ultramar, clamp(0.3 + 0.45 * lento + 0.3 * (banda - 0.5), 0.0, 1.0));
  c = mix(c, cobalto, smoothstep(0.7, 1.0, banda) * (0.2 + 0.45 * zonas));
  float hilo = pow(0.5 + 0.5 * sin(6.2831853 * (psi * 9.0 + 0.25)), 10.0);
  c = mix(c, celeste, hilo * zonas * 0.7);
  c = mix(c, blancoAzul, hilo * hilo * zonas * 0.4);
  c = mix(c, turquesa, smoothstep(0.66, 0.86, lento) * (1.0 - zonas) * 0.4);
  return c;
}

`

/** La luz de la escena pintada sobre el cielo (necesita OKLAB y PALETA). */
export const LUZ_CIELO_GLSL = /* glsl */ `
// La luz de la escena pintada sobre el cielo: halo verdoso claro que pasa a amarillo.
vec3 cieloConLuz(vec3 cielo, vec3 escena) {
  float L = dot(escena, vec3(0.299, 0.587, 0.114));
  float a = smoothstep(0.02, 0.5, L);
  vec3 luz = mapaVanGogh(escena * (1.0 + 0.6 * (1.0 - a)));
  vec3 verdoso = vec3(0.600, 0.780, 0.690);
  float anillo = smoothstep(0.0, 0.3, a) * (1.0 - smoothstep(0.35, 0.75, a));
  vec3 c = mix(cielo, mix(cielo, verdoso, 0.55), anillo);
  return mix(c, luz, smoothstep(0.22, 0.8, a));
}
`

/**
 * Estrellas pintadas como las de La noche estrellada: núcleo blanco amarillento y anillos
 * concéntricos de amarillo, verde pálido y blanco azulado que se funden con el cielo. Las
 * posiciones vienen de `utils/estrellasPintadas.ts` (fijas en la esfera celeste, proyectadas cada
 * fotograma) y su visibilidad (cielo abierto y oscuro en el centro de la estrella) de un pase
 * diminuto que las mide una vez por fotograma.
 */
export const ESTRELLAS_GLSL = /* glsl */ `
#define MAX_ESTRELLAS 16
// xy: posición (uv), z: radio (fracción de la altura), w: brillo 0–1.
uniform vec4 uEstrellas[MAX_ESTRELLAS];
uniform int uNumEstrellas;
uniform sampler2D uVisibilidadEstrellas;

float visibilidadEstrella(int k) {
  return texelFetch(uVisibilidadEstrellas, ivec2(k, 0), 0).r;
}

// Offset desde el centro de la estrella en unidades proporcionales a píxeles (x por el aspecto).
vec2 desdeEstrella(vec2 uv, vec4 e, float aspecto) {
  return (uv - e.xy) * vec2(aspecto, 1.0);
}

// Anillos de una estrella del cuadro (d en radios de la estrella): núcleo blanco amarillento,
// anillo de amarillo de cromo, un filo blanquecino y un halo celeste que se funde con el cielo.
vec3 anillosEstrella(float d) {
  vec3 nucleo = vec3(1.0, 0.975, 0.85);
  vec3 amarillo = vec3(0.97, 0.80, 0.26);
  vec3 filo = vec3(0.97, 0.95, 0.78);
  vec3 halo = vec3(0.62, 0.78, 0.86);
  vec3 c = mix(nucleo, amarillo, smoothstep(0.16, 0.26, d));
  c = mix(c, filo, smoothstep(0.44, 0.52, d));
  c = mix(c, halo, smoothstep(0.6, 0.72, d));
  return c;
}

// Peso de la estrella: pleno hasta el filo y el halo se va apagando hasta 1.35 radios.
float pesoAnillos(float d) {
  return d < 0.62 ? 1.0 : 0.85 * (1.0 - smoothstep(0.62, 1.35, d));
}

// Color de la estrella más presente en este punto y su peso (0 = sin estrella).
vec3 estrellasPintadas(vec2 uv, float aspecto, out float peso) {
  peso = 0.0;
  vec3 color = vec3(0.0);
  for (int k = 0; k < MAX_ESTRELLAS; k++) {
    if (k >= uNumEstrellas) break;
    vec4 e = uEstrellas[k];
    float d = length(desdeEstrella(uv, e, aspecto)) / e.z;
    if (d > 1.4) continue;
    float w = e.w * visibilidadEstrella(k) * pesoAnillos(d);
    if (w > peso) {
      peso = w;
      color = anillosEstrella(d);
    }
  }
  return color;
}

// Los trazos giran en círculo alrededor de cada estrella visible.
vec2 flujoEstrellas(vec2 uv, float aspecto, vec2 direccion) {
  for (int k = 0; k < MAX_ESTRELLAS; k++) {
    if (k >= uNumEstrellas) break;
    vec4 e = uEstrellas[k];
    vec2 q = desdeEstrella(uv, e, aspecto);
    float d = length(q) / e.z;
    if (d > 1.6) continue;
    float w = (1.0 - smoothstep(1.1, 1.6, d)) * visibilidadEstrella(k);
    vec2 t = dot(q, q) > 1e-12 ? normalize(vec2(-q.y, q.x)) : direccion;
    if (dot(t, direccion) < 0.0) t = -t;
    direccion = normalize(mix(direccion, t, w) + 1e-6);
  }
  return direccion;
}
`
