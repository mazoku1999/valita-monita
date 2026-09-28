/**
 * Shaders del pase de pintura (`utils/PasoPintura.ts`). La escena 3D se renderiza como siempre y
 * después se REPINTA cada fotograma: se analiza hacia dónde corren las formas (tensor de
 * estructura), se extiende una base de color y encima se colocan miles de pinceladas curvas que
 * siguen ese flujo, cada una con el color de la imagen en su ancla.
 *
 * Todo el lienzo trabaja en sRGB (valores perceptuales, como se mezcla la pintura); la salida se
 * vuelve a lineal sólo si detrás hay otro pase.
 */

import { CIELO_GLSL, CORRIENTE_GLSL, ESTRELLAS_GLSL, OKLAB_GLSL, PALETA_GLSL } from './paleta'

const RUIDO_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Ruido de valor con interpolación quíntica.
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`

// Tejido de lienzo: urdimbre y trama que pasan una por encima de la otra, hilos de grosor algo
// irregular. Devuelve la altura (0–1) en un punto dado en píxeles.
const TELA_GLSL = /* glsl */ `
float tela(vec2 px, float periodo) {
  vec2 p = px / periodo;
  vec2 celda = floor(p);
  vec2 f = fract(p);
  float trama = sin(3.14159265 * f.y);
  float urdimbre = sin(3.14159265 * f.x);
  bool tramaArriba = mod(celda.x + celda.y, 2.0) < 1.0;
  float h = tramaArriba ? trama * (0.55 + 0.45 * urdimbre) : urdimbre * (0.55 + 0.45 * trama);
  return h * (0.8 + 0.4 * ruido(p * 0.37));
}
`

const SRGB_GLSL = /* glsl */ `
vec3 aSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 aLineal(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
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
 * Reducción a 1/4: media de cada bloque de 4×4 píxeles con cuatro lecturas bilineales, en sRGB,
 * y la luminancia en alfa. Es el color que "ve" el pintor: sin el grano de las chispas sueltas.
 */
export const REDUCIR_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform vec2 uTexelEntrada;

in vec2 vUv;
out vec4 fragColor;

${SRGB_GLSL}

void main() {
  vec3 c = texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, -1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, -1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, 1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, 1.0)).rgb;
  vec3 s = aSRGB(0.25 * c);
  fragColor = vec4(s, dot(s, vec3(0.299, 0.587, 0.114)));
}
`

/** Media de bloques de 4×4 con cuatro lecturas bilineales (sin tocar los valores). */
export const PROMEDIO_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform vec2 uTexelEntrada;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = 0.25 * (
    texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, -1.0)) +
    texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, -1.0)) +
    texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, 1.0)) +
    texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, 1.0)));
}
`

/**
 * Tensor de estructura de color (Di Zenzo): suma por canal de (gx², gx·gy, gy²) con Sobel. Los
 * bordes entre colores de igual luminancia (océano y continente) también orientan los trazos.
 */
export const TENSOR_FRAG = /* glsl */ `
uniform sampler2D uReducida;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 fragColor;

vec3 c(float x, float y) {
  return texture(uReducida, vUv + vec2(x, y) * uTexel).rgb;
}

void main() {
  vec3 tl = c(-1.0, 1.0), t = c(0.0, 1.0), tr = c(1.0, 1.0);
  vec3 l = c(-1.0, 0.0), r = c(1.0, 0.0);
  vec3 bl = c(-1.0, -1.0), b = c(0.0, -1.0), br = c(1.0, -1.0);
  vec3 gx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.125;
  vec3 gy = (tl + 2.0 * t + tr - bl - 2.0 * b - br) * 0.125;
  fragColor = vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), 1.0);
}
`

/** Gaussiana separable de 9 lecturas (σ ≈ 1.75 pasos); `uPaso` es el paso en UV. */
export const DESENFOQUE_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform vec2 uPaso;
// Suavizado temporal: mezcla con el resultado del fotograma anterior (1 = sin memoria).
uniform sampler2D uHistoria;
uniform float uMezcla;

