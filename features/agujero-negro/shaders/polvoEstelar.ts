import { CORRIMIENTO_OBSERVADOR_GLSL } from './corrimientoObservador'
import { LENTE_DELGADA_GLSL } from './lenteDelgada'

export const POLVO_ESTELAR_VERT = /* glsl */ `
uniform float uTiempo;
uniform float uEscalaPuntos;
uniform float uPixelRatio;
uniform float uFoco;
uniform float uApertura;
uniform float uRadioSombra;
// Tamaño máximo de un grano (px, ya multiplicado por el pixel ratio).
uniform float uTamMax;
// Opacidad de la niebla interior (la misma del shader de la lente): apaga los granos que se ven a
// través de ella, detrás del agujero.
uniform float uNiebla;
// Cámara en caída (ver utils/observadorCaida.ts): energía E y velocidad propia K de su geodésica,
// y el corrimiento del borde de la sombra al que se ajusta la exposición.
uniform vec2 uObservador;
uniform float uGReferencia;

attribute float aTamano;
attribute float aTono;
attribute float aBrillo;
attribute float aFase;
attribute float aOrbita;

varying float vTono;
varying float vFase;
varying float vAlfa;
varying float vBokeh;
varying float vEstrella;
varying float vBrilloBase;
varying float vTamPx;
varying float vLejania;
varying float vCorrimiento;

${LENTE_DELGADA_GLSL}
${CORRIMIENTO_OBSERVADOR_GLSL}

void main() {
  vec3 pos = position;
  float esEstrella = 1.0 - step(0.5, aOrbita);

  if (aOrbita > 0.5) {
    pos = orbitar(pos, uTiempo, aFase);
  }

  float magnificacion;
  float bAparente;
  float detras;
  vec3 posAparente = lensar(pos, cameraPosition, magnificacion, bAparente, detras);
  // Cámara en caída: la dirección aparente del grano se inclina hacia la de avance (aberración con
  // la velocidad respecto al observador quieto, v = K/E) y su luz llega con g = 1/(E + K·n·r̂), la
  // misma ley que el gas; al acercarse al horizonte los anillos de escombros que rodean la cámara
  // se ven apretados alrededor de la sombra, más brillantes y más azules.
  vCorrimiento = 1.0;
  if (uObservador.y > 0.0) {
    vec3 haciaGrano = posAparente - cameraPosition;
    float distanciaGrano = length(haciaGrano);
    vec3 n = haciaGrano / max(distanciaGrano, 1e-4);
    vec3 avance = -normalize(cameraPosition);
    float v = min(uObservador.y / uObservador.x, 0.999);
    float gamma = inversesqrt(1.0 - v * v);
    float cosAvance = dot(n, avance);
    vec3 nAberrada = normalize(n + ((gamma - 1.0) * cosAvance + gamma * v) * avance);
    posAparente = cameraPosition + nAberrada * distanciaGrano;
    vCorrimiento = 1.0 / max(uObservador.x - uObservador.y * dot(nAberrada, avance), 1e-3);
  }
  float captura = 1.0 - smoothstep(uRadioSombra, uRadioSombra + 0.3, bAparente);
  float visible = 1.0 - captura * detras;
  // Niebla interior (la misma del shader de la lente, densidad ∝ exp(−(r − 1))): un grano que
  // queda DETRÁS del agujero se ve a través de ella con el parámetro de impacto de su rayo; la
  // columna de niebla es ≈ 0.48·exp(−(b − 3)/0.95) (L = 0.9) (función de Bessel K1 ajustada). Así las
  // chispas que rodean la sombra por detrás salen apagadas a cualquier ángulo, igual que los
  // arcos lensados del gas.
  float columnaNiebla = 0.48 * exp(-(bAparente - 3.0) / 0.95);
  visible *= exp(-uNiebla * columnaNiebla * detras);
  // Función de fase del polvo (Henyey-Greenstein, g = 0.15, normalizada a 1 en los flancos):
  // iluminado por el disco, un grano entre el agujero y la cámara dispersa hacia delante (×1.7)
  // y uno que queda detrás devuelve la luz hacia atrás (×0.7), la asimetría cercano/lejano que
  // mide la referencia elevada; y vale igual para cualquier elevación.
  const float G_POLVO = 0.15;
  vec3 haciaCamaraGrano = normalize(cameraPosition - pos);
  float cosFase = dot(normalize(pos), haciaCamaraGrano);
  float faseHG = pow((1.0 + G_POLVO * G_POLVO) / (1.0 + G_POLVO * G_POLVO - 2.0 * G_POLVO * cosFase), 1.5);
  visible *= mix(faseHG, 1.0, esEstrella);

  vec4 mv = modelViewMatrix * vec4(posAparente, 1.0);
  float dist = max(-mv.z, 0.5);
  float tamNitido = aTamano * uEscalaPuntos * uPixelRatio / dist;

  // Profundidad de campo con el plano de foco en el agujero. El círculo de confusión es nulo y
  // continuo en el foco, y asimétrico: el lado lejano se abre menos (hiperfocal) para que el
  // fondo siga leyéndose como puntos y sólo lo que pasa cerca de la cámara se desenfoque.
  float desenfoque = dist - uFoco;
  float lado = mix(1.0, 0.2, smoothstep(-2.0, 2.0, desenfoque));
  float coc = uApertura * uPixelRatio * lado * abs(desenfoque) / dist;
  coc *= mix(1.0, 0.35, esEstrella);
  // El desenfoque no se acota: los miles de granos de la cara cercana que pasan a pocas unidades
  // de la cámara se abren en discos grandes y tenues (la energía se reparte por su área) y su suma
  // es el resplandor liso que en la referencia envuelve la banda bajo el gas. Acotarlos apagaba
  // ese resplandor sin quitar nada que se leyera como "grueso": lo grueso eran los destellos.

  float tam = sqrt(tamNitido * tamNitido + coc * coc);
  // Saturación suave hacia el tamaño máximo: el disco de bokeh crece cada vez más despacio en
  // vez de chocar con un tope y quedarse clavado.
  // El tope lo fija la vista (30 px·dpr de canto): cuanto más bajo, más se leen como chispas y
  // menos como manchas los granos que pasan junto a la cámara.
  float tamMax = uTamMax;
  float tamSuave = tam * inversesqrt(1.0 + (tam * tam) / (tamMax * tamMax));
  // Suelo de rasterización de 1 px·dpr (nunca menos: por debajo de 1 px el rasterizador por
  // software se cuelga): un grano subpíxel se dibuja como una mancha gaussiana estable y su
  // energía se reparte con el alfa, en vez de encender 1 o 4 píxeles según dónde caiga su centro.
  // Los granos lejanos del agujero (r > 24) se dibujan más gruesos: vistos de lejos son todos
  // subpíxel y con el suelo de 1 px se leían como motas idénticas a las cercanas. En el horizonte
  // el sprite mínimo sube a 2.5 px, el núcleo gaussiano a 0.6 px de sigma (ver el fragment) y la
  // energía a ×3.2 (un punto más ancho necesita más luz para no desaparecer al repartirla; un
  // suelo de 1.7 px con ×1.4 no cambiaba nada visible). Los granos cercanos al agujero no cambian.
  float lejania = smoothstep(24.0, 90.0, length(position.xz)) * (1.0 - esEstrella);
  float tamMin = uPixelRatio * (1.0 + 1.5 * lejania);
  float tamPx = max(tamSuave, tamMin);

  float bokeh = coc / (coc + tamNitido + 0.6);
  // La misma luz repartida en un disco mayor es más tenue (conservación de energía).
  float conservacion = (tamNitido * tamNitido + 0.3) / (tam * tam + 0.3);
  // La energía total del grano es la de su tamaño real (con 1 px como suelo); si se rasteriza
  // más grande para estabilizarlo, el alfa baja en la misma proporción de área.
  float tamEnergia = max(tamSuave, uPixelRatio * (1.0 + 0.8 * lejania));
  float cobertura = (tamEnergia * tamEnergia) / (tamPx * tamPx);
  // Motas subpíxel: se apagan casi del todo. Lo que se ve son estrellitas de ≥ 1 px, no una
  // arena de puntos tenues; desde arriba se conserva algo más porque la banda se ve de frente y
  // reparte sus granos en muchos más píxeles.
  float finura = clamp(tam / uPixelRatio, 0.0, 1.0);
  float subpixel = mix(0.7, 1.0, finura);
  // Los granos que pasan a ras de la cámara se disuelven antes de cruzar el plano cercano.
  float cercania = smoothstep(0.6, 3.5, dist);

  float alfaPolvo = aBrillo * conservacion * cobertura * subpixel * cercania;
  float alfaEstrella = aBrillo * conservacion * cobertura * 3.2;

  // Los discos de bokeh de los granos que pasan junto a la cámara se contienen un poco.
  float contencionBokeh = mix(1.0, 0.7, bokeh);
  // Fuente puntual: brillo ∝ g² en física, suavizado a g como el gas (g⁴ → g²).
  float brilloCaida = brilloCamara(vCorrimiento, uGReferencia, 1.0);
  vAlfa = mix(alfaPolvo, alfaEstrella, esEstrella) * visible * magnificacion * contencionBokeh * brilloCaida;
  vBrilloBase = aBrillo;
  vBokeh = bokeh;
  vEstrella = esEstrella;
  vTono = aTono;
  vFase = aFase;
  vTamPx = tamPx;
  vLejania = lejania;

  gl_PointSize = tamPx;
  gl_Position = projectionMatrix * mv;
}
`

