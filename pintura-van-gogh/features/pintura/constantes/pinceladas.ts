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
  /** Radio (texels del color a 1/2) de la media que da el color de la pincelada; 0 = el del ancla. */
  readonly difuminado: number
  /**
   * Capa de detalle: cada trazo sólo se pinta donde el color fino difiere del grueso más que este
   * umbral (diferencia en OKLab). Capa de realces: donde la luminancia a resolución completa supera
   * a la de su entorno por este margen (sRGB).
   */
  readonly umbralDetalle: number
  /** 0: cubre todo el lienzo. 1: detalle. 2: realces de luz. */
  readonly modo: 0 | 1 | 2
  /** El pincel grueso sigue el flujo suave; los finos, el flujo fino (menos desenfocado). */
  readonly flujoFino: boolean
  /** Secciones de la tira y pasos de integración por mitad de trazo (los cortos necesitan menos). */
  readonly secciones: number
  readonly pasos: number
}

export const CAPAS_PINCELADAS: readonly CapaPinceladas[] = [
  {
    nombre: 'fondo',
    ancho: 0.013,
    largo: 0.046,
    espaciado: 0.0135,
    variacion: 0.25,
    desvio: 0.12,
    difuminado: 1.5,
    umbralDetalle: 0,
    modo: 0,
    flujoFino: false,
    secciones: 9,
    pasos: 6,
  },
  {
    nombre: 'detalle',
    ancho: 0.0062,
    largo: 0.022,
    espaciado: 0.0072,
    variacion: 0.25,
    desvio: 0.1,
    difuminado: 0,
    umbralDetalle: 0.045,
    modo: 1,
    flujoFino: true,
    secciones: 6,
    pasos: 4,
  },
  {
    nombre: 'realces',
    ancho: 0.0048,
    largo: 0.017,
    espaciado: 0.0064,
    variacion: 0.2,
    desvio: 0.08,
    difuminado: 0,
    umbralDetalle: 0.06,
    modo: 2,
    flujoFino: true,
    secciones: 4,
    pasos: 3,
  },
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
