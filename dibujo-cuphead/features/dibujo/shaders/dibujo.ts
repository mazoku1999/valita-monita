/**
 * Shaders del dibujo animado (`utils/PasoDibujo.ts`). La escena 3D se renderiza como siempre y
 * después se DIBUJA cada fotograma: colores planos por bandas y contornos de tinta que siguen los
 * bordes. Todo el dibujo trabaja en sRGB (como se pintaban los acetatos); la salida se vuelve a
 * lineal sólo si detrás hay otro pase.
 */

import { BANDA_POLVO } from '../constantes/dibujo'
import { CIELO_ACUARELA_GLSL, CIELO_MANANA_GLSL, PALETA_EPOCA_GLSL, PAPEL_GLSL, RUIDO3_GLSL } from './acuarela'
import { CAIDA_NOCHE_GLSL, NOCHE_ESTRELLADA_GLSL } from './nocheEstrellada'

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
 * Lo que la escena ya dibuja en caricatura (el sistema solar) sale con alfa 0.5; lo realista (el
 * túnel del agujero de gusano, los cielos) con alfa 1 o más. Lo realista pasa por el tono ACES
 * (el mismo de three.js) antes de dibujarse; lo de caricatura se queda con su color.
 */
export const TONO_GLSL = /* glsl */ `
bool esCaricatura(float alfa) {
  return alfa > 0.25 && alfa < 0.75;
}

vec3 ajusteRRTyODT(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 tonoACES(vec3 color) {
  const mat3 ENTRADA = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 SALIDA = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ENTRADA * (color / 0.6);
  color = ajusteRRTyODT(color);
  return clamp(SALIDA * color, 0.0, 1.0);
}

// Luz de lo realista, toneada; lo de caricatura no cuenta (ni para las aguadas del cielo ni para
// los colores planos: ya viene dibujado).
vec3 luzRealista(vec4 muestra) {
  return esCaricatura(muestra.a) ? vec3(0.0) : tonoACES(muestra.rgb);
}
`

/** Quad de pantalla completa (PlaneGeometry 2×2). */
export const PANTALLA_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Reducción en sRGB por bloques (de 2×2 para 1/2, de 4×4 para 1/4) con la luminancia en alfa. Cada
 * texel se lee suelto: lo de caricatura (marcado en alfa) no cuenta y lo realista se tonea (ACES)
 * antes de promediar, como si el tono fuera un pase previo. Con lecturas bilineales el alfa de los
 * bordes se mezclaba y los puntitos de las órbitas dejaban un halo en las aguadas.
 */
export const REDUCIR_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform int uBloque;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}
${TONO_GLSL}

void main() {
  ivec2 tamano = textureSize(uEntrada, 0);
  ivec2 origen = ivec2(floor(gl_FragCoord.xy)) * uBloque;
  vec3 c = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (x >= uBloque || y >= uBloque) continue;
      ivec2 p = min(origen + ivec2(x, y), tamano - 1);
      c += luzRealista(texelFetch(uEntrada, p, 0));
    }
  }
  vec3 s = srgbDesdeLineal(c / float(uBloque * uBloque));
  fragColor = vec4(s, dot(s, vec3(0.299, 0.587, 0.114)));
}
`

/**
 * Gaussiana separable de σ = 3.5 texels con 9 lecturas bilineales (cada una entre dos texels, con su
 * peso: equivale a 17 texels); `uPaso` es un texel en UV en la dirección del pase, escalado por
 * σ/3.5. Con lecturas cada dos texels exactos, un punto brillante salía en peine (las aguadas se
 * rayaban en rejilla alrededor de puntitos como los de las órbitas).
 */
export const DESENFOQUE_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform vec2 uPaso;
// Suavizado temporal: mezcla con el resultado del fotograma anterior (1 = sin memoria).
uniform sampler2D uHistoria;
uniform float uMezcla;

in vec2 vUv;
out vec4 fragColor;

void main() {
  const float DESPLAZAMIENTOS[5] = float[](0.0, 1.4694, 3.4291, 5.3897, 7.3517);
  const float PESOS[5] = float[](0.1157, 0.20933, 0.14035, 0.06832, 0.02414);
  vec4 s = texture(uEntrada, vUv) * PESOS[0];
  for (int i = 1; i < 5; i++) {
    vec2 d = uPaso * DESPLAZAMIENTOS[i];
    s += (texture(uEntrada, vUv + d) + texture(uEntrada, vUv - d)) * PESOS[i];
  }
  fragColor = uMezcla < 1.0 ? mix(texture(uHistoria, vUv), s, uMezcla) : s;
}
`






/**
 * Cielo en acuarela a 1/2 de resolución (su dibujo es amplio) y máscara del cielo abierto en A: donde
 * la escena no escribió profundidad (ni planeta, ni la sombra del agujero, ni gas denso) ni dibujó
 * nada de caricatura. Dentro del horizonte, antes de que aparezca la boca del agujero de gusano, no
 * hay cielo: es oscuridad.
 */
