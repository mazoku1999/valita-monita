import { ATARDECER, type ContextoEscena, type Escena, GIRASOLES, LLUVIA, NOCHE } from './escenas'
import { dibujarFinal, pintarFondoFinal } from './final'
import { type LineaEscenario, dibujarLetrero } from './letrero'
import { Pincel, type Punto, TINTA, limitar, mezclar, rebote, suave, trazarSuave } from './pincel'

/**
 * El escenario de la canción del agujero negro, un dibujo animado de los años 30 pintado en un
 * lienzo 2D (lo pidió el usuario: "que parezca animaciones estilo Cuphead… que no parezca IA") que el
 * pase de dibujo compone antes de la película, así que le caen el grano, el vaivén y la viñeta como
 * a todo lo demás. Se dibuja al ritmo del dibujo animado (24 por segundo; las escenas, "en dos").
 *
 * Mientras suena seguimos dentro del agujero de gusano (lo pidió el usuario: "debe verse que aún
 * estamos viajando por el agujero negro"): las escenas (ver `escenas.ts`) se ven por un portal
 * redondo en el fondo del túnel, centrado donde va su eje, con el remolino girando alrededor; el
 * portal crece un poco a medida que la canción avanza. Para cambiar de escena el portal se cierra
 * sobre algo de la que se va (la luna, el sol que se pone, la estrella de la firma), se ve el túnel
 * un momento y se abre desde algo de la que llega. La letra va en su cinta, encima de todo (ver
 * `letrero.ts`).
 *
 * Al final se hace de noche, el portal se cierra en la primera estrella y, ya fuera del túnel, se
 * abre el mensaje para Valeria (ver `final.ts`), que tapa la pantalla hasta que se sigue deslizando:
 * entonces se cierra hacia el fondo del túnel y el viaje sigue por él.
 */

/** Las escenas, por la línea con la que empiezan (dos estrofas y dos estribillos). */
const SECCIONES: readonly { readonly escena: Escena; readonly linea: number }[] = [
  { escena: NOCHE, linea: 0 },
  { escena: GIRASOLES, linea: 8 },
  { escena: LLUVIA, linea: 13 },
  { escena: ATARDECER, linea: 21 },
]

const TIEMPOS = {
  /** El portal se abre este tiempo antes de la primera línea (s) y tarda esto en abrirse. */
  antesPrimera: 0.8,
  aperturaPrimera: 0.9,
  /** Cada escena empieza este tiempo antes de su primera línea. */
  antesSeccion: 0.55,
  /** Entre escenas: lo que tarda el portal en cerrarse, lo que se ve el túnel y lo que tarda en abrirse. */
  cierre: 0.46,
  tunel: 0.3,
  apertura: 0.52,
  /** Tras la última línea: se hace de noche y el portal se cierra en la primera estrella... */
  cierreFinal: 3.6,
  /** ...y empieza el final, ya fuera del túnel; tarda esto en llenar la pantalla. */
  final: 4.3,
  aperturaFinal: 1.0,
} as const

/**
 * El portal: su radio mayor (fracción del alto y del ancho de la pantalla, el menor de los dos),
 * cuánto más pequeño empieza y cuánto más que el portal mide la escena (lo que asoma al rebotar).
 */
const PORTAL = { alto: 0.46, ancho: 0.48, crecimiento: 0.14, margen: 1.08 } as const

/** El paneo de la cámara en cada escena: lo más cercano avanza `velocidad` u/s, hasta `margen` de la escena. */
const PANEO = { velocidad: 0.5, margen: 0.3 } as const

interface Cortes {
  /** Cuándo empieza cada escena (s, reloj de la canción). */
  readonly secciones: readonly { readonly escena: Escena; readonly desde: number }[]
  /** Cuándo acaban (el portal ya cerrado en la última estrella). */
  readonly fin: number
}

/** El final: su reloj (s desde que empezó), cuánto está abierto (0–1) y "Sigue deslizando" (0–1). */
export interface EstadoFinal {
  readonly tau: number
  readonly apertura: number
  readonly pista: number
}

