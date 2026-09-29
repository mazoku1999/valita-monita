/**
 * Shaders del sistema solar dibujado como un dibujo animado de los años 30. Nada es una imagen: el
 * aspecto de cada cuerpo sale de ruido 3D sobre su esfera, pero recortado en zonas de color plano
 * con el borde nítido (a un píxel), y la luz es de caricatura: tono iluminado con un poco de
 * aerógrafo, sombra de un tono propio (morado azulado, no negro), un brillo blanco de barniz y una
 * línea de tinta fina en el borde de la esfera. El contorno grueso contra el cielo lo pone el pase
 * de dibujo (saltos de profundidad).
 *
 * Todos los colores se escriben en sRGB y salen en lineal con alfa 0.5: esa marca le dice al pase
 * de dibujo (`features/dibujo`) que el píxel ya está dibujado y no hay que tonearlo ni aplanarlo.
 */

/** Alfa con el que sale todo lo que ya está dibujado en caricatura (ver COMPONER_FRAG). */
const SALIDA_CARICATURA = /* glsl */ `
const vec3 TINTA = vec3(0.075, 0.058, 0.047);

vec4 salidaCaricatura(vec3 srgb) {
  return vec4(pow(clamp(srgb, 0.0, 1.0), vec3(2.2)), 0.5);
}

// Zona de color plano: 0 → 1 al cruzar el umbral, con el borde a un píxel.
float zona(float x, float umbral) {
  float w = max(fwidth(x), 1e-5);
  return smoothstep(umbral - w, umbral + w, x);
}

// Trazo de tinta a lo largo de la línea x = 0, de ancho (en píxeles) dado; w es lo que cambia x en
// un píxel (si x salta en algún sitio, fwidth(x) se dispara allí y pintaría una raya falsa: se da w
// de una magnitud continua).
float trazoConPaso(float x, float anchoPx, float w) {
  w = max(w, 1e-5);
  return 1.0 - smoothstep(anchoPx * 0.5 * w, (anchoPx * 0.5 + 1.0) * w, abs(x));
}

float trazo(float x, float anchoPx) {
  return trazoConPaso(x, anchoPx, fwidth(x));
}
`

const RUIDO_3D = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float suma = 0.0;
  float amplitud = 0.5;
  for (int k = 0; k < 4; k++) {
    suma += amplitud * ruido3(p);
    p = p * 2.02 + vec3(11.3, 7.1, 3.7);
    amplitud *= 0.5;
  }
  return suma / 0.9375;
}

// Celdas de Worley: distancia al punto más cercano (x) y un azar propio de ese punto (y).
vec2 celdas(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float mejor = 8.0;
  float azar = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 c = i + o;
        vec3 punto = o + vec3(hash13(c), hash13(c + 17.1), hash13(c + 31.7));
        float d = length(punto - f);
        if (d < mejor) {
          mejor = d;
          azar = hash13(c + 5.3);
        }
      }
    }
  }
  return vec2(mejor, azar);
}
`

/**
 * Luz de caricatura de una esfera: tono iluminado (con aerógrafo hacia el terminador), sombra de
 * color, terminador nítido, brillo de barniz y tinta fina en el borde.
 */
const LUZ_CARICATURA = /* glsl */ `
vec3 luzCaricatura(vec3 albedo, vec3 n, vec3 l, vec3 v, float brillo, out float lado) {
  float ndl = dot(n, l);
  lado = zona(ndl, 0.02);
  vec3 iluminado = albedo * mix(0.84, 1.06, smoothstep(0.0, 0.65, ndl));
  // La sombra no es negra: el mismo color, hundido hacia un morado azulado, con algo de luz
  // rebotada en el borde.
  float mu = max(dot(n, v), 0.0);
  vec3 sombra = albedo * vec3(0.34, 0.33, 0.56) * (1.0 + 0.35 * pow(1.0 - mu, 2.0));
  vec3 color = mix(sombra, iluminado, lado);
  vec3 h = normalize(l + v);
  color = mix(color, vec3(1.0, 0.99, 0.95), brillo * zona(dot(n, h), 0.982) * lado);
  // Línea de tinta en el borde de la esfera (la silueta gruesa contra el cielo la pone el pase).
  float fw = max(fwidth(mu), 1e-5);
  color = mix(color, TINTA, 1.0 - smoothstep(1.2 * fw, 2.2 * fw, mu));
  return color;
}
`

export const PLANETA_VERT = /* glsl */ `
varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

