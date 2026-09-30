import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'

/**
 * Las flores del campo de Tiquipaya (ver `utils/flores.ts`), dibujadas a mano en su quad: pétalos
 * de colores planos con su tinta fina, un poco de aerógrafo, la luz de la mañana (lo que mira al
 * Sol, más claro) y la brisa, que las mece despacio (sin latir). El contorno grueso de las que
 * están cerca lo pone el pase de dibujo (saltos de profundidad).
 */

/** La brisa: un vaivén suave que recorre el campo (en metros de desplazamiento por metro de altura). */
const BRISA_GLSL = /* glsl */ `
uniform float uTiempo;

vec2 brisa(vec2 xz) {
  float fase = dot(xz, vec2(0.23, 0.11)) - uTiempo * 0.9;
  float racha = 0.65 + 0.35 * sin(dot(xz, vec2(0.031, -0.017)) - uTiempo * 0.35);
  return vec2(0.8, 0.45) * (0.7 * sin(fase) + 0.3 * sin(fase * 2.3 + 1.7)) * racha;
}
`

/**
 * Cabezas de flor. Los girasoles, las gerberas y los lirios tienen cara (un disco que mira hacia su
 * rumbo e inclinación; los girasoles, al Sol); las rosas, clavelinas y gipsófila son carteles de
 * cara a la cámara, y las bocas de dragón, espigas que giran sólo en vertical.
 */
export const CABEZA_VERT = /* glsl */ `
attribute vec4 aBase;
attribute vec4 aForma;
attribute vec2 aCara;

uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uPixelesPorRadian;

varying vec2 vLocal;
varying float vTipo;
varying float vVariante;
varying float vDorso;
varying float vLuz;
varying vec2 vSolEnFlor;
varying float vDetalle;
varying float vLejos;

${BRISA_GLSL}

void main() {
  float tipo = aForma.y;
  float tamano = aForma.x;
  vec3 base = aBase.xyz;
  float altura = aBase.w;
  // La brisa mece más a las flores pequeñas que a los girasoles, pesados.
  float mecida = tipo < 0.5 ? 0.018 : 0.035;
  vec2 empuje = brisa(base.xz + aForma.w * 3.0) * mecida * altura;
  vec3 centro = base + vec3(empuje.x, altura - 0.25 * dot(empuje, empuje) / max(altura, 0.1), empuje.y);

  float distancia = distance(centro, uCamara);
  // Radio en pantalla: por debajo de un píxel y pico la flor no se dibuja (de lejos, el suelo ya
  // lleva su color) y entre eso y unos píxeles crece (al bajar, las flores aparecen sin saltos).
  float pixeles = tamano / max(distancia, 1e-3) * uPixelesPorRadian;
  float aparece = smoothstep(1.2, 3.5, pixeles);
  vDetalle = smoothstep(7.0, 16.0, pixeles);
  vLejos = 1.0 - smoothstep(2.5, 9.0, pixeles);
  if (aparece < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  tamano *= aparece;

  vec3 derechaCam = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
  vec3 arribaCam = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
  vec3 ejeX;
  vec3 ejeY;
  vec2 escala = vec2(tamano);
  vDorso = 0.0;
  if (tipo < 2.5) {
    // Cara orientada: mira hacia su rumbo (desde el norte, al este) e inclinación.
    float rumbo = aCara.x;
    float inclinacion = aCara.y;
    vec3 normal = vec3(sin(rumbo) * cos(inclinacion), sin(inclinacion), -cos(rumbo) * cos(inclinacion));
    normal.xz += empuje * 0.8;
    normal = normalize(normal);
    ejeX = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    ejeY = cross(normal, ejeX);
    vDorso = step(dot(normal, uCamara - centro), 0.0);
    vLuz = dot(normal, uSol);
  } else if ((tipo > 4.5 && tipo < 5.5) || (tipo > 6.5 && tipo < 7.5)) {
    // Espigas (boca de dragón) y capullos de lirio: giran sólo alrededor de la vertical (el capullo,
    // algo inclinado).
    vec3 aCamara = uCamara - centro;
    ejeX = normalize(vec3(-aCamara.z, 0.0, aCamara.x));
    ejeY = vec3(0.0, 1.0, 0.0);
    float alargado = tipo < 6.0 ? 3.2 : 3.0;
    if (tipo > 6.5) ejeY = normalize(ejeY + ejeX * (aForma.w - 0.5) * 0.5);
    escala = vec2(tamano, tamano * alargado);
    centro -= ejeY * tamano * alargado * 0.5;
    vLuz = dot(normalize(vec3(aCamara.x, 0.0, aCamara.z)), uSol);
  } else {
    ejeX = derechaCam;
    ejeY = arribaCam;
    vLuz = 0.3;
    centro += normalize(uCamara - centro) * tamano * 0.4;
  }
  vSolEnFlor = vec2(dot(uSol, ejeX), dot(uSol, ejeY));
  vLocal = position.xy;
  vTipo = tipo;
  vVariante = aForma.z;
  vec3 esquina = centro + ejeX * position.x * escala.x + ejeY * position.y * escala.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(esquina, 1.0);
}
`

export const CABEZA_FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vTipo;
varying float vVariante;
varying float vDorso;
varying float vLuz;
varying vec2 vSolEnFlor;
varying float vDetalle;
varying float vLejos;

${SALIDA_CARICATURA}

const float PI = 3.14159265;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Capa de dibujo: la pinta encima (relleno y su línea) dada su distancia con signo en unidades
// del quad (negativa dentro). La línea es de tinta en el contorno de la flor y del color del pétalo
// oscurecido dentro de ella; sólo con la flor grande en pantalla.
void capaConLinea(inout vec4 lienzo, float d, vec3 color, vec3 linea, float lineaPx) {
  float w = max(fwidth(d), 1e-5);
  float dentro = 1.0 - smoothstep(-w, w, d);
  float borde = (1.0 - smoothstep(lineaPx * 0.5 * w, (lineaPx * 0.5 + 1.0) * w, abs(d))) * vDetalle;
  lienzo.rgb = mix(lienzo.rgb, color, dentro);
  lienzo.rgb = mix(lienzo.rgb, linea, borde);
  lienzo.a = max(lienzo.a, max(dentro, borde));
}

void capa(inout vec4 lienzo, float d, vec3 color, float tintaPx) {
  capaConLinea(lienzo, d, color, TINTA, tintaPx);
}

// Pétalos en corona: n pétalos entre los radios r0 y r1, de medio ancho máximo 'ancho' (en unidades
// del quad), puntiagudos; 'giro' desplaza la corona. Distancia aproximada con signo y, en 'lado',
// la posición a lo ancho del pétalo (-1..1) y en 'largo', a lo largo (0..1).
float corona(vec2 p, float n, float r0, float r1, float ancho, float giro, out float lado, out float largo) {
  float r = length(p);
  float angulo = atan(p.y, p.x) - giro;
  float sector = 2.0 * PI / n;
  float k = floor(angulo / sector + 0.5);
  float delta = angulo - k * sector;
  largo = clamp((r - r0) / (r1 - r0), 0.0, 1.0);
  float semiancho = ancho * pow(sin(PI * clamp(largo * 0.92 + 0.04, 0.0, 1.0)), 0.7) * (1.0 - 0.35 * largo);
  float a = delta * r;
  lado = a / max(semiancho, 1e-4);
  float d = abs(a) - semiancho;
  return max(d, max(r0 - r, r - r1));
}

