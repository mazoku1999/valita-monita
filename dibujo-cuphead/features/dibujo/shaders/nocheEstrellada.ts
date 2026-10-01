/**
 * La noche estrellada del final (ver `features/cochabamba/store/carta.ts`): al abrir la cajita del
 * corazón de flores la cámara mira al cielo y éste se vuelve una "noche estrellada" como la de Van
 * Gogh pero dibujada como el resto del dibujo animado (no pintada al óleo): un fondo de acuarela
 * azul noche, cintas de viento claras con su tinta que cruzan el cielo y se enroscan en remolinos,
 * las once estrellas grandes con sus halos de anillos planos, una luna en cuarto creciente (sin cara)
 * con su gran halo, y trazos cortos que siguen el viento. Todo gira y fluye despacio, sin latir.
 *
 * El dibujo se compone sobre la vista final de la cámara (`uMarcoNoche`: derecha, arriba y adelante
 * en coordenadas del valle; `uTanNoche`: la tangente de medio campo de visión vertical), en un lienzo
 * donde la media altura de la pantalla mide 1 y el ancho llega a ±`uAspectoNoche`: así cabe igual en
 * un ordenador y en un móvil en vertical. El fondo y la noche que baja van sobre la esfera celeste.
 *
 * Necesita RUIDO3_GLSL. La noche cae como una aguada que baja desde lo alto (`uNoche` 0 → 1) y lo
 * dibujado aparece de uno en uno, con un pequeño salto de dibujo animado. En el centro de la vista
 * (donde se escribe la carta) el cielo está más tranquilo.
 */
