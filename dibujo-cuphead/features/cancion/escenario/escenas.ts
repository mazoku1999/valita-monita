import { type OpcionesForma, type Pincel, type Punto, TINTA, aclarar, limitar, mezclar, mezclarColor, rebote, semillero, suave } from './pincel'

/**
 * Las escenas pintadas del escenario de la canción, como los fondos de un dibujo animado de los años
 * 30 (Cuphead): acuarela plana sobre papel, contornos de tinta y paisajes en capas que la cámara
 * recorre despacio, cada una a su velocidad (la cámara multiplano de la época: lo cercano pasa más
 * deprisa que lo lejano). Cada sección de la canción tiene su escena y cada línea su utilería, que
 * entra con su rebote y se mueve "en dos" (12 dibujos por segundo), según de qué habla la línea
 * (nada de caras, corazones ni rótulos):
 *
 * - `NOCHE` (primera estrofa): lomas de noche con árboles redondos y una casita con la ventana
 *   encendida; aparecen estrellas, sube la más grande, una estrella fugaz busca el camino y lo
 *   encuentra, pasa un planeta con anillos, las estrellas se unen en constelación, dos estrellas
 *   bailan hasta juntarse y la luna se ilumina.
 * - `GIRASOLES` (estribillo): el sol de rayos sobre un campo de girasoles con su granero; la Tierra
 *   le da la vuelta, un girasol crece por encima de todos, un avión de papel se aleja, dos girasoles
 *   se inclinan hasta juntarse y vuelan pétalos. En el interludio, el sol se pone.
 * - `LLUVIA` (segunda estrofa): una tormenta sobre un pueblito que escampa, los rayos de sol y el
 *   arcoíris, un brote, el árbol que se vuelve otoño, fotos colgadas de una cuerda y una pluma que
 *   dibuja un girasol, lo colorea y lo firma con una floritura.
 * - `ATARDECER` (último estribillo): los girasoles al atardecer; al final se hace de noche y sale la
 *   primera estrella.
 */

export interface TiemposLinea {
  readonly inicio: number
  readonly fin: number
}

export interface ContextoEscena {
  readonly p: Pincel
  /** Ancho y alto de la pantalla (px) y unidad (el lado corto mide 100). */
  readonly W: number
  readonly H: number
  readonly u: number
  /** Tiempo de la canción, a 12 dibujos por segundo. */
  readonly t: number
  /** Las líneas de la letra (sus tiempos), por índice. */
  readonly linea: (i: number) => TiemposLinea | undefined
  /** Si la pantalla es vertical (móvil). */
  readonly vertical: boolean
  /** Lo que se ha corrido la cámara (px) para lo más cercano (profundidad 1), ahora y en otro momento. */
  readonly pan: number
  readonly panEn: (t: number) => number
}

/** Una capa quieta del paisaje (se pinta una vez), que se corre con la cámara según su profundidad. */
export interface Capa {
  /** 0, lo más lejano (no se mueve); 1, lo más cercano. */
  readonly profundidad: number
  /** La pinta en un lienzo de `ancho` (algo más que la pantalla `W`, para correrla) por `alto`. */
  pintar(p: Pincel, ancho: number, alto: number, W: number): void
}

export interface Escena {
  /** El paisaje quieto, de atrás adelante. */
  readonly capas: readonly Capa[]
  /** El cielo, si se mueve (antes de las capas). */
  cielo?(c: ContextoEscena): void
  /** Lo que se mueve (después de las capas). */
  animar(c: ContextoEscena): void
  /** Desde dónde se abre el iris al entrar y dónde se cierra al salir (por defecto, el centro). */
  focoEntrada?(c: ContextoEscena): Punto
  focoSalida?(c: ContextoEscena): Punto
}

// --- Piezas comunes ----------------------------------------------------------------------------

/** Cuánto ha pasado desde que empezó la línea `i` (s), o −1 si aún no. */
function desde(c: ContextoEscena, i: number, adelanto = 0.25): number {
  const l = c.linea(i)
  if (!l) return -1
  const d = c.t - (l.inicio - adelanto)
  return d < 0 ? -1 : d
}

function cieloDegradado(ctx: CanvasRenderingContext2D, ancho: number, H: number, paradas: readonly (readonly [number, string])[]): void {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  for (const [k, color] of paradas) g.addColorStop(k, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, ancho, H)
}

