import { TRANSICION_POLVO } from '../constantes/parametrosAgujero'
import { crearAleatorio, crearGaussiano, suavizar } from './aleatorio'

export interface AtributosPolvo {
  readonly posiciones: Float32Array
  readonly tamanos: Float32Array
  readonly tonos: Float32Array
  readonly brillos: Float32Array
  readonly fases: Float32Array
  readonly orbitas: Float32Array
  readonly total: number
}

interface Anillo {
  readonly radio: number
  readonly ancho: number
  readonly peso: number
  /** Arcos de escombros: número de máximos de densidad a lo largo del anillo, su fase y contraste. */
  readonly modo: number
  readonly faseArco: number
  readonly contraste: number
}

interface Escritor {
  indice: number
  escribir: (
    x: number,
    y: number,
    z: number,
    tamano: number,
    tono: number,
    brillo: number,
    orbita: number,
    fase: number,
  ) => void
}

/**
 * Población del campo. Se probó reducirla a 26 000 granos con 2.5× de energía cada uno y las
 * partículas se leían gruesas; la población original con el trazo fino del shader (suelo de
 * 1 px, sigma 0.36 px·dpr) es lo que da las chispas finas y separadas que pide el usuario.
 */
const CUENTAS = {
  // Las dos referencias del usuario (elevada e inferior) muestran un campo más denso que el
  // original de 66 000 granos: 3 200 chispas por encima de 0.06 sRGB en una ventana de 900×700 de
  // la inferior. Se sube ×1.43 con un 15 % menos de luz por grano; como los granos se rasterizan
  // finos (σ ≥ 0.22 px) siguen leyéndose como chispas y no como arena.
  anillos: 80000,
  relleno: 14000,
  // Cielo de fondo: muchas estrellas tenues y pocas vivas, como una distribución de magnitudes real.
  estrellasLejanas: 1400,
} as const

/** Compensación parcial de luz por grano tras subir la población (66 000 → 94 000). */
const ENERGIA_POR_GRANO = 0.85

const {
  inicio: R_INICIO,
  plenitud: R_PLENITUD,
  tamanoPleno: R_TAMANO,
  referenciaBrillo: R_BRILLO,
  brilloMaximo: BRILLO_MAXIMO,
  radioFinal: R_FIN,
} = TRANSICION_POLVO

/** Fracción de escombros que sobrevive como grano sólido: por dentro de `inicio` todo es gas. */
const supervivencia = (r: number): number => suavizar(R_INICIO, R_PLENITUD, r)

/**
 * Disrupción de marea: cuanto más cerca del agujero, más fragmentados están los escombros.
 * Los granos junto al gas son motas subpíxel; los lejanos, fragmentos que dan el bokeh.
 */
const escalaTamano = (r: number): number => 0.3 + 0.7 * suavizar(R_INICIO, R_TAMANO, r)

/**
 * Iluminados por el disco: el flujo recibido cae con el radio, y los granos que rozan el gas
 * (hasta ~16) además brillan por sí mismos al calentarse, para que el haz se disuelva en chispas.
 */
const brilloEn = (r: number): number =>
  ENERGIA_POR_GRANO * Math.pow(R_BRILLO / r, 1.0) * (1 + 0.25 * (1 - suavizar(R_INICIO, 16, r)))

const limitarBrillo = (brillo: number): number => Math.min(BRILLO_MAXIMO, brillo)

/** Mismo gradiente térmico que el gas: crema junto al disco, sepia en los anillos lejanos. */
export const tonoEn = (r: number): number => Math.min(1, Math.max(0, (r - R_INICIO - 0.5) / 45))

/**
 * Escala de altura ∝ r, como el gas al que rodean pero más gruesa: los escombros sin presión
 * conservan sus inclinaciones orbitales y forman una banda ancha de chispas alrededor del haz.
 * La altura generada es la amplitud de la órbita inclinada (su punto más alto); con fases
 * aleatorias la altura instantánea tiene varianza mitad, así que se multiplica por √2 para que
 * la banda visible conserve el grosor calibrado.
 */
