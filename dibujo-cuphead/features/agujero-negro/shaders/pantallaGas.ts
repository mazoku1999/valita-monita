/**
 * Malla de pantalla que copia el buffer del gas a la escena: color HDR tal cual y la profundidad
 * del ray-marching en gl_FragDepth, para que las chispas del polvo sigan quedando detrás del gas.
 */
export const PANTALLA_GAS_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export const PANTALLA_GAS_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

uniform sampler2D uColor;
uniform sampler2D uProfundidad;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = vec4(texture(uColor, vUv).rgb, 1.0);
  gl_FragDepth = texture(uProfundidad, vUv).r;
}
`
