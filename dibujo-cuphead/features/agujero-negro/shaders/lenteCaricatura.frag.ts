/**
 * El agujero negro dibujado como un dibujo animado de los años 30 (estilo rubber hose), trazado
 * con la MISMA física que el original: cada píxel lanza su geodésica nula de Schwarzschild (RK4,
 * con la óptica del observador en caída libre), así que la lente dobla el disco igual que en la
 * versión realista y se ven sus imágenes por encima y por debajo de la sombra.
 *
 * Lo que cambia es lo que se dibuja:
 * - El disco es un sólido de caricatura con forma de lente fina: algo más grueso cerca del agujero y
 *   afilado hacia fuera, hasta acabar en filo (era una losa que engordaba hacia fuera y acababa en
 *   un canto recto: de lado, una barra con los extremos cuadrados). Cara de arriba, cara de abajo y
 *   el canto interior. El rayo se detiene en la primera superficie que toca (cortando cada tramo
 *   recto de la geodésica con el sólido de forma exacta), no acumula gas: formas limpias que se
 *   pueden entintar.
 * - Colores planos por siete bandas (del crema blanco caliente al carmesí) con un degradado de
 *   aerógrafo dentro de cada banda, bordes que ondulan en un remolino de dos brazos que gira, y
 *   rayas de velocidad afiladas que giran con cada banda (unas más oscuras, otras de brillo), como
 *   en los dibujos animados, y tres bolas de fuego con su cola que dan la vuelta al agujero. Más
 *   allá del borde, dos anillos finos rosados. Las sombras (la cara de abajo, los arcos) son
 *   cálidas, hacia el dorado y el rojo, nunca oliva.
 * - De canto, el disco es una hoja dorada que brilla por dentro (crema en su línea media), como el
 *   gas visto de lado; al inclinar la vista vuelve a sus bandas.
 * - Canto interior blanco caliente, anillo de fotones grueso (al menos unos píxeles a cualquier
 *   distancia) sobre un hueco oscuro entre la sombra y el disco, y la sombra como una mancha de
 *   tinta. El disco no late (su grosor latía con el compás).
 *
 * Además de color escribe, en una segunda salida, qué hay en cada píxel (objeto, banda y cara)
 * para que el pase de dibujo trace contornos limpios entre objetos y líneas de color entre bandas.
 */