export const CIELO_FRAG = /* glsl */ `
uniform sampler2D uProfundidad;
uniform sampler2D uEscena;
uniform vec2 uTexelEntrada;
uniform float uCieloPintado;
// Rayos de sol detrás del agujero (como el fondo de los títulos de Cuphead): posición del agujero en
// pantalla (xy, uv), radio de su sombra (z, fracción de la altura) y peso (w).
uniform vec4 uAgujero;
// Lo mismo para el Sol de caricatura: su resplandor dorado en el cielo, con rayos.
uniform vec4 uSol;
uniform float uAspecto;
uniform float uTiempo;
uniform float uLatido;
// De día (el valle de Cochabamba): cuánto (0 el cielo nocturno del espacio, 1 el de la mañana), la
// rotación de las direcciones del mundo a las del valle y hacia dónde está el Sol en el valle.
uniform float uDia;
uniform mat3 uRotacionValle;
uniform vec3 uSolValle;
// La banda de polvo del agujero pintada en el cielo: posición de la cámara en el mundo y cuánto se
// ve (sólo con el agujero a la vista).
uniform vec3 uPosCamara;
uniform float uBanda;

in vec2 vUv;
out vec4 fragColor;

${RUIDO3_GLSL}
${CIELO_ACUARELA_GLSL}
${CIELO_MANANA_GLSL}
${TONO_GLSL}

vec3 resplandorDelSol(vec2 uv, vec3 cielo) {
  vec2 q = (uv - uSol.xy) * vec2(uAspecto, 1.0);
  // Distancia desde el borde del disco, en unidades de un alcance que crece con el Sol en pantalla
  // pero no tanto como él: de cerca, el resplandor no llena el cielo entero.
  float d = max(length(q) - uSol.z, 0.0) / (0.12 + 0.5 * uSol.z);
  float angulo = atan(q.y, q.x);
  float rayo = smoothstep(-0.3, 0.3, cos(angulo * 12.0 - uTiempo * 0.05));
  vec3 c = mix(cielo, vec3(0.96, 0.56, 0.42), 0.6);
  c = mix(c, vec3(1.0, 0.84, 0.5), exp(-d * 2.4));
  float mezcla = uSol.w * exp(-d) * (0.55 + 0.45 * rayo);
  return mix(cielo, c, clamp(mezcla, 0.0, 1.0));
}

float cieloAbierto(vec2 uv) {
  return step(0.99999, texture(uProfundidad, uv).r) * (esCaricatura(texture(uEscena, uv).a) ? 0.0 : 1.0);
}

vec3 rayosDeSol(vec2 uv, vec3 cielo) {
  vec2 q = (uv - uAgujero.xy) * vec2(uAspecto, 1.0);
  // Distancia en radios del disco (el disco, con sus anillos, mide ~5.2 radios de sombra).
  float d = length(q) / max(uAgujero.z * 5.2, 1e-4);
  float angulo = atan(q.y, q.x);
  // Rayos alternos con borde de aerógrafo, que giran despacio y laten con el compás.
  float rayo = smoothstep(-0.25, 0.25, cos(angulo * 16.0 + uTiempo * 0.12));
  float resplandor = exp(-d * 0.42);
  vec3 calido = vec3(1.0, 0.70, 0.46);
  vec3 rosa = vec3(0.86, 0.36, 0.46);
  vec3 morado = vec3(0.40, 0.22, 0.50);
  vec3 c = mix(morado, rosa, exp(-d * 0.55));
  c = mix(c, calido, exp(-d * 1.4));
  float mezcla = uAgujero.w * resplandor * (0.62 + 0.38 * rayo) * (0.9 + 0.1 * uLatido);
  return mix(cielo, c, clamp(mezcla, 0.0, 1.0));
}

// La luz de la banda de polvo, pintada (el río de chispas doradas de la versión realista): la luz
// de los granos que el rayo atraviesa, con el mismo reparto que sus destellos (ver BANDA_POLVO en
// constantes/dibujo.ts): densidad de superficie (rMin/r)², espesor gaussiano σ(r) y brillo por grano
// que cae hacia fuera (rMin/r), algo más que el de los destellos para que el río se apague antes
// del borde de la pantalla. Sólo cuentan los lejanos: los que pasan cerca de la cámara ya se ven
// sueltos, como destellos (contándolos, la banda era una franja ancha que cruzaba media pantalla).
// Devuelve la luz del río (x), la de un velo tres veces y media más ancho (y) y el punto medio de
// la luz en el plano (zw), donde se ancla el grano de la aguada.
const float BANDA_R_MIN = ${BANDA_POLVO.radioMinimo.toFixed(1)};
const float BANDA_R_MAX = ${BANDA_POLVO.radioMaximo.toFixed(1)};
const float BANDA_ESPESOR = ${BANDA_POLVO.espesorBase.toFixed(4)};
const float BANDA_PENDIENTE = ${BANDA_POLVO.espesorPendiente.toFixed(4)};
const float VELO_ANCHO = 3.5;
vec4 luzBanda(vec3 o, vec3 d) {
  // Tramo del rayo dentro de la losa (tres σ del velo en el borde) y del cilindro de la banda.
  float alto = 3.0 * VELO_ANCHO * (BANDA_ESPESOR + BANDA_PENDIENTE * BANDA_R_MAX);
  float t0 = 12.0;
  float t1 = 1e5;
  if (abs(d.y) > 1e-6) {
    float ta = (-alto - o.y) / d.y;
    float tb = (alto - o.y) / d.y;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (abs(o.y) > alto) {
    return vec4(0.0);
  }
  float a = dot(d.xz, d.xz);
  float b = dot(o.xz, d.xz);
  float disc = b * b - a * (dot(o.xz, o.xz) - BANDA_R_MAX * BANDA_R_MAX);
  if (a < 1e-8 || disc <= 0.0) return vec4(0.0);
  float raiz = sqrt(disc);
  t0 = max(t0, (-b - raiz) / a);
  t1 = min(t1, (-b + raiz) / a);
  if (t1 <= t0) return vec4(0.0);
  // Más muestras cerca de donde el rayo pasa más cerca del agujero (allí la banda es más densa).
  float tc = clamp(-b / a, t0, t1);
  float rio = 0.0;
  float velo = 0.0;
  vec2 medio = vec2(0.0);
  const int N = 14;
  for (int lado = 0; lado < 2; lado++) {
    float largo = (lado == 0 ? t0 : t1) - tc;
    for (int i = 0; i < N; i++) {
      float u = (float(i) + 0.5) / float(N);
      float t = tc + largo * u * u;
      vec3 q = o + t * d;
      float r = length(q.xz);
      float sigma = BANDA_ESPESOR + BANDA_PENDIENTE * r;
      float k = BANDA_R_MIN / max(r, 1.0);
      float luzGranos = k * k * k
        * smoothstep(BANDA_R_MIN - 2.0, BANDA_R_MIN + 4.0, r) * (1.0 - smoothstep(BANDA_R_MAX - 25.0, BANDA_R_MAX, r))
        * smoothstep(18.0, 45.0, t) * abs(largo) * 2.0 * u / float(N) / (2.5066 * sigma);
      float y2 = 0.5 * q.y * q.y / (sigma * sigma);
      float w = luzGranos * exp(-y2);
      rio += w;
      velo += luzGranos * exp(-y2 / (VELO_ANCHO * VELO_ANCHO)) / VELO_ANCHO;
      medio += w * q.xz;
    }
  }
  return vec4(rio, velo, medio / max(rio, 1e-6));
}

vec3 bandaPintada(vec3 c, vec3 d) {
  vec4 luz = luzBanda(uPosCamara, d);
  // El río sólo con la banda de canto (rayos casi en su plano); vista desde arriba o desde abajo,
  // sólo el velo (su luz se juntaba en una estela que salía del disco como un cometa).
  float rasante = 1.0 - smoothstep(0.04, 0.12, abs(d.y));
  float luzRio = (1.0 - exp(-0.1 * luz.x)) * rasante;
  float luzVelo = 1.0 - exp(-0.1 * luz.y);
  if (luzVelo < 0.004 && luzRio < 0.004) return c;
  // Grano de la aguada anclado a la banda (gira despacio con ella), para que la orilla sea irregular.
  float r = length(luz.zw);
  float giro = 0.9 * pow(max(r, 1.0), -1.5) * uTiempo;
  vec2 q = mat2(cos(giro), -sin(giro), sin(giro), cos(giro)) * luz.zw;
  float grano = 0.55 + 0.9 * fbm3(vec3(q * 0.18, 1.7));
  // El velo dorado, el río y su centro claro, cada uno con su orilla.
  float velo = aguada(luzVelo * grano, 0.08, 0.03);
  float rio = aguada(luzRio * grano, 0.25, 0.03);
  float centro = aguada(luzRio * grano, 0.62, 0.03);
  c = mix(c, vec3(0.74, 0.47, 0.42), 0.32 * velo * uBanda);
  c = mix(c, vec3(0.98, 0.72, 0.46), 0.6 * rio * uBanda);
  c = mix(c, vec3(1.0, 0.9, 0.7), 0.75 * centro * uBanda);
  c *= 1.0 - 0.1 * uBanda * (orilla(luzVelo * grano, 0.08, 0.035) + orilla(luzRio * grano, 0.25, 0.035));
  return c;
}

void main() {
  float cielo = cieloAbierto(vUv + uTexelEntrada * vec2(-1.0, -1.0));
  cielo += cieloAbierto(vUv + uTexelEntrada * vec2(1.0, -1.0));
  cielo += cieloAbierto(vUv + uTexelEntrada * vec2(-1.0, 1.0));
  cielo += cieloAbierto(vUv + uTexelEntrada * vec2(1.0, 1.0));
  vec3 direccion = direccionMundo(vUv);
  vec3 c = uDia < 0.999 ? cieloAcuarela(direccion) : vec3(0.0);
  if (uDia > 0.001) c = mix(c, cieloManana(uRotacionValle * direccion, uSolValle), uDia);
  if (uAgujero.w > 0.0) c = rayosDeSol(vUv, c);
  if (uBanda > 0.001) c = bandaPintada(c, direccion);
  if (uSol.w > 0.0) c = resplandorDelSol(vUv, c);
  fragColor = vec4(c, 0.25 * cielo * uCieloPintado);
}
`

/**
 * Contornos de tinta a partir de QUÉ HAY en cada píxel, no de la imagen: con el agujero a la vista,
 * los objetos del buffer del agujero (cielo, caras del disco, cantos, anillo, sombra); dentro del
 * horizonte, los saltos de profundidad de la escena (planetas frente al cielo), sólo por el lado de
 * fuera de la silueta (así un planeta pequeño no se queda en una mancha de tinta). Para cada píxel se
 * miran doce puntos en un círculo del grosor del trazo: la fracción que cae en otro objeto da una
 * línea de ese grosor con el borde suave. El grosor varía a lo largo de la línea, como la presión de
 * un pincel, y todo "hierve" un poco de un dibujo a otro. Entre las bandas del disco van líneas
 * más finas, del color de la banda oscurecido (R: tinta, G: líneas de color).
 */
