import { FOTOGRAMAS_CAMARA, type FotogramaCamara } from '../utils/fotogramasCamara'
import { ENCUADRE_PANTALLA, INCLINACION_PANTALLA } from './parametrosAgujero'

export type IdVista = 'canto' | 'elevada' | 'inferior' | 'cenital' | 'lejana'

/** Parámetros de una vista que no dependen del scroll: cómo se coloca el agujero en pantalla. */
export interface EncuadreVista {
  /** Roll de cámara en radianes: inclinación aparente del disco (positivo = asciende a la derecha). */
  readonly inclinacion: number
  /** Desplazamiento NDC del agujero respecto al centro (x → derecha, y → arriba). */
  readonly encuadre: { readonly x: number; readonly y: number }
}

/**
 * Aspecto del gas y del polvo cuando la cámara sale del plano. Cada valor es el objetivo al que
 * se llega con la elevación (ver `utils/elevacionCamara.ts`); de canto mandan siempre los valores
 * calibrados originales, así que estas cifras sólo pesan fuera del plano.
 */
export interface AspectoVista {
  /** Ganancia del gas (de canto, 6.5). */
  readonly ganancia: number
  /** Amplitud de la bruma que llena la sombra, relativa a la de canto (0 = sombra negra). */
  readonly bruma: number
  /** Fracción de luz que conserva el gas de detrás del agujero (los arcos). */
  readonly luzArcos: number
  readonly bloom: { readonly umbral: number; readonly intensidad: number; readonly radio: number }
  /** Ganancia del polvo (de canto, 0.9). */
  readonly polvoExposicion: number
  /** Luz que conserva el polvo del lado lejano (visto a través de la banda del plano). */
  readonly polvoLejano: number
  /** Factor de apertura de la profundidad de campo del polvo (1 = la de canto; menos = más nítido). */
  readonly apertura: number
  /**
   * Tamaño máximo de un grano en px por píxel de dispositivo (de canto, 30). Un tope bajo convierte
   * los granos que pasan junto a la cámara en chispas pequeñas y vivas (su energía se concentra)
   * en vez de en discos grandes y tenues.
   */
  readonly tamanoMaximo: number
  /** Cuánto se contiene el dobladillo de escombros pegado al gas (r < 13): 0 = intacto, 1 = a la mitad. */
  readonly dobladillo: number
  /** Radio donde el gas acaba de fundirse fuera del plano (de canto sigue hasta 12). */
  readonly radioGas: number
}

export interface VistaCamara extends EncuadreVista {
  readonly id: IdVista
  /** Texto del selector de la cabecera (en inglés, como el resto de la interfaz). */
  readonly etiqueta: string
  readonly descripcion: string
  /** Recorrido ligado al scroll. Todas las vistas comparten los `progreso` y azimuts de canto. */
  readonly fotogramas: readonly FotogramaCamara[]
  readonly aspecto: AspectoVista
  /**
   * Peso mínimo del aspecto (0–1). Normalmente el aspecto entra con la elevación de la cámara;
   * una vista casi en el plano que aun así quiere su propio aspecto (la inferior, a 4.6° bajo el
   * gas) lo fija a 1.
   */
  readonly pesoMinimoAspecto: number
}

/**
 * Aspecto calibrado contra la referencia elevada (cámara 12.6° sobre el plano): el disco se
 * expone por su borde interno, la bruma llena la sombra a crema y los arcos quedan tenues.
 */
export const ASPECTO_ELEVADO: AspectoVista = {
  ganancia: 5.2,
  bruma: 2.2,
  luzArcos: 0.03,
  bloom: { umbral: 0.5, intensidad: 2.7, radio: 0.88 },
  polvoExposicion: 1.8,
  polvoLejano: 0.5,
  apertura: 1,
  tamanoMaximo: 22,
  // Desde arriba el gas acaba en punta y de ahí en adelante hay chispas sueltas, no una
  // prolongación densa de la banda.
  dobladillo: 1,
  radioGas: 10.2,
}

/**
 * Aspecto calibrado contra la referencia inferior (cámara 10.5° bajo el plano, a 19.5 unidades):
 * el haz satura como de canto, bajo él la sombra queda en penumbra parda y no en crema, los arcos
 * lensados asoman por debajo en oro tenue y los escombros, con la cámara dentro de sus anillos,
 * se ven como chispas grandes y vivas por toda la mitad izquierda.
 */