export interface Dibujo {
  readonly lineas: readonly LineaEscenario[] | null
  /** Reloj de la canción (s), si suena. */
  readonly t: number | null
  /** El fondo del túnel en pantalla (px): el centro del portal. */
  readonly centro: Punto
  readonly final: EstadoFinal | null
}

export class Escenario {
  readonly lienzo: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly pincel: Pincel
  /** El lado (px) del cuadrado en el que se pintan las escenas, a su tamaño mayor. */
  private lado = 2
  /** Las capas quietas de cada escena, pintadas una vez por tamaño (sólo la de ahora y la siguiente). */
  private readonly capas = new Map<Escena, (HTMLCanvasElement | null)[]>()
  private fondoDelFinal: HTMLCanvasElement | null = null
  private cortesDe: { readonly lineas: readonly LineaEscenario[]; readonly cortes: Cortes } | null = null
  /** La letra de la cinta (Corben, en cuanto se carga). */
  private familia = 'Georgia, serif'

  constructor() {
    this.lienzo = document.createElement('canvas')
    this.lienzo.width = 2
    this.lienzo.height = 2
    const ctx = this.lienzo.getContext('2d')
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
    this.lado = Math.max(2, Math.round(2 * Math.min(PORTAL.alto * alto, PORTAL.ancho * ancho) * PORTAL.margen))
    this.capas.clear()
    this.fondoDelFinal = null
    return true
  }

  /** Cuándo empieza el final (s, reloj de la canción). */
  inicioDelFinal(lineas: readonly LineaEscenario[]): number {
    return (lineas[lineas.length - 1]?.fin ?? 0) + TIEMPOS.final
  }

  /**
   * Cómo está el final `tau` s después de empezar, con la página a `desvio` vh de donde empezó y
   * con el scroll suelto o no: se abre desde el fondo del túnel y, al deslizar, se cierra hacia él.
   */
  estadoFinal(tau: number, desvio: number, sueltoElScroll: boolean): EstadoFinal | null {
    const porScroll = 1 - suave((Math.abs(desvio) - 1.5) / 10)
    if (porScroll <= 0.001) return null
    const abrir = 1 - Math.pow(1 - limitar(tau / TIEMPOS.aperturaFinal), 3)
    const pista = sueltoElScroll ? limitar((tau - 7) / 0.8) * limitar((porScroll - 0.75) / 0.25) : 0
    return { tau, apertura: Math.min(abrir, porScroll), pista }
  }

  /** Si el final tapa toda la pantalla (el resto del dibujo no hace falta calcularlo). */
  finalTapa(final: EstadoFinal | null): boolean {
    return final !== null && final.apertura >= 0.999 && final.tau >= TIEMPOS.aperturaFinal
  }

  private cortes(lineas: readonly LineaEscenario[]): Cortes {
    if (this.cortesDe?.lineas === lineas) return this.cortesDe.cortes
    const secciones = SECCIONES.filter((s) => lineas[s.linea] !== undefined).map((s, k) => ({
      escena: s.escena,
      desde: lineas[s.linea].inicio - (k === 0 ? TIEMPOS.antesPrimera : TIEMPOS.antesSeccion),
    }))
    const fin = (lineas[lineas.length - 1]?.fin ?? 0) + TIEMPOS.cierreFinal + TIEMPOS.cierre
    const cortes = { secciones, fin }
    this.cortesDe = { lineas, cortes }
    return cortes
  }

  /** Pinta el escenario: las escenas en su portal y la letra mientras suena, y el final. */
  dibujar({ lineas, t, centro, final }: Dibujo): void {
    const ctx = this.ctx
    const W = this.lienzo.width
    const H = this.lienzo.height
    ctx.clearRect(0, 0, W, H)
    if (lineas && t !== null) this.dibujarEscenas(lineas, t, centro)
    else this.capas.clear()
    if (final) this.dibujarElFinal(final, centro)
    if (lineas && t !== null) {
      // La cinta va a 24 dibujos por segundo; la tinta hierve a 12.
      this.pincel.u = Math.min(W, H) / 100
      this.pincel.hervor = Math.floor(t * 12)
      ctx.save()
      dibujarLetrero(this.pincel, lineas, t, this.familia)
      ctx.restore()
    }
  }

