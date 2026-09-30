import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'
import { BRUMA_GLSL } from './valle'

/**
 * Nubes de verdad, de bolas: cada cúmulo es un racimo de esferas en el espacio (con su base plana)
 * que se dibujan por trazado de rayos sobre un cartel: cada píxel busca dónde entra su rayo en la
 * esfera, se ilumina con el Sol (tres tonos de dibujo: la cara al Sol crema dorada, la de en medio
 * y la sombra lila; un borde dorado donde la luz roza) y escribe la profundidad de ese punto. Así
 * las bolas de un racimo se tapan entre sí, las nubes se cruzan con el suelo y con otras nubes, y el
 * pase entinta sus siluetas donde hay un salto de verdad (no cada bola: entre bolas vecinas la
 * profundidad apenas cambia). Al acercarse crecen y se abren con la perspectiva de una cámara real.
 *
 * Todo va en el espacio del objeto (la malla de la Tierra, en radios terrestres, o el valle, en
 * metros): la cámara (`uCamara`), el Sol (`uSol`, unitario) y cuántas unidades de la vista mide una
 * del objeto (`uEscalaVista`, para la profundidad). Por instancia: la bola (centro y radio), el
 * arriba de su nube y la altura de la base respecto del centro de la bola (en radios) y el tono
 * (x: rosado, y: azar, z: altura de la bola en su nube, 0 en la base y 1 en la cima).
 */
export const NUBE_BOLA_VERT = /* glsl */ `
attribute vec4 aBola;
attribute vec4 aArriba;
attribute vec4 aTono;

uniform vec3 uCamara;
uniform float uPixelesPorRadian;
// Las nubes crecen desde nada al aparecer (0..1).
uniform float uCrecer;

varying vec3 vRayo;
varying vec3 vVista;
varying vec4 vBola;
varying vec4 vArriba;
varying vec4 vTono;
varying vec3 vEjeU;
varying vec3 vEjeV;
// Términos de la proyección que dan la profundidad (el fragment shader no tiene la matriz).
varying vec2 vProyeccion;

void main() {
  vec3 centro = aBola.xyz;
  float radio = aBola.w;
  vec3 haciaBola = centro - uCamara;
  float d = length(haciaBola);
  // Si la cámara está dentro (o rozándola), no se dibuja: se ve la niebla.
  float pixeles = radio / max(d, 1e-12) * uPixelesPorRadian;
  if (d < radio * 1.03 || pixeles < 0.7) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Al asomar (a un píxel) la bola crece desde nada.
  radio *= smoothstep(0.7, 2.5, pixeles) * uCrecer;
  if (radio <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 eje = haciaBola / d;
  vec3 ayuda = abs(eje.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 u = normalize(cross(ayuda, eje));
  vec3 v = cross(eje, u);
  // El cartel, en el plano del centro, cubre la silueta de la bola (su cono tangente).
  float medio = radio * d / sqrt(max(d * d - radio * radio, 1e-24)) * 1.03;
  vec3 punto = centro + (u * position.x + v * position.y) * medio;
  vRayo = punto - uCamara;
  vBola = vec4(centro, radio);
  vArriba = aArriba;
  vTono = aTono;
  vEjeU = u;
  vEjeV = v;
  vProyeccion = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
  vec4 vista = modelViewMatrix * vec4(punto, 1.0);
  vVista = vista.xyz;
  gl_Position = projectionMatrix * vista;
}
`

