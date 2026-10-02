import { ATARDECER, type ContextoEscena, type Escena, GIRASOLES, LLUVIA, NOCHE } from './escenas'
import { type LineaEscenario, dibujarLetrero } from './letrero'
import { Pincel, type Punto, suave } from './pincel'

/**
 * El escenario de la canción del agujero negro: mientras suena, la pantalla es un dibujo animado de
 * los años 30 pintado en un lienzo 2D (lo pidió el usuario: "que parezca animaciones estilo
 * Cuphead… que no parezca IA"): una escena por sección de la canción (ver `escenas.ts`), con su
 * utilería que entra línea a línea, y la letra en una cinta de época con el girasol que salta de
 * palabra en palabra (ver `letrero.ts`). Se dibuja al ritmo del dibujo animado (24 por segundo, las
 * escenas a 12, "en dos") y lo compone el pase de dibujo antes de la película, así que le caen el
 * grano, el vaivén, la viñeta y el iris como a todo lo demás. En cada escena la cámara se corre
 * despacio y las capas del paisaje pasan a distinta velocidad según lo cerca que estén.
 *
 * Se entra con el iris de la película, que se cierra sobre el remolino justo antes de la primera
 * línea, y se cambia de escena con un iris dentro del propio dibujo, que se cierra sobre algo de la
 * escena que se va (la luna, el sol que se pone, la estrella de la pluma) y se abre desde algo de
 * la que llega, por debajo de la cinta (la letra no se tapa nunca). Al final, ya de noche, se
 * cierra en la primera estrella y la película abre su iris sobre nuestro sistema solar.
 */

/** Las escenas, por la línea con la que empiezan (dos estrofas y dos estribillos). */
const SECCIONES: readonly { readonly escena: Escena; readonly linea: number }[] = [
  { escena: NOCHE, linea: 0 },
  { escena: GIRASOLES, linea: 8 },
  { escena: LLUVIA, linea: 13 },
  { escena: ATARDECER, linea: 21 },
]

const TIEMPOS = {
  /** Se entra en el escenario este tiempo antes de la primera línea (s). */
  antesPrimera: 0.8,
  /** Cada escena empieza este tiempo antes de su primera línea. */
  antesSeccion: 0.55,
  /** Se sale tras la última línea (antes de que se suelte el scroll, a los 12 s). */
  despuesUltima: 10.9,
  /** El iris: lo que tarda en cerrarse, lo que se queda cerrado y lo que tarda en abrirse. */
  cierre: 0.46,
  negro: 0.08,
  apertura: 0.52,
  /** Antes de salir, el resto del dibujo vuelve a calcularse (que se prepare tapado). */
  preparar: 1.5,
} as const

/** El paneo de la cámara en cada escena: lo más cercano avanza `velocidad` u/s, hasta `margen` de la pantalla. */
const PANEO = { velocidad: 0.5, margen: 0.3 } as const

interface Cortes {
  /** Cuándo empieza cada escena (s, reloj de la canción). */
  readonly secciones: readonly { readonly escena: Escena; readonly desde: number }[]
  /** Cuándo se sale del escenario. */
  readonly fin: number
}

export interface EstadoEscenario {
  /** Si se ve (todo o nada: el cambio lo tapa el iris). */
  readonly opacidad: number
  /** El iris de la película (1 abierto, 0 cerrado). */
  readonly iris: number
  /** Si tapa la pantalla entera. */
  readonly cubre: boolean
}

const FUERA: EstadoEscenario = { opacidad: 0, iris: 1, cubre: false }

export class Escenario {
  readonly lienzo: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly pincel: Pincel
  /** Las capas quietas de cada escena, pintadas una vez por tamaño (sólo la de ahora y la siguiente). */
  private readonly capas = new Map<Escena, (HTMLCanvasElement | null)[]>()
  private cortesDe: { readonly lineas: readonly LineaEscenario[]; readonly cortes: Cortes } | null = null
  /** La letra de la cinta (Corben, en cuanto se carga). */
  private familia = 'Georgia, serif'

