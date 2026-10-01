/** Una línea de la letra: cuándo empieza y acaba (s, reloj de la canción) y su texto (con sus saltos de línea). */
export interface LineaSrt {
  readonly inicio: number
  readonly fin: number
  readonly texto: string
}

const MARCA = /(\d+):(\d+):(\d+)[,.](\d+)/

const segundos = (marca: string): number => {
  const m = MARCA.exec(marca)
  if (!m) return Number.NaN
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000
}

/**
 * Lee un archivo de subtítulos .srt: bloques separados por líneas en blanco, cada uno con su número,
 * sus tiempos ("00:00:15,000 --> 00:00:19,500") y su texto (una o varias líneas: los saltos se
 * conservan, la maqueta los respeta). Se ignoran las etiquetas de formato y los bloques sin tiempos o
 * sin texto.
 */
export function leerSrt(contenido: string): LineaSrt[] {
  const lineas: LineaSrt[] = []
  for (const bloque of contenido.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const filas = bloque
      .split('\n')
      .map((fila) => fila.trim())
      .filter(Boolean)
    const conTiempos = filas.findIndex((fila) => fila.includes('-->'))
    if (conTiempos < 0) continue
    const [desde, hasta] = filas[conTiempos].split('-->')
    const inicio = segundos(desde)
    const fin = segundos(hasta)
    const texto = filas
      .slice(conTiempos + 1)
      .map((fila) => fila.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || !texto) continue
    lineas.push({ inicio, fin: Math.max(fin, inicio + 0.3), texto })
  }
  return lineas.sort((a, b) => a.inicio - b.inicio)
}
