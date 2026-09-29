import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'

/**
 * Shaders del valle de Cochabamba de dibujo animado (ver `constantes/valle.ts`). Todo sale ya
 * dibujado, con la marca de caricatura (alfa 0.5): colores planos con el borde a un píxel, sombra de
 * color, líneas finas de tinta dentro y el contorno grueso de las siluetas del pase de dibujo.
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

const RUIDO_2D = /* glsl */ `
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

export const TERRENO_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;

void main() {
  vPos = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * El suelo del valle, visto desde el aire y desde el campo:
 * - Fondo del valle: parcelas de cultivo alargadas (verdes, trigo, ocre y alguna de flores, como las
 *   de Tiquipaya) en manzanas algo giradas, con surcos, lindes entre ellas y caminos de tierra entre
 *   manzanas; la ciudad como un mosaico de tejados con sus calles; la laguna Alalay.
 * - Laderas por altura: verde, oliva, roca malva y algo de nieve en lo más alto del Tunari.
 * - El campo de girasoles (dorado desde lejos, hileras verdes de cerca) y el corazón rosado con su
 *   ribete blanco de gipsófila, salpicado de flores.
 * - Luz de mañana de dibujo: tres tonos (lo que mira al Sol, lo plano, la sombra lila), rosado de
 *   alba en las cumbres y bruma azulada con la distancia, que en el horizonte se une con el cielo.
 */
export const TERRENO_FRAG = /* glsl */ `
uniform vec3 uCamara;
uniform vec3 uSol;
uniform vec4 uCorazon;
uniform float uCampo;
uniform vec3 uCiudad;
uniform vec4 uLaguna;

varying vec3 vPos;
varying vec3 vNormal;

${SALIDA_CARICATURA}
${RUIDO_2D}
${CORAZON_GLSL}

vec3 colorParcela(float id) {
  if (id < 0.24) return vec3(0.55, 0.72, 0.33);
  if (id < 0.44) return vec3(0.72, 0.8, 0.42);
  if (id < 0.6) return vec3(0.9, 0.79, 0.47);
  if (id < 0.74) return vec3(0.79, 0.62, 0.39);
  if (id < 0.9) return vec3(0.42, 0.6, 0.29);
  // Campos de flores, como los de Tiquipaya.
  return id < 0.95 ? vec3(0.9, 0.62, 0.78) : vec3(0.76, 0.6, 0.86);
}

// Parcelas: manzanas de 320 m (algo giradas, como el catastro del valle) partidas en franjas largas
// de 22 a 64 m; entre franjas, lindes; entre manzanas, caminos de tierra. Los surcos van a lo largo.
vec3 parcelas(vec2 xz, float cerca, float muyCerca) {
  const float MANZANA = 320.0;
  vec2 r = mat2(0.978, -0.208, 0.208, 0.978) * xz;
  vec2 manzana = floor(r / MANZANA);
  vec2 dentro = r - manzana * MANZANA;
  bool franjasEnX = hash21(manzana) < 0.5;
  float coord = franjasEnX ? dentro.x : dentro.y;
  float largo = franjasEnX ? dentro.y : dentro.x;
  float ancho = mix(22.0, 64.0, hash21(manzana + 3.1));
  float franja = floor(coord / ancho);
  vec3 color = colorParcela(hash21(manzana * 7.1 + vec2(franja * 1.37, 0.5)));
  float surcos = 0.5 + 0.5 * sin(coord * 2.1);
  color *= mix(1.0, 0.9 + 0.12 * surcos, muyCerca);
  float fw = max(fwidth(coord), 1e-3);
  float aLinde = min(fract(coord / ancho), 1.0 - fract(coord / ancho)) * ancho;
  color = mix(color, color * 0.72, (1.0 - smoothstep(0.8, 0.8 + 1.5 * fw, aLinde)) * cerca);
  float aCamino = min(min(dentro.x, MANZANA - dentro.x), min(dentro.y, MANZANA - dentro.y));
  float camino = 1.0 - smoothstep(2.5, 2.5 + 1.5 * fw, aCamino);
  color = mix(color, vec3(0.87, 0.79, 0.64), camino * cerca);
  // Algunos caminos llevan una fila de eucaliptos.
  float fila = step(0.62, hash21(manzana + 11.3)) * (1.0 - smoothstep(9.0, 9.0 + 1.5 * fw, aCamino - 2.0 - 2.0 * ruido2(vec2(largo / 9.0, franja))));
  color = mix(color, vec3(0.27, 0.44, 0.3), fila * (1.0 - camino) * cerca);
  return color;
}

