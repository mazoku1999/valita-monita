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
  } else if (tipo > 4.5 && tipo < 5.5) {
    // Espiga (boca de dragón): gira sólo alrededor de la vertical.
    vec3 aCamara = uCamara - centro;
    ejeX = normalize(vec3(-aCamara.z, 0.0, aCamara.x));
    ejeY = vec3(0.0, 1.0, 0.0);
    escala = vec2(tamano, tamano * 3.2);
    centro.y -= tamano * 1.6;
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

vec4 gerbera(vec2 p) {
  vec4 lienzo = vec4(0.0);
  float lado;
  float largo;
  // Como la del ramo: dos coronas de pétalos finos rosa pálido, más intensos hacia dentro, cada uno
  // con su nervio claro y la punta con dos dientecillos; dentro, un aro de florecillas rosa fuerte
  // con puntitos dorados y el centro pequeño, morado oscuro. Líneas del color del pétalo.
  vec3 palido = vVariante < 0.7 ? vec3(0.99, 0.8, 0.86) : vec3(1.0, 0.72, 0.82);
  vec3 linea = vec3(0.84, 0.46, 0.64);
  float giro = vVariante * 2.0;
  float d1 = corona(p, 22.0, 0.2, 1.0, 0.14, giro, lado, largo);
  // Punta con dos dientes: una muesca en medio del extremo.
  d1 = max(d1, -(length(vec2(lado * 0.14, (largo - 1.0) * 0.8)) - 0.035));
  vec3 petalo = mix(vec3(0.94, 0.54, 0.73), palido, smoothstep(0.1, 0.45, largo));
  petalo = mix(petalo, mix(palido, vec3(1.0), 0.45), (1.0 - smoothstep(0.08, 0.22, abs(lado))) * smoothstep(0.3, 0.6, largo) * vDetalle);
  capaConLinea(lienzo, d1, petalo, linea, 1.0);
  float d2 = corona(p, 22.0, 0.18, 0.66, 0.12, giro + PI / 22.0, lado, largo);
  vec3 petalo2 = mix(vec3(0.92, 0.48, 0.7), palido * 0.97, smoothstep(0.2, 0.8, largo));
  petalo2 = mix(petalo2, mix(palido, vec3(1.0), 0.35), (1.0 - smoothstep(0.08, 0.22, abs(lado))) * smoothstep(0.4, 0.7, largo) * vDetalle);
  capaConLinea(lienzo, d2, petalo2, linea, 0.8);
  // Aro de florecillas.
  float r = length(p);
  float a = atan(p.y, p.x);
  float florecilla = 1.0 - smoothstep(0.35, 0.5, abs(fract(a * 18.0 / 6.2831853 + r * 3.0) - 0.5) * 2.0);
  vec3 aro = mix(vec3(0.9, 0.36, 0.6), vec3(1.0, 0.8, 0.5), florecilla * step(0.24, r) * vDetalle);
  capaConLinea(lienzo, r - 0.3, aro, vec3(0.6, 0.22, 0.42), 0.8);
  vec3 centro = mix(vec3(0.3, 0.1, 0.22), vec3(0.5, 0.2, 0.36), smoothstep(0.05, 0.17, r));
  capaConLinea(lienzo, r - 0.18, centro, vec3(0.24, 0.08, 0.18), 0.9);
  return lienzo;
}

vec4 lirio(vec2 p) {
  vec4 lienzo = vec4(0.0);
  float lado;
  float largo;
  // Lirio "stargazer" del ramo: tres pétalos de fuera, anchos, y tres de dentro entre ellos, con el
  // borde ondulado y blanco rosado, una banda fucsia por el centro con motitas oscuras, la garganta
  // verde amarilla, un nervio claro; seis estambres con sus anteras y el pistilo.
  float giro = vVariante * PI;
  vec3 borde = vec3(1.0, 0.93, 0.96);
  vec3 banda = vec3(0.9, 0.3, 0.58);
  vec3 linea = vec3(0.72, 0.3, 0.5);
  for (int vuelta = 0; vuelta < 2; vuelta++) {
    float fv = float(vuelta);
    float d = corona(p, 3.0, 0.02, 1.0 - 0.06 * fv, 0.5 - 0.1 * fv, giro + fv * PI / 3.0, lado, largo);
    // Borde ondulado hacia la punta.
    d += 0.018 * sin(largo * 38.0 + fv) * smoothstep(0.35, 0.7, largo);
    vec3 petalo = mix(banda, borde, smoothstep(0.22, 0.62, abs(lado) + 0.35 * smoothstep(0.55, 0.95, largo)));
    petalo = mix(petalo, vec3(0.82, 0.9, 0.52), 1.0 - smoothstep(0.1, 0.28, largo));
    // Nervio claro y motitas.
    petalo = mix(petalo, mix(banda, borde, 0.7), (1.0 - smoothstep(0.03, 0.08, abs(lado))) * step(0.25, largo) * vDetalle);
    vec2 celda = floor(p * 13.0);
    float mota = step(0.7, hash21(celda + fv * 7.0)) * (1.0 - smoothstep(0.08, 0.2, length(fract(p * 13.0) - 0.5))) * step(0.2, largo) * (1.0 - smoothstep(0.45, 0.7, largo)) * (1.0 - smoothstep(0.2, 0.55, abs(lado)));
    petalo = mix(petalo, vec3(0.5, 0.1, 0.28), mota * vDetalle);
    capaConLinea(lienzo, d, petalo, linea, 1.0);
  }
  // Estambres: hilos verdes claros entre los pétalos, con la antera oval de color óxido.
  float r = length(p);
  float angulo = atan(p.y, p.x) - giro - PI / 6.0;
  float sector = PI / 3.0;
  float k = floor(angulo / sector + 0.5);
  float delta = (angulo - k * sector) * r;
  float hilo = (1.0 - smoothstep(0.01, 0.022, abs(delta))) * step(r, 0.5) * step(0.06, r);
  lienzo.rgb = mix(lienzo.rgb, vec3(0.74, 0.86, 0.5), hilo * vDetalle);
  vec2 enAntera = vec2(delta, r - 0.54);
  float antera = length(enAntera / vec2(0.055, 0.03)) - 1.0;
  lienzo.rgb = mix(lienzo.rgb, vec3(0.7, 0.3, 0.12), (1.0 - smoothstep(-0.2, 0.1, antera)) * vDetalle);
  // El pistilo, más largo, con su punta de tres lóbulos.
  float pistilo = (1.0 - smoothstep(0.012, 0.026, abs((atan(p.y, p.x) - giro) * r))) * step(r, 0.62);
  lienzo.rgb = mix(lienzo.rgb, vec3(0.62, 0.8, 0.44), pistilo * vDetalle);
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
  vec3 color = vVariante < 0.45 ? vec3(0.9, 0.2, 0.5) : vVariante < 0.85 ? vec3(0.99, 0.62, 0.74) : vec3(1.0, 0.7, 0.64);
  vec3 oscuro = color * vec3(0.62, 0.46, 0.58);
  vec3 claro = mix(color, vec3(1.0, 0.95, 0.96), 0.45);
  vec3 linea = color * vec3(0.48, 0.34, 0.44);
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

vec4 clavelina(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Clavel de poeta: una cúpula de siete florecillas de cinco pétalos con el borde flecado, magenta,
  // morada con el borde blanco o granate, con el ojo más oscuro.
  vec3 base = vVariante < 0.45 ? vec3(0.86, 0.2, 0.54) : vVariante < 0.88 ? vec3(0.64, 0.24, 0.68) : vec3(0.66, 0.1, 0.26);
  bool bicolor = vVariante >= 0.45 && vVariante < 0.88;
  for (int k = 0; k < 7; k++) {
    float angulo = float(k) * 1.0471976 + vVariante * 3.0;
    vec2 c = k == 6 ? vec2(0.0, 0.04) : vec2(cos(angulo), sin(angulo)) * 0.52;
    vec2 f = p - c;
    float r = length(f);
    float a = atan(f.y, f.x) + float(k) * 0.7;
    float borde = 0.4 + 0.07 * cos(5.0 * a) + 0.025 * sin(23.0 * a);
    vec3 color = base * (k == 6 ? 1.05 : 0.92);
    if (bicolor) color = mix(color, vec3(1.0, 0.96, 0.98), smoothstep(0.26, 0.36, r));
    color = mix(color, base * 0.55, (1.0 - smoothstep(0.08, 0.13, r)));
    capaConLinea(lienzo, r - borde, color, base * 0.5, 0.9);
  }
  return lienzo;
}

vec4 bocaDeDragon(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Espiga que se afina hacia arriba: florecillas de dos labios (el de arriba mayor) alternas, con
  // la garganta clara, y botones verdes en la punta.
  vec3 color = vVariante < 0.35 ? vec3(0.76, 0.36, 0.74) : vVariante < 0.7 ? vec3(0.83, 0.6, 0.9) : vec3(0.95, 0.56, 0.74);
  vec3 linea = color * vec3(0.6, 0.5, 0.65);
  for (int k = 0; k < 8; k++) {
    float y = -0.88 + float(k) * 0.24;
    float afinado = 1.0 - 0.45 * (float(k) / 7.0);
    float x = (k % 2 == 0 ? -0.2 : 0.2) * afinado;
    vec2 q = (p - vec2(x, y)) / afinado;
    if (k >= 6) {
      capaConLinea(lienzo, length(q * vec2(1.3, 1.0)) - 0.28, vec3(0.5, 0.7, 0.36), vec3(0.34, 0.5, 0.24), 0.8);
      continue;
    }
    // El labio de arriba, de dos lóbulos; el de abajo, de tres, con la mancha amarilla de la
    // garganta (por donde entran las abejas).
    vec2 qa = q - vec2(0.0, 0.1);
    float labioArriba = min(length((qa - vec2(-0.17, 0.0)) * vec2(1.0, 1.2)) - 0.28, length((qa - vec2(0.17, 0.0)) * vec2(1.0, 1.2)) - 0.28);
    vec2 qb = q - vec2(0.0, -0.17);
    float labioAbajo = min(min(length(qb - vec2(-0.2, 0.0)) - 0.16, length(qb - vec2(0.2, 0.0)) - 0.16), length(qb - vec2(0.0, -0.05)) - 0.18);
    capaConLinea(lienzo, labioArriba, mix(color, color * 1.08, smoothstep(-0.2, 0.2, qa.y)), linea, 0.9);
    capaConLinea(lienzo, labioAbajo, mix(color, vec3(1.0, 0.95, 0.92), 0.3), linea, 0.8);
    float garganta = length((q - vec2(0.0, -0.1)) * vec2(1.8, 2.6)) - 0.12;
    lienzo.rgb = mix(lienzo.rgb, vec3(1.0, 0.86, 0.4), (1.0 - smoothstep(-0.02, 0.02, garganta)) * vDetalle);
  }
  return lienzo;
}

vec4 gipsofila(vec2 p) {
  vec4 lienzo = vec4(0.0);
  // Ramillete: ramitas finas desde abajo que acaban en racimos de puntitos blancos o rosados.
  vec3 color = vVariante < 0.45 ? vec3(1.0, 0.98, 0.99) : vec3(0.98, 0.64, 0.82);
  vec3 linea = color * vec3(0.78, 0.72, 0.8);
  float d = 1e3;
  float rama = 1e3;
  for (int k = 0; k < 14; k++) {
    float a = hash21(vec2(float(k), vVariante * 31.0)) * 6.2831853;
    float r = 0.25 + 0.6 * hash21(vec2(float(k) + 7.7, vVariante * 17.0));
    vec2 c = vec2(cos(a), sin(a) * 0.8 + 0.12) * r;
    d = min(d, length(p - c) - 0.075);
    // La ramita, del pie (0, -1) al puntito.
    vec2 ab = c - vec2(0.0, -1.0);
    vec2 ap = p - vec2(0.0, -1.0);
    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    rama = min(rama, length(ap - ab * t) - 0.018);
  }
  capaConLinea(lienzo, rama, vec3(0.44, 0.58, 0.32), vec3(0.44, 0.58, 0.32), 0.0);
  capaConLinea(lienzo, d, color, linea, 0.7);
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
  else flor = gipsofila(p);
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
  if (pixeles < 0.35) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Como la flor, el tallo crece al aparecer.
  altura *= smoothstep(0.35, 1.0, pixeles);
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
  // Proporciones: la de girasol, ancha; la de eucalipto, redonda; la larga, estrecha.
  float anchura = aForma.z < 0.5 ? 0.8 : aForma.z < 1.5 ? 0.9 : 0.28;
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
  // verde azulado; la larga, una lanza.
  vec2 p = vLocal;
  float t = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float ancho = vForma < 0.5 ? 0.95 * sin(3.14159 * t) * (1.0 - 0.3 * t) : vForma < 1.5 ? 0.92 * sqrt(max(1.0 - p.y * p.y, 0.0)) : 0.95 * pow(sin(3.14159 * t), 0.6);
  float d = abs(p.x) - ancho;
  float w = max(fwidth(d), 1e-4);
  if (d > w) discard;
  vec3 claro = vForma > 0.5 && vForma < 1.5 ? vec3(0.56, 0.72, 0.58) : vForma < 0.5 ? vec3(0.5, 0.72, 0.28) : vec3(0.46, 0.68, 0.28);
  vec3 verde = mix(claro * vec3(0.72, 0.78, 0.8), claro, smoothstep(0.1, 0.5, vLuz));
  verde = mix(verde, verde * 0.8, smoothstep(0.0, 0.9, abs(p.x) / max(ancho, 1e-3)));
  verde = mix(verde, vec3(0.62, 0.78, 0.36), (1.0 - smoothstep(0.02, 0.06, abs(p.x))) * step(p.y, 0.8) * vDetalle);
  verde = mix(verde, mix(verde * 0.72, TINTA, vDetalle), 1.0 - smoothstep(0.5 * w, 1.5 * w, abs(d)));
  gl_FragColor = salidaCaricatura(verde);
}
`
