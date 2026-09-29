import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'
import { BRUMA_GLSL } from './valle'

/**
 * Lo que da vida al final del viaje en el valle (ver `utils/vida.ts`), dibujado como todo lo demás:
 * colores planos, sombra de color y tinta fina. Nada late: las mariposas aletean a su aire, los
 * pétalos y las nubes van con la brisa y los eucaliptos se mecen despacio.
 */

const FORMAS_GLSL = /* glsl */ `
float azarDe(float k, float semilla) {
  return fract(sin(k * 12.9898 + semilla * 78.233) * 43758.5453);
}

float segmento(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  vec2 ap = p - a;
  float h = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  return length(ap - ab * h);
}

// Elipse con signo (aproximada) de centro, radios y giro dados.
float elipse(vec2 p, vec2 centro, vec2 radios, float giro) {
  vec2 q = p - centro;
  float c = cos(giro);
  float s = sin(giro);
  q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  return (length(q / radios) - 1.0) * min(radios.x, radios.y);
}
`

/**
 * Mariposas: dos alas (quads) que giran alrededor del cuerpo. Cada una pasea alrededor de su ancla,
 * aletea (sube despacio, baja de golpe) y a ratos planea con las alas quietas.
 */
export const MARIPOSA_VERT = /* glsl */ `
attribute vec4 aAncla;
attribute vec4 aAzar;

uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uTiempo;
uniform float uPixelesPorRadian;

varying vec2 vAla;
varying float vEspecie;
varying float vLuz;
varying float vDetalle;
varying float vDeCara;

vec3 paseo(float t) {
  float f = 0.75 + 0.5 * aAzar.x;
  return vec3(
    0.9 * sin(t * 0.41 * f + 6.2832 * aAzar.y) + 0.35 * sin(t * 1.07 * f + 6.2832 * aAzar.z),
    0.22 * sin(t * 0.67 * f + 6.2832 * aAzar.w) + 0.07 * sin(t * 2.3 * f + 3.0 * aAzar.x),
    0.9 * sin(t * 0.33 * f + 6.2832 * aAzar.z) + 0.35 * sin(t * 0.97 * f + 6.2832 * aAzar.w)
  );
}

void main() {
  float t = uTiempo + 50.0 * aAzar.x;
  vec3 centro = aAncla.xyz + paseo(t);
  float tamano = aAncla.w;
  float pixeles = tamano / max(distance(centro, uCamara), 1e-3) * uPixelesPorRadian;
  if (pixeles < 1.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vDetalle = smoothstep(5.0, 12.0, pixeles);

  // Hacia dónde vuela (casi en horizontal) y su marco.
  vec3 velocidad = paseo(t + 0.1) - paseo(t);
  vec3 adelante = normalize(vec3(velocidad.x, 0.35 * velocidad.y, velocidad.z) + vec3(1e-4, 0.0, 0.0));
  vec3 derecha = normalize(cross(adelante, vec3(0.0, 1.0, 0.0)));
  vec3 arriba = cross(derecha, adelante);

  float fase = fract(t * (2.2 + 1.3 * aAzar.y));
  float alzado = fase < 0.62 ? smoothstep(0.0, 0.62, fase) : 1.0 - smoothstep(0.62, 1.0, fase);
  float planeo = smoothstep(0.5, 0.8, sin(t * 0.5 + 6.2832 * aAzar.w));
  float angulo = mix(mix(-0.4, 1.3, alzado), 0.3, planeo);
  // Con cada golpe de alas el cuerpo sube un poco.
  centro += arriba * tamano * 0.3 * (0.5 - alzado) * (1.0 - planeo);

  vec3 hacia = derecha * position.z * cos(angulo) + arriba * sin(angulo);
  vec3 punto = centro + adelante * position.y * tamano * 0.8 + hacia * position.x * tamano;
  vec3 normal = normalize(cross(hacia, adelante));
  vLuz = abs(dot(normal, uSol));
  vDeCara = abs(dot(normal, normalize(uCamara - centro)));
  vAla = position.xy;
  vEspecie = fract(aAzar.x * 7.31 + aAzar.w * 3.7);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto, 1.0);
}
`