vec4 girasol(vec2 p) {
  vec4 lienzo = vec4(0.0);
  float lado;
  float largo;
  if (vDorso > 0.5) {
    // Por detrás: las puntas de los pétalos y el cáliz verde con sus sépalos.
    float d1 = corona(p, 18.0, 0.3, 0.98, 0.2, 0.0, lado, largo);
    capa(lienzo, d1, vec3(0.93, 0.74, 0.22), 1.2);
    float dSepalos = corona(p, 14.0, 0.2, 0.72, 0.2, 0.1, lado, largo);
    capa(lienzo, min(dSepalos, length(p) - 0.5), vec3(0.36, 0.53, 0.22), 1.2);
    return lienzo;
  }
  float d1 = corona(p, 18.0, 0.28, 1.0, 0.2, 0.0, lado, largo);
  capa(lienzo, d1, mix(vec3(0.95, 0.66, 0.1), vec3(0.99, 0.76, 0.16), largo), 1.2);
  float d2 = corona(p, 18.0, 0.28, 0.9, 0.18, PI / 18.0, lado, largo);
  vec3 petalo = mix(vec3(1.0, 0.8, 0.2), vec3(1.0, 0.9, 0.42), largo);
  petalo = mix(petalo, petalo * 0.88, smoothstep(0.3, 1.0, abs(lado)));
  capaConLinea(lienzo, d2, petalo, vec3(0.78, 0.5, 0.08), 1.0);
  // Centro: pardo con un aro más claro y las semillas.
  float r = length(p);
  vec3 centro = mix(vec3(0.36, 0.2, 0.09), vec3(0.54, 0.33, 0.12), smoothstep(0.2, 0.32, r));
  vec2 celda = floor(p * 16.0);
  float semilla = 1.0 - smoothstep(0.2, 0.34, length(fract(p * 16.0) - 0.5 + 0.2 * (vec2(hash21(celda), hash21(celda + 3.1)) - 0.5)));
  centro = mix(centro, vec3(0.58, 0.38, 0.16), semilla * 0.55 * vDetalle * (1.0 - smoothstep(0.26, 0.34, r)));
  capa(lienzo, r - 0.33, centro, 1.4);
  return lienzo;
}

// Pétalos en tira (gerbera): n pétalos entre r0 y el largo r1, de medio ancho casi constante, la
// punta redonda con una muesca pequeña. En 'lado', la posición a lo ancho (-1..1); en 'largo', a lo
// largo (0..1); en 'indice', el número de pétalo.
float tiras(vec2 p, float n, float r0, float r1, float semiancho, float giro, out float lado, out float largo, out float indice) {
  float r = length(p);
  float sector = 6.2831853 / n;
  float angulo = atan(p.y, p.x) - giro;
  indice = floor(angulo / sector + 0.5);
  float delta = angulo - indice * sector;
  float x = delta * r;
  // Cada pétalo, algo más o menos largo.
  float largoPetalo = r1 * (0.95 + 0.05 * sin(indice * 3.7 + giro * 5.0));
  float w = semiancho * (0.72 + 0.28 * smoothstep(r0, r0 + 0.3, r));
  lado = x / w;
  largo = clamp((r - r0) / (largoPetalo - r0), 0.0, 1.0);
  float y = r - (largoPetalo - w);
  float d = y > 0.0 ? length(vec2(x, y)) - w : abs(x) - w;
  // La muesca de la punta.
  d = max(d, -(length(vec2(x, r - largoPetalo - 0.004)) - w * 0.22));
  return max(d, r0 - r);
}

vec4 gerbera(vec2 p) {
  vec4 lienzo = vec4(0.0);
  float lado;
  float largo;
  float indice;
  // Como la del ramo: rosa muy pálido (casi blanco con un toque lila), más rosado junto al centro,
  // con dos coronas de pétalos en tira; el centro, un disco casi negro granate rodeado de un aro
  // malva de florecillas con motas de polen y un collar de pétalos cortos.
  float giro = vVariante * 6.2831853;
  vec3 palido = vVariante < 0.65 ? vec3(0.99, 0.86, 0.9) : vec3(0.98, 0.8, 0.87);
  vec3 rosado = vec3(0.95, 0.66, 0.78);
  vec3 linea = vec3(0.86, 0.6, 0.72);
  for (int capaP = 0; capaP < 2; capaP++) {
    float interior = float(capaP);
    float d = tiras(p, 30.0, 0.26, mix(1.0, 0.84, interior), mix(0.085, 0.078, interior), giro + interior * 0.1047, lado, largo, indice);
    vec3 color = mix(rosado, palido, smoothstep(0.02, 0.4, largo));
    color *= 1.0 - 0.04 * interior + 0.03 * hash21(vec2(indice, interior));
    // Las rayitas del pétalo, a lo largo.
    color = mix(color, color * 0.92, (1.0 - smoothstep(0.08, 0.2, abs(abs(lado) - 0.45))) * smoothstep(0.1, 0.3, largo) * vDetalle * 0.7);
    color = mix(color, mix(color, vec3(1.0), 0.35), (1.0 - smoothstep(0.05, 0.16, abs(lado))) * smoothstep(0.3, 0.7, largo) * vDetalle);
    capaConLinea(lienzo, d, color, linea, 0.7);
  }
  float r = length(p);
  float a = atan(p.y, p.x);
  // El collar de pétalos cortos, rosa claro.
  float dCollar = corona(p, 44.0, 0.19, 0.31, 0.026, giro, lado, largo);
  capaConLinea(lienzo, dCollar, vec3(0.97, 0.74, 0.84), vec3(0.84, 0.52, 0.66), 0.5);
  // El aro de florecillas: malva con granitos y motas de polen crema.
  vec3 aro = mix(vec3(0.62, 0.3, 0.48), vec3(0.8, 0.46, 0.64), smoothstep(0.13, 0.25, r));
  vec2 polar = vec2(a * 6.0, r * 38.0);
  vec2 celda = floor(polar);
  float grano = 1.0 - smoothstep(0.18, 0.4, length(fract(polar) - 0.5 + 0.25 * (vec2(hash21(celda), hash21(celda + 1.7)) - 0.5)));
  aro = mix(aro, aro * 1.18, grano * vDetalle * 0.7);
  float polen = step(0.72, hash21(celda + 5.3)) * grano;
  aro = mix(aro, vec3(1.0, 0.9, 0.62), polen * vDetalle * 0.8);
  capaConLinea(lienzo, r - 0.24 - 0.008 * sin(a * 9.0 + giro), aro, vec3(0.5, 0.2, 0.36), 0.5);
  // El centro, casi negro granate, algo irregular.
  vec3 centro = mix(vec3(0.16, 0.04, 0.1), vec3(0.3, 0.08, 0.18), smoothstep(0.02, 0.12, r));
  capaConLinea(lienzo, r - 0.12 - 0.012 * sin(a * 3.0 + giro) - 0.006 * sin(a * 7.0), centro, vec3(0.12, 0.03, 0.07), 0.4);
  return lienzo;
}

