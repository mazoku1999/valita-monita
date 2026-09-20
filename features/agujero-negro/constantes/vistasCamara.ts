import { FOTOGRAMAS_CAMARA, type FotogramaCamara } from '../utils/fotogramasCamara'
import { ENCUADRE_PANTALLA, INCLINACION_PANTALLA } from './parametrosAgujero'

export type IdVista = 'canto' | 'anillo' | 'elevada' | 'elevadaCercana' | 'inferior' | 'cenital' | 'lejana'

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
  /** Gradiente de la bruma hacia la cara cercana (0 = simétrica, 1 = calibrado con la cámara alta y cerca). */
  readonly brumaCercana?: number
  /** Escala global de la bruma, incluida la de canto (1 = calibración original). */
  readonly brumaEscala?: number
  /**
   * Amplitud de la corona de dispersión que envuelve el gas (1 = calibrada de canto contra la
   * captura 22: el haz envuelto en un resplandor ancho y suave). Cada vista fija la suya.
   */
  readonly corona?: number
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
  /**
   * Peso mínimo de la FÍSICA fuera del plano (uElevada: fundido del gas, extinción del
   * dobladillo, apagado de la extinción rasante, surcos, viraje a crema). Por defecto, el mismo
   * que el del aspecto; una vista en el plano que quiere su propio aspecto sin esa física (la del
   * anillo) lo deja a 0.
   */
  readonly pesoMinimoFisica?: number
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
  // Corona efectiva 0.35 a 12.6° (este valor pesa 0.83 y el de canto, 1, el resto): es la
  // "falda" lisa bajo el borde del gas que mide la referencia elevada (0.50 sRGB a 1.6 R, 0.30
  // a 2.1 R y 0.16 a 3.1 R en la cara cercana); con la corona entera la falda salía al doble.
  corona: 0.22,
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
  // La referencia inferior deja el lado lejano casi negro más allá de 1.9 R (0.03 sRGB): la
  // corona, que también ilumina detrás del agujero, se contiene.
  corona: 0.15,
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
  anillo: {
    id: 'anillo',
    etiqueta: 'Ring',
    descripcion: 'Camera in the plane and close in: the blade runs straight through the photon ring, sparks all around it.',
    // Calibrado contra las capturas 11 y 14 del usuario (3456×1604): anillo de fotones de
    // 310 px = 39 % de la altura → 18.5–20 unidades a fov 40°; sombra en el 54 % del ancho y el
    // 32 % de la altura; el haz cruza el anillo por su centro: cámara exactamente en el plano
    // (a 1° la perspectiva ya lo convertía en una hoja gruesa).
    fotogramas: derivarRecorrido({ polar: Math.PI / 2, distancia: 19.5, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.09, y: 0.34 },
    // Física de canto (la cámara está en el plano) con su propio aspecto: en las capturas el haz
    // es una línea fina de chispas con un núcleo de gas discreto, no una hoja saturada, la sombra
    // queda oscura (0.10) dentro de un anillo de fotones nítido y las chispas salpican todo el
    // anillo y el haz. De ahí la ganancia baja del gas, la bruma mínima, el bloom corto y el
    // polvo vivo y nítido.
    aspecto: {
      // Ganancia de canto: bajarla (se probó 1.6 y 3.0) no adelgaza el haz, sólo lo apaga a un
      // naranja sin brillo; el haz debe ser crema saturado como en la captura. Lo que lo mantiene
      // estrecho tan cerca es el bloom mínimo.
      ganancia: 6.5,
      bruma: 0.15,
      // La bruma de canto (calibrada a 42 unidades) llenaría la sombra tan de cerca; en la captura
      // el interior del anillo queda oscuro (0.10 sRGB).
      brumaEscala: 0.3,
      luzArcos: 1,
      bloom: { umbral: 1.05, intensidad: 1.0, radio: 0.35 },
      polvoExposicion: 3.5,
      polvoLejano: 0.5,
      apertura: 0.5,
      tamanoMaximo: 14,
      dobladillo: 0,
      radioGas: 40,
      // En las capturas del anillo el haz es una línea fina y el interior queda oscuro (0.10
      // sRGB): la corona casi se apaga (con 0.4 el interior subía a 0.48 y con 0.08 a 0.23,
      // porque tan cerca los rayos que apuntan al agujero la cruzan entera y de frente).
      corona: 0.02,
    },
    pesoMinimoAspecto: 1,
    pesoMinimoFisica: 0,
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
  elevadaCercana: {
    id: 'elevadaCercana',
    etiqueta: 'Above close',
    descripcion: 'Camera 16° over the disk and close in: the near face fills the frame and covers the lower half of the shadow.',
    // Calibrado contra la captura 19 del usuario (3450×2084): anillo de fotones de 369 px = 35.4 %
    // de la altura → 20.8 unidades a fov 40°; sombra en el 52.4 % del ancho y el 32.9 % de la
    // altura. La cara cercana del gas cubre la sombra desde 0.36 R por debajo de su centro, lo que
    // (con la curvatura de los rayos) exige 16° de elevación; a lo largo del eje menor la referencia
    // lee 0.20 → 0.61 → 0.90 sRGB de arriba abajo dentro de la sombra (bruma más bloom de la cara
    // cercana), 0.97 en la cara cercana hasta r ≈ 8 y una capucha oscura (0.10–0.17) sobre ella.
    fotogramas: derivarRecorrido({ polar: Math.PI / 2 - 0.28, distancia: 20.8, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.048, y: 0.343 },
    aspecto: {
      ganancia: 6.5,
      // Bruma con gradiente hacia la cara cercana (brumaCercana): dentro de la sombra la referencia
      // lee 0.20 → 0.61 → 0.76 de arriba abajo y así se reproduce (0.26 → 0.63 → 0.68).
      bruma: 2.2,
      luzArcos: 0.03,
      bloom: { umbral: 0.6, intensidad: 2.0, radio: 0.8 },
      polvoExposicion: 2.4,
      polvoLejano: 0.5,
      apertura: 0.6,
      tamanoMaximo: 14,
      // Sin dobladillo ni fundido del gas: la cara cercana satura a crema hasta r ≈ 8 y sigue
      // en oro hasta 12, como en la referencia.
      dobladillo: 0,
      radioGas: 40,
      brumaCercana: 1,
      // El gradiente de la sombra (0.20 → 0.61 → 0.76) lo pone la bruma cercana; la corona
      // entera lo aplanaba (0.54 arriba) y doblaba la falda del lado lejano.
      corona: 0.15,
    },
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
    // El mismo roll que las demás vistas: desde arriba sólo gira la imagen del disco, y así
    // entrar o salir de esta vista no hace rotar toda la pantalla.
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0, y: 0.12 },
    aspecto: {
      ...ASPECTO_ELEVADO,
      // De frente el disco es ópticamente fino y con la ganancia elevada (5.2) toda la mitad
      // interna saturaba a un crema plano: con menos ganancia sólo el borde interno queda claro,
      // el resto es oro que se apaga hacia el borde y las estrías se ven.
      ganancia: 3.6,
      // Desde el cenit la corona se ve como un velo sobre el disco exterior (+0.08 sRGB entre 2
      // y 3.5 R con la corona entera): se contiene para que la superficie siga nítida.
      corona: 0.3,
      // De frente se ve todo el sistema de anillos a la vez: con la exposición elevada (1.8) los
      // 80 000 granos se leían como ruido de fondo; con la de canto quedan las chispas vivas.
      polvoExposicion: 0.9,
    },
    pesoMinimoAspecto: 0,
  },
  lejana: {
    id: 'lejana',
    etiqueta: 'Wide',
    descripcion: 'Camera far out, slightly above the plane: the whole ring system around the hole.',
    // Calibrado contra las capturas 5, 6, 13, 17 y 18 del usuario: anillo de 4.5–5.5 % de la
    // altura → 60–80 unidades; sombra en el 54–57 % del ancho y el 41–46 % de la altura; unos 5°
    // sobre el plano.
    fotogramas: derivarRecorrido({ polar: 1.45, distancia: 60, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: { x: 0.09, y: 0.13 },
    // De lejos y casi de canto (7°) el disco es una hoja saturada envuelta en un resplandor blando
    // tres veces mayor que ella, con la capucha del lado lejano asomando encima, y el polvo una
    // corriente tenue sin resolver: física de canto, ganancia de canto, bloom muy abierto y
    // exposición del polvo baja.
    aspecto: {
      ganancia: 6.5,
      bruma: 1.5,
      luzArcos: 1,
      bloom: { umbral: 0.5, intensidad: 3.2, radio: 0.9 },
      polvoExposicion: 0.5,
      polvoLejano: 0.5,
      apertura: 1,
      tamanoMaximo: 30,
      dobladillo: 0,
      radioGas: 40,
      // El resplandor blando de las capturas lejanas ya lo pone el bloom abierto; la corona
      // entera lo subía 0.1 sRGB entre 0.9 y 2.4 R.
      corona: 0.6,
    },
    pesoMinimoAspecto: 1,
    pesoMinimoFisica: 0,
  },
}

export const ORDEN_VISTAS: readonly IdVista[] = ['canto', 'anillo', 'elevada', 'elevadaCercana', 'inferior', 'cenital', 'lejana']

export const VISTA_INICIAL: IdVista = 'canto'

/**
 * Distancias a las que puede llegar el zoom libre. El mínimo entra en el borde del gas (17): las
 * capturas del usuario a ~15 unidades, con el anillo enorme y el haz cruzándolo, se ven bien.
 */
export const DISTANCIA_LIBRE = { minima: 13, maxima: 140 } as const

export const esIdVista = (valor: unknown): valor is IdVista =>
  typeof valor === 'string' && (ORDEN_VISTAS as readonly string[]).includes(valor)