void main() {
  vec3 p = vPos;
  vec2 xz = p.xz;
  float h = p.y;
  vec3 n = normalize(vNormal);
  float dCamara = distance(p, uCamara);
  // Detalles finos que se apagan con la distancia antes de volverse muaré.
  float cerca = 1.0 - smoothstep(1500.0, 6000.0, dCamara);
  float muyCerca = 1.0 - smoothstep(250.0, 1200.0, dCamara);

  // Fondo del valle: las parcelas.
  vec3 color = parcelas(xz, cerca, muyCerca);

  // La ciudad: tejados de colores y calles.
  float dCiudad = length(xz - uCiudad.xy) / uCiudad.z + 0.3 * (fbm2(xz / 900.0) - 0.5);
  if (dCiudad < 1.0) {
    vec3 manzana = celdas2(xz / 55.0);
    vec3 tejado = manzana.z < 0.45 ? vec3(0.83, 0.48, 0.35) : manzana.z < 0.75 ? vec3(0.96, 0.9, 0.79) : vec3(0.98, 0.97, 0.94);
    float calle = 1.0 - smoothstep(0.06, 0.1, manzana.y - manzana.x);
    tejado = mix(tejado, vec3(0.72, 0.7, 0.68), calle * cerca);
    color = mix(color, tejado, smoothstep(1.0, 0.85, dCiudad));
  }

  // La laguna Alalay.
  vec2 enLaguna = (xz - uLaguna.xy) / uLaguna.zw;
  float dLaguna = (length(enLaguna) - 1.0) * min(uLaguna.z, uLaguna.w) + 60.0 * (fbm2(xz / 300.0) - 0.5);
  if (dLaguna < 20.0) {
    vec3 agua = mix(vec3(0.42, 0.66, 0.86), vec3(0.72, 0.87, 0.95), smoothstep(-60.0, 0.0, dLaguna));
    color = mix(color, agua, 1.0 - zona(dLaguna, 0.0));
    color = mix(color, TINTA, trazo(dLaguna, 1.2) * cerca);
  }

  // Laderas: por altura, con bosquecillos de eucaliptos abajo y nieve en lo más alto.
  float ladera = smoothstep(25.0, 120.0, h);
  vec3 monte = mix(vec3(0.5, 0.66, 0.35), vec3(0.64, 0.6, 0.37), smoothstep(500.0, 1100.0, h));
  monte = mix(monte, vec3(0.6, 0.49, 0.52), smoothstep(1250.0, 1700.0, h + 250.0 * (fbm2(xz / 1500.0) - 0.5)));
  monte = mix(monte, vec3(0.68, 0.58, 0.63), smoothstep(1850.0, 2150.0, h));
  float bosque = zona(fbm2(xz / 700.0 + 3.0), 0.62) * (1.0 - smoothstep(600.0, 1100.0, h));
  monte = mix(monte, vec3(0.3, 0.47, 0.3), bosque * 0.85);
  float nieve = zona(h + 260.0 * (fbm2(xz / 900.0 + 9.0) - 0.5) + 180.0 * n.y, 2250.0);
  monte = mix(monte, vec3(0.97, 0.96, 1.0), nieve);
  color = mix(color, monte, ladera);

  // El campo de girasoles, con sus hileras norte-sur.
  vec2 enCampo = abs(xz) - vec2(uCampo);
  float dCampo = max(enCampo.x, enCampo.y) + 6.0 * (ruido2(xz / 20.0) - 0.5);
  if (dCampo < 0.0) {
    float hilera = 0.5 + 0.5 * cos(xz.x * 6.2831853 / 0.9);
    vec3 entrePlantas = mix(vec3(0.44, 0.35, 0.22), vec3(0.3, 0.46, 0.19), smoothstep(0.35, 0.75, hilera));
    vec3 desdeLejos = mix(vec3(0.97, 0.79, 0.2), vec3(0.62, 0.66, 0.2), 0.3 * (1.0 - hilera));
    vec3 girasoles = mix(entrePlantas, desdeLejos, smoothstep(15.0, 90.0, dCamara));
    color = mix(color, girasoles, 1.0 - zona(dCampo, -1.5));
  }

  // El corazón de flores rosadas, con su ribete de gipsófila blanca.
  float dCorazon = corazonEn(xz, uCorazon);
  if (dCorazon < uCorazon.w + 1.0) {
    vec3 salpicado = celdas2(xz / 0.22);
    vec3 flores = vec3(0.95, 0.6, 0.75);
    float tono = salpicado.z;
    vec3 flor = tono < 0.3 ? vec3(0.86, 0.22, 0.52) : tono < 0.5 ? vec3(1.0, 0.97, 0.98) : tono < 0.7 ? vec3(0.74, 0.5, 0.84) : vec3(0.98, 0.45, 0.62);
    flores = mix(flores, flor, (1.0 - smoothstep(0.28, 0.36, salpicado.x)) * (1.0 - smoothstep(30.0, 120.0, dCamara)));
    vec3 ribete = mix(vec3(0.99, 0.94, 0.97), vec3(0.97, 0.7, 0.84), step(0.8, salpicado.z) * (1.0 - smoothstep(0.3, 0.4, salpicado.x)));
    vec3 corazon = mix(flores, ribete, zona(dCorazon, -uCorazon.w));
    color = mix(color, corazon, 1.0 - zona(dCorazon, 0.0));
  }

  // Luz de la mañana en tres tonos, sombra lila y el alba rosada en las cumbres.
  float ndl = dot(n, uSol);
  float luz = mix(0.74, 0.92, zona(ndl, 0.1));
  luz = mix(luz, 1.07, zona(ndl, 0.42));
  vec3 tinte = mix(vec3(0.82, 0.8, 0.98), vec3(1.0), zona(ndl, 0.1));
  color *= luz * tinte;
  color = mix(color, color * vec3(1.1, 0.9, 0.88), smoothstep(1200.0, 2300.0, h) * zona(ndl, 0.1) * 0.8);

  // Bruma: azulada lejos del Sol, dorada hacia él; en el horizonte, el color del cielo.
  vec3 haciaPunto = normalize(p - uCamara);
  float haciaSol = 0.5 + 0.5 * dot(normalize(haciaPunto.xz + 1e-5), normalize(uSol.xz + 1e-5));
  vec3 bruma = mix(vec3(0.76, 0.8, 0.94), vec3(0.98, 0.88, 0.8), pow(haciaSol, 3.0));
  color = mix(color, bruma, 0.9 * (1.0 - exp(-dCamara / 17000.0)));

  gl_FragColor = salidaCaricatura(color);
}
`

/**
 * El paso por las nubes (pantalla completa, encima de todo): siete capas de nubes de dibujo (uniones
 * de círculos con su tinta, crema con el lado en sombra lila y un borde rosado de mañana) que se
 * acercan a la cámara como al bajar a través de ellas. Las lejanas son pocas y pequeñas; las del
 * medio tapan la pantalla entera (es cuando la Tierra da paso al valle); las últimas se abren y
 * dejan ver el valle. Escriben su profundidad (una por capa) para que el pase entinte sus bordes.
 */
export const NUBES_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const NUBES_FRAG = /* glsl */ `
uniform float uAvance;
uniform float uAspecto;
uniform float uTiempo;
uniform vec2 uCercaLejos;

