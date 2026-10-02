import { MENSAJE_FINAL } from '../constantes/cancion'
import { anchoDeFrases, cintaConFrases } from './letrero'
import { aguadas, arbol, cabezaGirasol, campo, cieloDegradado, estrellaDibujo, estrellitas, lados, lomas, luna, pintarLomas, tallo } from './piezas'
import { type Pincel, type Punto, TINTA, limitar, mezclar, rebote, semillero, suave } from './pincel'

/**
 * El final de la canción, ya fuera del túnel: una noche sobre el campo de girasoles en la que las
 * estrellas aparecen una a una y se unen, como la constelación de la primera estrofa, hasta escribir
 * el nombre de Valeria; los girasoles levantan la cabeza para mirarlo y una cinta se despliega con
 * el resto del mensaje (ver `MENSAJE_FINAL`). Cuando se suelta el scroll, abajo aparece "Sigue
 * deslizando". Todo lleva su propio reloj (`tau`, s desde que empieza), así sirve también si se
 * salta la canción.
 */

/** Las letras de constelación: estrellas (x de 0 a `ancho`, y de 0 arriba a 1 abajo) y trazos entre ellas. */
interface LetraEstrellas {
  readonly ancho: number
  readonly puntos: readonly Punto[]
  readonly trazos: readonly (readonly [number, number])[]
}

const LETRAS: Readonly<Record<string, LetraEstrellas>> = {
  V: { ancho: 0.8, puntos: [[0, 0], [0.4, 1], [0.8, 0]], trazos: [[0, 1], [1, 2]] },
  A: { ancho: 0.8, puntos: [[0, 1], [0.4, 0], [0.8, 1], [0.17, 0.6], [0.63, 0.6]], trazos: [[0, 1], [1, 2], [3, 4]] },
  L: { ancho: 0.58, puntos: [[0, 0], [0, 1], [0.58, 1]], trazos: [[0, 1], [1, 2]] },
  E: {
    ancho: 0.6,
    puntos: [[0.6, 0], [0, 0], [0, 0.5], [0.48, 0.5], [0, 1], [0.6, 1]],
    trazos: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]],
  },
  R: {
    ancho: 0.66,
    puntos: [[0, 1], [0, 0], [0.44, 0], [0.64, 0.24], [0.44, 0.5], [0, 0.5], [0.66, 1]],
    trazos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6]],
  },
  I: { ancho: 0, puntos: [[0, 0], [0, 0.5], [0, 1]], trazos: [[0, 1], [1, 2]] },
}

/** Separación entre letras, en altos de letra. */
const ENTRE_LETRAS = 0.34

interface Constelacion {
  /** Estrellas en orden de aparición, con su letra. */
  readonly estrellas: readonly { readonly x: number; readonly y: number; readonly letra: number }[]
  /** Trazos: índices de dos estrellas y su letra. */
  readonly trazos: readonly (readonly [number, number, number])[]
  readonly letras: number
}

function constelacion(nombre: string, cx: number, cy: number, alto: number): Constelacion {
  const letras = [...nombre].map((letra) => LETRAS[letra] ?? { ancho: 0, puntos: [[0, 0.5]], trazos: [] })
  const ancho = letras.reduce((suma, l) => suma + l.ancho, 0) + ENTRE_LETRAS * (letras.length - 1)
  let x0 = cx - (ancho * alto) / 2
  const estrellas: { x: number; y: number; letra: number }[] = []
  const trazos: [number, number, number][] = []
  letras.forEach((l, i) => {
    const base = estrellas.length
    for (const [px, py] of l.puntos) estrellas.push({ x: x0 + px * alto, y: cy - alto / 2 + py * alto, letra: i })
    for (const [a, b] of l.trazos) trazos.push([base + a, base + b, i])
    x0 += (l.ancho + ENTRE_LETRAS) * alto
  })
  return { estrellas, trazos, letras: letras.length }
}

/** El ancho del nombre en altos de letra (para escoger su tamaño). */
function anchoDelNombre(nombre: string): number {
  const letras = [...nombre].map((letra) => LETRAS[letra]?.ancho ?? 0)
  return letras.reduce((a, b) => a + b, 0) + ENTRE_LETRAS * (letras.length - 1)
}

/** Dónde va cada cosa en la pantalla (fracciones de alto), según sea ancha o estrecha. */
const disposicion = (W: number, H: number) => {
  const vertical = H > W * 1.15
  return vertical
    ? { vertical, nombre: 0.2, cinta: 0.37, pista: 0.6, luna: [0.2, 0.085] as const, lejos: 0.7, medio: 0.77 }
    : { vertical, nombre: 0.26, cinta: 0.52, pista: 0.735, luna: [0.14, 0.15] as const, lejos: 0.69, medio: 0.77 }
}

