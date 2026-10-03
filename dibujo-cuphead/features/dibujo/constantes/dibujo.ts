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
  /** σ del desenfoque de simplificación (texels de 1/2). */
  desenfoque: 2.45,
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
  /** σ del desenfoque de la luz de las aguadas (texels de 1/4). */
  desenfoqueAguada: 3.5,
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

/**
 * Cielo estrellado (ver `utils/destellos.ts` y `CIELO_ACUARELA_GLSL`): la Vía Láctea es el círculo
 * máximo perpendicular a `normal`, de esta anchura (rad). Inclinado unos 35° respecto al plano del
 * disco y pasando unos 14° por encima del agujero tal como se ve al acercarse: cruza el cielo en
 * diagonal sin confundirse con la banda.
 */
export const VIA_LACTEA = { normal: [0.565, -0.813, -0.131] as const, anchura: 0.16 } as const

/**
 * Banda de polvo del agujero, la misma para sus granos (`utils/destellos.ts`) y para su luz pintada en
 * el cielo (`bandaPintada` en `CIELO_FRAG`): entre estos radios, con espesor gaussiano
 * σ = espesorBase + espesorPendiente·r y densidad de superficie ∝ (radioMinimo/r)².
 */
export const BANDA_POLVO = { radioMinimo: 16.3, radioMaximo: 100, espesorBase: 0.06, espesorPendiente: 0.006 } as const
