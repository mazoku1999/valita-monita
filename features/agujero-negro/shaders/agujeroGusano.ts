/**
 * Paso por un agujero de gusano, trazado por píxel (el mismo enfoque que el disco: nada es una
 * textura de rayas). Métrica esféricamente simétrica ds² = −dt² + dl² + r(l)²·dΩ² con el perfil
 * de la película (DNeg): una garganta cilíndrica de radio RHO y longitud 2·A y, a cada lado, una
 * campana que se abre suavemente hacia un espacio plano (anchura de lente controlada por M).
 * Geodésicas nulas en el plano de cada rayo: dl/dλ = v, dv/dλ = b²·r'(l)/r³, dφ/dλ = b/r², con
 * b = r(l_c)·sin ψ (ψ = ángulo con el eje). Un rayo que sale por l → +∞ ve el cielo del OTRO
 * lado (galaxia, nebulosas, estrellas); el que vuelve a l → −∞ ve el cielo de este lado (oscuro,
 * con el resplandor cálido del disco a nuestra espalda). Dentro de la garganta los rayos giran en
 * hélice (dφ = tan ψ · dl / RHO): las bocas se ven como esferas delante y detrás y las paredes
 * muestran los dos cielos enrollados y comprimidos hacia los lados, que se retuercen al avanzar.
 * Al mover la cámara (scroll) se promedia el cielo sobre el tramo recorrido en el fotograma
 * (desenfoque de movimiento real): las estrellas se estiran en arcos.
 */
