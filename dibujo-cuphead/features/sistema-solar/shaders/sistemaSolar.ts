/**
 * Shaders del sistema solar dibujado como un dibujo animado de los años 30. Nada es una imagen: el
 * aspecto de cada cuerpo sale de ruido 3D sobre su esfera, pero recortado en zonas de color plano
 * con el borde nítido (a un píxel), y la luz es de caricatura: tono iluminado con un poco de
 * aerógrafo, sombra de un tono propio (morado azulado, no negro), un brillo blanco de barniz y una
 * línea de tinta fina en el borde de la esfera. El contorno grueso contra el cielo lo pone el pase
 * de dibujo (saltos de profundidad).
 *
 * Todos los colores se escriben en sRGB y salen en lineal con alfa 0.5: esa marca le dice al pase
 * de dibujo (`features/dibujo`) que el píxel ya está dibujado y no hay que tonearlo ni aplanarlo.
 */

import { REGION_GLSL } from '@/features/cochabamba/shaders/region'
import { RUIDO_3D, SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'

/**
 * Luz de caricatura de una esfera: tono iluminado (con aerógrafo hacia el terminador), sombra de
 * color, terminador nítido, brillo de barniz y tinta fina en el borde.
 */
const LUZ_CARICATURA = /* glsl */ `
vec3 luzCaricatura(vec3 albedo, vec3 n, vec3 l, vec3 v, float brillo, out float lado) {
  float ndl = dot(n, l);
  lado = zona(ndl, 0.02);
  vec3 iluminado = albedo * mix(0.84, 1.06, smoothstep(0.0, 0.65, ndl));
  // La sombra no es negra: el mismo color, hundido hacia un morado azulado, con algo de luz
  // rebotada en el borde.
  float mu = max(dot(n, v), 0.0);
  vec3 sombra = albedo * vec3(0.34, 0.33, 0.56) * (1.0 + 0.35 * pow(1.0 - mu, 2.0));
  vec3 color = mix(sombra, iluminado, lado);
  vec3 h = normalize(l + v);
  color = mix(color, vec3(1.0, 0.99, 0.95), brillo * zona(dot(n, h), 0.982) * lado);
  // Línea de tinta en el borde de la esfera (la silueta gruesa contra el cielo la pone el pase).
  float fw = max(fwidth(mu), 1e-5);
  color = mix(color, TINTA, 1.0 - smoothstep(1.2 * fw, 2.2 * fw, mu));
  return color;
}
`

export const PLANETA_VERT = /* glsl */ `
varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

void main() {
  vLocal = normalize(position);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

/** Planetas y Luna de caricatura: cada uno con su dibujo de zonas planas. */
export const PLANETA_FRAG = /* glsl */ `
uniform float uAspecto;
uniform vec3 uSol;
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}
${RUIDO_3D}
${LUZ_CARICATURA}

// Cráteres de dibujo: círculos algo más oscuros con un borde claro por arriba y otro oscuro abajo.
vec3 crateres(vec3 p, vec3 color, float escala, float cantidad) {
  vec2 c = celdas(p * escala);
  float radio = mix(0.18, 0.34, c.y);
  float dentro = (1.0 - zona(c.x, radio)) * step(1.0 - cantidad, c.y);
  float borde = trazoConPaso(c.x - radio, 1.2, fwidth(c.x)) * step(1.0 - cantidad, c.y);
  color = mix(color, color * 0.8, dentro);
  return mix(color, color * 0.62, borde);
}

// Línea de color fina entre franjas (en los enteros de x), de un píxel y pico.
float lineaDeFranja(float x) {
  float w = max(fwidth(x), 1e-5);
  float d = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(0.6 * w, 1.6 * w, d);
}

