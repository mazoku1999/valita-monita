/**
 * Túnel del interior del agujero: el viaje "estilo Interstellar por el agujero de gusano". La
 * cámara va dentro de un tubo (dos, anidados, para que el paralaje al girar la vista tenga
 * profundidad) cuyas paredes muestran estrellas estiradas en estelas que convergen en el punto de
 * fuga, ondas de luz que barren hacia el espectador y una neblina azulada; todo procedural
 * (ruido por hash) y en HDR para que el bloom encienda las estelas. La coordenada a lo largo del
 * tubo (`s`) avanza con el scroll: el paisaje viene hacia nosotros.
 */
export const TUNEL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosLocal;

void main() {
  vUv = uv;
  vPosLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const TUNEL_FRAG = /* glsl */ `
precision highp float;

uniform float uAvance;
uniform float uTiempo;
uniform float uOpacidad;
uniform float uCalor;
uniform float uSemilla;
uniform float uBrillo;

varying vec2 vUv;
varying vec3 vPosLocal;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
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

// Estelas: estrellas estiradas a lo largo del túnel. El espacio (vuelta, s) se divide en celdas
// (\`celdas\` alrededor, \`escalaS\` unidades a lo largo); en algunas nace una estrella cuya cola
// se arrastra hacia +s (hacia el espectador). Se recorren las celdas vecinas hacia atrás para
// que las colas largas no se corten.
float estelas(float vuelta, float s, float celdas, float escalaS, float semilla, float anchura) {
  vec2 p = vec2(vuelta * celdas, s / escalaS);
  vec2 c = floor(p);
  vec2 f = p - c;
  float acumulado = 0.0;
  for (int j = -2; j <= 0; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cc = c + vec2(float(i), float(j));
      vec3 h = hash32(vec2(mod(cc.x, celdas), cc.y) + semilla);
      if (h.z < 0.66) continue;
      vec2 d = f - vec2(float(i), float(j)) - h.xy;
      float largo = 0.35 + 1.5 * fract(h.z * 7.31);
      float aLoLargo = smoothstep(0.0, 0.06, d.y) * (1.0 - smoothstep(largo * 0.5, largo, d.y));
      float perfil = exp(-d.x * d.x * anchura);
      float brillo = 0.35 + 0.65 * fract(h.z * 3.17);
      acumulado += perfil * aLoLargo * brillo;
    }
  }
  return acumulado;
}

void main() {
  float s = -vPosLocal.z + uAvance;
  // Ligera torsión helicoidal y giro lento: el túnel no es rígido.
  float vuelta = vUv.x + uTiempo * 0.006 + s * 0.0015;

  float estela = estelas(vuelta, s, 40.0, 3.2, uSemilla, 1400.0)
    + 0.8 * estelas(vuelta + 0.37, s, 22.0, 6.5, uSemilla + 11.0, 420.0);
  // Ondas de luz que barren hacia el espectador, irregulares alrededor.
  float onda = pow(0.5 + 0.5 * sin(s * 0.22 - uTiempo * 1.4), 12.0)
    * (0.55 + 0.45 * ruido(vec2(vuelta * 7.0, s * 0.12)));
  float neblina = fbm(vec2(vuelta * 3.0, s * 0.035));
  float profundidad = max(0.0, -vPosLocal.z);
  // Lejos, muchas estelas caen en el mismo píxel y se suman en un anillo brillante (aliasing):
  // se apagan antes de llegar al fondo, que queda negro hasta que aparece la luz de la salida.
  estela *= 1.0 - smoothstep(22.0, 50.0, profundidad);

  vec3 frio = vec3(0.60, 0.76, 1.0);
  vec3 calido = vec3(1.0, 0.60, 0.30);
  vec3 base = mix(frio, calido, uCalor);
  // El espacio entre estelas es casi negro (como en la referencia): la neblina y las ondas son
  // tenues, y sólo los núcleos de las estelas más vivas superan el umbral del bloom.
  vec3 color = base * (0.035 * neblina + 0.22 * onda);
  color += mix(base, vec3(1.0), clamp(estela * 0.6, 0.0, 1.0)) * estela * 1.5;

  float lejos = exp(-profundidad * 0.05);
  float detras = 1.0 - smoothstep(0.0, 4.0, vPosLocal.z);
  color *= lejos * detras * uOpacidad * uBrillo;
  gl_FragColor = vec4(color, 1.0);
}
`

/** Luz de la salida: un disco radial HDR al fondo del túnel que crece hasta llenar la vista. */
export const SALIDA_FRAG = /* glsl */ `
precision highp float;

uniform float uSalida;
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float nucleo = exp(-r * r * 5.0);
  float halo = exp(-r * 2.2) * (1.0 - smoothstep(0.85, 1.0, r));
  vec3 color = (vec3(1.0, 0.97, 0.92) * nucleo * 4.0 + vec3(0.72, 0.84, 1.0) * halo * 1.0) * uSalida;
  gl_FragColor = vec4(color, 1.0);
}
`

/** Destello: un plano blanco HDR delante de la cámara (aditivo) que lava la pantalla al salir. */
export const DESTELLO_FRAG = /* glsl */ `
precision highp float;

uniform float uDestello;

void main() {
  gl_FragColor = vec4(vec3(uDestello * 5.0), 1.0);
}
`