export const NUBE_BOLA_FRAG = /* glsl */ `
uniform vec3 uCamara;
uniform vec3 uSol;
uniform float uEscalaVista;
// Bruma (sólo en el valle): distancia a la que se apaga (en unidades del objeto) y fuerza.
uniform vec2 uBruma;

varying vec3 vRayo;
varying vec3 vVista;
varying vec4 vBola;
varying vec4 vArriba;
varying vec4 vTono;
varying vec3 vEjeU;
varying vec3 vEjeV;
varying vec2 vProyeccion;

${SALIDA_CARICATURA}
${BRUMA_GLSL}

void main() {
  vec3 dir = normalize(vRayo);
  float r = vBola.w;
  // Del centro de la bola al punto del rayo más cercano (todo cantidades pequeñas: sin restar
  // números grandes, que en la Tierra la bola mide diez milésimas de su radio).
  vec3 oc = uCamara - vBola.xyz;
  float tc = -dot(oc, dir);
  vec3 cerca = oc + tc * dir;
  float q = length(cerca);
  // Silueta festoneada, como las nubes de los dibujos.
  float angulo = atan(dot(cerca, vEjeV), dot(cerca, vEjeU));
  float festones = 1.0 - 0.07 * (0.5 + 0.5 * cos(7.0 * angulo + 6.2832 * vTono.y)) - 0.03 * (0.5 + 0.5 * cos(13.0 * angulo + 17.0 * vTono.y));
  if (q > r * festones) discard;
  float s = sqrt(max(r * r - q * q, 0.0));
  vec3 n = (cerca - s * dir) / r;
  float t = tc - s;

  // La base plana de la nube: si el rayo entra por debajo de ella, o cruza el plano dentro de la
  // bola (se ve la base desde abajo) o no toca la nube.
  vec3 arriba = vArriba.xyz;
  float base = vArriba.w;
  float alturaEntrada = dot(n, arriba);
  bool esBase = false;
  if (alturaEntrada < base) {
    float subida = dot(dir, arriba);
    if (subida <= 1e-4) discard;
    float tPlano = t + (base - alturaEntrada) * r / subida;
    if (tPlano > tc + s) discard;
    t = tPlano;
    n = -arriba;
    esBase = true;
  }

  // Profundidad del punto de entrada.
  float z = normalize(vVista).z * (t * uEscalaVista);
  gl_FragDepth = clamp((vProyeccion.x * z + vProyeccion.y) / (-z) * 0.5 + 0.5, 0.0, 1.0);

  // Luz de la mañana, suave y envolvente como en una nube de algodón (con bandas duras, cada bola
  // parecía una faceta de cristal): crema dorada al Sol, lila en la sombra; rosada la del corazón.
  float rosado = vTono.x;
  vec3 claro = mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.8, 0.87), rosado);
  vec3 medio = mix(vec3(0.97, 0.93, 0.95), vec3(0.98, 0.7, 0.85), rosado);
  vec3 sombra = mix(vec3(0.82, 0.8, 0.93), vec3(0.84, 0.55, 0.8), rosado);
  // La luz mezcla el Sol con lo alto de cada bola (su parte de abajo, una media luna en sombra).
  float envuelta = 0.5 + 0.5 * (0.6 * dot(n, uSol) + 0.4 * dot(n, arriba));
  vec3 color = mix(sombra, medio, smoothstep(0.25, 0.5, envuelta));
  color = mix(color, claro, smoothstep(0.52, 0.72, envuelta));
  // Cada bola, redonda: algo más oscura hacia su contorno por el lado de la sombra, y con un borde
  // dorado donde la luz roza.
  float contorno = 1.0 - abs(dot(n, dir));
  color = mix(color, sombra, smoothstep(0.45, 1.0, contorno) * 0.4 * (1.0 - smoothstep(0.35, 0.8, envuelta)));
  color = mix(color, mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.86, 0.84), rosado), pow(contorno, 3.0) * smoothstep(0.5, 0.9, envuelta) * 0.8);
  // Más oscura hacia abajo en cada bola y en las bolas bajas del racimo; la base, en sombra.
  color *= mix(0.82, 1.0, smoothstep(-0.6, 0.35, dot(n, arriba))) * mix(0.9, 1.0, vTono.z);
  if (esBase) color = sombra * mix(0.9, 1.0, rosado);
  // El contorno de cada bola, una línea fina del color de la sombra (no negra: la tinta negra la
  // pone el pase donde hay un salto de verdad): donde una bola monta sobre otra se ven sus lóbulos.
  if (!esBase) {
    float e = q / (r * festones);
    float we = fwidth(e);
    // we ≈ 1/radio en píxeles: la línea se apaga en las bolas de menos de ~12 px (desde lejos, el
    // mar de nubes parecía de palomitas).
    float grande = 1.0 - smoothstep(0.06, 0.12, we);
    color = mix(color, sombra * mix(0.82, 0.78, rosado), smoothstep(1.0 - 2.8 * we, 1.0 - 0.9 * we, e) * 0.75 * grande);
  }

  if (uBruma.y > 0.0) {
    float distancia = t;
    color = mix(color, colorBruma(dir, uSol), uBruma.y * (1.0 - exp(-distancia / uBruma.x)));
  }
  gl_FragColor = salidaCaricatura(color);
}
`