in vec2 vUv;
out vec4 fragColor;

void main() {
  const float PESOS[5] = float[](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  vec4 s = texture(uEntrada, vUv) * PESOS[0];
  for (int i = 1; i < 5; i++) {
    vec2 d = uPaso * float(i);
    s += (texture(uEntrada, vUv + d) + texture(uEntrada, vUv - d)) * PESOS[i];
  }
  fragColor = uMezcla < 1.0 ? mix(texture(uHistoria, vUv), s, uMezcla) : s;
}
`

/**
 * Campo de flujo: la dirección a lo largo de los bordes (el autovector menor del tensor) donde la
 * imagen tiene forma, y remolinos donde no la tiene (el cielo vacío), como las pinceladas del
 * cielo de Van Gogh. El tensor fino se suma al de escala gruesa: donde no hay detalle, el pincel
 * sigue la forma grande (la superficie del disco en el sentido de su giro, la curva de un
 * planeta) en vez de un remolino ajeno a ella. Salida: RG dirección unitaria, B coherencia,
 * A fuerza del borde.
 */
export const FLUJO_FRAG = /* glsl */ `
uniform sampler2D uTensor;
uniform sampler2D uTensorGrueso;
uniform sampler2D uTensorFino;
uniform float uPesoGrueso;
// Agujero negro en pantalla: xy posición (uv), z radio de la sombra (fracción de la altura), w peso.
uniform vec4 uAgujero;
uniform float uAspecto;
uniform vec2 uTexel;
uniform float uFuerzaMinima;
uniform float uFuerzaPlena;

in vec2 vUv;
out vec4 fragColor;

${CORRIENTE_GLSL}
${ESTRELLAS_GLSL}

// Dirección de los remolinos en pantalla: perpendicular al gradiente de la corriente del cielo,
// que vive en la esfera celeste (al girar la cámara, los remolinos giran con las estrellas).
vec2 remolino(vec2 uv, vec2 texel) {
  float dx = corrienteCielo(direccionMundo(uv + vec2(texel.x, 0.0))) - corrienteCielo(direccionMundo(uv - vec2(texel.x, 0.0)));
  float dy = corrienteCielo(direccionMundo(uv + vec2(0.0, texel.y))) - corrienteCielo(direccionMundo(uv - vec2(0.0, texel.y)));
  vec2 v = vec2(dy, -dx);
  return dot(v, v) > 1e-14 ? normalize(v) : vec2(1.0, 0.0);
}

void main() {
  vec3 t = texture(uTensor, vUv).xyz + uPesoGrueso * texture(uTensorGrueso, vUv).xyz;
  float E = t.x;
  float F = t.y;
  float G = t.z;
  float d = sqrt(max(0.25 * (E - G) * (E - G) + F * F, 0.0));
  float l1 = 0.5 * (E + G) + d;
  float l2 = 0.5 * (E + G) - d;
  // Autovector mayor (dirección del gradiente) con la forma numéricamente más estable.
  vec2 v1 = vec2(F, l1 - E);
  vec2 v2 = vec2(l1 - G, F);
  vec2 gradiente = dot(v1, v1) > dot(v2, v2) ? v1 : v2;
  gradiente = dot(gradiente, gradiente) > 1e-14 ? normalize(gradiente) : vec2(1.0, 0.0);
  vec2 tangente = vec2(-gradiente.y, gradiente.x);
  float coherencia = (l1 - l2) / (l1 + l2 + 1e-9);
  float fuerza = sqrt(max(l1, 0.0));

  vec2 giro = remolino(vUv, uTexel);
  if (dot(tangente, giro) < 0.0) tangente = -tangente;
  float peso = smoothstep(uFuerzaMinima, uFuerzaPlena, fuerza) * smoothstep(0.02, 0.25, coherencia);
  vec2 direccion = mix(giro, tangente, peso);
  direccion = dot(direccion, direccion) > 1e-10 ? normalize(direccion) : tangente;

  // Remolino alrededor del agujero, como los halos de los astros del cuadro: los trazos giran en
  // círculos a su alrededor hasta unas cuatro veces el radio de la sombra. Donde hay una forma
  // fina y marcada (el haz del disco) manda la forma.
  if (uAgujero.w > 0.0) {
    vec2 q = (vUv - uAgujero.xy) * vec2(uAspecto, 1.0);
    float dA = length(q) / max(uAgujero.z, 1e-4);
    vec3 tf = texture(uTensorFino, vUv).xyz;
    float fuerzaFina = sqrt(max(0.5 * (tf.x + tf.z) + sqrt(max(0.25 * (tf.x - tf.z) * (tf.x - tf.z) + tf.y * tf.y, 0.0)), 0.0));
    float w = uAgujero.w * (1.0 - smoothstep(3.0, 4.6, dA)) * (1.0 - 0.85 * smoothstep(0.035, 0.11, fuerzaFina));
    vec2 circular = dot(q, q) > 1e-12 ? normalize(vec2(-q.y, q.x)) : direccion;
    if (dot(circular, direccion) < 0.0) circular = -circular;
    direccion = normalize(mix(direccion, circular, w) + 1e-6);
  }
  direccion = flujoEstrellas(vUv, uAspecto, direccion);
  fragColor = vec4(direccion, coherencia, fuerza);
}
`

/**
 * Color de pintura a 1/2 de resolución: lo que el pintor pone en cada zona. El cielo abierto
 * (donde la escena no escribió profundidad: ni gas opaco, ni la sombra, ni un planeta) es el azul
 * nocturno en bandas con la luz de la escena y las estrellas pintadas encima; lo demás, su color
 * llevado a la paleta. A: fracción de cielo.
 */
export const PALETA_FRAG = /* glsl */ `
uniform sampler2D uReducida;
uniform sampler2D uProfundidad;
uniform vec2 uTexelEntrada;
uniform float uCieloPintado;
uniform float uAspecto;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}
${PALETA_GLSL}
${CORRIENTE_GLSL}
${CIELO_GLSL}
${ESTRELLAS_GLSL}

