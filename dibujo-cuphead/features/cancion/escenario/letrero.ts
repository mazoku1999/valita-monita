import { type Pincel, type Punto, limitar, mezclar, rebote, suave } from './pincel'

/**
 * La letra del escenario, como en los dibujos animados de los años 30: cada línea en una cinta de
 * papel con sus colas dobladas (siempre derecha, con una sola letra de época, Corben, quieta), en
 * tinta sepia; cada palabra se vuelve roja cuando se canta y un girasol pequeño salta de palabra en
 * palabra como la "pelotita" de las canciones de Fleischer: cae justo sobre cada palabra al
 * cantarse, se aplasta al caer y se estira en el aire. La cinta se despliega cuando una línea
 * llega tras una pausa y, si llega enseguida, se voltea como un cartel.
 */

export interface PalabraEscenario {
  readonly texto: string
  readonly inicio: number
  readonly fin: number
}

export interface LineaEscenario {
  readonly inicio: number
  readonly fin: number
  readonly palabras: readonly PalabraEscenario[]
  /** Cuántas palabras van en cada renglón (los saltos de línea de la letra). */
  readonly renglones: readonly number[]
}

const CREMA = '#f3e3bf'
const CREMA_COLA = '#d9c193'
const CREMA_PLIEGUE = '#b99c6a'
const TINTA_TEXTO = '#3a2416'
export const ROJO = '#bf3324'

/** Cuándo llega cada línea a la cinta (un poco antes de su primera palabra). */
function llegada(lineas: readonly LineaEscenario[], i: number): number {
  const linea = lineas[i]
  let t = linea.inicio - 0.38
  const anterior = lineas[i - 1]
  if (anterior) {
    // Que el girasol haya caído en la última palabra de la anterior.
    const ultima = anterior.palabras[anterior.palabras.length - 1]
    t = Math.max(t, Math.min(linea.inicio - 0.12, ultima.inicio + 0.25))
  }
  return t
}

const vieneDePausa = (lineas: readonly LineaEscenario[], i: number): boolean =>
  i === 0 || llegada(lineas, i) - lineas[i - 1].fin > 1.0

/** La línea que muestra la cinta en `t` y cómo está (desplegándose o volteándose). */
export function estadoCinta(lineas: readonly LineaEscenario[], t: number): { indice: number; ex: number; ey: number } | null {
  let indice = -1
  for (let i = 0; i < lineas.length; i++) if (llegada(lineas, i) <= t) indice = i
  if (indice < 0) return null
  const linea = lineas[indice]
  let ex = 1
  let ey = 1
  const siguiente = indice + 1 < lineas.length ? llegada(lineas, indice + 1) : Infinity
  if (siguiente - linea.fin > 1.0) {
    // Tras la última palabra, la cinta se enrolla.
    const s = (t - (linea.fin + 0.35)) / 0.26
    if (s >= 1) return null
    if (s > 0) ex = 1 - suave(s)
  } else {
    // Llega otra enseguida: se voltea.
    const s = (t - (siguiente - 0.12)) / 0.12
    if (s > 0) ey = 1 - suave(s)
  }
  const pausa = vieneDePausa(lineas, indice)
  const e = (t - llegada(lineas, indice)) / (pausa ? 0.36 : 0.2)
  if (e < 1) {
    if (pausa) ex *= Math.max(0.02, rebote(e))
    else ey *= Math.max(0.02, rebote(e))
  }
  return { indice, ex, ey }
}

interface PalabraColocada {
  readonly texto: string
  readonly inicio: number
  readonly x: number
  readonly ancho: number
  readonly y: number
}

interface Maqueta {
  readonly tamano: number
  readonly palabras: readonly PalabraColocada[]
  readonly ancho: number
  readonly alto: number
  readonly cx: number
  readonly cy: number
}

/**
 * Coloca una línea en la cinta: los renglones de la letra (partidos si no caben), con la letra lo
 * más grande que quepa. Las posiciones son relativas al centro de la cinta.
 */
