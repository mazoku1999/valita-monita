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
 * Cielo en acuarela a 1/2 de resolución (su dibujo es amplio) y máscara del cielo abierto en A: donde
 * la escena no escribió profundidad (ni planeta, ni la sombra del agujero, ni gas denso). Dentro
 * del horizonte, antes de que aparezca la boca del agujero de gusano, no hay cielo: es oscuridad.
 */
export const CIELO_FRAG = /* glsl */ `
uniform sampler2D uProfundidad;
uniform vec2 uTexelEntrada;
uniform float uCieloPintado;
// Rayos de sol detrás del agujero (como el fondo de los títulos de Cuphead): posición del agujero en
// pantalla (xy, uv), radio de su sombra (z, fracción de la altura) y peso (w).
uniform vec4 uAgujero;
uniform float uAspecto;
uniform float uTiempo;
uniform float uLatido;

in vec2 vUv;
out vec4 fragColor;

${RUIDO3_GLSL}
${CIELO_ACUARELA_GLSL}

vec3 rayosDeSol(vec2 uv, vec3 cielo) {
  vec2 q = (uv - uAgujero.xy) * vec2(uAspecto, 1.0);
  // Distancia en radios del disco (el disco mide ~4.2 radios de sombra).
  float d = length(q) / max(uAgujero.z * 4.2, 1e-4);
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

void main() {
  float cielo = 0.0;
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, -1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(-1.0, 1.0)).r);
  cielo += step(0.99999, texture(uProfundidad, vUv + uTexelEntrada * vec2(1.0, 1.0)).r);
  vec3 c = cieloAcuarela(direccionMundo(vUv));
  if (uAgujero.w > 0.0) c = rayosDeSol(vUv, c);
  fragColor = vec4(c, 0.25 * cielo * uCieloPintado);
}
`

/**
 * Contornos de tinta a partir de QUÉ HAY en cada píxel, no de la imagen: con el agujero a la vista,
 * los objetos del buffer del agujero (cielo, caras del disco, cantos, anillo, sombra); dentro del
 * horizonte, los saltos de profundidad de la escena (planetas frente al cielo). Para cada píxel se
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
  banda = floor(id.g * 5.0 + 0.5);
  return floor(id.r * 5.0 + 0.5);
}

float zEn(vec2 uv) {
  vec2 t = vec2(textureSize(uProfundidad, 0));
  float d = texelFetch(uProfundidad, ivec2(clamp(uv, 0.0, 0.9999) * t), 0).r;
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
  float z0 = zEn(uv);
  float tinta = 0.0;
  float bandas = 0.0;
  for (int k = 0; k < 12; k++) {
    float a = 6.2831853 * float(k) / 12.0;
    vec2 direccion = vec2(cos(a), sin(a));
    vec2 q = uv + direccion * grosor / uResolucion;
    if (conGas) {
      float banda;
      float objeto = objetoEn(q, banda);
      // El anillo y la sombra se tocan sin línea: el anillo es el borde de la sombra.
      bool pareja = (objeto == 4.0 && objeto0 == 5.0) || (objeto == 5.0 && objeto0 == 4.0);
      if (objeto != objeto0 && !pareja) tinta += 1.0;
      if (objeto0 == 1.0 && k % 2 == 0) {
        float bandaCerca;
        float objetoCerca = objetoEn(uv + direccion * 0.55 * grosor / uResolucion, bandaCerca);
        if (objetoCerca == 1.0 && bandaCerca != banda0) bandas += 1.0;
      }
    } else {
      float z = zEn(q);
      if (abs(z - z0) > 0.06 * min(z, z0)) tinta += 1.0;
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
uniform sampler2D uColorSuave;
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

in vec2 vUv;
out vec4 fragColor;

${OKLAB_GLSL}
${PALETA_EPOCA_GLSL}
${PAPEL_GLSL}

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
// Separación de los colores en el borde del cuadro (fracción de la pantalla).
uniform float uAberracion;

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
  vec2 separacion = (vUv - 0.5) * uAberracion;
  vec3 c = vec3(
    texture(uImagen, uvCuadro + separacion).r,
    texture(uImagen, uvCuadro).g,
    texture(uImagen, uvCuadro - separacion).b);

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
 * pantalla alrededor de su posición proyectada. Titilan (tamaño y un pequeño giro) de un dibujo a
 * otro y de vez en cuando parpadean. Las estrellas sólo se dibujan sobre cielo abierto y oscuro;
 * los destellos de la banda de polvo, allí donde nada de la escena queda delante (profundidad).
 */
