/**
 * Unidades geométricas con radio de Schwarzschild = 1.
 * Con esa normalización la esfera de fotones queda en 1.5 y la ISCO en 3,
 * lo que permite usar la aceleración pseudo-newtoniana -1.5·h²·r/|r|⁵ en el shader.
 */
export const PARAMETROS_AGUJERO = {
  radioHorizonte: 1.0,
  radioFoton: 1.5,
  // Radio aparente de la sombra (parámetro de impacto crítico): 1.5·√3.
  radioSombra: 2.598,
  radioInternoDisco: 3.0,
  // Radio interior hasta el que se sigue muestreando el gas en caída libre (región de plunge,
  // entre el horizonte y la ISCO). Por debajo la emisión, corrida al rojo, ya es despreciable.
  radioPlunge: 1.35,
  // Radio donde la densidad superficial del gas cae a cero (fundido 9.5 → 12). Más allá, la
  // línea la continúan los escombros del campo de polvo, que se subliman en gas al acercarse.
  radioGas: 12.0,
  // Referencia del gradiente térmico de color (crema → sepia entre radioInternoDisco y aquí).
  radioExternoDisco: 15.0,
  radioBorde: 17.0,
  pasosMaximos: 240,
} as const

/**
 * Radios donde los escombros se fragmentan y subliman en gas. Entre `inicio` y `plenitud` la
 * población de granos crece desde cero (por dentro ya son gas) y su tamaño se reduce hacia el
 * agujero por disrupción de marea.
 */
export const TRANSICION_POLVO = {
  inicio: 8.5,
  plenitud: 13,
  tamanoPleno: 24,
  referenciaBrillo: 13,
  // Tope de brillo por grano: por encima, el bloom convierte cada mota en un halo de 20 px y
  // engorda el haz. Con el núcleo de las chispas más fino (σ ≥ 0.27 px) el tope sube de 2.4 a 3.0
  // para que las estrellitas más vivas lleguen a blanco.
  brilloMaximo: 3.0,
  // Horizonte del sistema de anillos: a 85 la banda de chispas cruza casi toda la pantalla vista
  // desde 140 unidades (antes 60).
  radioFinal: 85,
} as const

/**
 * Inclinación aparente del disco en pantalla (radianes), aplicada como roll de cámara.
 * El disco vive en el plano XZ del mundo; al rodar la cámara en vez de rotar el disco,
 * la línea del gas asciende hacia la derecha con el mismo ángulo en cualquier azimut.
 * Medido en la referencia: 26.5°.
 */
export const INCLINACION_PANTALLA = 0.4625

/**
 * Posición del agujero en pantalla como desplazamiento NDC respecto al centro
 * (x positivo = derecha, y positivo = arriba). Centrado en todas las vistas por petición del
 * usuario (las referencias lo encuadraban a un lado y algo alto: 51–56 % del ancho, 32–41 % de
 * la altura).
 */
export const ENCUADRE_PANTALLA = { x: 0, y: 0 } as const

export const CAMARA_AGUJERO = {
  fov: 45,
  cerca: 0.1,
  lejos: 1400,
} as const