void main() {
  vec3 escena = texture(uReducida, vUv).rgb;
  float cielo = 0.0;
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, 1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, 1.0)).r);
  cielo *= 0.25 * uCieloPintado;
  vec3 objeto = mapaVanGogh(escena);
  vec3 nocturno = cieloConLuz(colorCielo(direccionMundo(vUv)), escena);
  float pesoEstrella;
  vec3 estrella = estrellasPintadas(vUv, uAspecto, pesoEstrella);
  nocturno = mix(nocturno, estrella, pesoEstrella);
  fragColor = vec4(mix(objeto, nocturno, cielo), cielo);
}
`

/**
 * Preparación de los pinceles finos a 1/2 de resolución (dos salidas), para que cada vértice de
 * cada pincelada no repita el trabajo:
 * - Realces: el punto más brillante a ±1.6 px (a resolución completa) llevado a la paleta y
 *   aclarado (la luz se pinta con blanco de zinc y limón, no con ocre); en A, cuánto brilla el
 *   vecindario sobre su entorno. Una línea de dos píxeles (el anillo de fotones de lejos) llena
 *   el vecindario en parte y cuenta; una estrellita de un píxel apenas.
 * - Detalle: en R, cuánto difiere el color fino de la pintura del que pone el pincel grueso
 *   (diferencia OKLab): el pincel de detalle va donde el grueso perdería la forma.
 */
export const PINCELES_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform sampler2D uReducidaMedia;
uniform sampler2D uPintura;
uniform vec2 uTexelEntrada;
uniform vec2 uTexelMedia;

in vec2 vUv;
layout(location = 0) out vec4 salidaRealces;
layout(location = 1) out vec4 salidaDetalle;

${OKLAB_GLSL}
${PALETA_GLSL}

float luminancia(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 media4(sampler2D t, vec2 uv, vec2 d) {
  return 0.25 * (
    texture(t, uv + vec2(-d.x, -d.y)).rgb +
    texture(t, uv + vec2(d.x, -d.y)).rgb +
    texture(t, uv + vec2(-d.x, d.y)).rgb +
    texture(t, uv + vec2(d.x, d.y)).rgb);
}

void main() {
  vec3 lineal = vec3(0.0);
  float mejor = -1.0;
  float media = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec3 c = texture(uEntrada, vUv + vec2(float(i), float(j)) * 1.6 * uTexelEntrada).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      media += luminancia(srgbDesdeLineal(c)) / 9.0;
      if (l > mejor) {
        mejor = l;
        lineal = c;
      }
    }
  }
  float entorno = luminancia(media4(uReducidaMedia, vUv, 1.5 * uTexelMedia));
  vec3 lab = oklab(mapaVanGogh(srgbDesdeLineal(lineal)));
  lab.x = mix(lab.x, 0.93, 0.6);
  lab.yz *= 0.75;
  salidaRealces = vec4(srgbDesdeOklab(lab), media - entorno);

  vec3 fina = texture(uPintura, vUv).rgb;
  vec3 gruesa = media4(uPintura, vUv, 1.5 * uTexelMedia);
  salidaDetalle = vec4(length(oklab(fina) - oklab(gruesa)), luminancia(srgbDesdeLineal(lineal)), 0.0, 1.0);
}
`

