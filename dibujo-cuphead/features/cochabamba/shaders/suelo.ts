import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'
import { CAMPOS_GLSL } from './campos'
import { REGION_GLSL } from './region'
import { BRUMA_GLSL, CORAZON_GLSL, RUIDO_2D } from './valle'

/**
 * El suelo de la región y del valle, pintado igual en el relieve 3D del globo (al bajar) y en la
 * escena del valle (ver `utils/region.ts`): de lejos, los colores naturales de la región (según la
 * altura, la humedad y lo llano); de cerca, en el fondo del valle, la pintura detallada: las
 * parcelas, la ciudad con sus tejados, la laguna Alalay, el campo de girasoles y el corazón de
 * flores. La luz, la del Sol bajo de la mañana en tres tonos suaves (`luzRegion`).
 *
 * Todo en el marco del valle: metros, x al este, y la altura sobre el fondo del valle, z al sur.
 */
export const SUELO_GLSL = /* glsl */ `
uniform vec4 uCorazon;
uniform vec3 uCiudad;
uniform vec4 uLaguna;

const float PISO_VALLE_M = 2570.0;

// El río Rocha, del este (Sacaba) al oeste por la ciudad, serpenteando (m, x este, z sur).
const vec2 ROCHA[7] = vec2[](
  vec2(26000.0, 3500.0), vec2(17000.0, 2600.0), vec2(10500.0, 2700.0), vec2(6000.0, 3100.0),
  vec2(0.0, 2600.0), vec2(-7000.0, 3400.0), vec2(-16000.0, 5200.0)
);

float distanciaRio(vec2 xz) {
  // Meandros: la orilla ondula a lo largo del río.
  vec2 q = xz + 70.0 * vec2(sin(xz.x / 190.0 + 1.3), cos(xz.x / 260.0)) + 40.0 * (vec2(fbm2(xz / 700.0), fbm2(xz / 700.0 + 7.0)) - 0.5);
  float d = 1e9;
  for (int i = 0; i < 6; i++) {
    vec2 a = ROCHA[i];
    vec2 ab = ROCHA[i + 1] - a;
    float h = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
    d = min(d, length(q - a - ab * h));
  }
  return d;
}

${CAMPOS_GLSL}

// La ciudad: manzanas de ~110 m en una cuadrícula algo girada, con avenidas cada cinco; tejados
// rojos, crema y blancos, y alguna plaza verde. De lejos, su color medio.
vec3 ciudad(vec2 xz, float mPorPixel) {
  vec2 r = mat2(0.866, -0.5, 0.5, 0.866) * xz;
  vec2 cuadra = floor(r / 110.0);
  vec2 dentro = r - cuadra * 110.0;
  float id = hash21(cuadra * 3.3);
  vec3 tejados = id < 0.55 ? vec3(0.84, 0.5, 0.38) : id < 0.8 ? vec3(0.95, 0.86, 0.74) : id < 0.93 ? vec3(0.98, 0.96, 0.92) : vec3(0.45, 0.64, 0.36);
  // Dentro de cada cuadra, casas de distintos tejados.
  vec2 casa = floor(dentro / 18.0);
  float idCasa = hash21(cuadra * 5.1 + casa);
  vec3 detalle = idCasa < 0.6 ? vec3(0.84, 0.5, 0.38) : idCasa < 0.85 ? vec3(0.95, 0.86, 0.74) : vec3(0.98, 0.96, 0.92);
  if (id >= 0.93) detalle = tejados;
  vec3 color = mix(detalle, tejados, smoothstep(2.0, 5.0, mPorPixel));
  // De lejos: el tono medio de la ciudad, con parques y el grano de los tejados.
  vec3 medio = vec3(0.88, 0.7, 0.59) * (0.96 + 0.08 * (fbm2(xz / 2500.0) - 0.5));
  // Parques: manchas verdes redondeadas (no cuadradas).
  medio = mix(medio, vec3(0.52, 0.66, 0.4), smoothstep(0.72, 0.76, fbm2(xz / 700.0 + 9.0)));
  color = mix(color, medio, smoothstep(10.0, 30.0, mPorPixel));
  // De lejos, el grano de la ciudad: tejados rojos y claros a manchas, sin rejilla.
  float grano = fbm2(xz / 160.0);
  color = mix(color, mix(vec3(0.84, 0.55, 0.45), vec3(0.95, 0.86, 0.76), smoothstep(0.35, 0.65, grano)), smoothstep(10.0, 30.0, mPorPixel) * 0.55);
  // Las avenidas que salen del centro hacia las afueras, como los radios de una rueda, algo
  // curvadas; claras, con su hilera de árboles.
  vec2 alCentro = xz - uCiudad.xy;
  float angulo = atan(alCentro.y, alCentro.x) + 0.12 * sin(length(alCentro) / 900.0);
  float sector = 6.2831853 / 7.0;
  float aRadio = abs(angulo - (floor(angulo / sector + 0.5) * sector)) * length(alCentro);
  float anchoAvenidaLarga = max(10.0, 1.1 * mPorPixel);
  float avenidaRadial = (1.0 - smoothstep(anchoAvenidaLarga, anchoAvenidaLarga + mPorPixel, aRadio)) * smoothstep(400.0, 900.0, length(alCentro));
  color = mix(color, vec3(0.86, 0.84, 0.78), avenidaRadial * smoothstep(3.0, 8.0, mPorPixel) * (1.0 - smoothstep(70.0, 140.0, mPorPixel)));
  // Calles y avenidas.
  float aCalle = min(min(dentro.x, 110.0 - dentro.x), min(dentro.y, 110.0 - dentro.y));
  float avenida = step(0.8, fract(cuadra.x / 5.0)) + step(0.8, fract(cuadra.y / 5.0));
  float anchoCalle = (avenida > 0.5 ? 9.0 : 5.0);
  float calle = (1.0 - smoothstep(anchoCalle, anchoCalle + 1.5 * max(fwidth(aCalle), 1e-3), aCalle)) * (1.0 - smoothstep(4.0, 12.0, mPorPixel));
  return mix(color, vec3(0.74, 0.72, 0.7), calle);
}

// El suelo en p (marco del valle) con su normal n, la región (altura en km sobre el mar, humedad,
// agua, sal), los metros por píxel y la distancia a la cámara (m).
vec3 colorSuelo(vec3 p, vec3 n, vec4 region, float mPorPixel, float dCamara) {
  vec2 xz = p.xz;
  float hSuelo = p.y;
  vec2 km = vec2(xz.x, -xz.y) / 1000.0;
  float pendiente = length(n.xz) / max(n.y, 1e-3);
  float llano = 1.0 - smoothstep(0.035, 0.12, pendiente);
  vec3 color = colorRegion(region, llano, km, 1.0 - smoothstep(500.0, 1500.0, mPorPixel));

  // El fondo del valle, con su pintura detallada cuando el píxel mide menos de ~90 m.
  float enValle = (1.0 - smoothstep(24000.0, 32000.0, length(xz - vec2(2500.0, 0.0)))) * (1.0 - smoothstep(40.0, 160.0, hSuelo));
  float verDetalle = 1.0 - smoothstep(45.0, 110.0, mPorPixel);
  if (enValle * verDetalle > 0.001) {
    float muyCerca = 1.0 - smoothstep(250.0, 1200.0, dCamara);
    vec3 valle = parcelas(xz, mPorPixel, muyCerca);
    // El río Rocha con su franja de árboles.
    float dRio = distanciaRio(xz);
    float anchoRio = max(12.0, 1.2 * mPorPixel);
    valle = mix(valle, vec3(0.3, 0.5, 0.3), 1.0 - smoothstep(anchoRio + 35.0, anchoRio + 45.0 + mPorPixel, dRio));
    valle = mix(valle, vec3(0.46, 0.7, 0.84), 1.0 - smoothstep(anchoRio, anchoRio + mPorPixel, dRio));
    color = mix(color, valle, enValle * verDetalle);
  }
  // El valle de las flores alrededor del corazón: campos irregulares de girasoles, flores, prados…
  float pesoCampos;
  vec3 campos = pintarCampos(xz, mPorPixel, dCamara, pesoCampos);
  color = mix(color, campos, pesoCampos * enValle * (1.0 - smoothstep(25.0, 60.0, mPorPixel)));
  // La ciudad (también de lejos, con su color medio).
  float dCiudad = length(xz - uCiudad.xy) / uCiudad.z + 0.3 * (fbm2(xz / 900.0) - 0.5);
  if (dCiudad < 1.05) {
    // Las afueras: casas sueltas entre los campos antes de la ciudad cerrada.
    float afueras = smoothstep(0.62, 1.0, dCiudad) * smoothstep(0.35, 0.65, fbm2(xz / 380.0 + 3.0));
    color = mix(color, ciudad(xz, mPorPixel), (1.0 - smoothstep(0.88, 1.0, dCiudad)) * (1.0 - afueras) * (1.0 - smoothstep(40.0, 160.0, hSuelo)));
  }

  // La laguna Alalay.
  vec2 enLaguna = (xz - uLaguna.xy) / uLaguna.zw;
  float dLaguna = (length(enLaguna) - 1.0) * min(uLaguna.z, uLaguna.w) + 60.0 * (fbm2(xz / 300.0) - 0.5);
  if (dLaguna < 20.0) {
    vec3 agua = mix(vec3(0.42, 0.66, 0.86), vec3(0.72, 0.87, 0.95), smoothstep(-60.0, 0.0, dLaguna));
    color = mix(color, agua, 1.0 - zona(dLaguna, 0.0));
  }

  // Algo de nieve en lo más alto del Tunari.
  if (length(xz) < 40000.0) {
    float nieve = smoothstep(4880.0, 4960.0, hSuelo + PISO_VALLE_M + 220.0 * (fbm2(xz / 900.0 + 9.0) - 0.5) + 80.0 * n.y);
    color = mix(color, vec3(0.97, 0.97, 1.0), nieve);
  }

  // El corazón de flores rosadas, con su ribete de gipsófila blanca.
  float dCorazon = corazonEn(xz, uCorazon);
  if (dCorazon < uCorazon.w + 1.0) {
    vec3 salpicado = celdas2(xz / 0.22);
    vec3 flores = vec3(0.95, 0.6, 0.75);
    float tono = salpicado.z;
    vec3 flor = tono < 0.3 ? vec3(0.86, 0.22, 0.52) : tono < 0.5 ? vec3(1.0, 0.97, 0.98) : tono < 0.7 ? vec3(0.74, 0.5, 0.84) : vec3(0.98, 0.45, 0.62);
    flores = mix(flores, flor, (1.0 - smoothstep(0.28, 0.36, salpicado.x)) * (1.0 - smoothstep(30.0, 120.0, dCamara)));
    // Desde arriba, manchas de colores de 1–3 m: un tapiz de flores, no una pegatina rosa.
    float fucsia = smoothstep(0.55, 0.7, fbm2(xz / 2.4));
    float blanca = smoothstep(0.6, 0.72, fbm2(xz / 1.9 + 7.3));
    float lila = smoothstep(0.62, 0.75, fbm2(xz / 2.8 + 3.1));
    vec3 tapiz = vec3(0.97, 0.66, 0.77);
    tapiz = mix(tapiz, vec3(0.88, 0.32, 0.57), fucsia * 0.8);
    tapiz = mix(tapiz, vec3(0.77, 0.56, 0.86), lila * 0.7);
    tapiz = mix(tapiz, vec3(0.99, 0.94, 0.95), blanca * 0.75);
    flores = mix(flores, tapiz, smoothstep(30.0, 90.0, dCamara));
    // De cerca, entre las flores, el suelo del macizo: verde en sombra cubierto de hojarasca menuda
    // de poco contraste, sin contornos (con líneas, hojas sueltas grandes y pétalos caídos se veía
    // demasiado cargado; con hojas sueltas más claras, manchas).
    vec3 follaje = vec3(0.22, 0.36, 0.19) * (0.95 + 0.1 * ruido2(xz / 0.9));
    if (dCamara < 24.0) {
      vec2 g = floor(xz / 0.06);
      for (int dz = -1; dz <= 1; dz++) {
        for (int dx = -1; dx <= 1; dx++) {
          vec2 c = g + vec2(float(dx), float(dz));
          vec2 centro = (c + hash22(c)) * 0.06;
          float angulo = hash21(c + 4.4) * 3.14159;
          vec2 q = xz - centro;
          q = vec2(cos(angulo) * q.x + sin(angulo) * q.y, -sin(angulo) * q.x + cos(angulo) * q.y);
          float largo = 0.028 + 0.018 * hash21(c + 1.9);
          float t = clamp(q.x / largo, -1.0, 1.0);
          float ancho = largo * 0.4 * sqrt(max(1.0 - t * t, 0.0));
          float dHoja = max(abs(q.y) - ancho, abs(q.x) - largo);
          float w = max(fwidth(dHoja), 1e-4);
          float cubre = 1.0 - smoothstep(-w, w, dHoja);
          vec3 hoja = follaje * mix(0.93, 1.07, hash21(c + 7.3)) * (0.97 + 0.06 * smoothstep(-ancho, ancho, q.y));
          follaje = mix(follaje, hoja, cubre);
        }
      }
    }
    flores = mix(follaje, flores, smoothstep(6.0, 22.0, dCamara));
    vec3 ribete = mix(vec3(0.99, 0.94, 0.97), vec3(0.97, 0.7, 0.84), step(0.8, salpicado.z) * (1.0 - smoothstep(0.3, 0.4, salpicado.x)));
    vec3 corazon = mix(flores, ribete, zona(dCorazon, -uCorazon.w));
    color = mix(color, corazon, 1.0 - zona(dCorazon, 0.0));
  }
  return color;
}

// La luz de la mañana (normal y Sol en el marco del valle), con los filos de detalle de las
// sierras (a partir de los metros por píxel).
vec3 luzSuelo(vec3 color, vec3 n, vec3 sol, vec3 p, vec4 region, float mPorPixel) {
  // Para la luz, desde lo alto el relieve exagerado (como en un mapa en relieve pintado: las
  // pendientes a escala de km son suaves y con el Sol bajo no llegaban a hacer sombra); de cerca,
  // el de verdad. Más los filos de detalle de las sierras.
  float exageracion = mix(1.0, 3.5, smoothstep(40.0, 400.0, mPorPixel));
  vec2 pendiente = -vec2(n.x, -n.z) / max(n.y, 0.2) * exageracion;
  vec2 km = vec2(p.x, -p.z) / 1000.0;
  float llano = 1.0 - smoothstep(0.035, 0.12, length(n.xz) / max(n.y, 1e-3));
  float sierra = sierraDetalle(region.r, llano, km);
  if (sierra > 0.001) pendiente += pendienteDetalle(km, mPorPixel / 1000.0) * sierra * 4.0;
  vec3 nRegion = normalize(vec3(-pendiente, 1.0));
  return luzRegion(color, nRegion, normalize(vec3(sol.x, -sol.z, sol.y)));
}
`

