/**
 * El pincel del escenario de la canción (ver `Escenario.ts`): dibuja en un lienzo 2D como en los
 * dibujos animados de los años 30, que es lo que pidió el usuario ("que parezca Cuphead, que no
 * parezca IA"): contornos de tinta sepia que tiemblan (el "hervor" del dibujo a mano, 12 veces por
 * segundo), rellenos planos con textura de acuarela sobre papel y el borde un poco más oscuro de la
 * aguada, sin degradados digitales ni resplandores. Las formas son listas de puntos por las que pasa
 * una curva suave (Catmull-Rom); al temblar, cada punto se mueve un poco, siempre igual para el mismo
 * dibujo (azar determinista).
 */

export type Punto = readonly [number, number]

/** Tinta sepia de los contornos. */
export const TINTA = '#24160f'

/** Azar determinista en [0, 1) a partir de tres enteros. */
export function azar3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b) ^ Math.imul((c | 0) + 0x9e3779b9, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Generador pseudoaleatorio con semilla (para colocar cosas siempre en el mismo sitio). */
export function semillero(semilla: number): () => number {
  let s = (semilla >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const limitar = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x))
export const suave = (x: number): number => {
  const y = limitar(x)
  return y * y * (3 - 2 * y)
}
/** Sale con un rebote más allá del final (el estirón de los dibujos animados). */
export const rebote = (x: number): number => {
  const y = limitar(x)
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(y - 1, 3) + c1 * Math.pow(y - 1, 2)
}
export const mezclar = (a: number, b: number, x: number): number => a + (b - a) * x

function rgb(color: string): [number, number, number] {
  const h = color.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Mezcla dos colores (#rrggbb) en proporción x. */
export function mezclarColor(a: string, b: string, x: number): string {
  const ca = rgb(a)
  const cb = rgb(b)
  const k = limitar(x)
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * k))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export const oscurecer = (color: string, x: number): string => mezclarColor(color, '#1b120c', x)
export const aclarar = (color: string, x: number): string => mezclarColor(color, '#fff8e8', x)

/** Textura de papel de acuarela (ruido suave en varias escalas, en grises claros), una vez. */
function texturaPapel(): HTMLCanvasElement {
  const lado = 256
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const ctx = lienzo.getContext('2d')
  if (!ctx) return lienzo
  const imagen = ctx.createImageData(lado, lado)
  const ruido = (x: number, y: number, escala: number, semilla: number): number => {
    // Ruido de valor periódico (la textura se repite sin costuras).
    const n = lado / escala
    const xi = Math.floor(x / escala)
    const yi = Math.floor(y / escala)
    const fx = x / escala - xi
    const fy = y / escala - yi
    const v = (i: number, j: number) => azar3(((i % n) + n) % n, ((j % n) + n) % n, semilla)
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    return mezclar(mezclar(v(xi, yi), v(xi + 1, yi), sx), mezclar(v(xi, yi + 1), v(xi + 1, yi + 1), sx), sy)
  }
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const v = 0.45 * ruido(x, y, 32, 1) + 0.3 * ruido(x, y, 8, 2) + 0.25 * ruido(x, y, 2, 3)
      const g = Math.round(205 + 50 * v)
      const k = (y * lado + x) * 4
      imagen.data[k] = g
      imagen.data[k + 1] = Math.round(g * 0.985)
      imagen.data[k + 2] = Math.round(g * 0.95)
      imagen.data[k + 3] = 255
    }
  }
  ctx.putImageData(imagen, 0, 0)
  return lienzo
}

let papelCompartido: HTMLCanvasElement | null = null

