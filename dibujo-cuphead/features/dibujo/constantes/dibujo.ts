/**
 * Parámetros del dibujo animado (pase `utils/PasoDibujo.ts`). Las escalas están en texels de la
 * imagen a 1/2 de resolución, así el trazo mantiene su grosor relativo en cualquier pantalla.
 */

/**
 * Tinta: contornos de diferencia de gaussianas que sigue el flujo de los bordes (FDoG): la
 * diferencia se toma a través del borde y se suaviza a lo largo de él, así las líneas salen
 * continuas y limpias como entintadas a mano, no como el ruido de un detector de bordes. Salen
 * del lado oscuro de cada borde.
 */
export const TINTA = {
  /** σ de la gaussiana central (texels de 1/2): el grosor de la línea. */
  sigmaBorde: 1.6,
  /** El entorno mide k veces más. */
  k: 1.6,
  /** Peso del entorno: con 1 las zonas planas dan 0; algo menos evita líneas en degradados suaves. */
  rho: 0.985,
  /** σ del suavizado a lo largo del borde (texels de 1/2): largo del trazo coherente. */
  sigmaFlujo: 4.5,
  /** Umbral de la respuesta (negativa en el lado oscuro): más negativo, sólo bordes fuertes. */
  umbral: -0.012,
  /** Ancho de la transición del umbral (antialias y trazo de pincel que engorda con el contraste). */
  suavidad: 0.02,
  /** Desenfoque previo de la luminancia (paso del filtro en texels de 1/2): borra las chispas sueltas. */
  desenfoquePrevio: 1.3,
  /**
   * Nivel de luminancia (sRGB) cuya curva se entinta aunque el paso sea suave (el borde de las
   * formas brillantes), ancho del escalón y su peso.
   */
  nivelTinta: [0.62, 0.035, 0.35] as const,
  /** Peso de las siluetas (paso de la profundidad entre un objeto y el cielo). */
  pesoSilueta: 0.6,
  /** Peso de la calidez (rojo − azul) para entintar bordes de color de igual luminosidad. */
  pesoCalidez: 0.35,
  /** Negro de tinta, algo cálido (sRGB). */
  color: [0.075, 0.058, 0.047] as const,
} as const

/**
 * Colores planos: la imagen se simplifica (desenfoque del orden de un trazo) y su luminosidad se
 * reparte en bandas nítidas; dentro de cada banda queda un poco del degradado original, como el
 * aerógrafo de los dibujos de los años 30.
 */
export const COLORES_PLANOS = {
  /**
   * Umbrales de claridad OKLab entre bandas y valor de las tres bandas claras. La banda oscura no
   * se aplana: el cielo (claridad 0.1–0.2) y los resplandores tenues caerían en el primer escalón y
   * saldrían a manchas.
   */
  umbrales: [0.34, 0.56, 0.78] as const,
  valores: [0.45, 0.67, 0.89] as const,
  /** Cuánto degradado original queda dentro de cada banda. */
  degradado: 0.22,
  /** Saturación extra. */
  croma: 1.2,
  /** Paso del desenfoque de simplificación (texels de 1/2; σ ≈ 1.75·paso). */
  desenfoque: 1.4,
} as const

/** Análisis de la orientación de los bordes (a 1/4): suavizado espacial y memoria en el tiempo. */
export const ORIENTACION = {
  pasoDesenfoque: 1.5,
  tauTemporal: 0.1,
} as const