/** El relieve de la región sobre el globo (ver `utils/parcheRegion.ts`). */
export const PARCHE_VERT = /* glsl */ `
attribute vec3 aValle;
attribute vec3 aNormalValle;
attribute vec4 aRegion;

varying vec3 vValle;
varying vec3 vNormalValle;
varying vec4 vRegion;

void main() {
  vValle = aValle;
  vNormalValle = aNormalValle;
  vRegion = aRegion;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const PARCHE_FRAG = /* glsl */ `
uniform vec3 uCamaraValle;
uniform vec3 uSolValle;
// Bruma (0 desde el espacio; al bajar, la de la mañana con la distancia).
uniform float uBruma;

varying vec3 vValle;
varying vec3 vNormalValle;
varying vec4 vRegion;

${SALIDA_CARICATURA}
${RUIDO_2D}
${CORAZON_GLSL}
${BRUMA_GLSL}
${REGION_GLSL}
${SUELO_GLSL}

void main() {
  vec3 p = vValle;
  float dCamara = distance(p, uCamaraValle);
  float mPorPixel = max(length(fwidth(p.xz)), 1e-3);
  vec3 n = normalize(vNormalValle);
  vec3 color = luzSuelo(colorSuelo(p, n, vRegion, mPorPixel, dCamara), n, uSolValle, p, vRegion, mPorPixel);
  color *= mix(vec3(1.0), vec3(0.74, 0.74, 0.9), zona(sombraNubes(vec2(p.x, -p.z) / 1000.0), 0.45) * 0.85);
  color = mix(color, colorBruma(p - uCamaraValle, uSolValle), uBruma * (1.0 - exp(-dCamara / 45000.0)));
  gl_FragColor = salidaCaricatura(color);
}
`

/** El suelo del valle (la escena del valle, en metros): el mismo suelo, con la bruma a ras. */
export const VALLE_SUELO_VERT = /* glsl */ `
attribute vec4 aRegion;