export const grosorEn = (r: number): number => (0.05 + 0.04 * r) * Math.SQRT2

/**
 * Anillos concéntricos de escombros que continúan el disco de gas hacia fuera.
 * La separación crece con el radio (como las divisiones de un sistema de anillos) y la densidad
 * superficial cae con él: los anillos junto al gas son los más poblados y luminosos.
 */
const construirAnillos = (aleatorio: () => number): Anillo[] => {
  const anillos: Anillo[] = []
  let radio = R_INICIO
  while (radio < R_FIN) {
    anillos.push({
      radio,
      // Más estrechos que su separación (σ ≈ 0.35–0.4 del hueco de media): cada anillo se lee
      // como una fila propia en perspectiva, con los bordes lo bastante difusos para fundirse con
      // sus vecinos en un gradiente y no en aros aislados. La anchura varía de anillo a anillo
      // (0.55–1.45×): los hay afilados y los hay difusos, como en un sistema de anillos real.
      ancho: (0.14 + 0.035 * radio) * (0.55 + 0.9 * aleatorio()),
      // Caída pronunciada: los anillos que pasan junto a la cámara (r ≈ 40) deben ser escasos
      // para que el bokeh cercano sean unas pocas motas y no una nube por toda la pantalla.
      // La caída era 1.9; en la referencia elevada los anillos exteriores (r ≈ 30–60, que rodean
      // a la cámara) siguen poblados y llenan de chispas la mitad inferior de la pantalla.
      peso: Math.pow(R_BRILLO / radio, 1.15) * supervivencia(radio) * (0.6 + 0.8 * aleatorio()),
      // Los escombros no se reparten uniformes por la órbita: se agrupan en arcos, como los
      // anillos de Neptuno. Cada anillo tiene entre 1 y 4 arcos y un contraste propio.
      modo: 1 + Math.floor(aleatorio() * 4),
      faseArco: aleatorio() * Math.PI * 2,
      contraste: 0.25 + 0.6 * aleatorio(),
    })
    // Separación irregular (0.45–1.55× la nominal): visto desde arriba, un espaciado regular se
    // leía como los surcos de un disco de vinilo.
    radio += (0.8 + 0.065 * radio) * (0.45 + 1.1 * aleatorio())
  }
  return anillos
}

/**
 * Densidad relativa de un anillo en el azimut dado por sus arcos (1 en las crestas). El azimut
 * que cuenta es el REAL del grano en t = 0, que incluye la fase orbital aleatoria con la que el
 * shader lo coloca sobre su órbita; como los arcos giran con los propios escombros, el patrón
 * queda fijo en el sistema comóvil del anillo y basta con aplicarlo al generar.
 */
const densidadArco = (anillo: Anillo, azimut: number): number =>
  1 - anillo.contraste * Math.pow(0.5 - 0.5 * Math.cos(anillo.modo * azimut + anillo.faseArco), 1.5)

const elegirAnillo = (anillos: readonly Anillo[], pesoTotal: number, aleatorio: () => number): Anillo => {
  let objetivo = aleatorio() * pesoTotal
  for (const anillo of anillos) {
    objetivo -= anillo.peso
    if (objetivo <= 0) return anillo
  }
  return anillos[anillos.length - 1]
}

/**
 * Ley de potencias continua, como la distribución de tamaños de los escombros reales: la mayoría
 * son motas finas y la cola larga da unos pocos granos grandes para el bokeh. Sin clases
 * discretas, los tamaños en pantalla varían de forma gradual.
 */
const elegirTamano = (aleatorio: () => number): number => {
  const u = aleatorio()
  return Math.min(1.4, 0.16 * Math.pow(1 - 0.995 * u, -0.45))
}