void main() {
  vLocal = normalize(position);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

/**
 * Planetas y Luna de caricatura: cada uno con su dibujo de zonas planas. La Luna (aspecto 8) lleva
 * además una cara dormilona que siempre mira a la cámara.
 */
export const PLANETA_FRAG = /* glsl */ `
uniform float uAspecto;
uniform vec3 uSol;
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}
${RUIDO_3D}
${LUZ_CARICATURA}

// Cráteres de dibujo: círculos algo más oscuros con un borde claro por arriba y otro oscuro abajo.
vec3 crateres(vec3 p, vec3 color, float escala, float cantidad) {
  vec2 c = celdas(p * escala);
  float radio = mix(0.18, 0.34, c.y);
  float dentro = (1.0 - zona(c.x, radio)) * step(1.0 - cantidad, c.y);
  float borde = trazoConPaso(c.x - radio, 1.2, fwidth(c.x)) * step(1.0 - cantidad, c.y);
  color = mix(color, color * 0.8, dentro);
  return mix(color, color * 0.62, borde);
}

// Línea de color fina entre franjas (en los enteros de x), de un píxel y pico.
float lineaDeFranja(float x) {
  float w = max(fwidth(x), 1e-5);
  float d = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(0.6 * w, 1.6 * w, d);
}

vec3 albedoPlaneta(vec3 p, int tipo) {
  float lat = p.y;
  if (tipo == 0) {
    // Mercurio: gris lila con manchas y cráteres.
    vec3 col = mix(vec3(0.70, 0.66, 0.70), vec3(0.56, 0.52, 0.58), zona(fbm3(p * 2.5), 0.55));
    return crateres(p, col, 4.0, 0.55);
  }
  if (tipo == 1) {
    // Venus: crema dorada con remolinos de nubes más claras.
    float remolino = fbm3(vec3(p.x * 1.6, p.y * 4.5, p.z * 1.6) + 2.3);
    return mix(vec3(0.97, 0.82, 0.52), vec3(1.0, 0.93, 0.74), zona(remolino, 0.52));
  }
  if (tipo == 3) {
    // Marte: rojo anaranjado con mares más oscuros y el casquete blanco.
    vec3 col = mix(vec3(0.92, 0.45, 0.26), vec3(0.72, 0.30, 0.22), zona(fbm3(p * 2.0 + 5.0), 0.56));
    return mix(col, vec3(0.98, 0.96, 0.92), zona(abs(lat) + 0.04 * fbm3(p * 6.0), 0.88));
  }
  if (tipo == 4) {
    // Júpiter: franjas de colores planos con el borde ondulado y la Gran Mancha Roja entintada.
    float onda = fbm3(vec3(p.x * 2.0, p.y * 8.0, p.z * 2.0) + vec3(uTiempo * 0.01, 0.0, 0.0));
    float franja = lat * 5.5 + 0.8 * onda;
    float k = floor(franja);
    float t = fract(k * 0.618);
    vec3 col = t < 0.33 ? vec3(0.99, 0.91, 0.76) : t < 0.66 ? vec3(0.90, 0.70, 0.48) : vec3(0.80, 0.50, 0.34);
    col = mix(col, col * 0.78, lineaDeFranja(franja));
    float lon = atan(p.z, p.x);
    vec2 m = vec2((lon - 1.1) * 0.9, (lat + 0.37) * 3.2);
    float mancha = length(m);
    col = mix(col, vec3(1.0, 0.86, 0.72), 1.0 - zona(mancha, 0.24));
    col = mix(col, vec3(0.86, 0.34, 0.24), 1.0 - zona(mancha, 0.17));
    return mix(col, TINTA, trazo(mancha - 0.17, 1.3));
  }
  if (tipo == 5) {
    // Saturno: franjas oro pálido, suaves.
    float onda = fbm3(vec3(p.x * 1.6, p.y * 6.0, p.z * 1.6) + 4.0);
    float franja = lat * 4.0 + 0.5 * onda;
    float t = fract(floor(franja) * 0.618);
    vec3 col = t < 0.5 ? vec3(0.97, 0.88, 0.64) : vec3(0.90, 0.76, 0.50);
    return mix(col, col * 0.84, lineaDeFranja(franja));
  }
  if (tipo == 6) {
    // Urano: verde agua liso con una franja algo más clara.
    return mix(vec3(0.56, 0.87, 0.88), vec3(0.72, 0.94, 0.93), 1.0 - zona(abs(lat - 0.2), 0.12));
  }
  if (tipo == 8) {
    // La Luna: crema grisácea con mares y unos pocos cráteres.
    vec3 col = mix(vec3(0.92, 0.90, 0.82), vec3(0.78, 0.77, 0.73), zona(fbm3(p * 1.8 + 11.0), 0.58));
    return crateres(p, col, 3.0, 0.3);
  }
  // Neptuno: azul con una franja más oscura y la mancha oscura entintada.
  vec3 colN = mix(vec3(0.30, 0.47, 0.95), vec3(0.22, 0.36, 0.82), 1.0 - zona(abs(lat + 0.1), 0.1));
  float lonN = atan(p.z, p.x);
  float manchaN = length(vec2((lonN + 0.8) * 0.8, (lat + 0.35) * 3.0));
  colN = mix(colN, vec3(0.16, 0.24, 0.58), 1.0 - zona(manchaN, 0.15));
  return mix(colN, TINTA, trazo(manchaN - 0.15, 1.2));
}

// Arco de tinta (ojo cerrado, ceja, sonrisa): parábola y = y0 + curva·(x − x0)² de media anchura w.
float arco(vec2 q, vec2 centro, float curva, float w, float grosorPx) {
  vec2 d = q - centro;
  float dentro = 1.0 - step(w, abs(d.x));
  return trazo(d.y - curva * d.x * d.x, grosorPx) * dentro;
}

// Cara dormilona de la Luna, en coordenadas de la cara (disco unidad visto de frente).
vec3 caraLuna(vec2 q, vec3 color, float detalle) {
  // Mejillas sonrosadas.
  float mejillas = 1.0 - smoothstep(0.1, 0.2, min(length((q - vec2(-0.42, -0.12)) * vec2(1.0, 1.4)), length((q - vec2(0.42, -0.12)) * vec2(1.0, 1.4))));
  color = mix(color, vec3(1.0, 0.62, 0.58), 0.55 * mejillas * detalle);
  // Ojos cerrados (arcos hacia abajo, como dormida) y cejas.
  float tinta = arco(q, vec2(-0.26, 0.14), 2.6, 0.13, 2.0) + arco(q, vec2(0.26, 0.14), 2.6, 0.13, 2.0);
  tinta += arco(q, vec2(-0.27, 0.38), -1.8, 0.1, 1.6) + arco(q, vec2(0.27, 0.38), -1.8, 0.1, 1.6);
  // Sonrisa pequeña.
  tinta += arco(q, vec2(0.0, -0.3), 2.2, 0.17, 2.0);
  return mix(color, TINTA, clamp(tinta, 0.0, 1.0) * detalle);
}

void main() {
  int tipo = int(uAspecto + 0.5);
  vec3 p = normalize(vLocal);
  vec3 albedo = albedoPlaneta(p, tipo);
  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  if (tipo == 8) {
    // La cara siempre mira a la cámara: sus coordenadas son la normal proyectada en la pantalla.
    vec3 derecha = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 arriba = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec2 q = vec2(dot(n, derecha), dot(n, arriba));
    // Sólo con la Luna grande en pantalla (a pocos píxeles la cara sería una mancha); los cráteres
    // y mares se apartan del centro de la cara.
    float detalle = 1.0 - smoothstep(0.03, 0.06, fwidth(q.x));
    vec3 liso = vec3(0.92, 0.90, 0.82);
    albedo = mix(albedo, liso, detalle * (1.0 - smoothstep(0.45, 0.8, length(q))));
    albedo = caraLuna(q, albedo, detalle);
  }
  float lado;
  vec3 color = luzCaricatura(albedo, n, l, v, tipo >= 4 && tipo <= 7 ? 0.7 : 0.85, lado);
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * El Sol de caricatura, como el de los dibujos de los años 30: una cara redonda y sonriente (ojos
 * con el corte de "pastel", mejillas, nariz y una boca abierta que canta al compás) rodeada de
 * rayos puntiagudos de dos tonos que giran despacio y laten con cada pulso. Es un cartel siempre de
 * cara a la cámara, en el plano del centro del Sol.
 */
export const SOL_VERT = /* glsl */ `
uniform float uTamano;

varying vec2 vLocal;

void main() {
  vLocal = position.xy;
  vec4 centro = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  centro.xy += position.xy * uTamano;
  gl_Position = projectionMatrix * centro;
}
`

export const SOL_FRAG = /* glsl */ `
uniform float uAparicion;
uniform float uTiempo;
uniform float uPulsaciones;
// Medio lado del cartel en radios del Sol.
uniform float uMedioLado;

varying vec2 vLocal;

${SALIDA_CARICATURA}

const float PI = 3.14159265359;
const float RAYOS = 24.0;

float pulso(float n) {
  float onda = 0.5 + 0.5 * cos(2.0 * PI * n);
  return onda * onda * onda;
}

float elipse(vec2 q, vec2 centro, vec2 radios) {
  return length((q - centro) / radios) - 1.0;
}

float arco(vec2 q, vec2 centro, float curva, float w, float grosorPx) {
  vec2 d = q - centro;
  float dentro = 1.0 - step(w, abs(d.x));
  return trazo(d.y - curva * d.x * d.x, grosorPx) * dentro;
}

// Relleno (1 dentro) y contorno de tinta de una forma dada por su función de distancia aproximada
// (en unidades de la cara), con el trazo en píxeles; w es lo que mide un píxel en esas unidades.
vec2 formaConPaso(float d, float grosorPx, float w) {
  w = max(w, 1e-5);
  float relleno = 1.0 - smoothstep(-w, w, d);
  float borde = 1.0 - smoothstep(grosorPx * w, (grosorPx + 1.0) * w, abs(d));
  return vec2(relleno, borde);
}

vec2 forma(float d, float grosorPx) {
  return formaConPaso(d, grosorPx, fwidth(d));
}

void main() {
  vec2 q = vLocal * uMedioLado;
  float r = length(q);
  float p = pulso(uPulsaciones);
  // Con el Sol pequeño en pantalla no se dibuja la cara (a pocos píxeles sería una mancha).
  float detalle = 1.0 - smoothstep(0.055, 0.09, fwidth(q.x));

  // Rayos: 24 picos alternos, largos y cortos, que giran despacio y se estiran en cada pulso.
  float angulo = atan(q.y, q.x) - uTiempo * 0.18;
  float a = angulo * RAYOS / (2.0 * PI);
  float k = floor(a + 0.5);
  float f = a - k;
  float largo = mod(k, 2.0) < 0.5 ? 0.74 : 0.44;
  largo *= 1.0 + 0.12 * p;
  float pico = 1.0 - 2.0 * abs(f);
  float perfil = 1.03 + largo * pow(pico, 1.3);
  // Distancia aproximada al borde del rayo (con la pendiente del perfil).
  float pendiente = largo * 1.3 * pow(max(pico, 1e-3), 0.3) * 2.0 * RAYOS / (2.0 * PI);
  float dRayo = (r - perfil) / sqrt(1.0 + pow(pendiente / max(r, 0.2), 2.0));
  // El largo de los rayos salta de uno a otro (en los valles): el paso del píxel se toma del radio.
  vec2 rayo = formaConPaso(dRayo, 1.4, fwidth(r));
  vec3 colorRayo = mod(k, 2.0) < 0.5 ? vec3(1.0, 0.80, 0.26) : vec3(1.0, 0.60, 0.20);
  colorRayo = mix(colorRayo * vec3(1.0, 1.02, 1.1), colorRayo, smoothstep(1.0, 1.5, r));

  // Disco de la cara: amarillo con aerógrafo naranja hacia el borde y un brillo arriba a la izquierda.
  float respira = 1.0 + 0.025 * p;
  float dDisco = r / respira - 1.0;
  vec2 disco = forma(dDisco, 1.6);
  vec3 cara = mix(vec3(1.0, 0.90, 0.40), vec3(1.0, 0.68, 0.22), smoothstep(0.35, 1.0, r));
  cara = mix(cara, vec3(1.0, 0.97, 0.78), 0.8 * (1.0 - smoothstep(0.12, 0.3, length((q - vec2(-0.5, 0.55)) * vec2(1.0, 1.6)))));

  // La cara se balancea un poco con el compás, una pulsación hacia cada lado.
  vec2 c = q / respira - vec2(0.04 * sin(PI * uPulsaciones), 0.0);
  float tinta = 0.0;
  // Mejillas.
  float mejillas = 1.0 - smoothstep(0.1, 0.2, min(length((c - vec2(-0.55, -0.1)) * vec2(1.0, 1.5)), length((c - vec2(0.55, -0.1)) * vec2(1.0, 1.5))));
  cara = mix(cara, vec3(1.0, 0.5, 0.36), 0.6 * mejillas * detalle);
  // Ojos: blancos con la pupila negra "de pastel" (con su muesca); de vez en cuando parpadean.
  float parpadeo = step(0.93, fract(sin(floor(uTiempo * 1.4) * 12.9898) * 43758.5453)) * step(fract(uTiempo * 1.4), 0.3);
  for (int i = 0; i < 2; i++) {
    float lado = i == 0 ? -1.0 : 1.0;
    vec2 centroOjo = vec2(0.28 * lado, 0.2);
    if (parpadeo > 0.5) {
      tinta += arco(c, centroOjo + vec2(0.0, -0.02), -3.0, 0.15, 2.2);
    } else {
      vec2 blanco = forma(elipse(c, centroOjo, vec2(0.16, 0.23)), 1.3);
      cara = mix(cara, vec3(1.0, 0.99, 0.95), blanco.x * detalle);
      tinta += blanco.y;
      vec2 centroPupila = centroOjo + vec2(0.03, -0.04);
      vec2 pupila = forma(elipse(c, centroPupila, vec2(0.085, 0.14)), 0.0);
      vec2 dp = c - centroPupila;
      float anguloPupila = atan(dp.y, dp.x);
      float muesca = step(0.35, anguloPupila) * step(anguloPupila, 1.15);
      cara = mix(cara, TINTA, pupila.x * (1.0 - muesca) * detalle);
    }
    // Cejas.
    tinta += arco(c, vec2(0.28 * lado, 0.5), -2.2, 0.12, 1.8);
  }
  // Nariz redonda.
  vec2 nariz = forma(elipse(c, vec2(0.0, 0.0), vec2(0.075, 0.065)), 1.2);
  cara = mix(cara, vec3(1.0, 0.62, 0.26), nariz.x * detalle);
  tinta += nariz.y;
  // Boca abierta de oreja a oreja, con dientes arriba y la lengua; se abre más en cada pulso.
  float apertura = 0.36 + 0.07 * p;
  float dBoca = max(length((c - vec2(0.0, -0.14)) / vec2(0.46, apertura)) - 1.0, c.y + 0.14);
  vec2 boca = forma(dBoca, 1.4);
  vec3 interior = vec3(0.50, 0.10, 0.12);
  interior = mix(interior, vec3(1.0, 0.99, 0.95), 1.0 - zona(-c.y, 0.22));
  float lengua = 1.0 - zona(length((c - vec2(0.02, -0.14 - apertura * 0.95)) / vec2(0.24, 0.14)), 1.0);
  interior = mix(interior, vec3(0.96, 0.42, 0.45), lengua);
  cara = mix(cara, interior, boca.x * detalle);
  tinta += boca.y;
  cara = mix(cara, TINTA, clamp(tinta, 0.0, 1.0) * detalle);

  // Composición: rayos detrás, el disco delante, cada uno con su tinta.
  vec3 color = colorRayo;
  float alfa = max(rayo.x, rayo.y);
  color = mix(color, TINTA, rayo.y * (1.0 - rayo.x));
  color = mix(color, cara, disco.x);
  color = mix(color, TINTA, disco.y);
  alfa = max(alfa, max(disco.x, disco.y));
  if (alfa < 0.5) discard;
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

export const ANILLOS_VERT = /* glsl */ `
varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

void main() {
  // La geometría del anillo se genera en radios del planeta (1 = su ecuador).
  vRadio = length(position.xy);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

/**
 * Anillos de Saturno de caricatura: bandas planas (C tenue, B crema, la división de Cassini vacía,
 * A dorado con la de Encke como una raya), bordes entintados, la sombra del planeta como una zona
 * de color y la cara no iluminada más apagada.
 */
export const ANILLOS_FRAG = /* glsl */ `
uniform vec3 uSol;
uniform vec3 uCentroPlaneta;
uniform float uRadioPlaneta;
uniform float uAparicion;

varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

${SALIDA_CARICATURA}

void main() {
  float r = vRadio;
  float fw = max(fwidth(r), 1e-5);
  if (r < 1.24 - fw || r > 2.27 + 2.0 * fw || (r > 1.95 + 2.0 * fw && r < 2.03 - 2.0 * fw)) discard;
  vec3 color = r < 1.525 ? vec3(0.78, 0.70, 0.58) : r < 1.95 ? vec3(0.97, 0.90, 0.72) : vec3(0.90, 0.78, 0.56);
  // Aerógrafo: la banda B más clara hacia fuera.
  color *= r > 1.525 && r < 1.95 ? mix(0.94, 1.04, smoothstep(1.55, 1.9, r)) : 1.0;
  vec3 aSol = normalize(uSol - vPosMundo);
  vec3 aCamara = normalize(cameraPosition - vPosMundo);
  vec3 normal = normalize(vNormalMundo);
  // Vista por la cara que no da el Sol: más apagada.
  if (dot(normal, aSol) * dot(normal, aCamara) < 0.0) color *= vec3(0.62, 0.6, 0.72);
  // Sombra del planeta: el rayo hacia el Sol choca con la esfera.
  vec3 oc = vPosMundo - uCentroPlaneta;
  float bq = dot(oc, aSol);
  float cq = dot(oc, oc) - uRadioPlaneta * uRadioPlaneta;
  if (bq < 0.0 && bq * bq - cq > 0.0) color *= vec3(0.42, 0.40, 0.6);
  // Tinta: bordes de fuera y de dentro, la división de Cassini y la de Encke; una línea fina entre C y B.
  float tinta = trazo(r - 1.24, 1.4) + trazo(r - 2.27, 1.6) + trazo(r - 1.95, 1.4) + trazo(r - 2.03, 1.4);
  tinta += 0.8 * trazo(r - 2.21, 0.8) + 0.5 * trazo(r - 1.525, 0.8);
  color = mix(color, TINTA, clamp(tinta, 0.0, 1.0));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * Órbitas como un camino de puntitos, como en las cartas celestes antiguas: más gruesos justo
 * detrás del planeta (por donde acaba de pasar) y con un hueco a su alrededor.
 */
export const ORBITA_VERT = /* glsl */ `
attribute float aAnomalia;
uniform float uAnomaliaPlaneta;
uniform float uHueco;
uniform float uTamano;
// Separación entre puntitos (unidades) y alto del lienzo (px): de lejos, los puntitos no se juntan
// en una raya: se achican y, si ya no caben, no se dibujan.
uniform float uSeparacion;
uniform float uAltoPx;

varying float vAnomalia;

void main() {
  vAnomalia = aAnomalia;
  float detras = mod(uAnomaliaPlaneta - aAnomalia, 6.2831853);
  float delante = mod(aAnomalia - uAnomaliaPlaneta, 6.2831853);
  float estela = exp(-detras / 1.1);
  float hueco = smoothstep(uHueco, 2.0 * uHueco, min(detras, delante));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float separacionPx = uSeparacion * projectionMatrix[1][1] * 0.5 * uAltoPx / max(gl_Position.w, 1e-3);
  gl_PointSize = min(uTamano * (0.8 + 0.9 * estela), 0.42 * separacionPx) * hueco;
  if (separacionPx < 3.0 || gl_PointSize < 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

export const ORBITA_FRAG = /* glsl */ `
uniform vec3 uColor;

${SALIDA_CARICATURA}

void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = salidaCaricatura(uColor);
}
`

/**
 * La Tierra de caricatura, para verla de cerca al final: océano azul con una franja más clara junto
 * a las costas, continentes verdes con desiertos ocres, casquetes blancos y la costa entintada (del
 * mapa de `utils/texturaTierra.ts`, con el borde algo ondulado); nubes blancas en borreguitos que se
 * mueven; sombra azul de noche con las luces de las ciudades como puntitos amarillos, una raya dorada
 * de atardecer en el terminador y un brillo de barniz en el mar.
 */
export const TIERRA_FRAG = /* glsl */ `
uniform sampler2D uMapa;
uniform sampler2D uPoblacion;
uniform vec3 uSol;
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}
${RUIDO_3D}

// Muestra un mapa equirectangular sin costura en el antimeridiano: de las dos parametrizaciones
// de la longitud se usa la de derivada continua (si no, el salto de 1 a 0 elige el mip más
// pequeño y deja una línea vertical).
vec3 muestraMapa(sampler2D mapa, float u, float v) {
  float u1 = fract(u);
  float u2 = fract(u + 0.5) - 0.5;
  float uSinCostura = fwidth(u1) < fwidth(u2) + 1e-6 ? u1 : u2;
  return texture2D(mapa, vec2(uSinCostura, v)).rgb;
}

void main() {
  vec3 p = normalize(vLocal);
  float longitud = atan(-p.z, p.x);
  float latitud = asin(clamp(p.y, -1.0, 1.0));
  float coordU = longitud / 6.2831853 + 0.5;
  float coordV = latitud / 3.14159265 + 0.5;
  vec3 mapa = muestraMapa(uMapa, coordU, coordV);
  float latitudGrados = abs(latitud) * 57.29578;

  // Costa: el umbral de la máscara con una ondulación suave (de dibujo, no fractal).
  float costa = mapa.r + 0.18 * (fbm3(p * 7.0) - 0.5);
  float tierra = zona(costa, 0.5);
  float somera = zona(costa, 0.3) * (1.0 - tierra);

  vec3 oceano = mix(vec3(0.20, 0.47, 0.82), vec3(0.38, 0.68, 0.90), somera);
  vec3 suelo = mix(vec3(0.47, 0.74, 0.31), vec3(0.32, 0.58, 0.25), zona(fbm3(p * 5.0 + 17.0), 0.56));
  float arido = zona(mapa.g + 0.3 * (fbm3(p * 4.0 + 8.0) - 0.5), 0.45);
  suelo = mix(suelo, vec3(0.94, 0.79, 0.46), arido);
  suelo = mix(suelo, vec3(0.64, 0.68, 0.48), zona(latitudGrados, 60.0));
  float hielo = max(zona(mapa.b, 0.5), zona(latitudGrados + 5.0 * (fbm3(p * 6.0) - 0.5), 75.0) * tierra);
  float banquisa = zona(latitudGrados + 6.0 * (fbm3(p * 5.0) - 0.5), 80.0);
  vec3 color = mix(oceano, suelo, tierra);
  color = mix(color, vec3(0.97, 0.98, 1.0), max(hielo, banquisa));
  // La costa entintada (del lado de tierra).
  color = mix(color, vec3(0.12, 0.16, 0.26), trazo(costa - 0.5, 1.4) * (1.0 - banquisa));

  // Nubes en borreguitos que se desplazan con los vientos.
  vec3 qn = vec3(p.x, p.y * 1.6, p.z) * 3.0 + vec3(uTiempo * 0.006, 0.0, uTiempo * 0.002);
  float nubes = fbm3(qn + 0.35 * vec3(fbm3(qn * 1.7 + 3.1), 0.0, fbm3(qn * 1.7 + 7.3)));
  float nube = zona(nubes, 0.6);
  color = mix(color, vec3(0.74, 0.82, 0.94), zona(nubes, 0.58) * (1.0 - nube));
  color = mix(color, vec3(1.0, 0.995, 0.98), nube);

  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  float ndl = dot(n, l);
  float dia = zona(ndl, 0.0);
  float mu = max(dot(n, v), 0.0);
  vec3 iluminado = color * mix(0.86, 1.05, smoothstep(0.0, 0.6, ndl));
  // Noche: azul de noche con el mapa apenas marcado (con sólo oscurecer, los desiertos salían grises).
  vec3 noche = mix(color * vec3(0.3, 0.33, 0.5), vec3(0.09, 0.12, 0.3), 0.45) * (1.0 + 0.3 * pow(1.0 - mu, 2.0));
  // Luces de las ciudades: puntitos amarillos en tierra poblada, sólo de noche y bajo cielo despejado.
  float poblacion = muestraMapa(uPoblacion, coordU, coordV).r;
  vec2 celda = celdas(p * 45.0);
  float luces = (1.0 - zona(celda.x, 0.22 + 0.1 * celda.y)) * step(0.35, poblacion + 0.4 * celda.y) * step(0.12, poblacion) * tierra * (1.0 - nube);
  noche = mix(noche, vec3(1.0, 0.86, 0.42), luces);
  color = mix(noche, iluminado, dia);
  // Raya dorada de atardecer a lo largo del terminador.
  color = mix(color, vec3(1.0, 0.66, 0.36), trazo(ndl - 0.03, 2.2) * 0.85);
  // Brillo de barniz sobre el mar.
  vec3 h = normalize(l + v);
  color = mix(color, vec3(1.0, 0.99, 0.95), zona(dot(n, h), 0.985) * dia * (1.0 - tierra) * (1.0 - nube));
  color = mix(color, TINTA, 1.0 - smoothstep(1.2 * fwidth(mu), 2.2 * fwidth(mu), mu));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`

/**
 * Atmósfera de caricatura: un aro plano azul claro alrededor de la Tierra (el pase lo entinta por
 * fuera), sólo por el lado de día. Es una cáscara algo mayor que la Tierra: donde la vista la
 * atraviesa y da con la Tierra, no se dibuja.
 */
export const ATMOSFERA_FRAG = /* glsl */ `
uniform vec3 uSol;
uniform vec3 uCentro;
uniform float uRadio;
uniform float uAparicion;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${SALIDA_CARICATURA}

void main() {
  vec3 d = normalize(vPosMundo - cameraPosition);
  vec3 oc = cameraPosition - uCentro;
  float b = dot(oc, d);
  float c = dot(oc, oc) - uRadio * uRadio;
  if (b * b - c > 0.0 && b < 0.0) discard;
  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  float dia = dot(n, l);
  // El aro se afina hacia el lado de noche hasta desaparecer (no se corta de golpe).
  float cercania = sqrt(max(dot(oc, oc) - b * b, 0.0)) / uRadio;
  if (cercania > 1.0 + 0.055 * smoothstep(-0.35, 0.3, dia)) discard;
  vec3 color = mix(vec3(0.46, 0.70, 0.92), vec3(0.66, 0.88, 1.0), smoothstep(-0.25, 0.4, dia));
  gl_FragColor = salidaCaricatura(color * uAparicion);
}
`