export const NOCHE_ESTRELLADA_GLSL = /* glsl */ `
uniform float uNoche;
uniform mat3 uMarcoNoche;
uniform float uTanNoche;
uniform float uAspectoNoche;
uniform float uTiempoNoche;
uniform float uPixelNoche;

const vec3 TINTA_NOCHE = vec3(0.03, 0.045, 0.12);
const float PI_NOCHE = 3.14159265;

vec2 rotarNoche(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Remolino: el plano gira alrededor de c, más cuanto más cerca (como el agua que se arremolina).
vec2 remolino(vec2 p, vec2 c, float fuerza, float radio) {
  vec2 q = p - c;
  float r2 = dot(q, q) / (radio * radio);
  return c + rotarNoche(q, fuerza * exp(-r2));
}

// Una capa plana con su borde a un píxel: d < 0 dentro (en unidades del lienzo).
float capaNoche(float d) {
  return 1.0 - smoothstep(-uPixelNoche, uPixelNoche, d);
}

// Trazo de tinta a lo largo de d = 0, de ancho en píxeles.
float tintaNoche(float d, float anchoPx) {
  return 1.0 - smoothstep(anchoPx * 0.5 * uPixelNoche, (anchoPx * 0.5 + 1.0) * uPixelNoche, abs(d));
}

// El salto de dibujo animado al aparecer (0 → 1 con un poco de rebote).
float saltoNoche(float t) {
  t = clamp(t, 0.0, 1.0);
  float u = t - 1.0;
  return 1.0 + 2.70158 * u * u * u + 1.70158 * u * u;
}

// Lienzo de la vista final y cuánto mira hacia delante (lejos de la vista final, nada dibujado).
vec2 lienzoNoche(vec3 d, out float delante) {
  vec3 q = transpose(uMarcoNoche) * d;
  delante = smoothstep(0.12, 0.32, q.z);
  return q.xy / max(q.z, 0.12) / uTanNoche;
}

// Del lienzo en fracciones de pantalla (x de −1 a 1 de lado a lado) a sus unidades.
vec2 enPantalla(float fx, float fy) {
  return vec2(fx * uAspectoNoche, fy);
}

// Fondo de acuarela azul noche: más claro y verdoso junto al horizonte (como el resplandor sobre
// las colinas del cuadro), cobalto en medio y ultramar arriba, con aguadas y su orilla.
vec3 fondoNoche(vec3 d) {
  float y = d.y;
  vec3 c = mix(vec3(0.33, 0.5, 0.66), vec3(0.17, 0.33, 0.62), smoothstep(-0.02, 0.14, y));
  c = mix(c, vec3(0.1, 0.21, 0.52), smoothstep(0.16, 0.5, y));
  c = mix(c, vec3(0.055, 0.11, 0.32), smoothstep(0.5, 0.95, y));
  float grande = fbm3(d * 2.1 + vec3(5.0, 1.0, 3.0));
  float medio = fbm3(d * 4.3 + vec3(-2.0, 7.0, 1.0));
  float campo = grande + 0.35 * (medio - 0.5);
  float mancha = smoothstep(0.585, 0.6, campo);
  c = mix(c, c * 1.16 + vec3(0.0, 0.025, 0.04), 0.55 * mancha);
  float x = (campo - 0.6) / 0.018;
  c *= 1.0 - 0.1 * exp(-x * x);
  c *= 0.94 + 0.08 * ruido3(d * 23.0);
  return c;
}

// Estrella de cinco puntas regordeta (Íñigo Quílez), la de las estrellas de todo el dibujo animado:
// r radio de las puntas, rf cuánto se hinchan los lados.
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

// Estrella con halo (las once grandes del cuadro, a la manera del dibujo animado): en el centro una
// estrella regordeta de cinco puntas, crema con su tinta (la de las estrellas de todo el viaje), que
// se mece despacio; alrededor un halo amarillo, otro más pálido con dos brazos claros en espiral que
// giran, y un resplandor verde agua. Sólo la estrella lleva tinta (con tinta en cada anillo parecían
// dianas).
vec3 estrellaConHalo(vec3 c, vec2 p, vec2 centro, float radio, float semilla, float aparece, float calma) {
  float escala = radio * saltoNoche(aparece);
  if (escala < 1e-4) return c;
  vec2 q = (p - centro) / escala;
  float r = length(q);
  if (r > 1.25) return c;
  float a = atan(q.y, q.x);
  float u = uPixelNoche / escala;
  float apaga = 1.0 - 0.5 * calma;
  // Resplandor y halos, de fuera adentro.
  c = mix(c, mix(c, vec3(0.5, 0.74, 0.8), 0.45), (1.0 - smoothstep(0.75, 1.2, r)) * apaga);
  float halo2 = 1.0 - smoothstep(0.8 - u, 0.8 + u, r);
  c = mix(c, vec3(0.8, 0.9, 0.66), halo2 * 0.7 * apaga);
  float giro = uTiempoNoche * 0.05 * (fract(semilla * 7.3) < 0.5 ? 1.0 : -1.0);
  float espiral = fract((a / (2.0 * PI_NOCHE)) * 2.0 + log(max(r, 1e-3)) * 1.4 - giro);
  float brazo = (1.0 - smoothstep(0.07, 0.13, abs(espiral - 0.5))) * smoothstep(0.42, 0.5, r) * (1.0 - smoothstep(0.72, 0.8, r));
  c = mix(c, vec3(0.98, 0.97, 0.8), brazo * 0.75 * apaga);
  float halo1 = 1.0 - smoothstep(0.5 - u, 0.5 + u, r);
  c = mix(c, vec3(1.0, 0.89, 0.48), halo1);
  // La estrella regordeta, que se mece (cada una con su inclinación).
  float vaiven = 0.16 * sin(uTiempoNoche * 0.9 + semilla * 4.0) + 0.6 * (fract(semilla * 3.1) - 0.5);
  vec2 e = rotarNoche(q, vaiven);
  float dE = estrella5Noche(e, 0.36, 0.62) - 0.05;
  float lleno = 1.0 - smoothstep(-u, u, dE);
  vec3 crema = mix(vec3(1.0, 0.97, 0.82), vec3(1.0, 0.86, 0.6), smoothstep(-0.15, 0.3, dot(e, vec2(0.6, -0.8))));
  crema = mix(crema, vec3(1.0, 1.0, 0.97), 1.0 - smoothstep(0.03, 0.08, length((e - vec2(-0.09, 0.11)) * vec2(1.0, 1.5))));
  c = mix(c, crema, lleno);
  c = mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.8 * u, 2.0 * u, abs(dE))) * 0.95);
  return c;
}

// La luna en cuarto creciente (sin cara) con su gran halo, como en el cuadro: un disco amarillo
// encendido alrededor, otro más pálido y un resplandor verde agua; el creciente naranja dorado con
// un brillo de aerógrafo y su tinta.
vec3 lunaConHalo(vec3 c, vec2 p, vec2 centro, float radio, float aparece) {
  float escala = radio * saltoNoche(aparece);
  if (escala < 1e-4) return c;
  vec2 q = (p - centro) / escala;
  float r = length(q);
  if (r > 3.3) return c;
  float u = uPixelNoche / escala;
  c = mix(c, mix(c, vec3(0.52, 0.74, 0.76), 0.5), 1.0 - smoothstep(2.4, 3.2, r));
  c = mix(c, vec3(0.93, 0.93, 0.68), (1.0 - smoothstep(2.2 - u, 2.2 + u, r)) * 0.75);
  c = mix(c, vec3(1.0, 0.88, 0.47), 1.0 - smoothstep(1.55 - u, 1.55 + u, r));
  c = mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.6 * u, 1.6 * u, abs(r - 1.55))) * 0.3);
  // El creciente: el disco menos otro corrido hacia arriba a la derecha.
  float dDisco = r - 1.0;
  float dCorte = length(q - vec2(0.42, 0.3)) - 0.92;
  float d = max(dDisco, -dCorte);
  vec3 luna = mix(vec3(0.97, 0.62, 0.2), vec3(1.0, 0.84, 0.4), smoothstep(-0.8, 0.4, dot(q, vec2(-0.6, 0.8))));
  luna = mix(luna, vec3(1.0, 0.95, 0.7), (1.0 - smoothstep(0.05, 0.22, length(q - vec2(-0.6, 0.2)))) * 0.6);
  c = mix(c, luna, 1.0 - smoothstep(-u, u, d));
  c = mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.8 * u, 2.0 * u, abs(d))) * 0.95);
  return c;
}

// La noche estrellada en la dirección d (coordenadas del valle).
vec3 nocheEstrellada(vec3 d) {
  float t = uTiempoNoche;
  vec3 c = fondoNoche(d);
  float delante;
  vec2 p = lienzoNoche(d, delante);
  if (delante < 0.001) return c;
  // La zona tranquila del centro, donde se escribe la carta.
  vec2 enCalma = (p - vec2(0.0, 0.04)) / vec2(0.8 * uAspectoNoche + 0.05, 0.46);
  float calma = 1.0 - smoothstep(0.75, 1.15, length(enCalma));

  // Las cintas de viento: el plano retorcido por tres remolinos (el grande y su compañero, que gira
  // al revés, como la ola del cuadro, y uno pequeño a un lado); las cintas son franjas de ese plano.
  vec2 c1 = enPantalla(-0.34, 0.6);
  vec2 c2 = c1 + vec2(0.36, -0.05);
  vec2 c3 = enPantalla(0.62, 0.18);
  vec2 q = remolino(p, c1, 5.2 + 0.25 * sin(t * 0.11), 0.36);
  q = remolino(q, c2, -3.6 + 0.2 * sin(t * 0.09 + 1.3), 0.24);
  q = remolino(q, c3, 2.6, 0.2);
  float onda = q.y + 0.06 * sin(q.x * 2.4 + t * 0.06) + 0.025 * sin(q.x * 6.1 - t * 0.05);
  float wOnda = max(fwidth(onda), 1e-5);
  // Aparecen de izquierda a derecha, como pintadas de un trazo.
  float pinta = smoothstep(0.0, 1.0, (uNoche - 0.4) / 0.45);
  float revela = 1.0 - smoothstep(-0.05, 0.05, p.x - mix(-uAspectoNoche - 1.0, uAspectoNoche + 1.0, pinta));
  float fuerzaCinta = revela * delante * (1.0 - 0.7 * calma);
  // Trazos cortos que siguen el viento por todo el cielo (como las pinceladas del cuadro, en limpio):
  // cápsulas de largo variado en filas a lo largo del viento; junto al ojo de los remolinos, ninguno
  // (allí el plano se retuerce demasiado).
  float filas = onda * 15.0;
  float fila = floor(filas);
  float azarFila = fract(sin(fila * 12.9898) * 43758.5453);
  float x = q.x * (2.0 + azarFila) + azarFila * 7.0 + t * 0.012;
  float celda = floor(x);
  float azarTrazo = fract(sin((celda + fila * 31.7) * 78.233) * 43758.5453);
  float largo = mix(0.25, 0.42, azarTrazo);
  vec2 enTrazo = vec2((fract(x) - 0.5) / largo, (fract(filas) - 0.5) / 0.16);
  float dTrazo = length(vec2(max(abs(enTrazo.x) - 1.0, 0.0) * largo / 0.16, enTrazo.y)) - 1.0;
  float hayTrazo = step(0.35, azarTrazo) * smoothstep(0.07, 0.16, length(p - c1)) * smoothstep(0.05, 0.12, length(p - c2));
  float wTrazo = max(fwidth(dTrazo), 1e-4);
  float trazoViento = (1.0 - smoothstep(-wTrazo, wTrazo, dTrazo)) * hayTrazo;
  c = mix(c, c * 1.2 + vec3(0.02, 0.05, 0.07), trazoViento * 0.4 * fuerzaCinta);
  // Dos cintas: la de los remolinos, arriba, y otra más baja, sobre las colinas.
  for (int k = 0; k < 2; k++) {
    float centroC = k == 0 ? 0.59 : -0.6;
    float dC = abs(onda - centroC) - (k == 0 ? 0.075 : 0.05);
    float dentro = 1.0 - smoothstep(-wOnda, wOnda, dC);
    vec3 claro = k == 0 ? vec3(0.47, 0.7, 0.8) : vec3(0.4, 0.6, 0.76);
    // Dentro, rayas finas a lo largo, más claras (se apagan donde se aprietan más que un píxel).
    float frecuencia = 34.0;
    float raya = 1.0 - smoothstep(0.1, 0.25, abs(fract((onda - centroC) * frecuencia) - 0.5) * 2.0 - 0.55);
    raya *= 1.0 - smoothstep(0.25, 0.5, wOnda * frecuencia);
    vec3 cinta = mix(claro, vec3(0.8, 0.92, 0.92), raya * 0.45);
    c = mix(c, cinta, dentro * fuerzaCinta);
    c = mix(c, TINTA_NOCHE, (1.0 - smoothstep(0.9 * wOnda, 1.9 * wOnda, abs(dC))) * fuerzaCinta);
  }

  // La luna, arriba a la derecha, y las once estrellas, que aparecen de una en una.
  float anchoMovil = mix(0.78, 1.0, smoothstep(0.55, 1.2, uAspectoNoche));
  c = lunaConHalo(c, p, enPantalla(0.7, 0.62), 0.1 * anchoMovil, smoothstep(0.0, 1.0, (uNoche - 0.5) / 0.22) * delante);
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    vec3 e = i == 0 ? vec3(-0.86, 0.82, 0.12)
      : i == 1 ? vec3(-0.6, 0.93, 0.08)
      : i == 2 ? vec3(-0.04, 0.86, 0.13)
      : i == 3 ? vec3(0.3, 0.86, 0.1)
      : i == 4 ? vec3(0.93, 0.9, 0.09)
      : i == 5 ? vec3(-0.93, 0.2, 0.1)
      : i == 6 ? vec3(0.92, 0.26, 0.11)
      : i == 7 ? vec3(-0.68, -0.42, 0.075)
      : i == 8 ? vec3(0.68, -0.46, 0.085)
      : i == 9 ? vec3(0.42, 0.56, 0.07)
      : vec3(-0.38, 1.02, 0.08);
    float aparece = smoothstep(0.0, 1.0, (uNoche - 0.42 - 0.035 * fi) / 0.16) * delante;
    c = estrellaConHalo(c, p, enPantalla(e.x, e.y), e.z * anchoMovil, fi * 1.37 + 0.5, aparece, calma);
  }
  return c;
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

// Lo que no es cielo, de noche: a la luz de la luna (más oscuro, desaturado y azulado).
vec3 gradoNoche(vec3 c) {
  float L = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 gris = mix(vec3(L), c, 0.4);
  return gris * vec3(0.34, 0.42, 0.7) + vec3(0.02, 0.03, 0.08);
}
`