function maquetar(ctx: CanvasRenderingContext2D, linea: LineaEscenario, ancho: number, alto: number, familia: string): Maqueta {
  const maximo = ancho * 0.8
  let tamano = Math.min(alto * 0.064, ancho * 0.078)
  const minimo = tamano * 0.66
  const medir = (texto: string): number => ctx.measureText(texto).width
  // Los renglones de la letra.
  let renglones: PalabraEscenario[][] = []
  let k = 0
  for (const cuantas of linea.renglones) {
    renglones.push(linea.palabras.slice(k, k + cuantas))
    k += cuantas
  }
  if (k < linea.palabras.length) renglones.push(linea.palabras.slice(k))
  renglones = renglones.filter((r) => r.length > 0)
  const anchoRenglon = (r: PalabraEscenario[]): number => medir(r.map((p) => p.texto).join(' '))
  ctx.font = `700 ${tamano}px ${familia}`
  const mayor = Math.max(...renglones.map(anchoRenglon))
  if (mayor > maximo) tamano = Math.max(minimo, (tamano * maximo) / mayor)
  ctx.font = `700 ${tamano}px ${familia}`
  // Si aún no cabe, se parte el renglón por palabras.
  const partidos: PalabraEscenario[][] = []
  for (const r of renglones) {
    let actual: PalabraEscenario[] = []
    for (const p of r) {
      const prueba = [...actual, p]
      if (actual.length > 0 && anchoRenglon(prueba) > maximo) {
        partidos.push(actual)
        actual = [p]
      } else actual = prueba
    }
    if (actual.length) partidos.push(actual)
  }
  const espacio = medir(' ')
  // Con varios renglones, algo más de aire entre ellos: el girasol salta por encima de cada uno.
  const altoRenglon = tamano * (partidos.length > 1 ? 1.42 : 1.22)
  const palabras: PalabraColocada[] = []
  partidos.forEach((r, f) => {
    const anchos = r.map((p) => medir(p.texto))
    const total = anchos.reduce((a, b) => a + b, 0) + espacio * (r.length - 1)
    let x = -total / 2
    const y = (f - (partidos.length - 1) / 2) * altoRenglon + tamano * 0.34
    r.forEach((p, i) => {
      palabras.push({ texto: p.texto, inicio: p.inicio, x, ancho: anchos[i], y })
      x += anchos[i] + espacio
    })
  })
  const anchoMaximo = Math.max(...partidos.map((r) => anchoRenglon(r)))
  const anchoCinta = Math.min(ancho * 0.94, anchoMaximo + tamano * 2.2)
  const altoCinta = partidos.length * altoRenglon + tamano * 0.85
  // Abajo, bajo el portal del túnel (o sobre su borde de abajo).
  const cy = Math.min(alto * 0.83, alto - altoCinta / 2 - alto * 0.035)
  return { tamano, palabras, ancho: anchoCinta, alto: altoCinta, cx: ancho / 2, cy }
}