export const POLVO_ESTELAR_FRAG = /* glsl */ `
uniform float uTiempo;
uniform float uBrilloPolvo;
uniform float uPixelRatio;

varying float vTono;
varying float vFase;
varying float vAlfa;
varying float vBokeh;
varying float vEstrella;
varying float vBrilloBase;
varying float vTamPx;
varying float vLejania;
varying float vCorrimiento;
uniform float uGReferencia;

${CORRIMIENTO_OBSERVADOR_GLSL}

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;

  // Distancias en píxeles reales.
  float px = d * vTamPx * 0.5;

  // En foco: núcleo gaussiano de sigma = 0.09·tamaño (nítido) con un mínimo de 0.27 px·dpr para
  // que un grano pequeño sea una chispa fina y estable en vez de un píxel que parpadea. El pico
  // se renormaliza para que la energía total (2πσ²) no dependa de qué sigma se haya usado: con
  // un núcleo más estrecho la misma energía da un pico más alto, y por eso la chispa se lee más
  // fina y más clara a la vez.
  float sigmaNitida = 0.09 * vTamPx;
  // Los granos lejanos del agujero se dibujan más gruesos: el suelo de sigma sube de 0.22 a
  // 0.6 px·dpr en el horizonte (el sprite ya es mayor, pero sin esto el núcleo gaussiano
  // seguía teniendo la misma anchura y el punto se veía igual). La normalización conserva la
  // energía: más ancho y algo menos alto.
  float sigma = max(0.22 * uPixelRatio * (1.0 + 1.7 * vLejania), sigmaNitida);
  float normalizacion = (sigmaNitida * sigmaNitida) / (sigma * sigma);
  float nucleo = normalizacion * exp(-px * px / (2.0 * sigma * sigma));
  // Halo mínimo: una chispa real es un punto con una falda casi inexistente, no una mota difusa.
  float halo = (1.0 - d) * (1.0 - d) * 0.08;
  float punto = nucleo + halo;

  // Fuera de foco: disco plano de borde suave con el anillo exterior algo más luminoso,
  // como el bokeh de un objetivo real (acotado a pocos píxeles desde el vertex).
  float disco = smoothstep(1.0, 0.8, d) * (0.5 + 0.5 * smoothstep(0.4, 0.96, d));
  float forma = mix(punto, disco, vBokeh);

  // Centelleo: cada estrellita respira a su ritmo, sutil como el de una estrella real (un
  // parpadeo fuerte se lee como purpurina, no como cielo).
  float ritmo = 1.1 + 1.3 * fract(vFase * 3.7);
  float parpadeo = 0.9 + 0.1 * sin(uTiempo * ritmo + vFase * 6.2831853);

  // Valores lineales: ACES desatura, así que aquí todo es más cálido de lo que parece.
  // Estrellitas: crema-blanco cálido con variación de temperatura como un campo estelar real
  // (la mayoría cálidas, algunas blancas, unas pocas frías); el ámbar queda para el bokeh.
  // Paleta oro: en la captura lejana 32 del usuario la banda de chispas lee r/b 1.81/1.64 y
  // tono 29–33° (oro naranja); con crema (1, 0.93, 0.80) salía 1.57/1.46 y 26–27° (rosado pálido) y con (1, 0.86, 0.60) 1.67/1.52.
  vec3 calida = vec3(1.00, 0.74, 0.40);
  vec3 blancaCalida = vec3(1.00, 0.83, 0.56);
  vec3 fria = vec3(0.88, 0.93, 1.00);
  vec3 ambar = vec3(0.92, 0.46, 0.16);
  vec3 blanco = vec3(0.96, 0.97, 1.00);

  float temperatura = fract(vFase * 7.31);
  vec3 col = mix(calida, blancaCalida, smoothstep(0.35, 0.75, temperatura));
  col = mix(col, fria, smoothstep(0.9, 1.0, temperatura));
  // Ligero calentamiento hacia la periferia: iluminadas por el disco, más rojas cuanto más lejos.
  col = mix(col, vec3(1.0, 0.78, 0.48), 0.3 * vTono);
  // Los discos de bokeh se leen ámbar translúcido, nunca gris: la acumulación aditiva los
  // empujaría a blanco si conservaran el tono claro de los granos en foco.
  col = mix(col, ambar, vBokeh * 0.85);
  // Las más vivas saturan a blanco cálido, como en una fotografía real.
  col = mix(col, vec3(1.0, 0.94, 0.82), smoothstep(1.0, 2.8, vBrilloBase) * (1.0 - vBokeh));
  // Las estrellas del fondo también tienen temperatura: un cielo real no es de puntos idénticos.
  col = mix(col, blanco, vEstrella * 0.6);

  // El mismo balance de color que el gas (ver el shader de la lente): naranja melocotón, no sepia.
  col *= vec3(1.0, 1.05, 1.2) / 1.050;
  // Corrimiento de la cámara en caída (1 fuera de ella).
  col *= tinteCamara(vCorrimiento, uGReferencia);
  gl_FragColor = vec4(col * forma * parpadeo * vAlfa * uBrilloPolvo, 1.0);
}
`
