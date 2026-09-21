import { PARAMETROS_AGUJERO } from '../constantes/parametrosAgujero'

const f = (valor: number): string => valor.toFixed(4)

/**
 * Ray-marching de geodésicas nulas en métrica de Schwarzschild con disco de acreción
 * ópticamente grueso, beaming Doppler, corrimiento gravitacional, anillo de fotones y cielo de
 * fondo lensado.
 *
 * La ecuación d²x/dλ² = -1.5·h²·x/r⁵ (h = momento angular específico del fotón, r_s = 1) es la
 * geodésica nula EXACTA de Schwarzschild escrita en coordenadas cartesianas con un parámetro
 * afín, no la aproximación 1/r² con factor de ajuste de otros trazadores. Se integra con
 * Runge-Kutta de cuarto orden: el paso de 0.05–0.7 unidades da un error por paso ~10⁻⁶ frente al
 * ~10⁻² del Euler anterior, y así el anillo de fotones (b = 2.598) y las imágenes lensadas del
 * disco salen del cálculo y no del ajuste del paso.
 *
 * La lámina de gas es mucho más fina que el paso de marcha, así que su profundidad óptica
 * por paso se integra analíticamente (perfil vertical gaussiano → erf) en vez de muestrearse:
 * el disco luce igual de canto que desde arriba y sin granulado.
 *
 * Todo lo que se ve es UN solo modelo del mundo, el mismo desde cualquier ángulo y distancia:
 * disco, niebla interior (absorbe y brilla), anillo de fotones y cielo. Ningún término depende
 * de la elevación de la cámara ni de la vista elegida; lo único que cambia con la vista es la
 * exposición (uBrillo), como en una cámara.
 */
