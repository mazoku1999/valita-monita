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
// Multiplicador de la envoltura luminosa (1; sólo para calibrar desde la URL en desarrollo).
uniform float uCorona;

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
// KAPPA 2.4: con la ganancia única (3.6) la cara cercana a 12° necesita τ ≈ 0.7 para llegar a
// crema; de canto (τ ≈ 35) satura igual y de frente (τ ≈ 0.16) el disco queda en oro.
const float KAPPA = 2.4;
const float SIGMA_INV_NUCLEO = 26.3;
const float SIGMA_INV_ATMOSFERA = 7.89;
const float AMP_ATMOSFERA = 0.0076;
// Física del disco, la misma a cualquier ángulo y distancia.
// Temperatura de cuerpo negro T ∝ r^-0.31 desde 6200 K en la ISCO: reproduce la paleta calibrada
// (crema en el borde interno, oro miel a 5 radios, sepia en el borde) y se desplaza con el factor
// g (Doppler y gravitatorio): el brazo que se acerca es más blanco, el que se aleja más ámbar.
const float T_ISCO = 6200.0;
const float EXP_TEMPERATURA = 0.31;
const float EXP_TEMP_G = 0.6;
// Intensidad ∝ D^2.5 (física: g³–g⁴; la captura 22 lee ×2.5 entre los dos brazos a 3 R tras la
// compresión, que aplana al brazo saturado).
const float EXP_DOPPLER = 2.5;
// Borde exterior único: el gas se apaga a la mitad entre 8 y 11 radios (antes un fundido por
// vista de 8.5, 10.2 o ninguno, y otro sólo de canto); el resto lo hace la densidad (9.5 → 12).
const float R_FUNDIDO_INI = 8.0;
const float R_FUNDIDO_FIN = 11.0;
const float FUNDIDO = 0.5;
// Región de caída (r < 3.1): gas que se precipita, ópticamente grueso y enrojecedor. Absorbe la
// luz que pasa por detrás del agujero (los arcos lensados del lado lejano y las imágenes de orden
// superior) desde cualquier ángulo; antes eso lo hacían una extinción sólo de canto, una
// atenuación por vista de los arcos y un dobladillo de polvo sólo desde arriba.
const float R_ABSORCION = 3.1;
const float K_ABSORCION = 2.0;
// Envoltura luminosa del disco: gas y polvo fino que lo rodean con una escala de altura de ~1
// unidad (treinta veces la lámina) y dispersan hacia delante la luz del disco interior (fase
// Henyey-Greenstein, g 0.4). Es UNA sola capa para todas las vistas: con la cámara en el plano
// el rayo la recorre a lo largo (decenas de unidades) y el haz queda envuelto en el resplandor
// ancho y suave de la captura 22 (FWHM ≈ 0.85 R); a 12–16° la columna es 2–3 veces más corta
// y se lee como la falda bajo la cara cercana de la referencia elevada; desde el cenit apenas
// pesa. Calibrada a 38 unidades contra la captura 22 (0.16 la calcaba; 0.12 reparte mejor el
// coste de ser una sola capa: las vistas cercanas, que en las capturas del usuario son secas,
// quedan con menos bruma).
const float R_CORONA = 15.0;
const float H_CORONA_0 = 0.78;
const float H_CORONA_1 = 0.08;
const float G_CORONA = 0.4;
const float AMP_CORONA = 0.14;
const vec3 CUERPO_NEGRO[13] = vec3[13](
  vec3(1.0000, 0.0570, 0.0003),
  vec3(1.0000, 0.1202, 0.0048),
  vec3(1.0000, 0.2022, 0.0176),
  vec3(1.0000, 0.2967, 0.0482),
  vec3(1.0000, 0.3979, 0.1055),
  vec3(1.0000, 0.5010, 0.1963),
  vec3(1.0000, 0.6025, 0.3238),
  vec3(1.0000, 0.6996, 0.4885),
  vec3(1.0000, 0.7912, 0.6871),
  vec3(1.0000, 0.8765, 0.9159),
  vec3(0.8558, 0.8174, 1.0000),
  vec3(0.6957, 0.7145, 1.0000),
  vec3(0.5827, 0.6360, 1.0000)
);

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