varying vec3 vPos;
varying vec3 vNormal;
varying vec4 vRegion;

void main() {
  vPos = position;
  vNormal = normal;
  vRegion = aRegion;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const VALLE_SUELO_FRAG = /* glsl */ `
uniform vec3 uCamara;
uniform vec3 uSol;

varying vec3 vPos;
varying vec3 vNormal;
varying vec4 vRegion;

${SALIDA_CARICATURA}
${RUIDO_2D}
${CORAZON_GLSL}
${BRUMA_GLSL}
${REGION_GLSL}
${SUELO_GLSL}

void main() {
  vec3 p = vPos;
  vec3 n = normalize(vNormal);
  float dCamara = distance(p, uCamara);
  float mPorPixel = max(length(fwidth(p.xz)), 1e-3);
  vec3 color = luzSuelo(colorSuelo(p, n, vRegion, mPorPixel, dCamara), n, uSol, p, vRegion, mPorPixel);
  color *= mix(vec3(1.0), vec3(0.74, 0.74, 0.9), zona(sombraNubes(vec2(p.x, -p.z) / 1000.0), 0.45) * 0.85);
  // Bruma de la mañana; en el horizonte, el color del cielo.
  color = mix(color, colorBruma(p - uCamara, uSol), 0.85 * (1.0 - exp(-dCamara / 24000.0)));
  gl_FragColor = salidaCaricatura(color);
}
`