in vec2 vUv;
out vec4 fragColor;

const vec3 TINTA = vec3(0.075, 0.058, 0.047);
const int CAPAS = 7;
const float COBERTURA[7] = float[](0.3, 0.6, 1.0, 0.85, 0.55, 0.35, 0.2);

${RUIDO_2D}

// Nubes de dibujo por celdas: cada una, un racimo de dos bolas de borde festoneado (como las nubes
// de los dibujos animados). Devuelve la distancia (en celdas) al borde, negativa dentro, y la
// posición relativa a la bola más cercana (para la luz).
float nube(vec2 p, float cobertura, float semilla, out vec2 relativa) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float mejor = 1e3;
  relativa = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = vec2(float(x), float(y));
      vec2 celda = i + c + semilla * 17.0;
      if (hash21(celda + 3.7) > cobertura) continue;
      for (int b = 0; b < 2; b++) {
        vec2 azar = hash22(celda + float(b) * 4.3);
        vec2 centro = c + 0.25 + 0.5 * azar + (b == 1 ? vec2(0.32, -0.12) * (azar.x - 0.3) : vec2(0.0));
        float radio = mix(0.42, 0.78, hash21(celda + 9.1 + float(b))) * mix(0.8, 1.15, cobertura) * (b == 1 ? 0.7 : 1.0);
        vec2 v = f - centro;
        float angulo = atan(v.y, v.x);
        float festones = 1.0 + 0.09 * sin(7.0 * angulo + 6.2831853 * azar.y) + 0.04 * sin(12.0 * angulo + 17.0 * azar.x);
        float d = length(v) - radio * festones;
        if (d < mejor) {
          mejor = d;
          relativa = v / radio;
        }
      }
    }
  }
  return mejor;
}

