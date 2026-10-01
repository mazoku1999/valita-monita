/**
 * La noche estrellada del final (ver `features/cochabamba/store/carta.ts`): al abrir la cajita la
 * cámara mira al cielo y éste se vuelve el cielo de "La noche estrellada" de Van Gogh, como en la
 * reproducción al pastel que mandó el usuario: sólo el cielo (sin el pueblo ni el ciprés), con las
 * montañas de verdad debajo, a la luz de la luna.
 *
 * - Todo el cielo es de pinceladas largas y peinadas, de pastel, que siguen el viento. El viento es
 *   una corriente: sus líneas van casi horizontales, con ondas; abajo siguen la franja verde que sube
 *   hacia la derecha; rodean cada estrella como el agua una piedra; y en la ola (el gran remolino del
 *   centro) y en su compañero, más pequeño, se enroscan en una S, como en el cuadro.
 * - Las pinceladas van en franjas a lo largo de esas líneas (tres capas desfasadas), partidas en
 *   tramos con su hueco: cada una entra apoyada y sale afinándose, y toma un color de su región: azules
 *   ultramar, cobalto y añil con trazos cerúleos; la franja clara que llega desde la izquierda; los
 *   brazos blancos y celestes de la ola; la franja verde amarilla.
 * - Las estrellas y la luna son discos de pinceladas en redondo: un núcleo amarillo y anillos blancos,
 *   verde agua y celestes (la luna, verde amarillo y dorado alrededor del creciente naranja), con un
 *   aro de azul hondo que los recorta.
 *
 * Se compone sobre la vista final de la cámara (`uMarcoNoche`: derecha, arriba y adelante en
 * coordenadas del valle; `uTanNoche`: la tangente de medio campo de visión vertical), en un lienzo
 * donde la media altura de la pantalla mide 1 y el ancho llega a ±`uAspectoNoche`; la composición del
 * cuadro se reparte por el ancho y se escala en pantallas estrechas (cabe en un móvil en vertical).
 * Las pinceladas se deslizan despacio por sus líneas, sin latir.
 *
 * Necesita RUIDO3_GLSL y CAIDA_NOCHE_GLSL. La noche cae como una aguada que baja desde lo alto
 * (`uNoche` 0 → 1); sólo cubre el cielo (lo de abajo pasa a la luz de la luna, ver `gradoNoche`).
 */
