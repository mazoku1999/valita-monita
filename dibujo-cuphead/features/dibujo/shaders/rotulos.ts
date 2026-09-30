/**
 * Rótulos sobre la imagen ya dibujada (ver `store/rotulos.ts`): un cartel en píxeles de pantalla
 * con el nombre de un planeta (una textura) o la marca del destino, un anillo a trazos crema
 * rosado con su tinta que gira muy despacio (no late) y un corazón encima. Colores en sRGB, como la
 * imagen compuesta; salen premultiplicados.
 */
export const ROTULO_VERT = /* glsl */ `
uniform vec2 uResolucion;
uniform vec2 uCentro;
uniform vec2 uTamano;

out vec2 vLocal;

void main() {
  vLocal = position.xy;
  vec2 px = uCentro + position.xy * uTamano * 0.5;
  gl_Position = vec4(px / uResolucion * 2.0 - 1.0, 0.0, 1.0);
}
`

export const ROTULO_FRAG = /* glsl */ `
uniform sampler2D uTextura;
uniform float uOpacidad;
uniform float uTipo;
uniform float uGiro;
uniform vec3 uTinta;

in vec2 vLocal;
out vec4 fragColor;

float dot2(vec2 v) {
  return dot(v, v);
}

// Corazón con signo (Íñigo Quílez): la punta en (0, 0), los lóbulos hacia +y.
float corazon(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// Pinta una capa encima (color sin premultiplicar y su cobertura).
vec4 encima(vec4 abajo, vec3 color, float cobertura) {
  return vec4(mix(abajo.rgb, color, cobertura), cobertura + abajo.a * (1.0 - cobertura));
}

void main() {
  if (uTipo < 0.5) {
    vec4 letrero = texture(uTextura, vLocal * 0.5 + 0.5);
    float a = letrero.a * uOpacidad;
    if (a < 0.003) discard;
    fragColor = vec4(letrero.rgb * a, a);
    return;
  }
  vec2 p = vLocal;
  float r = length(p);
  float w = max(fwidth(r), 1e-4);
  const float RADIO = 0.72;
  // Trazos a lo largo del anillo, que gira despacio.
  float fase = fract((atan(p.y, p.x) + uGiro) / 6.2831853 * 18.0);
  // El ancho de un píxel en fase, de la distancia (continua; la fase salta en cada vuelta).
  float wf = w / (6.2831853 * max(r, 0.1)) * 18.0 + 1e-4;
  float guion = smoothstep(0.0, wf, fase) * (1.0 - smoothstep(0.58 - wf, 0.58, fase));
  // La tinta de cada trazo se alarga un poco por los dos extremos (la fase, pasada la vuelta).
  float f2 = fase - step(0.9, fase);
  float guionTinta = max(smoothstep(-0.07, -0.07 + wf, f2) * (1.0 - smoothstep(0.65 - wf, 0.65, f2)), guion);
  vec4 marca = vec4(0.0);
  float banda = abs(r - RADIO);
  marca = encima(marca, uTinta, (1.0 - smoothstep(0.052 - w, 0.052 + w, banda)) * guionTinta);
  marca = encima(marca, vec3(1.0, 0.86, 0.9), (1.0 - smoothstep(0.026 - w, 0.026 + w, banda)) * guion);
  // El corazón, posado arriba del anillo.
  vec2 q = (p - vec2(0.0, RADIO - 0.05)) / 0.24;
  float d = corazon(q) * 0.24;
  float wd = max(fwidth(d), 1e-4);
  marca = encima(marca, uTinta, 1.0 - smoothstep(0.03 - wd, 0.03 + wd, d));
  vec3 rosa = mix(vec3(0.95, 0.36, 0.55), vec3(1.0, 0.72, 0.82), 1.0 - smoothstep(0.0, 0.1, length(q - vec2(-0.28, 0.82)) * 0.24));
  marca = encima(marca, rosa, 1.0 - smoothstep(-wd, wd, d));
  float a = marca.a * uOpacidad;
  if (a < 0.003) discard;
  fragColor = vec4(marca.rgb * a, a);
}
`
