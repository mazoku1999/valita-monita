/**
 * El agujero de gusano dibujado como un remolino de dibujo animado, con la MISMA geometría que el
 * original (`agujeroGusano.ts`: perfil DNeg, garganta de radio 1 y longitud 3, geodésicas nulas en
 * el plano de cada rayo). Lo que cambia es lo que se ve según a dónde llega cada rayo:
 *
 * - El que cruza la garganta casi derecho (menos de un cuarto de vuelta alrededor del eje) ve el
 *   cielo del otro lado: ese píxel se deja al pase de dibujo, que pinta allí su cielo en acuarela y
 *   sus estrellas. La boca de salida es así una ventana al cielo que crece hasta rodearnos.
 * - El que da vueltas por la garganta (cerca del borde de las bocas y por las paredes) pinta
 *   bandas planas en espiral, cálidas (crema, oro, coral) si acaba al otro lado y moradas si vuelve
 *   a este, con líneas de tinta entre ellas: como las espirales hipnóticas de los dibujos de los
 *   años 30. Las bandas giran despacio y, al avanzar, salen hacia fuera.
 * - El que vuelve a este lado sin enrollarse es la oscuridad del interior del agujero negro, con
 *   el resplandor cálido del disco a nuestra espalda.
 *
 * Sale con la marca de caricatura (alfa 0.5), salvo los píxeles de cielo (alfa 1, negro: el pase
 * los pinta y no dejan luz para las aguadas).
 */