vec4 lirio(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Lirio oriental del ramo (tipo stargazer): seis tépalos puntiagudos, blancos rosados con un rubor
  // rosa que sube por el centro y se aclara hacia la punta (que se curva hacia atrás), la garganta
  // verde, alguna motita, el nervio; seis estambres con sus anteras color óxido y el pistilo.
  float giro = vVariante * 3.14159;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 blanco = vec3(1.0, 0.95, 0.96);
  vec3 rubor = vec3(0.95, 0.6, 0.74);
  vec3 linea = vec3(0.84, 0.64, 0.72);
  for (int vuelta = 0; vuelta < 2; vuelta++) {
    float fv = float(vuelta);
    float sector = 2.0944;
    float ang = a - giro - fv * 1.0472;
    float k = floor(ang / sector + 0.5);
    float delta = ang - k * sector;
    float x = delta * r;
    float t = clamp(r / (1.0 - 0.05 * fv), 0.0, 1.0);
    // Ancho: estrecho en la base, el máximo hacia el 40 % y la punta aguda.
    float w = (fv > 0.5 ? 0.31 : 0.27) * pow(sin(3.14159 * pow(t, 0.62)), 0.85);
    // El borde de los de dentro, ondulado.
    w += fv * 0.018 * sin(t * 34.0 + k) * smoothstep(0.25, 0.7, t);
    float d = max(abs(x) - w, r - (1.0 - 0.05 * fv));
    float lado = abs(x) / max(w, 1e-3);
    vec3 color = mix(blanco, rubor, (1.0 - smoothstep(0.1, 0.62, lado)) * (1.0 - smoothstep(0.5, 0.92, t)) * 0.9);
    // La garganta verde y la punta (curvada) más clara.
    color = mix(color, vec3(0.78, 0.88, 0.5), 1.0 - smoothstep(0.08, 0.24, t));
    color = mix(color, vec3(1.0, 0.98, 0.98), smoothstep(0.78, 0.96, t) * 0.7);
    // El nervio, rosa más intenso.
    color = mix(color, vec3(0.88, 0.42, 0.6), (1.0 - smoothstep(0.03, 0.09, lado)) * smoothstep(0.18, 0.3, t) * (1.0 - smoothstep(0.6, 0.85, t)) * vDetalle);
    // Alguna motita.
    vec2 celda = floor(p * 15.0 + fv * 7.0);
    float mota = step(0.84, hash21(celda)) * (1.0 - smoothstep(0.07, 0.16, length(fract(p * 15.0 + fv * 7.0) - 0.5))) * step(0.22, t) * (1.0 - smoothstep(0.42, 0.6, t)) * (1.0 - smoothstep(0.35, 0.6, lado));
    color = mix(color, vec3(0.78, 0.22, 0.45), mota * vDetalle);
    // El pliegue donde la punta se curva hacia atrás.
    color = mix(color, color * 0.9, (1.0 - smoothstep(0.0, 0.03, abs(t - 0.8))) * vDetalle * 0.6);
    capaConLinea(lienzo, d, color, linea, 0.8);
  }
  // Estambres: seis hilos verde claro con la antera alargada, de través, color óxido.
  float ang = a - giro - 0.5236;
  float sector = 1.0472;
  float k = floor(ang / sector + 0.5);
  float delta = (ang - k * sector) * r;
  float largoHilo = 0.58 + 0.06 * sin(k * 2.1);
  float hilo = (1.0 - smoothstep(0.008, 0.02, abs(delta))) * step(0.08, r) * step(r, largoHilo);
  lienzo.rgb = mix(lienzo.rgb, vec3(0.78, 0.88, 0.58), hilo * vDetalle);
  float antera = length(vec2(delta, r - largoHilo) / vec2(0.07, 0.024)) - 1.0;
  lienzo.rgb = mix(lienzo.rgb, vec3(0.64, 0.3, 0.14), (1.0 - smoothstep(-0.25, 0.12, antera)) * vDetalle);
  // El pistilo, más largo, con su estigma de tres lóbulos.
  float delta2 = (a - giro) * r;
  float pistilo = (1.0 - smoothstep(0.01, 0.024, abs(delta2))) * step(r, 0.68);
  lienzo.rgb = mix(lienzo.rgb, vec3(0.64, 0.8, 0.46), pistilo * vDetalle);
  vec2 enEstigma = p - vec2(cos(giro), sin(giro)) * 0.7;
  lienzo.rgb = mix(lienzo.rgb, vec3(0.5, 0.36, 0.42), (1.0 - smoothstep(0.035, 0.05, length(enEstigma))) * vDetalle);
  return lienzo;
}

vec4 capulloLirio(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Capullo de lirio: largo y cerrado, con la barriga hacia arriba y la punta aguda, verde abajo y
  // crema rosado arriba, con las tres costuras de los tépalos y el brillo del lado del Sol.
  float t = p.y * 0.5 + 0.5;
  float w = 0.62 * pow(sin(3.14159 * clamp(pow(t, 0.8), 0.0, 1.0)), 0.7) * (1.0 - 0.15 * t);
  w = max(w, 0.16 * (1.0 - smoothstep(0.0, 0.15, t)));
  float d = abs(p.x) - w;
  vec3 color = mix(vec3(0.42, 0.62, 0.32), vec3(0.8, 0.88, 0.64), smoothstep(0.1, 0.55, t));
  color = mix(color, vec3(0.96, 0.8, 0.84), smoothstep(0.45, 0.85, t) * (0.5 + 0.5 * vVariante));
  float lado = p.x / max(w, 1e-3);
  float costura = (1.0 - smoothstep(0.03, 0.08, abs(abs(lado) - 0.42))) * smoothstep(0.2, 0.35, t);
  color = mix(color, vec3(0.5, 0.66, 0.38), costura * 0.6 * vDetalle);
  color *= 0.84 + 0.22 * smoothstep(-0.8, 0.6, lado * sign(vSolEnFlor.x + 1e-4));
  capaConLinea(lienzo, d, color, vec3(0.4, 0.55, 0.3), 0.8);
  return lienzo;
}