/** Recorrido suave por los puntos (Catmull-Rom convertido a Bézier). */
export function trazarSuave(ruta: Path2D | CanvasRenderingContext2D, puntos: readonly Punto[], cerrado: boolean): void {
  const n = puntos.length
  if (n < 2) return
  const p = (i: number): Punto => (cerrado ? puntos[((i % n) + n) % n] : puntos[Math.min(n - 1, Math.max(0, i))])
  ruta.moveTo(puntos[0][0], puntos[0][1])
  const tramos = cerrado ? n : n - 1
  for (let i = 0; i < tramos; i++) {
    const p0 = p(i - 1)
    const p1 = p(i)
    const p2 = p(i + 1)
    const p3 = p(i + 2)
    ruta.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    )
  }
  if (cerrado) ruta.closePath()
}

export interface OpcionesForma {
  /** Contorno de tinta (por defecto, sí). */
  tinta?: boolean
  /** Grosor de la tinta (en unidades del escenario; por defecto, el del pincel). */
  grosor?: number
  /** Cuánto tiembla (1 normal, 0 quieta). */
  temblor?: number
  /** Opacidad de la forma entera. */
  opacidad?: number
  /** Sin textura de acuarela (para cosas muy pequeñas). */
  liso?: boolean
}

/**
 * El pincel: dibuja formas y trazos en un lienzo cuyo lado corto mide 100 unidades (`u` píxeles por
 * unidad), con el hervor del dibujo `hervor` (cambia 12 veces por segundo).
 */
