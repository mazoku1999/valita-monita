/**
 * Shaders del dibujo animado (`utils/PasoDibujo.ts`). La escena 3D se renderiza como siempre y
 * después se DIBUJA cada fotograma: colores planos por bandas y contornos de tinta que siguen los
 * bordes. Todo el dibujo trabaja en sRGB (como se pintaban los acetatos); la salida se vuelve a
 * lineal sólo si detrás hay otro pase.
 */

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

/** Quad de pantalla completa (PlaneGeometry 2×2). */
export const PANTALLA_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Reducción en sRGB con cuatro lecturas bilineales y la luminancia en alfa: con el texel de
 * entrada completo es la media de bloques de 4×4 (a 1/4); con medio texel, la de bloques de 2×2
 * (a 1/2).
 */
export const REDUCIR_FRAG = /* glsl */ `
uniform sampler2D uEntrada;
uniform vec2 uTexelEntrada;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}

void main() {
  vec3 c = texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, -1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, -1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(-1.0, 1.0)).rgb;
  c += texture(uEntrada, vUv + uTexelEntrada * vec2(1.0, 1.0)).rgb;
  vec3 s = srgbDesdeLineal(0.25 * c);
  fragColor = vec4(s, dot(s, vec3(0.299, 0.587, 0.114)));
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
 * Tensor de estructura de color (Di Zenzo): suma por canal de (gx², gx·gy, gy²) con Sobel. Los
 * bordes entre colores de igual luminancia (océano y continente) también orientan la tinta.
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

/**
 * Orientación de los bordes a partir del tensor suavizado: la tangente (autovector menor) en
 * ángulo doble (cos 2θ, sin 2θ), que se interpola sin saltos de signo; B: coherencia.
 */
export const ORIENTACION_FRAG = /* glsl */ `
uniform sampler2D uTensor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 t = texture(uTensor, vUv).xyz;
  float E = t.x;
  float F = t.y;
  float G = t.z;
  float d = sqrt(max(0.25 * (E - G) * (E - G) + F * F, 0.0));
  float l1 = 0.5 * (E + G) + d;
  float l2 = 0.5 * (E + G) - d;
  vec2 v1 = vec2(F, l1 - E);
  vec2 v2 = vec2(l1 - G, F);
  vec2 gradiente = dot(v1, v1) > dot(v2, v2) ? v1 : v2;
  gradiente = dot(gradiente, gradiente) > 1e-14 ? normalize(gradiente) : vec2(0.0, 1.0);
  vec2 tangente = vec2(-gradiente.y, gradiente.x);
  float coherencia = (l1 - l2) / (l1 + l2 + 1e-9);
  fragColor = vec4(tangente.x * tangente.x - tangente.y * tangente.y, 2.0 * tangente.x * tangente.y, coherencia, 1.0);
}
`

/** Tangente del borde en `uv` a partir de la orientación en ángulo doble (sin sentido propio). */
const TANGENTE_GLSL = /* glsl */ `
vec2 tangenteBorde(sampler2D orientacion, vec2 uv) {
  vec2 doble = texture(orientacion, uv).xy;
  float angulo = 0.5 * atan(doble.y, doble.x);
  return vec2(cos(angulo), sin(angulo));
}
`

/**
 * Primera mitad de la tinta (FDoG): diferencia de gaussianas en 1D A TRAVÉS del borde (a lo largo
 * del gradiente): negativa en el lado oscuro de cada borde, casi nula en las zonas planas.
 *
 * La escena está hecha de resplandores suaves, sin bordes duros: un dibujante no entinta cada
 * degradado, pero sí la silueta de cada cuerpo (el planeta, la sombra del agujero, el gas denso del
 * disco: donde la escena escribió profundidad frente al cielo) y el borde de las formas brillantes.
 * Por eso a la luminancia se le suma un escalón en la silueta y otro suave en un nivel de brillo:
 * esas curvas se vuelven bordes y la tinta las recorre.
 */
export const DOG_FRAG = /* glsl */ `
uniform sampler2D uLuz;
uniform sampler2D uOrientacion;
uniform vec2 uTexel;
uniform float uSigma;
uniform float uK;
uniform float uRho;
// Nivel de luminancia (sRGB) cuya curva se entinta (el borde de las formas brillantes: el disco,
// el anillo, el Sol), ancho del escalón y su peso frente a los bordes de verdad.
uniform vec3 uNivelTinta;
// Siluetas: la profundidad de la escena separa lo que tiene cuerpo (planetas, la sombra del agujero,
// el gas denso del disco) del cielo vacío; ese paso pesa como un borde muy marcado.
uniform sampler2D uProfundidad;
uniform float uPesoSilueta;
// Peso de la "calidez" (rojo − azul): la tierra y el mar, o una nube y el océano, apenas difieren en
// luminosidad pero sí en color; así sus bordes también se entintan.
uniform float uPesoCalidez;