export const CONTORNO_FRAG = /* glsl */ `
uniform sampler2D uIdGas;
uniform sampler2D uProfundidad;
uniform vec2 uResolucion;
uniform vec2 uCercaLejos;
uniform float uGrosor;
uniform vec3 uHervor;
uniform float uGasVisible;
// En el valle (de día) la tinta de profundidad sólo marca las siluetas contra el cielo (la cresta
// del Tunari, los girasoles más altos): el campo es un fondo pintado y cada flor lleva su tinta fina.
uniform float uSoloCielo;

in vec2 vUv;
out vec4 fragColor;

${PAPEL_GLSL}

float profundidadLineal(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uCercaLejos.x * uCercaLejos.y / (uCercaLejos.y + uCercaLejos.x - z * (uCercaLejos.y - uCercaLejos.x));
}

float objetoEn(vec2 uv, out float banda) {
  vec2 t = vec2(textureSize(uIdGas, 0));
  vec4 id = texelFetch(uIdGas, ivec2(clamp(uv, 0.0, 0.9999) * t), 0);
  banda = floor(id.g * 10.0 + 0.5);
  return floor(id.r * 5.0 + 0.5);
}

float zEnPixel(ivec2 p) {
  ivec2 t = textureSize(uProfundidad, 0);
  float d = texelFetch(uProfundidad, clamp(p, ivec2(0), t - 1), 0).r;
  return d >= 0.99999 ? 1e6 : profundidadLineal(d);
}

void main() {
  float escala = uResolucion.y / 720.0;
  vec2 px = vUv * uResolucion;
  vec2 p = px / (70.0 * escala) + uHervor.xy;
  vec2 hervor = 2.0 * uHervor.z * escala * (vec2(ruidoPapel(p), ruidoPapel(p.yx + 13.7)) - 0.5);
  vec2 uv = vUv + hervor / uResolucion;
  // Presión del pincel: el trazo engorda y adelgaza a lo largo de la línea.
  float grosor = uGrosor * escala * (0.72 + 0.56 * ruidoPapel(px / (38.0 * escala) + uHervor.yx * 0.3));

  bool conGas = uGasVisible > 0.5;
  float banda0;
  float objeto0 = objetoEn(uv, banda0);
  float tinta = 0.0;
  float bandas = 0.0;
  if (!conGas) {
    // Sin el agujero en pantalla, la tinta sale de los saltos de profundidad: seis parejas de
    // muestras opuestas, a desplazamientos de píxel exactamente simétricos. El píxel lejano junto a
    // algo más cercano lleva tinta (queda fuera de la silueta), pero sólo en un corte de verdad: en
    // una superficie plana la inversa de la profundidad cambia en línea recta por la pantalla, y la
    // pareja lo comprueba (si no, un suelo visto de refilón se llenaba de tinta; con desplazamientos
    // redondeados sin simetría, la prueba fallaba cerca del horizonte).
    ivec2 centro = ivec2(uv * vec2(textureSize(uProfundidad, 0)));
    float z0 = zEnPixel(centro);
    float w0 = 1.0 / z0;
    // Entre dos superficies lejanas (un cerro delante de otro) la tinta se apaga: al ras del suelo,
    // lo que está a más de ~200 m cabe en unos pocos píxeles bajo el horizonte y los contornos de cada
    // loma se apilaban en una franja negra. Las siluetas contra el cielo se quedan.
    float lejania = z0 > 1e5 ? 0.0 : max(smoothstep(150.0, 900.0, z0), uSoloCielo);
    for (int k = 0; k < 6; k++) {
      float a = 3.14159265 * float(k) / 6.0;
      ivec2 o = ivec2(round(vec2(cos(a), sin(a)) * grosor * 1.5));
      float zA = zEnPixel(centro + o);
      float zB = zEnPixel(centro - o);
      float wA = 1.0 / zA;
      float wB = 1.0 / zB;
      if (abs(wA + wB - 2.0 * w0) < 0.04 * max(max(wA, wB), w0)) continue;
      if (z0 - zA > 0.06 * zA) tinta += 1.0 - lejania;
      if (z0 - zB > 0.06 * zB) tinta += 1.0 - lejania;
    }
  }
  for (int k = 0; k < 12; k++) {
    float a = 6.2831853 * float(k) / 12.0;
    vec2 direccion = vec2(cos(a), sin(a));
    vec2 q = uv + direccion * grosor / uResolucion;
    if (conGas) {
      float banda;
      float objeto = objetoEn(q, banda);
      // El anillo y la sombra se tocan sin línea: el anillo es el borde de la sombra. La hoja fina
      // del disco de canto (2), sin tinta: es un hilo de luz.
      bool pareja = (objeto == 4.0 && objeto0 == 5.0) || (objeto == 5.0 && objeto0 == 4.0);
      bool hilo = objeto == 2.0 || objeto0 == 2.0;
      if (objeto != objeto0 && !pareja && !hilo) tinta += 1.0;
      if (objeto0 == 1.0 && k % 2 == 0) {
        float bandaCerca;
        float objetoCerca = objetoEn(uv + direccion * 0.55 * grosor / uResolucion, bandaCerca);
        if (objetoCerca == 1.0 && bandaCerca != banda0) bandas += 1.0;
      }
    }
  }
  fragColor = vec4(tinta / 12.0, bandas / 6.0, 0.0, 1.0);
}
`

/**
 * Composición a resolución completa: colores planos por bandas de luminosidad (con un poco del
 * degradado original dentro de cada banda y el borde entre bandas suavizado a un píxel) y la tinta
 * encima. La tinta es la respuesta de la FDoG bajo el umbral, con una transición que engorda el
 * trazo donde el borde es más fuerte, como la presión de un pincel.
 */
