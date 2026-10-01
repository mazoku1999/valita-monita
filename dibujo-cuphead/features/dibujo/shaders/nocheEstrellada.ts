/**
 * La noche estrellada del final (ver `features/cochabamba/store/carta.ts`): al abrir la cajita la
 * cámara mira al cielo y la vista se vuelve "La noche estrellada" de Van Gogh, compuesta como el
 * cuadro y dibujada a la manera del dibujo animado (el usuario la pidió más parecida a la original):
 *
 * - El cielo, hecho de pinceladas cortas que siguen el viento: el plano retorcido por el gran
 *   remolino doble del centro (la "ola", que gira al revés en su compañero) y uno pequeño a la
 *   derecha; las pinceladas de las franjas claras (la ola, el resplandor sobre las colinas) son
 *   blancas, celestes y verde agua; las demás, de azules (ultramar, cobalto, cerúleo).
 * - Once estrellas y la luna en cuarto creciente (sin cara), cada una con su halo de anillos de
 *   pinceladas (amarillos, blancos y, por fuera, verdosos); la luna, con el suyo dorado y naranja.
 * - Abajo, las colinas azules con pinceladas que siguen su lomo, el pueblo con sus casas de ventanas
 *   encendidas y la iglesia de aguja alta, y a la izquierda el ciprés, una llama oscura que sube hasta
 *   arriba. Las formas sólidas llevan su tinta, como el resto del dibujo.
 *
 * Todo se compone sobre la vista final de la cámara (`uMarcoNoche`: derecha, arriba y adelante en
 * coordenadas del valle; `uTanNoche`: la tangente de medio campo de visión vertical), en un lienzo
 * donde la media altura de la pantalla mide 1 y el ancho llega a ±`uAspectoNoche`: cada elemento se
 * coloca respecto a los bordes, así que la composición cabe igual en un ordenador y en un móvil en
 * vertical. Las pinceladas fluyen despacio a lo largo del viento (el cielo se mueve, sin latir).
 *
 * Necesita RUIDO3_GLSL. La noche cae como una aguada que baja desde lo alto (`uNoche` 0 → 1) y,
 * donde ya cayó, el cuadro cubre la escena.
 */
