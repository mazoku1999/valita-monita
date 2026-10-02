import { type OpcionesForma, type Pincel, type Punto, TINTA, aclarar, limitar, mezclar, semillero } from './pincel'

/**
 * Las piezas del dibujo animado con las que se pintan las escenas de la canción y su final (ver
 * `escenas.ts` y `final.ts`): cielos, lomas, árboles redondos, casitas, estrellas regordetas, la
 * luna, el sol de rayos, la Tierra y los girasoles, todo a tinta y acuarela con el pincel.
 */

export function cieloDegradado(ctx: CanvasRenderingContext2D, ancho: number, H: number, paradas: readonly (readonly [number, string])[]): void {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  for (const [k, color] of paradas) g.addColorStop(k, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, ancho, H)
}

/** Los puntos de un polígono con lados de puntos cada `paso` px (así la curva suave los deja rectos). */
export function lados(puntos: readonly Punto[], paso: number): Punto[] {
  const salida: Punto[] = []
  for (let i = 0; i < puntos.length; i++) {
    const [ax, ay] = puntos[i]
    const [bx, by] = puntos[(i + 1) % puntos.length]
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / paso))
    for (let k = 0; k < n; k++) salida.push([mezclar(ax, bx, k / n), mezclar(ay, by, k / n)])
  }
  return salida
}

/** El perfil de unas lomas: la altura (px) en cada x (px), suave y siempre igual para la semilla. */
export function lomas(semilla: number, H: number, u: number, altura: number, amplitud: number): (x: number) => number {
  const r = semillero(semilla)
  const f = [r() * 6.28, r() * 6.28, r() * 6.28]
  return (x) => {
    const xu = x / u
    return H * altura - amplitud * u * (0.6 * Math.sin(xu * 0.055 + f[0]) + 0.3 * Math.sin(xu * 0.13 + f[1]) + 0.25 * Math.sin(xu * 0.021 + f[2]))
  }
}

export function pintarLomas(p: Pincel, ancho: number, H: number, perfil: (x: number) => number, color: string, id: number, opciones: OpcionesForma = {}): void {
  const paso = p.u * 6
  const puntos: Punto[] = []
  for (let x = -paso; x <= ancho + paso; x += paso) puntos.push([x, perfil(x)])
  puntos.push([ancho + paso * 2, H * 1.1], [-paso * 2, H * 1.1])
  p.forma(puntos, color, id, { temblor: 0, grosor: p.trazo * 0.85, ...opciones })
}

/** Manchas de aguada en el cielo (sin contorno), para que no sea un degradado liso. */
export function aguadas(p: Pincel, ancho: number, H: number, semilla: number, color: string, cuantas: number, hasta: number, opacidad: number): void {
  const r = semillero(semilla)
  for (let i = 0; i < cuantas; i++) {
    const x = r() * ancho
    const y = H * (0.06 + r() * hasta)
    p.forma(p.nube(x, y, p.u * (45 + r() * 55), p.u * (5 + r() * 6), semilla * 10 + i), color, semilla * 10 + i, {
      tinta: false,
      temblor: 0,
      opacidad,
    })
  }
}