export const COMPONER_FRAG = /* glsl */ `
// La escena a resolución completa: lo que ya viene dibujado en caricatura se toma tal cual.
uniform sampler2D uEscena;
uniform sampler2D uColorSuave;
// La profundidad de la escena (de noche, lo que flota sin cuerpo no se oscurece).
uniform sampler2D uProfundidad;
// Contornos (R: tinta, G: líneas de color entre bandas), ver CONTORNO_FRAG.
uniform sampler2D uContornos;
// El agujero de caricatura (color lineal y cobertura en A) y cuánto se ve (fuera del horizonte).
uniform sampler2D uGasColor;
uniform float uGasVisible;
// Cielo en acuarela con los rayos (RGB) y máscara del cielo abierto (A), ver CIELO_FRAG.
uniform sampler2D uCielo;
// La luz de la escena muy suavizada (a 1/4): las aguadas son manchas amplias y redondas.
uniform sampler2D uAguada;
// Aguadas de luz sobre el cielo: umbrales de luminancia (sRGB) de los tres tonos.
uniform vec3 uUmbralesAguada;
// Papel: resolución en píxeles y tamaño del grano.
uniform vec2 uResolucion;
uniform float uEscalaPapel;
uniform float uFuerzaEpoca;
// Hervor: semilla del dibujo (xy) y amplitud en píxeles (z) (el borde de los colores de la escena).
uniform vec3 uHervor;
// Bandas de color de lo que aún se renderiza con materiales realistas (planetas, el túnel).
uniform vec3 uUmbralesBanda;
uniform vec3 uValoresBanda;
uniform float uDegradado;
uniform float uCroma;
uniform vec3 uTinta;
uniform float uAPantalla;
uniform float uSoloTinta;
// Dentro de una nube (0..1) y cuánto ha avanzado la cámara por ella (mueve las volutas).
uniform float uNiebla;
uniform float uNieblaAvance;
// 1 al salir de la nube (se abre desde el centro, lo que se ve hacia abajo), −1 al entrar (se
// cierra primero en el centro).
uniform float uNieblaSentido;
// La noche estrellada del final (a resolución completa: sus tintas son finas): la dirección de cada
// píxel en el valle.
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
uniform mat3 uRotacionValle;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}
${TONO_GLSL}
${PALETA_EPOCA_GLSL}
${PAPEL_GLSL}
${RUIDO3_GLSL}
${CAIDA_NOCHE_GLSL}
${NOCHE_ESTRELLADA_GLSL}

vec3 direccionEnValle(vec2 uv) {
  vec4 ojo = uProyInversa * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  return uRotacionValle * normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
}

vec4 texturaBicubica(sampler2D t, vec2 uv) {
  vec2 tamano = vec2(textureSize(t, 0));
  vec2 p = uv * tamano - 0.5;
  vec2 f = fract(p);
  vec2 i = floor(p);
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 c0 = (i - 0.5 + w1 / s0) / tamano;
  vec2 c1 = (i + 1.5 + w3 / s1) / tamano;
  return s0.y * (s0.x * texture(t, vec2(c0.x, c0.y)) + s1.x * texture(t, vec2(c1.x, c0.y))) +
    s1.y * (s0.x * texture(t, vec2(c0.x, c1.y)) + s1.x * texture(t, vec2(c1.x, c1.y)));
}

float orillaAguada(float valor, float umbral, float ancho) {
  float x = (valor - umbral) / ancho;
  return x > 0.0 ? exp(-x * x) : 0.0;
}

vec3 aguadasDeLuz(vec3 cielo, vec3 escena) {
  float luz = dot(escena, vec3(0.299, 0.587, 0.114)) * 1.25;
  float w = max(fwidth(luz), 1e-4) * 0.75;
  float t1 = smoothstep(uUmbralesAguada.x - w, uUmbralesAguada.x + w, luz);
  float t2 = smoothstep(uUmbralesAguada.y - w, uUmbralesAguada.y + w, luz);
  float t3 = smoothstep(uUmbralesAguada.z - w, uUmbralesAguada.z + w, luz);
  vec3 tono = colorDeEpoca(clamp(escena * (0.75 / max(luz, 0.02)), 0.0, 1.0), 0.75);
  vec3 c1 = mix(cielo * 1.45, vec3(0.58, 0.70, 0.76), 0.14);
  vec3 c2 = tono * 0.9;
  vec3 c3 = mix(tono, vec3(1.0, 0.95, 0.82), 0.55);
  vec3 c = mix(mix(mix(cielo, c1, t1), c2, t2), c3, t3);
  float orillas = max(
    max(orillaAguada(luz, uUmbralesAguada.x, 0.012), orillaAguada(luz, uUmbralesAguada.y, 0.02)),
    orillaAguada(luz, uUmbralesAguada.z, 0.035));
  return c * (1.0 - 0.16 * orillas);
}

vec3 coloresPlanos(vec3 srgb) {
  vec3 lab = oklab(srgb);
  float L = lab.x;
  float w = max(fwidth(L), 1e-4) * 0.75;
  float b0 = smoothstep(uUmbralesBanda.x - w, uUmbralesBanda.x + w, L);
  float b1 = smoothstep(uUmbralesBanda.y - w, uUmbralesBanda.y + w, L);
  float b2 = smoothstep(uUmbralesBanda.z - w, uUmbralesBanda.z + w, L);
  float banda = mix(mix(mix(L, uValoresBanda.x, b0), uValoresBanda.y, b1), uValoresBanda.z, b2);
  lab.x = mix(banda, L, uDegradado);
  lab.yz *= uCroma;
  return srgbDesdeOklab(lab);
}

void main() {
  float escala = uResolucion.y / 720.0;
  vec2 p = vUv * uResolucion / (70.0 * escala) + uHervor.xy;
  vec2 hervor = uHervor.z * escala * (vec2(ruidoPapel(p), ruidoPapel(p.yx + 13.7)) - 0.5) / uResolucion;

  // Fondo: el cielo pintado (con las aguadas de la luz de la escena) o lo que la escena todavía
  // renderiza con materiales realistas, llevado a colores planos de época.
  vec3 escena = texturaBicubica(uColorSuave, vUv + hervor).rgb;
  vec4 cielo = texture(uCielo, vUv);
  vec3 objeto = colorDeEpoca(coloresPlanos(escena), uFuerzaEpoca);
  vec3 c = mix(objeto, aguadasDeLuz(cielo.rgb, texturaBicubica(uAguada, vUv).rgb), cielo.a);
  // Lo que la escena ya dibuja en caricatura (el sistema solar) va con su color, sin aplanar.
  vec4 dibujado = texelFetch(uEscena, ivec2(vUv * vec2(textureSize(uEscena, 0))), 0);
  if (esCaricatura(dibujado.a)) c = srgbDesdeLineal(dibujado.rgb);

  // La noche estrellada del final: cae sobre el cielo como una aguada que baja desde lo alto, con su
  // orilla (las nubes ya hicieron "puf"); lo de abajo pasa a la luz de la luna, salvo lo que flota sin
  // cuerpo (las estrellitas de la cajita).
  if (uNoche > 0.0005) {
    vec3 dValle = direccionEnValle(vUv);
    vec2 caida = caidaNoche(dValle);
    float esNube = dibujado.a > 0.57 && dibujado.a < 0.67 ? 1.0 : 0.0;
    // (Las nubes lejanas también escriben la profundidad del cielo, a propósito: ésas sí se cubren.)
    float sinCuerpo = esCaricatura(dibujado.a) && esNube < 0.5 && texelFetch(uProfundidad, ivec2(vUv * vec2(textureSize(uProfundidad, 0))), 0).r >= 0.99999 ? 1.0 : 0.0;
    c = mix(c, gradoNoche(c), (1.0 - cielo.a * (1.0 - esNube)) * (1.0 - sinCuerpo) * smoothstep(0.0, 0.7, uNoche));
    // (Fuera de ramas por píxel: las pinceladas miden sus derivadas.)
    vec3 noche = nocheEstrellada(dValle);
    c = mix(c, noche * (1.0 - 0.22 * caida.y), caida.x * cielo.a * (1.0 - sinCuerpo));
  }

  // El agujero de caricatura por encima.
  vec4 gas = texture(uGasColor, vUv);
  c = mix(c, srgbDesdeLineal(gas.rgb), clamp(gas.a, 0.0, 1.0) * uGasVisible);

  // Papel de acuarela bajo la pintura.
  c *= 0.93 + 0.1 * papel(vUv * uResolucion, uEscalaPapel);
  if (uSoloTinta > 0.5) c = vec3(0.96, 0.93, 0.86);

  // Tinta: líneas de color entre bandas y contornos negros.
  vec2 lineas = texture(uContornos, vUv).rg;
  c = mix(c, c * 0.5, smoothstep(0.12, 0.4, lineas.g) * 0.8);
  c = mix(c, uTinta, smoothstep(0.08, 0.3, lineas.r));

  // Dentro de una nube: niebla de dibujo, crema rosada con volutas lilas que se abren hacia los
  // bordes al avanzar (la cámara las atraviesa). Al entrar, las volutas cierran desde los bordes;
  // al salir, se abren desde el centro. Tapa también la tinta.
  if (uNiebla > 0.001) {
    vec2 q = (vUv - 0.5) * vec2(uResolucion.x / uResolucion.y, 1.0);
    float r = length(q);
    vec2 d = q / max(r, 1e-4);
    float lejos = log(r + 0.06);
    float v = fbm3(vec3(d * 2.2, lejos * 2.4 - uNieblaAvance));
    v += 0.3 * (fbm3(vec3(d * 5.0 + 7.0, lejos * 4.5 - 2.0 * uNieblaAvance)) - 0.5);
    // Dentro, casi todo claro y rosado (la nube del corazón), con volutas suaves algo más lilas.
    vec3 claro = vec3(1.0, 0.98, 0.94);
    vec3 voluta = vec3(0.86, 0.85, 0.94);
    vec3 niebla = mix(voluta, claro, smoothstep(0.3, 0.56, v));
    niebla = mix(niebla, vec3(1.0, 0.97, 0.95), smoothstep(0.62, 0.76, v) * 0.6);
    niebla = mix(claro, niebla, smoothstep(0.02, 0.5, r));
    float umbral = 1.0 - uNiebla * 1.3;
    float frente = v + 0.35 * r * uNieblaSentido + max(-uNieblaSentido, 0.0) * 0.2 - umbral;
    float cubre = smoothstep(-0.015, 0.015, frente);
    c = mix(c, niebla, cubre);
    // El frente de la niebla, como el borde de una nube de dibujo.
    c = mix(c, voluta * 0.9, (1.0 - smoothstep(0.0, 0.03, abs(frente))) * 0.5 * step(uNiebla, 0.98));
  }
  fragColor = vec4(uAPantalla > 0.5 ? c : linealDesdeSRGB(c), 1.0);
}
`

/**
 * Película antigua, como el filtro de Cuphead y los dibujos de los años 30 que imita: todo cambia a
 * 24 fotogramas por segundo, como en un proyector.
 * - Vaivén del cuadro (la película no pasa perfectamente quieta por la ventanilla).
 * - Tono envejecido: cálido y algo desvaído, negros de tinta vieja y blancos color crema.
 * - Parpadeo del brillo, grano fino (más en los tonos medios), motas de polvo de un fotograma, algún
 *   pelo que se queda unos fotogramas y rayas verticales que duran un rato y se desplazan.
 * - Viñeta.
 * - El iris: un círculo que se cierra o se abre, como las transiciones de los dibujos de la época
 *   (su borde tiembla un poco, dibujado a mano).
 */
