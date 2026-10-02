import type { LineaEscenario, PalabraEscenario } from '../escenario/letrero'
import type { LineaSrt } from './srt'

/** Una pausa más larga que ésta (s) acaba un bloque de la letra. */
const PAUSA_BLOQUE = 4

/**
 * La letra para la cinta del escenario (ver `escenario/letrero.ts`): cada palabra tal cual está
 * escrita, con su hora, y los renglones del archivo. Si el archivo no trae la hora de cada palabra
 * (un .srt, sólo por líneas), se reparten por letras en lo que dura la línea.
 */
export function letraParaElEscenario(lineas: readonly LineaSrt[]): LineaEscenario[] {
  return lineas.map((linea) => {
    const renglones = linea.texto
      .split('\n')
      .map((renglon) => renglon.split(/\s+/).filter(Boolean))
      .filter((renglon) => renglon.length > 0)
    const textos = renglones.flat()
    const palabras: PalabraEscenario[] =
      linea.palabras && linea.palabras.length === textos.length
        ? linea.palabras.map(({ texto, inicio, fin }) => ({ texto, inicio, fin }))
        : repartir(textos, linea.inicio, linea.fin)
    return { inicio: linea.inicio, fin: linea.fin, palabras, renglones: renglones.map((renglon) => renglon.length) }
  })
}

function repartir(textos: readonly string[], inicio: number, fin: number): PalabraEscenario[] {
  const pesos = textos.map((texto) => texto.replace(/[^\p{L}\p{N}]/gu, '').length + 1)
  const total = pesos.reduce((a, b) => a + b, 0)
  const tramo = (fin - inicio) * 0.94
  let reloj = inicio
  return textos.map((texto, i) => {
    const desde = reloj
    reloj += (tramo * pesos[i]) / total
    return { texto, inicio: desde, fin: reloj }
  })
}

/** Dónde acaba el primer bloque de la letra (antes de su primera pausa larga), en s. */
export function finDelPrimerBloque(lineas: readonly LineaSrt[]): number {
  for (let i = 1; i < lineas.length; i++) if (lineas[i].inicio - lineas[i - 1].fin > PAUSA_BLOQUE) return lineas[i - 1].fin
  return lineas[lineas.length - 1]?.fin ?? 0
}