// Pétalo de rosa: un abanico redondeado desde el centro c hacia el ángulo 'a', de largo 'largo' y
// medio ancho angular 'abre' (rad), con la punta redonda y algo ondulada. Distancia aproximada con
// signo; en 't', lo lejos del centro (0..1) y en 'lado', la posición a lo ancho (-1..1).
float petaloRosa(vec2 p, vec2 c, float a, float largo, float abre, out float t, out float lado) {
  vec2 q = p - c;
  float r = length(q);
  float angulo = atan(q.y, q.x) - a;
  angulo = mod(angulo + PI, 2.0 * PI) - PI;
  lado = angulo / abre;
  float borde = largo * (1.0 - 0.2 * lado * lado) * (1.0 + 0.035 * sin(lado * 4.0 + a * 3.0));
  t = r / largo;
  return max(r - borde, (abs(angulo) - abre) * max(r, 0.05));
}

vec4 rosa(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Como las rosas del ramo: fucsia, rosa claro o melocotón. Sépalos verdes por detrás, tres
  // vueltas de pétalos (de fuera adentro y, en cada una, de atrás adelante), cada pétalo oscuro en
  // su base y claro hacia el borde enrollado, y el capullo apretado en espiral en el centro.
  // Como las del ramo: rosa claro (las más), fucsia, lila rosado o rubor pálido.
  vec3 color = vVariante < 0.45 ? vec3(0.97, 0.62, 0.72) : vVariante < 0.75 ? vec3(0.92, 0.24, 0.54) : vVariante < 0.9 ? vec3(0.86, 0.52, 0.76) : vec3(0.99, 0.8, 0.84);
  vec3 oscuro = color * vec3(0.8, 0.6, 0.7);
  vec3 claro = mix(color, vec3(1.0, 0.95, 0.96), 0.5);
  vec3 linea = color * vec3(0.66, 0.5, 0.6);
  vec2 sol = normalize(vSolEnFlor + 1e-4);
  float giro = vVariante * 6.2831853;

  // Sépalos: cinco puntas verdes que asoman entre los pétalos de fuera.
  float r = length(p);
  float angulo = atan(p.y, p.x) - giro * 0.3 + 0.6;
  float sector = 1.2566371;
  float delta = (angulo - floor(angulo / sector + 0.5) * sector) * r;
  capaConLinea(lienzo, max(abs(delta) - 0.1 * (1.0 - r), r - 1.0), vec3(0.38, 0.58, 0.3), vec3(0.22, 0.36, 0.18), 0.8);

  for (int vuelta = 0; vuelta < 3; vuelta++) {
    float fv = float(vuelta);
    int n = vuelta == 0 ? 5 : vuelta == 1 ? 4 : 3;
    float largo = mix(0.9, 0.44, fv * 0.5);
    float abre = PI / float(n) * mix(1.3, 1.5, fv * 0.5);
    vec2 c = vec2(0.0, -0.05 + 0.055 * fv);
    for (int k = 0; k < 5; k++) {
      if (k >= n) break;
      // De atrás (arriba) adelante (abajo): arriba, y luego a un lado y a otro bajando.
      float paso = ceil(float(k) * 0.5) * (mod(float(k), 2.0) < 0.5 ? 1.0 : -1.0);
      float a = 1.5708 + giro * 0.2 + fv * 0.7 + paso * 6.2831853 / float(n);
      float t;
      float lado;
      float d = petaloRosa(p, c, a, largo, abre, t, lado);
      vec3 relleno = mix(oscuro, color, smoothstep(0.12, 0.72, t));
      relleno = mix(relleno, color * 0.86, smoothstep(0.55, 1.0, abs(lado)) * 0.5);
      relleno *= 0.9 + 0.16 * dot(vec2(cos(a), sin(a)), sol);
      capaConLinea(lienzo, d, relleno, linea, 0.9);
      // El borde enrollado: una franja clara junto a la punta, con su sombra por dentro.
      float dentro = step(d, 0.0);
      float enBorde = (1.0 - smoothstep(0.035, 0.07, -d)) * smoothstep(0.55, 0.8, t) * dentro;
      lienzo.rgb = mix(lienzo.rgb, claro, enBorde * mix(0.5, 0.9, vDetalle));
      float sombraBorde = (1.0 - smoothstep(0.02, 0.05, abs(-d - 0.085))) * smoothstep(0.6, 0.85, t) * dentro;
      lienzo.rgb = mix(lienzo.rgb, oscuro, sombraBorde * 0.45 * vDetalle);
    }
  }

  // El capullo: pétalos apretados en espiral, más oscuro hacia dentro.
  vec2 q = p - vec2(0.0, 0.1);
  float rc = length(q);
  float ac = atan(q.y, q.x) + giro;
  vec3 capullo = mix(oscuro, mix(color, claro, 0.25), smoothstep(0.02, 0.26, rc));
  capaConLinea(lienzo, rc - 0.25 - 0.02 * sin(ac * 3.0), capullo, linea, 0.9);
  float espiral = abs(fract(rc * 9.0 - ac / (2.0 * PI)) - 0.5) * 2.0;
  float vueltaEspiral = (1.0 - smoothstep(0.12, 0.28, espiral)) * step(rc, 0.24) * smoothstep(0.02, 0.05, rc);
  lienzo.rgb = mix(lienzo.rgb, linea, vueltaEspiral * vDetalle);
  lienzo.rgb = mix(lienzo.rgb, claro, (1.0 - smoothstep(0.12, 0.3, abs(fract(rc * 9.0 - ac / (2.0 * PI) + 0.35) - 0.5) * 2.0)) * step(rc, 0.22) * 0.5 * vDetalle);
  // Brillo del lado del Sol, en el borde del capullo.
  float brillo = (1.0 - smoothstep(0.05, 0.1, length(q - sol * 0.2))) * step(rc, 0.26);
  lienzo.rgb = mix(lienzo.rgb, mix(color, vec3(1.0), 0.65), brillo * 0.8 * vDetalle);
  return lienzo;
}

// Florecilla de clavel de poeta en su marco (radio 1): cinco pétalos en abanico, anchos en la punta,
// con la muesca entre pétalo y pétalo y el borde dentado, como cortado con tijeras de picos. En
// 'enPetalo', la posición a lo ancho del pétalo (-1..1) y en 'rf', la distancia al centro.
float florecillaClavel(vec2 f, float giro, out float rf, out float enPetalo, out float af) {
  rf = length(f);
  af = atan(f.y, f.x) + giro;
  float sector = 1.2566371;
  enPetalo = (af - floor(af / sector + 0.5) * sector) / (sector * 0.5);
  // Seis dientes por pétalo, la punta de uno en el centro.
  float dientes = abs(fract(enPetalo * 3.0 + 0.5) - 0.5) * 2.0;
  return rf - (1.0 - 0.26 * pow(abs(enPetalo), 4.0) - 0.1 * dientes);
}

