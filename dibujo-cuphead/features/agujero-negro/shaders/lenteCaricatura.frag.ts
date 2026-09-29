/**
 * El agujero negro dibujado como un dibujo animado de los años 30 (estilo rubber hose), trazado
 * con la MISMA física que el original: cada píxel lanza su geodésica nula de Schwarzschild (RK4,
 * con la óptica del observador en caída libre), así que la lente dobla el disco igual que en la
 * versión realista y se ven sus imágenes por encima y por debajo de la sombra.
 *
 * Lo que cambia es lo que se dibuja:
 * - El disco es un sólido de caricatura (como un disco de vinilo con grosor): cara de arriba, cara
 *   de abajo y cantos. El rayo se detiene en la primera superficie que toca (cortando cada tramo
 *   recto de la geodésica con el sólido de forma exacta), no acumula gas: formas limpias que se
 *   pueden entintar.
 * - Colores planos por bandas (crema caliente, amarillo, naranja dorado, naranja, rojo) con un
 *   degradado de aerógrafo dentro de cada banda, y arcos de movimiento que giran con cada banda
 *   (unos más oscuros, otros de brillo), como las líneas de velocidad de los dibujos animados.
 * - Canto exterior granate, canto interior blanco caliente, anillo de fotones grueso (al menos
 *   unos píxeles a cualquier distancia) y la sombra como una mancha de tinta.
 * - El disco "late" con el ritmo del dibujo (su grosor sube y baja con cada compás).
 *
 * Además de color escribe, en una segunda salida, qué hay en cada píxel (objeto, banda y cara)
 * para que el pase de dibujo trace contornos limpios entre objetos y líneas de color entre bandas.
 */