export const MARIPOSA_FRAG = /* glsl */ `
varying vec2 vAla;
varying float vEspecie;
varying float vLuz;
varying float vDetalle;
varying float vDeCara;

${SALIDA_CARICATURA}
${FORMAS_GLSL}

void main() {
  vec2 p = vAla;
  // Ala delantera, grande y con la punta hacia delante y afuera; trasera, redonda.
  float delantera = elipse(p, vec2(0.48, 0.36), vec2(0.56, 0.34), 0.6);
  float trasera = elipse(p, vec2(0.34, -0.36), vec2(0.36, 0.4), -0.3);
  float ala = min(delantera, trasera);
  float cuerpo = min(length(vec2(p.x, max(abs(p.y + 0.06) - 0.52, 0.0))) - 0.075, length(p - vec2(0.0, 0.62)) - 0.1);
  float antena = min(segmento(p, vec2(0.03, 0.68), vec2(0.24, 1.2)) - 0.014, length(p - vec2(0.24, 1.2)) - 0.045);
  float silueta = min(ala, cuerpo);
  float w = max(fwidth(silueta), 1e-4);
  float wAntena = max(fwidth(antena), 1e-4);
  if (silueta > w && antena > wAntena) discard;

  // Especies: amarilla, monarca, celeste, blanca con la punta oscura y rosada.
  vec3 color = vec3(1.0, 0.66, 0.84);
  vec3 margen = vec3(0.82, 0.26, 0.56);
  float monarca = 0.0;
  if (vEspecie < 0.24) {
    color = vec3(1.0, 0.86, 0.3);
    margen = vec3(0.94, 0.56, 0.14);
  } else if (vEspecie < 0.46) {
    color = vec3(0.99, 0.58, 0.18);
    margen = vec3(0.16, 0.1, 0.08);
    monarca = 1.0;
  } else if (vEspecie < 0.68) {
    color = vec3(0.58, 0.8, 1.0);
    margen = vec3(0.24, 0.38, 0.78);
  } else if (vEspecie < 0.84) {
    color = vec3(1.0, 0.98, 0.94);
    margen = vec3(0.3, 0.27, 0.3);
  }
  bool blanca = vEspecie >= 0.68 && vEspecie < 0.84;

  // Más oscura junto al cuerpo, el margen de otro color (en la blanca, sólo la punta) y una
  // mancha clara en el ala delantera.
  vec3 relleno = mix(color * 0.78, color, smoothstep(0.06, 0.4, p.x));
  float enMargen = blanca ? 1.0 - smoothstep(0.2, 0.23, length(p - vec2(0.9, 0.7))) : 1.0 - smoothstep(0.07, 0.1, -ala);
  // De lejos, el margen oscuro se aclara (la monarca pequeña parecía una mancha negra).
  relleno = mix(relleno, mix(mix(color, margen, 0.4), margen, vDetalle), enMargen);
  float punto = 1.0 - smoothstep(0.018, 0.03, abs(-ala - 0.045));
  punto *= step(0.5, fract(atan(p.y + 0.1, p.x) * 3.2)) * monarca;
  relleno = mix(relleno, vec3(1.0), punto * vDetalle);
  // Venas de la monarca.
  float vena = (1.0 - smoothstep(0.012, 0.03, abs(fract(atan(p.y + 0.05, p.x - 0.02) * 1.9) - 0.5) * length(p))) * monarca * step(0.1, p.x);
  relleno = mix(relleno, margen, vena * vDetalle * 0.9);
  relleno = mix(relleno, mix(color, vec3(1.0), 0.6), (1.0 - smoothstep(0.075, 0.1, length(p - vec2(0.56, 0.44)))) * (1.0 - monarca));
  // Luz: el ala que mira al Sol, más clara.
  relleno *= mix(0.82, 1.04, smoothstep(0.15, 0.55, vLuz));

  vec3 salida = cuerpo < 0.0 ? mix(vec3(0.22, 0.16, 0.14), vec3(0.4, 0.3, 0.26), smoothstep(-0.07, 0.0, -abs(p.x) + 0.02)) : relleno;
  // La tinta, con el tamaño y de cara: pequeña o de canto, la mariposa sería toda contorno.
  float tinta = mix(0.3, 1.0, vDetalle) * smoothstep(0.1, 0.45, vDeCara);
  salida = mix(salida, mix(relleno * 0.6, TINTA, tinta), (1.0 - smoothstep(0.6 * w, 1.6 * w, abs(silueta))) * max(tinta, 0.4));
  salida = mix(salida, TINTA, 1.0 - smoothstep(-wAntena, wAntena, antena));
  gl_FragColor = salidaCaricatura(salida);
}
`