vec4 clavelina(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Clavel de poeta (sweet william), como en el ramo: una cabeza suelta de pocas florecillas grandes
  // de cinco pétalos dentados, unas de cara y otras de canto, sobre una barba de brácteas verdes
  // finas como agujas que asoman por todos lados. Cereza con el ojo granate, granate aterciopelado
  // con el borde y el ojo blancos, fucsia con el aro blanco o morado con el centro blanco.
  float giro = vVariante * 6.2831853;
  float espejo = fract(vVariante * 13.7) < 0.5 ? -1.0 : 1.0;
  p.x *= espejo;
  // La barba: agujas verdes desde el pie de la cabeza, abiertas hacia los lados y hacia abajo, y
  // alguna entre las florecillas.
  vec2 pie = vec2(0.0, -0.08);
  float barba = 1e3;
  float puntaBarba = 0.0;
  for (int k = 0; k < 15; k++) {
    float fk = float(k);
    float azar = hash21(vec2(fk, vVariante * 9.1));
    float ang = k < 12 ? mix(3.5, 5.95, (fk + 0.5 * azar) / 12.0) : mix(0.5, 2.6, (fk - 12.0 + azar) / 3.0);
    vec2 dir = vec2(cos(ang), sin(ang));
    float largo = k < 12 ? 0.72 + 0.26 * azar : 0.82;
    vec2 ap = p - pie - dir * 0.12;
    float h = clamp(dot(ap, dir) / largo, 0.0, 1.0);
    float dAguja = length(ap - dir * largo * h) - mix(0.035, 0.008, h);
    if (dAguja < barba) {
      barba = dAguja;
      puntaBarba = h;
    }
  }
  vec3 verdeBarba = mix(vec3(0.4, 0.58, 0.26), vec3(0.66, 0.78, 0.44), puntaBarba);
  capaConLinea(lienzo, barba, verdeBarba, vec3(0.28, 0.42, 0.18), 0.5 * vDetalle);

  float variedad = fract(vVariante * 7.31);
  vec3 petalo;
  vec3 ojo;
  float bordeBlanco = 0.0;
  float centroBlanco = 0.0;
  if (variedad < 0.4) {
    petalo = vec3(0.9, 0.16, 0.42);
    ojo = vec3(0.58, 0.04, 0.2);
  } else if (variedad < 0.65) {
    petalo = vec3(0.52, 0.05, 0.19);
    ojo = vec3(0.34, 0.02, 0.12);
    bordeBlanco = 1.0;
    centroBlanco = 1.0;
  } else if (variedad < 0.85) {
    petalo = vec3(0.9, 0.3, 0.6);
    ojo = vec3(0.62, 0.1, 0.36);
    bordeBlanco = 0.55;
  } else {
    petalo = vec3(0.58, 0.2, 0.66);
    ojo = vec3(0.4, 0.1, 0.5);
    centroBlanco = 1.0;
  }
  // Las florecillas, de atrás (arriba, de canto) adelante (abajo, de cara).
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float fila = i < 3 ? 0.0 : i < 5 ? 1.0 : 2.0;
    float enFila = i < 3 ? fi - 1.0 : i < 5 ? fi - 3.5 : fi - 5.5;
    vec2 c = vec2(enFila * mix(0.42, 0.46, fila * 0.5) + 0.08 * fila, mix(0.36, -0.16, fila * 0.5));
    c += 0.07 * (vec2(hash21(vec2(fi, vVariante * 5.3)), hash21(vec2(fi + 9.0, vVariante * 3.1))) - 0.5);
    float radio = mix(0.3, 0.35, fila * 0.5) * (0.92 + 0.14 * hash21(vec2(fi + 2.0, vVariante)));
    // De canto: aplastada en vertical e inclinada un poco.
    float aplastado = mix(0.56, 0.94, fila * 0.5);
    float inclina = (hash21(vec2(fi + 4.0, vVariante * 2.3)) - 0.5) * 0.6;
    vec2 f = p - c;
    f = vec2(cos(inclina) * f.x + sin(inclina) * f.y, -sin(inclina) * f.x + cos(inclina) * f.y);
    f = vec2(f.x, f.y / aplastado) / radio;
    float rf;
    float enPetalo;
    float af;
    float d = florecillaClavel(f, giro + fi * 1.9, rf, enPetalo, af) * radio * aplastado;
    float borde = rf - d / (radio * aplastado);
    vec3 color = petalo * (0.94 + 0.1 * hash21(vec2(fi, 3.3)));
    // Terciopelo: más oscuro hacia la base del pétalo, con rayitas finas a lo largo.
    color *= mix(0.84, 1.0, smoothstep(0.2, 0.7, rf));
    color *= 1.0 - 0.07 * (0.5 + 0.5 * sin(af * 34.0)) * vDetalle * smoothstep(0.3, 0.5, rf);
    // La muesca entre pétalos, una raya oscura desde el ojo.
    float entre = (1.0 - smoothstep(0.03, 0.08, (1.0 - abs(enPetalo)) * rf * 0.63)) * smoothstep(0.28, 0.45, rf);
    color = mix(color, ojo * 0.8, entre * mix(0.5, 0.9, vDetalle));
    // El borde de picos blanco (granate) o pálido (fucsia).
    color = mix(color, vec3(1.0, 0.95, 0.97), bordeBlanco * smoothstep(borde - 0.24, borde - 0.12, rf));
    // El ojo: granate oscuro (o blanco en los de centro blanco), con los pelillos.
    float enOjo = 1.0 - smoothstep(0.3, 0.36, rf + 0.05 * abs(sin(af * 2.5)));
    color = mix(color, mix(ojo, vec3(1.0, 0.96, 0.98), centroBlanco), enOjo);
    float pelillo = (1.0 - smoothstep(0.15, 0.35, abs(fract(af * 2.2) - 0.5))) * step(0.1, rf) * (1.0 - smoothstep(0.3, 0.4, rf));
    color = mix(color, mix(vec3(1.0, 0.9, 0.95), ojo, centroBlanco), pelillo * 0.6 * vDetalle);
    // El centro: blanco (o, en los de centro blanco, un puntito oscuro).
    color = mix(color, mix(vec3(1.0, 0.94, 0.96), ojo * 0.8, centroBlanco), 1.0 - smoothstep(0.06, 0.1, rf));
    capaConLinea(lienzo, d, color, mix(petalo * 0.55, ojo * 0.7, 0.5), 0.6);
    // Dos estambres blancos, cortos, que salen del centro algo curvados (sólo de cerca).
    for (int e = 0; e < 2; e++) {
      float ae = fi * 2.1 + float(e) * 2.6;
      vec2 punta = vec2(cos(ae), sin(ae)) * 0.44;
      float h = dot(f, punta) / dot(punta, punta);
      vec2 curva = punta * clamp(h, 0.0, 1.0) + vec2(-punta.y, punta.x) * 0.35 * clamp(h, 0.0, 1.0) * (1.0 - clamp(h, 0.0, 1.0));
      float estambre = (1.0 - smoothstep(0.022, 0.045, length(f - curva))) * step(0.0, h) * step(h, 1.0);
      lienzo.rgb = mix(lienzo.rgb, vec3(1.0, 0.98, 0.99), estambre * vDetalle * step(d, 0.0));
    }
  }
  return lienzo;
}

