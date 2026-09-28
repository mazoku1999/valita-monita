/**
 * Shaders del dibujo animado (`utils/PasoDibujo.ts`). La escena 3D se renderiza como siempre y
 * después se DIBUJA cada fotograma: colores planos por bandas y contornos de tinta que siguen los
 * bordes. Todo el dibujo trabaja en sRGB (como se pintaban los acetatos); la salida se vuelve a
 * lineal sólo si detrás hay otro pase.
 */

import { CIELO_ACUARELA_GLSL, PALETA_EPOCA_GLSL, PAPEL_GLSL, RUIDO3_GLSL } from './acuarela'

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
 * Cielo en acuarela a 1/2 de resolución (su dibujo es amplio) y máscara del cielo abierto en A: donde
 * la escena no escribió profundidad (ni planeta, ni la sombra del agujero, ni gas denso). Dentro
 * del horizonte, antes de que aparezca la boca del agujero de gusano, no hay cielo: es oscuridad.
 */
export const CIELO_FRAG = /* glsl */ `
uniform sampler2D uProfundidad;
uniform vec2 uTexelEntrada;
uniform float uCieloPintado;

in vec2 vUv;
out vec4 fragColor;

${RUIDO3_GLSL}
${CIELO_ACUARELA_GLSL}

void main() {
  float cielo = 0.0;
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, 1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, 1.0)).r);
  fragColor = vec4(cieloAcuarela(direccionMundo(vUv)), 0.25 * cielo * uCieloPintado);
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
// Cielo en acuarela (RGB) y máscara del cielo abierto (A), ver CIELO_FRAG.
uniform sampler2D uCielo;
// La luz de la escena muy suavizada (a 1/4): las aguadas son manchas amplias y redondas, sin el
// ruido de las chispas en sus orillas.
uniform sampler2D uAguada;
// Aguadas de luz sobre el cielo: umbrales de luminancia (sRGB) de los tres tonos.
uniform vec3 uUmbralesAguada;
// Papel: resolución en píxeles y tamaño del grano.
uniform vec2 uResolucion;
uniform float uEscalaPapel;
uniform float uFuerzaEpoca;
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
${PALETA_EPOCA_GLSL}
${PAPEL_GLSL}

// Lectura bicúbica (B-spline con cuatro lecturas bilineales): las curvas de nivel de una textura
// reducida salen redondas; con la interpolación lineal se veían poligonales, a escalones.
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

// Orilla de acuarela: se oscurece el lado claro de cada umbral (el pigmento que se acumula en el
// borde de una aguada al secarse). Se mide en el propio valor, no con derivadas de pantalla (que
// cambian por bloques de 2×2 píxeles y dejaban el borde dentado): donde la luz cae despacio, la
// orilla es ancha y suave, como en una aguada de verdad.
float orillaAguada(float valor, float umbral, float ancho) {
  float x = (valor - umbral) / ancho;
  return x > 0.0 ? exp(-x * x) : 0.0;
}

// La luz de la escena sobre el cielo: tres aguadas del color de la luz (llevado a la paleta),
// cada una más clara y amarilla, con su orilla.
vec3 aguadasDeLuz(vec3 cielo, vec3 escena) {
  float luz = dot(escena, vec3(0.299, 0.587, 0.114)) * 1.25;
  float w = max(fwidth(luz), 1e-4) * 0.75;
  float t1 = smoothstep(uUmbralesAguada.x - w, uUmbralesAguada.x + w, luz);
  float t2 = smoothstep(uUmbralesAguada.y - w, uUmbralesAguada.y + w, luz);
  float t3 = smoothstep(uUmbralesAguada.z - w, uUmbralesAguada.z + w, luz);
  vec3 tono = colorDeEpoca(clamp(escena * (0.75 / max(luz, 0.02)), 0.0, 1.0), 0.75);
  // La aguada más tenue es cielo aclarado con un toque de la luz (la Vía Láctea, un halo lejano).
  vec3 c1 = mix(cielo * 1.4, tono, 0.2);
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
  vec3 escena = texturaBicubica(uColorSuave, vUv).rgb;
  vec4 cielo = texture(uCielo, vUv);
  vec3 objeto = colorDeEpoca(coloresPlanos(escena), uFuerzaEpoca);
  vec3 c = mix(objeto, aguadasDeLuz(cielo.rgb, texturaBicubica(uAguada, vUv).rgb), cielo.a);
  // Papel de acuarela bajo todo (más visible en lo claro).
  float grano = papel(vUv * uResolucion, uEscalaPapel);
  c *= 0.9 + 0.12 * grano;
  if (uSoloTinta > 0.5) c = vec3(0.96, 0.93, 0.86);
  float respuesta = texture(uLineas, vUv).r;
  float tinta = 1.0 - smoothstep(uUmbral - uSuavidad, uUmbral, respuesta);
  c = mix(c, uTinta, tinta);
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
 */
export const PELICULA_FRAG = /* glsl */ `
uniform sampler2D uImagen;
uniform vec2 uResolucion;
uniform float uFotograma;
uniform float uAPantalla;
// x grano, y polvo (probabilidad de cada mota), z rayas (probabilidad), w parpadeo.
uniform vec4 uPelicula;
// x vaivén (px a 720 de alto), y viñeta, z envejecido.
uniform vec3 uPelicula2;

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

  // Vaivén del cuadro.
  vec2 vaiven = (vec2(hash11(f * 1.37 + 0.1), hash11(f * 2.71 + 5.3)) - 0.5) * vec2(0.5, 1.0) * uPelicula2.x * escala;
  vec3 c = texture(uImagen, vUv + vaiven / uResolucion).rgb;

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