/**
 * Visibilidad de cada estrella pintada (un píxel por estrella en un objetivo de 16×1): cielo
 * abierto y oscuro en su centro. Una estrella sobre el halo del agujero, el disco o un planeta no
 * se pinta; así se apaga entera en vez de quedar recortada por el brillo.
 */
export const VISIBILIDAD_ESTRELLAS_FRAG = /* glsl */ `
#define MAX_ESTRELLAS 16
uniform vec4 uEstrellas[MAX_ESTRELLAS];
uniform int uNumEstrellas;
uniform sampler2D uProfundidad;
uniform sampler2D uReducida;
uniform float uCieloPintado;

out vec4 fragColor;

void main() {
  int k = int(gl_FragCoord.x);
  if (k >= uNumEstrellas) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 uv = clamp(uEstrellas[k].xy, 0.0, 1.0);
  float cielo = step(0.99999, texture(uProfundidad, uv).r);
  vec3 escena = texture(uReducida, uv).rgb;
  float luz = dot(escena, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(cielo * (1.0 - smoothstep(0.08, 0.3, luz)) * uCieloPintado, 0.0, 0.0, 1.0);
}
`

/**
 * Base del lienzo (la primera mano, diluida): el color de pintura un poco apagado. Asoma sólo en
 * las rendijas entre pinceladas.
 */
export const BASE_FRAG = /* glsl */ `
uniform sampler2D uPintura;
uniform vec2 uResolucion;
uniform float uPeriodoTela;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 salidaAltura;

${RUIDO_GLSL}
${TELA_GLSL}

void main() {
  vec3 c = texture(uPintura, vUv).rgb;
  // Pintura diluida: un poco más apagada y con algo del color crudo de la tela preparada.
  fragColor = vec4(mix(c * 0.85, vec3(0.72, 0.66, 0.55), 0.08), 1.0);
  // Altura: sólo la trama del lienzo bajo una capa fina.
  salidaAltura = vec4(0.04 + 0.1 * tela(vUv * uResolucion, uPeriodoTela), 0.0, 0.0, 1.0);
}
`

/**
 * Pincelada: una tira de 9 secciones instanciada. position.x es la fracción a lo largo del trazo
 * (0 → 1) y position.y el lado (−1 / +1). Cada vértice recorre la línea de flujo desde el ancla
 * hasta su sitio (punto medio, 6 pasos): la pincelada se curva con el campo, como los trazos de
 * los remolinos de Van Gogh.
 */