// Unión suave de dos distancias (radio k).
float unionSuave(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec4 bocaDeDragon(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Boca de dragón, como las del ramo: abajo, las florecillas abiertas, una a cada lado, cada una
  // una capucha mullida (el labio de arriba, con su muesca) sobre la bolsa del labio de abajo, que
  // cierra la boca, y el tubo pálido que sale del tallo; arriba, los botones verde salvia, peludos,
  // cada vez más pequeños (los de abajo ya enseñan el color). Malva, lila, crema o melocotón.
  // En unidades del medio ancho (el quad es 3,2 veces más alto que ancho): los círculos, redondos.
  vec2 s = vec2(p.x, p.y * 3.2);
  float variedad = fract(vVariante * 5.3);
  vec3 color = variedad < 0.4 ? vec3(0.7, 0.36, 0.56) : variedad < 0.62 ? vec3(0.76, 0.52, 0.84) : variedad < 0.84 ? vec3(0.99, 0.9, 0.86) : vec3(0.98, 0.74, 0.7);
  vec3 palido = mix(color, vec3(1.0, 0.96, 0.97), 0.5);
  vec3 linea = color * vec3(0.58, 0.46, 0.58);
  float luz = sign(vSolEnFlor.x + 1e-4);
  // El tallo, que se afina hacia la punta.
  capaConLinea(lienzo, max(abs(s.x) - mix(0.08, 0.035, s.y * 0.16 + 0.5), s.y - 3.0), vec3(0.46, 0.62, 0.32), vec3(0.3, 0.44, 0.22), 0.4);
  // Los botones, de la punta hacia abajo (los de abajo, delante): vainas sueltas a un lado y a otro.
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    float t = fk / 7.0;
    float lado = mod(fk, 2.0) < 0.5 ? -1.0 : 1.0;
    float tam = mix(0.11, 0.2, t);
    vec2 c = vec2(lado * mix(0.05, 0.17, t), mix(3.0, 1.12, t));
    // Una gota que apunta hacia arriba y hacia fuera.
    float ang = lado * mix(0.2, 0.6, t);
    vec2 q = s - c;
    q = vec2(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y) / tam;
    float dBoton = (length(vec2(q.x * (1.0 + 0.7 * max(q.y, 0.0)), q.y * 0.72)) - 1.0) * tam * 0.72;
    vec3 verde = mix(vec3(0.56, 0.68, 0.42), vec3(0.8, 0.87, 0.64), smoothstep(-0.9, 0.9, q.x * luz));
    // El cáliz, más oscuro abajo, con sus puntas.
    float caliz = 1.0 - smoothstep(-0.7, -0.3, q.y - 0.2 * abs(sin(q.x * 4.0)));
    verde = mix(verde, vec3(0.4, 0.54, 0.28), caliz * 0.7);
    // Los dos de abajo, con la punta del color de la flor.
    verde = mix(verde, mix(color, palido, 0.3), smoothstep(0.75, 1.0, t) * smoothstep(0.2, 0.8, q.y) * 0.8);
    capaConLinea(lienzo, dBoton, verde, vec3(0.34, 0.48, 0.24), 0.7);
    // La pelusa: un reborde claro por dentro.
    lienzo.rgb = mix(lienzo.rgb, vec3(0.88, 0.93, 0.8), (1.0 - smoothstep(0.0, 0.05, -dBoton)) * step(dBoton, 0.0) * 0.4 * vDetalle);
  }
  // Las florecillas abiertas, de arriba abajo (las de abajo, delante y más grandes).
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float t = fk / 5.0;
    float lado = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float tam = mix(0.56, 0.68, t);
    vec2 c = vec2(lado * 0.2, mix(0.62, -2.42, t));
    // En el marco de la florecilla: x hacia fuera del tallo, y hacia arriba, algo levantada.
    vec2 q = (s - c) / tam;
    q.x *= lado;
    q = vec2(0.94 * q.x + 0.34 * q.y, -0.34 * q.x + 0.94 * q.y);
    // El tubo, pálido, que sale del tallo y se ensancha.
    vec2 ab = vec2(0.62, 0.12);
    vec2 aq = q - vec2(-0.66, -0.12);
    float h = clamp(dot(aq, ab) / dot(ab, ab), 0.0, 1.0);
    capaConLinea(lienzo, (length(aq - ab * h) - mix(0.12, 0.24, h)) * tam, palido, linea, 0.5);
    // La capucha (el labio de arriba): dos lóbulos fundidos, con la muesca arriba.
    float capucha = unionSuave(length(q - vec2(0.08, 0.14)) - 0.34, length(q - vec2(0.38, 0.2)) - 0.3, 0.16);
    capucha = max(capucha, -(length(q - vec2(0.3, 0.6)) - 0.08));
    vec3 colorArriba = mix(color, mix(color, palido, 0.45), smoothstep(-0.1, 0.5, q.y));
    colorArriba *= 0.9 + 0.14 * smoothstep(-0.5, 0.5, (q.x - 0.2) * lado * luz);
    capaConLinea(lienzo, capucha * tam, colorArriba, linea, 0.7);
    // La bolsa del labio de abajo, que cierra la boca (su raya es la boca), con su brillo.
    vec2 qb = q - vec2(0.34, -0.2);
    float bolsa = length(qb * vec2(0.92, 1.18)) - 0.3;
    vec3 colorAbajo = mix(color * 1.05, palido, 0.2 + 0.25 * smoothstep(0.0, 0.3, qb.y));
    capaConLinea(lienzo, bolsa * tam, colorAbajo, linea, 0.7);
    float brillo = 1.0 - smoothstep(0.0, 0.08, length(qb - vec2(0.06, 0.1)) - 0.05);
    lienzo.rgb = mix(lienzo.rgb, variedad < 0.62 ? mix(color, vec3(1.0), 0.55) : vec3(1.0, 0.9, 0.58), brillo * step(bolsa, 0.0) * 0.6 * vDetalle);
  }
  return lienzo;
}