  private dibujarEscenas(lineas: readonly LineaEscenario[], t: number, [cx, cy]: Punto): void {
    const { secciones, fin } = this.cortes(lineas)
    if (secciones.length === 0) return
    const inicio = secciones[0].desde
    if (t < inicio) return
    if (t >= fin) {
      this.capas.clear()
      return
    }
    const ctx = this.ctx
    const p = this.pincel
    let k = 0
    for (let i = 0; i < secciones.length; i++) if (secciones[i].desde <= t) k = i
    const { escena, desde } = secciones[k]
    const hasta = k + 1 < secciones.length ? secciones[k + 1].desde : fin

    // La escena se pinta en un cuadrado de lado S (su tamaño mayor) y se ve, a escala, por el portal.
    const S = this.lado
    const uEscena = S / 100
    const tDibujo = Math.floor(t * 12) / 12
    const panEn = (instante: number): number => Math.min(PANEO.margen * S, Math.max(0, instante - desde) * PANEO.velocidad * uEscena)
    const pan = panEn(tDibujo)
    const c: ContextoEscena = { p, W: S, H: S, u: uEscena, t: tDibujo, linea: (i) => lineas[i], pan, panEn }
    const R = (S / 2 / PORTAL.margen) * (1 - PORTAL.crecimiento * (1 - limitar((t - inicio) / (fin - inicio))))
    const lado = 2 * R * PORTAL.margen
    const escala = lado / S
    const aPantalla = ([x, y]: Punto): Punto => [cx - lado / 2 + x * escala, cy - lado / 2 + y * escala]

    // Cuánto está abierto el portal y hacia qué punto de la escena se abre o se cierra.
    const { aperturaPrimera, apertura, cierre, tunel } = TIEMPOS
    const medio: Punto = [S / 2, S / 2]
    let abierto = 1
    let foco = medio
    const d = t - desde
    if (k === 0 && d < aperturaPrimera) abierto = Math.min(PORTAL.margen, rebote(d / aperturaPrimera))
    else if (k > 0 && d < tunel / 2 + apertura) {
      abierto = suave((d - tunel / 2) / apertura)
      foco = escena.focoEntrada?.(c) ?? medio
    }
    const hueco = k + 1 < secciones.length ? tunel / 2 : 0
    const e = hasta - t
    if (e < hueco + cierre) {
      abierto = Math.min(abierto, suave((e - hueco) / cierre))
      foco = escena.focoSalida?.(c) ?? medio
    }
    if (abierto > 0.004) {
      const [fx, fy] = aPantalla(foco)
      const centroPortal: Punto = [mezclar(fx, cx, Math.min(1, abierto)), mezclar(fy, cy, Math.min(1, abierto))]
      const r = R * abierto
      ctx.save()
      ctx.beginPath()
      ctx.arc(centroPortal[0], centroPortal[1], r, 0, Math.PI * 2)
      ctx.clip()
      ctx.translate(cx - lado / 2, cy - lado / 2)
      ctx.scale(escala, escala)
      p.u = uEscena
      p.hervor = Math.floor(t * 12)
      if (escena.cielo) escena.cielo(c)
      const lienzos = this.capasDe(escena)
      escena.capas.forEach((capa, i) => ctx.drawImage(lienzos[i], -Math.round(pan * capa.profundidad), 0))
      escena.animar(c)
      ctx.restore()
      p.u = Math.min(this.lienzo.width, this.lienzo.height) / 100
      this.borde(centroPortal, r)
    }

    // La escena siguiente se pinta de antemano, una capa por dibujo, para que el corte no tarde; las
    // demás se sueltan.
    const siguiente = secciones[k + 1]
    if (siguiente && siguiente.desde - t < 4) this.capasDe(siguiente.escena, 1)
    for (const otra of this.capas.keys()) if (otra !== escena && otra !== siguiente?.escena) this.capas.delete(otra)
  }