// Color de cuerpo negro (lineal, canal máximo = 1) por interpolación de la tabla de Mitchell
// Charity entre 2000 y 8000 K.
vec3 cuerpoNegro(float temperatura) {
  float u = clamp((temperatura - 2000.0) / 500.0, 0.0, 11.999);
  int i = int(u);
  return mix(CUERPO_NEGRO[i], CUERPO_NEGRO[i + 1], fract(u));
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
  // Marcas únicas a cualquier ángulo (de canto el camino rasante las promedia solo): estrías
  // finas a ±0.5, ondulación a ±0.2 y bandas anchas a ±0.11 alrededor de la media, que no cambia.
  float marcaSurcos = marcado * 0.5;
  float marcaOndulacion = marcado * 0.2;
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
  // Flujo del disco fino sin par en la ISCO (Novikov-Thorne), ∝ r^-0.8: con la ganancia única
  // (2.6) y el Doppler, el brazo que se aleja de la captura 22 sigue justo esta ley (luminancia
  // 0.9 → 0.62 → 0.51 → 0.37 a 1, 1.5, 2 y 3 R) y el que se acerca satura a crema hasta 3 R.
  float flujo = pow(R_IN / rE, 0.8) * (1.0 - exp(-(rE - R_IN) * 3.0));
  flujo *= 1.0 - FUNDIDO * smoothstep(R_FUNDIDO_INI, R_FUNDIDO_FIN, rE);

  // Corrimiento gravitatorio en el punto de emisión.
  float gGrav = sqrt(max(0.0, 1.0 - R_HORIZONTE / r));

  // Región de plunge: el gas que cae conserva parte de su calor, pero su luz sale corrida al rojo
  // y diluida (g³ respecto a la ISCO) y se apaga hacia el horizonte. Es el resplandor tenue y
  // ambarino que llena el hueco entre la sombra y el borde interno del disco.
  float dentro = 1.0 - smoothstep(R_IN - 0.4, R_IN + 0.5, r);
  float flujoPlunge = 0.6 * pow(gGrav * 1.2247, 3.0) * exp(-(R_IN - min(r, R_IN)) * 0.5);
  flujo += flujoPlunge * dentro;

  // Factor Doppler de la órbita kepleriana (v = √(rs/2r)) respecto al fotón que sale hacia la
  // cámara (viaja en -v): D = 1 / (γ (1 − β·n)).
  float beta = sqrt(0.5 / rE);
  vec3 tangente = normalize(vec3(-p.z, 0.0, p.x));
  float gama = inversesqrt(1.0 - beta * beta);
  float gDoppler = 1.0 / (gama * (1.0 + beta * dot(tangente, v)));
  // Intensidad: D^1.7 por el brazo que se acerca o se aleja, y el corrimiento gravitatorio una
  // vez (el perfil de flujo se calibró con él).
  float impulso = pow(gDoppler, EXP_DOPPLER) * gGrav;

  // Color: cuerpo negro a la temperatura local desplazada por g (normalizado a la ISCO sin
  // Doppler, g = 0.8165); dentro de la ISCO vira al ámbar profundo del gas que cae.
  float g = gDoppler * gGrav;
  float temperatura = T_ISCO * pow(R_IN / rE, EXP_TEMPERATURA) * pow(g / 0.8165, EXP_TEMP_G);
  vec3 col = cuerpoNegro(temperatura);
  col = mix(col, vec3(0.95, 0.30, 0.04), smoothstep(-0.3, 1.0, R_IN - r));

  // Visto de frente el disco es ópticamente fino, así que la turbulencia se lee dos veces:
  // en la columna (τ) y en la emisividad. De canto se promedia a lo largo del haz.
  float estructura = 0.7 + 0.6 * textura;
  return col * flujo * impulso * estructura * uBrillo;
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
  // Transmitancia por canal: la región de caída enrojece lo que absorbe.
  vec3 T = vec3(1.0);
  // Transmitancia sólo del gas: el anillo de fotones se oculta tras el haz, pero no lo apaga
  // la región de caída (sus rayos la rozan por definición).
  float TGas = 1.0;
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

      // Envoltura luminosa (ver las constantes): emisividad por unidad de camino, con el perfil
      // radial del flujo del disco, la caída exponencial en altura y la fase hacia delante.
      if (r < R_CORONA) {
        float hCorona = H_CORONA_0 + H_CORONA_1 * r;
        float perfilCorona = pow(R_IN / max(r, R_IN), 0.9) * smoothstep(R_IN, R_IN + 1.5, r)
          * (1.0 - smoothstep(R_GAS - 1.0, R_CORONA, r));
        float mu = -dot(p, v) / max(r * length(v), 1e-4);
        float fase = pow((1.0 - G_CORONA) * (1.0 - G_CORONA) / (1.0 + G_CORONA * G_CORONA - 2.0 * G_CORONA * mu), 1.5);
        float emisCorona = AMP_CORONA * uCorona * perfilCorona * exp(-ay / hCorona) * fase;
        vec3 tinteCorona = mix(vec3(1.0, 0.82, 0.58), vec3(1.0, 0.62, 0.30), smoothstep(R_IN, 10.0, r));
        color += T * emisCorona * tinteCorona * paso;
      }

      // Región de caída: absorbe (y enrojece) la luz que viene de detrás; sólo la cruzan los rayos
      // que rodean el agujero (arcos del lado lejano, imágenes de orden superior), nunca los que
      // van a la cara cercana del disco (r ≥ 3.1).
      if (r < R_ABSORCION) {
        float densAbsorcion = (1.0 - smoothstep(2.4, R_ABSORCION, r)) * smoothstep(R_HORIZONTE, 1.4, r);
        T *= exp(-K_ABSORCION * densAbsorcion * paso * vec3(0.55, 0.85, 1.25));
      }

      if (enDisco) {
        vec3 pm = 0.5 * (p + pNueva);
        float rm = length(pm);
        // Imágenes lensadas del lado lejano: en todas las referencias del usuario (de canto, a
        // 12.6° y desde abajo) los arcos que doblan sobre el agujero lucen a ~0.4 de la cara
        // cercana, y las imágenes de orden superior (más de 80° de giro) son un filamento tenue
        // pegado a la sombra. Se atenúan por el ángulo que ha girado el rayo antes de llegar al
        // gas, y sólo si el gas queda MÁS ALLÁ del punto en que el rayo pasó junto al agujero (el
        // rayo ya se aleja de él): es una propiedad del propio rayo, idéntica desde cualquier
        // vista, y no toca la cara cercana ni los flancos, que se alcanzan antes de ese punto.
        float deflexion = acos(clamp(dot(normalize(vNueva), rd), -1.0, 1.0));
        float lensado = smoothstep(1.4, 2.2, deflexion);
        float alejandose = smoothstep(-0.15, 0.15, dot(pm, vNueva) / max(rm * length(vNueva), 1e-4));
        float atenuacionArcos = mix(1.0, 0.05, smoothstep(0.25, 0.9, deflexion) * alejandose);
        float textura;
        float densPlano = densidadPlano(pm, rm, lensado, textura);
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
          emis *= factorLente * atenuacionArcos;

          color += T * emis * a;
          T *= 1.0 - a;
          TGas *= 1.0 - a;
          if (!hayHit && T.g < 0.6) {
            hayHit = true;
            pHit = pm;
          }
          if (T.g < 0.02) break;
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
    color += TGas * nucleoAnillo * vec3(1.0, 0.72, 0.40) * 1.3;
    color += TGas * resplandorAnillo * vec3(1.0, 0.60, 0.28) * 0.35;
  }

  // Bruma sepia: polvo tenue del plano del disco iluminado por el gas. Su espesor óptico es el
  // camino del rayo por esa capa: enorme para rayos rasantes (cámara en el plano), nulo cuando se
  // mira el agujero desde arriba, donde la sombra queda negra.
  float caminoCapa = clamp(8.0 / max(abs(rd.y), 0.02), 0.0, 30.0) / 30.0;
  float capaPolvo = caminoCapa * caminoCapa * caminoCapa;
  // La capa es fina: su espesor óptico cae como 1/sin θ con la inclinación de cada rayo (ya está
  // en caminoCapa): con la cámara en el plano el camino es ~100 veces el espesor; a 15° apenas
  // 4; desde el cenit la sombra queda negra. Sin puertas por vista: el resplandor que llena la
  // sombra desde arriba lo pone el bloom del gas.
  // Se parametriza por el parámetro de impacto para que sea un círculo limpio en pantalla.
  float bImpacto = length(cross(ro, rd));
  float rho = bImpacto / R_SOMBRA;
  float fuera = max(rho - 1.4, 0.0);
  float anillosBruma = 0.965 + 0.035 * sin(rho * 30.0 + 1.7) * sin(rho * 11.0);
  // Meseta hasta 1.4 R, gaussiana corta y cola exponencial: calibrado contra la referencia
  // (sRGB medido: 1.15 R ≈ 104, 1.4 R ≈ 97, 1.7 R ≈ 63, 2.2 R ≈ 26, 2.6 R ≈ 20).
  // Desde arriba la cola exponencial pesa menos: el halo exterior lo pone el bloom.
  // Cola de canto calibrada con la captura 22 (medianas radiales fuera del haz: 0.20 sRGB a
  // 2.1 R, 0.14 a 2.6 R, 0.09 a 3.1 R, 0.03 a 4 R); dentro de 2 R la corona pone el resto.
  float perfilBruma = exp(-pow(fuera / 0.33, 2.0)) + 0.46 * exp(-fuera / 1.0);
  // Dentro de la sombra (rho < 1), arriba y abajo del haz, la referencia mide 139/99/63: la imagen
  // lensada del lado lejano se apila ahí, ~1.8 veces más brillante que a 1.15 R.
  // Desde arriba el apilamiento dentro de la sombra pesa más: la referencia elevada mide 0.83
  // en el centro frente a 0.55 junto al anillo.
  // (Con la corona, que ya llena la sombra con la luz dispersada delante del agujero, el
  // apilamiento de canto baja de 0.75 a 0.4: la captura 22 lee 0.66 sRGB bajo el haz a 0.4 R.)
  // Apilamiento dentro de la sombra (imágenes de orden superior contra el anillo de fotones):
  // 0.45 deja la sombra a 12° en ~0.6 sRGB (referencia 0.65) y de canto en ~0.7 (captura 22: 0.66).
  perfilBruma *= 1.0 + 0.45 * (1.0 - smoothstep(0.2, 1.05, rho));
  float segundoAnillo = exp(-pow((rho - 1.30) / 0.045, 2.0)) * step(1.0, rho);
  float bruma = (0.070 * perfilBruma * anillosBruma + 0.02 * segundoAnillo) * capaPolvo;
  // De canto la bruma es sepia saturada; desde arriba la referencia la mide crema tostado
  // (0.78, 0.63, 0.44 sRGB), así que el tono se abre hacia el ámbar claro.
  // De canto la captura 22 mide el resplandor en oro pálido (0.72, 0.57, 0.38 sRGB a 0.8 R),
  // menos saturado que el sepia original.
  color += bruma * vec3(1.0, 0.56, 0.24);
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
    color = mix(color, crema, 0.8 * smoothstep(0.72, 1.6, luminancia));
  }
  fragColor = vec4(color, 1.0);
}
`