vec4 gipsofila(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Gipsófila teñida, como la del ramo: una nube suelta y redonda de racimitos de pompones
  // diminutos, rizados, fucsia claro (alguno, casi blanco), con el centro más oscuro, sobre ramitas
  // finas moradas que se abren en horquilla; entre racimo y racimo, huecos.
  float variedad = fract(vVariante * 3.7);
  vec3 color = variedad < 0.6 ? vec3(0.97, 0.52, 0.78) : variedad < 0.85 ? vec3(0.99, 0.72, 0.87) : vec3(1.0, 0.95, 0.97);
  vec3 centro = variedad < 0.85 ? vec3(0.86, 0.36, 0.62) : vec3(0.94, 0.76, 0.86);
  vec3 linea = color * vec3(0.74, 0.54, 0.66);
  // Tres ramas desde el pie; cada una se abre en cuatro ramitas de largo desigual, con su racimito.
  vec2 racimos[12];
  float rama = 1e3;
  vec2 pie = vec2(0.0, -0.95);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 horquilla = vec2((fk - 1.0) * 0.3 + 0.08 * (hash21(vec2(fk, vVariante * 11.0)) - 0.5), -0.28 + 0.1 * hash21(vec2(fk + 3.0, vVariante * 7.0)) - 0.1 * abs(fk - 1.0));
    vec2 ab = horquilla - pie;
    vec2 ap = p - pie;
    rama = min(rama, length(ap - ab * clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0)) - 0.01);
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float azar = hash21(vec2(fk * 4.0 + fj, vVariante * 5.0));
      float ang = 1.5708 - (fk - 1.0) * 0.5 + (fj - 1.5) * 0.46 + 0.24 * (azar - 0.5);
      vec2 punta = horquilla + vec2(cos(ang), sin(ang)) * (0.3 + 0.42 * hash21(vec2(fj + 7.0, fk + vVariante * 9.0)));
      racimos[k * 4 + j] = punta;
      vec2 cd = punta - horquilla;
      vec2 cp = p - horquilla;
      rama = min(rama, length(cp - cd * clamp(dot(cp, cd) / dot(cd, cd), 0.0, 1.0)) - 0.006);
    }
  }
  capaConLinea(lienzo, rama, vec3(0.55, 0.34, 0.44), vec3(0.55, 0.34, 0.44), 0.0);
  // Los pompones de cada racimito, de fuera adentro (los del centro, encima); abajo, en su sombra.
  for (int k = 0; k < 12; k++) {
    float fk = float(k);
    vec2 centroGrupo = racimos[k];
    float radioGrupo = 0.09 + 0.05 * hash21(vec2(fk + 5.0, vVariante * 3.0));
    if (length(p - centroGrupo) > radioGrupo + 0.1) continue;
    for (int j = 4; j >= 0; j--) {
      float fj = float(j);
      float rj = radioGrupo * sqrt(fj / 4.5);
      float aj = fj * 2.39996 + fk * 1.7 + vVariante * 6.2831853;
      vec2 c = centroGrupo + vec2(cos(aj), sin(aj)) * rj;
      float radio = 0.066 + 0.02 * hash21(vec2(fj + fk * 5.0, vVariante));
      vec2 f = p - c;
      float af = atan(f.y, f.x);
      float d = length(f) - radio * (1.0 + 0.13 * sin(af * 8.0 + fj * 1.3));
      float tono = hash21(vec2(fj * 1.7 + fk, vVariante * 2.0));
      vec3 claro = mix(color, vec3(1.0, 0.96, 0.98), 0.25 * tono);
      vec3 pompon = mix(centro, claro, smoothstep(0.1, 0.7, length(f) / radio));
      pompon = mix(pompon, mix(claro, vec3(1.0), 0.6), (1.0 - smoothstep(0.0, 0.5, length(f / radio - vec2(-0.35, 0.38)))) * 0.65);
      pompon *= 0.9 + 0.1 * smoothstep(-radioGrupo, radioGrupo, c.y - centroGrupo.y);
      capaConLinea(lienzo, d, pompon, linea, 0.45);
    }
  }
  return lienzo;
}

vec4 bolaVerde(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Dianthus "green trick" del ramo: una bola de hebras verdes finas, como un pompón de musgo.
  float r = length(p);
  float a = atan(p.y, p.x);
  float borde = 0.8 + 0.06 * abs(sin(a * 23.0 + vVariante * 9.0)) + 0.035 * sin(a * 57.0);
  float d = r - borde;
  vec3 verde = mix(vec3(0.38, 0.58, 0.24), vec3(0.66, 0.84, 0.4), smoothstep(-0.7, 0.7, dot(p, normalize(vSolEnFlor + vec2(0.0, 0.4)))));
  float hebra = 1.0 - smoothstep(0.15, 0.4, abs(fract(a * 7.0 + r * 3.0) - 0.5));
  verde = mix(verde, verde * 0.82, hebra * vDetalle * 0.6);
  verde = mix(verde, vec3(0.82, 0.92, 0.62), step(0.8, hash21(floor(p * 9.0))) * vDetalle * 0.5);
  capaConLinea(lienzo, d, verde, vec3(0.3, 0.46, 0.2), 0.6);
  return lienzo;
}

void main() {
  vec2 p = vLocal;
  vec4 flor;
  if (vTipo < 0.5) flor = girasol(p);
  else if (vTipo < 1.5) flor = gerbera(p);
  else if (vTipo < 2.5) flor = lirio(p);
  else if (vTipo < 3.5) flor = rosa(p);
  else if (vTipo < 4.5) flor = clavelina(p);
  else if (vTipo < 5.5) flor = bocaDeDragon(p);
  else if (vTipo < 6.5) flor = gipsofila(p);
  else if (vTipo < 7.5) flor = capulloLirio(p);
  else flor = bolaVerde(p);
  if (flor.a < 0.5) discard;
  // Luz de la mañana: lo que da la espalda al Sol, en sombra lila; en los carteles, más claro
  // del lado del Sol.
  float sombra = vTipo < 2.5 ? 1.0 - smoothstep(-0.05, 0.12, vLuz) : 0.0;
  if (vDorso > 0.5) sombra = max(sombra, 0.5);
  vec3 color = mix(flor.rgb, flor.rgb * vec3(0.72, 0.68, 0.86), sombra);
  if (vTipo > 2.5) color *= 0.9 + 0.14 * smoothstep(-0.6, 0.6, dot(p, normalize(vSolEnFlor + 1e-4)));
  // De lejos, cada flor se funde un poco con el tono de su macizo (las oscuras parecían tierra).
  vec3 macizo = vTipo < 0.5 ? vec3(0.98, 0.8, 0.24) : vec3(0.95, 0.6, 0.76);
  color = mix(color, mix(color, macizo, 0.55), vLejos);
  gl_FragColor = salidaCaricatura(color);
}
`

/** Tallos: tiras verticales que giran hacia la cámara, con la brisa arriba. */
export const TALLO_VERT = /* glsl */ `
attribute vec4 aBase;
attribute vec3 aForma;

uniform vec3 uCamara;
uniform float uPixelesPorRadian;

varying vec2 vLocal;
varying float vTipo;
varying float vAnchoPx;

${BRISA_GLSL}