export const PINCELADA_VERT = /* glsl */ `
uniform sampler2D uFlujo;
uniform sampler2D uColor;
uniform vec2 uTexelColor;
uniform vec2 uResolucion;
uniform float uAncho;
uniform float uLargo;
uniform float uVariacion;
uniform float uDesvio;
// Modo 0 (fondo): el color es la media alrededor del ancla (uDifuminado texels de uColor).
// Modo 1 (detalle): el color fino del ancla, y la pincelada sólo se pinta si difiere del grueso
// más que el umbral (diferencia OKLab): el pincel fino va donde el grueso perdería la forma.
// Modo 2 (realces): toques de luz sobre lo que brilla más que su entorno a resolución completa
// (el anillo de fotones, las chispas, las estrellas), con el color de la imagen sin reducir.
uniform float uModo;
uniform float uDifuminado;
uniform float uUmbralDetalle;
// Lo que prepara PINCELES_FRAG: realces (color y brillo sobre el entorno) y detalle (R: diferencia
// entre el color fino y el grueso; G: luminancia del punto más brillante).
uniform sampler2D uRealces;
uniform sampler2D uDetalle;
// Agujero en pantalla (ver el flujo): el pincel de realces repasa el anillo de fotones entero.
uniform vec4 uAgujero;

in vec2 aAncla;
in vec4 aSemilla;

out vec2 vTrazo;
out vec2 vTamano;
out vec3 vColor;
out vec4 vSemilla;
out float vOpacidad;

${OKLAB_GLSL}
${PALETA_GLSL}

// Color quebrado: como en los cuadros de Van Gogh, junto a cada trazo del color de la zona van
// otros de un pigmento vecino (en el amarillo, alguno naranja o limón; en el azul, alguno
// verdoso o blanquecino) y ninguno sale de la paleta exactamente igual.
vec3 colorQuebrado(vec3 pintura, vec4 semilla) {
  vec3 lab = oklab(pintura);
  int k1;
  int k2;
  float d1;
  float d2;
  pigmentosCercanos(lab, k1, k2, d1, d2);
  bool vecino = semilla.w < 0.24;
  vec3 destino = PIGMENTOS_LAB[vecino ? k2 : k1];
  lab.yz = mix(lab.yz, destino.yz, vecino ? 0.45 : 0.2);
  lab.x = mix(lab.x, destino.x, vecino ? 0.2 : 0.0);
  lab.x *= 0.92 + 0.16 * fract(semilla.w * 7.31 + semilla.x);
  return srgbDesdeOklab(lab);
}

vec3 colorGrueso(vec2 uv, float difuminado) {
  vec2 d = uTexelColor * difuminado;
  return 0.25 * (
    textureLod(uColor, uv + vec2(-d.x, -d.y), 0.0).rgb +
    textureLod(uColor, uv + vec2(d.x, -d.y), 0.0).rgb +
    textureLod(uColor, uv + vec2(-d.x, d.y), 0.0).rgb +
    textureLod(uColor, uv + vec2(d.x, d.y), 0.0).rgb);
}

vec2 rotar(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec2 direccion(vec2 p, float giro) {
  return rotar(textureLod(uFlujo, p / uResolucion, 0.0).xy, giro);
}

float luminancia(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  float u = position.x;
  float lado = position.y;
  vec3 pintura;
  vOpacidad = 1.0;
  if (uModo > 1.5) {
    vec4 realce = textureLod(uRealces, aAncla, 0.0);
    vOpacidad = smoothstep(uUmbralDetalle, uUmbralDetalle * 2.0, realce.a);
    // El anillo de fotones: de lejos mide un par de píxeles y sólo lo tocarían algunas anclas; el
    // pintor sabe dónde está y lo repasa entero allí donde la imagen tiene su luz.
    if (uAgujero.w > 0.0) {
      vec2 q = (aAncla - uAgujero.xy) * vec2(uResolucion.x / uResolucion.y, 1.0);
      float distanciaAnillo = abs(length(q) - uAgujero.z) * uResolucion.y;
      float luzAnillo = textureLod(uDetalle, aAncla, 0.0).g;
      float anillo = uAgujero.w * (1.0 - smoothstep(1.5, 3.5, distanciaAnillo)) * smoothstep(0.3, 0.55, luzAnillo);
      vOpacidad = max(vOpacidad, anillo);
    }
    if (vOpacidad <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    pintura = realce.rgb;
  } else if (uModo > 0.5) {
    vOpacidad = smoothstep(uUmbralDetalle, uUmbralDetalle * 1.8, textureLod(uDetalle, aAncla, 0.0).r);
    if (vOpacidad <= 0.0) {
      // Sin detalle que pintar: el trazo queda fuera del volumen de recorte y no se rasteriza.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    pintura = textureLod(uColor, aAncla, 0.0).rgb;
  } else {
    pintura = uDifuminado > 0.0 ? colorGrueso(aAncla, uDifuminado) : textureLod(uColor, aAncla, 0.0).rgb;
  }
  vec2 centro = aAncla * uResolucion;
  float largo = uLargo * (1.0 + uVariacion * (2.0 * aSemilla.x - 1.0));
  float ancho = uAncho * (1.0 + uVariacion * (2.0 * aSemilla.y - 1.0));
  float giro = uDesvio * (2.0 * aSemilla.z - 1.0);

  float s = (u - 0.5) * largo;
  float sentido = s < 0.0 ? -1.0 : 1.0;
  const int PASOS = 6;
  float h = abs(s) / float(PASOS);
  vec2 p = centro;
  vec2 previa = direccion(centro, giro) * sentido;
  for (int i = 0; i < PASOS; i++) {
    vec2 d = direccion(p, giro);
    if (dot(d, previa) < 0.0) d = -d;
    vec2 dm = direccion(p + d * (0.5 * h), giro);
    if (dot(dm, d) < 0.0) dm = -dm;
    p += dm * h;
    previa = dm;
  }
  vec2 tangente = previa * sentido;
  vec2 normal = vec2(-tangente.y, tangente.x);
  vec2 posicion = p + normal * (lado * 0.5 * ancho);
  gl_Position = vec4(posicion / uResolucion * 2.0 - 1.0, 0.0, 1.0);

  vTrazo = vec2(u, lado);
  vTamano = vec2(largo, ancho);
  vSemilla = aSemilla;
  // Color de pintura bajo el pincel, quebrado por trazo.
  vColor = colorQuebrado(pintura, aSemilla);
}
`