/** Dibuja la cinta (cuerpo arqueado, colas dobladas y su sombra), centrada en el origen. */
export function cinta(p: Pincel, ancho: number, alto: number, id: number): void {
  const ctx = p.ctx
  // El arco de la cinta, sin pasarse en las altas y estrechas (tapaba el último renglón).
  const arco = Math.min(alto * 0.14, ancho * 0.03)
  const borde = (x: number, arriba: boolean): Punto => {
    const k = 1 - Math.pow((2 * x) / ancho, 2)
    return [x, (arriba ? -alto / 2 : alto / 2) - arco * k]
  }
  const cuerpo: Punto[] = []
  const pasos = 10
  for (let i = 0; i <= pasos; i++) cuerpo.push(borde(-ancho / 2 + (ancho * i) / pasos, true))
  for (let i = pasos; i >= 0; i--) cuerpo.push(borde(-ancho / 2 + (ancho * i) / pasos, false))
  // Las colas, detrás y un poco más abajo, con su muesca; y el doblez entre cola y cuerpo.
  const largoCola = alto * 0.95
  for (const lado of [-1, 1]) {
    const x0 = lado * (ancho / 2 - alto * 0.25)
    const x1 = lado * (ancho / 2 + largoCola)
    const y0 = -alto * 0.28
    const y1 = alto * 0.72
    const muesca = lado * alto * 0.38
    const cola: Punto[] = [
      [x0, y0],
      [x1, y0],
      [x1 - muesca, (y0 + y1) / 2],
      [x1, y1],
      [x0, y1],
    ]
    ctx.save()
    ctx.translate(alto * 0.1, alto * 0.16)
    p.forma(cola, '#1d120b', id + 20 + lado, { tinta: false, liso: true, opacidad: 0.28, temblor: 0 })
    ctx.restore()
    p.forma(cola, CREMA_COLA, id + 30 + lado, { grosor: p.trazo * 0.9 })
    const esquina = borde(lado * (ancho / 2), false)
    const doblez: Punto[] = [
      [lado * (ancho / 2 - alto * 0.25), y1],
      [esquina[0], esquina[1]],
      [lado * (ancho / 2 - alto * 0.25), esquina[1] + alto * 0.02],
    ]
    p.forma(doblez, CREMA_PLIEGUE, id + 40 + lado, { grosor: p.trazo * 0.8 })
  }
  ctx.save()
  ctx.translate(alto * 0.1, alto * 0.16)
  p.forma(cuerpo, '#1d120b', id + 3, { tinta: false, liso: true, opacidad: 0.3, temblor: 0 })
  ctx.restore()
  p.forma(cuerpo, CREMA, id + 4)
}

/** El girasol pequeño que salta de palabra en palabra (aplastado `sy`, estirado `sx`). */
function girasolito(p: Pincel, x: number, y: number, radio: number, sx: number, sy: number, id: number): void {
  const ctx = p.ctx
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(sx, sy)
  const n = 11
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + 0.2
    p.forma(p.petalo(Math.cos(a) * radio * 0.4, Math.sin(a) * radio * 0.4, a, radio * 0.7, radio * 0.36), i % 2 ? '#f7c53c' : '#fbd458', id + i, {
      grosor: p.trazo * 0.45,
      liso: true,
    })
  }
  p.forma(p.circulo(0, 0, radio * 0.46, 12), '#6a3b1b', id + 50, { grosor: p.trazo * 0.5, liso: true })
  p.forma(p.circulo(-radio * 0.14, -radio * 0.16, radio * 0.13, 8), '#a8693a', id + 51, { tinta: false, liso: true })
  ctx.restore()
}

const cacheMaquetas = new Map<string, Maqueta>()

/** Dibuja la cinta con la línea que toque en `t`, su karaoke y el girasol que salta. */
export function dibujarLetrero(p: Pincel, lineas: readonly LineaEscenario[], t: number, familia: string): void {
  const estado = estadoCinta(lineas, t)
  if (!estado) return
  const ctx = p.ctx
  const { width: ancho, height: alto } = ctx.canvas
  const linea = lineas[estado.indice]
  const clave = `${estado.indice}|${ancho}x${alto}|${familia}`
  let m = cacheMaquetas.get(clave)
  if (!m) {
    if (cacheMaquetas.size > 120) cacheMaquetas.clear()
    m = maquetar(ctx, linea, ancho, alto, familia)
    cacheMaquetas.set(clave, m)
  }
  const id = 9000 + estado.indice * 101
  ctx.save()
  ctx.translate(m.cx, m.cy)
  ctx.scale(estado.ex, estado.ey)
  cinta(p, m.ancho, m.alto, id)
  // La letra, derecha y quieta: en tinta sepia, y roja en cuanto se canta.
  if (estado.ex > 0.6 && estado.ey > 0.25) {
    ctx.font = `700 ${m.tamano}px ${familia}`
    ctx.textBaseline = 'alphabetic'
    for (const w of m.palabras) {
      ctx.fillStyle = t >= w.inicio ? ROJO : TINTA_TEXTO
      ctx.fillText(w.texto, w.x, w.y)
    }
    pelotita(p, m, t, llegada(lineas, estado.indice), id)
  }
  ctx.restore()
}

