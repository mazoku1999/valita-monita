/**
 * Shaders del pase de pintura (`utils/PasoPintura.ts`). La escena 3D se renderiza como siempre y
 * después se REPINTA cada fotograma: se analiza hacia dónde corren las formas (tensor de
 * estructura), se extiende una base de color y encima se colocan miles de pinceladas curvas que
 * siguen ese flujo, cada una con el color de la imagen en su ancla.
 *
 * Todo el lienzo trabaja en sRGB (valores perceptuales, como se mezcla la pintura); la salida se
 * vuelve a lineal sólo si detrás hay otro pase.
 */

import { CIELO_GLSL, CORRIENTE_GLSL, OKLAB_GLSL, PALETA_GLSL } from './paleta'

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
uniform float uPesoGrueso;
uniform float uAspecto;
uniform vec2 uTexel;
uniform float uFuerzaMinima;
uniform float uFuerzaPlena;

in vec2 vUv;
out vec4 fragColor;

${CORRIENTE_GLSL}

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
  fragColor = vec4(direccion, coherencia, fuerza);
}
`

/**
 * Color de pintura a 1/4 de resolución: lo que el pintor pone en cada zona. El cielo abierto
 * (donde la escena no escribió profundidad: ni gas opaco, ni la sombra, ni un planeta) es el azul
 * nocturno en bandas con la luz de la escena pintada encima; lo demás, su color llevado a la
 * paleta. A: fracción de cielo.
 */
export const PALETA_FRAG = /* glsl */ `
uniform sampler2D uReducida;
uniform sampler2D uProfundidad;
uniform vec2 uTexelEntrada;
uniform float uCieloPintado;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}
${PALETA_GLSL}
${CORRIENTE_GLSL}
${CIELO_GLSL}

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
  fragColor = vec4(mix(objeto, nocturno, cielo), cielo);
}
`

/**
 * Base del lienzo (la primera mano, diluida): el color de pintura un poco apagado. Asoma sólo en
 * las rendijas entre pinceladas.
 */
export const BASE_FRAG = /* glsl */ `
uniform sampler2D uPintura;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uPintura, vUv).rgb;
  fragColor = vec4(c * 0.85, 1.0);
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
uniform vec2 uResolucion;
uniform float uAncho;
uniform float uLargo;
uniform float uVariacion;
uniform float uDesvio;

in vec2 aAncla;
in vec4 aSemilla;

out vec2 vTrazo;
out vec2 vTamano;
out vec3 vColor;
out vec4 vSemilla;

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

vec2 rotar(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec2 direccion(vec2 p, float giro) {
  return rotar(textureLod(uFlujo, p / uResolucion, 0.0).xy, giro);
}

void main() {
  float u = position.x;
  float lado = position.y;
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
  // Color de pintura en el ancla (a 1/4: el color medio bajo el pincel), quebrado por trazo.
  vColor = colorQuebrado(textureLod(uColor, aAncla, 0.0).rgb, aSemilla);
}
`

export const PINCELADA_FRAG = /* glsl */ `
uniform float uDepurar;

in vec2 vTrazo;
in vec2 vTamano;
in vec3 vColor;
in vec4 vSemilla;
out vec4 fragColor;

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

  float alfa = borde * inicio * fin * huecos;
  if (alfa < 0.003) discard;
  vec3 color = vColor * (0.9 + 0.2 * fibra);
  if (uDepurar > 0.5) {
    color = 0.35 + 0.65 * vec3(hash12(vSemilla.xy * 311.0), hash12(vSemilla.yz * 173.0), hash12(vSemilla.zw * 229.0));
  }
  fragColor = vec4(color * alfa, alfa);
}
`

/**
 * Salida: el lienzo (sRGB) a la pantalla tal cual o al siguiente pase en lineal. Con la pintura
 * desactivada (comparación en desarrollo) la entrada es la imagen lineal de la escena.
 */
export const FINAL_FRAG = /* glsl */ `
uniform sampler2D uLienzo;
uniform float uAPantalla;
uniform float uEntradaLineal;
uniform float uAspecto;
uniform float uVineta;

in vec2 vUv;
out vec4 fragColor;

${SRGB_GLSL}

void main() {
  vec3 c = texture(uLienzo, vUv).rgb;
  if (uEntradaLineal > 0.5) c = aSRGB(c);
  // Viñeta suave, como la luz que cae en el centro de un cuadro colgado.
  vec2 q = (vUv - 0.5) * vec2(uAspecto, 1.0);
  float r = length(q) / length(vec2(0.5 * uAspecto, 0.5));
  c *= 1.0 - uVineta * smoothstep(0.45, 1.05, r);
  fragColor = vec4(uAPantalla > 0.5 ? c : aLineal(c), 1.0);
}
`