export class Pincel {
  ctx: CanvasRenderingContext2D
  /** Píxeles por unidad (el lado corto del lienzo mide 100). */
  u = 1
  /** Número del dibujo para el temblor (cambia 12 veces por segundo). */
  hervor = 0
  /** Grosor de la tinta por defecto, en unidades. */
  trazo = 0.55
  private patron: CanvasPattern | null = null

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
    papelCompartido ??= texturaPapel()
    this.patron = ctx.createPattern(papelCompartido, 'repeat')
  }

  /** Los puntos, temblando (siempre igual para el mismo dibujo y la misma forma). */
  temblar(puntos: readonly Punto[], id: number, cuanto = 1): Punto[] {
    if (cuanto <= 0) return puntos as Punto[]
    const a = 0.22 * this.u * cuanto
    return puntos.map(([x, y], i) => [x + (azar3(id, i, this.hervor) - 0.5) * 2 * a, y + (azar3(id + 7919, i, this.hervor) - 0.5) * 2 * a] as const)
  }

  /** Una forma cerrada: relleno plano con acuarela, su borde de aguada y el contorno de tinta. */
  forma(puntos: readonly Punto[], color: string, id: number, opciones: OpcionesForma = {}): Path2D {
    const ctx = this.ctx
    const ruta = new Path2D()
    trazarSuave(ruta, this.temblar(puntos, id, opciones.temblor ?? 1), true)
    ctx.save()
    if (opciones.opacidad !== undefined) ctx.globalAlpha *= opciones.opacidad
    ctx.fillStyle = color
    ctx.fill(ruta)
    if (!opciones.liso) {
      // La aguada: la textura del papel y el pigmento acumulado en el borde.
      ctx.save()
      ctx.clip(ruta)
      if (this.patron) {
        ctx.globalCompositeOperation = 'multiply'
        ctx.globalAlpha *= 0.5
        ctx.fillStyle = this.patron
        ctx.fill(ruta)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha /= 0.5
      }
      ctx.globalAlpha *= 0.22
      ctx.lineWidth = 2.6 * this.u
      ctx.strokeStyle = oscurecer(color, 0.35)
      ctx.stroke(ruta)
      ctx.restore()
    }
    if (opciones.tinta !== false) {
      ctx.lineWidth = (opciones.grosor ?? this.trazo) * this.u
      ctx.strokeStyle = TINTA
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke(ruta)
    }
    ctx.restore()
    return ruta
  }

  /** Un trazo abierto (de tinta o de color). */
  linea(puntos: readonly Punto[], id: number, grosor = this.trazo, color = TINTA, temblor = 1): void {
    const ctx = this.ctx
    const ruta = new Path2D()
    trazarSuave(ruta, this.temblar(puntos, id, temblor), false)
    ctx.lineWidth = grosor * this.u
    ctx.strokeStyle = color
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(ruta)
  }

  /** Puntos de un círculo. */
  circulo(cx: number, cy: number, r: number, n = 18): Punto[] {
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
    })
  }

  /** Puntos de una elipse girada. */
  elipse(cx: number, cy: number, rx: number, ry: number, giro = 0, n = 18): Punto[] {
    const c = Math.cos(giro)
    const s = Math.sin(giro)
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n
      const x = rx * Math.cos(a)
      const y = ry * Math.sin(a)
      return [cx + x * c - y * s, cy + x * s + y * c] as const
    })
  }

  /** Estrella regordeta de dibujo animado (puntas redondeadas). */
  estrella(cx: number, cy: number, r: number, puntas = 5, giro = -Math.PI / 2, gordura = 0.5): Punto[] {
    const puntos: Punto[] = []
    for (let i = 0; i < puntas * 2; i++) {
      const rr = i % 2 === 0 ? r : r * gordura
      const a = giro + (Math.PI * i) / puntas
      puntos.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
    return puntos
  }

  /** Nube de algodón: una elipse con bultos. */
  nube(cx: number, cy: number, ancho: number, alto: number, semilla: number): Punto[] {
    const r = semillero(semilla)
    const bultos = 6 + Math.floor(r() * 3)
    const fases = Array.from({ length: 3 }, () => r() * Math.PI * 2)
    return Array.from({ length: 30 }, (_, i) => {
      const a = (2 * Math.PI * i) / 30
      const arriba = Math.max(0, -Math.sin(a))
      const bulto = 0.16 * Math.abs(Math.sin((a * bultos) / 2 + fases[0])) + 0.05 * Math.sin(a * 3 + fases[1])
      const k = 1 + bulto * (0.5 + arriba)
      const y = Math.sin(a) > 0 ? alto * 0.42 * Math.sin(a) : alto * 0.5 * Math.sin(a) * k
      return [cx + ancho * 0.5 * Math.cos(a) * k, cy + y] as const
    })
  }

  /** Pétalo (o lágrima) desde la base, hacia `angulo`, de largo `largo` y ancho `ancho`. */
  petalo(bx: number, by: number, angulo: number, largo: number, ancho: number): Punto[] {
    const c = Math.cos(angulo)
    const s = Math.sin(angulo)
    const perfil: [number, number][] = [
      [0, 0],
      [0.25, 0.42],
      [0.62, 0.5],
      [0.92, 0.22],
      [1, 0],
      [0.92, -0.22],
      [0.62, -0.5],
      [0.25, -0.42],
    ]
    return perfil.map(([l, w]) => {
      const x = l * largo
      const y = w * ancho
      return [bx + x * c - y * s, by + x * s + y * c] as const
    })
  }

  /** Líneas de movimiento (las rayitas que rodean lo que aparece de golpe). */
  rayitas(cx: number, cy: number, r: number, cuantas: number, id: number, opacidad = 1): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha *= opacidad
    for (let i = 0; i < cuantas; i++) {
      const a = (2 * Math.PI * (i + 0.5 * azar3(id, i, 3))) / cuantas
      const r0 = r * (1 + 0.1 * azar3(id, i, 4))
      const r1 = r0 + r * 0.45
      this.linea(
        [
          [cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)],
          [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)],
        ],
        id * 31 + i,
        this.trazo * 0.8,
      )
    }
    ctx.restore()
  }

  /** Rellena un rectángulo con textura de papel encima (para los fondos). */
  papel(x: number, y: number, ancho: number, alto: number, opacidad = 0.5): void {
    if (!this.patron) return
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = opacidad
    ctx.fillStyle = this.patron
    ctx.fillRect(x, y, ancho, alto)
    ctx.restore()
  }
}
