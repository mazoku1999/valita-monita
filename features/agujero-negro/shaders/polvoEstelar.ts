import { LENTE_DELGADA_GLSL } from './lenteDelgada'

export const POLVO_ESTELAR_VERT = /* glsl */ `
uniform float uTiempo;
uniform float uEscalaPuntos;
uniform float uPixelRatio;
uniform float uFoco;
uniform float uApertura;
uniform float uRadioSombra;
// Cuánto mira la cámara desde arriba (0 = recorrido de canto, 1 = vista elevada).
uniform float uElevada;
// Cuánto mira desde el cenit (0 = ≤ 27°, 1 = ≥ 58°): sin "lado lejano" que extinguir.
uniform float uCenital;
// Luz que conserva el polvo del lado lejano fuera del plano (0.5 calibrado desde arriba).
uniform float uPolvoLejano;
// Tamaño máximo de un grano (px, ya multiplicado por el pixel ratio).
uniform float uTamMax;
// Contención del dobladillo pegado al gas fuera del plano (0 = intacto, 1 = a la mitad).
uniform float uDobladillo;

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
  // Desde arriba (pero no desde el cenit), los escombros del lado lejano se ven a través de la
  // banda de polvo del plano y llegan a la mitad: en la referencia elevada la cola bajo el gas
  // (lado cercano) dobla en brillo a la que asoma sobre los arcos (lado lejano).
  vec2 dirCamaraPlano = length(cameraPosition.xz) > 1e-3 ? normalize(cameraPosition.xz) : vec2(1.0, 0.0);
  float rcPlano = max(length(pos.xz), 1e-3);
  // Peso por lado, medido en la referencia elevada: la cara cercana (hacia la cámara) es la
  // más viva (×1.3), los flancos quedan a ×0.8 y la cara lejana, vista a través de la banda del
  // plano, a la mitad.
  float haciaCamara = dot(pos.xz / rcPlano, dirCamaraPlano);
  float pesoLado = mix(uPolvoLejano, 1.3, smoothstep(-0.6, 0.8, haciaCamara));
  // El dobladillo pegado al gas (r < 13) se contiene desde arriba: en la referencia el gas acaba
  // en punta y de ahí en adelante hay chispas sueltas, no una prolongación densa de la banda.
  float dobladillo = 1.0 - 0.45 * uDobladillo * (1.0 - smoothstep(9.0, 13.5, length(position.xz)));
  visible *= mix(1.0, pesoLado * dobladillo, uElevada * (1.0 - uCenital) * (1.0 - esEstrella));

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
  // La energía total del grano es la de su tamaño real (con 1 px como suelo); si se rasteriza
  // más grande para estabilizarlo, el alfa baja en la misma proporción de área.
  float tamEnergia = max(tamSuave, uPixelRatio);
  float cobertura = (tamEnergia * tamEnergia) / (tamPx * tamPx);
  // Motas subpíxel: se apagan casi del todo. Lo que se ve son estrellitas de ≥ 1 px, no una
  // arena de puntos tenues; desde arriba se conserva algo más porque la banda se ve de frente y
  // reparte sus granos en muchos más píxeles.
  float finura = clamp(tam / uPixelRatio, 0.0, 1.0);
  float subpixel = mix(mix(0.5, 1.0, finura), mix(0.85, 1.0, finura), uElevada);
  // Los granos que pasan a ras de la cámara se disuelven antes de cruzar el plano cercano.
  float cercania = smoothstep(0.6, 3.5, dist);

  float alfaPolvo = aBrillo * conservacion * cobertura * subpixel * cercania;
  float alfaEstrella = aBrillo * conservacion * cobertura * 3.2;

  // Desde arriba los discos de bokeh de los granos que pasan junto a la cámara se contienen.
  float contencionBokeh = mix(1.0, 0.55, bokeh * uElevada);
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
  vec3 calida = vec3(1.00, 0.93, 0.80);
  vec3 blancaCalida = vec3(0.99, 0.97, 0.93);
  vec3 fria = vec3(0.88, 0.93, 1.00);
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
