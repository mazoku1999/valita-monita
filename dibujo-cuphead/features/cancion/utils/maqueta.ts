import type { LineaSrt } from './srt'

/**
 * La maqueta de la letra, como en los videos de letras: cada línea en filas cortas centradas, cada
 * fila con su voz tipográfica (una palo seco gruesa en cursiva, una de pie de alto contraste, una
 * condensada, una cursiva estrecha o una palo seco espaciada; ver `.letra-fila` en
 * `app/globals.css`; sin cambiar mayúsculas ni minúsculas), y las palabras que se encienden a
 * medida que se cantan.
 *
 * Todo sale del .srt, tal cual (lo pidió el usuario: sin alargar letras y con sus tiempos exactos):
 * cada palabra se muestra como está escrita, con su puntuación; las filas se reparten por largo
 * dentro de cada renglón del .srt; la voz de cada línea sale de su texto (si se repite, se ve
 * igual); el estribillo son las líneas que se repiten; las secciones se separan por las pausas
 * largas. Cada palabra se enciende en un tramo proporcional a sus sílabas (en español o en inglés)
 * al ritmo de la canción; si la línea dura más (una nota larga al final), la última palabra se queda
 * encendida hasta que acaba.
 */

export type EstiloFila = 'sans' | 'serif' | 'condensada' | 'cursiva' | 'espaciada'

export interface PalabraMaquetada {
  readonly texto: string
  /** La luz la recorre de `inicio` a `fin` (s, reloj de la canción). */
  readonly inicio: number
  readonly fin: number
  /** Con el color de la sección. */
  readonly acento: boolean
}

export interface FilaMaquetada {
  readonly palabras: readonly PalabraMaquetada[]
  readonly estilo: EstiloFila
  /** Escala del tamaño de letra: las filas cortas, más grandes. */
  readonly escala: number
}

export interface LineaMaquetada {
  readonly indice: number
  readonly inicio: number
  readonly fin: number
  readonly filas: readonly FilaMaquetada[]
  /** Del estribillo: su texto se repite en la canción. */
  readonly estribillo: boolean
  /** La última de un bloque (antes de una pausa larga o del final): algo más grande. */
  readonly cierre: boolean
  /** Las secciones se separan por pausas largas (para la paleta). */
  readonly seccion: number
}

const LETRAS_POR_FILA = 13
/** Alto máximo del bloque de una línea, en filas de tamaño base. */
const ALTO_MAXIMO = 5
/** Una pausa más larga que ésta (s) empieza otra sección. */
const PAUSA_SECCION = 4
/** El ritmo de la canción: lo que dura una sílaba cantada y el respiro entre palabras (s). */
const SILABA = 0.42
const ENTRE_PALABRAS = 0.05

const PLANTILLAS: readonly (readonly EstiloFila[])[] = [
  ['sans', 'sans', 'cursiva'],
  ['condensada', 'condensada', 'serif'],
  ['cursiva', 'cursiva', 'sans'],
  ['sans', 'condensada', 'serif'],
  ['serif', 'serif', 'espaciada'],
  ['condensada', 'sans', 'cursiva'],
]

/** Cuánto ocupa cada voz a igual tamaño (las estrechas pueden ir más grandes). */
const ANCHO_ESTILO: Record<EstiloFila, number> = {
  sans: 1,
  serif: 1.04,
  condensada: 1.24,
  cursiva: 1.2,
  espaciada: 0.9,
}

const QUITAR_ACENTOS = /[\u0300-\u036f]/g

