import { PARAMETROS_AGUJERO } from '../constantes/parametrosAgujero'

const f = (valor: number): string => valor.toFixed(4)

/**
 * Ray-marching de geodésicas nulas en métrica de Schwarzschild (aproximación
 * pseudo-newtoniana d²x/dt² = -1.5·h²·x/r⁵) con disco de acreción ópticamente grueso,
 * beaming Doppler, corrimiento gravitacional y anillo de fotones.
 *
 * La lámina de gas es mucho más fina que el paso de marcha, así que su profundidad óptica
 * por paso se integra analíticamente (perfil vertical gaussiano → erf) en vez de muestrearse:
 * el disco luce igual de canto que desde arriba y sin granulado.
 */
export const LENTE_GRAVITACIONAL_FRAG = /* glsl */ `
uniform float uTiempo;
uniform mat4 uProyInversa;
uniform mat4 uCamaraMundo;
uniform mat4 uVistaProyeccion;
uniform vec3 uPosCamara;
uniform float uBrillo;
// Nivel de bruma que sobrevive cuando la cámara sube (0 = se apaga como de canto).
uniform float uBrumaElevada;
// Cuánto mira la cámara desde arriba (0 = recorrido de canto, 1 = vista elevada).
uniform float uElevada;
// Fracción de luz que conserva el gas de detrás del agujero en la vista elevada (0.06 calibrado).
uniform float uAtenuacionLejana;
// Cuánto mira la cámara desde el cenit (0 = ≤ 27°, 1 = ≥ 58°): apaga las asimetrías cercano/lejano.
uniform float uCenital;
// Radio donde el gas acaba de fundirse fuera del plano (la vista lo fija; de canto no se usa).
uniform float uRadioGasFin;
// Cuánto pesa el dobladillo de polvo sobre el gas cercano (0 = sin extinción; la vista lo fija).
uniform float uDobladillo;
// Gradiente de la bruma hacia la cara cercana (0 = bruma simétrica; la vista lo fija).
uniform float uBrumaCercana;
// Escala global de la bruma, también con la cámara en el plano (1 = calibración de canto).
uniform float uBrumaEscala;

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
// Dobladillo de escombros que rodea el gas: radio donde se concentra, su escala de altura (la
// misma ley que el campo de polvo, (0.05 + 0.04·r)·√2) y su espesor óptico vertical.
const float R_DOBLADILLO = 10.0;
const float SIGMA_DOBLADILLO = 0.8;
const float TAU_DOBLADILLO = 0.7;
const float SIGMA_INV_NUCLEO = 26.3;
const float SIGMA_INV_ATMOSFERA = 7.89;
const float AMP_ATMOSFERA = 0.0076;

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
  float angRigido = ang + uTiempo * OMEGA_RIGIDA;
  float vueltas1 = (angRigido + (ciclo1 - 0.5 * PERIODO_CIZALLA) * omegaRel) / DOS_PI;
  float vueltas2 = (angRigido + (ciclo2 - 0.5 * PERIODO_CIZALLA) * omegaRel) / DOS_PI;

  // En un disco kepleriano la rotación diferencial borra cualquier estructura azimutal en pocas
  // órbitas: lo que sobrevive son anillos concéntricos de densidad, como en un sistema de anillos
  // planetario. Divisiones anchas (~0.6 u), surcos finos (~0.2 u) y una ondulación casi subpíxel,
  // todos funciones sólo de r. Derivan muy despacio hacia dentro: el gas cae en espiral, los
  // anillos no giran.
  float divisiones = fbmRadial(r * 1.7 + uTiempo * 0.012);
  float surcos = fbmRadial(r * 4.5 + 41.0 + uTiempo * 0.02);
  float ondulacion = ruidoRadial(r * 14.0 + 3.0);
  // El borde interno, caliente y turbulento, es liso; los surcos se marcan hacia fuera.
  float marcado = smoothstep(R_IN + 0.5, R_IN + 4.0, r);
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
  float marcaSurcos = marcado * mix(0.22, 0.42, uElevada);
  float marcaOndulacion = marcado * mix(0.06, 0.12, uElevada);
  float texturaAnillos = (0.70 + 0.30 * divisiones)
    * (1.0 + marcaSurcos * (surcos - 0.5))
    * (1.0 + marcaOndulacion * (ondulacion - 0.5));

  // Desde el cenit los anillos concéntricos se leen como un disco de vinilo. Un disco real visto
  // de frente es turbulento: nubes de todos los tamaños que la rotación diferencial estira en
  // arcos abiertos hacia atrás (~0.5 vueltas de retraso entre la ISCO y el borde), sin líneas
  // limpias. El ruido se deforma consigo mismo (domain warp) para que sus celdas no queden en
  // filas radiales, que es lo que vuelve a dibujar anillos; y el patrón gira rígido con el gas de
  // r ≈ 5 para no enrollarse sin límite.
  float vueltasRigidas = angRigido / DOS_PI;
  float arrastre = 0.5 * log(rE / R_IN);
  vec2 uvTurb = vec2((vueltasRigidas - arrastre) * 20.0, rE * 1.25);
  vec2 deformacion = vec2(
    fbmAnular(uvTurb * 0.5 + vec2(3.1, 7.7), 10.0),
    fbmAnular(uvTurb * 0.5 + vec2(11.3, 2.9), 10.0)) - 0.5;
  uvTurb += deformacion * vec2(2.2, 1.4);
  float nubesGrandes = fbmAnular(uvTurb, 20.0);
  float nubesFinas = fbmAnular(uvTurb * vec2(2.0, 2.4) + vec2(0.0, 5.0), 40.0);
  // Onda de densidad de dos brazos (modo m = 2, el más común en discos reales): abierta, ~0.7
  // vueltas de arrollamiento entre la ISCO y el borde, y con velocidad de patrón propia, más
  // lenta que el gas, como corresponde a una onda y no a materia.
  float brazos = 0.5 + 0.5 * cos(2.0 * (ang + uTiempo * OMEGA_RIGIDA * 0.6) - 3.2 * log(rE / R_IN));
  float texturaTurbulenta = (0.5 + 0.5 * nubesGrandes) * (0.8 + 0.2 * nubesFinas) * (0.82 + 0.36 * brazos);

  textura = mix(texturaAnillos, texturaTurbulenta, uCenital) * (0.88 + 0.12 * nubes);
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
  // De canto la meseta de flujo hasta ~8 radios es lo que mantiene el haz encendido en toda su
  // longitud, y desde arriba se conserva (los flancos de la referencia siguen en crema hasta ~8
  // radios). Lo que cambia desde arriba es el final: el gas de 9 → 11 se funde antes, porque la
  // banda de la referencia elevada acaba en punta a ~10 radios y de ahí en adelante sólo
  // continúan los escombros.
  // Fundido largo (6 → 10.2): con la compresión de luminancia, un fundido corto seguía leyéndose
  // brillante hasta su final; con éste el perfil a lo largo del eje mayor calca el de la
  // referencia (0.87 a 7 radios, 0.66 a 9, 0.47 a 10, 0.28 a 11).
  float exposicion = mix(1.0, 1.0 - smoothstep(uRadioGasFin - 4.2, uRadioGasFin, rE), uElevada);
  // De frente, sin el camino rasante que de canto enciende todo el haz, el brillo superficial
  // cae hacia fuera como en un disco real: el anillo interno domina y el borde queda en sepia.
  exposicion *= mix(1.0, 0.35 + 0.65 * pow(R_IN / rE, 1.3), uCenital);
  return col * flujo * impulso * redshift * estructura * uBrillo * exposicion;
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

  // Cuánto está la cámara dentro del plano del gas: sólo entonces el lado lejano se ve a través
  // de la atmósfera del propio disco y sale extinguido a bruma sepia.
  // Desde arriba esta extinción rasante se apaga del todo: el lado lejano lo gobiernan entonces
  // uAtenuacionLejana (arcos) y el dobladillo de polvo, y los flancos deben quedar intactos (su
  // única ventaja sobre la cara cercana es el camino rasante, ×1.4, que es justo lo que los lleva
  // a crema en la referencia).
  float enPlano = (1.0 - smoothstep(0.04, 0.35, abs(ro.y) / length(ro))) * (1.0 - uElevada);
  vec2 dirCamaraPlano = length(ro.xz) > 1e-3 ? normalize(ro.xz) : vec2(1.0, 0.0);

  vec3 color = vec3(0.0);
  float T = 1.0;
  float minR = length(ro + rd * max(-b, 0.0));
  bool capturado = false;
  bool hayHit = false;
  vec3 pHit = vec3(0.0);

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
      minR = min(minR, r);

      if (r < R_HORIZONTE) {
        capturado = true;
        pHit = p;
        break;
      }
      if (r > R_BORDE && dot(p, v) > 0.0) {
        break;
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

      vec3 acel = -1.5 * h2 * p / (r2 * r2 * r);
      vec3 vNueva = v + acel * paso;
      vec3 pNueva = p + vNueva * paso;

      if (enDisco) {
        vec3 pm = 0.5 * (p + pNueva);
        float rm = length(pm);
        // Imágenes de orden superior (rayos que rodean el agujero más de 80°): la referencia
        // las muestra como un filamento tenue pegado a la sombra, no como aros brillantes.
        float deflexion = acos(clamp(dot(normalize(vNueva), rd), -1.0, 1.0));
        float lensado = smoothstep(1.4, 2.2, deflexion);
        // Lado lejano visto con la cámara en el plano: su luz atraviesa la atmósfera del propio
        // disco y llega extinguida a bruma sepia lisa, sin filamentos.
        float haciaCamara = dot(normalize(pm.xz), dirCamaraPlano);
        float ladoCercano = smoothstep(-0.3, 0.5, haciaCamara);
        float lejano = (1.0 - ladoCercano) * enPlano;
        // Sólo el gas que queda de verdad detrás del agujero (no los flancos, que son imagen
        // directa y en la referencia elevada siguen saturados a crema hasta ±7.7 radios: allí el
        // camino rasante por el gas es 1.4 veces el de la cara cercana y esa es toda su ventaja,
        // así que cualquier extinción que se cuele en los flancos la anula).
        float lejanoPuro = 1.0 - smoothstep(-0.95, -0.45, haciaCamara);
        float textura;
        float densPlano = densidadPlano(pm, rm, max(lensado, lejano), textura);
        if (densPlano > 0.002) {
          float sNucleo = SIGMA_INV_NUCLEO / ens;
          float sAtmosfera = SIGMA_INV_ATMOSFERA / ens;
          float columna = columnaGaussiana(p.y, pNueva.y, vNueva.y, paso, sNucleo)
            + AMP_ATMOSFERA * columnaGaussiana(p.y, pNueva.y, vNueva.y, paso, sAtmosfera);
          // La imagen lensada no oculta lo que hay detrás como el gas directo: si absorbiera
          // igual, el anillo de fotones saldría más oscuro arriba que abajo.
          float tau = KAPPA * densPlano * columna * mix(1.0, 0.25, lensado);
          float a = 1.0 - exp(-tau);

          vec3 emis = emisionDisco(pm, rm, vNueva, textura);
          float factorLente = mix(1.0, 0.25, lensado);
          // Extinción por el dobladillo de polvo (los escombros densos de r ≈ 9–13 que rodean el
          // gas). Con la cámara baja, el rayo que llega al gas de la cara cercana lo cruza a poca
          // altura: cuanto más externo es el gas, más bajo pasa y más se apaga. El de la ISCO se
          // ve por encima del dobladillo y sigue en crema; los flancos lo esquivan (el rayo pasa
          // 2 σ por encima) y por eso en la referencia elevada saturan hasta ~8 radios mientras la
          // cara cercana pasa a oro a partir de 6. De canto no se aplica: ahí la extinción rasante
          // ya la modela enPlano.
          float alturaCruce = abs(ro.y) * max(R_DOBLADILLO - rm, 0.0) / max(length(ro.xz) - rm, 1.0);
          float tauDobladillo = TAU_DOBLADILLO * uDobladillo * exp(-0.5 * alturaCruce * alturaCruce / (SIGMA_DOBLADILLO * SIGMA_DOBLADILLO));
          // Sólo en el sector que mira a la cámara: el rayo que llega a un flanco pasa 2 σ por
          // encima del dobladillo y no debe atenuarse (la referencia mantiene los flancos en
          // crema hasta ±7.7 radios).
          float sectorCercano = smoothstep(0.2, 0.8, haciaCamara);
          float extincionDobladillo = exp(-tauDobladillo * sectorCercano * uElevada * (1.0 - uCenital));
          // Desde arriba la luz del lado lejano llega rasante a través de la banda de polvo del
          // plano antes de doblarse hacia la cámara: en la referencia elevada los arcos lucen a
          // 0.4 sRGB frente a los 0.95 de la cara cercana, con sus surcos todavía visibles.
          float atenuacionLejana = mix(1.0, uAtenuacionLejana, uElevada * lejanoPuro * (1.0 - uCenital));
          // El gas lejano más externo atraviesa más atmósfera antes de llegar: su imagen se
          // apaga gradualmente en vez de cortar el halo de bruma con un borde.
          float caminoLejano = 1.0 - 0.8 * smoothstep(4.0, R_GAS, rm);
          vec3 extincion = mix(vec3(1.0), vec3(0.02, 0.012, 0.005) * caminoLejano, lejano);
          emis *= factorLente * extincion * atenuacionLejana * extincionDobladillo;

          color += T * emis * a;
          T *= 1.0 - a;
          if (!hayHit && T < 0.6) {
            hayHit = true;
            pHit = pm;
          }
          if (T < 0.02) break;
        }
      }

      v = vNueva;
      p = pNueva;
    }
  }

  if (!capturado) {
    float dR = minR - R_FOTON;
    float dRExt = max(dR, 0.0);
    // Anillo de fotones: filamento dorado nítido y completo en el borde de la sombra.
    // Luminancia pico ≈ 1.0, justo bajo el umbral del bloom (1.05): el filamento no se emborrona.
    float nucleoAnillo = exp(-dRExt * 14.0) * smoothstep(-0.06, 0.01, dR);
    float resplandorAnillo = exp(-dRExt * 6.0) * smoothstep(-0.1, 0.02, dR);
    color += T * nucleoAnillo * vec3(1.0, 0.72, 0.40) * 1.3;
    color += T * resplandorAnillo * vec3(1.0, 0.60, 0.28) * 0.35;
  }

  // Bruma sepia: polvo tenue del plano del disco iluminado por el gas. Su espesor óptico es el
  // camino del rayo por esa capa: enorme para rayos rasantes (cámara en el plano), nulo cuando se
  // mira el agujero desde arriba, donde la sombra queda negra.
  float caminoCapa = clamp(8.0 / max(abs(rd.y), 0.02), 0.0, 30.0) / 30.0;
  float capaPolvo = caminoCapa * caminoCapa * caminoCapa;
  // La capa es fina: su espesor óptico cae como 1/sin θ con la elevación de la cámara. A 0.5°
  // (cámara del scroll) el camino es ~100 veces el espesor; a 15° apenas 4. La sombra vuelve a
  // ser negra en cuanto la cámara sale del plano, como en las vistas oblicuas de la referencia.
  float elevacionCamara = abs(ro.y) / length(ro);
  // Desde arriba la capa rasante se apaga, pero el resplandor que llena la sombra no: son las
  // imágenes de orden superior del disco apiladas contra el anillo de fotones, que en la vista
  // elevada de referencia dejan el interior de la sombra en crema (0.65 sRGB) y no en negro.
  capaPolvo *= max(1.0 - smoothstep(0.03, 0.28, elevacionCamara), uBrumaElevada * (1.0 - uCenital));
  // Se parametriza por el parámetro de impacto para que sea un círculo limpio en pantalla.
  float bImpacto = length(cross(ro, rd));
  float rho = bImpacto / R_SOMBRA;
  float fuera = max(rho - 1.4, 0.0);
  float anillosBruma = 0.94 + 0.06 * sin(rho * 30.0 + 1.7) * sin(rho * 11.0);
  // Meseta hasta 1.4 R, gaussiana corta y cola exponencial: calibrado contra la referencia
  // (sRGB medido: 1.15 R ≈ 104, 1.4 R ≈ 97, 1.7 R ≈ 63, 2.2 R ≈ 26, 2.6 R ≈ 20).
  // Desde arriba la cola exponencial pesa menos: el halo exterior lo pone el bloom.
  float perfilBruma = exp(-pow(fuera / 0.33, 2.0)) + mix(0.42, 0.10, uElevada) * exp(-fuera / 1.0);
  // Dentro de la sombra (rho < 1), arriba y abajo del haz, la referencia mide 139/99/63: la imagen
  // lensada del lado lejano se apila ahí, ~1.8 veces más brillante que a 1.15 R.
  // Desde arriba el apilamiento dentro de la sombra pesa más: la referencia elevada mide 0.83
  // en el centro frente a 0.55 junto al anillo.
  float apilamientoCanto = 0.75 * (1.0 - smoothstep(0.2, 1.05, rho));
  float apilamientoElevado = 2.3 * (1.0 - smoothstep(0.0, 0.95, rho));
  perfilBruma *= 1.0 + mix(apilamientoCanto, apilamientoElevado, uElevada);
  float segundoAnillo = exp(-pow((rho - 1.30) / 0.045, 2.0)) * step(1.0, rho);
  // Con la cámara alta y cerca, la referencia mide dentro de la sombra un gradiente cálido que
  // sube hacia la cara cercana (0.20 arriba → 0.61 en el centro → 0.76 abajo): es la luz de la
  // cara cercana dispersada por el polvo que hay entre ella y la cámara. Se pesa por dónde cruza
  // el rayo el plano del disco: antes del agujero (cara cercana, rayos que apuntan bajo el centro)
  // pesa más; detrás, menos.
  float sCruce = (rd.y < -1e-4) ? -ro.y / rd.y : 1e9;
  float cercania = clamp((length(ro) - sCruce) / (0.5 * length(ro)), -1.0, 1.0);
  float gradienteCercano = mix(1.0, clamp(0.55 + 1.3 * cercania, 0.15, 1.6), uElevada * uBrumaCercana);
  float bruma = (0.070 * perfilBruma * anillosBruma + 0.02 * segundoAnillo) * capaPolvo * gradienteCercano * uBrumaEscala;
  // De canto la bruma es sepia saturada; desde arriba la referencia la mide crema tostado
  // (0.78, 0.63, 0.44 sRGB), así que el tono se abre hacia el ámbar claro.
  color += bruma * mix(vec3(1.0, 0.50, 0.17), vec3(1.0, 0.58, 0.27), uElevada);
  // Nivel de negro de película: el fondo de la referencia no es 0 sino (8,8,8) sRGB.
  color += vec3(0.009);

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
    float inicioCrema = mix(0.8, 0.65, uElevada);
    float plenoCrema = mix(1.8, 1.5, uElevada);
    color = mix(color, crema, 0.9 * smoothstep(inicioCrema, plenoCrema, luminancia));
  }
  fragColor = vec4(color, 1.0);
}
`