  constructor() {
    this.lienzo = document.createElement('canvas')
    this.lienzo.width = 2
    this.lienzo.height = 2
    const ctx = this.lienzo.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Sin lienzo 2D para el escenario de la canción')
    this.ctx = ctx
    this.pincel = new Pincel(ctx)
  }

  /** Carga la letra de la cinta (la variable CSS de `next/font`); hasta entonces, una de pie. */
  cargarLetra(variable = '--font-letra-cancion'): void {
    const familia = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    if (!familia || !document.fonts) return
    document.fonts
      .load(`700 48px ${familia}`)
      .then((caras) => {
        if (caras.length > 0) this.familia = familia
      })
      .catch(() => undefined)
  }

  /** Ajusta el lienzo (px); devuelve si cambió. */
  dimensionar(ancho: number, alto: number): boolean {
    if (this.lienzo.width === ancho && this.lienzo.height === alto) return false
    this.lienzo.width = ancho
    this.lienzo.height = alto
    this.pincel.u = Math.min(ancho, alto) / 100
    this.capas.clear()
    return true
  }

  private cortes(lineas: readonly LineaEscenario[]): Cortes {
    if (this.cortesDe?.lineas === lineas) return this.cortesDe.cortes
    const secciones = SECCIONES.filter((s) => lineas[s.linea] !== undefined).map((s, k) => ({
      escena: s.escena,
      desde: lineas[s.linea].inicio - (k === 0 ? TIEMPOS.antesPrimera : TIEMPOS.antesSeccion),
    }))
    const fin = (lineas[lineas.length - 1]?.fin ?? 0) + TIEMPOS.despuesUltima
    const cortes = { secciones, fin }
    this.cortesDe = { lineas, cortes }
    return cortes
  }

  /** Si se ve el escenario en `t` y cómo va el iris de la película. */
  estado(lineas: readonly LineaEscenario[], t: number): EstadoEscenario {
    const { secciones, fin } = this.cortes(lineas)
    if (secciones.length === 0) return FUERA
    const inicio = secciones[0].desde
    const { cierre, negro, apertura, preparar } = TIEMPOS
    if (t < inicio) return { opacidad: 0, iris: 1 - suave((t - (inicio - cierre)) / cierre), cubre: false }
    if (t < fin) return { opacidad: 1, iris: 1, cubre: t < fin - preparar }
    return { opacidad: 0, iris: suave((t - fin - negro) / apertura), cubre: false }
  }

  /** Pinta el escenario en `t` (s, reloj de la canción). */
  dibujar(lineas: readonly LineaEscenario[], t: number): void {
    const { secciones, fin } = this.cortes(lineas)
    if (secciones.length === 0) return
    const ctx = this.ctx
    const p = this.pincel
    const W = this.lienzo.width
    const H = this.lienzo.height
    // Las escenas se mueven "en dos" (12 dibujos por segundo) y la tinta hierve al mismo ritmo; la
    // cinta, el girasol y el iris van a 24.
    p.hervor = Math.floor(t * 12)
    let k = 0
    for (let i = 0; i < secciones.length; i++) if (secciones[i].desde <= t) k = i
    const { escena, desde: inicio } = secciones[k]
    const tDibujo = Math.floor(t * 12) / 12
    const panEn = (instante: number): number => Math.min(PANEO.margen * W, Math.max(0, instante - inicio) * PANEO.velocidad * p.u)
    const pan = panEn(tDibujo)
    const c: ContextoEscena = { p, W, H, u: p.u, t: tDibujo, linea: (i) => lineas[i], vertical: H > W, pan, panEn }

    ctx.save()
    if (escena.cielo) escena.cielo(c)
    const lienzos = this.capasDe(escena)
    escena.capas.forEach((capa, i) => ctx.drawImage(lienzos[i], -Math.round(pan * capa.profundidad), 0))
    escena.animar(c)
    ctx.restore()

    const iris = this.iris(secciones, fin, t, c)
    if (iris) this.dibujarIris(iris.foco, iris.radio, Math.floor(t * 24))

    ctx.save()
    dibujarLetrero(p, lineas, t, this.familia)
    ctx.restore()

    // La escena siguiente se pinta de antemano, una capa por dibujo, para que el corte no tarde; las
    // demás se sueltan.
    const siguiente = secciones[k + 1]
    if (siguiente && siguiente.desde - t < 4) this.capasDe(siguiente.escena, 1)
    for (const otra of this.capas.keys()) if (otra !== escena && otra !== siguiente?.escena) this.capas.delete(otra)
  }