export const DESTELLO_VERT = /* glsl */ `
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform vec2 uResolucion;
uniform float uDibujo;
uniform float uTiempo;
uniform sampler2D uCielo;
uniform sampler2D uAguada;
uniform sampler2D uProfundidad;
uniform float uEstrellasVisibles;
uniform float uBandaVisible;

in vec4 aPosicion;
in vec4 aForma;

out vec2 vLocal;
out float vTipo;
out float vBanda;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  bool esBanda = aPosicion.w > 0.5;
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
  float visible;
  if (esBanda) {
    float delante = textureLod(uProfundidad, clamp(uv, 0.0, 1.0), 0.0).r;
    visible = uBandaVisible * step(ndc.z * 0.5 + 0.5, delante + 2e-4);
  } else {
    vec2 uvc = clamp(uv, 0.0, 1.0);
    float luz = dot(textureLod(uAguada, uvc, 0.0).rgb, vec3(0.299, 0.587, 0.114));
    visible = uEstrellasVisibles * smoothstep(0.5, 0.9, textureLod(uCielo, uvc, 0.0).a) * (1.0 - smoothstep(0.05, 0.12, luz));
  }
  if (visible < 0.05 || any(lessThan(uv, vec2(-0.05))) || any(greaterThan(uv, vec2(1.05)))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Titileo: cambia con cada dibujo (a saltos, como dibujado a mano) y de vez en cuando un parpadeo.
  float titileo = 0.82 + 0.3 * sin(uDibujo * 0.45 * aForma.z + aForma.y);
  float parpadeo = step(0.94, hash11(floor(uDibujo / 3.0) * 1.37 + aForma.y * 17.0));
  float tamano = aForma.x * (uResolucion.y / 720.0) * titileo * mix(1.0, 0.4, parpadeo) * visible;
  float giro = aForma.w > 0.5 ? 0.14 * sin(uDibujo * 0.3 * aForma.z + aForma.y * 3.0) : 0.0;
  vec2 esquina = position.xy;
  vec2 rotada = vec2(cos(giro) * esquina.x - sin(giro) * esquina.y, sin(giro) * esquina.x + cos(giro) * esquina.y);
  gl_Position = vec4(ndc.xy + rotada * tamano / uResolucion * 2.0, 0.0, 1.0);
  vLocal = esquina;
  vTipo = aForma.w;
  vBanda = esBanda ? 1.0 : 0.0;
}
`

export const DESTELLO_FRAG = /* glsl */ `
uniform vec3 uTinta;

in vec2 vLocal;
in float vTipo;
in float vBanda;
out vec4 fragColor;

void main() {
  vec2 p = vLocal;
  vec3 relleno = mix(vec3(1.0, 0.94, 0.68), vec3(1.0, 0.84, 0.48), vBanda);
  float lleno;
  float tinta;
  if (vTipo > 0.5) {
    // Destello de cuatro puntas: curva |x|^k + |y|^k = r^k (lados cóncavos), con contorno de tinta.
    vec2 a = abs(p) + 1e-4;
    const float K = 0.55;
    float f = pow(a.x / 0.72, K) + pow(a.y / 0.72, K);
    float fe = pow(a.x / 0.97, K) + pow(a.y / 0.97, K);
    float aa = fwidth(f);
    float aae = fwidth(fe);
    lleno = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, f);
    float exterior = 1.0 - smoothstep(1.0 - aae, 1.0 + aae, fe);
    tinta = max(exterior - lleno, 0.0);
    relleno = mix(relleno, vec3(1.0, 0.99, 0.94), 1.0 - smoothstep(0.0, 0.3, length(p)));
  } else {
    float d = length(p);
    float aa = fwidth(d);
    lleno = 1.0 - smoothstep(0.5 - aa, 0.5 + aa, d);
    float exterior = 1.0 - smoothstep(0.78 - aa, 0.78 + aa, d);
    tinta = 0.8 * max(exterior - lleno, 0.0);
  }
  float alfa = max(lleno, tinta);
  if (alfa < 0.01) discard;
  vec3 color = mix(uTinta, relleno, lleno / max(alfa, 1e-4));
  fragColor = vec4(color * alfa, alfa);
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
