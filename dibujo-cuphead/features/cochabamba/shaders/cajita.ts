import { SALIDA_CARICATURA } from '@/features/dibujo/shaders/caricatura'

/**
 * La cajita del final (ver `components/Cajita.tsx`), dibujada como el resto: colores planos en tres
 * tonos según hacia dónde mira cada cara (arriba, la más clara; el costado de la sombra, la más
 * oscura), con su contorno de tinta (una copia algo mayor dibujada por detrás).
 *
 * `uTipo`: 0 la caja (celeste; por dentro, dorada: al abrirse sale luz), 1 la cinta y el lazo
 * (dorados, con un brillo), 2 el tocón (corteza a rayas y, arriba, los anillos de la madera).
 */
export const CAJITA_VERT = /* glsl */ `
uniform float uGrosor;

varying vec3 vLocal;
varying vec3 vNormalLocal;

void main() {
  vLocal = position;
  vNormalLocal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position * (1.0 + uGrosor), 1.0);
}
`

export const CAJITA_FRAG = /* glsl */ `
uniform float uTipo;
uniform float uTinta;
uniform float uLuzDentro;

varying vec3 vLocal;
varying vec3 vNormalLocal;

${SALIDA_CARICATURA}

void main() {
  if (uTinta > 0.5) {
    gl_FragColor = salidaCaricatura(TINTA);
    return;
  }
  vec3 n = normalize(vNormalLocal) * (gl_FrontFacing ? 1.0 : -1.0);
  // Tres tonos: arriba, de frente a la luz y en sombra (la luz, de arriba a la izquierda).
  float arriba = step(0.6, n.y);
  float luz = step(0.0, dot(n, normalize(vec3(-0.75, 0.0, 0.66))));
  vec3 c;
  if (uTipo < 0.5) {
    if (!gl_FrontFacing) {
      // Por dentro: dorada, más clara cuanto más sale la luz.
      c = mix(vec3(0.42, 0.36, 0.5), mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.97, 0.8), smoothstep(0.0, 0.12, vLocal.y + 0.06)), uLuzDentro);
    } else {
      vec3 claro = vec3(0.62, 0.84, 0.96);
      vec3 medio = vec3(0.5, 0.74, 0.92);
      vec3 sombra = vec3(0.36, 0.56, 0.8);
      c = arriba > 0.5 ? claro : mix(sombra, medio, luz);
      // Lunares blancos, como el papel de regalo.
      vec2 q = abs(n.x) > 0.5 ? vLocal.zy : abs(n.z) > 0.5 ? vLocal.xy : vLocal.xz;
      vec2 celda = fract(q * 26.0 + vec2(0.0, 0.5 * step(0.5, fract(floor(q.x * 26.0) * 0.5)))) - 0.5;
      c = mix(c, mix(c, vec3(1.0, 0.98, 0.94), 0.8), 1.0 - smoothstep(0.17, 0.22, length(celda)));
    }
  } else if (uTipo < 1.5) {
    vec3 claro = vec3(1.0, 0.86, 0.4);
    vec3 medio = vec3(0.98, 0.76, 0.28);
    vec3 sombra = vec3(0.84, 0.58, 0.2);
    c = arriba > 0.5 ? claro : mix(sombra, medio, luz);
  } else {
    if (n.y > 0.6) {
      // Los anillos de la madera.
      float r = length(vLocal.xz);
      c = mix(vec3(0.88, 0.72, 0.5), vec3(0.74, 0.55, 0.36), smoothstep(0.35, 0.5, abs(fract(r * 30.0) - 0.5) * 2.0));
      c = mix(c, vec3(0.6, 0.42, 0.26), 1.0 - smoothstep(0.012, 0.02, r));
    } else {
      // Corteza: rayas verticales y más oscura abajo.
      float a = atan(vLocal.z, vLocal.x);
      float raya = smoothstep(0.55, 0.85, abs(fract(a * 3.0 + 0.15 * sin(vLocal.y * 17.0)) - 0.5) * 2.0);
      c = mix(vec3(0.52, 0.34, 0.2), vec3(0.4, 0.25, 0.14), raya);
      c *= mix(0.78, 1.0, luz) * mix(0.82, 1.0, smoothstep(-0.27, 0.1, vLocal.y));
    }
  }
  gl_FragColor = salidaCaricatura(c);
}
`

