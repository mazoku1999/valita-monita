/**
 * El cielo de nuestra galaxia, compartido por el lado de salida del agujero de gusano y por el
 * fondo del sistema solar: al salir por la boca un cielo se funde con el otro sin costura.
 *
 * Misma paleta que el cielo del agujero negro (shader de la lente): estrellas blanco cálido, unas
 * pocas blancas, rara vez azuladas o anaranjadas, finas (≥ 1 px) y con la ley de brillos de muchas
 * tenues y pocas vivas; fondo negro neutro. La Vía Láctea es dorada como el resto de la escena:
 * un río granulado de estrellas diminutas (en una foto de larga exposición no es una nube) con un
 * velo tenue, vetas de polvo y el bulbo hacia el centro galáctico. Sin la nebulosa azul ni el
 * velo gris de antes: con ellos el espacio tras el agujero salía el doble de claro y azulado.
 *
 * Funciones con prefijo `cn` para no chocar con las de los shaders que lo incluyen. Necesita GLSL
 * ES 3.0 (operaciones de bits) y un uniforme `uAnguloPixel` (radianes por píxel).
 */
export const CIELO_NUESTRO_GLSL = /* glsl */ `
// Plano de la Vía Láctea: normalize(0.35, 1, 0.2).
const vec3 CN_NORMAL_BANDA = vec3(0.3246, 0.9275, 0.1855);

vec3 cnHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float cnHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float cnRuido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cnHash13(i), cnHash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(cnHash13(i + vec3(0.0, 1.0, 0.0)), cnHash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(cnHash13(i + vec3(0.0, 0.0, 1.0)), cnHash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(cnHash13(i + vec3(0.0, 1.0, 1.0)), cnHash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float cnFbm3(vec3 p) {
  float suma = 0.0;
  float amplitud = 0.5;
  for (int k = 0; k < 4; k++) {
    suma += amplitud * cnRuido3(p);
    p = p * 2.03 + vec3(5.1, 1.7, 9.3);
    amplitud *= 0.5;
  }
  return suma / 0.9375;
}

// Paleta de las estrellas del agujero negro: blanco cálido, blanco, alguna azulada y, en el otro
// extremo, alguna gigante anaranjada.
vec3 cnColorEstrella(float t) {
  vec3 col = mix(vec3(1.0, 0.93, 0.80), vec3(0.99, 0.97, 0.93), smoothstep(0.35, 0.75, t));
  col = mix(col, vec3(0.88, 0.93, 1.0), smoothstep(0.9, 1.0, t));
  return mix(vec3(1.0, 0.80, 0.58), col, smoothstep(0.0, 0.1, t));
}

// Una estrella por celda de una rejilla 3D sobre la dirección. Sólo se miran las 8 celdas más
// cercanas (la estrella está dentro de su celda y su gaussiana mide un par de píxeles, mucho menos
// que media celda). Distancia angular por la cuerda: normalize() deja errores de ~1e-4 en la
// longitud y 1 − dot se anulaba en discos de 25 px.
vec3 cnCapa(vec3 dir, float celdas, float probabilidad, float brillo, float base, float anchura, float semilla) {
  vec3 q = dir * celdas;
  vec3 celda = floor(q);
  vec3 lado = step(0.5, q - celda) * 2.0 - 1.0;
  vec3 luz = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 c = celda + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1)) * lado;
    vec3 h = cnHash33(c + semilla);
    if (h.x > probabilidad) continue;
    vec3 s = normalize(c + 0.5 + (cnHash33(c + semilla + 3.1) - 0.5) * 0.9);
    float angulo = length(dir - s);
    float m = h.y * h.y * h.y;
    float sigma = uAnguloPixel * (anchura + 0.6 * m);
    float g = exp(-0.5 * angulo * angulo / (sigma * sigma));
    luz += cnColorEstrella(h.z) * brillo * (base + m * m) * g;
  }
  return luz;
}

// Perfil de la banda: ancho y brillo crecen hacia el centro galáctico (el bulbo).
float cnPerfilBanda(vec3 n, out float haciaNucleo) {
  vec3 ejeBanda = normalize(cross(CN_NORMAL_BANDA, vec3(0.0, 0.0, 1.0)));
  vec3 ejeBanda2 = cross(CN_NORMAL_BANDA, ejeBanda);
  float d = dot(n, CN_NORMAL_BANDA);
  vec3 dirNucleo = normalize(ejeBanda * 0.8 + ejeBanda2 * 0.6);
  haciaNucleo = 0.5 + 0.5 * dot(normalize(n - CN_NORMAL_BANDA * d), dirNucleo);
  float anchura = 0.004 + 0.012 * haciaNucleo * haciaNucleo;
  return exp(-d * d / anchura);
}

vec3 cieloNuestro(vec3 n) {
  vec3 luz = cnCapa(n, 40.0, 0.5, 0.25, 0.12, 0.55, 1.3);
  luz += cnCapa(n, 11.0, 0.62, 1.2, 0.04, 0.6, 7.9);

  float haciaNucleo;
  float perfil = cnPerfilBanda(n, haciaNucleo);
  if (perfil > 0.01) {
    // Vetas de polvo finas (no manchas: amplificadas en el túnel se leían como agujeros).
    float polvo = smoothstep(0.5, 0.68, cnFbm3(n * 24.0 + vec3(3.0, 1.0, 7.0)));
    float grumos = 0.55 + 0.45 * cnFbm3(n * 30.0 + 9.0);
    float velo = 1.0 - 0.6 * polvo * smoothstep(0.35, 0.9, perfil);
    // Río de estrellas: una capa densa cuya población sigue el perfil de la banda.
    vec3 q = n * 130.0;
    vec3 celda = floor(q);
    vec3 lado = step(0.5, q - celda) * 2.0 - 1.0;
    for (int k = 0; k < 8; k++) {
      vec3 c = celda + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1)) * lado;
      vec3 h = cnHash33(c + 21.1);
      vec3 s = normalize(c + 0.5 + (cnHash33(c + 24.2) - 0.5) * 0.9);
      float nucleoEstrella;
      if (h.x > 0.85 * cnPerfilBanda(s, nucleoEstrella) * grumos) continue;
      float angulo = length(n - s);
      float sigma = uAnguloPixel * 0.5;
      luz += cnColorEstrella(0.2 + 0.6 * h.z) * (0.025 + 0.08 * h.y * h.y) * exp(-0.5 * angulo * angulo / (sigma * sigma)) * velo;
    }
    vec3 colorBanda = mix(vec3(0.95, 0.88, 0.78), vec3(1.0, 0.85, 0.64), haciaNucleo);
    luz += colorBanda * perfil * grumos * velo * (0.008 + 0.02 * haciaNucleo * haciaNucleo);
  }
  return luz;
}
`