/** Estrellitas de fondo: puntos finos, los mayores con su cruz de destello. */
export function estrellitas(p: Pincel, ancho: number, H: number, semilla: number, cuantas: number, hasta: number): void {
  const ctx = p.ctx
  const r = semillero(semilla)
  ctx.save()
  ctx.fillStyle = '#f6ebc8'
  ctx.strokeStyle = '#f6ebc8'
  ctx.lineCap = 'round'
  for (let i = 0; i < cuantas; i++) {
    const x = r() * ancho
    const y = r() * H * hasta
    const radio = p.u * (0.12 + r() * r() * 0.32)
    ctx.globalAlpha = 0.45 + r() * 0.5
    ctx.beginPath()
    ctx.arc(x, y, radio, 0, Math.PI * 2)
    ctx.fill()
    if (radio > p.u * 0.3) {
      ctx.lineWidth = p.u * 0.12
      ctx.beginPath()
      ctx.moveTo(x - radio * 3, y)
      ctx.lineTo(x + radio * 3, y)
      ctx.moveTo(x, y - radio * 3)
      ctx.lineTo(x, y + radio * 3)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Un árbol redondo de dibujo animado (copa de algodón y tronco), con el pie en `suelo`. */
export function arbol(p: Pincel, x: number, suelo: number, alto: number, copa: string, tronco: string, id: number, tinta = true): void {
  const ancho = alto * 0.66
  const tr = alto * 0.085
  const u = p.u
  p.forma(
    [
      [x - tr, suelo + u],
      [x - tr * 0.85, suelo - alto * 0.25],
      [x - tr * 0.65, suelo - alto * 0.55],
      [x + tr * 0.65, suelo - alto * 0.55],
      [x + tr * 0.85, suelo - alto * 0.25],
      [x + tr, suelo + u],
    ],
    tronco,
    id,
    { tinta, temblor: 0.4, grosor: p.trazo * 0.8 },
  )
  p.forma(p.nube(x, suelo - alto * 0.66, ancho, alto * 0.64, id + 1), copa, id + 1, { tinta, temblor: 0.4, grosor: p.trazo * 0.85 })
  // El brillo de la copa (las siluetas lejanas, sin él).
  if (tinta) {
    p.forma(p.nube(x - ancho * 0.12, suelo - alto * 0.78, ancho * 0.5, alto * 0.24, id + 2), aclarar(copa, 0.22), id + 2, {
      tinta: false,
      liso: true,
      temblor: 0,
      opacidad: 0.75,
    })
  }
}

export interface ColoresCasa {
  readonly pared: string
  readonly tejado: string
  readonly ventana: string
  readonly puerta: string
}

/** Una casita (o un granero, más ancho y sin chimenea): paredes, tejado a dos aguas, puerta y ventana. */
export function casita(p: Pincel, x: number, suelo: number, s: number, colores: ColoresCasa, id: number, ancha = 1): void {
  const u = p.u
  const w = s * ancha
  const h = s * 0.62
  const paso = u * 1.2
  const opciones: OpcionesForma = { temblor: 0.5, grosor: p.trazo * 0.8 }
  const rect = (x0: number, y0: number, x1: number, y1: number, k = 1): Punto[] =>
    lados(
      [
        [x0, y1],
        [x0, y0],
        [x1, y0],
        [x1, y1],
      ],
      paso * k,
    )
  if (ancha <= 1) p.forma(rect(x + w * 0.18, suelo - h - s * 0.5, x + w * 0.32, suelo - h), colores.tejado, id, opciones)
  p.forma(rect(x - w / 2, suelo - h, x + w / 2, suelo + u), colores.pared, id + 1, opciones)
  p.forma(
    lados(
      [
        [x - w * 0.62, suelo - h + s * 0.05],
        [x, suelo - h - s * 0.45],
        [x + w * 0.62, suelo - h + s * 0.05],
      ],
      paso,
    ),
    colores.tejado,
    id + 2,
    opciones,
  )
  p.forma(rect(x - w * 0.32, suelo - h * 0.58, x - w * 0.1, suelo + u * 0.5, 0.6), colores.puerta, id + 3, { ...opciones, liso: true })
  const v0 = x + w * 0.06
  const v1 = x + w * 0.34
  p.forma(rect(v0, suelo - h * 0.72, v1, suelo - h * 0.28, 0.6), colores.ventana, id + 4, { ...opciones, liso: true })
  p.linea(
    [
      [(v0 + v1) / 2, suelo - h * 0.28],
      [(v0 + v1) / 2, suelo - h * 0.72],
    ],
    id + 5,
    p.trazo * 0.55,
    TINTA,
    0.3,
  )
  p.linea(
    [
      [v0, suelo - h * 0.5],
      [v1, suelo - h * 0.5],
    ],
    id + 6,
    p.trazo * 0.55,
    TINTA,
    0.3,
  )
}

/** Matas de hierba (dos trazos curvos) a lo largo de unas lomas. */
export function matas(p: Pincel, ancho: number, perfil: (x: number) => number, semilla: number, cuantas: number, color: string): void {
  const r = semillero(semilla)
  for (let i = 0; i < cuantas; i++) {
    const x = r() * ancho
    const y = perfil(x) + p.u * (1 + r() * 4)
    const a = p.u * (1 + r() * 0.8)
    p.linea(
      [
        [x - a, y - a * 0.1],
        [x - a * 0.35, y - a * 1.3],
        [x, y],
      ],
      semilla * 100 + i,
      p.trazo * 0.6,
      color,
      0.4,
    )
    p.linea(
      [
        [x, y],
        [x + a * 0.45, y - a * 1.5],
        [x + a, y - a * 0.1],
      ],
      semilla * 100 + i + 50,
      p.trazo * 0.6,
      color,
      0.4,
    )
  }
}

/** Una valla de madera que sigue unas lomas, de `x0` a `x1`. */
export function valla(p: Pincel, perfil: (x: number) => number, x0: number, x1: number, color: string, id: number): void {
  const u = p.u
  const paso = u * 4.5
  const alto = u * 3.2
  const postes: Punto[] = []
  for (let x = x0; x <= x1; x += paso) postes.push([x, perfil(x) + u * 0.8])
  for (const k of [0.35, 0.75]) {
    const travesano = postes.map(([x, y]) => [x, y - alto * k] as const)
    p.linea(travesano, id + Math.round(k * 10), 0.8 + p.trazo * 1.3, TINTA, 0.4)
    p.linea(travesano, id + Math.round(k * 10), 0.8, color, 0.4)
  }
  postes.forEach(([x, y], i) => {
    p.forma(
      lados(
        [
          [x - u * 0.45, y],
          [x - u * 0.45, y - alto],
          [x, y - alto - u * 0.6],
          [x + u * 0.45, y - alto],
          [x + u * 0.45, y],
        ],
        u,
      ),
      color,
      id + 20 + i,
      { temblor: 0.4, grosor: p.trazo * 0.6, liso: true },
    )
  })
}

/** Estrella regordeta de dibujo animado, con su brillo. */
export function estrellaDibujo(p: Pincel, x: number, y: number, r: number, color: string, id: number, giro = 0, escala = 1): void {
  if (escala <= 0.01) return
  const ctx = p.ctx
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(giro)
  ctx.scale(escala, escala)
  p.forma(p.estrella(0, 0, r, 5, -Math.PI / 2, 0.52), color, id, { grosor: p.trazo * 0.9 })
  p.forma(p.elipse(-r * 0.22, -r * 0.3, r * 0.16, r * 0.09, -0.6, 8), aclarar(color, 0.7), id + 1, { tinta: false, liso: true })
  ctx.restore()
}

export function nubeDibujo(p: Pincel, x: number, y: number, ancho: number, alto: number, color: string, id: number, opacidad = 1): void {
  p.forma(p.nube(x, y, ancho, alto, id), color, id, { opacidad, grosor: p.trazo * 0.85 })
  p.forma(p.nube(x - ancho * 0.1, y - alto * 0.12, ancho * 0.55, alto * 0.38, id + 1), aclarar(color, 0.3), id + 1, {
    tinta: false,
    liso: true,
    opacidad: 0.7 * opacidad,
  })
}

/** Luna creciente (sin cara), abierta hacia la derecha. */
export function luna(p: Pincel, x: number, y: number, r: number, id: number): void {
  const puntos: Punto[] = []
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * 0.5 + (Math.PI * i) / 16
    puntos.push([x + r * Math.cos(a), y + r * Math.sin(a)])
  }
  for (let i = 16; i >= 0; i--) {
    const a = Math.PI * 0.5 + (Math.PI * i) / 16
    puntos.push([x + r * 0.42 + r * 0.48 * Math.cos(a), y + r * 0.92 * Math.sin(a)])
  }
  p.forma(puntos, '#f8e6a8', id)
  p.forma(p.elipse(x - r * 0.64, y - r * 0.28, r * 0.08, r * 0.15, 0.3, 8), '#fff6d6', id + 1, { tinta: false, liso: true })
}

/** El sol de rayos de los dibujos animados (cuñas alternas que giran despacio). */
export function rayosDeSol(ctx: CanvasRenderingContext2D, cx: number, cy: number, radio: number, giro: number, color: string, opacidad: number, n = 16): void {
  if (opacidad <= 0.01) return
  ctx.save()
  ctx.globalAlpha *= opacidad
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const a0 = giro + (2 * Math.PI * i) / n
    const a1 = a0 + Math.PI / n
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + radio * Math.cos(a0), cy + radio * Math.sin(a0))
    ctx.lineTo(cx + radio * Math.cos(a1), cy + radio * Math.sin(a1))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export function sol(p: Pincel, x: number, y: number, r: number, color: string, id: number): void {
  p.forma(p.circulo(x, y, r, 22), color, id, { grosor: p.trazo * 1.1 })
  p.forma(p.circulo(x - r * 0.18, y - r * 0.16, r * 0.66, 16), aclarar(color, 0.3), id + 1, { tinta: false, liso: true, opacidad: 0.7 })
  p.forma(p.elipse(x - r * 0.45, y - r * 0.45, r * 0.13, r * 0.08, -0.7, 8), '#fffbe8', id + 2, { tinta: false, liso: true })
}

/** La Tierra de dibujo animado: mar, dos manchas de tierra y su brillo. */
export function tierra(p: Pincel, x: number, y: number, r: number, id: number): void {
  const ruta = p.forma(p.circulo(x, y, r, 14), '#5aa7e3', id, { grosor: p.trazo * 0.8 })
  p.ctx.save()
  p.ctx.clip(ruta)
  p.forma(p.nube(x - r * 0.25, y - r * 0.15, r * 0.9, r * 0.7, id + 3), '#7cc274', id + 1, { tinta: false, liso: true })
  p.forma(p.nube(x + r * 0.45, y + r * 0.45, r * 0.7, r * 0.5, id + 4), '#7cc274', id + 2, { tinta: false, liso: true })
  p.ctx.restore()
  p.forma(p.elipse(x - r * 0.4, y - r * 0.42, r * 0.16, r * 0.1, -0.7, 8), '#eaf6ff', id + 5, { tinta: false, liso: true })
}

/**
 * Un girasol de frente (sin cara): pétalos, el disco con sus semillas. Con `alzado` (0–1) mira hacia
 * arriba: la cabeza se ve de sesgo, más baja que ancha.
 */
export function cabezaGirasol(p: Pincel, x: number, y: number, r: number, id: number, escala = 1, giro = 0, opacidad = 1, alzado = 0): void {
  if (escala <= 0.01 || opacidad <= 0.01) return
  const ctx = p.ctx
  ctx.save()
  ctx.globalAlpha *= opacidad
  ctx.translate(x, y - r * 0.12 * alzado)
  ctx.rotate(giro)
  ctx.scale(escala, escala * (1 - 0.42 * alzado))
  const n = 13
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + id * 0.37
    p.forma(p.petalo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, a, r * 0.66, r * 0.3), i % 2 ? '#f3bd36' : '#f7cb4a', id * 40 + i, {
      grosor: p.trazo * 0.7,
      liso: true,
    })
  }
  p.forma(p.circulo(0, 0, r * 0.47, 14), '#6a3a1a', id * 40 + 20, { grosor: p.trazo * 0.8 })
  const rr = semillero(id)
  ctx.fillStyle = '#9a6331'
  for (let i = 0; i < 9; i++) {
    const a = rr() * 6.28
    const d = rr() * r * 0.32
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** El tallo y las hojas de un girasol, de la cabeza (x, y) a su pie (x − ladeo, abajo). */
export function tallo(p: Pincel, x: number, y: number, abajo: number, r: number, id: number, ladeo: number): void {
  const puntos: Punto[] = [
    [x, y],
    [x - ladeo * 0.45, y + (abajo - y) * 0.35],
    [x - ladeo * 0.85, y + (abajo - y) * 0.7],
    [x - ladeo, abajo],
  ]
  const grueso = Math.max(0.9, (r / p.u) * 0.16)
  p.linea(puntos, id, grueso + p.trazo * 1.4, TINTA, 0.6)
  p.linea(puntos, id, grueso, '#5b9136', 0.6)
  const hy = y + (abajo - y) * 0.42
  const hx = x - ladeo * 0.5
  for (const lado of [-1, 1]) {
    p.forma(
      [
        [hx, hy],
        [hx + lado * r * 0.5, hy - r * 0.4],
        [hx + lado * r * 1.05, hy - r * 0.18],
        [hx + lado * r * 0.6, hy + r * 0.1],
      ],
      '#68a540',
      id + 10 + lado,
      { grosor: p.trazo * 0.7, liso: true },
    )
  }
}

/** Pétalos que vuelan (una ráfaga que empieza en `d` segundos). */
export function rafagaPetalos(p: Pincel, W: number, H: number, u: number, d: number, semilla: number, cuantos: number, desde = 0.82): void {
  if (d < 0 || d > 6) return
  const r = semillero(semilla)
  for (let i = 0; i < cuantos; i++) {
    const x0 = r() * W
    const y0 = H * (desde + r() * 0.15)
    const vx = (r() - 0.5) * u * 24
    const vy = -u * (20 + r() * 20)
    const giro0 = r() * 6.28
    const k = d - r() * 0.6
    if (k < 0) continue
    const x = x0 + vx * k + Math.sin(k * 2 + i) * u * 2
    const y = y0 + vy * k + 0.5 * u * 9 * k * k
    const opacidad = 1 - limitar((d - 4.5) / 1.5)
    p.forma(p.petalo(x, y, giro0 + k * 3, u * 3, u * 1.35), i % 2 ? '#f3bd36' : '#f7cb4a', semilla * 100 + i, {
      grosor: p.trazo * 0.6,
      liso: true,
      opacidad,
    })
  }
}

/** Una línea que se dibuja hasta `prog` (0–1); devuelve dónde va la punta. */
export function trazoHasta(p: Pincel, puntos: readonly Punto[], prog: number, id: number, grosor: number, color: string): Punto {
  const n = Math.max(2, Math.round(puntos.length * limitar(prog)))
  const parte = puntos.slice(0, n)
  p.linea(parte, id, grosor, color, 0.35)
  return parte[parte.length - 1]
}


export interface Flor {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly fase: number
}

/**
 * El campo de girasoles: una fila al fondo, más pequeños, y otra delante, grandes, a lo ancho de la
 * pantalla y de lo que la cámara va a recorrer (`ancho`).
 */
export function campo(
  W: number,
  H: number,
  u: number,
  vertical: boolean,
  ancho: number,
  filaAtras = 0.85,
  filaDelante = 0.96,
): { atras: Flor[]; delante: Flor[] } {
  const atras: Flor[] = []
  const delante: Flor[] = []
  const pasoAtras = W / (vertical ? 5 : 9)
  const pasoDelante = W / (vertical ? 3 : 6)
  for (let i = 0; (i + 0.5) * pasoAtras < ancho; i++) {
    atras.push({ x: (i + 0.5) * pasoAtras, y: H * filaAtras + ((i % 2) - 0.5) * u * 1.6, r: u * (vertical ? 4.2 : 3.4), fase: i * 1.7 })
  }
  for (let i = 0; (i + 0.5) * pasoDelante < ancho; i++) {
    delante.push({ x: (i + 0.5) * pasoDelante + u * 2, y: H * filaDelante, r: u * (vertical ? 7 : 5.8), fase: i * 2.3 + 1 })
  }
  return { atras, delante }
}

/** La flor de delante (su índice) más cerca de `x` en la pantalla con la cámara corrida `pan`. */
export function florMasCercana(delante: readonly Flor[], x: number, pan: number): number {
  let mejor = 0
  delante.forEach((f, i) => {
    if (Math.abs(f.x - pan - x) < Math.abs(delante[mejor].x - pan - x)) mejor = i
  })
  return mejor
}