  /** El iris dentro del dibujo: cuánto está abierto (0–1) y en qué punto, o nada si está abierto. */
  private iris(secciones: Cortes['secciones'], fin: number, t: number, c: ContextoEscena): { foco: Punto; radio: number } | null {
    const { cierre, negro, apertura } = TIEMPOS
    const centro: Punto = [c.W / 2, c.H / 2]
    for (let i = 0; i < secciones.length; i++) {
      const { escena, desde } = secciones[i]
      const hasta = i + 1 < secciones.length ? secciones[i + 1].desde : fin
      if (t < desde || t >= hasta) continue
      // Se abre al llegar a la escena...
      const d = t - desde
      if (d < negro + apertura) return { foco: escena.focoEntrada?.(c) ?? centro, radio: suave((d - negro) / apertura) }
      // ...y se cierra al irse.
      const e = hasta - t
      if (e <= cierre + negro) return { foco: escena.focoSalida?.(c) ?? centro, radio: suave((e - negro) / cierre) }
      return null
    }
    return null
  }

  /** Negro alrededor de un círculo de borde algo tembloroso, como el iris de la película. */
  private dibujarIris([fx, fy]: Punto, radio: number, cuadro: number): void {
    if (radio >= 1) return
    const ctx = this.ctx
    const W = this.lienzo.width
    const H = this.lienzo.height
    const lejos = Math.max(Math.hypot(fx, fy), Math.hypot(W - fx, fy), Math.hypot(fx, H - fy), Math.hypot(W - fx, H - fy))
    const r = radio * lejos * 1.03
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    if (r > 0.5) {
      const n = 96
      for (let i = 0; i <= n; i++) {
        const a = (2 * Math.PI * i) / n
        const rr = r * (1 + 0.012 * Math.sin(a * 5 + cuadro * 0.7))
        if (i === 0) ctx.moveTo(fx + rr, fy)
        else ctx.lineTo(fx + rr * Math.cos(a), fy + rr * Math.sin(a))
      }
      ctx.closePath()
    }
    ctx.fillStyle = '#000'
    ctx.fill('evenodd')
    ctx.restore()
  }

  /** Las capas de una escena; pinta las que falten (todas, o sólo `cuantas`). */
  private capasDe(escena: Escena, cuantas = Infinity): HTMLCanvasElement[] {
    let lienzos = this.capas.get(escena)
    if (!lienzos) {
      lienzos = escena.capas.map(() => null)
      this.capas.set(escena, lienzos)
    }
    const W = this.lienzo.width
    const H = this.lienzo.height
    for (let i = 0; i < lienzos.length && cuantas > 0; i++) {
      if (lienzos[i]) continue
      const capa = escena.capas[i]
      const lienzo = document.createElement('canvas')
      lienzo.width = W + Math.ceil(PANEO.margen * W * capa.profundidad) + 2
      lienzo.height = H
      const ctx = lienzo.getContext('2d')
      if (ctx) {
        const p = new Pincel(ctx)
        p.u = this.pincel.u
        capa.pintar(p, lienzo.width, H, W)
      }
      lienzos[i] = lienzo
      cuantas--
    }
    return lienzos.filter((lienzo): lienzo is HTMLCanvasElement => lienzo !== null)
  }
}