export const NOCHE_ESTRELLADA_GLSL = /* glsl */ `
uniform float uNoche;
uniform mat3 uMarcoNoche;
uniform float uTanNoche;
uniform float uAspectoNoche;
uniform float uTiempoNoche;
uniform float uPixelNoche;

const vec3 TINTA_NOCHE = vec3(0.03, 0.035, 0.08);

float hashNoche(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 giroNoche(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Escala de la composición: en pantallas estrechas (un móvil en vertical) todo algo menor.
float escalaNoche() {
  return clamp(uAspectoNoche / 1.15, 0.6, 1.0);
}

// Lienzo de la vista final y cuánto mira hacia delante (lejos de la vista final, sólo el fondo).
vec2 lienzoNoche(vec3 d, out float delante) {
  vec3 q = transpose(uMarcoNoche) * d;
  delante = smoothstep(0.12, 0.32, q.z);
  return q.xy / max(q.z, 0.12) / uTanNoche;
}

// Una pincelada: cápsula de medio largo semiL y medio ancho semiW en (u, v) (u a lo largo).
float pinceladaNoche(float u, float v, float semiL, float semiW) {
  return length(vec2(max(abs(u) - (semiL - semiW), 0.0), v)) - semiW;
}

// --- El cielo -----------------------------------------------------------------------------------

// Remolino del viento: el plano gira alrededor de c, más cuanto más cerca (las filas de pinceladas se
// curvan alrededor de los remolinos y entran en ellos).
vec2 vorticeNoche(vec2 p, vec2 c, float fuerza, float radio) {
  vec2 q = p - c;
  float r2 = dot(q, q) / (radio * radio);
  return c + giroNoche(q, fuerza * exp(-r2));
}

// Los remolinos del cuadro: centro (xy) y radio (z). El grande, en el centro-izquierda; su compañero,
// que gira al revés (la "ola"); y uno pequeño a la derecha.
vec3 remolinoNoche(int i) {
  float s = escalaNoche();
  vec2 c1 = vec2(-0.22 * min(uAspectoNoche, 1.4), 0.3);
  if (i == 0) return vec3(c1, 0.34 * s);
  if (i == 1) return vec3(c1 + vec2(0.4, -0.11) * s, 0.21 * s);
  return vec3(0.66 * uAspectoNoche, 0.12, 0.14 * s);
}

// El viento: las coordenadas en las que las pinceladas van en filas (a lo largo de x).
vec2 vientoNoche(vec2 p) {
  vec3 r0 = remolinoNoche(0);
  vec3 r1 = remolinoNoche(1);
  vec3 r2 = remolinoNoche(2);
  vec2 q = vorticeNoche(p, r0.xy, 1.25, r0.z * 1.6);
  q = vorticeNoche(q, r1.xy, -1.1, r1.z * 1.6);
  q = vorticeNoche(q, r2.xy, 1.0, r2.z * 1.6);
  q.y += 0.045 * sin(q.x * 2.1 + 0.7) + 0.02 * sin(q.x * 5.3 - 1.3);
  return q;
}

// Las franjas claras del viento (en la coordenada de las filas): la ola, que pasa por los remolinos,
// otra más alta y el resplandor sobre las colinas.
float franjasNoche(float y) {
  float c1 = remolinoNoche(0).y;
  float b = exp(-pow((y - c1 + 0.02) / 0.06, 2.0));
  b += 0.5 * exp(-pow((y - 0.68) / 0.045, 2.0));
  b += 0.75 * exp(-pow((y + 0.1) / 0.055, 2.0));
  return clamp(b, 0.0, 1.0);
}

// Fondo (bajo las pinceladas, y fuera de la vista): ultramar arriba, cobalto en medio y más claro y
// verdoso junto a las colinas.
vec3 fondoNoche(vec3 d) {
  float y = d.y;
  vec3 c = mix(vec3(0.22, 0.38, 0.54), vec3(0.12, 0.25, 0.52), smoothstep(0.05, 0.3, y));
  c = mix(c, vec3(0.06, 0.13, 0.34), smoothstep(0.3, 0.95, y));
  return c * (0.94 + 0.08 * ruido3(d * 23.0));
}

vec3 colorDelCielo(float azar, float franja, float alto) {
  // Azules de la noche (de oscuro a claro) y las pinceladas claras de las franjas.
  vec3 oscuro = azar < 0.28 ? vec3(0.06, 0.12, 0.36) : azar < 0.56 ? vec3(0.1, 0.22, 0.54) : azar < 0.82 ? vec3(0.18, 0.35, 0.68) : azar < 0.94 ? vec3(0.32, 0.52, 0.78) : vec3(0.52, 0.66, 0.78);
  vec3 claro = azar < 0.3 ? vec3(0.88, 0.93, 0.93) : azar < 0.56 ? vec3(0.64, 0.82, 0.86) : azar < 0.8 ? vec3(0.42, 0.65, 0.82) : azar < 0.92 ? vec3(0.95, 0.92, 0.66) : vec3(0.5, 0.74, 0.68);
  vec3 c = mix(oscuro, claro, smoothstep(0.3, 0.72, franja + 0.3 * (azar - 0.5)));
  // Junto a las colinas, el cielo es más verdoso.
  return mix(c, c * vec3(0.92, 1.05, 0.95) + vec3(0.03, 0.06, 0.02), 1.0 - smoothstep(-0.25, 0.05, alto));
}

// Una capa de pinceladas en filas a lo largo de q.x: cada una algo ladeada y más fina en las puntas,
// de largo y ancho variados; fluyen despacio con el viento. Devuelve su color y cuánto cubre.
vec4 capaPinceladas(vec2 q, float alto, float semilla, float t, float altoCielo, bool delCielo) {
  float yq = q.y + 0.006 * sin(q.x * 17.0 + semilla);
  float fila = floor(yq / alto);
  float v0 = (fract(yq / alto) - 0.5) * alto;
  float azarFila = hashNoche(vec2(fila, semilla));
  float largo = alto * (2.4 + 2.4 * azarFila);
  float xs = (q.x + t * (0.01 + 0.012 * azarFila)) / largo + azarFila * 17.0;
  float celda = floor(xs);
  float u0 = (fract(xs) - 0.5) * largo;
  float azar = hashNoche(vec2(celda, fila + semilla * 31.0));
  vec2 uv = giroNoche(vec2(u0, v0 - (hashNoche(vec2(celda, fila + 5.0)) - 0.5) * alto * 0.25), (hashNoche(vec2(celda + 3.0, fila)) - 0.5) * 0.22);
  float semiL = 0.5 * largo * (0.68 + 0.26 * azar);
  float semiW = 0.5 * alto * (0.62 + 0.34 * hashNoche(vec2(celda + 7.0, fila)));
  float afina = 1.0 - 0.4 * pow(clamp(abs(uv.x) / semiL, 0.0, 1.0), 2.0);
  float d = pinceladaNoche(uv.x, uv.y / afina, semiL, semiW);
  float aa = max(fwidth(yq), 1e-5) * 1.3;
  float cubre = (1.0 - smoothstep(-aa, aa, d)) * step(0.1, hashNoche(vec2(celda + 11.0, fila + 2.0)));
  vec3 col = delCielo ? colorDelCielo(azar, franjasNoche((fila + 0.5) * alto), altoCielo) : vec3(azar);
  return vec4(col, cubre);
}

// --- Las pinceladas del cielo, una a una --------------------------------------------------------
//
// Cada pincelada nace en un punto de una rejilla con azar (dos capas desfasadas) y se orienta con el
// viento en ese punto: horizontal con ondas, enroscado en los remolinos (en espiral, hacia dentro) y
// dando vueltas alrededor de cada estrella y de la luna. Su color sale de dónde está: los anillos de
// los halos, los brazos claros de los remolinos, las franjas claras del viento o los azules de la
// noche. Así todo es un solo cielo, sin costuras, como en el cuadro.

// Halo i (11 estrellas y la luna): centro (xy), radio (z) y si es la luna (w).
vec4 haloNoche(int i) {
  float A = uAspectoNoche;
  float s = escalaNoche();
  if (i == 11) return vec4(A - 0.36 * s, 0.68, 0.28 * s, 1.0);
  vec3 e = i == 0 ? vec3(-0.62, 0.86, 0.085)
    : i == 1 ? vec3(-0.2, 0.9, 0.07)
    : i == 2 ? vec3(0.08, 0.8, 0.095)
    : i == 3 ? vec3(0.34, 0.92, 0.065)
    : i == 4 ? vec3(0.52, 0.5, 0.08)
    : i == 5 ? vec3(0.84, 0.3, 0.1)
    : i == 6 ? vec3(0.34, 0.16, 0.07)
    : i == 7 ? vec3(-0.42, 0.04, 0.11)
    : i == 8 ? vec3(-0.06, -0.02, 0.06)
    : i == 9 ? vec3(0.6, 0.0, 0.065)
    : vec3(-0.84, 0.46, 0.075);
  return vec4(e.x * A, e.y, e.z * s * 1.3, 0.0);
}

// Orientaciones en ángulo doble (una pincelada no tiene sentido: así se mezclan sin anularse).
vec2 dobleNoche(vec2 v) {
  return vec2(v.x * v.x - v.y * v.y, 2.0 * v.x * v.y);
}

vec2 mitadNoche(vec2 o) {
  float a = 0.5 * atan(o.y, o.x + 1e-6);
  return vec2(cos(a), sin(a));
}

// La dirección del viento en p (con los halos cercanos al píxel).
vec2 direccionViento(vec2 p, vec4 halos[3], float t) {
  vec2 v = normalize(vec2(1.0, 0.045 * 2.1 * cos(p.x * 2.1 + 0.7) + 0.018 * 5.3 * cos(p.x * 5.3 - 1.3)));
  vec2 o = dobleNoche(v);
  for (int i = 0; i < 3; i++) {
    vec3 rem = remolinoNoche(i);
    float sentido = i == 1 ? -1.0 : 1.0;
    vec2 d = p - rem.xy;
    float r = max(length(d), 1e-4);
    float k = smoothstep(0.08, 0.7, exp(-pow(r / (rem.z * 1.2), 2.0)));
    vec2 espiral = normalize(sentido * vec2(-d.y, d.x) / r - 0.24 * d / r);
    o = mix(o, dobleNoche(espiral), k);
  }
  for (int h = 0; h < 3; h++) {
    vec2 d = p - halos[h].xy;
    float r = max(length(d), 1e-4);
    float k = 1.0 - smoothstep(0.7 * halos[h].z, 1.12 * halos[h].z, r);
    o = mix(o, dobleNoche(vec2(-d.y, d.x) / r), k);
  }
  // Un vaivén muy lento, como si el viento cambiara.
  return giroNoche(mitadNoche(o), 0.06 * sin(t * 0.25 + p.x * 3.0 + p.y * 2.0));
}

// El color de la pincelada que nace en c.
vec3 colorPincelada(vec2 c, float h1, float h2, float t, vec4 halos[3]) {
  // En un halo: anillos amarillos, blancos y, por fuera, verdosos (la luna, dorados y naranjas).
  for (int h = 0; h < 3; h++) {
    float r = length(c - halos[h].xy);
    if (r < halos[h].z) {
      float f = r / halos[h].z + 0.08 * (h2 - 0.5);
      if (halos[h].w > 0.5) {
        return f < 0.4 ? mix(vec3(1.0, 0.92, 0.5), vec3(1.0, 0.97, 0.75), h1)
          : f < 0.62 ? mix(vec3(0.97, 0.64, 0.18), vec3(1.0, 0.78, 0.3), h1)
          : f < 0.82 ? mix(vec3(1.0, 0.87, 0.42), vec3(0.97, 0.94, 0.68), h1)
          : mix(vec3(0.56, 0.74, 0.68), vec3(0.7, 0.82, 0.7), h1);
      }
      return f < 0.38 ? mix(vec3(1.0, 0.95, 0.66), vec3(1.0, 0.99, 0.88), h1)
        : f < 0.62 ? mix(vec3(0.98, 0.84, 0.34), vec3(1.0, 0.92, 0.56), h1)
        : f < 0.84 ? mix(vec3(0.9, 0.92, 0.64), vec3(0.74, 0.86, 0.66), h1)
        : mix(vec3(0.46, 0.68, 0.74), vec3(0.6, 0.78, 0.8), h1);
    }
  }
  // En un remolino: brazos claros en espiral que giran despacio (y el centro, más oscuro). En su
  // borde, unas pinceladas son del remolino y otras del viento de fuera.
  float franja = -1.0;
  for (int i = 0; i < 3; i++) {
    vec3 rem = remolinoNoche(i);
    vec2 d = c - rem.xy;
    float r = length(d);
    if (r < rem.z && h2 < 1.0 - smoothstep(0.62 * rem.z, rem.z, r)) {
      float sentido = i == 1 ? -1.0 : 1.0;
      float vuelta = rem.z * 0.72;
      float theta = atan(d.y, d.x) / 6.2831853 - sentido * t * 0.012;
      float brazo = fract(r / vuelta - sentido * theta + (i == 0 ? 0.15 : i == 1 ? 0.6 : 0.3));
      // Un brazo claro y ancho (blanco y celeste: el rizo de la ola) y, entre vuelta y vuelta, azul
      // hondo; el ojo, oscuro.
      franja = (1.0 - smoothstep(0.16, 0.24, abs(brazo - 0.5))) * smoothstep(0.12, 0.3, r / rem.z);
      franja = mix(-0.3, 1.15, franja);
    }
  }
  // Fuera: las franjas claras del viento.
  if (franja < 0.0) franja = franjasNoche(vientoNoche(c).y);
  return colorDelCielo(h1, franja, c.y);
}

vec3 cieloNoche(vec2 p, vec3 fondo, float t) {
  // Los halos cerca de este píxel (como mucho tres).
  vec4 halos[3];
  halos[0] = vec4(0.0, 0.0, -1.0, 0.0);
  halos[1] = vec4(0.0, 0.0, -1.0, 0.0);
  halos[2] = vec4(0.0, 0.0, -1.0, 0.0);
  int n = 0;
  for (int i = 0; i < 12; i++) {
    vec4 h = haloNoche(i);
    if (n < 3 && length(p - h.xy) < h.z * 1.15 + 0.07) {
      halos[n] = h;
      n++;
    }
  }
  float g = 0.03;
  float aa = uPixelNoche * 0.9;
  vec3 c = fondo * 0.8;
  for (int capa = 0; capa < 2; capa++) {
    vec2 desp = capa == 0 ? vec2(0.0) : vec2(0.5 * g, 0.37 * g);
    vec2 base = floor((p - desp) / g);
    // Las dos pinceladas de encima en este píxel (el orden, al azar).
    float z1 = -1.0;
    float z2 = -1.0;
    vec3 c1 = vec3(0.0);
    vec3 c2 = vec3(0.0);
    float a1 = 0.0;
    float a2 = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 celda = base + vec2(float(i), float(j));
        float h1 = hashNoche(celda + 17.3 * float(capa));
        float h2 = hashNoche(celda.yx + vec2(5.1, 3.0 * float(capa)));
        float h3 = hashNoche(celda + vec2(9.7, 2.3 + float(capa)));
        if (capa == 1 && h3 < 0.45) continue;
        vec2 centro = (celda + 0.15 + 0.7 * vec2(h1, h2)) * g + desp;
        vec2 dir = direccionViento(centro, halos, t);
        float semiL = g * (0.72 + 0.28 * h3);
        float semiW = g * (0.25 + 0.11 * h1);
        vec2 q = p - centro;
        float u = dot(q, dir);
        float v = dot(q, vec2(-dir.y, dir.x)) + 0.3 * (h2 - 0.5) * u * u / g;
        float afina = 1.0 - 0.45 * pow(clamp(abs(u) / semiL, 0.0, 1.0), 2.0);
        float d = pinceladaNoche(u, v / afina, semiL, semiW);
        float a = 1.0 - smoothstep(-aa, aa, d);
        if (a <= 0.0) continue;
        float z = h3 + 0.37 * h2;
        vec3 col = colorPincelada(centro, h1, h2, t, halos);
        if (z > z1) {
          z2 = z1;
          c2 = c1;
          a2 = a1;
          z1 = z;
          c1 = col;
          a1 = a;
        } else if (z > z2) {
          z2 = z;
          c2 = col;
          a2 = a;
        }
      }
    }
    c = mix(c, c2, a2);
    c = mix(c, c1, a1);
  }
  return c;
}

// --- Estrellas y luna: los núcleos, encima de sus halos -----------------------------------------

// El núcleo de la estrella: un disco blanco amarillento con su tinta.
vec3 nucleoEstrella(vec3 c, vec2 p, vec2 centro, float radio) {
  float r = length(p - centro);
  float u = uPixelNoche;
  vec3 nucleo = mix(vec3(1.0, 0.99, 0.9), vec3(1.0, 0.9, 0.5), smoothstep(0.0, radio, r));
  c = mix(c, nucleo, 1.0 - smoothstep(radio - u, radio + u, r));
  return mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.6 * u, 1.8 * u, abs(r - radio))) * 0.8);
}

vec3 estrellasNoche(vec3 c, vec2 p, float t) {
  for (int i = 0; i < 11; i++) {
    vec4 h = haloNoche(i);
    if (length(p - h.xy) < h.z * 0.3) c = nucleoEstrella(c, p, h.xy, h.z * 0.2);
  }
  // La luna en cuarto creciente, con su tinta.
  vec4 l = haloNoche(11);
  float rl = 0.105 * escalaNoche();
  vec2 ql = (p - l.xy) / rl;
  if (length(ql) > 1.3) return c;
  float dLuna = max(length(ql) - 1.0, -(length(ql - vec2(0.45, 0.32)) - 0.95)) * rl;
  float u = uPixelNoche;
  vec3 luna = mix(vec3(0.97, 0.62, 0.16), vec3(1.0, 0.86, 0.38), smoothstep(-0.8, 0.5, dot(ql, vec2(-0.6, 0.8))));
  c = mix(c, luna, 1.0 - smoothstep(-u, u, dLuna));
  return mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.7 * u, 2.0 * u, abs(dLuna))) * 0.9);
}

// --- El paisaje ---------------------------------------------------------------------------------

// Una capa con su tinta: la pinta encima (d < 0 dentro) y marca 'paisaje'.
vec3 capaPaisaje(vec3 c, float d, vec3 relleno, float tintaPx, inout float paisaje) {
  float u = uPixelNoche;
  float dentro = 1.0 - smoothstep(-u, u, d);
  c = mix(c, relleno, dentro);
  if (tintaPx > 0.0) c = mix(c, TINTA_NOCHE, 1.0 - smoothstep((0.5 * tintaPx - 0.5) * u, (0.5 * tintaPx + 0.5) * u, abs(d)));
  paisaje = max(paisaje, dentro);
  return c;
}

// Pinceladas que siguen una curva (filas a lo largo de q.x): dos capas desfasadas, con los tres
// colores dados y, debajo, el hueco.
vec3 pinceladasDeLomo(vec2 q, float alto, float semilla, vec3 c0, vec3 c1, vec3 c2, vec3 hueco, float t) {
  vec3 c = hueco;
  for (int k = 0; k < 2; k++) {
    vec4 capa = capaPinceladas(q + float(k) * vec2(0.29, 0.5 * alto), alto, semilla + float(k) * 4.0, t * 0.15, 0.0, false);
    float azar = capa.r;
    vec3 col = azar < 0.42 ? c0 : azar < 0.8 ? c1 : c2;
    c = mix(c, col, capa.a * (k == 0 ? 1.0 : 0.7));
  }
  return c;
}

float crestaLejana(float x) {
  return -0.13 + 0.06 * sin(x * 1.4 + 0.5) + 0.035 * sin(x * 3.3 + 1.2) + 0.09 * smoothstep(-0.4, 1.6, x);
}

float crestaMedia(float x) {
  return -0.3 + 0.05 * sin(x * 2.2 + 2.4) + 0.03 * sin(x * 5.1 + 0.3) + 0.03 * smoothstep(0.0, 1.5, x);
}

// Una loma: pinceladas que siguen su lomo, un borde claro de luna y su tinta.
vec3 lomaNoche(vec3 c, vec2 p, float cresta, float semilla, vec3 c0, vec3 c1, vec3 c2, vec3 hueco, vec3 borde, float t, inout float paisaje) {
  if (p.y > cresta + 0.02) return c;
  vec3 loma = pinceladasDeLomo(vec2(p.x, p.y - cresta), 0.022, semilla, c0, c1, c2, hueco, t);
  loma = mix(loma, borde, (1.0 - smoothstep(0.006, 0.02, cresta - p.y)) * 0.7);
  return capaPaisaje(c, p.y - cresta, loma, 2.2, paisaje);
}

vec3 colinasNoche(vec3 c, vec2 p, float t, inout float paisaje) {
  c = lomaNoche(c, p, crestaLejana(p.x), 5.0, vec3(0.16, 0.27, 0.54), vec3(0.24, 0.37, 0.64), vec3(0.42, 0.58, 0.74), vec3(0.1, 0.16, 0.36), vec3(0.6, 0.76, 0.84), t, paisaje);
  return lomaNoche(c, p, crestaMedia(p.x), 9.0, vec3(0.09, 0.15, 0.33), vec3(0.14, 0.22, 0.43), vec3(0.28, 0.38, 0.56), vec3(0.05, 0.08, 0.2), vec3(0.42, 0.54, 0.7), t, paisaje);
}

// Una casa del pueblo (fila f, celda i): paredes, tejado a dos aguas y alguna ventana encendida. El
// pueblo se apiña alrededor de la iglesia (más casas cerca de ella) y no llega al ciprés.
vec3 casaNoche(vec3 c, vec2 p, float fila, float i, float base, float ancho, float xIglesia, inout float paisaje) {
  float s = escalaNoche();
  float cx = (i + 0.5) * ancho + 0.25 * ancho * (hashNoche(vec2(i + 9.0, fila)) - 0.5);
  float cerca = exp(-pow((cx - xIglesia) / (0.75 + 0.2 * fila), 2.0));
  if (hashNoche(vec2(i, fila * 7.0 + 1.0)) > 0.3 + 0.62 * cerca || cx < -uAspectoNoche + 0.42 * s) return c;
  float semiA = 0.5 * ancho * (0.55 + 0.3 * hashNoche(vec2(i + 3.0, fila)));
  float alto = (0.04 + 0.035 * hashNoche(vec2(i + 5.0, fila))) * s * (0.8 + 0.3 * fila);
  vec2 q = p - vec2(cx, base + 0.012 * sin(cx * 9.0));
  float dPared = max(abs(q.x) - semiA, max(-q.y, q.y - alto));
  float tejado = alto + 0.65 * semiA * (0.7 + 0.5 * hashNoche(vec2(i, fila + 11.0)));
  float dTejado = max(max(q.y - tejado + abs(q.x) * (tejado - alto) / (semiA * 1.14), alto - q.y), abs(q.x) - semiA * 1.14);
  vec3 pared = mix(vec3(0.24, 0.28, 0.46), vec3(0.36, 0.36, 0.48), hashNoche(vec2(i, fila + 2.0)));
  // Pinceladas verticales en la pared, como en el cuadro (un tono más claro y otro más oscuro).
  float trazo = hashNoche(vec2(floor((q.x + semiA) / (0.012 * s)), i + fila * 13.0));
  pared *= 0.9 + 0.2 * trazo;
  vec3 colTejado = mix(vec3(0.1, 0.12, 0.27), vec3(0.3, 0.2, 0.28), hashNoche(vec2(i + 1.0, fila + 4.0)));
  colTejado *= 0.9 + 0.2 * hashNoche(vec2(floor((q.x + q.y) / (0.014 * s)), i + 7.0));
  c = capaPaisaje(c, dPared, pared, 1.8, paisaje);
  c = capaPaisaje(c, dTejado, colTejado, 1.8, paisaje);
  float ventanas = step(0.3, hashNoche(vec2(i + 2.0, fila + 6.0)));
  vec2 v = q - vec2((hashNoche(vec2(i, fila + 8.0)) - 0.5) * semiA, alto * 0.45);
  float dVentana = max(abs(v.x) - 0.01 * s, abs(v.y) - 0.012 * s);
  c = mix(c, mix(c, vec3(1.0, 0.8, 0.36), 0.35), (1.0 - smoothstep(0.0, 0.012 * s, dVentana)) * ventanas * step(dPared, 0.0));
  return mix(c, vec3(1.0, 0.88, 0.42), (1.0 - smoothstep(-uPixelNoche, uPixelNoche, dVentana)) * ventanas * step(dPared, 0.0));
}

// El pueblo: el suelo de huertos oscuros, casas con ventanas encendidas en tres filas (apiñadas
// alrededor de la iglesia), árboles oscuros redondos y la iglesia con su aguja alta.
vec3 puebloNoche(vec3 c, vec2 p, float t, inout float paisaje) {
  float s = escalaNoche();
  float A = uAspectoNoche;
  if (p.y > -0.02) return c;
  float xIglesia = -0.06 * min(A, 1.4);
  // El suelo bajo el pueblo: pinceladas verdes oscuras y azules que siguen las lomas.
  float suelo = -0.47 + 0.035 * sin(p.x * 2.7 + 1.0);
  if (p.y < suelo + 0.02) {
    vec3 tierra = pinceladasDeLomo(vec2(p.x, p.y - suelo), 0.02, 21.0, vec3(0.08, 0.17, 0.17), vec3(0.13, 0.24, 0.24), vec3(0.22, 0.3, 0.4), vec3(0.03, 0.06, 0.08), t);
    c = capaPaisaje(c, p.y - suelo, tierra, 0.0, paisaje);
  }
  // Tres filas de casas (de atrás adelante), cada vez más grandes, con árboles entre ellas.
  for (int f = 0; f < 3; f++) {
    float ff = float(f);
    float ancho = (0.085 + 0.025 * ff) * s;
    float base = -0.46 - 0.17 * ff;
    if (p.y > base + 0.17 * s || p.y < base - 0.03) continue;
    float i = floor(p.x / ancho);
    for (int k = -1; k <= 1; k++) c = casaNoche(c, p, ff, i + float(k), base, ancho, xIglesia, paisaje);
    float j = floor(p.x / (ancho * 1.3) + 0.5);
    if (hashNoche(vec2(j, ff + 30.0)) > 0.45) {
      vec2 enArbol = (p - vec2((j + 0.3 * (hashNoche(vec2(j, ff + 31.0)) - 0.5)) * ancho * 1.3, base + 0.025 * s)) / (vec2(0.032, 0.045) * s);
      vec3 verde = mix(vec3(0.05, 0.1, 0.11), vec3(0.11, 0.2, 0.18), hashNoche(vec2(j, ff)));
      c = capaPaisaje(c, (length(enArbol) - 1.0) * 0.032 * s, verde, 1.8, paisaje);
    }
  }
  // La iglesia, en medio: el cuerpo, la torre y la aguja alta que sube sobre las colinas.
  vec2 q = p - vec2(xIglesia, -0.5);
  float dCuerpo = max(abs(q.x - 0.05 * s) - 0.06 * s, max(-q.y, q.y - 0.07 * s));
  float dTejadoI = max(max(q.y - 0.12 * s + abs(q.x - 0.05 * s) * 0.8, 0.07 * s - q.y), abs(q.x - 0.05 * s) - 0.065 * s);
  float dTorre = max(abs(q.x) - 0.022 * s, max(-q.y, q.y - 0.16 * s));
  float dAguja = max((abs(q.x) * 15.0 + (q.y - 0.16 * s) - 0.36 * s) / 16.0, 0.16 * s - q.y);
  c = capaPaisaje(c, dCuerpo, vec3(0.26, 0.29, 0.47), 2.0, paisaje);
  c = capaPaisaje(c, dTejadoI, vec3(0.12, 0.13, 0.28), 2.0, paisaje);
  c = capaPaisaje(c, dTorre, vec3(0.22, 0.24, 0.42), 2.0, paisaje);
  c = capaPaisaje(c, dAguja, vec3(0.1, 0.11, 0.25), 2.0, paisaje);
  return c;
}

// El ciprés, a la izquierda: una llama oscura que sube desde abajo casi hasta arriba, con lenguas
// en el borde que se mecen despacio y pinceladas verticales dentro.
vec3 cipresNoche(vec3 c, vec2 p, float t, inout float paisaje) {
  float A = uAspectoNoche;
  float s = escalaNoche();
  float y0 = -1.08;
  float altoC = 1.94;
  float k = clamp((p.y - y0) / altoC, 0.0, 1.0);
  float cx = -A + 0.26 * s + 0.05 * s * sin(k * 3.2 + 0.4) + 0.05 * s * k;
  if (abs(p.x - cx) > 0.32 * s) return c;
  float semi = 0.24 * s * pow(1.0 - k, 0.85) * (0.86 + 0.14 * sin(k * 8.0 + 1.0));
  // Lenguas de llama en el borde, que se mecen despacio.
  semi += 0.022 * s * sin(p.y * 21.0 + 0.6 * sin(p.y * 6.0 + t * 0.4)) * (1.0 - 0.6 * k);
  float d = max(abs(p.x - cx) - semi, p.y - (y0 + altoC));
  // Dos lenguas que se separan del cuerpo cerca de la punta.
  vec2 l1 = (p - vec2(cx - 0.05 * s, y0 + altoC * 0.82)) / vec2(0.025 * s, 0.14);
  vec2 l2 = (p - vec2(cx + 0.055 * s, y0 + altoC * 0.74)) / vec2(0.022 * s, 0.11);
  d = min(d, (length(l1) - 1.0) * 0.025 * s);
  d = min(d, (length(l2) - 1.0) * 0.022 * s);
  if (d > 0.02) return c;
  // Pinceladas verticales que ondulan como llamas.
  vec2 q = vec2(p.y, p.x - cx + 0.018 * sin(p.y * 10.0 + t * 0.35));
  vec3 relleno = pinceladasDeLomo(q, 0.018 * s, 33.0, vec3(0.05, 0.11, 0.07), vec3(0.11, 0.2, 0.11), vec3(0.27, 0.31, 0.13), vec3(0.02, 0.04, 0.03), t);
  return capaPaisaje(c, d, relleno, 2.6, paisaje);
}

// --- El cuadro entero ---------------------------------------------------------------------------

// El cuadro en la dirección d (coordenadas del valle): el color y, en a, si es paisaje (colinas,
// pueblo, ciprés) o cielo.
vec4 cuadroNoche(vec3 d) {
  float t = uTiempoNoche;
  vec3 fondo = fondoNoche(d);
  float delante;
  vec2 p = lienzoNoche(d, delante);
  if (delante < 0.001) return vec4(fondo, step(d.y, 0.1));
  vec3 c = cieloNoche(p, fondo, t);
  c = estrellasNoche(c, p, t);
  float paisaje = 0.0;
  c = colinasNoche(c, p, t, paisaje);
  c = puebloNoche(c, p, t, paisaje);
  c = cipresNoche(c, p, t, paisaje);
  return vec4(mix(fondo, c, delante), paisaje * delante);
}

// La noche cae como una aguada que baja desde lo alto: x, cuánto la cubre ya; y, su orilla, donde el
// pigmento se acumula al secarse (más oscura).
vec2 caidaNoche(vec3 d) {
  float frente = mix(1.75, -0.35, smoothstep(0.0, 1.0, uNoche * 1.12));
  float e = asin(clamp(d.y, -1.0, 1.0)) + 0.14 * (fbm3(d * 3.0 + vec3(1.0, 4.0, 2.0)) - 0.5) + 0.04 * (ruido3(d * 14.0) - 0.5);
  float w = max(fwidth(e), 1e-4) * 1.5;
  float x = (e - frente) / 0.03;
  return vec2(smoothstep(frente - w, frente + w, e), exp(-x * x) * step(0.0, e - frente));
}

// Lo que no cubre el cuadro, de noche: a la luz de la luna (más oscuro, desaturado y azulado).
vec3 gradoNoche(vec3 c) {
  float L = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 gris = mix(vec3(L), c, 0.4);
  return gris * vec3(0.34, 0.42, 0.7) + vec3(0.02, 0.03, 0.08);
}
`