export const PINCELADA_FRAG = /* glsl */ `
uniform float uDepurar;

in vec2 vTrazo;
in vec2 vTamano;
in vec3 vColor;
in vec4 vSemilla;
in float vOpacidad;
layout(location = 0) out vec4 fragColor;
// Grosor de la pintura (empaste): lo usa la luz rasante del pase final.
layout(location = 1) out vec4 salidaAltura;

${RUIDO_GLSL}

void main() {
  float u = vTrazo.x;
  float v = vTrazo.y;
  float largoPx = vTamano.x;
  float anchoPx = vTamano.y;
  vec2 semilla = vSemilla.zw * 97.0;

  // Cerdas: surcos a lo largo del trazo (el ruido cambia deprisa a lo ancho y despacio a lo largo).
  float cerdas = ruido(vec2(v * 6.0 + semilla.x, u * 1.2 + semilla.y));
  float cerdasFinas = ruido(vec2(v * 17.0 + semilla.y, u * 2.5 + semilla.x));
  float fibra = 0.6 * cerdas + 0.4 * cerdasFinas;

  // Borde lateral irregular, con suavizado de un píxel.
  float aa = fwidth(v) * 1.2;
  float limite = 0.8 + 0.2 * fibra;
  float borde = 1.0 - smoothstep(limite - aa, limite + aa, abs(v));

  // Punta redonda donde el pincel se apoya: la distancia desde el inicio (px) frente al casquete.
  float inicioPx = u * largoPx;
  float casquete = 0.5 * anchoPx * (1.0 - sqrt(max(0.0, 1.0 - v * v)));
  float inicio = smoothstep(-1.0, 1.0, inicioPx - casquete);

  // Final seco: cada cerda se queda sin pintura a un largo distinto (cola deshilachada).
  float finCerda = 0.72 + 0.26 * ruido(vec2(v * 9.0 + semilla.x * 0.3, semilla.y));
  float finPx = (finCerda - u) * largoPx;
  float fin = smoothstep(-1.0, 1.0, finPx);
  float seco = smoothstep(0.45, 0.95, u / finCerda);
  float huecos = 1.0 - seco * (1.0 - smoothstep(0.3, 0.55, fibra));

  float alfa = borde * inicio * fin * huecos * vOpacidad;
  if (alfa < 0.003) discard;
  vec3 color = vColor * (0.9 + 0.2 * fibra);
  if (uDepurar > 0.5) {
    color = 0.35 + 0.65 * vec3(hash12(vSemilla.xy * 311.0), hash12(vSemilla.yz * 173.0), hash12(vSemilla.zw * 229.0));
  }
  fragColor = vec4(color * alfa, alfa);
  // Empaste: cresta a lo largo del centro, surcos de las cerdas, más carga donde el pincel se
  // apoya y menos donde se queda seco.
  float perfil = 1.0 - v * v;
  float carga = mix(1.0, 0.55, smoothstep(0.15, 1.0, u));
  float altura = (0.35 + 0.65 * perfil) * carga * (0.62 + 0.38 * fibra);
  salidaAltura = vec4(altura * alfa, 0.0, 0.0, alfa);
}
`