in vec2 vUv;
out vec4 fragColor;

${TANGENTE_GLSL}

float realzar(float l) {
  return l + uNivelTinta.z * smoothstep(uNivelTinta.x - uNivelTinta.y, uNivelTinta.x + uNivelTinta.y, l);
}

float cuerpo(vec2 uv) {
  return 1.0 - step(0.99999, texture(uProfundidad, uv).r);
}

void main() {
  vec2 t = tangenteBorde(uOrientacion, vUv);
  vec2 n = vec2(-t.y, t.x);
  float sc = uSigma;
  float ss = uK * uSigma;
  float radio = ceil(2.5 * ss);
  float sumaC = 0.0;
  float sumaS = 0.0;
  float pesoC = 0.0;
  float pesoS = 0.0;
  for (int i = -8; i <= 8; i++) {
    float x = float(i);
    if (abs(x) > radio) continue;
    vec2 uv = vUv + n * x * uTexel;
    vec4 muestra = texture(uLuz, uv);
    float l = realzar(muestra.a) + uPesoCalidez * (muestra.r - muestra.b) + uPesoSilueta * cuerpo(uv);
    float gc = exp(-0.5 * x * x / (sc * sc));
    float gs = exp(-0.5 * x * x / (ss * ss));
    sumaC += l * gc;
    pesoC += gc;
    sumaS += l * gs;
    pesoS += gs;
  }
  fragColor = vec4(sumaC / pesoC - uRho * sumaS / pesoS, 0.0, 0.0, 1.0);
}
`

/**
 * Segunda mitad de la tinta: la respuesta se suaviza A LO LARGO del borde siguiendo la curva del
 * flujo (integral de convolución de línea): las líneas quedan continuas y sin dientes.
 */
export const LIC_FRAG = /* glsl */ `
uniform sampler2D uRespuesta;
uniform sampler2D uOrientacion;
uniform vec2 uTexel;
uniform float uSigma;

in vec2 vUv;
out vec4 fragColor;

${TANGENTE_GLSL}

void main() {
  float suma = texture(uRespuesta, vUv).r;
  float peso = 1.0;
  float radio = ceil(2.5 * uSigma);
  for (int lado = -1; lado <= 1; lado += 2) {
    vec2 p = vUv;
    vec2 previa = tangenteBorde(uOrientacion, vUv) * float(lado);
    for (int i = 1; i <= 8; i++) {
      if (float(i) > radio) break;
      vec2 t = tangenteBorde(uOrientacion, p);
      if (dot(t, previa) < 0.0) t = -t;
      p += t * uTexel;
      previa = t;
      float g = exp(-0.5 * float(i * i) / (uSigma * uSigma));
      suma += texture(uRespuesta, p).r * g;
      peso += g;
    }
  }
  fragColor = vec4(suma / peso, 0.0, 0.0, 1.0);
}
`

/**
 * Composición a resolución completa: colores planos por bandas de luminosidad (con un poco del
 * degradado original dentro de cada banda y el borde entre bandas suavizado a un píxel) y la tinta
 * encima. La tinta es la respuesta de la FDoG bajo el umbral, con una transición que engorda el
 * trazo donde el borde es más fuerte, como la presión de un pincel.
 */
export const COMPONER_FRAG = /* glsl */ `
uniform sampler2D uColorSuave;
uniform sampler2D uLineas;
// Bandas de color: umbrales de claridad (OKLab) entre bandas y el valor de las tres bandas claras;
// la más oscura no se aplana (el cielo y las sombras conservan su degradado, sin manchas).
uniform vec3 uUmbralesBanda;
uniform vec3 uValoresBanda;
uniform float uDegradado;
uniform float uCroma;
uniform float uUmbral;
uniform float uSuavidad;
uniform vec3 uTinta;
uniform float uAPantalla;
uniform float uSoloTinta;

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}

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
  vec3 c = coloresPlanos(texture(uColorSuave, vUv).rgb);
  if (uSoloTinta > 0.5) c = vec3(0.96, 0.93, 0.86);
  float respuesta = texture(uLineas, vUv).r;
  float tinta = 1.0 - smoothstep(uUmbral - uSuavidad, uUmbral, respuesta);
  c = mix(c, uTinta, tinta);
  fragColor = vec4(uAPantalla > 0.5 ? c : linealDesdeSRGB(c), 1.0);
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