void main() {
  vec3 base = aBase.xyz;
  float altura = aBase.w;
  float grosor = aForma.x;
  float tipo = aForma.y;
  float distancia = distance(base + vec3(0.0, altura * 0.5, 0.0), uCamara);
  float pixeles = grosor / max(distancia, 1e-3) * uPixelesPorRadian;
  if (pixeles < 0.2) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Como la flor, el tallo crece al aparecer; los finos (son de su grosor de verdad), al menos de un
  // píxel de ancho.
  altura *= smoothstep(0.2, 0.45, pixeles);
  grosor *= max(1.0, 0.5 / pixeles);
  // La misma brisa que su flor (con otra fase, el tallo se salía por delante de la cabeza), y acaba
  // justo debajo de ella.
  float mecida = tipo < 0.5 ? 0.018 : 0.035;
  float t = position.y * 0.5 + 0.5;
  vec2 empuje = brisa(base.xz + aForma.z * 3.0) * mecida * altura;
  vec3 aCamara = uCamara - base;
  vec3 ejeX = normalize(vec3(-aCamara.z, 0.0, aCamara.x));
  float caida = 0.25 * dot(empuje, empuje) / max(altura, 0.1);
  vec3 punto = base + ejeX * position.x * grosor * mix(1.0, 0.7, t) + vec3(empuje.x * t * t, (altura * 0.97 - caida) * t, empuje.y * t * t);
  vLocal = position.xy;
  vTipo = tipo;
  vAnchoPx = pixeles;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto, 1.0);
}
`

export const TALLO_FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vTipo;
varying float vAnchoPx;

${SALIDA_CARICATURA}

void main() {
  vec3 verde = vTipo < 0.5 ? vec3(0.36, 0.55, 0.22) : vec3(0.4, 0.58, 0.28);
  verde *= 0.86 + 0.18 * smoothstep(-1.0, 1.0, vLocal.x);
  // Abajo, en la sombra del follaje, más oscuros: se pierden entre las hojas.
  verde *= mix(0.62, 1.0, smoothstep(-1.0, 0.2, vLocal.y));
  // Los bordes a tinta sólo en los tallos anchos en pantalla: en los finos, todo era borde y el pie
  // del muro de girasoles se veía negro.
  float borde = smoothstep(0.62, 0.95, abs(vLocal.x)) * smoothstep(1.5, 4.0, vAnchoPx);
  gl_FragColor = salidaCaricatura(mix(verde, mix(verde * 0.7, TINTA, 0.6), borde));
}
`

/** Hojas de girasol: corazones verdes con su nervio, prendidas del tallo, que se mecen con él. */
export const HOJA_VERT = /* glsl */ `
attribute vec4 aBase;
attribute vec4 aForma;

uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uPixelesPorRadian;

varying vec2 vLocal;
varying float vLuz;
varying float vForma;
varying float vDetalle;

${BRISA_GLSL}

void main() {
  vec3 union_ = aBase.xyz;
  float tamano = aBase.w;
  float rumbo = aForma.x;
  float inclinacion = aForma.y;
  float alturaPlanta = aForma.w;
  float t = union_.y / max(alturaPlanta, 0.1);
  float mecida = aForma.z < 0.5 ? 0.018 : 0.035;
  vec2 empuje = brisa(union_.xz) * mecida * alturaPlanta * t * t;
  float pixeles = tamano / max(distance(union_, uCamara), 1e-3) * uPixelesPorRadian;
  // Las hojas llegan después que las flores (desde el aire, unas motitas verdes oscurecían los
  // macizos) y su tinta, con el tamaño: pequeñas, eran casi todo borde, rayas negras en el corazón.
  if (pixeles < 4.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  tamano *= smoothstep(4.5, 9.0, pixeles);
  vDetalle = smoothstep(9.0, 20.0, pixeles);
  vForma = aForma.z;
  // La de girasol sale del tallo hacia su rumbo, algo caída; las del ramo suben junto a las flores
  // (tumbadas parecían nenúfares).
  float subida = aForma.z < 0.5 ? -0.4 * sin(inclinacion) : sin(inclinacion);
  vec3 hacia = normalize(vec3(sin(rumbo) * cos(inclinacion), subida, -cos(rumbo) * cos(inclinacion)));
  vec3 lado = normalize(cross(vec3(0.0, 1.0, 0.0), hacia));
  vec3 normal = normalize(cross(hacia, lado));
  vec3 centro = union_ + vec3(empuje.x, 0.0, empuje.y) + hacia * tamano;
  // Proporciones: la de girasol, ancha; la de eucalipto, redonda; la larga, estrecha; la de
  // aspidistra, una lanza ancha.
  float anchura = aForma.z < 0.5 ? 0.8 : aForma.z < 1.5 ? 0.9 : aForma.z < 2.5 ? 0.28 : 0.34;
  vec3 punto = centro + hacia * position.y * tamano + lado * position.x * tamano * anchura;
  vLocal = position.xy;
  vLuz = abs(dot(normal, uSol));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto, 1.0);
}
`

export const HOJA_FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vLuz;
varying float vForma;
varying float vDetalle;

${SALIDA_CARICATURA}

void main() {
  // El tallo en y = -1, la punta en y = 1: la de girasol, acorazonada; la de eucalipto, un óvalo
  // gris azulado; la larga (de lirio), una lanza; la de aspidistra, una lanza ancha y brillante con
  // sus nervios paralelos, como las que envuelven el ramo.
  vec2 p = vLocal;
  float t = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float ancho = vForma < 0.5 ? 0.95 * sin(3.14159 * t) * (1.0 - 0.3 * t) : vForma < 1.5 ? 0.92 * sqrt(max(1.0 - p.y * p.y, 0.0)) : vForma < 2.5 ? 0.95 * pow(sin(3.14159 * t), 0.6) : 0.95 * pow(sin(3.14159 * pow(t, 0.8)), 0.9);
  float d = abs(p.x) - ancho;
  float w = max(fwidth(d), 1e-4);
  if (d > w) discard;
  vec3 claro = vForma < 0.5 ? vec3(0.5, 0.72, 0.28) : vForma < 1.5 ? vec3(0.54, 0.68, 0.62) : vForma < 2.5 ? vec3(0.46, 0.68, 0.28) : vec3(0.34, 0.58, 0.3);
  vec3 verde = mix(claro * vec3(0.72, 0.78, 0.8), claro, smoothstep(0.1, 0.5, vLuz));
  float x = abs(p.x) / max(ancho, 1e-3);
  verde = mix(verde, verde * 0.8, smoothstep(0.0, 0.9, x));
  if (vForma > 2.5) {
    // Nervios paralelos y el brillo de la hoja (un lado más claro, como encerado).
    verde = mix(verde, verde * 0.86, (1.0 - smoothstep(0.08, 0.2, abs(fract(x * 3.5) - 0.5))) * vDetalle * 0.7);
    verde = mix(verde, mix(verde, vec3(0.8, 0.9, 0.7), 0.5), smoothstep(0.2, 0.5, x) * (1.0 - smoothstep(0.5, 0.8, x)) * step(0.0, p.x) * 0.5);
  }
  verde = mix(verde, vec3(0.62, 0.78, 0.36), (1.0 - smoothstep(0.02, 0.06, abs(p.x))) * step(p.y, 0.8) * vDetalle);
  verde = mix(verde, mix(verde * 0.72, TINTA, vDetalle), 1.0 - smoothstep(0.5 * w, 1.5 * w, abs(d)));
  gl_FragColor = salidaCaricatura(verde);
}
`