/** Los puntos de un polígono con lados de puntos cada `paso` px (así la curva suave los deja rectos). */
function lados(puntos: readonly Punto[], paso: number): Punto[] {
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
function lomas(semilla: number, H: number, u: number, altura: number, amplitud: number): (x: number) => number {
  const r = semillero(semilla)
  const f = [r() * 6.28, r() * 6.28, r() * 6.28]
  return (x) => {
    const xu = x / u
    return H * altura - amplitud * u * (0.6 * Math.sin(xu * 0.055 + f[0]) + 0.3 * Math.sin(xu * 0.13 + f[1]) + 0.25 * Math.sin(xu * 0.021 + f[2]))
  }
}

function pintarLomas(p: Pincel, ancho: number, H: number, perfil: (x: number) => number, color: string, id: number, opciones: OpcionesForma = {}): void {
  const paso = p.u * 6
  const puntos: Punto[] = []
  for (let x = -paso; x <= ancho + paso; x += paso) puntos.push([x, perfil(x)])
  puntos.push([ancho + paso * 2, H * 1.1], [-paso * 2, H * 1.1])
  p.forma(puntos, color, id, { temblor: 0, grosor: p.trazo * 0.85, ...opciones })
}

/** Manchas de aguada en el cielo (sin contorno), para que no sea un degradado liso. */
function aguadas(p: Pincel, ancho: number, H: number, semilla: number, color: string, cuantas: number, hasta: number, opacidad: number): void {
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
function estrellitas(p: Pincel, ancho: number, H: number, semilla: number, cuantas: number, hasta: number): void {
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
function arbol(p: Pincel, x: number, suelo: number, alto: number, copa: string, tronco: string, id: number, tinta = true): void {
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

interface ColoresCasa {
  readonly pared: string
  readonly tejado: string
  readonly ventana: string
  readonly puerta: string
}

/** Una casita (o un granero, más ancho y sin chimenea): paredes, tejado a dos aguas, puerta y ventana. */
function casita(p: Pincel, x: number, suelo: number, s: number, colores: ColoresCasa, id: number, ancha = 1): void {
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
function matas(p: Pincel, ancho: number, perfil: (x: number) => number, semilla: number, cuantas: number, color: string): void {
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
function valla(p: Pincel, perfil: (x: number) => number, x0: number, x1: number, color: string, id: number): void {
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
function estrellaDibujo(p: Pincel, x: number, y: number, r: number, color: string, id: number, giro = 0, escala = 1): void {
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

function nubeDibujo(p: Pincel, x: number, y: number, ancho: number, alto: number, color: string, id: number, opacidad = 1): void {
  p.forma(p.nube(x, y, ancho, alto, id), color, id, { opacidad, grosor: p.trazo * 0.85 })
  p.forma(p.nube(x - ancho * 0.1, y - alto * 0.12, ancho * 0.55, alto * 0.38, id + 1), aclarar(color, 0.3), id + 1, {
    tinta: false,
    liso: true,
    opacidad: 0.7 * opacidad,
  })
}

/** Luna creciente (sin cara), abierta hacia la derecha. */
function luna(p: Pincel, x: number, y: number, r: number, id: number): void {
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
function rayosDeSol(ctx: CanvasRenderingContext2D, cx: number, cy: number, radio: number, giro: number, color: string, opacidad: number, n = 16): void {
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

function sol(p: Pincel, x: number, y: number, r: number, color: string, id: number): void {
  p.forma(p.circulo(x, y, r, 22), color, id, { grosor: p.trazo * 1.1 })
  p.forma(p.circulo(x - r * 0.18, y - r * 0.16, r * 0.66, 16), aclarar(color, 0.3), id + 1, { tinta: false, liso: true, opacidad: 0.7 })
  p.forma(p.elipse(x - r * 0.45, y - r * 0.45, r * 0.13, r * 0.08, -0.7, 8), '#fffbe8', id + 2, { tinta: false, liso: true })
}

/** La Tierra de dibujo animado: mar, dos manchas de tierra y su brillo. */
function tierra(p: Pincel, x: number, y: number, r: number, id: number): void {
  const ruta = p.forma(p.circulo(x, y, r, 14), '#5aa7e3', id, { grosor: p.trazo * 0.8 })
  p.ctx.save()
  p.ctx.clip(ruta)
  p.forma(p.nube(x - r * 0.25, y - r * 0.15, r * 0.9, r * 0.7, id + 3), '#7cc274', id + 1, { tinta: false, liso: true })
  p.forma(p.nube(x + r * 0.45, y + r * 0.45, r * 0.7, r * 0.5, id + 4), '#7cc274', id + 2, { tinta: false, liso: true })
  p.ctx.restore()
  p.forma(p.elipse(x - r * 0.4, y - r * 0.42, r * 0.16, r * 0.1, -0.7, 8), '#eaf6ff', id + 5, { tinta: false, liso: true })
}

/** Un girasol de frente (sin cara): pétalos, el disco con sus semillas. */
function cabezaGirasol(p: Pincel, x: number, y: number, r: number, id: number, escala = 1, giro = 0, opacidad = 1): void {
  if (escala <= 0.01 || opacidad <= 0.01) return
  const ctx = p.ctx
  ctx.save()
  ctx.globalAlpha *= opacidad
  ctx.translate(x, y)
  ctx.rotate(giro)
  ctx.scale(escala, escala)
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
function tallo(p: Pincel, x: number, y: number, abajo: number, r: number, id: number, ladeo: number): void {
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
function rafagaPetalos(p: Pincel, W: number, H: number, u: number, d: number, semilla: number, cuantos: number): void {
  if (d < 0 || d > 6) return
  const r = semillero(semilla)
  for (let i = 0; i < cuantos; i++) {
    const x0 = r() * W
    const y0 = H * (0.82 + r() * 0.15)
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
function trazoHasta(p: Pincel, puntos: readonly Punto[], prog: number, id: number, grosor: number, color: string): Punto {
  const n = Math.max(2, Math.round(puntos.length * limitar(prog)))
  const parte = puntos.slice(0, n)
  p.linea(parte, id, grosor, color, 0.35)
  return parte[parte.length - 1]
}

// --- La noche (primera estrofa) ----------------------------------------------------------------

/** Las estrellas de la noche: [x, y, radio (u)], en fracción de la pantalla. */
const ESTRELLAS_NOCHE: readonly (readonly [number, number, number])[] = [
  [0.36, 0.12, 2.8],
  [0.63, 0.09, 2.3],
  [0.83, 0.2, 3.1],
  [0.12, 0.42, 2.4],
  [0.9, 0.42, 2.6],
  [0.28, 0.3, 2],
]

const posLuna = (c: ContextoEscena): Punto => [c.W * (c.vertical ? 0.24 : 0.17), c.H * (c.vertical ? 0.14 : 0.2)]
const posEstrellaNoche = (c: ContextoEscena, i: number): Punto => [ESTRELLAS_NOCHE[i][0] * c.W, ESTRELLAS_NOCHE[i][1] * c.H * (c.vertical ? 0.82 : 1)]
const posEstrellaGrande = (c: ContextoEscena): Punto => [c.W * 0.5, c.H * (c.vertical ? 0.11 : 0.15)]

const CASA_NOCHE: ColoresCasa = { pared: '#5b6ba3', tejado: '#6b3b52', ventana: '#ffd25e', puerta: '#33284a' }

export const NOCHE: Escena = {
  focoEntrada: posLuna,
  focoSalida: posLuna,
  capas: [
    {
      profundidad: 0,
      pintar(p, ancho, H) {
        cieloDegradado(p.ctx, ancho, H, [
          [0, '#0e1a45'],
          [0.45, '#1f3a7e'],
          [0.62, '#3a5ea4'],
        ])
        aguadas(p, ancho, H, 5, '#3a62ad', 7, 0.42, 0.28)
        p.papel(0, 0, ancho, H, 0.42)
        estrellitas(p, ancho, H, 4, Math.round((ancho / p.u) * 0.7), 0.56)
      },
    },
    {
      profundidad: 0.3,
      pintar(p, ancho, H) {
        const perfil = lomas(11, H, p.u, 0.57, 2.6)
        pintarLomas(p, ancho, H, perfil, '#34549a', 11, { tinta: false })
        const r = semillero(12)
        const cuantos = Math.round(ancho / (p.u * 16))
        for (let i = 0; i < cuantos; i++) {
          const x = ((i + 0.2 + r() * 0.6) / cuantos) * ancho
          arbol(p, x, perfil(x) + p.u * 1.5, p.u * (5.5 + r() * 3), '#2a4888', '#2a4888', 120 + i * 3, false)
        }
      },
    },
    {
      profundidad: 0.6,
      pintar(p, ancho, H, W) {
        const u = p.u
        const perfil = lomas(13, H, u, 0.66, 2.4)
        pintarLomas(p, ancho, H, perfil, '#27407a', 13)
        for (const [fx, alto, id] of [
          [0.08, 13, 140],
          [0.3, 10, 150],
          [0.52, 12, 160],
          [0.88, 14, 170],
          [1.1, 11, 180],
        ] as const) {
          const x = fx * W
          if (x < ancho + u * 8) arbol(p, x, perfil(x) + u * 1.2, u * alto, '#2c5a6a', '#2b2038', id)
        }
        const xc = W * 0.7
        casita(p, xc, perfil(xc) + u * 0.6, u * 9.5, CASA_NOCHE, 190)
      },
    },
    {
      profundidad: 1,
      pintar(p, ancho, H) {
        const perfil = lomas(15, H, p.u, 0.88, 1.8)
        pintarLomas(p, ancho, H, perfil, '#1b2c58', 15)
        matas(p, ancho, perfil, 16, Math.round(ancho / (p.u * 7)), '#0e1934')
      },
    },
  ],
  animar(c) {
    const { p, W, H, u, t } = c
    const ctx = p.ctx
    const [lunaX, lunaY] = posLuna(c)
    const lunaR = u * 9.5
    // La luna se ilumina (última línea de la estrofa): anillos de luz y rayos que giran despacio.
    const dLuz = desde(c, 7)
    if (dLuz >= 0) {
      const k = suave(dLuz / 1.4)
      rayosDeSol(ctx, lunaX, lunaY, lunaR * 5, t * 0.06, '#fbe9b0', 0.2 * k, 14)
      ctx.save()
      ctx.fillStyle = '#fbe9b0'
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.13 * k
        ctx.beginPath()
        ctx.arc(lunaX, lunaY, lunaR * (1 + i * 0.5 * k), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    luna(p, lunaX, lunaY, lunaR, 100)
    // El humo de la chimenea de la casita (en su capa: se corre con ella), que sube y se deshace.
    {
      const xc = W * 0.7
      const s = u * 9.5
      const chimeneaX = xc + s * 0.25 - Math.round(c.pan * 0.6)
      const chimeneaY = lomas(13, H, u, 0.66, 2.4)(xc) + u * 0.6 - s * 0.62 - s * 0.5
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.32 + i / 4) % 1
        const x = chimeneaX + Math.sin(k * 5 + i) * u * 1.1 + k * u * 3.5
        const y = chimeneaY - u * 1.2 - k * u * 12
        p.forma(p.circulo(x, y, u * (0.8 + k * 1.9), 10), '#7f8fc2', 900 + i, { opacidad: 0.85 * (1 - k), grosor: p.trazo * 0.5, liso: true })
      }
    }
    // Nubes que pasan despacio, por encima de las lomas.
    for (let i = 0; i < 3; i++) {
      const ancho = u * (22 + i * 6)
      const x = ((((i * 0.37 + t * (0.006 + i * 0.002)) % 1.3) + 1.3) % 1.3) * (W + ancho * 2) - ancho
      nubeDibujo(p, x, H * (0.24 + i * 0.1), ancho, u * (7.5 + i * 1.5), '#4a64a0', 200 + i * 2, 0.95)
    }
    // Las estrellas se mecen; las tres primeras aparecen con la primera línea.
    const dAparecen = desde(c, 0)
    ESTRELLAS_NOCHE.forEach(([, , rr], i) => {
      const nueva = i < 3
      const e = nueva ? (dAparecen < 0 ? 0 : rebote(dAparecen / 0.45 - i * 0.3)) : 1
      const [x, y] = posEstrellaNoche(c, i)
      estrellaDibujo(p, x, y, u * rr, '#ffd75e', 300 + i * 3, Math.sin(t * (0.9 + i * 0.2) + i) * 0.16, e)
      const dd = dAparecen - i * 0.135
      if (nueva && dd > 0.2 && dd < 0.8) p.rayitas(x, y, u * rr * 1.5, 7, 310 + i, 1 - limitar((dd - 0.2) / 0.6))
    })
    // La constelación: las estrellas se unen con trazos punteados, una a una.
    const dConst = desde(c, 5)
    if (dConst >= 0) {
      const orden = [3, 5, 0, 1, 2, 4]
      ctx.save()
      ctx.setLineDash([u * 1.2, u * 1.2])
      for (let k = 0; k < orden.length - 1; k++) {
        const prog = limitar((dConst - k * 0.45) / 0.5)
        if (prog <= 0) break
        const a = posEstrellaNoche(c, orden[k])
        const b = posEstrellaNoche(c, orden[k + 1])
        p.linea([a, [mezclar(a[0], b[0], prog), mezclar(a[1], b[1], prog)]], 400 + k, p.trazo * 0.6, '#f6e7bd', 0.4)
      }
      ctx.restore()
    }
    // La más grande sale por detrás de las lomas y sube hasta arriba; cuando la estrella fugaz la
    // encuentra, da un saltito.
    const dGrande = desde(c, 1, 0.1)
    const dEncuentra = desde(c, 3)
    const [gx, gy] = posEstrellaGrande(c)
    if (dGrande >= 0) {
      const k = rebote(dGrande / 1.2)
      const llegada = dEncuentra - 1.2
      const salto = dEncuentra >= 0 && llegada > 0 && llegada < 0.5 ? Math.sin((llegada / 0.5) * Math.PI) * 0.25 : 0
      estrellaDibujo(p, gx, mezclar(H * 0.52, gy, k), u * 6.5, '#ffcf3f', 500, Math.sin(t * 1.1) * 0.1, Math.min(1, k * 1.4) * (1 + salto))
      if (dGrande > 0.9 && dGrande < 1.6) p.rayitas(gx, gy, u * 9, 9, 501, 1 - limitar((dGrande - 0.9) / 0.7))
      if (dEncuentra >= 0 && llegada > 0 && llegada < 0.7) p.rayitas(gx, gy, u * 9, 11, 502, 1 - limitar(llegada / 0.7))
    }
    // La estrella fugaz que busca el camino (zigzag con su estela de puntos) y lo encuentra: va
    // derecha a la estrella grande y se funde con ella.
    const dBusca = desde(c, 2)
    if (dBusca >= 0 && (dEncuentra < 0 || dEncuentra < 1.25)) {
      const tope = (c.linea(3)?.inicio ?? Infinity) - (c.linea(2)?.inicio ?? 0)
      const buscar = (s: number): Punto => [
        W * (0.2 + 0.6 * limitar(s / 4)) + Math.sin(s * 4.4) * u * 9,
        H * (c.vertical ? 0.36 : 0.42) + Math.sin(s * 2.7 + 1) * u * 8,
      ]
      const s = Math.min(dBusca, tope)
      let [x, y] = buscar(s)
      let rastro: Punto[] = []
      for (let k = 0; k < 16; k++) {
        const sk = s - k * 0.13
        if (sk < 0) break
        rastro.push(buscar(sk))
      }
      if (dEncuentra >= 0) {
        const k = suave(dEncuentra / 1.2)
        const origen: Punto = [x, y]
        x = mezclar(origen[0], gx, k)
        y = mezclar(origen[1], gy, k)
        rastro = Array.from({ length: 10 }, (_, i) => [mezclar(origen[0], x, 1 - i / 10), mezclar(origen[1], y, 1 - i / 10)] as const)
      }
      ctx.save()
      ctx.fillStyle = '#ffe9a0'
      rastro.forEach(([rx, ry], i) => {
        ctx.globalAlpha = 0.85 * (1 - i / rastro.length)
        ctx.beginPath()
        ctx.arc(rx, ry, u * (0.7 - 0.035 * i), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.restore()
      estrellaDibujo(p, x, y, u * 2.3, '#fff0a8', 600, t * 3)
    }
    // Un planeta con anillos pasa despacio ("más allá del espacio y del tiempo").
    const dPlaneta = desde(c, 4)
    if (dPlaneta >= 0 && dPlaneta < 14) {
      const k = dPlaneta / 14
      const x = mezclar(W * 1.15, -W * 0.15, k)
      const y = H * (c.vertical ? 0.3 : 0.33) - Math.sin(k * Math.PI) * u * 4
      const r = u * 5
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-0.28)
      const anillo = (desdeA: number, hastaA: number, id: number): void => {
        const puntos: Punto[] = []
        for (let i = 0; i <= 16; i++) {
          const a = mezclar(desdeA, hastaA, i / 16)
          puntos.push([r * 2.05 * Math.cos(a), r * 0.5 * Math.sin(a)])
        }
        p.linea(puntos, id, 1.5 + p.trazo * 1.6, TINTA, 0.5)
        p.linea(puntos, id, 1.5, '#f0d595', 0.5)
      }
      anillo(Math.PI, 2 * Math.PI, 700)
      const disco = p.forma(p.circulo(0, 0, r, 18), '#e98f62', 702, { tinta: false })
      ctx.save()
      ctx.clip(disco)
      p.forma(p.elipse(0, r * 0.25, r * 1.2, r * 0.22, 0, 12), '#c96f4a', 703, { tinta: false, liso: true })
      p.forma(p.elipse(0, -r * 0.38, r * 1.2, r * 0.13, 0, 12), '#f3b07f', 704, { tinta: false, liso: true })
      ctx.restore()
      ctx.lineWidth = p.trazo * u
      ctx.strokeStyle = TINTA
      ctx.stroke(disco)
      anillo(0, Math.PI, 706)
      ctx.restore()
    }
    // Dos estrellas que bailan, cada vez más cerca, hasta juntarse.
    const dDos = desde(c, 6)
    if (dDos >= 0) {
      const k = suave(dDos / 3.2)
      const radio = mezclar(W * (c.vertical ? 0.3 : 0.2), u * 3.2, k)
      const a = dDos * 2.2
      const cx = W * 0.5
      const cy = H * (c.vertical ? 0.38 : 0.42)
      estrellaDibujo(p, cx + radio * Math.cos(a), cy + radio * 0.4 * Math.sin(a), u * 3.2, '#ffd75e', 800, a * 0.5)
      estrellaDibujo(p, cx - radio * Math.cos(a), cy - radio * 0.4 * Math.sin(a), u * 3.2, '#ffa9c6', 810, -a * 0.5)
      if (k > 0.98 && dDos < 4.4) p.rayitas(cx, cy, u * 7, 9, 820, 1 - limitar((dDos - 3.2) / 1.2))
    }
  },
}

// --- Los girasoles (estribillo) y el atardecer (último estribillo) ----------------------------

interface PaletaGirasoles {
  readonly cielo: string
  readonly rayo: string
  readonly sol: string
  readonly lejos: string
  readonly arbolLejos: string
  readonly medio: string
  readonly arbol: string
  readonly nube: string
  readonly granero: ColoresCasa
  /** Altura del sol (fracción de la pantalla). */
  readonly alturaSol: number
}

const DIA: PaletaGirasoles = {
  cielo: '#f4d996',
  rayo: '#fbecbf',
  sol: '#ffc53a',
  lejos: '#b9d08a',
  arbolLejos: '#98b96a',
  medio: '#8cb35d',
  arbol: '#6a9f47',
  nube: '#fff7e6',
  granero: { pared: '#c8553d', tejado: '#7a3328', ventana: '#f6e3a8', puerta: '#5b2a22' },
  alturaSol: 0.25,
}

const TARDE: PaletaGirasoles = {
  cielo: '#f1a766',
  rayo: '#f8c48c',
  sol: '#ffd062',
  lejos: '#c9a76c',
  arbolLejos: '#b08c58',
  medio: '#a5884d',
  arbol: '#8d7a3c',
  nube: '#f7d0bd',
  granero: { pared: '#b5503d', tejado: '#6a2c24', ventana: '#ffd98a', puerta: '#4f241e' },
  alturaSol: 0.3,
}

interface Flor {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly fase: number
}

/**
 * El campo de girasoles: una fila al fondo, más pequeños, y otra delante, grandes, a lo ancho de la
 * pantalla y de lo que la cámara va a recorrer (`ancho`).
 */
function campo(W: number, H: number, u: number, vertical: boolean, ancho: number): { atras: Flor[]; delante: Flor[] } {
  const atras: Flor[] = []
  const delante: Flor[] = []
  const pasoAtras = W / (vertical ? 5 : 9)
  const pasoDelante = W / (vertical ? 3 : 6)
  for (let i = 0; (i + 0.5) * pasoAtras < ancho; i++) {
    atras.push({ x: (i + 0.5) * pasoAtras, y: H * 0.85 + ((i % 2) - 0.5) * u * 1.6, r: u * (vertical ? 4.2 : 3.4), fase: i * 1.7 })
  }
  for (let i = 0; (i + 0.5) * pasoDelante < ancho; i++) {
    delante.push({ x: (i + 0.5) * pasoDelante + u * 2, y: H * 0.96, r: u * (vertical ? 7 : 5.8), fase: i * 2.3 + 1 })
  }
  return { atras, delante }
}

/** La flor de delante (su índice) más cerca de `x` en la pantalla con la cámara corrida `pan`. */
function florMasCercana(delante: readonly Flor[], x: number, pan: number): number {
  let mejor = 0
  delante.forEach((f, i) => {
    if (Math.abs(f.x - pan - x) < Math.abs(delante[mejor].x - pan - x)) mejor = i
  })
  return mejor
}

/**
 * Los girasoles: `lineas` son los índices de las cinco líneas del estribillo (la Tierra, la
 * elegida, el avión de papel, los dos girasoles juntos y la ráfaga de pétalos); `final`, si es el
 * último (al final se hace de noche) o el primero (en el interludio se pone el sol).
 */
function escenaGirasoles(paleta: PaletaGirasoles, lineas: readonly [number, number, number, number, number], final: boolean): Escena {
  /** Cuánto se ha ido la luz tras el estribillo (0 de día, 1 de noche): el primero llega al ocaso; el último, a la noche. */
  const tarde = (c: ContextoEscena): number => {
    const ultima = c.linea(lineas[4])
    if (!ultima) return 0
    const empieza = ultima.fin + (final ? 1.5 : 1.0)
    return final ? limitar((c.t - empieza) / 9) : 0.62 * limitar((c.t - empieza) / 12)
  }
  const posSol = (c: ContextoEscena): Punto => {
    const k = suave(tarde(c))
    return [c.W * 0.5, c.H * mezclar(c.vertical ? paleta.alturaSol - 0.05 : paleta.alturaSol, 0.9, k)]
  }
  /** La primera estrella de la noche, al final del último (el iris se cierra en ella). */
  const posEstrella = (c: ContextoEscena): Punto => [c.W * (c.vertical ? 0.72 : 0.74), c.H * (c.vertical ? 0.15 : 0.18)]
  /** La órbita de la Tierra: se dibuja y la Tierra la recorre; la mitad de arriba pasa por detrás del sol. */
  const pintarOrbita = (c: ContextoEscena, delanteDelSol: boolean): void => {
    const d = desde(c, lineas[0])
    const k = tarde(c)
    if (d < 0 || k >= 0.6) return
    const { p, u } = c
    const ctx = p.ctx
    const [sx, sy] = posSol(c)
    const rx = u * (c.vertical ? 27 : 25)
    const ry = u * 7.5
    const dibujada = limitar(d / 1.1)
    const angulo = Math.PI + Math.max(0, d - 1.1) * 1.1
    ctx.save()
    ctx.globalAlpha *= 1 - limitar((k - 0.3) / 0.3)
    // Se dibuja desde la izquierda (π) por arriba y vuelve por abajo; cada mitad, en su sitio.
    const fin = Math.PI + 2 * Math.PI * dibujada
    const a0 = delanteDelSol ? 2 * Math.PI : Math.PI
    const a1 = Math.min(fin, a0 + Math.PI)
    if (a1 > a0) {
      const puntos: Punto[] = []
      for (let i = 0; i <= 24; i++) {
        const a = mezclar(a0, a1, i / 24)
        puntos.push([sx + rx * Math.cos(a), sy + ry * Math.sin(a)])
      }
      ctx.setLineDash([u * 1.1, u * 1.3])
      p.linea(puntos, delanteDelSol ? 1201 : 1200, p.trazo * 0.7, '#7a4a22', 0.4)
      ctx.setLineDash([])
    }
    if (dibujada >= 1 && Math.sin(angulo) > 0 === delanteDelSol) tierra(p, sx + rx * Math.cos(angulo), sy + ry * Math.sin(angulo), u * 2.9, 1210)
    ctx.restore()
  }
  return {
    focoEntrada: posSol,
    // El primero se despide en el sol que se pone; el último, en su estrella.
    focoSalida: (c) => (final ? posEstrella(c) : posSol(c)),
    capas: [
      {
        profundidad: 0.3,
        pintar(p, ancho, H, W) {
          const u = p.u
          const perfil = lomas(21, H, u, 0.62, 2.4)
          pintarLomas(p, ancho, H, perfil, paleta.lejos, 21, { tinta: false })
          // Un girasolar lejano: puntitos amarillos sobre las lomas.
          const r = semillero(22)
          p.ctx.fillStyle = '#e9b93a'
          for (let i = 0; i < Math.round((ancho / u) * 0.8); i++) {
            const x = r() * ancho
            const y = perfil(x) + u * (1.2 + r() * 5)
            p.ctx.beginPath()
            p.ctx.arc(x, y, u * (0.3 + r() * 0.3), 0, Math.PI * 2)
            p.ctx.fill()
          }
          const cuantos = Math.round(ancho / (u * 22))
          for (let i = 0; i < cuantos; i++) {
            const x = ((i + 0.3 + r() * 0.4) / cuantos) * ancho
            arbol(p, x, perfil(x) + u, u * (6 + r() * 2.5), paleta.arbolLejos, paleta.arbolLejos, 2200 + i * 3, false)
          }
          const xg = W * 0.8
          casita(p, xg, perfil(xg) + u * 0.6, u * 7.5, paleta.granero, 2300, 1.35)
        },
      },
      {
        profundidad: 0.6,
        pintar(p, ancho, H, W) {
          const u = p.u
          const perfil = lomas(23, H, u, 0.73, 1.8)
          pintarLomas(p, ancho, H, perfil, paleta.medio, 23)
          for (const [fx, alto, id] of [
            [0.06, 12, 2400],
            [0.2, 9, 2410],
            [0.95, 13, 2420],
            [1.12, 10, 2430],
          ] as const) {
            const x = fx * W
            if (x < ancho + u * 8) arbol(p, x, perfil(x) + u, u * alto, paleta.arbol, '#6b4529', id)
          }
          valla(p, perfil, W * 0.28, W * 0.46, '#d9c49a', 2500)
        },
      },
    ],
    cielo(c) {
      const { p, W, H, u, t } = c
      const ctx = p.ctx
      const k = tarde(c)
      const anochecer = limitar(k * 1.6 - 0.6)
      ctx.fillStyle = mezclarColor(mezclarColor(paleta.cielo, '#e98a5a', limitar(k * 1.5)), '#24345a', anochecer)
      ctx.fillRect(0, 0, W, H)
      const [sx, sy] = posSol(c)
      // Los rayos se van con el sol (de noche no quedan).
      rayosDeSol(ctx, sx, sy, Math.hypot(W, H), t * 0.05, mezclarColor(paleta.rayo, '#f6b07a', limitar(k * 1.5)), 1 - limitar(anochecer * 1.8))
      p.papel(0, 0, W, H, 0.42)
      if (anochecer > 0) {
        const r = semillero(31)
        ctx.save()
        ctx.fillStyle = '#f3e7c4'
        for (let i = 0; i < 40; i++) {
          ctx.globalAlpha = anochecer * (0.4 + r() * 0.5)
          ctx.beginPath()
          ctx.arc(r() * W, r() * H * 0.55, u * (0.15 + r() * 0.3), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      pintarOrbita(c, false)
      sol(p, sx, sy, u * 11.5, mezclarColor(paleta.sol, '#ff9d4a', limitar(k * 1.4)), 1000)
    },
    animar(c) {
      const { p, W, H, u, t, vertical, pan } = c
      const ctx = p.ctx
      const k = tarde(c)
      pintarOrbita(c, true)
      // Nubes que pasan.
      for (let i = 0; i < 3; i++) {
        const ancho = u * (20 + i * 5)
        const x = ((((i * 0.41 + t * (0.008 + i * 0.003)) % 1.3) + 1.3) % 1.3) * (W + ancho * 2) - ancho
        nubeDibujo(p, x, H * (0.1 + i * 0.11), ancho, u * (7 + i * 1.5), mezclarColor(paleta.nube, '#5d6b8f', limitar(k * 1.4 - 0.4)), 1100 + i * 2)
      }
      // Un avión de papel que se aleja.
      const dAvion = desde(c, lineas[2])
      if (dAvion >= 0 && dAvion < 5.5) {
        const camino = (s: number): Punto => {
          const kk = suave(s / 4.6)
          return [mezclar(W * 0.06, W * 0.94, kk), mezclar(H * 0.54, H * 0.1, kk) + Math.sin(s * 2.6) * u * 3]
        }
        const [x, y] = camino(dAvion)
        const s = mezclar(u * 6.5, u * 2.2, suave(dAvion / 4.6))
        ctx.save()
        ctx.globalAlpha *= 1 - limitar((dAvion - 4.6) / 0.9)
        ctx.setLineDash([u * 0.9, u * 1.1])
        const estela: Punto[] = []
        for (let i = 14; i >= 0; i--) estela.push(camino(Math.max(0, dAvion - i * 0.1)))
        p.linea(estela, 1300, p.trazo * 0.6, '#7a4a22', 0.3)
        ctx.setLineDash([])
        ctx.translate(x, y)
        ctx.rotate(-0.42 + Math.sin(dAvion * 2.6) * 0.15)
        p.forma(
          [
            [s * 1.25, 0],
            [-s, -s * 0.6],
            [-s * 0.5, 0],
            [-s, s * 0.5],
          ],
          '#fbf3e1',
          1310,
          { grosor: p.trazo * 0.75 },
        )
        p.forma(
          [
            [s * 1.25, 0],
            [-s * 0.5, 0],
            [-s * 0.75, s * 0.28],
          ],
          '#e3d6b8',
          1311,
          { grosor: p.trazo * 0.6, liso: true },
        )
        ctx.restore()
      }
      // El campo de girasoles (se mecen a su aire, no al compás), corrido con la cámara. La elegida
      // (de la fila de delante) crece por encima de todas y se queda así; los dos del centro se
      // inclinan hasta juntarse. Cuáles son se decide donde estaba la cámara al empezar su línea.
      const { atras, delante } = campo(W, H, u, vertical, W + pan + u * 8)
      const dElegida = desde(c, lineas[1])
      const dJuntos = desde(c, lineas[3])
      const dAmor = desde(c, lineas[4])
      const inicioDe = (i: number): number => (c.linea(i)?.inicio ?? c.t) - 0.25
      const elegida = florMasCercana(delante, W * (vertical ? 0.84 : 0.78), c.panEn(inicioDe(lineas[1])))
      const panJuntos = c.panEn(inicioDe(lineas[3]))
      const centro = florMasCercana(delante, W * 0.5, panJuntos)
      const pareja = delante[centro].x - panJuntos < W * 0.5 ? [centro, centro + 1] : [centro - 1, centro]
      const parejaValida = pareja[0] >= 0 && pareja[1] < delante.length && !pareja.includes(elegida)
      const flores = [...atras.map((f) => ({ f, fila: 0, i: -1 })), ...delante.map((f, i) => ({ f, fila: 1, i }))]
      for (const { f, fila, i } of flores) {
        const base = f.x - pan
        if (base < -f.r * 3 || base > W + f.r * 3) continue
        let x = base + Math.sin(t * 0.9 + f.fase) * u * 0.8
        let y = f.y
        let escala = 1
        let giro = Math.sin(t * 0.7 + f.fase) * 0.06
        if (fila === 1 && i === elegida && dElegida >= 0) {
          const e = rebote(dElegida / 0.9)
          y = mezclar(f.y, H * (vertical ? 0.56 : 0.5), e)
          escala = 1 + 0.4 * e
        }
        if (fila === 1 && dJuntos >= 0 && parejaValida && pareja.includes(i)) {
          const e = suave(dJuntos / 1.6)
          const lado = i === pareja[0] ? 1 : -1
          const hueco = (delante[pareja[1]].x - delante[pareja[0]].x) / 2 - f.r * 1.05
          x += lado * hueco * e
          giro += lado * 0.25 * e
        }
        if (dAmor >= 0) {
          // Una ola de izquierda a derecha: cada uno se abre un instante.
          const e = Math.max(0, 1 - Math.abs(dAmor - 0.3 - (0.5 * base) / W) / 0.3)
          escala *= 1 + 0.16 * e
        }
        const clave = Math.round(f.x / u)
        tallo(p, x, y, H * 1.05, f.r, 1400 + fila * 600 + clave * 3, x - base)
        cabezaGirasol(p, x, y, f.r, 50 + fila * 40 + (clave % 40), escala, giro)
        if (fila === 1 && i === elegida && dElegida > 0.7 && dElegida < 4) {
          const titileo = 0.75 + 0.25 * Math.sin(dElegida * 6)
          estrellaDibujo(p, x + f.r * 1.5 * escala, y - f.r * 1.5 * escala, u * 1.9, '#fff2b0', 1490, 0, titileo)
          if (dElegida < 1.4) p.rayitas(x, y, f.r * 1.8 * escala, 9, 1491, 1 - limitar((dElegida - 0.7) / 0.7))
        }
      }
      if (dAmor >= 0) rafagaPetalos(p, W, H, u, dAmor, final ? 77 : 66, final ? 30 : 22)
      // Al final del último vuelan más pétalos y se hace de noche: todo se tiñe de azul y sale la
      // primera estrella (en ella se cierra el iris).
      if (final) {
        if (dAmor > 2.4) rafagaPetalos(p, W, H, u, dAmor - 2.4, 88, 20)
        const anochecer = limitar(k * 1.6 - 0.6)
        if (anochecer > 0) {
          ctx.save()
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = mezclarColor('#ffffff', '#4f5f98', anochecer * 0.9)
          ctx.fillRect(0, 0, W, H)
          ctx.restore()
        }
        if (anochecer > 0.45) {
          const e = rebote((anochecer - 0.45) / 0.12)
          const [ex, ey] = posEstrella(c)
          estrellaDibujo(p, ex, ey, u * 3.6, '#ffd75e', 1590, Math.sin(t * 1.2) * 0.1, e)
          if (anochecer < 0.75) p.rayitas(ex, ey, u * 5.5, 9, 1591, 1 - limitar((anochecer - 0.5) / 0.25))
        }
      }
    },
  }
}

export const GIRASOLES = escenaGirasoles(DIA, [8, 9, 10, 11, 12], false)
export const ATARDECER = escenaGirasoles(TARDE, [21, 22, 23, 24, 25], true)

// --- La lluvia (segunda estrofa) ---------------------------------------------------------------

const CASAS_PUEBLO: readonly ColoresCasa[] = [
  { pared: '#d6c3a2', tejado: '#a5503c', ventana: '#f3e2b0', puerta: '#6a4030' },
  { pared: '#c9b48e', tejado: '#8a4a3a', ventana: '#f3e2b0', puerta: '#5a3628' },
  { pared: '#dccaa8', tejado: '#b0603f', ventana: '#f3e2b0', puerta: '#6a4030' },
]

/** El dibujo de la pluma: un girasol de un solo trazo (pétalos, disco y espiral de semillas). */
function dibujoDeGirasol(cx: number, cy: number, R: number): Punto[] {
  const puntos: Punto[] = []
  const petalos = 12
  for (let i = 0; i <= 240; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / 240
    const k = Math.pow(Math.abs(Math.sin((petalos * (a + Math.PI / 2)) / 2)), 0.7)
    const r = R * (0.56 + 0.44 * k)
    puntos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  for (let i = 0; i <= 60; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / 60
    puntos.push([cx + R * 0.44 * Math.cos(a), cy + R * 0.44 * Math.sin(a)])
  }
  for (let i = 0; i <= 60; i++) {
    const s = i / 60
    const a = -Math.PI / 2 + s * 5 * Math.PI
    const r = R * 0.38 * (1 - s)
    puntos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return puntos
}

/** La floritura de la firma: una línea que ondea con un rizo en el medio. */
function floritura(cx: number, y: number, ancho: number, u: number): Punto[] {
  const puntos: Punto[] = []
  for (let i = 0; i <= 90; i++) {
    const s = i / 90
    let x = cx + (s - 0.5) * ancho
    let yy = y + Math.sin(s * Math.PI * 2) * u * 1.8
    if (s > 0.4 && s < 0.6) {
      const fi = ((s - 0.4) / 0.2) * Math.PI * 2
      x += Math.sin(fi) * u * 3.2
      yy -= (1 - Math.cos(fi)) * u * 2.6
    }
    puntos.push([x, yy])
  }
  return puntos
}

const posDibujo = (c: ContextoEscena): { cx: number; cy: number; R: number } => ({
  cx: c.W * 0.5,
  cy: c.H * (c.vertical ? 0.3 : 0.33),
  R: c.u * (c.vertical ? 17 : 13),
})

const firmaDe = (c: ContextoEscena): Punto[] => {
  const { cx, cy, R } = posDibujo(c)
  return floritura(cx, cy + R * 1.35, R * 3, c.u)
}

export const LLUVIA: Escena = {
  // El iris se abre donde llega la tormenta y se cierra en la estrella de la firma.
  focoEntrada: (c) => [c.W * 0.5, c.H * 0.18],
  focoSalida: (c) => {
    const firma = firmaDe(c)
    const [x, y] = firma[firma.length - 1]
    return [x + c.u * 3, y - c.u * 3]
  },
  capas: [
    {
      profundidad: 0.3,
      pintar(p, ancho, H, W) {
        const u = p.u
        const perfil = lomas(41, H, u, 0.58, 2.2)
        pintarLomas(p, ancho, H, perfil, '#8aa98c', 41, { tinta: false })
        // Un pueblito en la loma: casitas y un árbol.
        ;[0.6, 0.67, 0.74, 0.81].forEach((fx, i) => {
          const x = fx * W
          if (i === 2) arbol(p, x, perfil(x) + u, u * 7, '#6f9a6a', '#5a4030', 4120)
          else casita(p, x, perfil(x) + u * 0.5, u * (5 + (i % 2) * 1.2), CASAS_PUEBLO[i % 3], 4100 + i * 10)
        })
        arbol(p, W * 0.24, perfil(W * 0.24) + u, u * 6, '#7aa575', '#7aa575', 4130, false)
      },
    },
    {
      profundidad: 0.6,
      pintar(p, ancho, H, W) {
        const u = p.u
        const perfil = lomas(43, H, u, 0.68, 2)
        pintarLomas(p, ancho, H, perfil, '#62906a', 43)
        for (const [fx, alto, id] of [
          [0.42, 10, 4300],
          [0.92, 12, 4310],
          [1.1, 9, 4320],
        ] as const) {
          const x = fx * W
          if (x < ancho + u * 8) arbol(p, x, perfil(x) + u, u * alto, '#4f8a55', '#5a3c28', id)
        }
      },
    },
    {
      profundidad: 1,
      pintar(p, ancho, H) {
        const perfil = lomas(45, H, p.u, 0.9, 1.4)
        pintarLomas(p, ancho, H, perfil, '#4b7a4b', 45)
        matas(p, ancho, perfil, 46, Math.round(ancho / (p.u * 7)), '#2d5530')
      },
    },
  ],
  cielo(c) {
    const { p, W, H, t, u } = c
    const ctx = p.ctx
    // De gris de tormenta a azul limpio cuando escampa.
    const dClaro = desde(c, 15)
    const claro = dClaro >= 0 ? suave(dClaro / 1.6) : 0
    cieloDegradado(ctx, W, H, [
      [0, mezclarColor('#4c5a70', '#8fb9dc', claro)],
      [0.6, mezclarColor('#76869c', '#cfe4ef', claro)],
    ])
    p.papel(0, 0, W, H, 0.45)
    // Los rayos de sol entre las nubes y el arcoíris, que se dibuja de izquierda a derecha detrás
    // de las lomas; se van cuando llegan las fotos.
    if (claro > 0) {
      const desvanece = 1 - limitar((desde(c, 18) - 1) / 1.5)
      rayosDeSol(ctx, W * 0.5, -H * 0.05, H * 1.2, Math.PI * 0.25 + t * 0.03, '#fff6d4', 0.3 * claro * desvanece)
      const colores = ['#e8574a', '#f39a3c', '#f6d04d', '#6db66a', '#5a8fd6']
      const cx = W * 0.5
      const cy = H * 0.66
      const radio = Math.min(W * 0.4, u * 42)
      const banda = u * 1.7
      const fin = Math.PI + Math.PI * suave(dClaro / 1.6)
      ctx.save()
      ctx.globalAlpha *= desvanece
      colores.forEach((color, i) => {
        ctx.beginPath()
        ctx.arc(cx, cy, radio - i * banda, Math.PI, fin)
        ctx.strokeStyle = color
        ctx.lineWidth = banda
        ctx.stroke()
      })
      ctx.lineWidth = p.trazo * u
      ctx.strokeStyle = TINTA
      for (const r of [radio + banda / 2, radio - (colores.length - 0.5) * banda]) {
        ctx.beginPath()
        ctx.arc(cx, cy, r, Math.PI, fin)
        ctx.stroke()
      }
      ctx.restore()
    }
  },
  animar(c) {
    const { p, W, H, u, t, vertical, pan } = c
    const ctx = p.ctx
    // El árbol grande, delante (con la cámara): verde y, con el paso de los años, de otoño.
    const dOtono = desde(c, 17)
    const otono = dOtono >= 0 ? suave(dOtono / 1.6) : 0
    const arbolX = W * (vertical ? 0.16 : 0.12) - pan
    const suelo = H * 0.93
    const alto = u * (vertical ? 46 : 52)
    arbol(p, arbolX, suelo, alto, mezclarColor('#5f9a45', '#df7f30', otono), '#5c3b25', 1500)
    if (dOtono >= 0) {
      const r = semillero(52)
      for (let i = 0; i < 16; i++) {
        const k = dOtono - i * 0.28 - r() * 0.3
        if (k < 0) continue
        const x = arbolX + (r() - 0.5) * alto * 0.6 + Math.sin(k * 2.2 + i) * u * 4 + k * u * 3
        const y = suelo - alto * 0.62 + k * u * 10
        if (y > H * 1.02) continue
        p.forma(p.petalo(x, y, k * 2.4 + i, u * 2.6, u * 1.4), i % 2 ? '#e2843a' : '#f0b04a', 1510 + i, { grosor: p.trazo * 0.6, liso: true })
      }
    }
    // La tormenta: todo se oscurece, llegan dos nubes negras, llueve y caen dos rayos; luego se van.
    const dTormenta = desde(c, 13, 0.6)
    const dAparta = desde(c, 14)
    const aparta = dAparta >= 0 ? suave(dAparta / 2.2) : 0
    const tormenta = dTormenta >= 0 ? limitar(dTormenta / 0.6) * (1 - aparta) : 0
    if (tormenta > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = mezclarColor('#ffffff', '#8995aa', tormenta)
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
      ctx.save()
      ctx.strokeStyle = '#dfe9f5'
      ctx.lineWidth = u * 0.3
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.75 * tormenta
      const r = semillero(61)
      for (let i = 0; i < 90; i++) {
        const x0 = r() * W * 1.25
        const y = ((((t * 1.7 + r()) % 1) + 1) % 1) * H * 1.1 - H * 0.05
        const x = x0 - (y / H) * W * 0.14
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - u * 0.9, y + u * 3.4)
        ctx.stroke()
      }
      ctx.restore()
      for (const [cuando, fx] of [
        [0.9, 0.42],
        [2.4, 0.62],
      ] as const) {
        const d = dTormenta - cuando
        if (d >= 0 && d < 0.25 && aparta < 0.5) {
          ctx.save()
          ctx.globalAlpha = 0.35 * (1 - d / 0.25)
          ctx.fillStyle = '#fff8e6'
          ctx.fillRect(0, 0, W, H)
          ctx.restore()
          const x = W * fx
          const y = H * 0.24
          const s = u * 3.4
          p.forma(
            [
              [x, y],
              [x + s * 1.4, y],
              [x + s * 0.6, y + s * 2.2],
              [x + s * 1.6, y + s * 2.2],
              [x - s * 0.6, y + s * 5.4],
              [x + s * 0.1, y + s * 2.9],
              [x - s * 0.9, y + s * 2.9],
            ],
            '#ffe066',
            1600 + Math.round(cuando),
            { grosor: p.trazo * 0.8 },
          )
        }
      }
    }
    if (dTormenta >= 0 && aparta < 1) {
      const llega = suave(dTormenta / 1.1)
      const iz = mezclar(mezclar(-0.4, 0.34, llega), -0.45, aparta)
      const de = mezclar(mezclar(1.4, 0.68, llega), 1.45, aparta)
      nubeDibujo(p, W * iz, H * 0.18, u * (vertical ? 38 : 44), u * 16, '#3c4659', 1700)
      nubeDibujo(p, W * de, H * 0.15, u * (vertical ? 34 : 40), u * 14, '#465166', 1702)
    }
    // Un brote que crece y abre sus dos hojas, delante.
    const dBrote = desde(c, 16)
    if (dBrote >= 0) {
      const x = W * (vertical ? 0.74 : 0.7) - pan
      const pie = H * 0.97
      const altoBrote = u * 12 * suave(dBrote / 1.1)
      const tallito: Punto[] = [
        [x, pie],
        [x - u * 0.9, pie - altoBrote * 0.5],
        [x + u * 0.3, pie - altoBrote],
      ]
      p.linea(tallito, 1800, 1.0 + p.trazo * 1.4, TINTA, 0.5)
      p.linea(tallito, 1800, 1.0, '#7bbd50', 0.5)
      const hojas = rebote((dBrote - 0.9) / 0.6)
      if (hojas > 0) {
        for (const lado of [-1, 1]) {
          ctx.save()
          ctx.translate(x + u * 0.3, pie - altoBrote)
          ctx.scale(hojas, hojas)
          p.forma(p.petalo(0, 0, lado < 0 ? Math.PI + 0.5 : -0.5, u * 5.5, u * 2.6), '#86c45c', 1810 + lado, { grosor: p.trazo * 0.75 })
          ctx.restore()
        }
      }
      if (dBrote > 1.3 && dBrote < 2.2) p.rayitas(x, pie - altoBrote, u * 4.5, 7, 1820, 1 - limitar((dBrote - 1.3) / 0.9))
    }
    // Fotos colgadas de una cuerda, que se mecen; con la línea siguiente, la cuerda sube y se va.
    const dFotos = desde(c, 18)
    if (dFotos >= 0) {
      const dSube = desde(c, 19)
      const y0 = H * 0.24 - (dSube >= 0 ? H * 0.6 * suave(dSube / 1.1) : 0)
      const curva = (x: number): number => y0 + u * 3 - u * 7 * Math.pow((2 * x) / W - 1, 2)
      if (y0 > -H * 0.3) {
        const cuerda: Punto[] = Array.from({ length: 9 }, (_, i) => {
          const x = (-0.02 + (1.04 * i) / 8) * W
          return [x, curva(x)] as const
        })
        p.linea(cuerda, 1900, p.trazo * 0.7)
        const fotos = vertical ? [0.27, 0.73] : [0.2, 0.4, 0.6, 0.8]
        fotos.forEach((fx, i) => {
          const caida = rebote((dFotos - i * 0.25) / 0.5)
          if (caida <= 0) return
          const x = W * fx
          const y = curva(x) + mezclar(-u * 16, 0, caida)
          const a = u * (vertical ? 14 : 10)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(Math.sin(t * 1.3 + i * 1.7) * 0.08)
          const marco = (x0: number, y0m: number, x1: number, y1: number): Punto[] =>
            lados(
              [
                [x0, y0m],
                [x1, y0m],
                [x1, y1],
                [x0, y1],
              ],
              u * 1.3,
            )
          p.forma(marco(-a / 2, 0, a / 2, a * 1.18), '#fbf5e6', 1910 + i, { grosor: p.trazo * 0.7 })
          p.forma(marco(-a * 0.4, a * 0.1, a * 0.4, a * 0.9), ['#9cc7e6', '#f3d58e', '#2f4a86', '#f2b48a'][i % 4], 1920 + i, { grosor: p.trazo * 0.5 })
          // Dentro, un recuerdo dibujado: un sol, un girasol, una noche con su estrella, la luna.
          if (i % 4 === 0) sol(p, 0, a * 0.5, a * 0.2, '#ffd34a', 1930 + i)
          else if (i % 4 === 1) cabezaGirasol(p, 0, a * 0.5, a * 0.3, 90 + i)
          else if (i % 4 === 2) estrellaDibujo(p, 0, a * 0.5, a * 0.24, '#ffd75e', 1940 + i)
          else luna(p, 0, a * 0.5, a * 0.24, 1950 + i)
          p.forma(marco(-u * 0.6, -u * 1.4, u * 0.6, u * 1.3), '#b07a4a', 1960 + i, { grosor: p.trazo * 0.5, liso: true })
          ctx.restore()
        })
      }
    }
    // La pluma dibuja un girasol de un solo trazo; con la última línea lo colorea y lo firma con una
    // floritura que acaba en una estrella.
    const dPluma = desde(c, 19)
    if (dPluma >= 0) {
      const { cx, cy, R } = posDibujo(c)
      const duracion = Math.max(2, (c.linea(20)?.inicio ?? 0) - (c.linea(19)?.inicio ?? 0) - 0.4)
      const linea20 = c.linea(20)
      const durFirma = linea20 ? Math.max(1.2, linea20.fin - linea20.inicio - 0.6) : 2.5
      const dColor = desde(c, 20)
      if (dColor >= 0) cabezaGirasol(p, cx, cy, R * 0.98, 97, 1, 0, suave(dColor / 0.5))
      let punta = trazoHasta(p, dibujoDeGirasol(cx, cy, R), dPluma / duracion, 2000, p.trazo * 1.2, '#2b1a12')
      let dibujando = true
      if (dColor >= 0) {
        if (dColor < 0.7) p.rayitas(cx, cy, R * 1.15, 11, 2005, 1 - limitar(dColor / 0.7))
        const firma = firmaDe(c)
        punta = trazoHasta(p, firma, (dColor - 0.4) / durFirma, 2010, p.trazo * 1.1, '#2b1a12')
        dibujando = dColor - 0.4 < durFirma
        if (!dibujando) {
          const [fx, fy] = firma[firma.length - 1]
          estrellaDibujo(p, fx + u * 3, fy - u * 3, u * 2.6, '#ffd75e', 2020, 0, rebote((dColor - 0.4 - durFirma) / 0.4))
        }
      }
      if (dibujando) {
        const [px, py] = punta
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(-0.6)
        p.forma(
          [
            [0, 0],
            [u * 1.7, -u * 3.8],
            [u * 0.4, -u * 8.5],
            [-u * 1.3, -u * 8],
            [-u * 1.5, -u * 3.6],
          ],
          '#e6c27a',
          2030,
          { grosor: p.trazo * 0.75 },
        )
        p.linea(
          [
            [0, -u * 0.6],
            [-u * 0.15, -u * 4],
          ],
          2031,
          p.trazo * 0.5,
        )
        ctx.restore()
      }
    }
  },
}
