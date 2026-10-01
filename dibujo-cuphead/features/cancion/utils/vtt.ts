import type { LineaSrt, PalabraSrt } from './srt'

/** Una marca de tiempo de WebVTT: "hh:mm:ss.mmm" o "mm:ss.mmm". */
const MARCA = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/

const segundos = (marca: string): number => {
  const m = MARCA.exec(marca.trim())
  if (!m) return Number.NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000
}

/**
 * Lee un archivo WebVTT con marcas de tiempo por palabra (el formato de karaoke del estándar):
 *
 *     00:00:17.100 --> 00:00:24.250
 *     <00:00:17.100>I <00:00:17.600>know <00:00:18.020>that …
 *
 * Cada marca dice cuándo empieza lo que la sigue: una palabra (o varias, que se reparten el tramo) o,
 * si sólo la sigue un espacio, un silencio que cierra la palabra anterior (una respiración). Cada
 * palabra acaba donde empieza lo siguiente y la última, al final de la línea. Se ignoran las demás
 * etiquetas (<c>, <i>, <v …>), los bloques NOTE y STYLE y las líneas sin texto.
 */
export function leerVtt(contenido: string): LineaSrt[] {
  const lineas: LineaSrt[] = []
  const bloques = contenido.replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/)
  for (const bloque of bloques) {
    const filas = bloque.split('\n').filter((fila) => fila.trim() !== '')
    const conTiempos = filas.findIndex((fila) => fila.includes('-->'))
    if (conTiempos < 0) continue
    const [desde, resto] = filas[conTiempos].split('-->')
    const inicio = segundos(desde)
    const fin = segundos(resto.trim().split(/\s+/)[0] ?? '')
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) continue

    // Tramos: [cuándo empiezan, texto]; el primero, desde el comienzo de la línea.
    const tramos: { t: number; texto: string; salto: boolean }[] = []
    filas.slice(conTiempos + 1).forEach((fila, f) => {
      const partes = fila.replace(/<(?!\d)[^>]*>/g, '').split(/<([\d:.,]+)>/)
      partes.forEach((parte, k) => {
        if (k % 2 === 1) {
          tramos.push({ t: segundos(parte), texto: '', salto: false })
        } else {
          if (tramos.length === 0) tramos.push({ t: inicio, texto: '', salto: false })
          const ultimo = tramos[tramos.length - 1]
          if (f > 0 && k === 0) ultimo.texto += '\n'
          ultimo.texto += parte
        }
      })
    })
    const palabras: PalabraSrt[] = []
    const renglones: string[][] = [[]]
    tramos.forEach((tramo, k) => {
      const t0 = Number.isFinite(tramo.t) ? Math.min(Math.max(tramo.t, inicio), fin) : inicio
      const t1 = k + 1 < tramos.length && Number.isFinite(tramos[k + 1].t) ? Math.min(Math.max(tramos[k + 1].t, t0), fin) : fin
      const piezas = tramo.texto.split(/(\n)|\s+/).filter((pieza) => pieza !== undefined && pieza !== '')
      const enTramo = piezas.filter((pieza) => pieza !== '\n')
      let i = 0
      for (const pieza of piezas) {
        if (pieza === '\n') {
          if (renglones[renglones.length - 1].length > 0) renglones.push([])
          continue
        }
        const a = t0 + ((t1 - t0) * i) / enTramo.length
        const b = t0 + ((t1 - t0) * (i + 1)) / enTramo.length
        palabras.push({ texto: pieza, inicio: a, fin: Math.max(b, a + 0.05) })
        renglones[renglones.length - 1].push(pieza)
        i++
      }
    })
    if (palabras.length === 0) continue
    lineas.push({
      inicio,
      fin,
      texto: renglones
        .filter((renglon) => renglon.length > 0)
        .map((renglon) => renglon.join(' '))
        .join('\n'),
      palabras,
    })
  }
  return lineas.sort((a, b) => a.inicio - b.inicio)
}