export function generarPolvoEstelar(semilla = 20260806): AtributosPolvo {
  const total = CUENTAS.anillos + CUENTAS.relleno + CUENTAS.estrellasLejanas
  const posiciones = new Float32Array(total * 3)
  const tamanos = new Float32Array(total)
  const tonos = new Float32Array(total)
  const brillos = new Float32Array(total)
  const fases = new Float32Array(total)
  const orbitas = new Float32Array(total)

  const aleatorio = crearAleatorio(semilla)
  const gaussiano = crearGaussiano(aleatorio)

  const escritor: Escritor = {
    indice: 0,
    escribir(x, y, z, tamano, tono, brillo, orbita, fase) {
      const i = this.indice
      posiciones[i * 3] = x
      posiciones[i * 3 + 1] = y
      posiciones[i * 3 + 2] = z
      tamanos[i] = tamano
      tonos[i] = tono
      brillos[i] = brillo
      fases[i] = fase
      orbitas[i] = orbita
      this.indice += 1
    },
  }

  const anillos = construirAnillos(aleatorio)
  const pesoTotal = anillos.reduce((suma, anillo) => suma + anillo.peso, 0)

  // Muestreo por rechazo contra los arcos de cada anillo hasta completar la población: los
  // huecos entre arcos quedan ralos de verdad, no sólo más tenues.
  let granosAnillos = 0
  while (granosAnillos < CUENTAS.anillos) {
    const anillo = elegirAnillo(anillos, pesoTotal, aleatorio)
    const angulo = aleatorio() * Math.PI * 2
    const fase = aleatorio()
    if (aleatorio() > densidadArco(anillo, angulo + fase * Math.PI * 2)) continue
    const r = Math.max(R_INICIO, anillo.radio + gaussiano() * anillo.ancho)
    const y = gaussiano() * grosorEn(r)
    // Destellos: un 10 % de chispas triples y un 2 % quíntuples, las estrellitas del enjambre.
    const azar = aleatorio()
    const destello = azar < 0.02 ? 5.0 : azar < 0.12 ? 3.0 : 1
    const brillo = limitarBrillo(brilloEn(r) * (0.3 + 0.7 * Math.pow(aleatorio(), 1.6)) * destello)
    const tamano = elegirTamano(aleatorio) * escalaTamano(r)
    escritor.escribir(Math.cos(angulo) * r, y, Math.sin(angulo) * r, tamano, tonoEn(r), brillo, 1, fase)
    granosAnillos += 1
  }

  // Relleno tenue entre anillos para que la banda se lea continua y no como aros aislados.
  for (let i = 0; i < CUENTAS.relleno; i += 1) {
    const r = R_INICIO + (R_FIN - R_INICIO) * Math.pow(aleatorio(), 1.9)
    if (aleatorio() > supervivencia(r)) continue
    const angulo = aleatorio() * Math.PI * 2
    const y = gaussiano() * grosorEn(r) * 1.6
    const brillo = limitarBrillo(brilloEn(r) * (0.15 + 0.45 * aleatorio()))
    const tamano = elegirTamano(aleatorio) * escalaTamano(r)
    escritor.escribir(Math.cos(angulo) * r, y, Math.sin(angulo) * r, tamano, tonoEn(r), brillo, 1, aleatorio())
  }

  // Estrellas de fondo: pocas, blancas y fijas, en una esfera lejana.
  for (let i = 0; i < CUENTAS.estrellasLejanas; i += 1) {
    const r = 420 + 500 * aleatorio()
    const u = aleatorio() * 2 - 1
    const angulo = aleatorio() * Math.PI * 2
    const radial = Math.sqrt(1 - u * u)
    // Ley de magnitudes: la gran mayoría diminutas y tenues; un puñado, brillantes.
    const magnitud = Math.pow(aleatorio(), 3)
    const tamano = 12 + 34 * magnitud
    const brillo = 0.18 + 1.1 * magnitud
    escritor.escribir(Math.cos(angulo) * radial * r, u * r, Math.sin(angulo) * radial * r, tamano, 0, brillo, 0, aleatorio())
  }

  // Los granos descartados en el relleno dejan huecos al final del buffer: se recorta al total real.
  const usados = escritor.indice
  return {
    posiciones: posiciones.subarray(0, usados * 3),
    tamanos: tamanos.subarray(0, usados),
    tonos: tonos.subarray(0, usados),
    brillos: brillos.subarray(0, usados),
    fases: fases.subarray(0, usados),
    orbitas: orbitas.subarray(0, usados),
    total: usados,
  }
}
