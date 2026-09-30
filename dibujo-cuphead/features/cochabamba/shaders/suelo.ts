import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'
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
uniform float uCampo;
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

// Colores de los cultivos del valle en la época de lluvias: alfalfa, maíz, pasto, trigo y cebada,
// tierra arada, huertos; alguna parcela de flores (más cerca de Tiquipaya, la de las flores).
vec3 colorCultivo(float id, float flores) {
  if (id < flores * 0.5) return vec3(0.93, 0.66, 0.78);
  if (id < flores * 0.75) return vec3(0.8, 0.68, 0.9);
  if (id < flores) return vec3(0.97, 0.95, 0.9);
  float t = (id - flores) / (1.0 - flores);
  if (t < 0.22) return vec3(0.5, 0.69, 0.31);
  if (t < 0.4) return vec3(0.62, 0.75, 0.36);
  if (t < 0.55) return vec3(0.74, 0.81, 0.46);
  if (t < 0.7) return vec3(0.9, 0.8, 0.46);
  if (t < 0.84) return vec3(0.74, 0.58, 0.4);
  return vec3(0.4, 0.58, 0.3);
}

// Las parcelas del valle: manzanas de ~420 m (algo giradas, como el catastro, con los bordes que
// ondulan) partidas en franjas de 40 a 130 m; entre manzanas, caminos de tierra y, en algunos,
// hileras de eucaliptos; alguna casa de tejado rojo o blanco junto al camino. Cada nivel de
// detalle se apaga cuando mide menos de unos píxeles (de lejos, el color medio: sin muaré).
vec3 parcelas(vec2 xz, float mPorPixel, float muyCerca) {
  const float MANZANA = 420.0;
  vec2 onda = 22.0 * (vec2(fbm2(xz / 900.0), fbm2(xz / 900.0 + 5.1)) - 0.5);
  vec2 r = mat2(0.978, -0.208, 0.208, 0.978) * (xz + onda);
  // Cada eje con su propio ritmo: manzanas de anchos distintos (como un catastro de verdad).
  r += 170.0 * vec2(fbm2(vec2(r.x / 1700.0, 0.3)) - 0.5, fbm2(vec2(0.7, r.y / 1700.0)) - 0.5) * 2.0;
  vec2 manzana = floor(r / MANZANA);
  vec2 dentro = r - manzana * MANZANA;
  float flores = 0.025 + 0.05 * (1.0 - smoothstep(1500.0, 5000.0, length(xz)));
  bool franjasEnX = hash21(manzana) < 0.5;
  float coord = franjasEnX ? dentro.x : dentro.y;
  float ancho = mix(40.0, 130.0, hash21(manzana + 3.1));
  float franja = floor(coord / ancho);
  vec3 colorFranja = colorCultivo(hash21(manzana * 7.1 + vec2(franja * 1.37, 0.5)), flores);
  // El color medio de la manzana (lo que se ve cuando las franjas miden menos de 4 px).
  vec3 colorManzana = colorCultivo(hash21(manzana * 7.1 + vec2(1.37, 0.5)), flores) * 0.5 + colorCultivo(hash21(manzana * 7.1 + vec2(4.11, 0.5)), flores) * 0.5;
  float pixelesFranja = ancho / max(mPorPixel, 1e-3);
  vec3 color = mix(colorManzana, colorFranja, smoothstep(3.0, 6.0, pixelesFranja));
  // Cuando las manzanas miden pocos píxeles, sus colores se acercan a un verde común (de lejos el
  // valle es verde con matices, no un tablero).
  vec3 verdeValle = vec3(0.6, 0.72, 0.38) * (0.96 + 0.06 * hash21(manzana + 8.8) + 0.08 * (fbm2(xz / 3000.0) - 0.5));
  color = mix(mix(color, verdeValle, 0.65), color, smoothstep(12.0, 35.0, MANZANA / max(mPorPixel, 1e-3)));
  float surcos = 0.5 + 0.5 * sin(coord * 2.1);
  color *= mix(1.0, 0.92 + 0.1 * surcos, muyCerca);
  // Lindes entre franjas: una línea algo más oscura, si las franjas se ven.
  float fw = max(fwidth(coord), 1e-3);
  float aLinde = min(fract(coord / ancho), 1.0 - fract(coord / ancho)) * ancho;
  color = mix(color, color * 0.82, (1.0 - smoothstep(0.8, 0.8 + 1.5 * fw, aLinde)) * smoothstep(8.0, 14.0, pixelesFranja));
  // Caminos de tierra entre manzanas y, en algunos, hileras de eucaliptos (copas redondas).
  // Caminos sólo en algunos bordes (las demás manzanas vecinas se juntan).
  float caminoX = min(dentro.x * step(0.35, hash21(vec2(manzana.x, 1.7))), (MANZANA - dentro.x) * step(0.35, hash21(vec2(manzana.x + 1.0, 1.7))));
  float caminoY = min(dentro.y * step(0.35, hash21(vec2(2.9, manzana.y))), (MANZANA - dentro.y) * step(0.35, hash21(vec2(2.9, manzana.y + 1.0))));
  float aCamino = min(caminoX < 0.001 ? 1e3 : caminoX, caminoY < 0.001 ? 1e3 : caminoY);
  aCamino = min(aCamino, 1e3);
  float anchoCamino = max(3.0, 1.2 * mPorPixel);
  float camino = 1.0 - smoothstep(anchoCamino, anchoCamino + 1.5 * fw, aCamino);
  color = mix(color, vec3(0.88, 0.8, 0.64), camino * (1.0 - smoothstep(12.0, 30.0, mPorPixel)));
  if (hash21(manzana + 11.3) > 0.45) {
    float largo = franjasEnX ? dentro.y : dentro.x;
    float copas = length(vec2(fract(largo / 9.0) - 0.5, (aCamino - 7.0) / 9.0)) * 2.0;
    float hilera = (1.0 - smoothstep(0.7, 0.9, copas)) * step(4.0, aCamino) * step(aCamino, 12.0);
    float lejos = smoothstep(2.0, 5.0, mPorPixel);
    hilera = mix(hilera, (1.0 - smoothstep(5.0, 11.0, abs(aCamino - 7.0))) * 0.8, lejos) * (1.0 - smoothstep(20.0, 45.0, mPorPixel));
    color = mix(color, vec3(0.28, 0.46, 0.32), hilera);
  }
  // Casas junto al camino: tejado rojo o blanco, con su sombra.
  vec2 celdaCasa = floor(r / 70.0);
  vec2 enCasa = r - (celdaCasa + 0.5) * 70.0;
  float hayCasa = step(0.82, hash21(celdaCasa + 2.7)) * step(aCamino, 45.0) * step(10.0, aCamino);
  vec2 medida = vec2(7.0 + 5.0 * hash21(celdaCasa), 5.0 + 4.0 * hash21(celdaCasa + 1.1));
  vec2 dCasa = abs(enCasa) - medida;
  float casa = hayCasa * (1.0 - smoothstep(-0.5, 0.5, max(dCasa.x, dCasa.y))) * (1.0 - smoothstep(4.0, 8.0, mPorPixel));
  vec3 tejado = hash21(celdaCasa + 5.3) < 0.7 ? vec3(0.82, 0.44, 0.32) : vec3(0.96, 0.94, 0.9);
  tejado *= mix(0.85, 1.05, step(0.0, enCasa.x));
  color = mix(color, tejado, casa);
  return color;
}

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

  // El campo de girasoles: una parcela grande con las esquinas redondeadas y el borde algo
  // irregular (no un cuadrado perfecto), con sus hileras norte-sur.
  vec2 enCampo = abs(mat2(0.978, -0.208, 0.208, 0.978) * xz) - vec2(uCampo * 1.12, uCampo * 0.96);
  float dCampo = length(max(enCampo + 40.0, 0.0)) + min(max(enCampo.x + 40.0, enCampo.y + 40.0), 0.0) - 40.0;
  dCampo += 9.0 * (fbm2(xz / 60.0) - 0.5);
  if (dCampo < 0.0) {
    float hilera = 0.5 + 0.5 * cos(xz.x * 6.2831853 / 0.9);
    vec3 entrePlantas = mix(vec3(0.58, 0.52, 0.28), vec3(0.46, 0.62, 0.26), smoothstep(0.35, 0.75, hilera));
    vec3 desdeLejos = mix(vec3(0.97, 0.79, 0.2), vec3(0.62, 0.66, 0.2), 0.3 * (1.0 - hilera));
    // Desde arriba: el amarillo a manchas (más dorado donde las cabezas se juntan), los surcos del
    // tractor cada 18 m y el borde, donde se ven los tallos y las hojas.
    float manchas = fbm2(xz / 9.0);
    desdeLejos = mix(desdeLejos, vec3(0.9, 0.66, 0.14), smoothstep(0.45, 0.75, manchas) * 0.7);
    desdeLejos = mix(desdeLejos, vec3(0.99, 0.86, 0.34), smoothstep(0.62, 0.8, fbm2(xz / 3.0 + 4.0)) * 0.5);
    float surco = 1.0 - smoothstep(0.6, 0.6 + max(fwidth(xz.x), 0.05), abs(fract(xz.x / 18.0) - 0.5) * 18.0);
    desdeLejos = mix(desdeLejos, vec3(0.62, 0.64, 0.24), surco * (1.0 - smoothstep(2.0, 5.0, mPorPixel)) * 0.45);
    desdeLejos = mix(desdeLejos, vec3(0.42, 0.56, 0.24), smoothstep(-9.0, -3.0, dCampo) * 0.85);
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
    // Desde arriba, manchas de colores de 1–3 m: un tapiz de flores, no una pegatina rosa.
    float fucsia = smoothstep(0.55, 0.7, fbm2(xz / 2.4));
    float blanca = smoothstep(0.6, 0.72, fbm2(xz / 1.9 + 7.3));
    float lila = smoothstep(0.62, 0.75, fbm2(xz / 2.8 + 3.1));
    vec3 tapiz = vec3(0.97, 0.66, 0.77);
    tapiz = mix(tapiz, vec3(0.88, 0.32, 0.57), fucsia * 0.8);
    tapiz = mix(tapiz, vec3(0.77, 0.56, 0.86), lila * 0.7);
    tapiz = mix(tapiz, vec3(0.99, 0.94, 0.95), blanca * 0.75);
    flores = mix(flores, tapiz, smoothstep(30.0, 90.0, dCamara));
    vec3 follaje = mix(vec3(0.3, 0.48, 0.23), vec3(0.42, 0.6, 0.3), ruido2(xz / 0.4));
    vec3 hojita = celdas2(xz / 0.07);
    follaje = mix(follaje, follaje * 0.78, 1.0 - smoothstep(0.02, 0.08, hojita.y - hojita.x));
    follaje = mix(follaje, flor, step(0.93, hojita.z) * (1.0 - smoothstep(0.2, 0.3, hojita.x)));
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
