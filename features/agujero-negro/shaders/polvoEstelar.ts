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

// Luz que conserva el polvo del lado lejano visto a través de la banda del plano (0.5, medido en
// la referencia elevada: la cola bajo el gas dobla en brillo a la que asoma sobre los arcos).
const float POLVO_LEJANO = 0.5;

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

${LENTE_DELGADA_GLSL}

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
  float captura = 1.0 - smoothstep(uRadioSombra, uRadioSombra + 0.3, bAparente);
  float visible = 1.0 - captura * detras;
  // Con la cámara en el plano del disco, la luz de los escombros del lado lejano que rodea el
  // agujero atraviesa la atmósfera del propio disco y llega extinguida, igual que la imagen
  // lensada del gas: alrededor de la sombra quedan chispas sueltas, no un enjambre.
  float elevacionCamara = abs(cameraPosition.y) / length(cameraPosition);
  float enPlano = 1.0 - smoothstep(0.04, 0.35, elevacionCamara);
  float rozaAgujero = 1.0 - smoothstep(uRadioSombra, uRadioSombra * 3.0, bAparente);
  visible *= mix(1.0, 0.3, enPlano * detras * rozaAgujero);
  // Con la cámara baja pero fuera del plano (3° → 17°, apagándose hacia el cenit), los escombros
  // del lado lejano se ven a través de la banda de polvo del plano y llegan a la mitad; la cara
  // cercana es la más viva (×1.3) y los flancos quedan a ×0.8 (medido en la referencia elevada).
  // Es una función continua de la elevación de la cámara, no de la vista elegida.
  vec2 dirCamaraPlano = length(cameraPosition.xz) > 1e-3 ? normalize(cameraPosition.xz) : vec2(1.0, 0.0);
  float rcPlano = max(length(pos.xz), 1e-3);
  float haciaCamara = dot(pos.xz / rcPlano, dirCamaraPlano);
  float pesoLado = mix(POLVO_LEJANO, 1.3, smoothstep(-0.6, 0.8, haciaCamara));
  float pesoElevado = smoothstep(0.03, 0.25, elevacionCamara) * (1.0 - smoothstep(0.29, 1.05, elevacionCamara));
  visible *= mix(1.0, pesoLado, pesoElevado * (1.0 - esEstrella));

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
  float tamMin = 1.0 * uPixelRatio;
  float tamPx = max(tamSuave, tamMin);

  float bokeh = coc / (coc + tamNitido + 0.6);
  // La misma luz repartida en un disco mayor es más tenue (conservación de energía).
  float conservacion = (tamNitido * tamNitido + 0.3) / (tam * tam + 0.3);
  // La energía total del grano es la de su tamaño REAL en pantalla, también por debajo de 1 px:
  // si se rasteriza más grande para estabilizarlo, el alfa baja en la misma proporción de área.
  // Así el flujo de cada grano cae con el cuadrado de la distancia, como una fuente puntual, y
  // una sola exposición vale para todas las distancias (antes hacía falta una por vista: 3.5 a
  // 19.5 unidades, 0.9 a 38, 0.5 a 60, que es justo la ley 1/d²).
  // Suelo de 0.8 px·dpr: por debajo, el grano ya no pierde energía con la distancia y la banda
  // sigue viva de lejos (capturas 28 y 31); por encima rige la ley 1/d².
  float tamEnergia = max(tamSuave, 0.8 * uPixelRatio);
  float cobertura = (tamEnergia * tamEnergia) / (tamPx * tamPx);
  // Los granos que pasan a ras de la cámara se disuelven antes de cruzar el plano cercano.
  float cercania = smoothstep(0.6, 3.5, dist);

  float alfaPolvo = aBrillo * conservacion * cobertura * cercania;
  float alfaEstrella = aBrillo * conservacion * cobertura * 3.2;

  // Los discos de bokeh de los granos que pasan junto a la cámara se contienen un poco.
  float contencionBokeh = mix(1.0, 0.7, bokeh);
  vAlfa = mix(alfaPolvo, alfaEstrella, esEstrella) * visible * magnificacion * contencionBokeh;
  vBrilloBase = aBrillo;
  vBokeh = bokeh;
  vEstrella = esEstrella;
  vTono = aTono;
  vFase = aFase;
  vTamPx = tamPx;

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
  float sigma = max(0.22 * uPixelRatio, sigmaNitida);
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
  // Paleta más cálida (captura 31): la banda de chispas es oro, no crema-gris.
  vec3 calida = vec3(1.00, 0.86, 0.62);
  vec3 blancaCalida = vec3(1.00, 0.94, 0.82);
  vec3 fria = vec3(0.94, 0.95, 1.00);
  vec3 ambar = vec3(0.92, 0.46, 0.16);
  vec3 blanco = vec3(0.96, 0.97, 1.00);

  float temperatura = fract(vFase * 7.31);
  vec3 col = mix(calida, blancaCalida, smoothstep(0.35, 0.75, temperatura));
  col = mix(col, fria, smoothstep(0.9, 1.0, temperatura));
  // Ligero calentamiento hacia la periferia: iluminadas por el disco, más rojas cuanto más lejos.
  col = mix(col, vec3(1.0, 0.80, 0.56), 0.18 * vTono);
  // Los discos de bokeh se leen ámbar translúcido, nunca gris: la acumulación aditiva los
  // empujaría a blanco si conservaran el tono claro de los granos en foco.
  col = mix(col, ambar, vBokeh * 0.85);
  // Las más vivas saturan a blanco cálido, como en una fotografía real.
  col = mix(col, vec3(1.0, 0.97, 0.90), smoothstep(1.0, 2.8, vBrilloBase) * (1.0 - vBokeh));
  // Las estrellas del fondo también tienen temperatura: un cielo real no es de puntos idénticos.
  col = mix(col, blanco, vEstrella * 0.6);

  gl_FragColor = vec4(col * forma * parpadeo * vAlfa * uBrilloPolvo, 1.0);
}
`