export const PELICULA_FRAG = /* glsl */ `
uniform sampler2D uImagen;
// Radio del iris (1 abierto del todo, 0 cerrado).
uniform float uIris;
uniform vec2 uResolucion;
uniform float uFotograma;
uniform float uAPantalla;
// x grano, y polvo (probabilidad de cada mota), z rayas (probabilidad), w parpadeo.
uniform vec4 uPelicula;
// x vaivén (px a 720 de alto), y viñeta, z envejecido.
uniform vec3 uPelicula2;
// Separación de los colores en el borde del cuadro (fracción de la pantalla).
uniform float uAberracion;
// El cielo abierto (A), para quitarle la aberración, y si se aplica (no con el escenario de la canción).
uniform sampler2D uCielo;
uniform float uCieloSinAberracion;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float ruidoValor(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash32(i).x, hash32(i + vec2(1.0, 0.0)).x, u.x), mix(hash32(i + vec2(0.0, 1.0)).x, hash32(i + vec2(1.0, 1.0)).x, u.x), u.y);
}

void main() {
  float escala = uResolucion.y / 720.0;
  float f = uFotograma;
  vec2 px = vUv * uResolucion;

  // Vaivén del cuadro y aberración cromática (la lente del proyector separa un poco los colores hacia
  // los bordes, como en las copias viejas).
  vec2 vaiven = (vec2(hash11(f * 1.37 + 0.1), hash11(f * 2.71 + 5.3)) - 0.5) * vec2(0.5, 1.0) * uPelicula2.x * escala;
  vec2 uvCuadro = vUv + vaiven / uResolucion;
  // Sobre el cielo abierto, casi sin aberración: partía cada estrellita en tres puntos de colores.
  float abierto = uCieloSinAberracion * smoothstep(0.35, 0.75, texture(uCielo, uvCuadro).a);
  vec2 separacion = (vUv - 0.5) * uAberracion * (1.0 - 0.85 * abierto);
  vec3 c = vec3(
    texture(uImagen, uvCuadro + separacion).r,
    texture(uImagen, uvCuadro).g,
    texture(uImagen, uvCuadro - separacion).b);

  // Iris: fuera del círculo, negro (el tono envejecido lo lleva a tinta vieja y la película sigue
  // encima: grano, motas y rayas).
  if (uIris < 0.999) {
    vec2 qi = (vUv - 0.5) * vec2(uResolucion.x / uResolucion.y, 1.0);
    float rMaximo = length(vec2(0.5 * uResolucion.x / uResolucion.y, 0.5));
    float anguloIris = atan(qi.y, qi.x);
    float radioIris = uIris * rMaximo * 1.03 * (1.0 + 0.012 * sin(anguloIris * 5.0 + f * 0.7));
    float w = 1.0 / uResolucion.y;
    c *= 1.0 - smoothstep(radioIris - w, radioIris + w, length(qi));
  }

  // Tono envejecido: un poco de sepia, calidez y un negro de tinta vieja; los colores siguen vivos
  // (el filtro de Cuphead es cálido, no marrón).
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 sepia = L * vec3(1.08, 0.99, 0.80);
  c = mix(c, sepia, 0.1 * uPelicula2.z);
  c *= mix(vec3(1.0), vec3(1.04, 1.01, 0.92), uPelicula2.z);
  c = mix(vec3(0.03, 0.024, 0.019), vec3(0.99, 0.965, 0.895), clamp(c, 0.0, 1.0));

  // Parpadeo del proyector.
  c *= 1.0 + uPelicula.w * (2.0 * hash11(f * 7.13 + 1.7) - 1.0);

  // Grano (algo mayor que un píxel, cambia en cada fotograma).
  float grano = ruidoValor(px / (1.3 * escala) + vec2(f * 37.1, f * 91.7)) - 0.5;
  float medios = 0.35 + 2.6 * L * (1.0 - L);
  c += uPelicula.x * grano * medios;

  // Motas de polvo de un solo fotograma: casi todas oscuras, alguna clara.
  for (int i = 0; i < 8; i++) {
    vec3 h = hash32(vec2(f, float(i) * 3.7 + 1.0));
    if (h.x > uPelicula.y) continue;
    vec3 h2 = hash32(vec2(f * 1.9 + 11.0, float(i) * 5.3));
    vec2 centro = h2.xy * uResolucion;
    float radio = mix(0.7, 3.8, h.y * h.y) * escala;
    vec2 d = px - centro;
    float irregular = 0.75 + 0.5 * ruidoValor(d / radio * 1.3 + h2.z * 40.0);
    float mota = 1.0 - smoothstep(0.6, 1.0, length(d) / (radio * irregular));
    c = mix(c, h.z < 0.8 ? vec3(0.06, 0.045, 0.035) : vec3(0.96, 0.93, 0.85), 0.85 * mota);
  }

  // Un pelo en la ventanilla: aparece de vez en cuando y se queda unos fotogramas.
  float bloque = floor(f / 5.0);
  vec3 hp = hash32(vec2(bloque, 17.0));
  if (hp.x < 0.1 * uPelicula.y / 0.25) {
    vec3 hq = hash32(vec2(bloque, 29.0));
    vec2 centro = vec2(mix(0.05, 0.95, hq.x), mix(0.05, 0.95, hq.y)) * uResolucion;
    float radio = mix(40.0, 120.0, hq.z) * escala;
    float angulo = atan(px.y - centro.y, px.x - centro.x);
    float inicio = hp.y * 6.2831853;
    float tramo = mod(angulo - inicio, 6.2831853);
    float enArco = step(tramo, mix(0.6, 1.6, hp.z));
    float distancia = abs(length(px - centro) - radio * (1.0 + 0.08 * sin(angulo * 5.0 + hq.x * 20.0)));
    float pelo = enArco * (1.0 - smoothstep(0.3 * escala, 1.1 * escala, distancia));
    c = mix(c, vec3(0.07, 0.055, 0.045), 0.8 * pelo);
  }

  // Rayas verticales que duran un segundo y medio y se desplazan despacio.
  for (int i = 0; i < 2; i++) {
    float periodo = floor(f / 36.0) + float(i) * 13.0;
    vec3 hr = hash32(vec2(periodo, 3.0 + float(i)));
    if (hr.x > uPelicula.z) continue;
    float x = (hr.y + 0.004 * sin(f * 0.21 + float(i) * 2.0)) * uResolucion.x;
    float ancho = mix(0.5, 1.3, hr.z) * escala;
    float raya = 1.0 - smoothstep(0.0, ancho, abs(px.x - x));
    float intensidad = (0.25 + 0.35 * hash11(f * 3.3 + float(i) * 11.0)) * (0.55 + 0.45 * ruidoValor(vec2(px.y / (60.0 * escala), periodo)));
    c = mix(c, vec3(0.93, 0.9, 0.82), raya * intensidad);
  }

  // Viñeta.
  vec2 q = vUv - 0.5;
  q.x *= uResolucion.x / uResolucion.y;
  float r = length(q) / length(vec2(0.5 * uResolucion.x / uResolucion.y, 0.5));
  c *= 1.0 - uPelicula2.y * smoothstep(0.35, 1.05, r);

  c = clamp(c, 0.0, 1.0);
  fragColor = vec4(uAPantalla > 0.5 ? c : linealDesdeSRGB(c), 1.0);
}
`

/**
 * Estrellas y destellos de caricatura (ver `utils/destellos.ts`): cada uno es un quad en píxeles de
 * pantalla alrededor de su posición proyectada. Todo va a tiempo con el compás del dibujo
 * (`uPulsaciones`, ver `store/ritmoDibujo.ts`), la mitad en el pulso y la otra mitad a
 * contratiempo:
 *
 * - Las estrellas son puntos de pintura sin contorno (de un píxel los más tenues) y las más claras,
 *   destellos de cuatro puntas pintados. Titilan a mano (cambian con cada dibujo), a veces parpadean
 *   y muy de vez en cuando una se enciende en un destello que se apaga antes del pulso siguiente.
 * - Los granos de la banda, dorados, algo mayores cuanto más cerca pasan de la cámara; unos pocos
 *   se abren en destellos unas pulsaciones de cada tanto.
 * - Cada 16 pulsaciones puede pasar una estrella fugaz (empieza en un pulso y dura algo más de
 *   dos): cabeza de estrella que gira y se estira con la velocidad, estela entintada que se afina
 *   y se desvanece. Sólo sobre cielo abierto y oscuro, en la parte de arriba de la pantalla.
 *
 * Las estrellas sólo se dibujan sobre cielo abierto y oscuro; los granos de la banda, allí donde
 * nada de la escena queda delante (profundidad), y sobre el disco del agujero, que es claro, en
 * blanco.
 */