/**
 * Pétalos al viento: cada uno vive en una caja delante de la cámara final (en su marco: a lo ancho,
 * en altura y hacia delante); la brisa lo lleva y, al salir por un lado, vuelve a entrar por el otro
 * (encogido junto a las paredes, para no aparecer de golpe). Gira y se voltea en el aire.
 */
export const PETALO_VERT = /* glsl */ `
attribute vec4 aAzar;
attribute vec4 aAzar2;

uniform vec3 uCamara;
uniform float uTiempo;
uniform float uPixelesPorRadian;
uniform vec3 uCajaOrigen;
uniform vec4 uCajaMarco;
uniform vec3 uCajaDesde;
uniform vec3 uCajaLado;
uniform vec3 uViento;

varying vec2 vLocal;
varying float vColor;
varying float vDorso;
varying float vDetalle;

void main() {
  float t = uTiempo;
  vec3 q = fract(aAzar.xyz + uViento * t * (0.75 + 0.5 * aAzar2.x) / uCajaLado);
  vec3 aPared = min(q, 1.0 - q) * uCajaLado;
  float enCaja = smoothstep(0.0, 0.9, min(aPared.x, min(aPared.y, aPared.z)));
  vec3 local = uCajaDesde + q * uCajaLado;
  local += vec3(sin(t * 1.3 + 6.2832 * aAzar2.y), 0.5 * sin(t * 0.9 + 6.2832 * aAzar2.z), cos(t * 1.1 + 6.2832 * aAzar2.y)) * 0.22;
  vec3 centro = uCajaOrigen + vec3(uCajaMarco.z, 0.0, uCajaMarco.w) * local.x + vec3(0.0, local.y, 0.0) + vec3(uCajaMarco.x, 0.0, uCajaMarco.y) * local.z;

  vColor = fract(aAzar.x * 13.7 + aAzar2.w * 5.3);
  float tamano = (0.026 + 0.016 * aAzar.w) * enCaja;
  float distancia = distance(centro, uCamara);
  // Pegados a la cámara también encogen: nada de manchas que tapen la vista.
  tamano *= smoothstep(0.5, 1.3, distancia);
  float pixeles = tamano / max(distancia, 1e-3) * uPixelesPorRadian;
  if (pixeles < 0.8) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vDetalle = smoothstep(4.0, 9.0, pixeles);

  float giro = 6.2832 * aAzar2.w + t * (0.5 + 1.1 * aAzar.w) * (aAzar2.x < 0.5 ? -1.0 : 1.0);
  float volteo = t * (0.8 + 1.4 * aAzar2.z) + 6.2832 * aAzar.y;
  vDorso = step(cos(volteo), 0.0);
  vec2 esquina = position.xy * vec2(max(abs(cos(volteo)), 0.12), 1.0) * tamano;
  float c = cos(giro);
  float s = sin(giro);
  esquina = vec2(c * esquina.x - s * esquina.y, s * esquina.x + c * esquina.y);
  vec3 derechaCam = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
  vec3 arribaCam = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(centro + derechaCam * esquina.x + arribaCam * esquina.y, 1.0);
}
`

export const PETALO_FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vColor;
varying float vDorso;
varying float vDetalle;

${SALIDA_CARICATURA}

