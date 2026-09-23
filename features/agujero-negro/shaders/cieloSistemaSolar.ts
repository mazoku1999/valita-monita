/**
 * Cielo de fondo del sistema solar: el de una noche oscura de verdad. Estrellas finas (de uno o
 * dos píxeles, casi todas tenues y unas pocas brillantes, con su color de temperatura: azuladas,
 * blancas y anaranjadas) en tres capas de densidad, y la Vía Láctea como en una foto de larga
 * exposición: un río granulado de estrellas diminutas con un resplandor tenue, vetas de polvo
 * oscuro y el bulbo hacia el centro galáctico. La banda va en el mismo plano que la del cielo del
 * otro lado del agujero de gusano, así que al salir por la boca y fundirse un cielo con el otro la
 * Vía Láctea no se mueve.
 */
export const CIELO_SISTEMA_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export const CIELO_SISTEMA_FRAG = /* glsl */ `
precision highp float;

uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
// Orientación del marco del viaje (inversa) y giro acumulado de los cielos, como el agujero de gusano.
uniform mat3 uMarcoInverso;
uniform float uGiro;
uniform float uOpacidad;
// Tamaño angular de un píxel (rad).
uniform float uAnguloPixel;

in vec2 vUv;
out vec4 fragColor;

// Plano de la Vía Láctea: el mismo que la banda del cielo del otro lado del agujero de gusano
// (normalize(0.35, 1, 0.2)).
const vec3 NORMAL_BANDA = vec3(0.3246, 0.9275, 0.1855);

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float suma = 0.0;
  float amplitud = 0.5;
  for (int k = 0; k < 5; k++) {
    suma += amplitud * ruido3(p);
    p = p * 2.03 + vec3(5.1, 1.7, 9.3);
    amplitud *= 0.5;
  }
  return suma / 0.96875;
}

// Color de una estrella según su temperatura (t en 0..1: de 3000 K anaranjada a 12000 K azulada).
vec3 colorEstrella(float t) {
  vec3 fria = vec3(1.0, 0.72, 0.46);
  vec3 solar = vec3(1.0, 0.94, 0.86);
  vec3 caliente = vec3(0.78, 0.86, 1.0);
  return t < 0.5 ? mix(fria, solar, t * 2.0) : mix(solar, caliente, (t - 0.5) * 2.0);
}

// Una capa de estrellas: una por celda de una rejilla 3D sobre la dirección. Distancia angular por
// la cuerda (length(dir − s)): normalize() puede dejar un error de longitud de ~1e-4 y con 1 − dot
// las estrellas salían planas o desaparecían.
vec3 capaEstrellas(vec3 dir, float celdas, float probabilidad, float brillo, float anchura, float semilla) {
  vec3 celda = floor(dir * celdas);
  vec3 luz = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec3 c = celda + vec3(float(i), float(j), float(k));
        vec3 h = hash33(c + semilla);
        if (h.x > probabilidad) continue;
        vec3 s = normalize(c + 0.5 + (hash33(c + semilla + 3.1) - 0.5) * 0.9);
        float angulo = length(dir - s);
        float sigma = uAnguloPixel * anchura;
        float g = exp(-0.5 * angulo * angulo / (sigma * sigma));
        if (g < 1e-4) continue;
        // Ley de magnitudes: muchas tenues, pocas brillantes.
        float m = h.y * h.y * h.y * h.y;
        luz += colorEstrella(h.z) * brillo * (0.08 + m) * g;
      }
    }
  }
  return luz;
}

// Perfil de la banda en una dirección: ancho y brillo crecen hacia el centro galáctico (el bulbo).
float perfilBanda(vec3 n, out float haciaNucleo) {
  vec3 ejeBanda = normalize(cross(NORMAL_BANDA, vec3(0.0, 0.0, 1.0)));
  vec3 ejeBanda2 = cross(NORMAL_BANDA, ejeBanda);
  float d = dot(n, NORMAL_BANDA);
  vec3 dirNucleo = normalize(ejeBanda * 0.8 + ejeBanda2 * 0.6);
  haciaNucleo = 0.5 + 0.5 * dot(normalize(n - NORMAL_BANDA * d), dirNucleo);
  float anchura = 0.004 + 0.012 * haciaNucleo * haciaNucleo;
  return exp(-d * d / anchura);
}

vec3 cielo(vec3 n) {
  vec3 luz = capaEstrellas(n, 62.0, 0.55, 0.05, 0.55, 1.3);
  luz += capaEstrellas(n, 24.0, 0.50, 0.35, 0.65, 7.9);
  luz += capaEstrellas(n, 9.0, 0.40, 2.2, 0.8, 13.7);

  // Vía Láctea: una capa densa de estrellas de un píxel cuya población sigue el perfil de la
  // banda (grumosa), un resplandor tenue de las que no se resuelven y vetas de polvo oscuro que
  // cortan ambas por el centro.
  float haciaNucleo;
  float perfil = perfilBanda(n, haciaNucleo);
  float polvo = smoothstep(0.46, 0.66, fbm3(n * 16.0 + vec3(3.0, 1.0, 7.0)));
  float grumos = 0.55 + 0.45 * fbm3(n * 30.0 + 9.0);
  float velo = 1.0 - 0.8 * polvo * smoothstep(0.35, 0.9, perfil);
  vec3 celda = floor(n * 150.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec3 c = celda + vec3(float(i), float(j), float(k));
        vec3 h = hash33(c + 21.1);
        vec3 s = normalize(c + 0.5 + (hash33(c + 24.2) - 0.5) * 0.9);
        float nucleoEstrella;
        float poblacion = perfilBanda(s, nucleoEstrella);
        if (h.x > 0.85 * poblacion * grumos) continue;
        float angulo = length(n - s);
        float sigma = uAnguloPixel * 0.5;
        float g = exp(-0.5 * angulo * angulo / (sigma * sigma));
        if (g < 1e-3) continue;
        luz += colorEstrella(0.35 + 0.5 * h.z) * (0.03 + 0.09 * h.y * h.y) * g * velo;
      }
    }
  }
  vec3 colorBanda = mix(vec3(0.82, 0.87, 1.0), vec3(1.0, 0.93, 0.84), haciaNucleo);
  luz += colorBanda * perfil * grumos * velo * (0.010 + 0.022 * haciaNucleo * haciaNucleo);
  return luz;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 ojo = uProyInversa * vec4(ndc, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  vec3 dirMundo = normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
  vec3 dirW = normalize(uMarcoInverso * dirMundo);
  float c = cos(uGiro);
  float s = sin(uGiro);
  dirW = vec3(c * dirW.x - s * dirW.y, s * dirW.x + c * dirW.y, dirW.z);
  fragColor = vec4(cielo(dirW) * uOpacidad, 1.0);
}
`