float profundidadDe(float distancia) {
  float n = uCercaLejos.x;
  float f = uCercaLejos.y;
  float zNdc = (f + n) / (f - n) - 2.0 * f * n / ((f - n) * distancia);
  return 0.5 * zNdc + 0.5;
}

void main() {
  vec2 q = (vUv - 0.5) * vec2(uAspecto, 1.0);
  for (int k = 0; k < CAPAS; k++) {
    // Distancia de la capa (baja con el avance: la cámara las atraviesa).
    float dz = 1.5 + 0.55 * float(k) - 4.8 * uAvance;
    if (dz < 0.03) continue;
    // Las capas se van llenando al acercarse (de lejos, unas nubecillas sueltas).
    float cobertura = COBERTURA[k] * smoothstep(2.1, 0.55, dz);
    if (cobertura < 0.02) continue;
    vec2 p = q * 3.2 * dz + vec2(float(k) * 7.3, float(k) * 3.1) + vec2(uTiempo * 0.012, 0.0);
    vec2 relativa;
    float d = cobertura > 0.97 ? -1.0 : nube(p, cobertura, float(k), relativa);
    if (cobertura > 0.97) relativa = vec2(0.0, 0.4);
    float w = max(fwidth(d), 1e-4);
    if (d > w) continue;
    float luz = dot(relativa, normalize(vec2(-0.6, 0.8)));
    vec3 color = mix(vec3(0.86, 0.82, 0.94), vec3(1.0, 0.97, 0.93), smoothstep(-0.25, 0.35, luz));
    color = mix(color, vec3(1.0, 0.87, 0.88), smoothstep(0.62, 1.0, length(relativa)) * 0.5);
    color = mix(color, vec3(0.8, 0.84, 0.95), smoothstep(0.8, 2.6, dz) * 0.4);
    color = mix(color, TINTA, (1.0 - smoothstep(0.6 * w, 1.6 * w, abs(d))) * 0.9);
    gl_FragDepth = profundidadDe(uCercaLejos.x * (2.0 + 25.0 * dz));
    fragColor = vec4(pow(color, vec3(2.2)), 0.5);
    return;
  }
  discard;
}
`