/** Lo quieto del final (cielo, estrellitas y lomas), pintado una vez por tamaño. */
export function pintarFondoFinal(p: Pincel, W: number, H: number): void {
  const u = p.u
  const d = disposicion(W, H)
  cieloDegradado(p.ctx, W, H, [
    [0, '#0b1540'],
    [0.5, '#1c3677'],
    [0.72, '#34599d'],
  ])
  aguadas(p, W, H, 51, '#365ea9', 8, 0.52, 0.26)
  p.papel(0, 0, W, H, 0.42)
  estrellitas(p, W, H, 52, Math.round((W / u) * 0.9), d.lejos - 0.04)
  const lejos = lomas(53, H, u, d.lejos, 2.2)
  pintarLomas(p, W, H, lejos, '#2b4a8b', 53, { tinta: false })
  const r = semillero(54)
  const cuantos = Math.round(W / (u * 15))
  for (let i = 0; i < cuantos; i++) {
    const x = ((i + 0.2 + r() * 0.6) / cuantos) * W
    arbol(p, x, lejos(x) + u * 1.4, u * (5 + r() * 3), '#243f7a', '#243f7a', 5400 + i * 3, false)
  }
  pintarLomas(p, W, H, lomas(55, H, u, d.medio, 1.6), '#203566', 55)
}

/**
 * Dibuja el final en `tau` (s desde que empezó). `pista` (0–1) muestra "Sigue deslizando";
 * `fondo` es lo pintado por `pintarFondoFinal` para este tamaño.
 */