void main() {
  vec2 p = vLocal;
  bool deGirasol = vColor > 0.9;
  // Pétalo del ramo: redondo arriba con una muesca, estrecho en la base; el de girasol, largo.
  float d;
  if (deGirasol) {
    d = (length(p / vec2(0.34, 1.0)) - 1.0) * 0.34;
  } else {
    // Ovalado, más ancho arriba, con una muesca pequeña.
    vec2 q = p * vec2(1.0, 0.92);
    float ancho = 0.8 * (0.72 + 0.28 * smoothstep(-1.0, 0.6, q.y));
    d = (length(vec2(q.x / ancho, q.y)) - 0.95) * ancho;
    d = max(d, -(length(p - vec2(0.0, 1.0)) - 0.14));
  }
  float w = max(fwidth(d), 1e-4);
  if (d > w) discard;
  vec3 color = vColor < 0.34 ? vec3(0.99, 0.74, 0.84) : vColor < 0.58 ? vec3(0.94, 0.36, 0.62) : vColor < 0.76 ? vec3(1.0, 0.93, 0.96) : vColor < 0.9 ? vec3(0.84, 0.64, 0.93) : vec3(1.0, 0.8, 0.24);
  color = mix(color * vec3(0.92, 0.82, 0.88), color, smoothstep(-1.0, 0.1, p.y));
  if (vDorso > 0.5) color *= vec3(0.88, 0.84, 0.94);
  color = mix(color, color * vec3(0.7, 0.55, 0.66), (1.0 - smoothstep(0.5 * w, 1.5 * w, abs(d))) * vDetalle);
  gl_FragColor = salidaCaricatura(color);
}
`

/**
 * Nubes de la mañana: cúmulos de dibujo (una fila de bolas, la del medio mayor, y otra encima más
 * pequeña, sobre una base plana) en carteles que giran sólo en vertical, con cada bola más clara del
 * lado del Sol, la base en sombra lila, un borde rosado de alba, líneas suaves donde una bola monta
 * sobre otra y su tinta. Se dibujan después del suelo, de la más lejana a la más cercana.
 */
export const NUBE_VALLE_VERT = /* glsl */ `
attribute vec4 aCentro;
attribute vec4 aAzar;

uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uTiempo;

varying vec2 vLocal;
varying vec4 vAzar;
varying vec2 vSolLocal;
varying float vBruma;
varying vec3 vColorBruma;
varying float vDelCielo;

${BRUMA_GLSL}