export const AGUJERO_GUSANO_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export const AGUJERO_GUSANO_CARICATURA_FRAG = /* glsl */ `
precision highp float;

uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
// Orientación del agujero de gusano (inversa del marco anclado): su eje es -Z en ese marco.
uniform mat3 uMarcoInverso;
// Posición de la cámara a lo largo del eje (l < 0: este lado; l > 0: el otro lado).
uniform float uL;
uniform float uTiempo;
// Giro acumulado de los cielos alrededor del eje (rad).
uniform float uGiro;
uniform float uOpacidad;

in vec2 vUv;
out vec4 fragColor;

const float RHO = 1.0;
const float A = 1.5;
const float M = 0.5;
const float L_INFINITO = 40.0;
const int PASOS = 200;
const vec3 EJE = vec3(0.0, 0.0, -1.0);
const float PI = 3.14159265;
const vec3 TINTA = vec3(0.075, 0.058, 0.047);
// Brazos de la espiral (un número entero: la costura de atan no se ve).
const float BRAZOS = 3.0;

float radioEn(float l) {
  float d = abs(l) - A;
  if (d <= 0.0) return RHO;
  float x = 2.0 * d / (PI * M);
  return RHO + M * (x * atan(x) - 0.5 * log(1.0 + x * x));
}

float derivadaRadio(float l) {
  float d = abs(l) - A;
  if (d <= 0.0) return 0.0;
  float x = 2.0 * d / (PI * M);
  return (2.0 / PI) * atan(x) * sign(l);
}

// Traza el rayo desde la cámara (en l = lc) y devuelve el ángulo total que gira alrededor del
// agujero (x), el lado al que llega (y: 1 el otro lado, -1 este) y su dirección final (en n).
vec2 trazar(vec3 dirW, float lc, out vec3 n) {
  float cosPsi = dot(dirW, EJE);
  vec3 tang = dirW - EJE * cosPsi;
  float sinPsi = length(tang);
  tang = sinPsi > 1e-5 ? tang / sinPsi : vec3(1.0, 0.0, 0.0);
  float b = radioEn(lc) * sinPsi;
  float l = lc;
  float v = cosPsi;
  float phi = 0.0;
  for (int i = 0; i < PASOS; i++) {
    float r = radioEn(l);
    float h = 0.1 * r;
    float a1 = b * b * derivadaRadio(l) / (r * r * r);
    float lm = l + 0.5 * h * v;
    float vm = v + 0.5 * h * a1;
    float rm = radioEn(lm);
    float a2 = b * b * derivadaRadio(lm) / (rm * rm * rm);
    phi += h * b / (rm * rm);
    l += h * vm;
    v += h * a2;
    if (abs(l) > L_INFINITO) break;
  }
  phi += asin(clamp(b / radioEn(l), 0.0, 1.0));
  n = EJE * cos(phi) + tang * sin(phi);
  return vec2(phi, l > 0.0 ? 1.0 : -1.0);
}

vec4 salida(vec3 srgb) {
  return vec4(pow(clamp(srgb, 0.0, 1.0), vec3(2.2)) * uOpacidad, 0.5);
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

  vec3 n;
  vec2 rayo = trazar(dirW, uL, n);
  float phi = rayo.x;
  bool otroLado = rayo.y > 0.0;
  float cuartos = phi / (0.5 * PI);

  // Posición alrededor del eje (con su costura en dos sitios distintos, para derivar sin saltos).
  float az = atan(dirW.y, dirW.x);
  float az2 = atan(-dirW.y, -dirW.x);
  float wAz = min(fwidth(az), fwidth(az2));
  // Coordenada de las bandas: cuartos de vuelta más los brazos de la espiral, que gira despacio.
  float u = cuartos + BRAZOS * az / (2.0 * PI) + uTiempo * 0.35;
  float wU = max(fwidth(cuartos) + BRAZOS * wAz / (2.0 * PI), 1e-5);

  // Rayos casi derechos: el cielo del otro lado (lo pinta el pase) o la oscuridad de este.
  float wPhi = max(fwidth(cuartos), 1e-5);
  float directo = 1.0 - smoothstep(1.0 - wPhi, 1.0 + wPhi, cuartos);
  if (directo > 0.5 && otroLado) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color;
  if (directo > 0.5) {
    float atras = max(0.0, dot(n, -EJE));
    color = mix(vec3(0.06, 0.045, 0.1), vec3(0.36, 0.17, 0.22), pow(atras, 4.0) * 0.6);
  } else {
    float k = floor(u);
    float indice = mod(k, 3.0);
    vec3 calido = indice < 0.5 ? vec3(1.0, 0.93, 0.72) : indice < 1.5 ? vec3(1.0, 0.76, 0.34) : vec3(0.97, 0.5, 0.42);
    vec3 morado = indice < 0.5 ? vec3(0.6, 0.5, 0.86) : indice < 1.5 ? vec3(0.34, 0.28, 0.64) : vec3(0.28, 0.56, 0.7);
    color = otroLado ? calido : morado;
    // Aerógrafo: cada banda más clara hacia su borde de dentro.
    color *= mix(1.06, 0.9, fract(u));
    // Bandas de menos de unos ocho píxeles se van fundiendo en su tono medio y sin tinta (si no,
    // junto al borde de la boca, donde se apiñan, salía muaré).
    float fina = smoothstep(0.12, 0.3, wU);
    // Justo en el borde de la boca los rayos vecinos caen a un lado o al otro casi al azar: allí
    // los dos tonos medios acaban en uno solo (si no, el borde salía a trazos).
    vec3 medio = otroLado ? vec3(0.99, 0.74, 0.5) : vec3(0.41, 0.45, 0.73);
    medio = mix(medio, vec3(0.78, 0.56, 0.62), smoothstep(0.3, 0.9, wU));
    color = mix(color, medio, fina);
    // Tinta entre bandas.
    float linea = 1.0 - smoothstep(0.7 * wU, 1.7 * wU, abs(fract(u + 0.5) - 0.5));
    color = mix(color, TINTA, linea * (1.0 - fina));
  }
  // Tinta en el borde de la ventana al cielo y del paso a la oscuridad, y donde los rayos vecinos
  // acaban en lados distintos (el filo de la boca): una línea limpia en vez de trazos sueltos.
  float borde = 1.0 - smoothstep(1.2 * wPhi, 2.4 * wPhi, abs(cuartos - 1.0));
  borde = max(borde, step(0.5, fwidth(rayo.y)));
  color = mix(color, TINTA, borde);
  fragColor = salida(color);
}
`
