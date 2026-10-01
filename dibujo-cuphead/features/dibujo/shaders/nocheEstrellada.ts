/**
 * La noche estrellada del final (ver `features/cochabamba/store/carta.ts`): al abrir la cajita la
 * cámara mira al cielo y éste se vuelve "La noche estrellada" de Van Gogh dibujada como el resto del
 * dibujo animado, al estilo de Cuphead (lo pidió así el usuario: sólo el cielo, con las montañas de
 * verdad debajo; nada de casas ni de pinceladas de óleo):
 *
 * - Fondo de acuarela azul noche (ultramar arriba, más claro y verde agua junto al horizonte), con
 *   sus manchas, la orilla de la aguada y el grano del pigmento, y vetas claras que siguen el viento.
 * - La ola: el gran remolino doble del centro, una cinta en S (el remolino grande y su compañero, que
 *   se enrosca al revés), con las corrientes que entran y salen de ella; y más corrientes que cruzan
 *   el cielo con las puntas enroscadas (a la manera de los dibujos de los años 30). Cada cinta es de
 *   colores planos con su volumen (sombra abajo, luz arriba), trazos limpios a lo largo que fluyen
 *   despacio y su tinta.
 * - Once estrellas regordetas de cinco puntas, cada una en su halo de aguadas (dorado, amarillo
 *   pálido y verde agua) con el borde ondulado a mano y arcos de tinta que giran; y la luna en cuarto
 *   creciente (sin cara) en su gran halo.
 *
 * Se compone sobre la vista final de la cámara (`uMarcoNoche`: derecha, arriba y adelante en
 * coordenadas del valle; `uTanNoche`: la tangente de medio campo de visión vertical), en un lienzo
 * donde la media altura de la pantalla mide 1 y el ancho llega a ±`uAspectoNoche`: cada elemento se
 * coloca respecto a los bordes y la composición se escala en pantallas estrechas, así que cabe igual
 * en un ordenador y en un móvil en vertical. Todo se mueve despacio, sin latir.
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

const vec3 TINTA_NOCHE = vec3(0.035, 0.045, 0.14);
const float TAU_NOCHE = 6.2831853;
// Medio grosor de la tinta, en unidades del lienzo (unos 2 px de trazo a 720 de alto, y lo mismo
// en proporción a cualquier resolución).
const float TINTA_MEDIA = 0.0031;

// Una cinta (corriente, remolino, rizo): distancia con signo a su borde (negativa dentro), lo que
// lleva recorrido a lo largo (en unidades del lienzo) y la posición a lo ancho (-1..1, + arriba o
// hacia fuera).
struct Cinta {
  float d;
  float s;
  float v;
};

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

vec2 dirNoche(float a) {
  return vec2(cos(a), sin(a));
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

// El salto de dibujo animado al aparecer (0 → 1 con un poco de rebote).
float saltoNoche(float t) {
  t = clamp(t, 0.0, 1.0);
  float u = t - 1.0;
  return 1.0 + 2.70158 * u * u * u + 1.70158 * u * u;
}

// (WebGL no deja usar ?: con estructuras.)
Cinta unirCintas(Cinta a, Cinta b) {
  if (a.d < b.d) return a;
  return b;
}

// Espiral de Arquímedes como cinta, definida desde su punta de fuera: en el ángulo aFin y a radio R
// alrededor de c; al entrar (φ de 0 a phiMax) el radio baja b por radián y el ángulo gira hacia
// -sentido (sentido -1: se enrosca en sentido antihorario). El ancho pasa de wFuera a wDentro.
Cinta espiralNoche(vec2 p, vec2 c, float R, float b, float phiMax, float aFin, float sentido, float wFuera, float wDentro) {
  vec2 q = p - c;
  float r = length(q);
  float psi = mod(sentido * (aFin - atan(q.y, q.x)), TAU_NOCHE);
  Cinta mejor = Cinta(1e9, 0.0, 0.0);
  for (int k = 0; k < 4; k++) {
    float phi = psi + TAU_NOCHE * float(k);
    if (phi > phiMax) break;
    float rs = R - b * phi;
    float w = mix(wFuera, wDentro, phi / phiMax);
    float dr = r - rs;
    float d = abs(dr) * inversesqrt(1.0 + b * b / max(rs * rs, 1e-6)) - w;
    if (d < mejor.d) mejor = Cinta(d, R * phi - 0.5 * b * phi * phi, clamp(dr / w, -1.0, 1.0));
  }
  // Las puntas, redondeadas (con su posición a lo ancho de verdad, y un poco por detrás de la cinta:
  // si no, junto a la punta ganaban ellas y dibujaban una raya).
  vec2 haciaFuera = dirNoche(aFin);
  float dF = length(p - (c + R * haciaFuera)) - wFuera + 1e-4;
  if (dF < mejor.d) mejor = Cinta(dF, 0.0, clamp((dot(q, haciaFuera) - R) / wFuera, -1.0, 1.0));
  float rDentro = R - b * phiMax;
  vec2 haciaDentro = dirNoche(aFin - sentido * phiMax);
  float dD = length(p - (c + rDentro * haciaDentro)) - wDentro + 1e-4;
  if (dD < mejor.d) mejor = Cinta(dD, R * phiMax - 0.5 * b * phiMax * phiMax, clamp((dot(q, haciaDentro) - rDentro) / wDentro, -1.0, 1.0));
  return mejor;
}

// Un rizo en la punta de una corriente: la espiral sigue a la cinta desde su punta (con su
// tangente, hacia fuera) y se enrosca hacia la izquierda (lado 1) o la derecha (lado -1).
Cinta rizoNoche(vec2 p, vec2 punta, vec2 tangente, float R, float vueltas, float lado, float w) {
  vec2 izquierda = vec2(-tangente.y, tangente.x);
  vec2 c = punta + izquierda * R * lado;
  vec2 haciaPunta = punta - c;
  float phiMax = vueltas * TAU_NOCHE;
  return espiralNoche(p, c, R, R * 0.72 / phiMax, phiMax, atan(haciaPunta.y, haciaPunta.x), -lado, w, w * 0.4);
}

// Corriente: una cinta a lo largo de y(x) = yRef + amp·(cos(frec·(x − xRef) + fase) − cos(fase))
// + pend·(x − xRef), de x0 a x1 (con fase 0 y pend 0 pasa por (xRef, yRef) en horizontal: así se
// engancha a un remolino). 'afilar' afila la punta izquierda (x) o la derecha (y).
float yCorriente(float x, float xRef, float yRef, float amp, float frec, float fase, float pend) {
  return yRef + amp * (cos(frec * (x - xRef) + fase) - cos(fase)) + pend * (x - xRef);
}

Cinta corrienteNoche(vec2 p, float x0, float x1, float xRef, float yRef, float amp, float frec, float fase, float pend, float w, vec2 afilar) {
  float xc = clamp(p.x, x0, x1);
  float yc = yCorriente(xc, xRef, yRef, amp, frec, fase, pend);
  float dyc = -amp * frec * sin(frec * (xc - xRef) + fase) + pend;
  float t = (xc - x0) / (x1 - x0);
  float ancho = w;
  ancho *= mix(1.0, sqrt(clamp(t / 0.22, 0.0, 1.0)), afilar.x);
  ancho *= mix(1.0, sqrt(clamp((1.0 - t) / 0.22, 0.0, 1.0)), afilar.y);
  ancho = max(ancho, 0.0012);
  float dy = (p.y - yc) * inversesqrt(1.0 + dyc * dyc);
  return Cinta(length(vec2(p.x - xc, dy)) - ancho, xc - x0, clamp(dy / ancho, -1.0, 1.0));
}

// La punta de una corriente en x: el punto y su tangente (hacia +x).
vec4 puntaCorriente(float x, float xRef, float yRef, float amp, float frec, float fase, float pend) {
  float y = yCorriente(x, xRef, yRef, amp, frec, fase, pend);
  vec2 tg = normalize(vec2(1.0, -amp * frec * sin(frec * (x - xRef) + fase) + pend));
  return vec4(x, y, tg);
}

// Pinta una cinta como un dibujo animado: colores planos (la sombra en un borde, una franja de luz
// en el otro, con sus cortes netos), unos pocos trazos limpios a lo largo, en tres carriles, que
// fluyen despacio, el moteado de la acuarela, la orilla de la aguada algo más oscura y la tinta.
vec3 pintarCinta(vec3 c, Cinta k, vec2 p, float semilla, vec3 claro, vec3 medio, vec3 sombra) {
  float u = uPixelNoche;
  if (k.d > TINTA_MEDIA + 2.0 * u) return c;
  float dentro = 1.0 - smoothstep(-u, u, k.d);
  float v = k.v;
  float wv = max(fwidth(v), 1e-3);
  vec3 col = mix(sombra, medio, smoothstep(-0.42 - wv, -0.42 + wv, v));
  col = mix(col, claro, smoothstep(0.22 - wv, 0.22 + wv, v) * (1.0 - smoothstep(0.7 - wv, 0.7 + wv, v)));
  // Trazos a lo largo, en tres carriles (en la sombra, en medio y en la luz).
  float carril = floor((v + 1.0) * 1.5);
  float enCarril = fract((v + 1.0) * 1.5) - 0.5;
  float azar = hashNoche(vec2(carril, semilla));
  float x = k.s / (0.075 + 0.05 * azar) - uTiempoNoche * (0.25 + 0.2 * azar) + azar * 7.0;
  float celda = floor(x);
  float azarTrazo = hashNoche(vec2(celda, carril + semilla * 7.0));
  float trazo = step(fract(x), 0.55 + 0.35 * azarTrazo) * (1.0 - smoothstep(0.1, 0.17, abs(enCarril))) * step(0.35, azarTrazo);
  vec3 tono = carril > 1.5 ? mix(claro, vec3(1.0), 0.6) : carril > 0.5 ? mix(medio, claro, 0.55) : mix(sombra, medio, 0.55);
  col = mix(col, tono, trazo * 0.8);
  col *= 0.95 + 0.09 * ruido3(vec3(p * 9.0, semilla));
  col *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 4.0 * u, -k.d));
  c = mix(c, col, dentro);
  return mix(c, TINTA_NOCHE, 1.0 - smoothstep(TINTA_MEDIA - u, TINTA_MEDIA + u, abs(k.d)));
}

// La misma cinta con la luz del otro lado (para que la luz siga igual al pasar de una pieza a otra).
Cinta volteada(Cinta k) {
  k.v = -k.v;
  return k;
}

// Estrella de cinco puntas regordeta (Íñigo Quílez), como las de todo el dibujo animado.
float estrella5Noche(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Una aguada redonda de halo: la pinta encima (radio rr, mezcla m) con la orilla algo más oscura.
vec3 aguadaHalo(vec3 c, float r, float rr, vec3 color, float m) {
  float u = uPixelNoche;
  float h = 1.0 - smoothstep(rr - u, rr + u, r);
  c = mix(c, color, h * m);
  return c * (1.0 - 0.07 * h * (1.0 - smoothstep(0.0, 4.0 * u, rr - r)));
}

// Dos arcos de tinta opuestos, finos en las puntas, en el radio ra, que giran (las pinceladas en
// remolino de los halos del cuadro, a la manera del dibujo animado).
vec3 arcosHalo(vec3 c, float r, float a, float ra, float giro, float semilla) {
  float u = uPixelNoche;
  for (int j = 0; j < 2; j++) {
    float ang = mod(a - giro - float(j) * 3.14159, TAU_NOCHE);
    float largo = 1.0 + 0.5 * hashNoche(vec2(semilla, float(j) + ra * 50.0));
    float enArco = ang / largo;
    if (enArco > 1.0) continue;
    float grosor = TINTA_MEDIA * 0.8 * sin(3.14159 * enArco);
    c = mix(c, TINTA_NOCHE, (1.0 - smoothstep(grosor - u, grosor + u, abs(r - ra))) * 0.85);
  }
  return c;
}

vec3 estrellaNoche(vec3 c, vec2 p, vec2 centro, float R, float semilla, float aparece) {
  float esc = R * saltoNoche(aparece);
  vec2 q = p - centro;
  float r = length(q);
  if (esc < 1e-4 || r > esc * 1.12) return c;
  float u = uPixelNoche;
  float t = uTiempoNoche;
  float a = atan(q.y, q.x);
  float sentido = fract(semilla * 7.3) < 0.5 ? 1.0 : -1.0;
  // El borde de las aguadas, ondulado a mano (y moviéndose despacio).
  float onda = 0.028 * sin(a * 5.0 + semilla * 3.0 + sentido * t * 0.25) + 0.012 * sin(a * 9.0 - sentido * t * 0.18 + semilla);
  c = aguadaHalo(c, r, esc * (1.0 + onda), mix(c, vec3(0.5, 0.78, 0.76), 0.6), 1.0);
  c = aguadaHalo(c, r, esc * (0.72 + 0.8 * onda), vec3(0.97, 0.95, 0.74), 0.9);
  c = aguadaHalo(c, r, esc * (0.5 + 0.6 * onda), vec3(1.0, 0.86, 0.4), 1.0);
  c = arcosHalo(c, r, a, esc * 0.61, sentido * t * 0.3 + semilla * 4.0, semilla);
  c = arcosHalo(c, r, a, esc * 0.87, -sentido * t * 0.22 + semilla * 2.0 + 1.3, semilla + 1.0);
  // La estrella regordeta, crema, con su tinta y su brillo, que se mece.
  float rs = esc * 0.45;
  vec2 e = giroNoche(q, 0.16 * sin(t * 0.8 + semilla * 5.0) + 0.5 * (fract(semilla * 3.1) - 0.5)) / rs;
  float dE = (estrella5Noche(e, 0.62, 0.62) - 0.06) * rs;
  vec3 crema = mix(vec3(1.0, 0.97, 0.84), vec3(1.0, 0.82, 0.5), smoothstep(-0.2, 0.5, dot(e, vec2(0.55, -0.83))));
  crema = mix(crema, vec3(1.0), 1.0 - smoothstep(0.05, 0.11, length((e - vec2(-0.14, 0.17)) * vec2(1.0, 1.5))));
  c = mix(c, crema, 1.0 - smoothstep(-u, u, dE));
  return mix(c, TINTA_NOCHE, 1.0 - smoothstep(TINTA_MEDIA - u, TINTA_MEDIA + u, abs(dE)));
}

// La luna en cuarto creciente (sin cara) en su gran halo: verde agua, amarillo pálido y el naranja
// dorado de dentro, con sus arcos; el creciente naranja con su brillo y su tinta.
vec3 lunaNoche(vec3 c, vec2 p, vec2 centro, float rm, float aparece) {
  float esc = rm * saltoNoche(aparece);
  vec2 q = p - centro;
  float r = length(q);
  if (esc < 1e-4 || r > esc * 2.8) return c;
  float u = uPixelNoche;
  float t = uTiempoNoche;
  float a = atan(q.y, q.x);
  float onda = 0.022 * sin(a * 6.0 + t * 0.2) + 0.01 * sin(a * 11.0 - t * 0.15);
  c = aguadaHalo(c, r, esc * 2.65 * (1.0 + onda), mix(c, vec3(0.56, 0.8, 0.74), 0.55), 1.0);
  c = aguadaHalo(c, r, esc * 1.95 * (1.0 + 0.8 * onda), vec3(0.98, 0.93, 0.66), 0.9);
  c = aguadaHalo(c, r, esc * 1.38 * (1.0 + 0.6 * onda), vec3(1.0, 0.76, 0.3), 1.0);
  c = arcosHalo(c, r, a, esc * 1.66, t * 0.2, 3.0);
  c = arcosHalo(c, r, a, esc * 2.32, -t * 0.15 + 1.0, 4.0);
  vec2 ql = q / esc;
  float dLuna = max(length(ql) - 1.0, -(length(ql - vec2(0.42, 0.3)) - 0.92)) * esc;
  vec3 luna = mix(vec3(0.97, 0.58, 0.14), vec3(1.0, 0.86, 0.38), smoothstep(-0.8, 0.4, dot(ql, vec2(-0.6, 0.8))));
  luna = mix(luna, vec3(1.0, 0.96, 0.74), (1.0 - smoothstep(0.06, 0.2, length(ql - vec2(-0.62, 0.22)))) * 0.7);
  c = mix(c, luna, 1.0 - smoothstep(-u, u, dLuna));
  return mix(c, TINTA_NOCHE, 1.0 - smoothstep(TINTA_MEDIA - u, TINTA_MEDIA + u, abs(dLuna)));
}

// Fondo de acuarela azul noche: ultramar arriba, cobalto en medio y más claro y verde agua junto al
// horizonte, con sus manchas, la orilla de la aguada y el grano del pigmento.
vec3 fondoNoche(vec3 d) {
  float y = d.y;
  vec3 c = mix(vec3(0.27, 0.46, 0.62), vec3(0.14, 0.29, 0.58), smoothstep(0.0, 0.2, y));
  c = mix(c, vec3(0.08, 0.17, 0.44), smoothstep(0.2, 0.55, y));
  c = mix(c, vec3(0.045, 0.09, 0.28), smoothstep(0.55, 0.95, y));
  float campo = fbm3(d * 2.3 + vec3(3.0, 1.0, 7.0)) + 0.3 * (fbm3(d * 5.2 + vec3(1.0, 9.0, 2.0)) - 0.5);
  float mancha = smoothstep(0.575, 0.6, campo);
  c = mix(c, c * 1.15 + vec3(0.0, 0.02, 0.035), 0.5 * mancha);
  float x = (campo - 0.59) / 0.012;
  c *= 1.0 - 0.08 * exp(-x * x);
  return c * (0.95 + 0.07 * ruido3(d * 31.0));
}

// Vetas claras en el fondo que siguen el viento (y rodean la ola), rotas a trozos, como pinceladas
// de acuarela.
vec3 vetasNoche(vec3 c, vec2 p, vec2 c1, vec2 c2, float s) {
  float t = uTiempoNoche;
  float psi = p.y + 0.035 * sin(p.x * 1.7 + 0.5 + t * 0.03) + 0.015 * sin(p.x * 4.3 - t * 0.02);
  psi += 0.16 * s * exp(-dot(p - c1, p - c1) / (0.09 * s * s)) + 0.09 * s * exp(-dot(p - c2, p - c2) / (0.04 * s * s));
  float banda = 0.5 + 0.5 * sin(psi * TAU_NOCHE / 0.045);
  float rota = ruido3(vec3(psi * 22.0, p.x * 3.5 + p.y, 3.0));
  float veta = smoothstep(0.72, 0.95, banda) * smoothstep(0.45, 0.7, rota);
  return mix(c, c * 1.18 + vec3(0.01, 0.03, 0.04), veta * 0.55);
}

// El cielo de la noche estrellada en la dirección d (coordenadas del valle).
vec3 nocheEstrellada(vec3 d) {
  float t = uTiempoNoche;
  vec3 fondo = fondoNoche(d);
  float delante;
  vec2 p = lienzoNoche(d, delante);
  if (delante < 0.001) return fondo;
  float A = uAspectoNoche;
  float W = anchoNoche();
  float s = escalaNoche();

  // La ola: el remolino grande y su compañero, en S (el compañero es el grande girado media vuelta
  // y más pequeño alrededor de su punto de encuentro M: se unen sin costura). Se mece despacio.
  vec2 c1 = vec2(-0.3 * W, 0.37);
  float R1 = 0.33 * s;
  float vueltas = 1.4 * TAU_NOCHE;
  float b1 = (R1 - 0.045 * s) / vueltas;
  float aM = -0.3 + 0.05 * sin(t * 0.21);
  vec2 M = c1 + R1 * dirNoche(aM);
  float k2 = 0.6;
  vec2 c2 = M + k2 * R1 * dirNoche(aM);
  float wOla = 0.066 * s;

  vec3 c = vetasNoche(fondo, p, c1, c2, s);

  // La franja clara sobre las montañas (cruza todo el cielo, detrás de ellas).
  Cinta baja = corrienteNoche(p, -A - 0.3, A + 0.3, 0.0, -0.3, 0.045 * s, 1.7 / s, 0.8 + 0.05 * sin(t * 0.13), 0.03, 0.05 * s, vec2(0.0));
  c = pintarCinta(c, baja, p, 3.0, vec3(0.92, 0.96, 0.9), vec3(0.56, 0.78, 0.87), vec3(0.3, 0.5, 0.73));

  // Una corriente pequeña a la izquierda, enroscada en las dos puntas.
  float xi0 = -0.95 * W;
  float xi1 = -0.42 * W;
  float yi = -0.08;
  Cinta izq = corrienteNoche(p, xi0, xi1, xi0, yi, -0.035 * s, 3.4 / s, 0.0, 0.0, 0.03 * s, vec2(0.0));
  vec4 pi0 = puntaCorriente(xi0, xi0, yi, -0.035 * s, 3.4 / s, 0.0, 0.0);
  vec4 pi1 = puntaCorriente(xi1, xi0, yi, -0.035 * s, 3.4 / s, 0.0, 0.0);
  izq = unirCintas(izq, rizoNoche(p, pi0.xy, -pi0.zw, 0.065 * s, 1.15, -1.0, 0.03 * s));
  izq = unirCintas(izq, rizoNoche(p, pi1.xy, pi1.zw, 0.06 * s, 1.15, -1.0, 0.03 * s));
  c = pintarCinta(c, izq, p, 4.0, vec3(0.96, 0.95, 0.72), vec3(0.58, 0.77, 0.64), vec3(0.3, 0.48, 0.58));

  // Otra pequeña a la derecha, enroscada por la izquierda.
  float xd0 = 0.36 * W;
  float yd = -0.04;
  Cinta der = corrienteNoche(p, xd0, A + 0.3, xd0, yd, 0.03 * s, 2.6 / s, 0.0, 0.03, 0.03 * s, vec2(0.0));
  vec4 pd0 = puntaCorriente(xd0, xd0, yd, 0.03 * s, 2.6 / s, 0.0, 0.03);
  der = unirCintas(der, rizoNoche(p, pd0.xy, -pd0.zw, 0.065 * s, 1.15, 1.0, 0.03 * s));
  c = pintarCinta(c, der, p, 5.0, vec3(0.94, 0.97, 0.88), vec3(0.54, 0.76, 0.85), vec3(0.28, 0.48, 0.7));

  // La corriente de arriba, que acaba enroscándose hacia abajo.
  float xt1 = 0.42 * W;
  float yt = 0.8;
  Cinta tope = corrienteNoche(p, -A - 0.3, xt1, xt1, yt, 0.045 * s, 2.2 / s, 0.0, 0.0, 0.034 * s, vec2(0.0));
  vec4 pt1 = puntaCorriente(xt1, xt1, yt, 0.045 * s, 2.2 / s, 0.0, 0.0);
  tope = unirCintas(tope, rizoNoche(p, pt1.xy, pt1.zw, 0.085 * s, 1.2, -1.0, 0.034 * s));
  c = pintarCinta(c, tope, p, 2.0, vec3(0.95, 0.96, 0.74), vec3(0.54, 0.78, 0.74), vec3(0.3, 0.5, 0.66));

  // La ola, con la corriente que entra por debajo del remolino grande (desde la izquierda) y la que
  // sale por encima del compañero (hacia la luna), las dos tangentes a sus vueltas. La luz va siempre
  // del mismo lado de la cinta (en el compañero y en las corrientes, el lado contrario de su v).
  Cinta ola = espiralNoche(p, c1, R1, b1, vueltas, aM, -1.0, wOla, 0.02 * s);
  ola = unirCintas(ola, volteada(espiralNoche(p, c2, k2 * R1, k2 * b1, vueltas, aM + 3.14159265, -1.0, wOla, 0.014 * s)));
  float phiJ = mod(-1.5707963 - aM, TAU_NOCHE);
  float rJ = R1 - b1 * phiJ;
  float wJ = mix(wOla, 0.02 * s, phiJ / vueltas);
  vec2 jIzq = c1 + vec2(0.0, -rJ);
  ola = unirCintas(ola, volteada(corrienteNoche(p, -A - 0.3, jIzq.x + 0.005, jIzq.x, jIzq.y, 0.06 * s, 2.0 / s, 0.0, 0.0, wJ, vec2(0.0))));
  float wJ2 = mix(wOla, 0.014 * s, phiJ / vueltas);
  vec2 jDer = c2 + vec2(0.0, k2 * rJ);
  ola = unirCintas(ola, volteada(corrienteNoche(p, jDer.x - 0.005, A + 0.3, jDer.x, jDer.y, 0.06 * s, 1.8 / s, 0.0, 0.0, wJ2, vec2(0.0))));
  c = pintarCinta(c, ola, p, 1.0, vec3(0.96, 0.97, 0.9), vec3(0.6, 0.81, 0.89), vec3(0.32, 0.53, 0.76));

  // La luna, arriba a la derecha, y las once estrellas, que aparecen de una en una al caer la noche.
  c = lunaNoche(c, p, vec2(0.8 * W, 0.66), 0.09 * s, smoothstep(0.0, 1.0, (uNoche - 0.42) / 0.2));
  for (int i = 0; i < 11; i++) {
    vec3 e = i == 0 ? vec3(-0.86, 0.92, 0.075)
      : i == 1 ? vec3(-0.55, 0.96, 0.06)
      : i == 2 ? vec3(-0.08, 0.93, 0.08)
      : i == 3 ? vec3(0.2, 0.84, 0.065)
      : i == 4 ? vec3(0.5, 0.95, 0.07)
      : i == 5 ? vec3(-0.94, 0.45, 0.08)
      : i == 6 ? vec3(-0.66, 0.12, 0.1)
      : i == 7 ? vec3(0.3, 0.5, 0.065)
      : i == 8 ? vec3(0.08, -0.12, 0.075)
      : i == 9 ? vec3(0.62, 0.26, 0.085)
      : vec3(-0.3, -0.2, 0.065);
    float aparece = smoothstep(0.0, 1.0, (uNoche - 0.4 - 0.03 * float(i)) / 0.16);
    c = estrellaNoche(c, p, vec2(e.x * W, e.y), e.z * s * 1.3, float(i) * 1.37 + 0.5, aparece);
  }
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
 * La noche que cae (ver NOCHE_ESTRELLADA_GLSL), también para el pase de contornos: cuánto ha caído
 * (`uNoche`) y, en cada dirección del valle, si ya la cubre. Necesita RUIDO3_GLSL.
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