vec3 albedoPlaneta(vec3 p, int tipo) {
  float lat = p.y;
  if (tipo == 0) {
    // Mercurio: gris lila con manchas y cráteres.
    vec3 col = mix(vec3(0.70, 0.66, 0.70), vec3(0.56, 0.52, 0.58), zona(fbm3(p * 2.5), 0.55));
    return crateres(p, col, 4.0, 0.55);
  }
  if (tipo == 1) {
    // Venus: crema dorada con remolinos de nubes más claras.
    float remolino = fbm3(vec3(p.x * 1.6, p.y * 4.5, p.z * 1.6) + 2.3);
    return mix(vec3(0.97, 0.82, 0.52), vec3(1.0, 0.93, 0.74), zona(remolino, 0.52));
  }
  if (tipo == 3) {
    // Marte: rojo anaranjado con mares más oscuros y el casquete blanco.
    vec3 col = mix(vec3(0.92, 0.45, 0.26), vec3(0.72, 0.30, 0.22), zona(fbm3(p * 2.0 + 5.0), 0.56));
    return mix(col, vec3(0.98, 0.96, 0.92), zona(abs(lat) + 0.04 * fbm3(p * 6.0), 0.88));
  }
  if (tipo == 4) {
    // Júpiter: franjas de colores planos con el borde ondulado y la Gran Mancha Roja entintada.
    float onda = fbm3(vec3(p.x * 2.0, p.y * 8.0, p.z * 2.0) + vec3(uTiempo * 0.01, 0.0, 0.0));
    float franja = lat * 5.5 + 0.8 * onda;
    float k = floor(franja);
    float t = fract(k * 0.618);
    vec3 col = t < 0.33 ? vec3(0.99, 0.91, 0.76) : t < 0.66 ? vec3(0.90, 0.70, 0.48) : vec3(0.80, 0.50, 0.34);
    col = mix(col, col * 0.78, lineaDeFranja(franja));
    float lon = atan(p.z, p.x);
    vec2 m = vec2((lon - 1.1) * 0.9, (lat + 0.37) * 3.2);
    float mancha = length(m);
    col = mix(col, vec3(1.0, 0.86, 0.72), 1.0 - zona(mancha, 0.24));
    col = mix(col, vec3(0.86, 0.34, 0.24), 1.0 - zona(mancha, 0.17));
    return mix(col, TINTA, trazo(mancha - 0.17, 1.3));
  }
  if (tipo == 5) {
    // Saturno: franjas oro pálido, suaves.
    float onda = fbm3(vec3(p.x * 1.6, p.y * 6.0, p.z * 1.6) + 4.0);
    float franja = lat * 4.0 + 0.5 * onda;
    float t = fract(floor(franja) * 0.618);
    vec3 col = t < 0.5 ? vec3(0.97, 0.88, 0.64) : vec3(0.90, 0.76, 0.50);
    return mix(col, col * 0.84, lineaDeFranja(franja));
  }
  if (tipo == 6) {
    // Urano: verde agua liso con una franja algo más clara.
    return mix(vec3(0.56, 0.87, 0.88), vec3(0.72, 0.94, 0.93), 1.0 - zona(abs(lat - 0.2), 0.12));
  }
  if (tipo == 8) {
    // La Luna: crema grisácea con mares y cráteres.
    vec3 col = mix(vec3(0.92, 0.90, 0.82), vec3(0.76, 0.75, 0.71), zona(fbm3(p * 1.8 + 11.0), 0.56));
    return crateres(p, col, 3.2, 0.4);
  }
  // Neptuno: azul con una franja más oscura y la mancha oscura entintada.
  vec3 colN = mix(vec3(0.30, 0.47, 0.95), vec3(0.22, 0.36, 0.82), 1.0 - zona(abs(lat + 0.1), 0.1));
  float lonN = atan(p.z, p.x);
  float manchaN = length(vec2((lonN + 0.8) * 0.8, (lat + 0.35) * 3.0));
  colN = mix(colN, vec3(0.16, 0.24, 0.58), 1.0 - zona(manchaN, 0.15));
  return mix(colN, TINTA, trazo(manchaN - 0.15, 1.2));
}

