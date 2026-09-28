/**
 * Shaders del pase de pintura (`utils/PasoPintura.ts`). La escena 3D se renderiza como siempre y
 * después se REPINTA cada fotograma: se analiza hacia dónde corren las formas (tensor de
 * estructura), se extiende una base de color y encima se colocan miles de pinceladas curvas que
 * siguen ese flujo, cada una con el color de la imagen en su ancla.
 *
 * Todo el lienzo trabaja en sRGB (valores perceptuales, como se mezcla la pintura); la salida se
 * vuelve a lineal sólo si detrás hay otro pase.
 */

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
uniform float uFuerzaMinima;
uniform float uFuerzaPlena;

in vec2 vUv;
out vec4 fragColor;

${RUIDO_GLSL}

// Función de corriente de los remolinos: su rotacional es un flujo sin fuentes ni sumideros que
// gira alrededor de los máximos y mínimos, a varias escalas.
float corriente(vec2 q) {
  float s = 0.9 * ruido(q * 1.7 + vec2(3.1, 7.7));
  s += 0.45 * ruido(q * 3.4 + vec2(-1.3, 2.9));
  s += 0.2 * ruido(q * 7.1 + vec2(5.3, -4.1));
  return s;
}

vec2 remolino(vec2 q) {
  const float E = 0.004;
  float dx = corriente(q + vec2(E, 0.0)) - corriente(q - vec2(E, 0.0));
  float dy = corriente(q + vec2(0.0, E)) - corriente(q - vec2(0.0, E));
  vec2 v = vec2(dy, -dx);
  return dot(v, v) > 1e-12 ? normalize(v) : vec2(1.0, 0.0);
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

  vec2 q = (vUv - 0.5) * vec2(uAspecto, 1.0);
  vec2 giro = remolino(q);
  if (dot(tangente, giro) < 0.0) tangente = -tangente;
  float peso = smoothstep(uFuerzaMinima, uFuerzaPlena, fuerza) * smoothstep(0.02, 0.25, coherencia);
  vec2 direccion = mix(giro, tangente, peso);
  direccion = dot(direccion, direccion) > 1e-10 ? normalize(direccion) : tangente;
  fragColor = vec4(direccion, coherencia, fuerza);
}
`

/**
 * Base del lienzo (la primera mano, diluida): el color reducido un poco apagado. Asoma sólo en
 * las rendijas entre pinceladas.
 */
export const BASE_FRAG = /* glsl */ `
uniform sampler2D uReducida;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uReducida, vUv).rgb;
  fragColor = vec4(c * 0.9, 1.0);
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
  // Color de la imagen en el ancla (ya reducida: el color medio bajo el pincel).
  vec3 c = textureLod(uColor, aAncla, 0.0).rgb;
  // La pintura nunca sale igual de la paleta: cada trazo algo más claro u oscuro.
  vColor = c * (0.94 + 0.12 * aSemilla.w);
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

in vec2 vUv;
out vec4 fragColor;

${SRGB_GLSL}

void main() {
  vec3 c = texture(uLienzo, vUv).rgb;
  if (uEntradaLineal > 0.5) c = aSRGB(c);
  fragColor = vec4(uAPantalla > 0.5 ? c : aLineal(c), 1.0);
}
`