export function dibujarFinal(p: Pincel, W: number, H: number, tau: number, pista: number, familia: string, fondo: HTMLCanvasElement): void {
  const ctx = p.ctx
  const u = p.u
  const d = disposicion(W, H)
  const t = Math.floor(tau * 12) / 12
  ctx.drawImage(fondo, 0, 0)

  // La luna, con su luz en anillos planos.
  const [lx, ly] = [W * d.luna[0], H * d.luna[1]]
  const lr = u * 8.5
  ctx.save()
  ctx.fillStyle = '#fbe9b0'
  for (let i = 2; i >= 1; i--) {
    ctx.globalAlpha = 0.1
    ctx.beginPath()
    ctx.arc(lx, ly, lr * (1 + i * 0.55), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  luna(p, lx, ly, lr, 7100)

  // De vez en cuando, una estrella fugaz cruza el cielo, por encima del nombre.
  if (t > 6) {
    const n = Math.floor((t - 6) / 7)
    const s = t - 6 - n * 7
    if (s < 1.2) {
      const desdeX = W * (0.96 - 0.12 * (n % 3))
      const hastaX = W * (0.58 - 0.12 * (n % 3))
      const y0 = H * (d.vertical ? 0.04 : 0.05)
      const y1 = H * (d.vertical ? 0.1 : 0.14)
      const k = suave(s / 1.2)
      ctx.save()
      ctx.fillStyle = '#fff1b8'
      for (let i = 0; i < 12; i++) {
        const kk = Math.max(0, k - i * 0.025)
        ctx.globalAlpha = (1 - i / 12) * (1 - limitar((s - 0.9) / 0.3))
        ctx.beginPath()
        ctx.arc(mezclar(desdeX, hastaX, kk), mezclar(y0, y1, kk), u * (0.55 - 0.03 * i), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      estrellaDibujo(p, mezclar(desdeX, hastaX, k), mezclar(y0, y1, k), u * 1.7, '#fff1b8', 7200 + (n % 5), t * 4, 1 - limitar((s - 0.9) / 0.3))
    }
  }

  // El campo de girasoles; cuando el nombre ya está escrito, levantan la cabeza para mirarlo, uno
  // tras otro.
  const { atras, delante } = campo(W, H, u, d.vertical, W + u * 6)
  for (const [fila, flores] of [
    [0, atras],
    [1, delante],
  ] as const) {
    flores.forEach((f, i) => {
      const x = f.x + Math.sin(t * 0.8 + f.fase) * u * 0.7
      const alzado = suave((t - 5.6 - (0.9 * f.x) / W) / 0.9)
      tallo(p, x, f.y, H * 1.05, f.r, 7300 + fila * 300 + i * 9, x - f.x)
      cabezaGirasol(p, x, f.y, f.r, 60 + fila * 30 + i, 1, Math.sin(t * 0.6 + f.fase) * 0.05, 1, alzado)
    })
  }
  // La noche tiñe el campo y las lomas.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, H * (d.lejos - 0.05), W, H)
  ctx.clip()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = '#8492c6'
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  // El nombre, escrito con estrellas: aparecen una a una y luego se unen con trazos punteados.
  const alto = Math.min(H * (d.vertical ? 0.08 : 0.16), (W * 0.88) / anchoDelNombre(MENSAJE_FINAL.nombre))
  const nombre = constelacion(MENSAJE_FINAL.nombre, W / 2, H * d.nombre, alto)
  const aparece = (i: number): number => 1.1 + 0.075 * i
  ctx.save()
  ctx.setLineDash([alto * 0.075, alto * 0.045])
  for (const [a, b, letra] of nombre.trazos) {
    const prog = limitar((t - (1.9 + 0.32 * letra)) / 0.45)
    if (prog <= 0) continue
    const ea = nombre.estrellas[a]
    const eb = nombre.estrellas[b]
    p.linea(
      [
        [ea.x, ea.y],
        [mezclar(ea.x, eb.x, prog), mezclar(ea.y, eb.y, prog)],
      ],
      7600 + a * 7 + b,
      Math.max(0.45, (alto * 0.032) / u),
      '#ffe9a8',
      0.35,
    )
  }
  ctx.restore()
  const brillo = t > 4.4 && t < 4.9 ? 1 + 0.22 * Math.sin(((t - 4.4) / 0.5) * Math.PI) : 1
  nombre.estrellas.forEach((e, i) => {
    const s = t - aparece(i)
    if (s <= 0) return
    const titileo = 1 + 0.07 * Math.sin(t * 1.7 + i * 1.3)
    estrellaDibujo(p, e.x, e.y, alto * 0.095, '#ffd75e', 7700 + i * 3, Math.sin(t * 0.9 + i) * 0.12, rebote(s / 0.3) * titileo * brillo)
    if (s < 0.45) p.rayitas(e.x, e.y, alto * 0.14, 6, 7800 + i, 1 - s / 0.45)
  })
  // Destellos finos alrededor del nombre, cuando ya está escrito.
  if (t > 4.6) {
    const r = semillero(79)
    ctx.save()
    ctx.strokeStyle = '#fff3c6'
    ctx.lineCap = 'round'
    for (let i = 0; i < 8; i++) {
      const x = W / 2 + (r() - 0.5) * alto * anchoDelNombre(MENSAJE_FINAL.nombre) * 1.1
      const y = H * d.nombre + (r() - 0.5) * alto * 1.9
      const fase = (t * 0.45 + r()) % 1
      const k = Math.sin(fase * Math.PI)
      if (k < 0.05) continue
      const largo = u * 1.3 * k
      ctx.globalAlpha = 0.85 * k
      ctx.lineWidth = u * 0.16
      ctx.beginPath()
      ctx.moveTo(x - largo, y)
      ctx.lineTo(x + largo, y)
      ctx.moveTo(x, y - largo)
      ctx.lineTo(x, y + largo)
      ctx.stroke()
    }
    ctx.restore()
  }

  // La cinta con el resto del mensaje (en cuatro renglones si la pantalla es estrecha).
  const base = Math.min(H * 0.062, W * 0.08)
  let frases: readonly string[] = MENSAJE_FINAL.frases
  let tamano = Math.min(base, (W * 0.8) / anchoDeFrases(ctx, frases, familia))
  if (tamano < base * 0.74) {
    frases = MENSAJE_FINAL.frasesCortas
    tamano = Math.min(base, (W * 0.8) / anchoDeFrases(ctx, frases, familia))
  }
  const ex = t > 4.8 ? rebote((t - 4.8) / 0.45) : 0
  cintaConFrases(p, frases, W / 2, H * d.cinta, tamano, familia, ex, 7900)

  // "Sigue deslizando", en un cartelito de papel (en claro sobre la noche, la S de la Corben
  // parecía un 8), con dos flechitas que bajan y suben despacio.
  if (pista > 0.01) {
    const yp = H * d.pista
    const letra = tamano * 0.7
    ctx.save()
    ctx.globalAlpha = pista
    ctx.font = `700 ${letra}px ${familia}`
    const ancho = ctx.measureText(MENSAJE_FINAL.pista).width + letra * 1.3
    const alto = letra * 1.55
    const cartel = lados(
      [
        [W / 2 - ancho / 2, yp - alto / 2],
        [W / 2 + ancho / 2, yp - alto / 2],
        [W / 2 + ancho / 2, yp + alto / 2],
        [W / 2 - ancho / 2, yp + alto / 2],
      ],
      letra * 0.5,
    )
    ctx.save()
    ctx.translate(letra * 0.08, letra * 0.12)
    p.forma(cartel, '#1d120b', 8100, { tinta: false, liso: true, opacidad: 0.3, temblor: 0 })
    ctx.restore()
    p.forma(cartel, '#f3e3bf', 8101, { grosor: p.trazo * 0.8 })
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#3a2416'
    ctx.fillText(MENSAJE_FINAL.pista, W / 2, yp + letra * 0.04)
    const baja = Math.sin((tau / 1.6) * Math.PI * 2) * u * 0.7
    for (const [k, opacidad] of [
      [0, 1],
      [1, 0.55],
    ] as const) {
      const y = yp + alto / 2 + letra * (0.62 + k * 0.42) + baja
      const a = letra * 0.36
      const flecha: Punto[] = [
        [W / 2 - a, y - a * 0.45],
        [W / 2, y + a * 0.2],
        [W / 2 + a, y - a * 0.45],
      ]
      ctx.globalAlpha = pista * opacidad
      p.linea(flecha, 8000 + k, (letra * 0.2) / u, TINTA, 0.3)
      p.linea(flecha, 8000 + k, (letra * 0.09) / u, '#f6e9c8', 0.3)
    }
    ctx.restore()
  }
}
