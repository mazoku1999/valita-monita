import type { LineaSrt } from './srt'

/**
 * La maqueta de la letra, como en los videos de letras: cada línea en filas cortas centradas, cada
 * fila con su voz tipográfica (una palo seco gruesa en cursiva, una de pie de alto contraste, una
 * condensada en mayúsculas, una cursiva estrecha o mayúsculas espaciadas; ver `.letra-fila` en
 * `app/globals.css`), las palabras que se encienden a medida que se cantan y, en las notas largas
 * del final de una línea, la última vocal que se estira.
 *
 * Todo sale del .srt (no hay nada escrito a mano para esta canción): las filas se reparten por
 * largo, la voz de cada línea sale de su texto (si se repite, se ve igual), el estribillo son las
 * líneas que se repiten, las secciones se separan por las pausas largas y cada palabra se enciende
 * en un tramo proporcional a sus sílabas dentro del tiempo de su línea.
 */

export type EstiloFila = 'sans' | 'serif' | 'condensada' | 'cursiva' | 'espaciada'

/** La nota sostenida al final de una línea: la palabra partida en lo de antes, la vocal y lo de después. */
export interface Estirada {
  readonly antes: string
  readonly vocal: string
  readonly despues: string
  /** Cuántas vocales más se añaden, una a una, de `desde` a `hasta` (s, reloj de la canción). */
  readonly veces: number
  readonly desde: number
  readonly hasta: number
}

export interface PalabraMaquetada {
  readonly texto: string
  /** La luz la recorre de `inicio` a `fin` (s, reloj de la canción). */
  readonly inicio: number
  readonly fin: number
  /** Con el color de la sección. */
  readonly acento: boolean
  readonly estirada: Estirada | null
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
/** Una pausa más larga que ésta (s) empieza otra sección. */
const PAUSA_SECCION = 4
/** Tiempo nominal de una sílaba cantada y el respiro entre palabras (s). */
const SILABA = 0.23
const ENTRE_PALABRAS = 0.07
/** Si sobra más que esto (s) al final de la línea, la última vocal se estira. */
const SOSTENIDO_MINIMO = 1.5

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
  espaciada: 0.8,
}

const normalizar = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

const silabas = (palabra: string): number => Math.max(1, (palabra.toLowerCase().match(/[aeiouáéíóúü]+/g) ?? []).length)

/** Las palabras de una línea, sin la puntuación de los bordes (las letras van sin ella). */
const palabrasDe = (texto: string): string[] =>
  texto
    .split(/\s+/)
    .map((palabra) => palabra.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)

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

/** Parte la palabra por su última vocal (la que se sostiene): "sol" → s · o · l; "atrás" → atrá · a · s. */
function partirPorLaVocal(palabra: string): { antes: string; vocal: string; despues: string } | null {
  const grupos = [...palabra.matchAll(/[aeiouáéíóúü]+/gi)]
  const ultimo = grupos[grupos.length - 1]
  if (!ultimo || ultimo.index === undefined) return null
  const fin = ultimo.index + ultimo[0].length
  const letra = palabra[fin - 1]
  const vocal = letra.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return { antes: palabra.slice(0, fin), vocal, despues: palabra.slice(fin) }
}

function maquetarLinea(
  linea: LineaSrt,
  indice: number,
  datos: { estribillo: boolean; cierre: boolean; seccion: number },
): LineaMaquetada {
  const palabras = palabrasDe(linea.texto)
  const duracion = linea.fin - linea.inicio
  const silabasPorPalabra = palabras.map(silabas)
  const nominal = silabasPorPalabra.reduce((a, b) => a + b, 0) * SILABA + palabras.length * ENTRE_PALABRAS
  const cantado = Math.min(duracion * 0.9, Math.max(nominal * 1.1, duracion * 0.55))
  const ultima = palabras.length - 1
  const partida = ultima >= 0 ? partirPorLaVocal(palabras[ultima]) : null
  const sostenido = duracion - cantado
  const estira = partida !== null && sostenido >= SOSTENIDO_MINIMO
  const tramo = estira ? cantado : duracion * 0.9

  // Cada palabra se enciende en un tramo proporcional a sus sílabas (y un poco por ser palabra).
  const pesos = silabasPorPalabra.map((s) => s + 0.6)
  const pesoTotal = pesos.reduce((a, b) => a + b, 0)
  const largos = palabras.map((palabra) => palabra.length)
  const masLarga = largos.indexOf(Math.max(...largos))
  let reloj = linea.inicio + 0.05
  const maquetadas: PalabraMaquetada[] = palabras.map((texto, i) => {
    const inicio = reloj
    const fin = inicio + (tramo * pesos[i]) / pesoTotal
    reloj = fin
    const acento = (i === ultima && largos[i] >= 4) || (i === masLarga && largos[i] >= 7) || (datos.cierre && i === ultima)
    const estirada: Estirada | null =
      estira && i === ultima && partida
        ? {
            ...partida,
            veces: Math.max(2, Math.min(7, Math.round(sostenido / 0.45))),
            desde: fin,
            hasta: linea.fin - 0.15,
          }
        : null
    return { texto, inicio, fin, acento, estirada }
  })

  const plantilla = PLANTILLAS[hash(normalizar(linea.texto)) % PLANTILLAS.length]
  const partidas = partirEnFilas(palabras)
  let cursor = 0
  const filas: FilaMaquetada[] = partidas.map((fila, f) => {
    const palabrasFila = maquetadas.slice(cursor, cursor + fila.length)
    cursor += fila.length
    const estilo = f < partidas.length - 1 ? plantilla[Math.min(f, plantilla.length - 2)] : plantilla[plantilla.length - 1]
    const extra = palabrasFila.reduce((suma, palabra) => suma + (palabra.estirada ? palabra.estirada.veces * 0.8 : 0), 0)
    const letras = largoFila(fila) + extra
    const escala = Math.min(2.1, Math.min(1.9, Math.max(0.6, 12 / Math.max(letras, 4.5))) * ANCHO_ESTILO[estilo] * (datos.cierre ? 1.12 : 1))
    return { palabras: palabrasFila, estilo, escala }
  })

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
