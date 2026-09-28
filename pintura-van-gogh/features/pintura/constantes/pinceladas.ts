/**
 * Tamaños de las pinceladas como fracciones de la ALTURA de la pantalla: el cuadro tiene el mismo
 * "grano" a cualquier resolución y densidad de píxeles. En La noche estrellada (73.7 cm de alto)
 * una pincelada mide ~0.7–1 cm de ancho y 2–5 cm de largo: ~1.2 % de ancho y 3–4 veces más larga.
 *
 * `espaciado` es el lado de la celda de la rejilla de anclas (una pincelada por celda, desplazada
 * al azar dentro de ella): con ~3 veces el área de la celda cubierta por cada trazo, el lienzo
 * queda tapado salvo en rendijas sueltas, donde asoma la base.
 */
export interface CapaPinceladas {
  readonly nombre: string
  readonly ancho: number
  readonly largo: number
  readonly espaciado: number
  /** Variación de ancho y largo entre pinceladas (fracción: 0.25 → ±25 %). */
  readonly variacion: number
  /** Desviación máxima del trazo respecto al flujo (radianes): la mano no sigue el campo al milímetro. */
  readonly desvio: number
}

export const CAPAS_PINCELADAS: readonly CapaPinceladas[] = [
  { nombre: 'fondo', ancho: 0.013, largo: 0.046, espaciado: 0.0135, variacion: 0.25, desvio: 0.12 },
]

/**
 * Análisis de la imagen para orientar las pinceladas: el tensor de estructura se calcula a 1/4 de
 * resolución, se suaviza con una gaussiana ancha (del orden del largo de un trazo) y en el
 * tiempo (τ en segundos), para que la orientación no tiemble con las chispas que se mueven.
 */
export const ANALISIS_FLUJO = {
  reduccion: 4,
  pasoDesenfoque: 2.0,
  /** Escala gruesa (otra reducción ×4 y su propia gaussiana): la forma grande, ~40 px. */
  pasoDesenfoqueGrueso: 1.5,
  pesoGrueso: 1.0,
  tauTemporal: 0.12,
  /** Fuerza del borde (gradiente sRGB por texel reducido) a partir de la cual manda la imagen. */
  fuerzaMinima: 0.004,
  fuerzaPlena: 0.03,
} as const