void main() {
  vDelCielo = step(1.0, aAzar.w);
  // Van despacio hacia el oeste con el viento de la mañana.
  vec3 base = aCentro.xyz + vec3(-4.0 * uTiempo, 0.0, 0.0);
  float ancho = aCentro.w;
  vec3 aCamara = uCamara - base;
  vec3 ejeX = normalize(vec3(aCamara.z, 0.0, -aCamara.x));
  // En unidades del medio ancho: x de -1 a 1, y de 0 (la base) a 1.4.
  vLocal = vec2(position.x, (position.y * 0.5 + 0.5) * 1.4);
  vec3 punto = base + ejeX * vLocal.x * ancho + vec3(0.0, vLocal.y * ancho, 0.0);
  vAzar = aAzar;
  vSolLocal = normalize(vec2(dot(uSol, ejeX), dot(uSol, vec3(0.0, 1.0, 0.0))) + 1e-4);
  vBruma = 0.7 * (1.0 - exp(-length(aCamara) / 24000.0));
  vColorBruma = colorBruma(-aCamara, uSol);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto, 1.0);
}
`

export const NUBE_VALLE_FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec4 vAzar;
varying vec2 vSolLocal;
varying float vBruma;
varying vec3 vColorBruma;
varying float vDelCielo;

${SALIDA_CARICATURA}
${FORMAS_GLSL}

// Bola k del cúmulo: 0..5 la fila de abajo (de izquierda a derecha), 6..8 la de arriba. Cada nube
// tiene su forma: más alta o más chata, la cima corrida a un lado, bolas de otro tamaño.
void bola(int k, out vec2 centro, out float radio) {
  float fk = float(k);
  float alta = mix(0.72, 1.25, vAzar.z);
  if (k < 6) {
    float f = fk / 5.0;
    float cima = pow(sin(3.14159 * clamp(f + 0.25 * (vAzar.y - 0.5), 0.0, 1.0)), 0.8);
    radio = (0.19 + 0.25 * cima) * mix(0.8, 1.18, azarDe(fk, vAzar.x)) * mix(1.0, alta, cima);
    centro = vec2(mix(-0.72, 0.72, f) + 0.1 * (azarDe(fk + 9.0, vAzar.y) - 0.5), radio * 0.72);
  } else {
    float f = (fk - 6.0) * 0.5;
    radio = mix(0.15, 0.24, azarDe(fk, vAzar.z)) * (k == 7 ? 1.25 : 1.0) * alta;
    if (azarDe(fk + 1.7, vAzar.x) < 0.3) radio = 0.0;
    centro = vec2(mix(-0.3, 0.3, f) + 0.14 * (azarDe(fk + 3.0, vAzar.w) - 0.5) + 0.3 * (vAzar.y - 0.5), (0.42 + 0.14 * azarDe(fk + 5.0, vAzar.y)) * alta);
  }
}

void main() {
  vec2 p = vLocal;
  // De atrás adelante: la fila de arriba, luego los extremos de abajo y por último el centro.
  const int ORDEN[9] = int[](6, 7, 8, 0, 5, 1, 4, 2, 3);
  vec3 color = vec3(0.0);
  float union_ = 1e3;
  float lineas = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 centro;
    float radio;
    bola(ORDEN[i], centro, radio);
    if (radio <= 0.0) continue;
    vec2 v = p - centro;
    float d = length(v) - radio * (1.0 + 0.05 * sin(6.0 * atan(v.y, v.x) + 6.2832 * azarDe(float(i), vAzar.w)));
    float wd = max(fwidth(d), 1e-5);
    float dentro = 1.0 - smoothstep(-wd, wd, d);
    // La línea de esta bola sobre las que ya había detrás.
    lineas = max(lineas * (1.0 - dentro), (1.0 - smoothstep(0.4 * wd, 1.4 * wd, abs(d))) * step(union_, -wd));
    float luz = dot(v / radio, vSolLocal);
    vec3 tono = mix(vec3(0.95, 0.92, 0.96), vec3(1.0, 0.98, 0.94), smoothstep(-0.05, 0.2, luz));
    tono = mix(tono, vec3(0.8, 0.79, 0.92), 1.0 - smoothstep(-0.55, -0.3, luz));
    tono = mix(tono, vec3(1.0, 0.86, 0.8), smoothstep(0.72, 0.95, length(v) / radio) * smoothstep(0.1, 0.5, luz) * 0.6);
    color = mix(color, tono, dentro);
    union_ = min(union_, d);
  }
  // La base plana, en sombra.
  float d = max(union_, 0.035 - p.y);
  float w = max(fwidth(d), 1e-5);
  if (d > w) discard;
  color = mix(color, vec3(0.8, 0.78, 0.9), 1.0 - smoothstep(0.12 - w, 0.12 + w, p.y));
  color = mix(color, vec3(0.64, 0.62, 0.76), lineas * step(0.14, p.y) * 0.75);
  color = mix(color, TINTA, 1.0 - smoothstep(0.6 * w, 1.6 * w, abs(d)));
  // Las del cielo se quedan con la profundidad del cielo: el pase entinta la cresta que tengan
  // delante y no les pone contorno. Las de las faldas, la suya (tapan la cresta que haya detrás).
  gl_FragDepth = vDelCielo > 0.5 ? max(gl_FragCoord.z, 0.9999905) : gl_FragCoord.z;
  gl_FragColor = salidaCaricatura(mix(color, vColorBruma, vBruma));
}
`

/**
 * Eucaliptos: carteles que giran sólo en vertical, con el tronco claro algo torcido que se abre en
 * ramas y la copa suelta, más alta que ancha, de racimos redondos verde azulado (cada uno más claro
 * del lado del Sol). Se mecen despacio con la brisa y, lejos, se funden con la bruma.
 */
export const ARBOL_VERT = /* glsl */ `
attribute vec4 aBase;
attribute vec4 aAzar;

uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uTiempo;
uniform float uPixelesPorRadian;
uniform float uEscalaPantalla;

varying vec2 vLocal;
varying vec4 vAzar;
varying vec2 vSolLocal;
varying float vBruma;
varying vec3 vColorBruma;
varying float vDetalle;

${BRUMA_GLSL}

void main() {
  vec3 pie = aBase.xyz;
  float altura = aBase.w;
  vec3 aCamara = uCamara - pie;
  float distancia = length(aCamara);
  // Alto en pantalla, en píxeles de una pantalla de 720 (igual en un móvil de mucha densidad).
  float pixeles = altura / max(distancia, 1e-3) * uPixelesPorRadian / max(uEscalaPantalla, 1e-3);
  // Desde el aire, diminutos y entintados, parecían garabatos: aparecen algo más tarde y su tinta
  // llega con el tamaño.
  if (pixeles < 5.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  altura *= smoothstep(5.0, 10.0, pixeles);
  vDetalle = smoothstep(25.0, 70.0, pixeles);
  vec3 ejeX = normalize(vec3(aCamara.z, 0.0, -aCamara.x));
  // En unidades de la altura del árbol: x de -0.36 a 0.36, y de 0 a 1.
  vLocal = vec2(position.x * 0.36, position.y * 0.5 + 0.5);
  float mecida = 0.012 * sin(uTiempo * 0.8 + dot(pie.xz, vec2(0.05, 0.03))) * vLocal.y * vLocal.y;
  vec3 punto = pie + ejeX * (vLocal.x + mecida) * altura + vec3(0.0, vLocal.y * altura, 0.0);
  vAzar = aAzar;
  vSolLocal = normalize(vec2(dot(uSol, ejeX), uSol.y) + 1e-4);
  vBruma = 0.9 * (1.0 - exp(-distancia / 17000.0));
  vColorBruma = colorBruma(-aCamara, uSol);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto, 1.0);
}
`