/**
 * Salida: el lienzo (sRGB) a la pantalla tal cual o al siguiente pase en lineal. Con la pintura
 * desactivada (comparación en desarrollo) la entrada es la imagen lineal de la escena.
 */
export const FINAL_FRAG = /* glsl */ `
uniform sampler2D uLienzo;
uniform sampler2D uAltura;
uniform float uAPantalla;
uniform float uEntradaLineal;
uniform float uAspecto;
uniform float uVineta;
// Relieve: paso de la derivada (texels; crece con la resolución para que la luz lea igual los
// trazos, que se miden en fracciones de la altura), fuerza, sombreado y brillo del óleo.
uniform vec2 uTexel;
uniform float uPasoRelieve;
uniform float uRelieve;
uniform float uSombreado;
uniform float uBrillo;

in vec2 vUv;
out vec4 fragColor;

${SRGB_GLSL}

float altura(vec2 uv) {
  return texture(uAltura, uv).r;
}

void main() {
  vec3 c = texture(uLienzo, vUv).rgb;
  if (uEntradaLineal > 0.5) {
    c = aSRGB(c);
  } else {
    // Luz de sala rasante desde arriba a la izquierda sobre el grosor de la pintura.
    vec2 d = uTexel * uPasoRelieve;
    float h = altura(vUv);
    float dx = altura(vUv + vec2(d.x, 0.0)) - altura(vUv - vec2(d.x, 0.0));
    float dy = altura(vUv + vec2(0.0, d.y)) - altura(vUv - vec2(0.0, d.y));
    vec3 n = normalize(vec3(-dx * uRelieve, -dy * uRelieve, 1.0));
    vec3 luz = normalize(vec3(-0.45, 0.55, 0.7));
    float difusa = max(dot(n, luz), 0.0) / luz.z;
    vec3 medio = normalize(luz + vec3(0.0, 0.0, 1.0));
    float especular = pow(max(dot(n, medio), 0.0), 40.0) * smoothstep(0.25, 0.7, h);
    c = c * mix(1.0, difusa, uSombreado) + uBrillo * especular * vec3(1.0, 0.97, 0.9);
  }
  // Viñeta suave, como la luz que cae en el centro de un cuadro colgado.
  vec2 q = (vUv - 0.5) * vec2(uAspecto, 1.0);
  float r = length(q) / length(vec2(0.5 * uAspecto, 0.5));
  c *= 1.0 - uVineta * smoothstep(0.45, 1.05, r);
  fragColor = vec4(uAPantalla > 0.5 ? c : aLineal(c), 1.0);
}
`