/** La "pelotita": cae en cada palabra al cantarse; entre una y otra, un salto en arco. */
function pelotita(p: Pincel, m: Maqueta, t: number, desde: number, id: number): void {
  const palabras = m.palabras
  if (palabras.length === 0) return
  const radio = m.tamano * 0.36
  // Posado sobre la palabra (la altura de las mayúsculas de la letra es unas 0.72 del cuerpo).
  const sobre = (k: number): [number, number] => [palabras[k].x + palabras[k].ancho / 2, palabras[k].y - m.tamano * 0.74 - radio]
  let k = -1
  for (let i = 0; i < palabras.length; i++) if (t >= palabras[i].inicio) k = i
  let x: number
  let y: number
  let sx = 1
  let sy = 1
  if (k < 0) {
    // Entra por la izquierda y cae en la primera palabra justo cuando se canta.
    const [x1, y1] = sobre(0)
    const x0 = -m.ancho / 2 - m.tamano * 0.6
    const y0 = y1 - m.tamano * 1.6
    const u = limitar((t - Math.min(desde, palabras[0].inicio - 0.4)) / Math.max(0.2, palabras[0].inicio - Math.min(desde, palabras[0].inicio - 0.4)))
    x = mezclar(x0, x1, u)
    y = mezclar(y0, y1, u) - m.tamano * 1.1 * 4 * u * (1 - u)
  } else if (k + 1 < palabras.length) {
    const [x0, y0] = sobre(k)
    const [x1, y1] = sobre(k + 1)
    const s0 = palabras[k].inicio
    const s1 = palabras[k + 1].inicio
    const vuelo = Math.min(s1 - s0, 0.5)
    const u = limitar((t - (s1 - vuelo)) / vuelo)
    const altura = Math.min(m.tamano * 2.1, Math.max(m.tamano * 0.85, Math.abs(x1 - x0) * 0.4))
    x = mezclar(x0, x1, u)
    y = mezclar(y0, y1, u) - altura * 4 * u * (1 - u)
    if (u > 0 && u < 1) {
      sy = 1.12
      sx = 0.9
    }
  } else {
    ;[x, y] = sobre(k)
  }
  // Al caer, se aplasta un instante.
  if (k >= 0) {
    const desdeCaida = t - palabras[k].inicio
    if (desdeCaida < 0.12) {
      const a = 1 - desdeCaida / 0.12
      sy = 1 - 0.34 * a
      sx = 1 + 0.3 * a
      y += radio * 0.34 * a
    }
  }
  girasolito(p, x, y, radio, sx, sy, id + 500)
}

/**
 * Una cinta con frases fijas (el mensaje del final), centrada en (cx, cy) y con la letra de
 * `tamano`; `ex` la despliega (0 enrollada, 1 abierta).
 */
export function cintaConFrases(
  p: Pincel,
  frases: readonly string[],
  cx: number,
  cy: number,
  tamano: number,
  familia: string,
  ex: number,
  id: number,
): void {
  if (ex <= 0.01) return
  const ctx = p.ctx
  ctx.font = `700 ${tamano}px ${familia}`
  const anchos = frases.map((frase) => ctx.measureText(frase).width)
  const altoRenglon = tamano * (frases.length > 1 ? 1.32 : 1.22)
  const ancho = Math.max(...anchos) + tamano * 2.2
  const alto = frases.length * altoRenglon + tamano * 0.85
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(ex, 1)
  cinta(p, ancho, alto, id)
  if (ex > 0.6) {
    ctx.font = `700 ${tamano}px ${familia}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = ROJO
    frases.forEach((frase, i) => ctx.fillText(frase, -anchos[i] / 2, (i - (frases.length - 1) / 2) * altoRenglon + tamano * 0.34))
  }
  ctx.restore()
}

/** El ancho de la frase más larga con la letra de 1 px (para escoger el tamaño que quepa). */
export function anchoDeFrases(ctx: CanvasRenderingContext2D, frases: readonly string[], familia: string): number {
  ctx.save()
  ctx.font = `700 100px ${familia}`
  const ancho = Math.max(...frases.map((frase) => ctx.measureText(frase).width)) / 100
  ctx.restore()
  return ancho
}