export const LENTE_CARICATURA_FRAG = /* glsl */ `
uniform float uTiempo;
uniform float uLatido;
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform float uAnguloPixel;
// Movimiento de la cámara (ver utils/observadorCaida.ts): energía E y velocidad de caída K.
uniform vec2 uObservador;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;
// R: objeto (0 cielo, 1 cara del disco, 2 canto exterior, 3 canto interior, 4 anillo, 5 sombra) / 5
// G: banda del disco / 5; B: cara (0 abajo, 1 arriba).
layout(location = 1) out vec4 fragId;

const float R_HORIZONTE = 1.0;
const float R_FOTON = 1.5;
const float B_CRITICO = 2.5980762;
const float R_BORDE = 17.0;
const float R_INTERIOR = 3.0;
const float R_EXTERIOR = 11.0;
const int MAX_PASOS = 260;
const float PI = 3.14159265359;
const float DOS_PI = 6.28318530718;

// Paleta (sRGB): se pasa a lineal al final.
const vec3 BANDAS[5] = vec3[](
  vec3(1.000, 0.955, 0.830),
  vec3(1.000, 0.830, 0.270),
  vec3(1.000, 0.640, 0.180),
  vec3(0.945, 0.450, 0.185),
  vec3(0.840, 0.245, 0.175)
);
const vec3 CANTO_EXTERIOR = vec3(0.560, 0.145, 0.190);
const vec3 CANTO_INTERIOR = vec3(1.000, 0.975, 0.900);
const vec3 COLOR_ANILLO = vec3(1.000, 0.965, 0.850);
const vec3 COLOR_SOMBRA = vec3(0.065, 0.045, 0.085);
const vec3 BORDE_SOMBRA = vec3(0.170, 0.090, 0.230);

// Semiespesor del disco: crece en línea con el radio, h(r) = ESPESOR_BASE + ESPESOR_PENDIENTE·r
// (0.16 en el borde interior), y late con el compás.
const float ESPESOR_BASE = 0.16 - 0.028 * R_INTERIOR;
const float ESPESOR_PENDIENTE = 0.028;

float semiEspesor(float r) {
  return (ESPESOR_BASE + ESPESOR_PENDIENTE * r) * (1.0 + 0.12 * uLatido);
}

bool enDisco(vec3 p) {
  float r = length(p.xz);
  return r >= R_INTERIOR && r <= R_EXTERIOR && abs(p.y) <= semiEspesor(r);
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

// Primer punto del tramo recto p → p + d (t de 0 a 1) sobre el disco: caras cónicas y cantos
// cilíndricos, cortados de forma exacta. Muestrear el tramo se saltaba las esquinas finas del borde
// interior y el contorno salía en dientes de sierra. Devuelve 2 si no lo toca; en superficie, cuál
// toca: 1 cara de arriba, -1 cara de abajo, 2 canto exterior, 3 canto interior.
float cortaDisco(vec3 p, vec3 d, out float superficie) {
  float escala = 1.0 + 0.12 * uLatido;
  float base = ESPESOR_BASE * escala;
  float pendiente = ESPESOR_PENDIENTE * escala;
  float k2 = pendiente * pendiente;
  float qq = dot(p.xz, p.xz);
  float qe = dot(p.xz, d.xz);
  float ee = dot(d.xz, d.xz);
  float mejor = 2.0;
  superficie = 0.0;
  // Caras: con w = ±y − base, la cara es w = pendiente·r (w ≥ 0), o sea w² = k²·r².
  for (int i = 0; i < 2; i++) {
    float lado = i == 0 ? 1.0 : -1.0;
    float w0 = lado * p.y - base;
    float dw = lado * d.y;
    vec2 t = raices(dw * dw - k2 * ee, w0 * dw - k2 * qe, w0 * w0 - k2 * qq);
    for (int j = 0; j < 2; j++) {
      float tj = t[j];
      if (tj < 0.0 || tj >= mejor || w0 + tj * dw < 0.0) continue;
      float r = sqrt(max(qq + tj * (2.0 * qe + tj * ee), 0.0));
      if (r < R_INTERIOR || r > R_EXTERIOR) continue;
      mejor = tj;
      superficie = lado;
    }
  }
  // Cantos: r = R con |y| dentro del espesor.
  for (int i = 0; i < 2; i++) {
    float radio = i == 0 ? R_EXTERIOR : R_INTERIOR;
    float h = base + pendiente * radio;
    vec2 t = raices(ee, qe, qq - radio * radio);
    for (int j = 0; j < 2; j++) {
      float tj = t[j];
      if (tj < 0.0 || tj >= mejor || abs(p.y + tj * d.y) > h) continue;
      mejor = tj;
      superficie = i == 0 ? 2.0 : 3.0;
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

// Cara del disco: banda, aerógrafo y arcos de movimiento que giran con la banda.
vec3 colorCara(vec3 p, float lado, out float banda) {
  float r = length(p.xz);
  float t = clamp((r - R_INTERIOR) / (R_EXTERIOR - R_INTERIOR), 0.0, 0.9999);
  float s = t * 5.0;
  banda = floor(s);
  float f = s - banda;
  vec3 base = BANDAS[int(banda)];
  // Aerógrafo: cada banda más clara hacia su lado interior.
  base *= mix(1.08, 0.9, f);
  // Arcos de movimiento: cada banda gira a su ritmo (más deprisa por dentro); dos pistas de arcos.
  float angulo = atan(p.z, p.x);
  float velocidad = 0.75 * pow(R_INTERIOR / max(r, R_INTERIOR), 1.2);
  float giro = angulo / DOS_PI - velocidad * uTiempo / DOS_PI;
  float pista1 = tira(f - 0.34, 0.07);
  float pista2 = tira(f - 0.72, 0.055);
  float fase1 = fract(giro * 3.0 + banda * 0.37);
  float fase2 = fract(giro * 2.0 + banda * 0.61 + 0.5);
  float arco1 = smoothstep(0.0, 0.03, fase1) * (1.0 - smoothstep(0.25, 0.3, fase1));
  float arco2 = smoothstep(0.0, 0.03, fase2) * (1.0 - smoothstep(0.18, 0.22, fase2));
  base = mix(base, base * 0.66, pista1 * arco1);
  base = mix(base, mix(base, vec3(1.0, 0.99, 0.95), 0.65), pista2 * arco2);
  // La cara de abajo, algo más oscura.
  if (lado < 0.0) base *= 0.84;
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
    float hMaximo = semiEspesor(R_EXTERIOR);
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
      color = colorCara(pHit, cara, banda);
      objeto = 1.0;
    } else if (superficieHit < 2.5) {
      // Canto exterior: el gas visto de canto brilla (como el haz del original): crema caliente en
      // el centro, amarillo y naranja hacia las caras, y un filo granate.
      float altura = abs(pHit.y) / semiEspesor(R_EXTERIOR);
      color = mix(BANDAS[0], BANDAS[1], smoothstep(0.1, 0.45, altura));
      color = mix(color, BANDAS[3], smoothstep(0.45, 0.8, altura));
      color = mix(color, CANTO_EXTERIOR, smoothstep(0.82, 1.0, altura));
      objeto = 2.0;
      banda = 5.0;
    } else {
      color = CANTO_INTERIOR;
      objeto = 3.0;
    }
    cobertura = 1.0;
  }

  // Anillo de fotones: grueso (al menos unos píxeles a cualquier distancia), delante de las
  // imágenes del disco que dan la vuelta al agujero y detrás del disco que pasa por delante.
  if (!capturado && !(hayHit && hitAntesDelPerigeo)) {
    vec3 hRayo = cross(ro, v0);
    float h2Rayo = dot(hRayo, hRayo);
    float bRayo = sqrt(h2Rayo / max(dot(v0, v0) - h2Rayo / (r0 * r0 * r0), 1e-4));
    bool perigeoDelante = r0 <= R_FOTON || dot(ro, v0) < 0.0;
    float ancho = max(0.07, 3.2 * uAnguloPixel * r0);
    float exceso = bRayo - B_CRITICO;
    if (perigeoDelante && exceso >= 0.0 && exceso < ancho) {
      color = COLOR_ANILLO;
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
  fragId = vec4(objeto / 5.0, banda / 5.0, cara * 0.5 + 0.5, 1.0);
}
`