export const NOCHE_ESTRELLADA_GLSL = /* glsl */ `
uniform mat3 uMarcoNoche;
uniform float uTanNoche;
uniform float uAspectoNoche;
uniform float uTiempoNoche;
uniform float uPixelNoche;

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

// Escala de la composición (en pantallas estrechas, algo menor) y el medio ancho en el que se
// reparte (en pantallas muy anchas no se estira más).
float escalaNoche() {
  return clamp(uAspectoNoche / 1.5, 0.56, 1.0);
}

float anchoNoche() {
  return min(uAspectoNoche, 1.65);
}

// Lienzo de la vista final y cuánto mira hacia delante (lejos de la vista final, sólo el fondo).
vec2 lienzoNoche(vec3 d, out float delante) {
  vec3 q = transpose(uMarcoNoche) * d;
  delante = smoothstep(0.12, 0.32, q.z);
  return q.xy / max(q.z, 0.12) / uTanNoche;
}

// --- La composición del cuadro -------------------------------------------------------------------

// Los discos del cuadro: las ocho estrellas (0..7), la luna (8) y los dos remolinos (9: la ola;
// 10: su compañero, abajo a la derecha): centro (xy), radio (z) y tipo (w: 0 estrella, 1 luna,
// 2 remolino).
vec4 discoNoche(int i) {
  float W = anchoNoche();
  float s = escalaNoche();
  if (i == 9) return vec4(-0.1 * W, 0.22, 0.34 * s, 2.0);
  if (i == 10) return vec4(0.33 * W, -0.03, 0.18 * s, 2.0);
  if (i == 8) return vec4(0.8 * W, 0.6, 0.29 * s, 1.0);
  vec3 e = i == 0 ? vec3(-0.88, 0.9, 0.14)
    : i == 1 ? vec3(-0.37, 0.93, 0.15)
    : i == 2 ? vec3(0.19, 0.8, 0.15)
    : i == 3 ? vec3(-0.61, 0.64, 0.12)
    : i == 4 ? vec3(0.4, 0.5, 0.125)
    : i == 5 ? vec3(-0.43, 0.3, 0.105)
    : i == 6 ? vec3(-0.87, 0.02, 0.12)
    : vec3(-0.36, -0.08, 0.2);
  return vec4(e.x * W, e.y, e.z * s, 0.0);
}

// Hasta dónde llega cada disco: las estrellas y la luna, con un aro de azul hondo alrededor.
float zonaDisco(vec4 h) {
  return h.z * (h.w > 1.5 ? 1.0 : 1.22);
}

// El plano enroscado: alrededor de cada remolino el plano gira un poco, más cuanto más cerca, y las
// líneas del viento que lo rodean se curvan hacia él (como las agujas del reloj).
vec2 enroscarNoche(vec2 p) {
  vec2 q = p;
  for (int i = 9; i < 11; i++) {
    vec4 r = discoNoche(i);
    vec2 d = q - r.xy;
    float k = max(1.0 - length(d) / (r.z * 1.7), 0.0);
    q = r.xy + giroNoche(d, 1.6 * k * k);
  }
  return q;
}

// La franja verde amarilla: sube hacia la derecha, curvándose.
float alturaFranjaVerde(float x) {
  float fx = x / anchoNoche();
  return -0.31 + 0.22 * fx + 0.15 * fx * fx;
}

// La corriente del viento en el plano enroscado: sus curvas de nivel son las líneas por las que van
// las pinceladas (casi horizontales, con ondas; abajo, paralelas a la franja verde).
float corrienteNoche(vec2 q) {
  float verde = alturaFranjaVerde(q.x);
  float m = 1.0 - smoothstep(0.0, 0.7, q.y - verde);
  return q.y - (verde + 0.31) * m + 0.055 * sin(q.x * 1.7 + 0.7) + 0.018 * sin(q.x * 4.6 - 1.3);
}

// La corriente en p, rodeando los discos como el agua una piedra (cada uno desvía las líneas
// cercanas; lejos, nada).
float corrienteRodeando(vec2 p, vec2 q) {
  float psi = corrienteNoche(q);
  for (int i = 0; i < 11; i++) {
    vec4 h = discoNoche(i);
    float borde = zonaDisco(h);
    float r = length(p - h.xy);
    if (r > borde * 3.2) continue;
    float centro = corrienteNoche(enroscarNoche(h.xy));
    float desvio = 0.45 * borde * borde / max(r * r, borde * borde) * (1.0 - smoothstep(2.0 * borde, 3.2 * borde, r));
    psi = centro + (psi - centro) * (1.0 - desvio);
  }
  return psi;
}

// --- Las pinceladas ------------------------------------------------------------------------------

// Una capa de pinceladas: franjas a lo largo de las curvas de nivel de una corriente (k = corriente /
// periodo + desfase; dk, cuánto cambia k en un píxel; clave, la de la franja para su azar), partidas
// a lo largo (s, en tramos: una pincelada por tramo, con su hueco) y, si vueltas > 0, cerradas en
// redondo (s da la vuelta en tantos tramos). Cada pincelada entra apoyada y sale afinándose; se
// deslizan despacio. Presencia: en las orillas entre regiones, cada pincelada sigue mientras le toque
// (según su azar) y se corta donde ya no.
// Devuelve: x, cuánto cubre el píxel; y, el medio de su tramo (en s); z, w: azares.
vec4 capaPinceladas(float k, float dk, float s, float vueltas, float clave, float semilla, float grosor, float presencia, float t) {
  float f = abs(fract(k) - 0.5);
  float hf = hashNoche(vec2(clave, semilla));
  float corrimiento = hf * 13.7 + t * (0.05 + 0.06 * hf);
  float ss = s + corrimiento;
  float j = floor(ss);
  float u = ss - j;
  float jj = vueltas > 0.0 ? mod(j, vueltas) : j;
  float h1 = hashNoche(vec2(clave + 0.37, jj + 11.0 * semilla));
  float h2 = hashNoche(vec2(jj - 5.3, clave + 7.0 * semilla));
  float a0 = 0.02 + 0.18 * h1;
  float a1 = 0.72 + 0.26 * h2;
  float h3 = hashNoche(vec2(clave * 1.7 - jj, 3.3 * semilla + 0.5));
  float w = grosor * (0.72 + 0.28 * h2) * smoothstep(a0, a0 + 0.14, u) * (1.0 - smoothstep(a1 - 0.32, a1, u));
  // (Sí o no, sin afinarla: las que van a lo largo de la orilla quedarían como pelos.)
  w *= step(h3, presencia);
  // Cuánto del píxel (dk de ancho, en franjas) cae dentro de la pincelada (2w de ancho): sin pelos
  // donde w se acaba.
  float cubre = clamp((min(f + 0.5 * dk, w) - max(f - 0.5 * dk, -w)) / max(dk, 1e-4), 0.0, 1.0);
  // Si las franjas ya no caben en los píxeles, su promedio.
  cubre = mix(cubre, 1.1 * grosor * presencia, smoothstep(0.4, 0.9, dk));
  return vec4(cubre, j + 0.5 - corrimiento, h1, hashNoche(vec2(clave * 0.73 + semilla, jj * 1.31)));
}

// --- Los colores (de la reproducción, por regiones) ----------------------------------------------

vec3 colorCielo(float a) {
  return a < 0.32 ? vec3(0.1, 0.36, 0.82)
    : a < 0.58 ? vec3(0.12, 0.28, 0.74)
    : a < 0.8 ? vec3(0.07, 0.16, 0.5)
    : a < 0.95 ? vec3(0.2, 0.48, 0.88)
    : vec3(0.38, 0.65, 0.9);
}

vec3 colorFranjaClara(float a) {
  return a < 0.3 ? vec3(0.42, 0.74, 0.92)
    : a < 0.55 ? vec3(0.62, 0.85, 0.94)
    : a < 0.75 ? vec3(0.86, 0.95, 0.97)
    : a < 0.9 ? vec3(0.3, 0.6, 0.88)
    : vec3(0.6, 0.8, 0.62);
}

vec3 colorFranjaVerde(float a) {
  return a < 0.28 ? vec3(0.74, 0.88, 0.5)
    : a < 0.48 ? vec3(0.52, 0.72, 0.52)
    : a < 0.68 ? vec3(0.86, 0.84, 0.46)
    : a < 0.86 ? vec3(0.66, 0.86, 0.68)
    : vec3(0.14, 0.5, 0.88);
}

// La ola: entre los brazos, azul hondo; en los brazos, celestes, blancos y algún verde agua.
vec3 colorOla(float a, float claro) {
  vec3 hueco = a < 0.5 ? vec3(0.13, 0.42, 0.86) : a < 0.85 ? vec3(0.1, 0.32, 0.78) : vec3(0.08, 0.18, 0.5);
  vec3 brazo = a < 0.28 ? vec3(0.38, 0.72, 0.92) : a < 0.56 ? vec3(0.6, 0.87, 0.96) : a < 0.86 ? vec3(0.88, 0.96, 0.98) : vec3(0.64, 0.85, 0.7);
  return a < claro ? brazo : hueco;
}

vec3 colorHalo(float f, float a, bool luna) {
  if (f > 1.0) return a < 0.3 ? vec3(0.08, 0.2, 0.58) : a < 0.7 ? vec3(0.1, 0.3, 0.74) : vec3(0.16, 0.42, 0.84);
  if (luna) {
    return f < 0.5 ? (a < 0.4 ? vec3(0.92, 0.95, 0.62) : a < 0.75 ? vec3(0.86, 0.9, 0.5) : vec3(1.0, 0.9, 0.52))
      : f < 0.7 ? (a < 0.45 ? vec3(0.82, 0.92, 0.56) : a < 0.8 ? vec3(0.72, 0.87, 0.55) : vec3(0.95, 0.84, 0.4))
      : f < 0.87 ? (a < 0.4 ? vec3(0.58, 0.8, 0.6) : a < 0.8 ? vec3(0.5, 0.74, 0.62) : vec3(0.78, 0.9, 0.6))
      : (a < 0.5 ? vec3(0.34, 0.62, 0.74) : vec3(0.26, 0.5, 0.78));
  }
  return f < 0.3 ? (a < 0.4 ? vec3(0.98, 0.86, 0.36) : a < 0.7 ? vec3(1.0, 0.95, 0.62) : vec3(0.94, 0.7, 0.26))
    : f < 0.45 ? (a < 0.5 ? vec3(1.0, 0.97, 0.74) : vec3(0.94, 0.94, 0.58))
    : f < 0.7 ? (a < 0.4 ? vec3(0.86, 0.98, 0.93) : a < 0.75 ? vec3(0.96, 0.99, 0.95) : vec3(0.7, 0.92, 0.88))
    : f < 0.88 ? (a < 0.45 ? vec3(0.64, 0.89, 0.88) : a < 0.8 ? vec3(0.76, 0.9, 0.62) : vec3(0.9, 0.97, 0.9))
    : (a < 0.5 ? vec3(0.42, 0.74, 0.86) : vec3(0.28, 0.56, 0.86));
}

// El color de una pincelada del viento: su eje va por el nivel psi; a, b: sus azares; las de
// acento, de lo claro de cada paleta.
vec3 colorViento(float psi, vec2 p, float a, float b, bool acento) {
  if (acento) a = 0.55 + 0.45 * a;
  float verde = exp(-pow((psi + 0.31) / 0.11, 2.0));
  float clara = exp(-pow((psi - 0.43) / 0.065, 2.0));
  // El arco claro que rodea los remolinos por arriba y por la derecha (la ola que rompe).
  for (int i = 9; i < 11; i++) {
    vec4 r = discoNoche(i);
    vec2 d = p - r.xy;
    float x = length(d) / r.z;
    float lado = smoothstep(0.1, 0.6, dot(d / max(length(d), 1e-4), vec2(-0.2, 0.98)));
    clara = max(clara, (1.0 - smoothstep(1.0, 1.3, x)) * lado * 0.85);
  }
  vec4 r0 = discoNoche(9);
  vec4 r1 = discoNoche(10);
  float psi1 = corrienteNoche(enroscarNoche(r1.xy));
  float ese = exp(-pow((psi - psi1 - 0.045) / 0.04, 2.0)) * smoothstep(r0.x - 0.15, r0.x + 0.1, p.x) * (1.0 - smoothstep(r1.x + 0.05, r1.x + 0.4, p.x));
  clara = max(clara, ese * 0.95);
  if (b < verde * 1.5) return colorFranjaVerde(a);
  if (b < clara * 0.9) return colorFranjaClara(a);
  return colorCielo(a);
}

// --- El cielo ------------------------------------------------------------------------------------

// Cuánto le toca al disco en su orilla (fd: distancia al centro, en zonas; borde: su borde deshecho).
// Se mira en el eje de cada pincelada, para que sea la misma en todo su ancho.
float presenciaDisco(float fd, float borde, bool remolino) {
  return 1.0 - smoothstep(borde - (remolino ? 0.16 : 0.08), borde + (remolino ? 0.08 : 0.04), fd);
}

// El viento: el fondo (lo que se ve entre pinceladas) y tres capas de pinceladas peinadas.
vec3 fondoViento(vec2 p, float psi) {
  vec3 c = mix(vec3(0.1, 0.31, 0.74), vec3(0.08, 0.25, 0.66), smoothstep(-0.3, 0.9, p.y));
  c = mix(c, vec3(0.5, 0.68, 0.52), exp(-pow((psi + 0.31) / 0.12, 2.0)) * 0.85);
  return mix(c, vec3(0.28, 0.55, 0.84), exp(-pow((psi - 0.43) / 0.08, 2.0)) * 0.5);
}

// (gpsi: el gradiente de la corriente en el lienzo; disco, zona y borde: el disco cercano, para las
// orillas.)
vec3 vientoNoche(vec3 c, vec2 p, float psi, float dpsi, vec2 gpsi, vec2 q, vec4 disco, float zona, float borde, float t) {
  float s = escalaNoche();
  float P = 0.017 * s;
  float L = 6.5 / s;
  bool remolino = disco.w > 1.5;
  vec2 haciaEje = gpsi / max(dot(gpsi, gpsi), 1e-8);
  for (int capa = 0; capa < 3; capa++) {
    float fc = float(capa);
    bool acento = capa == 2;
    float periodo = acento ? P * 1.6 : P;
    float desfase = capa == 1 ? 0.5 : capa == 2 ? 0.25 : 0.0;
    float largo = acento ? L * 0.8 : L;
    float k = psi / periodo + desfase;
    float id = floor(k);
    vec2 eje = p - (fract(k) - 0.5) * periodo * haciaEje;
    float presencia = 1.0 - presenciaDisco(length(eje - disco.xy) / zona, borde, remolino);
    vec4 tr = capaPinceladas(k, dpsi / periodo, q.x * largo, 0.0, id, fc + 1.0, acento ? 0.26 : 0.42, presencia, t);
    if (acento) tr.x *= step(0.5, tr.z);
    if (tr.x <= 0.0) continue;
    vec3 col = colorViento((id + 0.5 - desfase) * periodo, p, tr.w, tr.z, acento);
    c = mix(c, col, tr.x);
  }
  return c;
}

// Un halo: pinceladas en redondo (anillos partidos en tramos de largo parecido).
vec3 fondoHalo(vec4 halo, float rh) {
  float f0 = rh / halo.z;
  return mix(vec3(0.1, 0.3, 0.74), colorHalo(f0, 0.45, halo.w > 0.5), f0 > 1.0 ? 0.3 : 0.6);
}

vec3 anillosNoche(vec3 c, vec4 halo, float rh, float drh, float ang, float zona, float borde, float t) {
  float s = escalaNoche();
  bool luna = halo.w > 0.5;
  float P = 0.015 * s;
  float tramo = 0.055 * s;
  for (int capa = 0; capa < 3; capa++) {
    float fc = float(capa);
    bool acento = capa == 2;
    float periodo = acento ? P * 1.5 : P;
    float desfase = capa == 1 ? 0.5 : capa == 2 ? 0.25 : 0.0;
    float k = rh / periodo + desfase;
    float id = floor(k);
    float radioEje = (id + 0.5 - desfase) * periodo;
    float vueltas = max(3.0, floor(6.2831853 * radioEje / tramo));
    float sa = (ang / 6.2831853 + 0.5) * vueltas;
    float presencia = presenciaDisco(radioEje / zona, borde, false);
    vec4 tr = capaPinceladas(k, drh / periodo, sa, vueltas, id, fc + 21.0, acento ? 0.3 : 0.42, presencia, t * 0.6);
    if (acento) tr.x *= step(0.45, tr.z);
    if (tr.x <= 0.0) continue;
    float f = radioEje / halo.z + 0.07 * (tr.z - 0.5);
    float a = acento ? 0.5 + 0.5 * tr.w : tr.w;
    c = mix(c, colorHalo(f, a, luna), tr.x);
  }
  return c;
}

// Un remolino: pinceladas en espiral que se enroscan hacia dentro como las agujas del reloj
// (espirales de paso fijo: la franja que da una vuelta entera cae m franjas más adentro), con dos
// brazos claros, celestes y blancos, entre azules hondos.
vec3 fondoRemolino(vec4 r, float rho) {
  return mix(vec3(0.22, 0.52, 0.87), vec3(0.13, 0.38, 0.8), rho / r.z);
}

vec3 remolinoPinceladas(vec3 c, vec4 r, vec2 d, float rho, float drho, float borde, float t) {
  float s = escalaNoche();
  bool ola = r.z > 0.25 * s;
  float P = 0.015 * s;
  float m = ola ? 13.0 : 8.0;
  float b = m * P / 6.2831853;
  float theta = -atan(d.y, d.x);
  float dk = drho * sqrt(1.0 + b * b / max(rho * rho, 1e-6)) / P;
  float tramo = 0.11 * s;
  // El brazo claro llega al borde por arriba: por ahí sale, hacia la izquierda, y sigue en el viento.
  float brazo = 0.53 - 0.97 * r.z / (m * P);
  for (int capa = 0; capa < 3; capa++) {
    float fc = float(capa);
    bool acento = capa == 2;
    float desfase = capa == 1 ? 0.5 : capa == 2 ? 0.25 : 0.0;
    float k = (rho + b * theta) / P + desfase;
    float id = floor(k);
    // La misma espiral en todas sus vueltas: su clave y el ángulo desenrollado.
    float espiral = mod(id, m);
    float desenrollado = theta - 6.2831853 * floor(id / m);
    float presencia = presenciaDisco((rho - (fract(k) - 0.5) * P) / r.z, borde, true);
    vec4 tr = capaPinceladas(k, dk, desenrollado * r.z * 0.6 / tramo, 0.0, espiral, fc + 31.0, acento ? 0.28 : 0.42, presencia, t * 0.8);
    if (acento) tr.x *= step(0.45, tr.z);
    if (tr.x <= 0.0) continue;
    // El brazo: unas espirales sí y otras no (un brazo claro que se enrosca).
    float fase = fract(espiral / m + brazo + 0.3);
    float claro = fase < 0.68 ? 0.96 : 0.16;
    float a = acento ? 0.5 + 0.5 * tr.w : tr.w;
    c = mix(c, colorOla(a, claro), tr.x);
  }
  return c;
}

// Las luces: un resplandor suave en cada halo, el núcleo de las estrellas (un punto de pastel
// amarillo, más claro en el centro) y la luna en cuarto creciente (sin cara), naranja.
vec3 lucesNoche(vec3 c, vec2 p) {
  float u = uPixelNoche;
  for (int i = 0; i < 9; i++) {
    vec4 h = discoNoche(i);
    vec2 d = p - h.xy;
    float r = length(d);
    if (r > h.z * 1.6) continue;
    float f = r / h.z;
    bool luna = h.w > 0.5;
    vec3 luz = luna ? vec3(0.95, 0.92, 0.55) : vec3(0.85, 0.97, 0.9);
    c += luz * (luna ? 0.1 : 0.08) * exp(-f * f * 2.4);
    // Vetas finas del pastel, en redondo.
    float vetas = ruido3(vec3(f * 26.0, d / h.z * 3.0));
    if (luna) {
      float rm = h.z * 0.47;
      vec2 ql = d / rm;
      float dLuna = max(length(ql) - 1.0, -(length(ql - vec2(0.4, 0.3)) - 0.97)) * rm;
      vec3 creciente = mix(vec3(0.93, 0.6, 0.18), vec3(0.98, 0.74, 0.27), smoothstep(-0.8, 0.6, dot(ql, vec2(-0.6, 0.8))));
      creciente *= 0.9 + 0.16 * vetas;
      c = mix(c, creciente, 1.0 - smoothstep(-u, u, dLuna));
    } else {
      float rn = h.z * 0.2 * (0.9 + 0.2 * ruido3(vec3(d / h.z * 7.0, float(i))));
      vec3 nucleo = mix(vec3(1.0, 0.97, 0.8), vec3(0.97, 0.8, 0.3), smoothstep(0.0, 1.0, r / rn));
      nucleo *= 0.93 + 0.1 * vetas;
      c = mix(c, nucleo, (1.0 - smoothstep(rn * 0.7, rn, r)) * 0.9);
    }
  }
  return c;
}

vec3 cieloNoche(vec2 p, float t) {
  // El disco más cercano (en lo que mide su zona).
  vec4 disco = discoNoche(0);
  float fd = 1e3;
  for (int i = 0; i < 11; i++) {
    vec4 h = discoNoche(i);
    float f = length(p - h.xy) / zonaDisco(h);
    if (f < fd) {
      fd = f;
      disco = h;
    }
  }
  vec2 dh = p - disco.xy;
  float rh = length(dh);
  vec2 q = enroscarNoche(p);
  float psi = corrienteRodeando(p, q);
  // Las derivadas, antes de elegir (fuera de las ramas); el gradiente de la corriente, en el lienzo.
  float dpsi = fwidth(psi);
  float drh = fwidth(rh);
  vec2 px = dFdx(p);
  vec2 py = dFdy(p);
  float det = px.x * py.y - px.y * py.x;
  det = det < 0.0 ? min(det, -1e-12) : max(det, 1e-12);
  vec2 gpsi = vec2(py.y * dFdx(psi) - px.y * dFdy(psi), px.x * dFdy(psi) - py.x * dFdx(psi)) / det;
  // El borde del disco, deshecho; en la orilla, unas pinceladas son del viento y otras del disco.
  bool remolino = disco.w > 1.5;
  float borde = 1.0 + (remolino ? 0.12 : 0.05) * (ruido3(vec3(dh / max(rh, 1e-4) * 2.2, disco.x * 3.0)) - 0.5);
  float zona = zonaDisco(disco);
  float enDisco = presenciaDisco(fd, borde, remolino);
  vec3 fondoD = remolino ? fondoRemolino(disco, rh) : fondoHalo(disco, rh);
  vec3 c = mix(fondoViento(p, psi), fondoD, enDisco);
  // (Con un margen: las pinceladas de la orilla se miran por su eje, que puede caer al otro lado.)
  float margen = 0.06 * zona / max(disco.z, 1e-4);
  if (presenciaDisco(fd + margen, borde, remolino) < 1.0) c = vientoNoche(c, p, psi, dpsi, gpsi, q, disco, zona, borde, t);
  if (presenciaDisco(fd - margen, borde, remolino) > 0.0) {
    if (remolino) c = remolinoPinceladas(c, disco, dh, rh, drh, borde, t);
    else c = anillosNoche(c, disco, rh, drh, atan(dh.y, dh.x), zona, borde, t);
  }
  return lucesNoche(c, p);
}

// El cielo de la noche estrellada en la dirección d (coordenadas del valle).
vec3 nocheEstrellada(vec3 d) {
  float delante;
  vec2 p = lienzoNoche(d, delante);
  vec3 fondo = mix(vec3(0.08, 0.22, 0.62), vec3(0.06, 0.16, 0.5), smoothstep(0.0, 0.9, d.y));
  if (delante < 0.001) return fondo;
  vec3 c = cieloNoche(p, uTiempoNoche);
  // El grano del pastel sobre el papel.
  c *= 0.94 + 0.1 * ruido3(vec3(p * 140.0, 2.0));
  return mix(fondo, c, delante);
}

// Lo que no es cielo, de noche: a la luz de la luna (más oscuro y azulado, con algo de su color).
vec3 gradoNoche(vec3 c) {
  float L = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 gris = mix(vec3(L), c, 0.5);
  return gris * vec3(0.34, 0.42, 0.74) + vec3(0.025, 0.035, 0.09);
}
`

/**
 * La noche que cae (ver NOCHE_ESTRELLADA_GLSL): cuánto ha caído (`uNoche`) y, en cada dirección del
 * valle, si ya la cubre. Necesita RUIDO3_GLSL.
 */
export const CAIDA_NOCHE_GLSL = /* glsl */ `
uniform float uNoche;

// La noche cae como una aguada que baja desde lo alto: x, cuánto la cubre ya; y, su orilla, donde el
// pigmento se acumula al secarse (más oscura).
vec2 caidaNoche(vec3 d) {
  float frente = mix(1.75, -0.35, smoothstep(0.0, 1.0, uNoche * 1.12));
  float e = asin(clamp(d.y, -1.0, 1.0)) + 0.14 * (fbm3(d * 3.0 + vec3(1.0, 4.0, 2.0)) - 0.5) + 0.04 * (ruido3(d * 14.0) - 0.5);
  float w = max(fwidth(e), 1e-4) * 1.5;
  float x = (e - frente) / 0.03;
  return vec2(smoothstep(frente - w, frente + w, e), exp(-x * x) * step(0.0, e - frente));
}
`