export const AGUJERO_GUSANO_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export const AGUJERO_GUSANO_FRAG = /* glsl */ `
precision highp float;

uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
// Orientación del agujero de gusano (inversa del marco anclado): su eje es -Z en ese marco.
uniform mat3 uMarcoInverso;
// Posición de la cámara a lo largo del eje (l < 0: este lado; l > 0: el otro lado).
uniform float uL;
// Tramo de l recorrido en el fotograma y número de muestras del desenfoque de movimiento (1..4).
uniform float uDeltaL;
uniform int uMuestras;
uniform float uTiempo;
// Giro acumulado de los cielos alrededor del eje (rad): avanza durante el paso y se detiene al salir.
uniform float uGiro;
uniform float uOpacidad;
// Tamaño angular de un píxel (rad): tamaño mínimo de las estrellas.
uniform float uAnguloPixel;
// Luz del cielo de este lado (0..1). Recién cruzado el horizonte, lo que llega desde atrás es la
// luz de fuera alcanzando a una cámara que cae casi a la velocidad de la luz: muy corrida al rojo
// y tenue. Se enciende en el primer tramo del paso, mientras la boca del otro lado crece.
uniform float uLuzCercana;

in vec2 vUv;
out vec4 fragColor;

const float RHO = 1.0;       // radio de la garganta
const float A = 1.5;         // media longitud del tramo cilíndrico
const float M = 0.5;         // anchura de la campana (lente)
const float L_INFINITO = 40.0;
const int PASOS = 200;
const vec3 EJE = vec3(0.0, 0.0, -1.0);
const float PI = 3.14159265;

// Radio de la esfera en l y su derivada (perfil DNeg).
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

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float amplitud = 0.5;
  float suma = 0.0;
  for (int i = 0; i < 4; i++) {
    suma += amplitud * ruido(p);
    p = p * 2.03 + 17.1;
    amplitud *= 0.5;
  }
  return suma;
}

// Estrellas fijas en la esfera celeste: una por celda de una rejilla 3D sobre la dirección,
// gaussianas angulares de al menos ~1 px; muchas tenues y un puñado vivas (ley cúbica).
vec3 estrellas(vec3 dir, float semilla, float celdas, float umbral, float brillo) {
  vec3 celda = floor(dir * celdas);
  vec3 luz = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec3 c = celda + vec3(float(i), float(j), float(k));
        vec3 h = hash33(c + semilla);
        if (h.x > umbral) continue;
        vec3 s = normalize(c + 0.5 + (hash33(c + semilla + 3.1) - 0.5) * 0.9);
        // Distancia angular por la CUERDA, no por 1 − dot: normalize() puede dejar un error de
        // longitud de ~1e-4 (raíz inversa rápida) y entonces 1 − dot se anula sobre un disco de
        // 25 px (estrellas planas) o nunca llega a 0 (estrellas que desaparecen).
        float ang = length(dir - s);
        float m = h.y * h.y * h.y;
        float sigma = uAnguloPixel * (0.7 + 1.3 * m);
        float g = exp(-0.5 * ang * ang / (sigma * sigma));
        if (g < 1e-4) continue;
        vec3 col = mix(vec3(1.0, 0.90, 0.78), vec3(0.99, 0.97, 0.93), smoothstep(0.35, 0.75, h.z));
        col = mix(col, vec3(0.80, 0.88, 1.0), smoothstep(0.85, 1.0, h.z));
        luz += col * brillo * (0.02 + m * m) * g;
      }
    }
  }
  return luz;
}

// El otro lado: estrellas densas, una galaxia de canto con estructura y nebulosas tenues.
vec3 cieloLejano(vec3 n) {
  vec3 luz = estrellas(n, 7.3, 20.0, 0.7, 1.6);
  vec3 normalBanda = normalize(vec3(0.35, 1.0, 0.2));
  vec3 ejeBanda = normalize(cross(normalBanda, vec3(0.0, 0.0, 1.0)));
  vec3 ejeBanda2 = cross(normalBanda, ejeBanda);
  float d = dot(n, normalBanda);
  vec2 enBanda = normalize(vec2(dot(n, ejeBanda), dot(n, ejeBanda2)));
  // Estructura a lo largo de la banda (periódica: coordenadas sobre el círculo) y vetas de polvo
  // que la cruzan a oscuras.
  float estructura = 0.25 + 0.75 * fbm(enBanda * 2.4 + vec2(d * 14.0, 0.0) + 3.7);
  float polvo = 0.35 + 0.65 * smoothstep(0.35, 0.7, fbm(enBanda * 5.0 + vec2(d * 40.0, 2.0) + 9.1));
  float banda = exp(-d * d / 0.0045) * estructura * polvo + exp(-d * d / 0.03) * 0.12 * estructura;
  vec3 dirNucleo = normalize(ejeBanda * 0.8 + ejeBanda2 * 0.6);
  float cercania = 1.0 - dot(n, dirNucleo);
  float nucleo = exp(-cercania * 70.0) * 1.4 + exp(-cercania * 10.0) * 0.12;
  luz += vec3(1.0, 0.92, 0.80) * banda * 0.30 + vec3(1.0, 0.95, 0.85) * nucleo;
  vec2 estereo = n.xy / (1.0 - n.z + 0.05);
  float nebulosa = fbm(estereo * 2.0 + 11.0);
  luz += vec3(0.45, 0.6, 1.0) * nebulosa * nebulosa * 0.04;
  return luz;
}

// Este lado: pocas estrellas tenues y, a nuestra espalda, el resplandor cálido del disco.
vec3 cieloCercano(vec3 n) {
  vec3 luz = estrellas(n, 21.7, 11.0, 0.35, 0.7);
  float atras = max(0.0, dot(n, -EJE));
  luz += vec3(1.0, 0.62, 0.36) * pow(atras, 4.0) * 0.14;
  return luz;
}

// Traza el rayo que sale de la cámara (en l = lc) con dirección dirW (marco del agujero de
// gusano) y devuelve el cielo que ve.
vec3 trazar(vec3 dirW, float lc) {
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
    // Punto medio (RK2): suficiente para un perfil suave.
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
  // Desde aquí el rayo ya es casi recto: le queda girar asin(b / r) hasta el infinito.
  phi += asin(clamp(b / radioEn(l), 0.0, 1.0));
  vec3 n = EJE * cos(phi) + tang * sin(phi);
  if (l > 0.0) return cieloLejano(n);
  // Tenue y más rojo mientras la cámara acaba de caer (ver uLuzCercana).
  vec3 tinteRojo = mix(vec3(1.0, 0.45, 0.25), vec3(1.0), uLuzCercana);
  return cieloCercano(n) * tinteRojo * uLuzCercana;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 ojo = uProyInversa * vec4(ndc, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  vec3 dirMundo = normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
  vec3 dirW = normalize(uMarcoInverso * dirMundo);
  // Giro lento de los cielos alrededor del eje: el paisaje sigue vivo sin scroll durante el paso.
  float c = cos(uGiro);
  float s = sin(uGiro);
  dirW = vec3(c * dirW.x - s * dirW.y, s * dirW.x + c * dirW.y, dirW.z);

  // Desenfoque de movimiento: se promedia el tramo recorrido en el fotograma; el desplazamiento
  // de cada muestra lleva un jitter por píxel para que unas pocas muestras den una estela
  // continua y no copias discretas (el grano del posproceso esconde el ruido).
  int muestras = clamp(uMuestras, 1, 4);
  float jitter = hash12(gl_FragCoord.xy + uTiempo);
  vec3 color = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    if (k >= muestras) break;
    // Con una sola muestra no hay jitter: desplazaría la cámara al azar por píxel y, donde la
    // posición del cielo depende de l (bordes del cuadro), cada estrella se haría una nube.
    float lc = muestras == 1 ? uL : uL - uDeltaL * (float(k) + jitter) / float(muestras);
    color += trazar(dirW, lc);
  }
  color /= float(muestras);
  fragColor = vec4(color * uOpacidad, 1.0);
}
`