  /** El final: se abre desde el fondo del túnel hasta tapar la pantalla (y al deslizar, se cierra). */
  private dibujarElFinal(final: EstadoFinal, [cx, cy]: Punto): void {
    const ctx = this.ctx
    const p = this.pincel
    const W = this.lienzo.width
    const H = this.lienzo.height
    const lejos = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) * 1.02
    const r = lejos * final.apertura
    if (r < 1) return
    p.u = Math.min(W, H) / 100
    p.hervor = Math.floor(final.tau * 12)
    this.fondoDelFinal ??= this.pintarFondoDelFinal()
    const lleno = final.apertura >= 0.999
    ctx.save()
    if (!lleno) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.clip()
    }
    dibujarFinal(p, W, H, final.tau, final.pista, this.familia, this.fondoDelFinal)
    ctx.restore()
    if (!lleno) this.borde([cx, cy], r)
  }

  /** El borde del portal: tinta que tiembla, un filo crema por dentro y la hondura, en sombra. */
  private borde([x, y]: Punto, r: number): void {
    if (r < 1) return
    const ctx = this.ctx
    const p = this.pincel
    const u = p.u
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0, r - u * 1.2), 0, Math.PI * 2)
    ctx.lineWidth = u * 2.4
    ctx.strokeStyle = 'rgba(30, 18, 12, 0.2)'
    ctx.stroke()
    const filo = new Path2D()
    trazarSuave(filo, p.temblar(p.circulo(x, y, Math.max(0, r - u * 0.6), 56), 9301, 0.5), true)
    ctx.lineWidth = u * 0.32
    ctx.strokeStyle = 'rgba(243, 227, 191, 0.85)'
    ctx.stroke(filo)
    const tinta = new Path2D()
    trazarSuave(tinta, p.temblar(p.circulo(x, y, r, 56), 9300, 0.6), true)
    ctx.lineWidth = u * 1.0
    ctx.lineJoin = 'round'
    ctx.strokeStyle = TINTA
    ctx.stroke(tinta)
    ctx.restore()
  }

  private pintarFondoDelFinal(): HTMLCanvasElement {
    const lienzo = document.createElement('canvas')
    lienzo.width = this.lienzo.width
    lienzo.height = this.lienzo.height
    const ctx = lienzo.getContext('2d')
    if (ctx) {
      const p = new Pincel(ctx)
      p.u = Math.min(lienzo.width, lienzo.height) / 100
      pintarFondoFinal(p, lienzo.width, lienzo.height)
    }
    return lienzo
  }

  /** Las capas de una escena (a su tamaño de escena); pinta las que falten (todas, o sólo `cuantas`). */
  private capasDe(escena: Escena, cuantas = Infinity): HTMLCanvasElement[] {
    let lienzos = this.capas.get(escena)
    if (!lienzos) {
      lienzos = escena.capas.map(() => null)
      this.capas.set(escena, lienzos)
    }
    const S = this.lado
    for (let i = 0; i < lienzos.length && cuantas > 0; i++) {
      if (lienzos[i]) continue
      const capa = escena.capas[i]
      const lienzo = document.createElement('canvas')
      lienzo.width = S + Math.ceil(PANEO.margen * S * capa.profundidad) + 2
      lienzo.height = S
      const ctx = lienzo.getContext('2d')
      if (ctx) {
        const p = new Pincel(ctx)
        p.u = S / 100
        capa.pintar(p, lienzo.width, S, S)
      }
      lienzos[i] = lienzo
      cuantas--
    }
    return lienzos.filter((lienzo): lienzo is HTMLCanvasElement => lienzo !== null)
  }
}