export const DESTELLO_VERT = /* glsl */ `
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform vec2 uResolucion;
uniform float uDibujo;
uniform float uTiempo;
uniform float uPulsaciones;
uniform sampler2D uCielo;
uniform sampler2D uAguada;
uniform sampler2D uProfundidad;
uniform sampler2D uGasColor;
uniform float uGasVisible;
uniform float uEstrellasVisibles;
uniform float uBandaVisible;

in vec4 aPosicion;
in vec4 aForma;
in float aBrillo;

out vec2 vLocal;
out float vTipo;
out vec3 vRelleno;
// Estrella fugaz: semilargo y semiancho del quad, largo de la estela y radio de la cabeza (px);
// giro y estiramiento de la cabeza.
out vec4 vMedidas;
out vec2 vFugaz;
// 1: estrella del cielo (se tapa por píxel con lo que haya delante); 0: destello de la banda.
out float vDelCielo;
// Brillo (0–1), medio lado del quad y radio del punto, en píxeles.
out float vBrillo;
out float vTamano;
out float vRadio;

const float PI = 3.14159265359;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float luzDeCielo(vec2 uv) {
  vec2 q = clamp(uv, 0.0, 1.0);
  float luz = dot(textureLod(uAguada, q, 0.0).rgb, vec3(0.299, 0.587, 0.114));
  return smoothstep(0.5, 0.9, textureLod(uCielo, q, 0.0).a) * (1.0 - smoothstep(0.05, 0.12, luz));
}

void estrellaFugaz() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (uEstrellasVisibles < 0.5) return;
  float ciclo = floor(uPulsaciones / 16.0);
  if (hash11(ciclo * 3.1 + 0.7) > 0.7) return;
  float inicio = ciclo * 16.0 + 1.0 + floor(hash11(ciclo * 5.7 + 1.3) * 12.0);
  float tau = (uPulsaciones - inicio) / 2.25;
  if (tau < 0.0 || tau > 1.0) return;

  // Camino en píxeles: sale de la parte de arriba y baja en diagonal hacia el lado con más sitio.
  vec2 origen = vec2(mix(0.12, 0.88, hash11(ciclo * 7.7 + 0.1)), mix(0.66, 0.9, hash11(ciclo * 9.1 + 0.2))) * uResolucion;
  float angulo = radians(mix(14.0, 34.0, hash11(ciclo * 4.4 + 0.5)));
  float lado = origen.x < 0.5 * uResolucion.x ? 1.0 : -1.0;
  vec2 dir = vec2(lado * cos(angulo), -sin(angulo));
  float recorrido = mix(0.3, 0.45, hash11(ciclo * 6.6 + 0.6)) * uResolucion.x;
  // La cabeza sale disparada y frena; la cola la alcanza en el último tramo.
  float avance = 1.0 - (1.0 - tau) * (1.0 - tau);
  float tc = clamp((tau - 0.25) / 0.75, 0.0, 1.0);
  float avanceCola = 1.0 - (1.0 - tc) * (1.0 - tc);
  vec2 cabeza = origen + dir * recorrido * avance;
  float largo = min(recorrido * (avance - avanceCola), 0.25 * uResolucion.x);
  vec2 cola = cabeza - dir * largo;
  float visible = min(luzDeCielo(cabeza / uResolucion), min(luzDeCielo(cola / uResolucion), luzDeCielo(mix(cabeza, cola, 0.5) / uResolucion)));
  float aparicion = smoothstep(0.0, 0.06, tau) * (1.0 - smoothstep(0.82, 1.0, tau));
  float radio = 15.0 * (uResolucion.y / 720.0) * visible * aparicion;
  if (radio < 1.0) return;

  vec2 centro = 0.5 * (cabeza + cola) + dir * 0.3 * radio;
  float semiLargo = 0.5 * largo + 1.6 * radio;
  float semiAncho = 1.6 * radio;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 px = centro + dir * position.x * semiLargo + normal * position.y * semiAncho;
  gl_Position = vec4(px / uResolucion * 2.0 - 1.0, 0.0, 1.0);
  vLocal = position.xy;
  vTipo = 3.0;
  vDelCielo = 1.0;
  vRelleno = vec3(1.0, 0.94, 0.68);
  vMedidas = vec4(semiLargo, semiAncho, largo, radio);
  // Gira hacia donde va y se estira con la velocidad (rubber hose).
  vFugaz = vec2(-lado * 9.0 * tau, 1.0 + 0.4 * (1.0 - tau));
}

void main() {
  vMedidas = vec4(1.0);
  vFugaz = vec2(0.0, 1.0);
  vDelCielo = 1.0;
  vBrillo = 1.0;
  vTamano = 1.0;
  vRadio = 0.5;
  if (aPosicion.w > 1.5) {
    estrellaFugaz();
    return;
  }
  bool esBanda = aPosicion.w > 0.5;
  vDelCielo = esBanda ? 0.0 : 1.0;
  vec3 mundo;
  if (esBanda) {
    // Órbita lenta alrededor del agujero, más rápida cerca (kepleriana, muy ralentizada).
    float r = length(aPosicion.xz);
    float angulo = 0.9 * pow(max(r, 1.0), -1.5) * uTiempo;
    float c = cos(angulo);
    float s = sin(angulo);
    mundo = vec3(c * aPosicion.x - s * aPosicion.z, aPosicion.y, s * aPosicion.x + c * aPosicion.z);
  } else {
    mundo = uPosCamara + aPosicion.xyz * 1000.0;
  }
  vec4 clip = uVistaProyeccion * vec4(mundo, 1.0);
  if (clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 ndc = clip.xyz / clip.w;
  vec2 uv = ndc.xy * 0.5 + 0.5;
  vec2 uvc = clamp(uv, 0.0, 1.0);
  float visible;
  if (esBanda) {
    float delante = textureLod(uProfundidad, uvc, 0.0).r;
    // (Lo que tapa el agujero lo decide cada píxel, ver DESTELLO_FRAG.) Los que pasan muy cerca de
    // la cámara se desvanecen: al cruzar la nube de polvo en la caída eran un enjambre de puntos.
    visible = uBandaVisible * step(ndc.z * 0.5 + 0.5, delante + 2e-4) * smoothstep(6.0, 14.0, length(mundo - uPosCamara));
  } else {
    visible = uEstrellasVisibles * luzDeCielo(uvc);
  }
  if (visible < 0.05 || any(lessThan(uv, vec2(-0.05))) || any(greaterThan(uv, vec2(1.05)))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float tipo = aForma.w;
  float semilla = aForma.y;
  float azar = hash11(semilla * 7.31 + 1.7);
  // La mitad va con el pulso y la otra mitad a contratiempo.
  float n = uPulsaciones + 0.5 * step(0.5, hash11(semilla * 3.17 + 0.3));
  float escalaPantalla = uResolucion.y / 720.0;
  float tamano = aForma.x * escalaPantalla;
  if (esBanda) {
    // Perspectiva: los granos que pasan cerca de la cámara, algo mayores (con tope bajo: más grandes
    // eran bolitas, y las chispas tienen que ser finas).
    tamano *= clamp(32.0 / max(length(mundo - uPosCamara), 1.0), 0.75, 1.5);
  }
  // Titileo a mano (cambia con cada dibujo), suave, y algún parpadeo.
  float titileo = 0.9 + 0.12 * sin(uDibujo * 0.45 * aForma.z + semilla);
  float parpadeo = step(0.96, hash11(floor(uDibujo / 3.0) * 1.37 + semilla * 17.0));
  float escala = titileo * mix(1.0, 0.7, parpadeo);
  float brillo = aBrillo * visible * mix(1.0, 0.55, parpadeo);
  float giro = tipo > 0.5 ? 0.1 * sin(uDibujo * 0.3 * aForma.z + semilla * 3.0) : 0.0;
  if (esBanda) {
    if (tipo > 0.5) {
      // Destello de la banda: se abre unas pulsaciones de cada tanto (el ciclo empieza en un
      // pulso) y el resto del tiempo es un grano algo mayor que los demás.
      float periodo = 3.0 + floor(4.0 * azar);
      float c = mod(floor(n) + floor(hash11(semilla * 5.3) * periodo), periodo) + fract(n);
      float vida = smoothstep(0.0, 0.2, c) * (1.0 - smoothstep(1.3, 2.0, c));
      tipo = vida > 0.35 ? 1.0 : 0.0;
      escala *= mix(0.45, 1.0, vida);
    }
  } else {
    // ¡Ting!: muy de vez en cuando, en un pulso, una estrella se enciende en un destello que gira y
    // se apaga antes del pulso siguiente.
    float ting = step(0.988, hash11(floor(n) * 0.619 + semilla * 13.7));
    float f = fract(n);
    float destello = ting * smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.45, 0.95, f));
    tamano = mix(tamano, max(2.2 * tamano, 6.5 * escalaPantalla), destello);
    brillo = mix(brillo, visible, destello);
    giro += 0.8 * destello;
    if (destello > 0.3) tipo = 1.0;
  }

  // Relleno: casi todas crema blanca; algunas doradas, rosadas o celestes (tintes de época). Los
  // granos de la banda, dorados (más claros cerca del agujero, alguno melocotón).
  float tono = hash11(semilla * 11.1 + 4.2);
  vec3 relleno = tono < 0.6 ? vec3(1.0, 0.96, 0.84)
    : tono < 0.82 ? vec3(1.0, 0.88, 0.62)
    : tono < 0.92 ? vec3(1.0, 0.83, 0.79)
    : vec3(0.82, 0.93, 1.0);
  if (esBanda) {
    vec3 oro = mix(vec3(1.0, 0.96, 0.84), vec3(1.0, 0.86, 0.58), smoothstep(16.0, 70.0, length(aPosicion.xz)));
    oro = mix(oro, vec3(1.0, 0.8, 0.62), 0.4 * step(0.75, tono));
    relleno = oro;
  }
  vRelleno = relleno;
  vBrillo = brillo;

  tamano *= escala;
  // El punto mide "tamano" de diámetro; el quad, al menos un par de píxeles para que salga.
  float semiLado = max(tamano, 1.5);
  vTamano = semiLado;
  vRadio = 0.5 * tamano;
  vec2 esquina = position.xy;
  vec2 rotada = vec2(cos(giro) * esquina.x - sin(giro) * esquina.y, sin(giro) * esquina.x + cos(giro) * esquina.y);
  gl_Position = vec4(ndc.xy + rotada * semiLado / uResolucion * 2.0, 0.0, 1.0);
  vLocal = esquina;
  vTipo = tipo;
}
`