/**
 * Destellos de la cajita: estrellitas de cuatro puntas, doradas, con su tinta. Cerrada, unas pocas
 * titilan a su alrededor (para que se vea que hay algo); al abrirse, una lluvia de ellas sube en
 * espiral desde dentro hacia el cielo y se apaga allí arriba.
 */
export const DESTELLO_CAJITA_VERT = /* glsl */ `
attribute vec4 aAzar;

uniform vec3 uCentro;
uniform float uTiempo;
// Segundos desde que saltó la tapa (negativo antes) y si ya se abrió.
uniform float uLluvia;
uniform float uAbierta;
uniform vec2 uRumbo;
uniform vec3 uCamara;
uniform float uPixelesPorRadian;

varying vec2 vLocal;
varying float vTono;

void main() {
  vLocal = position.xy;
  vTono = aAzar.w;
  vec3 punto;
  float tamano;
  bool deLaLluvia = aAzar.z > 0.06;
  if (!deLaLluvia) {
    // Cerrada: titilan alrededor (cada una a su ritmo); al abrirse se apagan.
    float k = aAzar.z / 0.06;
    float fase = fract(uTiempo * 0.35 + k * 0.37);
    float brillo = smoothstep(0.0, 0.15, fase) * (1.0 - smoothstep(0.25, 0.45, fase));
    float angulo = k * 6.2831853 * 1.618 + uTiempo * 0.3;
    punto = uCentro + vec3(cos(angulo) * 0.2, 0.05 + 0.12 * fract(k * 3.7), sin(angulo) * 0.2);
    tamano = 0.035 * brillo * (1.0 - uAbierta);
  } else {
    // La lluvia: sale de la caja al abrirse, sube acelerando en espiral, se abre y deriva hacia
    // donde se mirará el cielo; se apaga al final de su vida.
    float t = uLluvia - aAzar.y * 1.4;
    float vida = 4.5 + 2.0 * aAzar.x;
    if (uAbierta < 0.5 || t < 0.0 || t > vida) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float subida = (0.7 + 0.9 * aAzar.x) * t + 0.35 * t * t;
    float giro = aAzar.z * 40.0 + t * (1.6 + aAzar.w);
    float radio = 0.03 + 0.12 * t + 0.02 * t * t;
    punto = uCentro + vec3(cos(giro) * radio, 0.06 + subida, sin(giro) * radio) + vec3(uRumbo.x, 0.0, uRumbo.y) * (0.25 * t * t);
    tamano = (0.03 + 0.04 * aAzar.w) * smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(vida - 1.2, vida, t));
  }
  // En coordenadas del valle (la malla va en su grupo, sin transformación propia).
  float distancia = distance(punto, uCamara);
  // Al menos un par de píxeles: de lejos siguen viéndose como chispas.
  tamano = max(tamano, step(1e-4, tamano) * 2.2 * distancia / uPixelesPorRadian);
  vec3 derecha = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
  vec3 arriba = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
  float c = cos(aAzar.x * 6.0 + uTiempo * (0.6 + aAzar.w));
  float s = sin(aAzar.x * 6.0 + uTiempo * (0.6 + aAzar.w));
  vec2 esquina = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * tamano;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(punto + derecha * esquina.x + arriba * esquina.y, 1.0);
}
`

export const DESTELLO_CAJITA_FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vTono;

${SALIDA_CARICATURA}

void main() {
  // Cuatro puntas de lados cóncavos: |x|^k + |y|^k = 1, con su tinta.
  vec2 a = abs(vLocal) + 1e-4;
  float f = pow(a.x / 0.72, 0.55) + pow(a.y / 0.72, 0.55);
  float fe = pow(a.x / 0.97, 0.55) + pow(a.y / 0.97, 0.55);
  float aa = fwidth(f);
  float lleno = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, f);
  float exterior = 1.0 - smoothstep(1.0 - fwidth(fe), 1.0 + fwidth(fe), fe);
  if (exterior < 0.5) discard;
  vec3 relleno = mix(vec3(1.0, 0.86, 0.42), vec3(1.0, 0.97, 0.82), vTono);
  relleno = mix(relleno, vec3(1.0), 1.0 - smoothstep(0.0, 0.3, length(vLocal)));
  gl_FragColor = salidaCaricatura(mix(TINTA, relleno, lleno));
}
`