export const LENTE_GRAVITACIONAL_FRAG = /* glsl */ `
uniform float uTiempo;
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform float uBrillo;
// Niebla interior: opacidad por unidad de densidad y brillo de su fuente (luz del disco que dispersa).
uniform float uNiebla;
uniform float uNieblaLuz;
// Amplitud del anillo de fotones (las imágenes de orden superior apiladas, que no se integran).
uniform float uAnillo;
// Tamaño angular de un píxel (rad): fija el tamaño mínimo de las estrellas del cielo de fondo.
uniform float uAnguloPixel;

in vec2 vUv;
out vec4 fragColor;

const float R_HORIZONTE = ${f(PARAMETROS_AGUJERO.radioHorizonte)};
const float R_FOTON = ${f(PARAMETROS_AGUJERO.radioFoton)};
const float R_SOMBRA = ${f(PARAMETROS_AGUJERO.radioSombra)};
const float R_IN = ${f(PARAMETROS_AGUJERO.radioInternoDisco)};
const float R_PLUNGE = ${f(PARAMETROS_AGUJERO.radioPlunge)};
const float R_GAS = ${f(PARAMETROS_AGUJERO.radioGas)};
const float R_OUT = ${f(PARAMETROS_AGUJERO.radioExternoDisco)};
const float R_BORDE = ${f(PARAMETROS_AGUJERO.radioBorde)};
const int MAX_PASOS = ${PARAMETROS_AGUJERO.pasosMaximos};
const float PI = 3.14159265359;
const float DOS_PI = 6.28318530718;
const float RAIZ_PI = 1.7724538509;

// Opacidad del gas. Con σ = 0.038 de semiespesor, τ perpendicular ≈ 0.12 (0.2 en la ISCO): disco
// ópticamente FINO de frente, de modo que visto desde arriba sólo el borde interno llega a crema
// y el resto luce oro → sepia sin saturar; de canto el camino rasante es ~200 veces más largo
// (τ ≈ 25), el gas satura y el haz brilla al máximo con un núcleo de ~5 px sobre 1158, como en
// la referencia. Esta asimetría τ_frente ≪ 1 ≪ τ_canto es lo que hace que el disco se lea como
// haz brillante de canto y como superficie dorada desde arriba.
const float KAPPA = 1.8;
const float SIGMA_INV_NUCLEO = 26.3;
const float SIGMA_INV_ATMOSFERA = 7.89;
const float AMP_ATMOSFERA = 0.0076;
// Niebla interior: la atmósfera caliente y densa que rodea el agujero por dentro de la ISCO,
// con densidad ∝ exp(−(r − 1)/L). Es un único medio para todos los ángulos: absorbe lo que pasa
// cerca del agujero (las imágenes lensadas del lado lejano y las de orden superior rodean el
// agujero a r ≈ 1.5–3.5 y salen atenuadas; el rayo que llega a la cara cercana nunca baja de su
// propio radio y apenas se atenúa) y brilla con la luz del disco que dispersa, que es lo que llena
// la sombra de crema tostado. Sustituye a la extinción "en el plano", al dobladillo, a la bruma
// por vista y a la corona, que dependían del ángulo de la cámara.
const float L_NIEBLA = 1.15;
const vec3 TINTE_NIEBLA = vec3(1.0, 0.60, 0.28);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Ruido de valor periódico en X para que la coordenada angular no tenga costura.
float ruidoAnular(vec2 uv, float periodo) {
  vec2 i = floor(uv);
  vec2 fr = fract(uv);
  fr = fr * fr * (3.0 - 2.0 * fr);
  float x0 = mod(i.x, periodo);
  float x1 = mod(i.x + 1.0, periodo);
  float a = hash21(vec2(x0, i.y));
  float b = hash21(vec2(x1, i.y));
  float c = hash21(vec2(x0, i.y + 1.0));
  float d = hash21(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}

float fbmAnular(vec2 uv, float periodo) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * ruidoAnular(uv, periodo);
    uv *= 2.0;
    periodo *= 2.0;
    amp *= 0.5;
  }
  return v / 0.875;
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// Ruido de valor 1D con interpolación quíntica: perfiles radiales suaves, sin esquinas.
float ruidoRadial(float x) {
  float i = floor(x);
  float fr = fract(x);
  float u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  return mix(hash11(i), hash11(i + 1.0), u);
}

float fbmRadial(float x) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * ruidoRadial(x);
    x = x * 2.03 + 7.7;
    amp *= 0.5;
  }
  return v / 0.875;
}

// Geodésica nula de Schwarzschild (r_s = 1) en forma cartesiana: d²x/dλ² = -1.5·h²·x/r⁵.
vec3 aceleracionGeodesica(vec3 q, float h2) {
  float r2 = max(dot(q, q), 1e-4);
  return -1.5 * h2 * q / (r2 * r2 * sqrt(r2));
}

// Perigeo EXACTO de la geodésica con parámetro de impacto b (r_s = 1): la raíz mayor de
// r³ − b²·r + b² = 0, en forma trigonométrica. Para b = 3√3/2 (el parámetro crítico) vale 1.5, la
// esfera de fotones; por debajo el rayo cae al agujero. Con él, el anillo de fotones es un
// círculo perfecto en pantalla y no depende de dónde se detuvo la marcha (antes se tomaba el
// radio mínimo muestreado, que temblaba con el paso y quedaba mal cuando el gas de la cara
// cercana absorbía el rayo antes de su perigeo: el anillo salía deforme y recortado).
float perigeo(float b) {
  float arg = clamp(-2.5980762 / max(b, 1e-3), -1.0, 1.0);
  return (2.0 * b / 1.7320508) * cos(acos(arg) / 3.0);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Cielo de fondo: estrellas fijas en la esfera celeste, una por celda de una rejilla 3D sobre la
// dirección (≈ 4π·N² celdas tocan la esfera). Se muestrea con la dirección con la que el rayo
// ESCAPA tras rodear el agujero, así que las estrellas que quedan detrás se estiran en arcos y
// se duplican junto a la sombra (anillo de Einstein) por la misma integración que lensa el disco,
// y su brillo no depende de la vista ni de la exposición del polvo. Cada estrella es una gaussiana
// angular de al menos ~1 px (sin parpadeo subpíxel al mover la cámara); la distribución de brillos
// sigue la ley cúbica del campo de sprites anterior (muchas tenues, un puñado vivas).
const float CELDAS_CIELO = 11.0;
vec3 cielo(vec3 dir) {
  vec3 celda = floor(dir * CELDAS_CIELO);
  vec3 luz = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec3 c = celda + vec3(float(i), float(j), float(k));
        vec3 h = hash33(c + 7.3);
        if (h.x > 0.62) continue;
        vec3 s = normalize(c + 0.5 + (hash33(c + 3.1) - 0.5) * 0.9);
        float ang = sqrt(max(2.0 * (1.0 - dot(dir, s)), 0.0));
        float m = h.y * h.y * h.y;
        float sigma = uAnguloPixel * (0.6 + 1.0 * m);
        float g = exp(-0.5 * ang * ang / (sigma * sigma));
        if (g < 1e-4) continue;
        float temperatura = h.z;
        vec3 col = mix(vec3(1.0, 0.93, 0.80), vec3(0.99, 0.97, 0.93), smoothstep(0.35, 0.75, temperatura));
        col = mix(col, vec3(0.88, 0.93, 1.0), smoothstep(0.9, 1.0, temperatura));
        // Brillo acotado: junto al anillo de Einstein del cielo (3.4 R a 38 unidades) una estrella
        // se estira en un arco tangencial con el mismo brillo de pico, y con picos altos esos
        // arcos se leían como arañazos (pico máximo 0.32).
        luz += col * (0.015 + 0.3 * m * m) * g;
      }
    }
  }
  return luz;
}

// Aproximación de Winitzki (error < 1.3e-4), suficiente para integrar la lámina.
float erfAprox(float x) {
  float x2 = x * x;
  float e = 1.0 - exp(-x2 * (1.2732395 + 0.147 * x2) / (1.0 + 0.147 * x2));
  return sign(x) * sqrt(max(e, 0.0));
}

// ∫ exp(-(s·y)²) ds a lo largo del segmento [y0, y1] recorrido en un paso. Cuando el rayo cruza
// la lámina se resuelve en y (ds = dy/|vy|); si va rasante, la lámina apenas cambia dentro del
// paso y basta el punto medio.
float columnaGaussiana(float y0, float y1, float vy, float paso, float sInv) {
  float dy = abs(y1 - y0);
  if (dy * sInv < 0.02) {
    float ym = 0.5 * (y0 + y1);
    return exp(-ym * ym * sInv * sInv) * paso;
  }
  float integralY = 0.5 * RAIZ_PI / sInv * abs(erfAprox(sInv * y1) - erfAprox(sInv * y0));
  return integralY / max(abs(vy), 1e-4);
}

// El gas se ensancha hacia fuera (escala de altura ∝ r en un disco con soporte de presión).
float ensanche(float r) {
  return 1.0 + 0.08 * (r - R_IN);
}

// Densidad superficial (sin el perfil vertical) y textura del gas en el plano.
float densidadPlano(vec3 p, float r, float suavizado, out float textura) {
  // Borde interno en la ISCO. La densidad superficial no cae a cero ahí: dentro de la ISCO ya no
  // hay órbitas estables y el gas se precipita (región de plunge), cada vez más rápido y por
  // tanto más tenue (Σ ∝ 1/v_r), hasta desaparecer en el horizonte. Por fuera se disuelve entre
  // 9.5 y 12, donde los escombros del campo de polvo toman el relevo.
  float borde = smoothstep(R_IN - 0.2, R_IN + 0.45, r);
  float plunge = 0.45 * exp(-(R_IN - min(r, R_IN)) / 0.55);
  float perfilR = mix(plunge, 1.0, borde) * (1.0 - smoothstep(R_GAS - 2.5, R_GAS, r));
  float rE = max(r, R_IN);

  float ang = atan(p.z, p.x);
  float omega = 0.55 * pow(rE, -1.5);
  // El patrón azimutal gira rígido al ritmo del gas de r ≈ 5 y por encima lleva una cizalla
  // diferencial ACOTADA. Antes la cizalla era la kepleriana sin límite: cada 5 minutos el patrón
  // daba 4 vueltas más en la ISCO que en el borde y el disco acababa dibujando líneas de concha
  // de caracol. Ahora el patrón se muestrea en dos ciclos de cizalla desfasados medio periodo y se
  // funden (flow map): la deformación nunca supera medio periodo, unos 0.8 rad entre la ISCO y
  // r = 6, que es lo que se lee como arcos abiertos hacia atrás y no como espiral apretada.
  const float OMEGA_RIGIDA = 0.55 * 0.0894;
  const float PERIODO_CIZALLA = 24.0;
  float omegaRel = omega - OMEGA_RIGIDA;
  float ciclo1 = mod(uTiempo, PERIODO_CIZALLA);
  float ciclo2 = mod(uTiempo + 0.5 * PERIODO_CIZALLA, PERIODO_CIZALLA);
  float pesoCiclo2 = abs(ciclo1 / PERIODO_CIZALLA * 2.0 - 1.0);
  // El patrón gira en el sentido +tangente (ang creciente): el MISMO en el que se mueve el gas
  // para el beaming Doppler y en el que orbitan los granos de escombros (antes giraba al revés).
  float angRigido = ang - uTiempo * OMEGA_RIGIDA;
  float vueltas1 = (angRigido - (ciclo1 - 0.5 * PERIODO_CIZALLA) * omegaRel) / DOS_PI;
  float vueltas2 = (angRigido - (ciclo2 - 0.5 * PERIODO_CIZALLA) * omegaRel) / DOS_PI;

  // En un disco kepleriano la rotación diferencial borra cualquier estructura azimutal en pocas
  // órbitas: lo que sobrevive son anillos concéntricos de densidad, como en un sistema de anillos
  // planetario. Divisiones anchas (~0.6 u), surcos finos (~0.2 u) y una ondulación casi subpíxel,
  // todos funciones sólo de r. Derivan muy despacio hacia dentro: el gas cae en espiral, los
  // anillos no giran.
  // El borde interno, caliente y turbulento, es liso; los surcos se marcan hacia fuera.
  float marcado = smoothstep(R_IN + 0.5, R_IN + 4.0, r);
  // Serpenteo: los anillos no son círculos perfectos. Un desplazamiento radial lento en azimut,
  // arrastrado por el mismo flujo acotado, convierte los surcos en filamentos que ondulan: de
  // frente son estrías finas y vivas (ni un disco de vinilo ni una espiral ni el remolino de
  // nubes que había antes), y de canto o desde 12–16° se promedian en la banda calibrada. Es la
  // misma textura a cualquier ángulo: nada cambia de golpe al inclinar la cámara.
  float serpenteo = mix(
    fbmAnular(vec2(vueltas1 * 3.0, r * 0.45), 3.0),
    fbmAnular(vec2(vueltas2 * 3.0, r * 0.45 + 5.3), 3.0),
    pesoCiclo2) - 0.5;
  float rSurcos = r + 1.0 * serpenteo * marcado;
  float divisiones = fbmRadial(rSurcos * 1.7 + uTiempo * 0.012);
  float surcos = fbmRadial(rSurcos * 4.5 + 41.0 + uTiempo * 0.02);
  float ondulacion = ruidoRadial(rSurcos * 14.0 + 3.0);
  // Nubes azimutales débiles que sí rotan con el gas: rompen la simetría perfecta y dan vida al
  // disco en movimiento sin llegar a leerse como brazos espirales.
  float nubes = mix(
    fbmAnular(vec2(vueltas1 * 5.0, r * 1.1), 5.0),
    fbmAnular(vec2(vueltas2 * 5.0, r * 1.1 + 3.7), 5.0),
    pesoCiclo2);

  // Cada factor tiene media 1 salvo el primero: la media de la textura (≈ 0.55, la referencia con
  // la que se calibraron KAPPA y uBrillo) no cambia con el radio aunque los surcos se marquen.
  // Desde arriba el disco es ópticamente fino y los surcos se leen directamente en su superficie:
  // se marcan más para que la banda no salga lisa (la referencia elevada los muestra a ±10 %).
  // Las mismas marcas a cualquier ángulo: de frente se ven tal cual; con la cámara baja el rayo
  // cruza la lámina en oblicuo y promedia las estrías finas por sí solo.
  float marcaSurcos = marcado * 0.55;
  float marcaOndulacion = marcado * 0.14;
  float pesoDivisiones = 0.22;
  float texturaAnillos = (0.85 - 0.5 * pesoDivisiones + pesoDivisiones * divisiones)
    * (1.0 + marcaSurcos * (surcos - 0.5))
    * (1.0 + marcaOndulacion * (ondulacion - 0.5));

  textura = texturaAnillos * (0.88 + 0.12 * nubes);
  // Los anillos tienen menos varianza que los filamentos antiguos y el brillo óptico fino
  // depende de E[textura²]: el factor sube de 0.68 a 0.76 para conservar el perfil calibrado.
  textura *= 0.76;
  // La imagen lensada del lado lejano se ve como bruma lisa, no como anillos. El gas en caída
  // libre se estira radialmente y también borra su estructura.
  textura = mix(0.55, textura, min(borde, 1.0 - suavizado));

  // El gas se apila contra la ISCO antes de caer: el borde interno es la zona más densa y
  // caliente, y visto desde arriba es el único anillo que llega a crema.
  float nucleo = 1.0 + 1.1 * exp(-(rE - R_IN) * 0.55);
  float atenuacionRadial = mix(0.5, 1.0, pow(R_IN / rE, 0.7));
  return perfilR * textura * nucleo * atenuacionRadial;
}

vec3 emisionDisco(vec3 p, float r, vec3 v, float textura) {
  float rE = max(r, R_IN);
  float x = R_IN / rE;
  // Meseta hasta ~8 radios y caída después: medido en la referencia, el haz mantiene el pico
  // hasta 200 px del centro y se apaga entre 250 y 350 px. Sin torque en la ISCO el flujo del
  // disco fino se anula justo en el borde (Novikov-Thorne).
  float flujo = pow(x, 0.8) * (1.0 - exp(-(rE - R_IN) * 3.0));
  // El flujo cae hacia fuera (a la mitad entre 3.5 y 9 radios): de canto el haz se apaga hacia
  // las puntas como en la captura 22 (0.97 sRGB en el centro, 0.78 a 3 R) y desde arriba la
  // cara externa pasa de crema a oro sin necesidad de ninguna extinción por vista.
  flujo *= 1.0 - 0.5 * smoothstep(3.5, 9.0, rE);

  // Región de plunge: el gas que cae conserva parte de su calor, pero su luz sale corrida al rojo
  // y diluida (g³ respecto a la ISCO) y se apaga hacia el horizonte. Es el resplandor tenue y
  // ambarino que llena el hueco entre la sombra y el borde interno del disco: el agujero
  // absorbiendo el gas a la vista.
  float g = sqrt(max(0.0, 1.0 - R_HORIZONTE / r)) * 1.2247;
  float dentro = 1.0 - smoothstep(R_IN - 0.4, R_IN + 0.5, r);
  float flujoPlunge = 0.6 * pow(g, 3.0) * exp(-(R_IN - min(r, R_IN)) * 0.5);
  flujo += flujoPlunge * dentro;

  // Gradiente térmico en espacio LINEAL: crema en el borde interno, oro miel y sepia hacia fuera.
  // ACES + gamma sRGB desaturan mucho, así que estos valores son más cálidos de lo que parecen.
  float t = clamp((r - R_IN) / (R_OUT - R_IN), 0.0, 1.0);
  vec3 cInterior = vec3(1.00, 0.84, 0.57);
  vec3 cMedio = vec3(1.00, 0.62, 0.26);
  vec3 cExterior = vec3(0.95, 0.50, 0.18);
  vec3 cBorde = vec3(0.78, 0.38, 0.12);
  vec3 cPlunge = vec3(0.95, 0.30, 0.04);
  vec3 col = mix(cInterior, cMedio, smoothstep(0.0, 0.2, t));
  col = mix(col, cExterior, smoothstep(0.2, 0.6, t));
  col = mix(col, cBorde, smoothstep(0.6, 1.0, t));
  // Corrimiento gravitacional al rojo: cuanto más adentro cae el gas, más ámbar profundo. El
  // bloom del anillo de la ISCO es crema neutro, así que el tono del plunge tiene que ser muy
  // saturado para que el hueco se lea ámbar y no gris.
  col = mix(col, cPlunge, smoothstep(-0.3, 1.0, R_IN - r));

  // Beaming relativista: el gas que se acerca al observador se ve más brillante y más blanco.
  float beta = sqrt(0.5 / r);
  vec3 tangente = normalize(vec3(-p.z, 0.0, p.x));
  float gama = inversesqrt(1.0 - beta * beta);
  float doppler = 1.0 / (gama * (1.0 + beta * dot(tangente, v)));
  // Beaming contenido: en la referencia ambos brazos del haz tienen el mismo brillo y tono.
  float impulso = clamp(pow(doppler, 0.25), 0.8, 1.25);
  col = mix(col, vec3(1.0, 0.90, 0.72), clamp((doppler - 1.0) * 0.4, 0.0, 0.15));
  col = mix(col, vec3(0.85, 0.46, 0.20), clamp((1.0 - doppler) * 0.3, 0.0, 0.1));

  // Visto de frente el disco es ópticamente fino, así que la turbulencia se lee dos veces:
  // en la columna (τ) y en la emisividad. De canto se promedia a lo largo del haz.
  float estructura = 0.7 + 0.6 * textura;
  float redshift = sqrt(max(0.0, 1.0 - R_HORIZONTE / r));
  return col * flujo * impulso * redshift * estructura * uBrillo;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 ojo = uProyInversa * vec4(ndc, 1.0, 1.0);
  vec3 dirVista = normalize(ojo.xyz / ojo.w);
  vec3 ro = uPosCamara;
  vec3 rd = normalize((uCamaraMundo * vec4(dirVista, 0.0)).xyz);

  float b = dot(ro, rd);
  float c = dot(ro, ro) - R_BORDE * R_BORDE;
  float disc = b * b - c;


  vec3 color = vec3(0.0);
  // Transmitancia total (gas + niebla) y sólo del gas (para el anillo de fotones, que nace
  // dentro de la niebla y cuya salida a través de ella es una constante absorbida en uAnillo).
  float T = 1.0;
  float TGas = 1.0;
  // Transmitancia del gas cuando el rayo pasa por su perigeo: lo que tapa al anillo de fotones
  // (el gas que el rayo cruza DESPUÉS de rodear el agujero queda detrás del anillo y no lo tapa).
  float TGasPerigeo = 1.0;
  bool pasoPerigeo = false;
  bool capturado = false;
  bool hayHit = false;
  vec3 pHit = vec3(0.0);
  // Dirección con la que el rayo sale de la esfera de marcha (para el cielo lensado).
  vec3 dirSalida = rd;
  float salioLimpio = 1.0;

  if (disc > 0.0 || c < 0.0) {
    float tIni = (c < 0.0) ? 0.0 : max(-b - sqrt(disc), 0.0);
    float jitter = hash21(gl_FragCoord.xy);
    vec3 p = ro + rd * (tIni + jitter * 0.06);
    vec3 v = rd;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);

    for (int i = 0; i < MAX_PASOS; i++) {
      float r2 = dot(p, p);
      float r = sqrt(r2);

      if (r < R_HORIZONTE) {
        capturado = true;
        pHit = p;
        break;
      }
      if (r > R_BORDE && dot(p, v) > 0.0) {
        dirSalida = normalize(v);
        break;
      }
      // Rayos atrapados junto a la esfera de fotones que agotan los pasos: casi capturados.
      if (i == MAX_PASOS - 1) {
        dirSalida = normalize(v);
        salioLimpio = smoothstep(R_FOTON, R_FOTON * 2.0, r);
      }

      float ay = abs(p.y);
      float ens = ensanche(r);
      float paso = clamp(r * 0.04, 0.05, 0.7);
      // El gas se muestrea también en la región de plunge, hasta casi el horizonte. La lámina
      // cuenta desde que el paso va a entrar en ella (abs(v.y)·paso): un rayo casi perpendicular,
      // como los de la vista cenital, cruzaba la lámina entera dentro de un paso grueso y la
      // muestreaba o no según dónde cayera la rejilla de pasos, lo que cubría el disco de anillos
      // oscuros de aliasing a intervalos regulares.
      bool enDisco = ay < 0.225 * ens + abs(v.y) * paso && r > R_PLUNGE && r < R_GAS + 0.3;
      if (enDisco) {
        paso = min(paso, 0.09 * ens);
      }

      // Runge-Kutta 4 sobre (x, v): cuatro evaluaciones de la aceleración por paso.
      vec3 k1 = aceleracionGeodesica(p, h2);
      vec3 v2 = v + 0.5 * paso * k1;
      vec3 k2 = aceleracionGeodesica(p + 0.5 * paso * v, h2);
      vec3 v3 = v + 0.5 * paso * k2;
      vec3 k3 = aceleracionGeodesica(p + 0.5 * paso * v2, h2);
      vec3 v4 = v + paso * k3;
      vec3 k4 = aceleracionGeodesica(p + paso * v3, h2);
      vec3 pNueva = p + (paso / 6.0) * (v + 2.0 * v2 + 2.0 * v3 + v4);
      vec3 vNueva = v + (paso / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);

      // Niebla interior (ver L_NIEBLA): absorbe y emite a lo largo de todo el paso. Su fuente es
      // la luz del disco que dispersa: constante por dentro de la ISCO (la niebla ve el disco
      // desde dentro) y cayendo con 1/r² hacia fuera, donde el disco queda cada vez más lejos.
      {
        float densNiebla = exp(-(r - R_HORIZONTE) / L_NIEBLA);
        float aNiebla = 1.0 - exp(-uNiebla * densNiebla * paso);
        float iluminacion = min(1.0, 12.25 / r2);
        color += T * uNieblaLuz * iluminacion * TINTE_NIEBLA * aNiebla;
        T *= 1.0 - aNiebla;
      }

      if (enDisco) {
        vec3 pm = 0.5 * (p + pNueva);
        float rm = length(pm);
        // Imágenes de orden superior (rayos que rodean el agujero más de 80°): la referencia
        // las muestra como un filamento tenue pegado a la sombra, no como aros brillantes.
        float deflexion = acos(clamp(dot(normalize(vNueva), rd), -1.0, 1.0));
        float lensado = smoothstep(1.4, 2.2, deflexion);
        float textura;
        float densPlano = densidadPlano(pm, rm, lensado, textura);
        if (densPlano > 0.002) {
          float sNucleo = SIGMA_INV_NUCLEO / ens;
          float sAtmosfera = SIGMA_INV_ATMOSFERA / ens;
          float columna = columnaGaussiana(p.y, pNueva.y, vNueva.y, paso, sNucleo)
            + AMP_ATMOSFERA * columnaGaussiana(p.y, pNueva.y, vNueva.y, paso, sAtmosfera);
          float tau = KAPPA * densPlano * columna;
          float a = 1.0 - exp(-tau);

          vec3 emis = emisionDisco(pm, rm, vNueva, textura);

          color += T * emis * a;
          T *= 1.0 - a;
          TGas *= 1.0 - a;
          if (!hayHit && T < 0.6) {
            hayHit = true;
            pHit = pm;
          }
          if (T < 0.02) {
            if (!pasoPerigeo) TGasPerigeo = TGas;
            break;
          }
        }
      }

      if (!pasoPerigeo && dot(pNueva, vNueva) > 0.0) {
        pasoPerigeo = true;
        TGasPerigeo = TGas;
      }
      v = vNueva;
      p = pNueva;
    }
  }

  if (!capturado) {
    // Cielo de fondo visto a través del gas (T) y lensado por la trayectoria real del rayo.
    color += T * salioLimpio * cielo(dirSalida);
    // Parámetro de impacto efectivo del rayo (conservación de h y de la energía en el potencial
    // −h²/(2r³) del que deriva la aceleración): b² = h²/(1 − h²/r0³).
    float h2Rayo = dot(cross(ro, rd), cross(ro, rd));
    float r0 = length(ro);
    float bRayo = sqrt(h2Rayo / max(1.0 - h2Rayo / (r0 * r0 * r0), 1e-4));
    float dR = perigeo(bRayo) - R_FOTON;
    float dRExt = max(dR, 0.0);
    // Anillo de fotones: filamento dorado nítido y completo en el borde de la sombra (las
    // imágenes de orden superior apiladas). Se ve a través del gas (TGas); su salida a través de
    // la niebla es la misma para todos sus rayos y va incluida en la amplitud.
    // Filamento fino (exp(−20·dR)) y por debajo del umbral del resplandor: en las referencias es
    // una línea, no un aro luminoso.
    float nucleoAnillo = exp(-dRExt * 20.0) * smoothstep(-0.05, 0.01, dR);
    float resplandorAnillo = exp(-dRExt * 6.0) * smoothstep(-0.1, 0.02, dR);
    // El haz lo tapa sólo a medias (en las referencias el filamento sigue viéndose sobre el
    // gas que lo cruza, sin muescas).
    float visibleAnillo = max(TGasPerigeo, 0.45);
    color += visibleAnillo * nucleoAnillo * vec3(1.0, 0.70, 0.36) * uAnillo;
    color += visibleAnillo * resplandorAnillo * vec3(1.0, 0.60, 0.28) * (0.2 * uAnillo);
  }

  // Nivel de negro de película: el fondo de la referencia no es 0 sino ~(7,7,7) sRGB (la
  // captura 22 lee 0.03 a 4 R del agujero).
  color += vec3(0.006);

  float profundidad = 1.0;
  if (hayHit || capturado) {
    vec4 clipH = uVistaProyeccion * vec4(pHit, 1.0);
    profundidad = clamp(clipH.z / clipH.w * 0.5 + 0.5, 0.0, 1.0);
  }
  gl_FragDepth = profundidad;

  // Compresión por luminancia con tope (~1.45): el núcleo del haz llega a crema casi neutro
  // (236,231,211 en la referencia) sin clipar a blanco puro una vez que el bloom y los granos
  // de escombros que lo cruzan suman lo suyo; el resto del gas sigue oro.
  float luminancia = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (luminancia > 0.6) {
    float comprimida = 0.6 + 0.85 * (1.0 - exp(-(luminancia - 0.6) / 0.85));
    color *= comprimida / luminancia;
    // Sobreexposición fotográfica: el gas más brillante pierde saturación hacia crema cálido
    // mientras el resplandor a su alrededor conserva el oro. Desde arriba el viraje empieza
    // antes: en la referencia elevada los flancos del disco (luminancia ~1–1.3 antes de comprimir)
    // ya son crema (0.94, 0.87, 0.73 sRGB), no oro, y sólo la cara cercana externa queda dorada.
    vec3 crema = comprimida * vec3(1.0, 0.93, 0.80);
    color = mix(color, crema, 0.85 * smoothstep(0.7, 1.6, luminancia));
  }
  fragColor = vec4(color, 1.0);
}
`