export const DESTELLO_FRAG = /* glsl */ `
uniform vec3 uTinta;
uniform sampler2D uCielo;
uniform vec2 uResolucion;
uniform sampler2D uGasColor;
uniform float uGasVisible;

in vec2 vLocal;
in float vTipo;
in vec3 vRelleno;
in vec4 vMedidas;
in vec2 vFugaz;
in float vDelCielo;
in float vBrillo;
in float vTamano;
in float vRadio;
out vec4 fragColor;

// Lo del cielo, detrás de todo: sólo donde el cielo está abierto en ese píxel (antes bastaba con
// el centro de la estrella y una junto a un planeta se dibujaba encima de él).
float cieloEnPixel() {
  if (vDelCielo < 0.5) return 1.0;
  return smoothstep(0.35, 0.75, texture(uCielo, gl_FragCoord.xy / uResolucion).a);
}

// Distancia con signo a una estrella de cinco puntas (Íñigo Quílez): r radio de las puntas,
// rf cuánto se hinchan los lados (1 = casi un pentágono).
float estrella5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Cápsula de radios distintos (Íñigo Quílez): de (0, 0) con radio r1 a (0, h) con radio r2.
float capsulaDesigual(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

// Estrella fugaz, en píxeles: x hacia donde va, y de través.
vec4 estrellaFugaz() {
  vec2 q = vLocal * vMedidas.xy;
  float largo = vMedidas.z;
  float radio = vMedidas.w;
  vec2 enCabeza = q - vec2(0.5 * largo - 0.3 * radio, 0.0);
  vec2 enCola = q + vec2(0.5 * largo + 0.3 * radio, 0.0);

  // Estela: se afina hacia la cola, crema junto a la cabeza y rosada hacia atrás, y se desvanece.
  float dEstela = capsulaDesigual(vec2(enCola.y, enCola.x), 0.5, 0.42 * radio, max(largo, 1.0));
  float aa = max(fwidth(dEstela), 1e-3);
  float s = clamp(-enCabeza.x / max(largo, 1.0), 0.0, 1.0);
  float desvanece = 1.0 - smoothstep(0.45, 1.0, s);
  float llenoE = (1.0 - smoothstep(-aa, aa, dEstela)) * desvanece;
  // La estela nace por detrás de la cabeza: allí no lleva contorno (asoma entre las puntas).
  float trasCabeza = smoothstep(0.55, 0.85, length(enCabeza) / radio);
  float tintaE = max((1.0 - smoothstep(1.6 - aa, 1.6 + aa, dEstela)) * desvanece - llenoE, 0.0) * trasCabeza;
  vec3 colorE = mix(vec3(1.0, 0.95, 0.76), vec3(1.0, 0.7, 0.62), smoothstep(0.05, 0.75, s));
  // Una raya de brillo por el centro de la estela.
  colorE = mix(colorE, vec3(1.0, 0.99, 0.95), (1.0 - smoothstep(0.12, 0.2, abs(enCola.y) / radio)) * (1.0 - s));

  // Cabeza: estrella de cinco puntas estirada en la dirección del movimiento, girando.
  vec2 h = enCabeza / vec2(vFugaz.y, 1.0 / sqrt(vFugaz.y));
  float c = cos(vFugaz.x);
  float sn = sin(vFugaz.x);
  h = vec2(c * h.x - sn * h.y, sn * h.x + c * h.y);
  float dCabeza = (estrella5(h / radio, 0.6, 0.64) - 0.08) * radio;
  float aaC = max(fwidth(dCabeza), 1e-3);
  float llenoC = 1.0 - smoothstep(-aaC, aaC, dCabeza);
  float tintaC = max(1.0 - smoothstep(0.13 * radio - aaC, 0.13 * radio + aaC, dCabeza) - llenoC, 0.0);
  vec3 colorC = mix(vec3(1.0, 0.94, 0.68), vec3(1.0, 0.995, 0.97), 1.0 - smoothstep(0.0, 0.35, length(h / radio - vec2(-0.12, 0.15))));

  // La cabeza por encima de la estela.
  float alfaE = max(llenoE, tintaE);
  vec3 color = mix(uTinta, colorE, llenoE / max(alfaE, 1e-4));
  float alfaC = max(llenoC, tintaC);
  vec3 cabeza = mix(uTinta, colorC, llenoC / max(alfaC, 1e-4));
  color = mix(color * alfaE, cabeza, alfaC);
  return vec4(color, alfaC + alfaE * (1.0 - alfaC));
}

// Nada se dibuja encima del agujero (disco, anillos, hueco ni sombra), ni las estrellas ni los granos
// de la banda aunque estén delante: de cerca, al cruzar la nube de polvo, tapaban los anillos, y la
// prueba de profundidad (con su margen) dejaba pasar los que estaban unas unidades detrás del disco.
float libreDelAgujero() {
  if (uGasVisible < 0.001) return 1.0;
  return 1.0 - smoothstep(0.25, 0.6, texture(uGasColor, gl_FragCoord.xy / uResolucion).a * uGasVisible);
}

void main() {
  float cielo = cieloEnPixel() * libreDelAgujero();
  if (cielo < 0.01) discard;
  if (vTipo > 2.5) {
    vec4 fugaz = estrellaFugaz() * cielo;
    if (fugaz.a < 0.01) discard;
    fragColor = fugaz;
    return;
  }
  vec2 p = vLocal;
  vec3 relleno = vRelleno;
  float rPx = length(p) * vTamano;
  float lleno;
  if (vTipo > 0.5) {
    // Destello de cuatro puntas pintado: lados cóncavos (|x|^k + |y|^k = r^k) que se afinan hacia
    // las puntas, un cuerpo redondo en el centro y el centro casi blanco. Sin contorno.
    vec2 a = abs(p) + 1e-4;
    const float K = 0.5;
    float f = pow(a.x / 0.92, K) + pow(a.y / 0.92, K);
    float aa = fwidth(f);
    lleno = max(1.0 - smoothstep(1.0 - aa, 1.0 + aa, f), clamp(0.3 * vTamano + 0.5 - rPx, 0.0, 1.0));
    relleno = mix(relleno, vec3(1.0, 0.99, 0.95), 1.0 - smoothstep(0.0, 0.32, length(p)));
  } else {
    // Punto de pintura: un disco con el borde de un píxel (al menos de 0.8 px de radio: más finos se
    // repartían entre cuatro píxeles y no se veían) y el centro algo más claro.
    lleno = clamp(max(vRadio, 0.8) + 0.5 - rPx, 0.0, 1.0);
    relleno = mix(relleno, vec3(1.0, 0.99, 0.96), 0.6 * (1.0 - smoothstep(0.0, max(0.7 * vRadio, 0.5), rPx)));
  }
  float alfa = lleno * vBrillo * cielo;
  if (alfa < 0.01) discard;
  fragColor = vec4(relleno * alfa, alfa);
}
`

/** Sin dibujo (comparación en desarrollo): la imagen lineal de la escena a la pantalla. */
export const COPIA_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform float uAPantalla;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}

void main() {
  vec3 c = texture(uEntrada, vUv).rgb;
  fragColor = vec4(uAPantalla > 0.5 ? srgbDesdeLineal(c) : c, 1.0);
}
`

/**
 * El escenario de la canción (ver `features/cancion/escenario/Escenario.ts`) sobre el dibujo, antes
 * de la película. Lo pidió el usuario: mientras suena, que se vea que seguimos viajando por el
 * agujero de gusano, con el video por encima, ancho y nítido, el viaje cambiando y el borde del video
 * como el de un libro de cuentos; y, sobre todo, sin exagerar ("se ve horrible, muy exagerado"):
 *
 * - La escena (`uEscena`, su lienzo), casi a pantalla completa, nítida y en el centro de la
 *   pantalla, con un borde de acuarela fino y apenas ondulado (irregular pero delicado). `uZoom` la
 *   acerca un poco al pasar de una escena a otra (la que se va pasa de largo; la que llega viene del
 *   fondo).
 * - Alrededor, el agujero de gusano por el que viajamos (con `uViaje`), tranquilo y con los colores
 *   apagados del dibujo animado, que cambia a lo largo de la canción (`uEstilo`, con decimales al
 *   pasar de uno a otro): el remolino dibujado, un cielo de noche con aguadas y estrellas finas,
 *   nubes pintadas, anillos pintados y nubes de atardecer. Todo converge en un punto (sin el círculo
 *   de la boca) y se mueve despacio.
 * - Encima, nítido (`uEncima`): la letra y el final, que se descubre en un círculo de borde suave
 *   (`uRevelado`).
 */
export const VIAJE_FRAG = /* glsl */ `
uniform sampler2D uDibujo;
uniform sampler2D uEscena;
uniform sampler2D uEncima;
// Proporción de la pantalla (ancho / alto) y un píxel en altos de pantalla.
uniform float uAspecto;
uniform float uPixel;
// Medio ancho y medio alto del recuadro de la escena (en altos de pantalla), su acercamiento y opacidad.
uniform vec2 uMitad;
uniform float uZoom;
uniform float uOpacidadEscena;
uniform float uViaje;
// Qué viaje: 0 el remolino dibujado, 1 el cielo de noche, 2 las nubes, 3 los anillos pintados y 4
// las nubes del atardecer; con decimales, el paso de uno al siguiente.
uniform float uEstilo;
// Radio del círculo por el que se descubre lo de encima (0–1; 1, entero).
uniform float uRevelado;
uniform float uTiempo;

in vec2 vUv;
out vec4 fragColor;