export const ASPECTO_INFERIOR: AspectoVista = {
  ganancia: 6.0,
  bruma: 0.1,
  luzArcos: 0.06,
  bloom: { umbral: 0.9, intensidad: 1.8, radio: 0.8 },
  polvoExposicion: 3.5,
  // En la referencia el polvo denso está por encima de la línea del plano (el dobladillo y la
  // cara cercana, con la cámara metida en sus anillos) y bajo ella apenas hay chispas: el lado
  // lejano se apaga, la apertura se cierra y el tamaño se acota para que los granos cercanos sean
  // chispas de 3–5 px nítidas y vivas, no discos; el dobladillo se deja intacto.
  polvoLejano: 0.1,
  apertura: 0.6,
  tamanoMaximo: 14,
  dobladillo: 0,
  // Tan cerca, la perspectiva agranda ×2 el gas cercano: la referencia acaba la banda a ~8.5 radios.
  radioGas: 8.5,
}

/** Recorrido que conserva el ritmo de azimut de canto con elevación, distancia y fov fijos. */
const derivarRecorrido = (fijo: { polar: number; distancia: number; fov: number }): readonly FotogramaCamara[] =>
  FOTOGRAMAS_CAMARA.map(({ progreso, azimut }) => ({ progreso, azimut, ...fijo }))

export const VISTAS_CAMARA: Readonly<Record<IdVista, VistaCamara>> = {
  canto: {
    id: 'canto',
    etiqueta: 'Edge-on',
    descripcion: 'Camera in the plane of the disk: the gas is a blade of light through the shadow.',
    fotogramas: FOTOGRAMAS_CAMARA,
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
    aspecto: ASPECTO_ELEVADO,
    pesoMinimoAspecto: 0,
  },
  elevada: {
    id: 'elevada',
    etiqueta: 'Above',
    descripcion: 'Camera raised 12.6° over the disk: its far side bends into arcs above and below the shadow.',
    // Calibrada contra la referencia (3448×1244, sombra en el 50.8 % del ancho y el 32.2 % de la
    // altura, anillo de fotones = 24.4 % de la altura): con fov 41° eso exige 27.5 unidades.
    fotogramas: derivarRecorrido({ polar: 1.35, distancia: 27.5, fov: 41 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.0165, y: 0.355 },
    aspecto: ASPECTO_ELEVADO,
    pesoMinimoAspecto: 0,
  },
  inferior: {
    id: 'inferior',
    etiqueta: 'Below',
    descripcion: 'Camera just under the disk, close in: the blade crosses above the shadow and the far side loops under it.',
    // Calibrada contra la referencia (3456×1676): anillo de fotones de 308 px = 36.8 % de la
    // altura → 19.5 unidades a fov 40°; sombra en el 52 % del ancho y el 34.8 % de la altura. La
    // banda cercana, que cruza por encima de la sombra, mide 150 px a media altura: con la
    // cámara tan cerca la perspectiva la agranda ×2, así que eso son sólo 4.6° bajo el plano.
    fotogramas: derivarRecorrido({ polar: Math.PI / 2 + 0.08, distancia: 19.5, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.041, y: 0.304 },
    aspecto: ASPECTO_INFERIOR,
    pesoMinimoAspecto: 1,
  },
  cenital: {
    id: 'cenital',
    etiqueta: 'Overhead',
    descripcion: 'Camera almost over the pole: the disk is a turbulent surface with two spiral arms.',
    fotogramas: derivarRecorrido({ polar: 0.3, distancia: 30, fov: 41 }),
    inclinacion: 0,
    encuadre: { x: 0, y: 0.12 },
    aspecto: ASPECTO_ELEVADO,
    pesoMinimoAspecto: 0,
  },
  lejana: {
    id: 'lejana',
    etiqueta: 'Wide',
    descripcion: 'Camera far out, slightly above the plane: the whole ring system around the hole.',
    fotogramas: derivarRecorrido({ polar: 1.4, distancia: 70, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.02, y: 0.15 },
    aspecto: ASPECTO_ELEVADO,
    pesoMinimoAspecto: 0,
  },
}

export const ORDEN_VISTAS: readonly IdVista[] = ['canto', 'elevada', 'inferior', 'cenital', 'lejana']

export const VISTA_INICIAL: IdVista = 'canto'

/** Distancias a las que puede llegar el zoom libre: nunca dentro del gas (17) ni tan lejos que el disco sea un punto. */
export const DISTANCIA_LIBRE = { minima: 18.5, maxima: 140 } as const

export const esIdVista = (valor: unknown): valor is IdVista =>
  typeof valor === 'string' && (ORDEN_VISTAS as readonly string[]).includes(valor)