void main() {
  int tipo = int(uAspecto + 0.5);
  vec3 p = normalize(vLocal);
  vec3 albedo = albedoPlaneta(p, tipo);
  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  float lado;
  vec3 color = luzCaricatura(albedo, n, l, v, tipo >= 4 && tipo <= 7 ? 0.7 : 0.85, lado);
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * El Sol de caricatura, como los soles dibujados de los carteles de los años 30: un disco dorado con
 * aerógrafo naranja hacia el borde, un aro interior de color y un brillo, rodeado de rayos
 * puntiagudos de dos tonos que giran muy despacio. Sin cara y sin latir: tranquilo, como una
 * estrella. Es un cartel siempre de cara a la cámara, en el plano del centro del Sol.
 */
export const SOL_VERT = /* glsl */ `
uniform float uTamano;

varying vec2 vLocal;

void main() {
  vLocal = position.xy;
  vec4 centro = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  centro.xy += position.xy * uTamano;
  gl_Position = projectionMatrix * centro;
}
`

export const SOL_FRAG = /* glsl */ `
uniform float uAparicion;
uniform float uTiempo;
// Medio lado del cartel en radios del Sol.
uniform float uMedioLado;

varying vec2 vLocal;

${SALIDA_CARICATURA}

const float PI = 3.14159265359;
const float RAYOS = 24.0;

// Relleno (1 dentro) y contorno de tinta de una forma dada por su distancia aproximada (en radios
// del Sol), con el trazo en píxeles; w es lo que mide un píxel en esas unidades.
vec2 formaConPaso(float d, float grosorPx, float w) {
  w = max(w, 1e-5);
  float relleno = 1.0 - smoothstep(-w, w, d);
  float borde = 1.0 - smoothstep(grosorPx * w, (grosorPx + 1.0) * w, abs(d));
  return vec2(relleno, borde);
}

void main() {
  vec2 q = vLocal * uMedioLado;
  float r = length(q);
  // Lo que mide un píxel en radios del Sol (el radio no salta: sirve también para los rayos, cuyo
  // largo sí salta de uno a otro).
  float w = max(fwidth(r), 1e-5);
  // Los detalles del disco sólo con el Sol grande en pantalla, y la tinta sólo si no es un puntito
  // (a unos pocos píxeles se lo comía entero y el Sol salía negro).
  float detalle = 1.0 - smoothstep(0.05, 0.1, w);
  float conTinta = 1.0 - smoothstep(0.12, 0.3, w);

  // Rayos: 24 picos alternos, largos y cortos, de dos tonos, que giran muy despacio.
  float angulo = atan(q.y, q.x) - uTiempo * 0.06;
  float a = angulo * RAYOS / (2.0 * PI);
  float k = floor(a + 0.5);
  float f = a - k;
  bool rayoLargo = mod(k, 2.0) < 0.5;
  float largo = rayoLargo ? 0.62 : 0.36;
  float pico = 1.0 - 2.0 * abs(f);
  float perfil = 1.04 + largo * pow(pico, 1.4);
  float pendiente = largo * 1.4 * pow(max(pico, 1e-3), 0.4) * 2.0 * RAYOS / (2.0 * PI);
  float dRayo = (r - perfil) / sqrt(1.0 + pow(pendiente / max(r, 0.2), 2.0));
  vec2 rayo = formaConPaso(dRayo, 1.3, w);
  rayo.y *= conTinta;
  vec3 colorRayo = rayoLargo ? vec3(1.0, 0.8, 0.3) : vec3(1.0, 0.62, 0.22);
  // Aerógrafo: más claros junto al disco.
  colorRayo = mix(vec3(1.0, 0.93, 0.62), colorRayo, smoothstep(1.0, 1.35, r));

  // Disco.
  vec2 disco = formaConPaso(r - 1.0, 1.5, w);
  disco.y *= conTinta;
  vec3 cara = mix(vec3(1.0, 0.94, 0.6), vec3(1.0, 0.72, 0.26), smoothstep(0.15, 1.0, r));
  // Aro interior de color (no de tinta), como en los soles dibujados de la época.
  float aro = 1.0 - smoothstep(0.8 * w, 1.8 * w, abs(r - 0.8));
  cara = mix(cara, vec3(0.97, 0.56, 0.2), 0.65 * aro * detalle);
  // Brillo de barniz arriba a la izquierda.
  float brillo = 1.0 - smoothstep(0.1, 0.26, length((q - vec2(-0.42, 0.44)) * vec2(1.0, 1.7)));
  cara = mix(cara, vec3(1.0, 0.99, 0.9), 0.85 * brillo * detalle);

  // Composición: rayos detrás, el disco delante, cada uno con su tinta.
  vec3 color = colorRayo;
  float alfa = max(rayo.x, rayo.y);
  color = mix(color, TINTA, rayo.y * (1.0 - rayo.x));
  color = mix(color, cara, disco.x);
  color = mix(color, TINTA, disco.y);
  alfa = max(alfa, max(disco.x, disco.y));
  if (alfa < 0.5) discard;
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

export const ANILLOS_VERT = /* glsl */ `
varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

void main() {
  // La geometría del anillo se genera en radios del planeta (1 = su ecuador).
  vRadio = length(position.xy);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

/**
 * Anillos de Saturno de caricatura: bandas planas (C tenue, B crema, la división de Cassini vacía,
 * A dorado con la de Encke como una raya), bordes entintados, la sombra del planeta como una zona
 * de color y la cara no iluminada más apagada.
 */
export const ANILLOS_FRAG = /* glsl */ `
uniform vec3 uSol;
uniform vec3 uCentroPlaneta;
uniform float uRadioPlaneta;
uniform float uAparicion;

varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

${SALIDA_CARICATURA}

void main() {
  float r = vRadio;
  float fw = max(fwidth(r), 1e-5);
  if (r < 1.24 - fw || r > 2.27 + 2.0 * fw || (r > 1.95 + 2.0 * fw && r < 2.03 - 2.0 * fw)) discard;
  vec3 color = r < 1.525 ? vec3(0.78, 0.70, 0.58) : r < 1.95 ? vec3(0.97, 0.90, 0.72) : vec3(0.90, 0.78, 0.56);
  // Aerógrafo: la banda B más clara hacia fuera.
  color *= r > 1.525 && r < 1.95 ? mix(0.94, 1.04, smoothstep(1.55, 1.9, r)) : 1.0;
  vec3 aSol = normalize(uSol - vPosMundo);
  vec3 aCamara = normalize(cameraPosition - vPosMundo);
  vec3 normal = normalize(vNormalMundo);
  // Vista por la cara que no da el Sol: más apagada.
  if (dot(normal, aSol) * dot(normal, aCamara) < 0.0) color *= vec3(0.62, 0.6, 0.72);
  // Sombra del planeta: el rayo hacia el Sol choca con la esfera.
  vec3 oc = vPosMundo - uCentroPlaneta;
  float bq = dot(oc, aSol);
  float cq = dot(oc, oc) - uRadioPlaneta * uRadioPlaneta;
  if (bq < 0.0 && bq * bq - cq > 0.0) color *= vec3(0.42, 0.40, 0.6);
  // Tinta: bordes de fuera y de dentro, la división de Cassini y la de Encke; una línea fina entre C y B.
  float tinta = trazo(r - 1.24, 1.4) + trazo(r - 2.27, 1.6) + trazo(r - 1.95, 1.4) + trazo(r - 2.03, 1.4);
  tinta += 0.8 * trazo(r - 2.21, 0.8) + 0.5 * trazo(r - 1.525, 0.8);
  color = mix(color, TINTA, clamp(tinta, 0.0, 1.0));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * Órbitas como un camino de puntitos, como en las cartas celestes antiguas: más gruesos justo
 * detrás del planeta (por donde acaba de pasar) y con un hueco a su alrededor.
 */
export const ORBITA_VERT = /* glsl */ `
attribute float aAnomalia;
uniform float uAnomaliaPlaneta;
uniform float uHueco;
uniform float uTamano;
// Separación entre puntitos (unidades) y alto del lienzo (px): de lejos, los puntitos no se juntan
// en una raya: se achican y, si ya no caben, no se dibujan.
uniform float uSeparacion;
uniform float uAltoPx;

varying float vAnomalia;

void main() {
  vAnomalia = aAnomalia;
  float detras = mod(uAnomaliaPlaneta - aAnomalia, 6.2831853);
  float delante = mod(aAnomalia - uAnomaliaPlaneta, 6.2831853);
  float estela = exp(-detras / 1.1);
  float hueco = smoothstep(uHueco, 2.0 * uHueco, min(detras, delante));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float separacionPx = uSeparacion * projectionMatrix[1][1] * 0.5 * uAltoPx / max(gl_Position.w, 1e-3);
  gl_PointSize = min(uTamano * (0.8 + 0.9 * estela), 0.42 * separacionPx) * hueco;
  if (separacionPx < 3.0 || gl_PointSize < 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

export const ORBITA_FRAG = /* glsl */ `
uniform vec3 uColor;

${SALIDA_CARICATURA}

void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = salidaCaricatura(uColor);
}
`

/**
 * La región de Cochabamba en el mapa de la Tierra (ver `features/cochabamba/shaders/region.ts`): un
 * cuadrado de mil km alrededor del corazón de flores, pintado desde su textura (altura, humedad,
 * lagos y salares) con colores naturales y el relieve sombreado por el Sol del amanecer, que se
 * funde con el mapa en su borde. Fuera de ella, el resto de los Andes como una cordillera suave
 * (una loma de 4 km a lo largo de la Occidental, con su ladera iluminada). Sin fronteras ni
 * marcas: sólo la tierra, como se ve desde el espacio.
 */
const DESTINO_GLSL = /* glsl */ `
uniform vec3 uOrigen;
uniform vec3 uEste;
uniform vec3 uNorte;
uniform float uRegionListo;
uniform vec3 uSolLocal;

const float RADIO_KM = 6371.0;
const float KM_POR_GRADO = 111.2;

const vec2 OCCIDENTAL[23] = vec2[](
  vec2(-71.0, 10.0), vec2(-73.0, 7.8), vec2(-75.3, 6.0), vec2(-76.3, 3.5), vec2(-77.6, 1.0), vec2(-78.6, -1.5),
  vec2(-79.2, -4.2), vec2(-78.2, -7.2), vec2(-76.8, -9.8), vec2(-75.0, -12.2), vec2(-72.6, -14.4), vec2(-70.6, -16.2),
  vec2(-69.2, -18.2), vec2(-68.4, -20.8), vec2(-68.1, -23.4), vec2(-68.7, -26.2), vec2(-69.6, -28.8), vec2(-70.1, -31.5),
  vec2(-70.1, -34.0), vec2(-70.9, -37.2), vec2(-71.6, -40.8), vec2(-72.3, -45.0), vec2(-73.2, -49.5)
);

${REGION_GLSL}

// Del punto (longitud, latitud) en grados a km en el plano tangente en 'origen'.
vec2 aKm(vec2 lonLat, vec2 origen) {
  return vec2((lonLat.x - origen.x) * cos(radians(origen.y)), lonLat.y - origen.y) * KM_POR_GRADO;
}

float aSegmento(vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(-a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(a + ab * h);
}

// Los Andes fuera de la región: altura (km) de una loma a lo largo de la Occidental.
float alturaAndes(vec2 lonLat) {
  if (lonLat.x < -84.0 || lonLat.x > -60.0 || lonLat.y < -56.0 || lonLat.y > 12.0) return 0.0;
  float d = 1e5;
  for (int i = 0; i < 22; i++) d = min(d, aSegmento(aKm(OCCIDENTAL[i], lonLat), aKm(OCCIDENTAL[i + 1], lonLat)));
  return 4.2 * exp(-(d / 120.0) * (d / 120.0));
}

// Pinta la región (y los Andes de fuera) sobre el color del suelo, sólo sobre tierra firme: en la
// región, desde su textura; se funde con el mapa de dibujo en su borde (con los mismos verdes).
// Devuelve cuánto hay que despejar las nubes del mapa (cerca del destino están las de verdad) y,
// en normalRelieve (plano tangente) y relieve, el relieve con que iluminar.
float pintarRegion(vec3 p, vec2 lonLat, float tierra, inout vec3 color, out vec3 normalRelieve, out float relieve) {
  normalRelieve = vec3(0.0, 0.0, 1.0);
  relieve = 0.0;
  float alOrigen = acos(clamp(dot(p, uOrigen), -1.0, 1.0)) * RADIO_KM;
  // La región aparece al acercarse (cuando un píxel mide menos de unos km): desde lejos, la Tierra
  // de dibujo entera, sin un parche distinto; al bajar, sus detalles surgen en toda la vista.
  float kmPixelGlobo = length(fwidth(p)) * RADIO_KM;
  float cerca = 1.0 - smoothstep(2.2, 5.0, kmPixelGlobo);
  float enRegion = uRegionListo * cerca * (1.0 - smoothstep(0.36 * uLadoRegion, 0.48 * uLadoRegion, alOrigen));
  // Los Andes de fuera de la región: una loma con su relieve (derivadas en pantalla).
  float andes = alturaAndes(lonLat) * (1.0 - enRegion) * cerca;
  if (andes > 0.05) {
    vec2 kmAprox = aKm(lonLat, vec2(-66.24, -17.38));
    color = mix(color, colorRegion(vec4(andes, 0.3, 0.0, 0.0), 0.0, kmAprox, 0.0), smoothstep(0.3, 1.2, andes) * tierra);
    mat2 jacobiana = mat2(dFdx(kmAprox), dFdy(kmAprox));
    if (abs(determinant(jacobiana)) > 1e-8) {
      vec2 gradiente = inverse(transpose(jacobiana)) * vec2(dFdx(andes), dFdy(andes));
      normalRelieve = normalize(vec3(-gradiente * 3.0, 1.0));
    }
    relieve = smoothstep(0.3, 1.2, andes) * tierra;
  }
  // Las nubes del mapa se abren donde están las de verdad (el campo llega a 330 km).
  // Al acercarse, las nubes de dibujo del mapa se abren sobre toda la región: cerca del destino
  // están las de verdad y, más allá, la mañana está despejada (no se mezclan dos clases de nubes).
  float despejado = (1.0 - smoothstep(0.38 * uLadoRegion, 0.5 * uLadoRegion, alOrigen)) * cerca;
  if (enRegion <= 0.001) return despejado;
  vec2 km = vec2(dot(p, uEste), dot(p, uNorte)) * RADIO_KM;
  float kmPorPixel = max(length(fwidth(km)), 1e-4);
  vec4 region = muestraRegion(km);
  float texel = uLadoRegion / 512.0;
  vec2 pendiente = pendienteRegion(km, max(texel, 0.8 * kmPorPixel));
  float llano = 1.0 - smoothstep(0.035, 0.12, length(pendiente));
  float detalle = 1.0 - smoothstep(0.5, 1.5, kmPorPixel);
  vec3 colorR = colorRegion(region, llano, km, detalle);
  // Las tierras bajas húmedas llevan, desde lejos, los verdes del mapa de dibujo que las rodea.
  float selvaLejana = (1.0 - smoothstep(0.7, 1.2, region.r)) * smoothstep(0.55, 0.75, region.g) * smoothstep(250.0, 500.0, alOrigen);
  colorR = mix(colorR, color, selvaLejana);
  // Las sombras de las nubes, azuladas.
  colorR *= mix(vec3(1.0), vec3(0.74, 0.74, 0.9), zona(sombraNubes(km), 0.45) * 0.85);
  color = mix(color, colorR, enRegion * tierra);
  // Relieve exagerado para que se lea desde el espacio, con los filos de detalle de las sierras.
  const float EXAGERACION = 8.0;
  pendiente += pendienteDetalle(km, kmPorPixel) * sierraDetalle(region.r, llano, km);
  vec3 normalR = normalize(vec3(-pendiente * EXAGERACION, 1.0));
  normalRelieve = normalize(mix(normalRelieve, normalR, enRegion));
  relieve = max(relieve, enRegion * tierra);
  return despejado;
}
`

/**
 * La Tierra de caricatura, para verla de cerca al final: océano azul con una franja más clara junto
 * a las costas, continentes verdes con desiertos ocres, casquetes blancos y la costa entintada (del
 * mapa de `utils/texturaTierra.ts`, con el borde algo ondulado); nubes blancas en borreguitos que se
 * mueven; sombra azul de noche con las luces de las ciudades como puntitos amarillos, una raya dorada
 * de atardecer en el terminador y un brillo de barniz en el mar.
 */
export const TIERRA_FRAG = /* glsl */ `
uniform sampler2D uMapa;
uniform sampler2D uPoblacion;
uniform vec3 uSol;
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}
${RUIDO_3D}
${DESTINO_GLSL}

// Muestra un mapa equirectangular sin costura en el antimeridiano: de las dos parametrizaciones
// de la longitud se usa la de derivada continua (si no, el salto de 1 a 0 elige el mip más
// pequeño y deja una línea vertical).
vec3 muestraMapa(sampler2D mapa, float u, float v) {
  float u1 = fract(u);
  float u2 = fract(u + 0.5) - 0.5;
  float uSinCostura = fwidth(u1) < fwidth(u2) + 1e-6 ? u1 : u2;
  return texture2D(mapa, vec2(uSinCostura, v)).rgb;
}

void main() {
  vec3 p = normalize(vLocal);
  float longitud = atan(-p.z, p.x);
  float latitud = asin(clamp(p.y, -1.0, 1.0));
  float coordU = longitud / 6.2831853 + 0.5;
  float coordV = latitud / 3.14159265 + 0.5;
  vec3 mapa = muestraMapa(uMapa, coordU, coordV);
  float latitudGrados = abs(latitud) * 57.29578;

  // Costa: el umbral de la máscara con una ondulación suave (de dibujo, no fractal).
  float costa = mapa.r + 0.18 * (fbm3(p * 7.0) - 0.5);
  float tierra = zona(costa, 0.5);
  float somera = zona(costa, 0.3) * (1.0 - tierra);

  vec3 oceano = mix(vec3(0.20, 0.47, 0.82), vec3(0.38, 0.68, 0.90), somera);
  vec3 suelo = mix(vec3(0.47, 0.74, 0.31), vec3(0.32, 0.58, 0.25), zona(fbm3(p * 5.0 + 17.0), 0.56));
  float arido = zona(mapa.g + 0.3 * (fbm3(p * 4.0 + 8.0) - 0.5), 0.45);
  suelo = mix(suelo, vec3(0.94, 0.79, 0.46), arido);
  suelo = mix(suelo, vec3(0.64, 0.68, 0.48), zona(latitudGrados, 60.0));
  float hielo = max(zona(mapa.b, 0.5), zona(latitudGrados + 5.0 * (fbm3(p * 6.0) - 0.5), 75.0) * tierra);
  float banquisa = zona(latitudGrados + 6.0 * (fbm3(p * 5.0) - 0.5), 80.0);
  vec3 color = mix(oceano, suelo, tierra);
  color = mix(color, vec3(0.97, 0.98, 1.0), max(hielo, banquisa));
  // La costa entintada (del lado de tierra).
  color = mix(color, vec3(0.12, 0.16, 0.26), trazo(costa - 0.5, 1.4) * (1.0 - banquisa));
  vec3 normalRelieve;
  float relieve;
  float despejado = pintarRegion(p, vec2(longitud, latitud) * 57.29578, tierra, color, normalRelieve, relieve);

  // Nubes en borreguitos que se desplazan con los vientos (sobre Cochabamba, cielo despejado).
  vec3 qn = vec3(p.x, p.y * 1.6, p.z) * 3.0 + vec3(uTiempo * 0.006, 0.0, uTiempo * 0.002);
  float nubes = fbm3(qn + 0.35 * vec3(fbm3(qn * 1.7 + 3.1), 0.0, fbm3(qn * 1.7 + 7.3))) - 0.3 * despejado;
  float nube = zona(nubes, 0.6);
  color = mix(color, vec3(0.74, 0.82, 0.94), zona(nubes, 0.58) * (1.0 - nube));
  color = mix(color, vec3(1.0, 0.995, 0.98), nube);

  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  float ndl = dot(n, l);
  float dia = zona(ndl, 0.0);
  float mu = max(dot(n, v), 0.0);
  vec3 iluminado = color * mix(0.86, 1.05, smoothstep(0.0, 0.6, ndl));
  // En la región (y los Andes), el relieve con el Sol en el plano tangente de cada punto.
  if (relieve > 0.001) {
    vec3 solT = normalize(vec3(dot(uSolLocal, uEste), dot(uSolLocal, uNorte), dot(uSolLocal, p)));
    iluminado = mix(iluminado, luzRegion(color, normalRelieve, solT) * mix(0.9, 1.0, smoothstep(0.0, 0.3, ndl)), relieve * (1.0 - nube));
  }
  // Noche: azul de noche con el mapa apenas marcado (con sólo oscurecer, los desiertos salían grises).
  vec3 noche = mix(color * vec3(0.3, 0.33, 0.5), vec3(0.09, 0.12, 0.3), 0.45) * (1.0 + 0.3 * pow(1.0 - mu, 2.0));
  // Luces de las ciudades: puntitos amarillos en tierra poblada, sólo de noche y bajo cielo despejado.
  float poblacion = muestraMapa(uPoblacion, coordU, coordV).r;
  vec2 celda = celdas(p * 45.0);
  float luces = (1.0 - zona(celda.x, 0.22 + 0.1 * celda.y)) * step(0.35, poblacion + 0.4 * celda.y) * step(0.12, poblacion) * tierra * (1.0 - nube);
  noche = mix(noche, vec3(1.0, 0.86, 0.42), luces);
  color = mix(noche, iluminado, dia);
  // Raya dorada de atardecer a lo largo del terminador.
  color = mix(color, vec3(1.0, 0.66, 0.36), trazo(ndl - 0.03, 2.2) * 0.85);
  // Brillo de barniz sobre el mar: pequeño y a medias, con un punto más vivo (grande y opaco era un
  // disco crema pegado al mar), y sólo con la Tierra pequeña en pantalla: de cerca era una mancha
  // redonda en el agua (la normal cambia menos por píxel cuanto más grande se ve).
  vec3 h = normalize(l + v);
  float lejos = smoothstep(0.006, 0.014, length(fwidth(n)));
  float barniz = (0.45 * zona(dot(n, h), 0.9955) + 0.4 * zona(dot(n, h), 0.9992)) * lejos;
  color = mix(color, vec3(1.0, 0.99, 0.95), barniz * dia * (1.0 - tierra) * (1.0 - nube));
  color = mix(color, TINTA, 1.0 - smoothstep(1.2 * fwidth(mu), 2.2 * fwidth(mu), mu));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * Atmósfera de caricatura: un aro plano azul claro alrededor de la Tierra (el pase lo entinta por
 * fuera), sólo por el lado de día. Es una cáscara algo mayor que la Tierra: donde la vista la
 * atraviesa y da con la Tierra, no se dibuja.
 */
export const ATMOSFERA_FRAG = /* glsl */ `
uniform vec3 uSol;
uniform vec3 uCentro;
uniform float uRadio;
uniform float uAparicion;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}

void main() {
  vec3 d = normalize(vPosMundo - cameraPosition);
  vec3 oc = cameraPosition - uCentro;
  float b = dot(oc, d);
  float c = dot(oc, oc) - uRadio * uRadio;
  if (b * b - c > 0.0 && b < 0.0) discard;
  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  float dia = dot(n, l);
  // El aro se afina hacia el lado de noche hasta desaparecer (no se corta de golpe).
  float cercania = sqrt(max(dot(oc, oc) - b * b, 0.0)) / uRadio;
  if (cercania > 1.0 + 0.055 * smoothstep(-0.35, 0.3, dia)) discard;
  vec3 color = mix(vec3(0.46, 0.70, 0.92), vec3(0.66, 0.88, 1.0), smoothstep(-0.25, 0.4, dia));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`