const float TAU = 6.2831853;
const vec3 TINTA = vec3(0.075, 0.058, 0.047);

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float ruido(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * ruido(x);
    x = x * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

// Estrellas finas que salen despacio del fondo del túnel y titilan (puntos, no estelas).
float estrellasFinas(float r, float a) {
  float luz = 0.0;
  for (int capa = 0; capa < 2; capa++) {
    float fc = float(capa);
    float K = 80.0 + fc * 70.0;
    float sector = floor((a / TAU + 0.5) * K);
    float h = hash13(vec3(sector, fc, 7.0));
    if (h < 0.55) continue;
    float angulo = ((sector + 0.25 + 0.5 * hash13(vec3(sector, fc, 3.0))) / K - 0.5) * TAU;
    float vida = fract(h * 13.7 + uTiempo * (0.045 + 0.03 * fc));
    float rs = 0.06 + vida * vida * 1.3;
    float dAngulo = abs(sin(a - angulo)) * r;
    float tam = (0.0012 + 0.0026 * vida) * (0.7 + 0.3 * sin(uTiempo * 2.3 + h * 40.0));
    float punto = 1.0 - smoothstep(0.0, tam, length(vec2(dAngulo, (r - rs) * 0.7)));
    luz += punto * (0.35 + 0.65 * vida);
  }
  return luz;
}

// 0. El remolino dibujado de antes: tres brazos de bandas planas (cálidas cerca del fondo, moradas y
// turquesa hacia fuera) con tinta entre ellas, girando despacio.
vec3 remolino(float r, float a) {
  float rr = max(r, 0.003);
  float u = 3.0 * a / TAU - 1.6 * log(rr) + uTiempo * 0.22;
  float indice = mod(floor(u), 3.0);
  vec3 calido = indice < 0.5 ? vec3(1.0, 0.93, 0.72) : indice < 1.5 ? vec3(1.0, 0.76, 0.34) : vec3(0.97, 0.5, 0.42);
  vec3 morado = indice < 0.5 ? vec3(0.6, 0.5, 0.86) : indice < 1.5 ? vec3(0.34, 0.28, 0.64) : vec3(0.28, 0.56, 0.7);
  float fuera = smoothstep(0.55, 0.95, r);
  vec3 c = mix(calido, morado, fuera) * mix(1.04, 0.92, fract(u));
  // Lo que mide una banda en píxeles (las del fondo, finísimas, se funden en su tono medio).
  float w = 1.67 / rr * uPixel;
  float fina = smoothstep(0.12, 0.3, w);
  c = mix(c, mix(vec3(0.99, 0.74, 0.5), vec3(0.41, 0.45, 0.73), fuera), fina);
  float linea = 1.0 - smoothstep(0.7 * w, 1.7 * w, abs(fract(u + 0.5) - 0.5));
  return mix(c, TINTA, linea * (1.0 - fina)) * 0.9;
}

// 1. Un cielo de noche por el que se avanza: azul de acuarela, aguadas apagadas de violeta y
// turquesa que pasan despacio y estrellas finas.
vec3 cieloDeNoche(float r, float a) {
  vec3 c = mix(vec3(0.15, 0.2, 0.37), vec3(0.08, 0.1, 0.22), smoothstep(0.2, 1.2, r));
  float z = 0.35 / max(r, 0.03) - uTiempo * 0.28;
  vec3 k = vec3(cos(a) * 1.2, sin(a) * 1.2, z * 0.35);
  float n = fbm(k);
  vec3 tono = mix(vec3(0.33, 0.29, 0.52), vec3(0.22, 0.4, 0.48), fbm(k * 1.7 + 4.0));
  c = mix(c, tono, smoothstep(0.45, 0.8, n) * 0.5 * smoothstep(0.08, 0.5, r));
  return c + vec3(1.0, 0.95, 0.82) * estrellasFinas(r, a);
}

// 2 y 4. Entre nubes pintadas que vienen hacia nosotros (sus bordes, como pintados), con estrellas
// finas en lo despejado: lilas y azuladas de noche; rosas, melocotón y oro al atardecer.
vec3 nubes(float r, float a, float calido) {
  vec3 fondo = mix(mix(vec3(0.2, 0.22, 0.4), vec3(0.11, 0.12, 0.26), smoothstep(0.2, 1.2, r)),
                   mix(vec3(0.62, 0.36, 0.38), vec3(0.36, 0.2, 0.28), smoothstep(0.2, 1.2, r)), calido);
  float z = 0.35 / max(r, 0.03) - uTiempo * 0.32;
  vec3 k = vec3(cos(a) * 1.5, sin(a) * 1.5, z * 0.5);
  float n = fbm(k);
  float masa = smoothstep(0.5, 0.56, n) * smoothstep(0.08, 0.45, r);
  vec3 sombra = mix(vec3(0.5, 0.46, 0.68), vec3(0.85, 0.55, 0.5), calido);
  vec3 luz = mix(vec3(0.7, 0.66, 0.84), vec3(1.0, 0.8, 0.58), calido);
  vec3 nube = mix(sombra, luz, smoothstep(0.58, 0.78, n));
  vec3 c = mix(fondo, nube, masa * 0.8);
  vec3 estrella = mix(vec3(1.0, 0.95, 0.82), vec3(1.0, 0.85, 0.5), calido);
  return c + estrella * estrellasFinas(r, a) * (1.0 - masa) * (1.0 - 0.4 * calido);
}

// 3. Anillos pintados que salen del fondo (como el remolino, pero en círculos), en azules y lilas
// apagados, con tinta entre ellos.
vec3 anillosPintados(float r, float a) {
  float rr = max(r, 0.003);
  float u = -1.4 * log(rr) + uTiempo * 0.25 + 0.04 * sin(a * 3.0 + uTiempo * 0.4);
  float indice = mod(floor(u), 3.0);
  vec3 c = indice < 0.5 ? vec3(0.27, 0.43, 0.56) : indice < 1.5 ? vec3(0.34, 0.31, 0.54) : vec3(0.21, 0.31, 0.44);
  c *= mix(1.05, 0.9, fract(u));
  float w = 1.4 / rr * uPixel;
  float fina = smoothstep(0.12, 0.3, w);
  c = mix(c, vec3(0.27, 0.35, 0.5), fina);
  float linea = 1.0 - smoothstep(0.7 * w, 1.7 * w, abs(fract(u + 0.5) - 0.5));
  return mix(c, TINTA, linea * (1.0 - fina) * 0.8);
}

vec3 tunel(int estilo, float r, float a) {
  if (estilo <= 0) return remolino(r, a);
  if (estilo == 1) return cieloDeNoche(r, a);
  if (estilo == 2) return nubes(r, a, 0.0);
  if (estilo == 3) return anillosPintados(r, a);
  return nubes(r, a, 1.0);
}

// El fondo del túnel, con la escena: siempre en el centro de la pantalla (si seguía al eje del
// agujero de gusano, en un móvil en vertical se iba hasta un costado).
const vec2 CENTRO = vec2(0.5);

void main() {
  vec2 q = (vUv - CENTRO) * vec2(uAspecto, 1.0);
  float r = length(q);
  float a = atan(q.y, q.x);

  // La escena: casi a pantalla completa, con un borde de acuarela fino y apenas ondulado, como el de
  // una ilustración de libro (irregular, pero delicado).
  vec2 e = q / (uMitad * uZoom);
  float d = pow(pow(abs(e.x), 4.0) + pow(abs(e.y), 4.0), 0.25);
  vec2 dir = e / max(length(e), 1e-4);
  float ondas = fbm(vec3(dir * 2.5, 4.0)) - 0.5;
  float flecos = fbm(vec3(e * 10.0, 9.0)) - 0.5;
  float dd = d + ondas * 0.07 + flecos * 0.025;
  float m = (1.0 - smoothstep(0.9, 0.99, dd)) * uOpacidadEscena;

  vec3 c = texture(uDibujo, vUv).rgb;
  if (uViaje > 0.001 && m < 0.999) {
    float primero = floor(uEstilo);
    float paso = smoothstep(0.0, 1.0, uEstilo - primero);
    vec3 viaje = tunel(int(primero), r, a);
    if (paso > 0.001) viaje = mix(viaje, tunel(int(primero) + 1, r, a), paso);
    c = mix(c, viaje, uViaje);
  }
  if (m > 0.001) {
    vec3 escena;
    float lb = abs(uZoom - 1.0) * 0.08;
    if (lb < 0.002) escena = texture(uEscena, e * 0.5 + 0.5).rgb;
    else {
      // Al pasar de largo o al llegar, un poco de desenfoque hacia el fondo del túnel.
      float azar = hash13(vec3(gl_FragCoord.xy, floor(uTiempo * 24.0)));
      vec3 suma = vec3(0.0);
      for (int i = 0; i < 8; i++) suma += texture(uEscena, e * (1.0 - (float(i) + azar) / 8.0 * lb) * 0.5 + 0.5).rgb;
      escena = suma / 8.0;
    }
    // Un poco de pigmento acumulado justo en la orilla, como en la acuarela.
    float charco = smoothstep(0.84, 0.92, dd) * (1.0 - smoothstep(0.93, 0.98, dd));
    c = mix(c, escena * (1.0 - 0.08 * charco), m);
  }

  // Encima, nítido: la letra y el final (éste, por un círculo de borde suave).
  vec4 encima = texture(uEncima, vUv);
  if (uRevelado < 0.999) {
    float lejos = length(vec2(0.5 * uAspecto, 0.5)) + 0.25;
    float radio = uRevelado * lejos;
    encima.a *= 1.0 - smoothstep(radio - 0.22, radio, r);
  }
  c = mix(c, encima.rgb, encima.a);
  fragColor = vec4(c, 1.0);
}
`
