import { CIELO_NUESTRO_GLSL } from './cieloNuestro'

/**
 * Cielo de fondo del sistema solar: el cielo de nuestra galaxia (`cieloNuestro.ts`), el mismo que
 * se ve por la boca de salida del agujero de gusano, en el marco del viaje y con el giro de los
 * cielos congelado al salir: al fundirse un cielo con el otro no cambia nada.
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

${CIELO_NUESTRO_GLSL}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 ojo = uProyInversa * vec4(ndc, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  vec3 dirMundo = normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);
  vec3 dirW = normalize(uMarcoInverso * dirMundo);
  float c = cos(uGiro);
  float s = sin(uGiro);
  dirW = vec3(c * dirW.x - s * dirW.y, s * dirW.x + c * dirW.y, dirW.z);
  fragColor = vec4(cieloNuestro(dirW) * uOpacidad, 1.0);
}
`