const normalizar = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(QUITAR_ACENTOS, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const hash = (texto: string): number => {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const esEspanol = (texto: string): boolean => /[áéíóúñü¿¡]/i.test(texto)

/** Sílabas (aproximadas): en español, los grupos de vocales; en inglés, también, sin la e muda del final. */
function silabas(palabra: string, espanol: boolean): number {
  const letras = palabra.toLowerCase().normalize('NFD').replace(QUITAR_ACENTOS, '').replace(/[^a-z]/g, '')
  if (!letras) return 1
  if (espanol) return Math.max(1, (letras.match(/[aeiou]+/g) ?? []).length)
  if (letras.length <= 3) return 1
  const sinMuda = letras.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(1, (sinMuda.match(/[aeiouy]{1,2}/g) ?? []).length)
}

/** Las palabras de una línea, tal cual están escritas (con su puntuación). */
const palabrasDe = (texto: string): string[] => texto.split(/\s+/).filter(Boolean)

const letrasDe = (palabra: string): number => palabra.replace(/[^\p{L}\p{N}]/gu, '').length

const largoFila = (palabras: readonly string[]): number =>
  palabras.reduce((suma, palabra) => suma + palabra.length, 0) + Math.max(0, palabras.length - 1)

/** Reparte las palabras en filas seguidas: tantas como pida el largo, con la más larga lo más corta posible. */
function partirEnFilas(palabras: readonly string[]): string[][] {
  const filas = Math.min(palabras.length, Math.max(1, Math.ceil(largoFila(palabras) / LETRAS_POR_FILA)))
  let mejor: string[][] = [palabras.slice()]
  let mejorCoste = Number.POSITIVE_INFINITY
  const probar = (desde: number, hechas: string[][]): void => {
    if (hechas.length === filas - 1) {
      const resto = palabras.slice(desde)
      if (resto.length === 0) return
      const todas = [...hechas, resto]
      const largos = todas.map(largoFila)
      const coste = Math.max(...largos) * 100 + Math.max(...largos) - Math.min(...largos)
      if (coste < mejorCoste) {
        mejorCoste = coste
        mejor = todas
      }
      return
    }
    for (let hasta = desde + 1; hasta <= palabras.length - (filas - 1 - hechas.length); hasta++) {
      probar(hasta, [...hechas, palabras.slice(desde, hasta)])
    }
  }
  probar(0, [])
  return mejor
}

function maquetarLinea(
  linea: LineaSrt,
  indice: number,
  datos: { estribillo: boolean; cierre: boolean; seccion: number },
): LineaMaquetada {
  const palabras = palabrasDe(linea.texto)
  const duracion = linea.fin - linea.inicio
  const espanol = esEspanol(linea.texto)
  const silabasPorPalabra = palabras.map((palabra) => silabas(palabra, espanol))
  // Lo cantado al ritmo de la canción, dentro de la línea; si sobra (una nota larga), la última
  // palabra se queda encendida hasta el final.
  const nominal = silabasPorPalabra.reduce((a, b) => a + b, 0) * SILABA + palabras.length * ENTRE_PALABRAS
  const tramo = Math.min(duracion * 0.94, Math.max(nominal, duracion * 0.6))

  // Cada palabra se enciende en un tramo proporcional a sus sílabas (y un poco por ser palabra).
  const pesos = silabasPorPalabra.map((s) => s + 0.6)
  const pesoTotal = pesos.reduce((a, b) => a + b, 0)
  const ultima = palabras.length - 1
  const largos = palabras.map(letrasDe)
  const masLarga = largos.indexOf(Math.max(...largos))
  let reloj = linea.inicio
  const maquetadas: PalabraMaquetada[] = palabras.map((texto, i) => {
    const inicio = reloj
    const fin = inicio + (tramo * pesos[i]) / pesoTotal
    reloj = fin
    const acento = (i === ultima && largos[i] >= 4) || (i === masLarga && largos[i] >= 7) || (datos.cierre && i === ultima)
    return { texto, inicio, fin, acento }
  })

  const plantilla = PLANTILLAS[hash(normalizar(linea.texto)) % PLANTILLAS.length]
  const partidas = linea.texto
    .split('\n')
    .map(palabrasDe)
    .filter((renglon) => renglon.length > 0)
    .flatMap(partirEnFilas)
  let cursor = 0
  const filas: FilaMaquetada[] = partidas.map((fila, f) => {
    const palabrasFila = maquetadas.slice(cursor, cursor + fila.length)
    cursor += fila.length
    const estilo = f < partidas.length - 1 ? plantilla[Math.min(f, plantilla.length - 2)] : plantilla[plantilla.length - 1]
    const letras = largoFila(fila)
    const escala = Math.min(2.1, Math.min(1.9, Math.max(0.6, 12 / Math.max(letras, 4.5))) * ANCHO_ESTILO[estilo] * (datos.cierre ? 1.12 : 1))
    return { palabras: palabrasFila, estilo, escala }
  })
  // Las líneas largas (muchas filas) se achican para que el bloque no pase de ALTO_MAXIMO filas de
  // tamaño base y no tape la anterior ni la siguiente.
  const alto = filas.reduce((suma, fila) => suma + fila.escala * 1.06, 0)
  if (alto > ALTO_MAXIMO) {
    const factor = ALTO_MAXIMO / alto
    return { indice, inicio: linea.inicio, fin: linea.fin, filas: filas.map((fila) => ({ ...fila, escala: fila.escala * factor })), ...datos }
  }

  return { indice, inicio: linea.inicio, fin: linea.fin, filas, ...datos }
}

/** Maqueta toda la letra. */
export function maquetarLetra(lineas: readonly LineaSrt[]): LineaMaquetada[] {
  const veces = new Map<string, number>()
  for (const linea of lineas) {
    const clave = normalizar(linea.texto)
    veces.set(clave, (veces.get(clave) ?? 0) + 1)
  }
  let seccion = 0
  return lineas.map((linea, i) => {
    if (i > 0 && linea.inicio - lineas[i - 1].fin > PAUSA_SECCION) seccion++
    const siguiente = lineas[i + 1]
    return maquetarLinea(linea, i, {
      estribillo: (veces.get(normalizar(linea.texto)) ?? 0) > 1,
      cierre: !siguiente || siguiente.inicio - linea.fin > PAUSA_SECCION,
      seccion,
    })
  })
}