export const ARBOL_FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec4 vAzar;
varying vec2 vSolLocal;
varying float vBruma;
varying vec3 vColorBruma;
varying float vDetalle;

${SALIDA_CARICATURA}
${FORMAS_GLSL}

void main() {
  vec2 p = vLocal;
  // Tronco y ramas.
  float curva = 0.022 * sin(p.y * 4.0 + 6.2832 * vAzar.x);
  float tronco = max(abs(p.x - curva) - mix(0.022, 0.012, p.y), p.y - 0.64);
  float ramas = min(
    segmento(p, vec2(curva, 0.4), vec2(-0.12 + 0.05 * vAzar.y, 0.68)) - 0.011,
    segmento(p, vec2(curva, 0.47), vec2(0.11 + 0.04 * vAzar.z, 0.74)) - 0.01
  );
  float madera = min(tronco, ramas);
  vec3 color = mix(vec3(0.7, 0.66, 0.64), vec3(0.9, 0.86, 0.77), step(0.0, (p.x - curva) * sign(vSolLocal.x + 1e-4)));
  color = mix(color, vec3(0.62, 0.5, 0.4), step(0.72, azarDe(floor(p.y * 14.0), vAzar.w)) * 0.6);
  float silueta = madera;
  float dentroMadera = 1.0 - smoothstep(-max(fwidth(madera), 1e-5), max(fwidth(madera), 1e-5), madera);
  color *= dentroMadera;

  // La copa: racimos de atrás adelante, más estrecha arriba.
  float lineas = 0.0;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    vec2 c = vec2((azarDe(fk, vAzar.x) - 0.5) * 0.36, 0.5 + 0.4 * azarDe(fk + 3.1, vAzar.y));
    c.x *= 1.0 - 0.5 * smoothstep(0.6, 0.95, c.y);
    float r = 0.075 + 0.07 * azarDe(fk + 7.3, vAzar.z);
    vec2 v = p - c;
    float d = length(v) - r * (1.0 + 0.1 * sin(7.0 * atan(v.y, v.x) + 6.2832 * azarDe(fk, vAzar.w)));
    float wd = max(fwidth(d), 1e-5);
    float dentro = 1.0 - smoothstep(-wd, wd, d);
    lineas = max(lineas * (1.0 - dentro), (1.0 - smoothstep(0.4 * wd, 1.4 * wd, abs(d))) * step(silueta, -wd));
    float luz = dot(v / r, vSolLocal);
    vec3 tono = mix(vec3(0.4, 0.55, 0.45), vec3(0.56, 0.7, 0.5), smoothstep(-0.1, 0.25, luz));
    tono = mix(tono, vec3(0.3, 0.42, 0.42), 1.0 - smoothstep(-0.6, -0.3, luz));
    color = mix(color, tono, dentro);
    silueta = min(silueta, d);
  }
  float w = max(fwidth(silueta), 1e-5);
  if (silueta > w) discard;
  color = mix(color, vec3(0.24, 0.34, 0.3), lineas * 0.7 * vDetalle);
  color = mix(color, mix(vec3(0.3, 0.42, 0.36), TINTA, vDetalle), (1.0 - smoothstep(0.6 * w, 1.6 * w, abs(silueta))) * mix(0.4, 1.0, vDetalle));
  gl_FragColor = salidaCaricatura(mix(color, vColorBruma, vBruma));
}
`
