/**
 * Parámetros del dibujo animado (pase `utils/PasoDibujo.ts`). Los tamaños en píxeles se dan para
 * una pantalla de 720 de alto y crecen con la resolución, así el trazo mantiene su peso.
 */

/**
 * Tinta: contornos a partir de qué objeto hay en cada píxel (ver CONTORNO_FRAG). `grosor` es el
 * radio del círculo de muestras: la línea mide ~2·grosor, como el entintado grueso de Cuphead.
 */
export const TINTA = {
  grosor: 2.1,
  /** Negro de tinta, algo cálido (sRGB). */
  color: [0.075, 0.058, 0.047] as const,
} as const

/**
 * Colores planos de lo que la escena todavía renderiza con materiales realistas (el túnel, los
 * planetas): se simplifica y su luminosidad se reparte en bandas nítidas; dentro de cada banda
 * queda un poco del degradado original, como el aerógrafo de los años 30.
 */
export const COLORES_PLANOS = {
  /**
   * Umbrales de claridad OKLab entre bandas y valor de las tres bandas claras. La banda oscura no
   * se aplana: el cielo y los resplandores tenues caerían en el primer escalón y saldrían a manchas.
   */
  umbrales: [0.34, 0.56, 0.78] as const,
  valores: [0.45, 0.67, 0.89] as const,
  /** Cuánto degradado original queda dentro de cada banda. */
  degradado: 0.22,
  /** Saturación extra. */
  croma: 1.2,
  /** Paso del desenfoque de simplificación (texels de 1/2; σ ≈ 1.75·paso). */
  desenfoque: 1.4,
  /** Cuánto se acercan tono y croma a la paleta de época (0–1). */
  fuerzaEpoca: 0.45,
} as const

/**
 * Acuarela: aguadas de la luz de la escena sobre el cielo (umbrales de luminancia sRGB de sus tres
 * tonos) y el grano del papel (px a 720 de alto; crece con la resolución).
 */
export const ACUARELA = {
  umbralesAguada: [0.075, 0.18, 0.38] as const,
  escalaPapel: 2.2,
  /** Paso del desenfoque de la luz de las aguadas (texels de 1/4; σ ≈ 1.75·paso). */
  desenfoqueAguada: 2.0,
} as const

/**
 * Película antigua (ver PELICULA_FRAG): fotogramas por segundo del proyector, grano, probabilidad
 * de cada mota de polvo (hasta 8 por fotograma) y de cada raya (hasta 2), parpadeo del brillo,
 * vaivén del cuadro (px a 720 de alto), viñeta, envejecido del color y aberración cromática.
 */
export const PELICULA = {
  fotogramasPorSegundo: 24,
  grano: 0.075,
  polvo: 0.22,
  rayas: 0.55,
  parpadeo: 0.03,
  vaiven: 1.0,
  vineta: 0.42,
  envejecido: 1.0,
  aberracion: 0.004,
} as const

/** Hervor de la tinta: desplazamiento (px a 720 de alto) que cambia cada tantos dibujos. */
export const HERVOR = {
  amplitud: 0.9,
  cadaDibujos: 2,
} as const