export const LENTE_CARICATURA_FRAG = /* glsl */ `
uniform float uTiempo;
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform float uAnguloPixel;
// Movimiento de la cámara (ver utils/observadorCaida.ts): energía E y velocidad de caída K.
uniform vec2 uObservador;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;
// R: objeto (0 cielo, 1 cara del disco, 2 hoja fina de canto, 3 canto interior, 4 anillo, 5 sombra) / 5
// G: banda del disco / 10; B: cara (0 abajo, 1 arriba).
layout(location = 1) out vec4 fragId;

const float R_HORIZONTE = 1.0;
const float R_FOTON = 1.5;
const float B_CRITICO = 2.5980762;
const float R_BORDE = 17.0;
const float R_INTERIOR = 3.0;
// Borde del disco; más allá, tres anillos planos y finos (desde y hasta de cada uno), cada vez más
// transparentes (ANILLOS_COBERTURA), dentro de la esfera de marcha (R_BORDE).
const float R_EXTERIOR = 12.6;
const int N_ANILLOS = 3;
const float ANILLOS_FUERA[6] = float[](13.05, 13.6, 14.0, 14.35, 15.0, 15.3);
const vec3 ANILLOS_COBERTURA = vec3(0.85, 0.75, 0.62);
const int MAX_PASOS = 260;
const float PI = 3.14159265359;
const float DOS_PI = 6.28318530718;

// Paleta (sRGB): se pasa a lineal al final. Siete bandas, del crema blanco caliente del borde de
// dentro al carmesí del de fuera (que casa con el cielo morado), y los tres anillos finos (rosa,
// dorado y lila).
const int N_BANDAS = 7;
const vec3 BANDAS[10] = vec3[](
  vec3(1.000, 0.965, 0.880),
  vec3(1.000, 0.895, 0.560),
  vec3(1.000, 0.800, 0.260),
  vec3(1.000, 0.640, 0.180),
  vec3(0.960, 0.470, 0.170),
  vec3(0.880, 0.300, 0.170),
  vec3(0.730, 0.170, 0.200),
  vec3(0.930, 0.450, 0.420),
  vec3(0.960, 0.720, 0.460),
  vec3(0.800, 0.520, 0.700)
);
// Remolino: ondas espirales de dos brazos que ondulan los bordes de las bandas y giran como un todo
// (el patrón no se enrosca con los minutos): amplitud (en bandas) junto al borde de dentro y junto
// al de fuera (cerca de la sombra, más ondas hacían orejas), enroscado y giro (rad/s).
const vec2 REMOLINO_AMPLITUD = vec2(0.2, 0.6);
const float REMOLINO_ENROSCADO = 3.2;
const float REMOLINO_GIRO = 0.6;
// Giro del gas (rad/s junto al borde de dentro; hacia fuera, más despacio): las rayas de velocidad.
const float GIRO_GAS = 1.7;
// Bolas de fuego: tres grumos de gas muy caliente que dan la vuelta al agujero (más deprisa los de
// dentro) con su cola detrás, como cometas de dibujo animado. Radio de la órbita, fase, giro
// (rad/s a R_INTERIOR), radio de la cabeza y largo de la cola.
const vec3 BOLAS_RADIO = vec3(4.2, 5.6, 7.4);
const vec3 BOLAS_FASE = vec3(0.0, 2.2, 4.3);
const float BOLAS_GIRO = 2.6;
const float BOLA_CABEZA = 0.5;
const float BOLA_COLA = 4.2;
const vec3 BOLA_BORDE = vec3(1.000, 0.520, 0.150);
const vec3 BOLA_MEDIO = vec3(1.000, 0.860, 0.350);
const vec3 BOLA_CENTRO = vec3(1.000, 0.990, 0.930);
// El hueco entre la sombra y el borde interior del disco, oscuro (junto a la sombra y hacia el disco).
const vec3 HUECO_DENTRO = vec3(0.060, 0.042, 0.095);
const vec3 HUECO_FUERA = vec3(0.150, 0.085, 0.230);
const vec3 CANTO_INTERIOR = vec3(1.000, 0.975, 0.900);
const vec3 COLOR_ANILLO = vec3(1.000, 0.965, 0.850);
const vec3 COLOR_SOMBRA = vec3(0.065, 0.045, 0.085);
const vec3 BORDE_SOMBRA = vec3(0.170, 0.090, 0.230);
// Sombras cálidas: oscurecer el amarillo multiplicando por un gris lo volvía oliva (verdoso); así
// va hacia el dorado y el naranja, como las sombras de los dibujos de la época.
const vec3 SOMBRA_CALIDA = vec3(0.95, 0.8, 0.62);
const vec3 AEROGRAFO_CALIDO = vec3(0.96, 0.87, 0.84);
const vec3 ARCO_CALIDO = vec3(0.78, 0.6, 0.56);

// Semiespesor del disco, un huso: sube despacio del borde interior a la cumbre, baja apenas por el
// medio y se afila al final hasta acabar en punta (de canto, una lente larga con las puntas finas,
// no una barra). Tres tramos, cada uno un cono (h = base + pendiente·r), entre estos radios y
// alturas. Los anillos de fuera son planos (sin grosor: un corte del disco a mitad dejaba entrar los
// rayos rasantes por el borde y la hoja salía con una franja negra por dentro).
const int TRAMOS = 3;
const float RADIOS_HUSO[4] = float[](3.0, 6.0, 10.6, 12.6);
const float ALTOS_HUSO[4] = float[](0.15, 0.30, 0.20, 0.0);
const float H_CUMBRE = 0.30;

float pendienteTramo(int k) {
  return (ALTOS_HUSO[k + 1] - ALTOS_HUSO[k]) / (RADIOS_HUSO[k + 1] - RADIOS_HUSO[k]);
}

float semiEspesor(float r) {
  for (int k = 0; k < TRAMOS; k++) {
    if (r <= RADIOS_HUSO[k + 1]) return max(ALTOS_HUSO[k] + pendienteTramo(k) * (r - RADIOS_HUSO[k]), 0.0);
  }
  return 0.0;
}

bool enDisco(vec3 p) {
  float r = length(p.xz);
  return r >= R_INTERIOR && r <= R_EXTERIOR && abs(p.y) <= semiEspesor(r);
}

// Cuál de los anillos de fuera (0, 1, 2) hay a ese radio; -1 si ninguno.
int anilloFuera(float r) {
  for (int k = 0; k < N_ANILLOS; k++) {
    if (r >= ANILLOS_FUERA[2 * k] && r <= ANILLOS_FUERA[2 * k + 1]) return k;
  }
  return -1;
}

// Raíces de a·t² + 2·b·t + c = 0 (forma estable); -1 donde no hay raíz.
vec2 raices(float a, float b, float c) {
  float disc = b * b - a * c;
  if (disc < 0.0) return vec2(-1.0);
  float q = -(b + (b >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
  float t1 = abs(a) > 1e-12 ? q / a : -1.0;
  float t2 = abs(q) > 1e-12 ? c / q : -1.0;
  return vec2(min(t1, t2), max(t1, t2));
}

// Primer punto del tramo recto p → p + d (t de 0 a 1) sobre el disco: caras cónicas (un cono por
// tramo del huso y por lado), el canto interior cilíndrico y los anillos planos de fuera,
// cortados de forma exacta. Muestrear el tramo se saltaba las esquinas finas del borde interior y el
// contorno salía en dientes de sierra. Devuelve 2 si no lo toca; en superficie, cuál toca: 1 cara de
// arriba, -1 cara de abajo, 3 canto interior.
float cortaDisco(vec3 p, vec3 d, out float superficie) {
  float qq = dot(p.xz, p.xz);
  float qe = dot(p.xz, d.xz);
  float ee = dot(d.xz, d.xz);
  float mejor = 2.0;
  superficie = 0.0;
  // Caras: con w = ±y − base, cada cono es w = pendiente·r (w con el signo de la pendiente), o sea
  // w² = k²·r².
  for (int pieza = 0; pieza < TRAMOS; pieza++) {
    float pendiente = pendienteTramo(pieza);
    float base = ALTOS_HUSO[pieza] - pendiente * RADIOS_HUSO[pieza];
    float rMinimo = RADIOS_HUSO[pieza];
    float rMaximo = RADIOS_HUSO[pieza + 1];
    float k2 = pendiente * pendiente;
    for (int i = 0; i < 2; i++) {
      float lado = i == 0 ? 1.0 : -1.0;
      float w0 = lado * p.y - base;
      float dw = lado * d.y;
      vec2 t = raices(dw * dw - k2 * ee, w0 * dw - k2 * qe, w0 * w0 - k2 * qq);
      for (int j = 0; j < 2; j++) {
        float tj = t[j];
        if (tj < 0.0 || tj >= mejor || (w0 + tj * dw) * pendiente < 0.0) continue;
        float r = sqrt(max(qq + tj * (2.0 * qe + tj * ee), 0.0));
        if (r < rMinimo || r > rMaximo) continue;
        mejor = tj;
        superficie = lado;
      }
    }
  }
  // El canto interior: r = R_INTERIOR con |y| dentro del espesor.
  float h = semiEspesor(R_INTERIOR);
  vec2 t = raices(ee, qe, qq - R_INTERIOR * R_INTERIOR);
  for (int j = 0; j < 2; j++) {
    float tj = t[j];
    if (tj < 0.0 || tj >= mejor || abs(p.y + tj * d.y) > h) continue;
    mejor = tj;
    superficie = 3.0;
  }
  // Los anillos de fuera, en el plano.
  if (abs(d.y) > 1e-7) {
    float tp = -p.y / d.y;
    if (tp >= 0.0 && tp < mejor && anilloFuera(length(p.xz + tp * d.xz)) >= 0) {
      mejor = tp;
      superficie = d.y < 0.0 ? 1.0 : -1.0;
    }
  }
  return mejor;
}

vec3 aceleracionGeodesica(vec3 q, float h2) {
  float r2 = max(dot(q, q), 1e-4);
  return -1.5 * h2 * q / (r2 * r2 * sqrt(r2));
}

float perigeo(float b) {
  float arg = clamp(-2.5980762 / max(b, 1e-3), -1.0, 1.0);
  return (2.0 * b / 1.7320508) * cos(acos(arg) / 3.0);
}

// Tira suave (0–1) de ancho w alrededor de 0, con antialias de un píxel.
float tira(float x, float w) {
  float aa = max(fwidth(x), 1e-5);
  return 1.0 - smoothstep(w - aa, w + aa, abs(x));
}

// Cara del disco: banda, aerógrafo y arcos de movimiento que giran con la banda. Los bordes de las
// bandas ondulan con el remolino (ver REMOLINO_*). De canto (deCanto 1), el huso es una hoja que
// brilla por dentro, como el gas visto de lado: el color sale de la altura del punto (la línea media
// de la hoja toca la punta, crema; sus bordes, la cumbre, dorado y naranja). Al inclinar la vista se
// pasa de una a otra recorriendo la paleta, no mezclando colores (el rojo con el crema daba un
// salmón). Los anillos de fuera llevan sus dos colores.
vec3 colorCara(vec3 p, float lado, float deCanto, out float banda) {
  float r = length(p.xz);
  float angulo = atan(p.z, p.x);
  float sCara;
  if (r <= R_EXTERIOR) {
    float tCara = (r - R_INTERIOR) / (R_EXTERIOR - R_INTERIOR);
    float brazo = 2.0 * (angulo - REMOLINO_GIRO * uTiempo) + REMOLINO_ENROSCADO * log(r / R_INTERIOR);
    float amplitud = mix(REMOLINO_AMPLITUD.x, REMOLINO_AMPLITUD.y, tCara);
    sCara = clamp(tCara * float(N_BANDAS) + amplitud * sin(brazo), 0.0, float(N_BANDAS) - 0.001);
  } else {
    int k = max(anilloFuera(r), 0);
    float desde = ANILLOS_FUERA[2 * k];
    float hasta = ANILLOS_FUERA[2 * k + 1];
    sCara = float(N_BANDAS + k) + clamp((r - desde) / (hasta - desde), 0.0, 0.999);
  }
  // (Cuatro tonos en la hoja, del crema al dorado: con más, la hoja de cerca era una vara a rayas.)
  float sHoja = 0.55 * float(N_BANDAS) * abs(p.y) / H_CUMBRE;
  float s = clamp(mix(sCara, sHoja, deCanto), 0.0, float(N_BANDAS + N_ANILLOS) - 0.001);
  banda = floor(s);
  float f = s - banda;
  vec3 base = BANDAS[int(banda)];
  // Aerógrafo: cada banda más clara hacia su lado interior.
  base = mix(base * 1.08, base * AEROGRAFO_CALIDO, f);
  // Rayas de velocidad: cada banda gira a su ritmo (más deprisa por dentro); dos pistas, unas más
  // oscuras y otras de brillo, afiladas en las puntas como pinceladas.
  float velocidad = GIRO_GAS * pow(R_INTERIOR / max(r, R_INTERIOR), 1.2);
  float giro = angulo / DOS_PI - velocidad * uTiempo / DOS_PI;
  float fase1 = fract(giro * 3.0 + banda * 0.37) / 0.42;
  float fase2 = fract(giro * 3.0 + banda * 0.61 + 0.5) / 0.32;
  float raya1 = fase1 < 1.0 ? tira(f - 0.36, 0.06 * sin(PI * fase1)) : 0.0;
  float raya2 = fase2 < 1.0 ? tira(f - 0.72, 0.06 * sin(PI * fase2)) : 0.0;
  // (En las bandas claras de dentro, las oscuras apenas: parecían semillas.)
  base = mix(base, base * ARCO_CALIDO, raya1 * smoothstep(0.5, 2.5, banda));
  base = mix(base, mix(base, vec3(1.0, 0.99, 0.95), 0.7), raya2);
  // Bolas de fuego (ver BOLAS_*): cabeza redonda y cola que se afina hacia atrás; centro blanco,
  // amarillo y borde naranja, y la banda 10, para que lleven su línea de color alrededor. El borde se
  // suaviza con el tamaño de un píxel en el mundo (con fwidth, el ángulo salta en ±π y dejaba una raya).
  float pixelMundo = max(uAnguloPixel * length(p - uPosCamara), 1e-4);
  for (int k = 0; k < 3; k++) {
    float rk = BOLAS_RADIO[k];
    float giroBola = BOLAS_GIRO * pow(R_INTERIOR / rk, 1.5);
    float dAng = mod(angulo - BOLAS_FASE[k] - giroBola * uTiempo + PI, DOS_PI) - PI;
    vec2 q = vec2(dAng * rk, r - rk);
    float u = clamp(-q.x / BOLA_COLA, 0.0, 1.0);
    float radioLocal = q.x >= 0.0 ? BOLA_CABEZA : BOLA_CABEZA * (1.0 - u);
    float d = q.x >= 0.0 ? length(q) - BOLA_CABEZA : (q.x > -BOLA_COLA ? abs(q.y) - radioLocal : 1e3);
    d = min(d, length(q) - BOLA_CABEZA);
    float cubre = 1.0 - smoothstep(-pixelMundo, pixelMundo, d);
    if (cubre <= 0.0) continue;
    float calor = clamp(-d / max(radioLocal, 1e-3), 0.0, 1.0) * (1.0 - 0.75 * u);
    vec3 bola = mix(BOLA_BORDE, BOLA_MEDIO, smoothstep(0.08, 0.4, calor));
    bola = mix(bola, BOLA_CENTRO, smoothstep(0.45, 0.8, calor));
    base = mix(base, bola, cubre);
    if (cubre > 0.5) banda = 10.0;
  }
  // La cara de abajo, en sombra.
  if (lado < 0.0) base *= SOMBRA_CALIDA;
  return base;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 ojo = uProyInversa * vec4(ndc, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  vec3 ro = uPosCamara;
  vec3 rd = normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);

  // Óptica del observador en caída libre (igual que el original): dirección del rayo en el
  // marco de la cámara con la aberración de su velocidad.
  float r0 = length(ro);
  vec3 radialCamara = ro / max(r0, 1e-4);
  float drCamara = dot(rd, radialCamara);
  float denominador = uObservador.x + uObservador.y * drCamara;
  bool otroLado = denominador <= 1e-3;
  float gCamara = 1.0 / max(denominador, 1e-3);
  vec3 v0 = gCamara * (rd + ((uObservador.x - 1.0) * drCamara + uObservador.y) * radialCamara);
  vec3 dirRayo = normalize(v0);

  float b = dot(ro, dirRayo);
  float c = dot(ro, ro) - R_BORDE * R_BORDE;
  float disc = b * b - c;

  vec3 color = vec3(0.0);
  float objeto = 0.0;
  float banda = 0.0;
  float cara = 1.0;
  float cobertura = 0.0;
  bool capturado = false;
  bool escapo = false;
  bool hayHit = false;
  bool pasoPerigeo = false;
  bool hitAntesDelPerigeo = false;
  vec3 pHit = vec3(0.0);
  vec3 vHit = v0;
  float superficieHit = 0.0;

  if (otroLado) {
    capturado = true;
    pHit = ro;
  } else if (disc > 0.0 || c < 0.0) {
    float tIni = (c < 0.0) ? 0.0 : max(-b - sqrt(disc), 0.0);
    vec3 p = ro + dirRayo * tIni;
    vec3 v = v0;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);
    // La cámara dentro del grosor del disco: lo tapa todo.
    if (enDisco(p)) {
      pHit = p;
      hayHit = true;
      hitAntesDelPerigeo = true;
      superficieHit = p.y >= 0.0 ? 1.0 : -1.0;
    }
    float hMaximo = H_CUMBRE;
    for (int i = 0; i < MAX_PASOS && !hayHit; i++) {
      float r = length(p);
      if (r < R_HORIZONTE && dot(p, v) < 0.0) {
        capturado = true;
        pHit = p;
        break;
      }
      if (r > R_BORDE && dot(p, v) > 0.0) {
        escapo = true;
        break;
      }

      float paso = clamp(r * 0.04, 0.05, 0.7);
      paso = min(paso, 0.1 * r / length(v));

      vec3 k1 = aceleracionGeodesica(p, h2);
      vec3 v2 = v + 0.5 * paso * k1;
      vec3 k2 = aceleracionGeodesica(p + 0.5 * paso * v, h2);
      vec3 v3 = v + 0.5 * paso * k2;
      vec3 k3 = aceleracionGeodesica(p + 0.5 * paso * v2, h2);
      vec3 v4 = v + paso * k3;
      vec3 k4 = aceleracionGeodesica(p + paso * v3, h2);
      vec3 pNueva = p + (paso / 6.0) * (v + 2.0 * v2 + 2.0 * v3 + v4);
      vec3 vNueva = v + (paso / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);

      // Primera superficie del disco en el tramo (el tramo entero por encima o por debajo del disco
      // se descarta sin más).
      if (min(p.y, pNueva.y) <= hMaximo && max(p.y, pNueva.y) >= -hMaximo) {
        vec3 tramo = pNueva - p;
        float superficie;
        float t = cortaDisco(p, tramo, superficie);
        if (t <= 1.0) {
          pHit = p + t * tramo;
          vHit = v;
          superficieHit = superficie;
          hayHit = true;
          hitAntesDelPerigeo = !pasoPerigeo;
          break;
        }
      }
      if (!pasoPerigeo && dot(pNueva, vNueva) > 0.0) pasoPerigeo = true;
      p = pNueva;
      v = vNueva;
    }
  }

  // Un rayo que agota los pasos sin caer ni escapar da vueltas junto a la esfera de fotones: queda a
  // oscuras, como uno capturado (antes se tomaba por el anillo).
  if (!capturado && !hayHit && !escapo && (disc > 0.0 || c < 0.0)) capturado = true;

  if (capturado) {
    // La sombra: tinta, con un borde algo morado (como una esfera oscura con volumen).
    vec3 hRayo = cross(ro, v0);
    float h2Rayo = dot(hRayo, hRayo);
    float bRayo = sqrt(h2Rayo / max(dot(v0, v0) - h2Rayo / (r0 * r0 * r0), 1e-4));
    // Borde algo morado sólo desde fuera (de cerca, con la aberración de la caída, la sombra es
    // una mancha de tinta plana).
    float bordeMorado = smoothstep(0.82, 1.0, bRayo / B_CRITICO) * smoothstep(4.0, 8.0, r0);
    color = mix(COLOR_SOMBRA, BORDE_SOMBRA, otroLado ? 0.0 : bordeMorado);
    objeto = 5.0;
    cobertura = 1.0;
  } else if (hayHit) {
    if (abs(superficieHit) < 1.5) {
      cara = superficieHit;
      // De canto (la cámara a menos de 1° del plano; a los 5° ya se ven las bandas), la hoja que
      // brilla (ver colorCara): sin ella, los rayos de su línea media tocan la punta, el rojo de
      // fuera, y era una aguja roja. Sólo lo que se ve de frente (rayos que apenas se doblaron): las
      // imágenes que rodean la sombra conservan sus bandas. Con lo que se dobla el rayo y no con si
      // pasó ya por su perigeo, que a los lados del disco cambia de golpe y dejaba una costura.
      float elevacion = abs(uPosCamara.y) / max(length(uPosCamara), 1e-3);
      float directo = smoothstep(0.939, 0.99, dot(normalize(vHit), dirRayo));
      float deCanto = (1.0 - smoothstep(0.012, 0.09, elevacion)) * directo;
      color = colorCara(pHit, cara, deCanto, banda);
      objeto = 1.0;
      // De canto y de lejos la hoja mide pocos píxeles (menos de unos 10): su contorno de tinta y las
      // líneas entre sus bandas la llenaban de rayitas negras. Ahí es un hilo de luz sin tinta (el pase de dibujo no
      // entinta el objeto 2), como la línea de luz de la versión realista; de cerca, con su contorno.
      // El grosor es el de la hoja en ese punto de su largo (el mayor que cruza la visual, que pasa a
      // bPlano del centro), igual en todo su ancho: con el del punto tocado, la tinta salía a trozos.
      float bPlano = abs(ro.x * dirRayo.z - ro.z * dirRayo.x) / max(length(dirRayo.xz), 1e-4);
      float grosorPx = 2.0 * semiEspesor(max(bPlano, RADIOS_HUSO[1])) / max(length(pHit - ro) * uAnguloPixel, 1e-6);
      if (deCanto * (1.0 - smoothstep(7.0, 13.0, grosorPx)) > 0.5) objeto = 2.0;
      // Los anillos de fuera, pintados suaves, también sin tinta (con ella eran rayas oscuras), y
      // algo transparentes (ver la cobertura, más abajo).
      if (length(pHit.xz) > R_EXTERIOR) objeto = 2.0;
    } else {
      color = CANTO_INTERIOR;
      objeto = 3.0;
    }
    cobertura = 1.0;
    if (abs(superficieHit) < 1.5 && length(pHit.xz) > R_EXTERIOR) {
      int k = max(anilloFuera(length(pHit.xz)), 0);
      cobertura = ANILLOS_COBERTURA[k];
    }
  } else if (escapo && dot(ro, v0) < 0.0) {
    // El hueco entre la sombra y el borde interior del disco (rayos que pasan a menos de R_INTERIOR
    // del centro, por dentro del disco, y escapan): oscuro, como en la versión realista, con el anillo
    // de fotones brillando encima. Por él se veían los rayos de sol del fondo y parecía un engranaje.
    // De cerca, en la caída, como antes (dentro del disco todos los rayos pasarían por ahí).
    vec3 hRayo = cross(ro, v0);
    float h2Rayo = dot(hRayo, hRayo);
    float bRayo = sqrt(h2Rayo / max(dot(v0, v0) - h2Rayo / (r0 * r0 * r0), 1e-4));
    if (perigeo(bRayo) < R_INTERIOR) {
      color = mix(HUECO_DENTRO, HUECO_FUERA, smoothstep(B_CRITICO, 3.67, bRayo));
      cobertura = smoothstep(3.2, 4.5, r0);
    }
  }

  // Anillo de fotones: grueso (al menos unos píxeles a cualquier distancia), delante de las
  // imágenes del disco que dan la vuelta al agujero y detrás del disco que pasa por delante.
  if (!capturado && !(hayHit && hitAntesDelPerigeo)) {
    vec3 hRayo = cross(ro, v0);
    float h2Rayo = dot(hRayo, hRayo);
    float bRayo = sqrt(h2Rayo / max(dot(v0, v0) - h2Rayo / (r0 * r0 * r0), 1e-4));
    bool perigeoDelante = r0 <= R_FOTON || dot(ro, v0) < 0.0;
    // Un destello que da la vuelta al anillo despacio (más grueso y blanco a su paso), como el brillo
    // de un anillo de oro: el ángulo del rayo alrededor de la dirección del agujero.
    vec3 haciaAgujero = -radialCamara;
    vec3 e1 = normalize(cross(haciaAgujero, abs(haciaAgujero.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(e1, haciaAgujero);
    float anguloAnillo = atan(dot(dirRayo, e2), dot(dirRayo, e1));
    float destello = pow(0.5 + 0.5 * cos(2.0 * (anguloAnillo - 0.9 * uTiempo)), 10.0);
    float ancho = max(0.07, 3.2 * uAnguloPixel * r0) * (1.0 + 1.3 * destello);
    float exceso = bRayo - B_CRITICO;
    if (perigeoDelante && exceso >= 0.0 && exceso < ancho) {
      color = mix(COLOR_ANILLO, vec3(1.0), 0.85 * destello);
      objeto = 4.0;
      cobertura = 1.0;
    }
  }

  float profundidad = 1.0;
  if (hayHit || capturado) {
    vec4 clipH = uVistaProyeccion * vec4(pHit, 1.0);
    profundidad = clamp(clipH.z / clipH.w * 0.5 + 0.5, 0.0, 1.0);
  }
  gl_FragDepth = profundidad;

  fragColor = vec4(pow(color, vec3(2.2)), cobertura);
  fragId = vec4(objeto / 5.0, banda / 10.0, cara * 0.5 + 0.5, 1.0);
}
`
