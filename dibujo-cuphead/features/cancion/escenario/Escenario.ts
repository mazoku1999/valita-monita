import { ATARDECER, type ContextoEscena, type Escena, GIRASOLES, LLUVIA, NOCHE } from './escenas'
import { dibujarFinal, pintarFondoFinal } from './final'
import { type LineaEscenario, dibujarLetrero } from './letrero'
import { Pincel, limitar, rebote, suave } from './pincel'

/**
 * El escenario de la canción del agujero negro, un dibujo animado de los años 30 pintado en lienzos
 * 2D (lo pidió el usuario: "que parezca animaciones estilo Cuphead… que no parezca IA") que el pase
 * de dibujo compone entre el dibujo y la película (ver `VIAJE_FRAG`), así que le caen el grano, el
 * vaivén y la viñeta como a todo lo demás. Se dibuja al ritmo del dibujo animado (24 por segundo;
 * las escenas, "en dos").
 *
 * Mientras suena seguimos viajando por el agujero de gusano (lo pidió el usuario: "debe verse que aún
 * estamos viajando por el agujero negro"; y después: "más enfocado el video, por encima de los
 * costados del agujero de gusano… más prioridad al lyrics"): cada escena (ver `escenas.ts`) se ve
 * grande y nítida en su recuadro, en el fondo del túnel, y a los costados va el agujero de gusano
 * (un vórtice luminoso con estelas de estrellas, que pinta el shader). Para cambiar de escena, la
 * que se va pasa de largo y la siguiente llega desde el fondo, con un momento de puro viaje entre
 * una y otra. La letra va en su cinta, nítida, encima de todo (ver `letrero.ts`), en un lienzo aparte.
 *
 * Al final se hace de noche, la última escena pasa de largo y, ya fuera del túnel, se descubre el
 * mensaje para Valeria (ver `final.ts`) en un círculo que crece desde el fondo; tapa la pantalla
 * hasta que se sigue deslizando, y entonces se cierra hacia el fondo del túnel.
 */

/** Las escenas, por la línea con la que empiezan (dos estrofas y dos estribillos). */
const SECCIONES: readonly { readonly escena: Escena; readonly linea: number }[] = [
  { escena: NOCHE, linea: 0 },
  { escena: GIRASOLES, linea: 8 },
  { escena: LLUVIA, linea: 13 },
  { escena: ATARDECER, linea: 21 },
]

const TIEMPOS = {
  /** La primera escena llega este tiempo antes de la primera línea (s) y tarda esto en llegar. */
  antesPrimera: 0.8,
  aperturaPrimera: 0.9,
  /** Cada escena empieza este tiempo antes de su primera línea. */
  antesSeccion: 0.55,
  /** Entre escenas: lo que tarda en pasar de largo la que se va, el viaje solo y la llegada de la siguiente. */
  cierre: 0.46,
  tunel: 0.3,
  apertura: 0.52,
  /** Tras la última línea: se hace de noche y la última escena pasa de largo... */
  cierreFinal: 3.6,
  /** ...y empieza el final, ya fuera del túnel; tarda esto en llenar la pantalla. */
  final: 4.3,
  aperturaFinal: 1.0,
  /** El vórtice está desde aquí (s), con el iris aún cerrado, así que la canción ya se abre sobre él... */
  viajeDesde: 1,
  /** ...y, después de la canción, en este tramo del carril (vh): el resto del túnel hasta su salida. */
  vorticeVh: { entra: [460, 484], sale: [700, 760] },
} as const

/**
 * El recuadro de la escena, grande (el video manda): en una pantalla ancha, todo el alto y casi todo
 * el ancho (a los lados queda el agujero de gusano); en una estrecha, todo el ancho y algo más de
 * alto que de ancho (el agujero, arriba y abajo). Sobra un poco por los bordes de la pantalla para
 * que allí no se note su borde suave.
 */
function recuadro(W: number, H: number): [number, number] {
  if (W >= 1.15 * H) return [Math.min(W * 0.8, 1.4 * H), 1.04 * H]
  return [1.04 * W, Math.min(1.35 * W, 0.64 * H)]
}

/** El paneo de la cámara en cada escena: lo más cercano avanza `velocidad` u/s, hasta `margen` del recuadro. */
const PANEO = { velocidad: 0.5, margen: 0.3 } as const

interface Cortes {
  /** Cuándo empieza cada escena (s, reloj de la canción). */
  readonly secciones: readonly { readonly escena: Escena; readonly desde: number }[]
  /** Cuándo acaban (la última ya pasó de largo). */
  readonly fin: number
}

/**
 * El final: su reloj (s desde que empezó), cuánto está abierto (0–1), "Sigue deslizando" (0–1) y
 * cuánto se ve el vórtice del agujero de gusano (sigue mientras se recorre el resto del túnel).
 */
export interface EstadoFinal {
  readonly tau: number
  readonly apertura: number
  readonly pista: number
  readonly viaje: number
}

export interface Dibujo {
  readonly lineas: readonly LineaEscenario[] | null
  /** Reloj de la canción (s), si suena. */
  readonly t: number | null
  readonly final: EstadoFinal | null
}

/** Cómo componer lo pintado (ver `ESCENARIO` y `VIAJE_FRAG`). */
export interface Composicion {
  /** Si la escena tiene algo que enseñar, su acercamiento y su opacidad. */
  readonly escena: boolean
  readonly zoom: number
  readonly opacidadEscena: number
  /** Medio ancho y medio alto del recuadro de la escena, en altos de pantalla. */
  readonly mitad: readonly [number, number]
  /** Cuánto se ve el viaje a los costados y por cuánto se descubre el final (1, entero). */
  readonly viaje: number
  readonly revelado: number
}

export class Escenario {
  /** Lo nítido: la letra y el final (con transparencia). */
  readonly lienzo: HTMLCanvasElement
  /** La escena pintada, en su recuadro. */
  readonly lienzoEscena: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly ctxEscena: CanvasRenderingContext2D
  private readonly pincel: Pincel
  private readonly pincelEscena: Pincel
  /** Las capas quietas de cada escena, pintadas una vez por tamaño (sólo la de ahora y la siguiente). */
  private readonly capas = new Map<Escena, (HTMLCanvasElement | null)[]>()
  private fondoDelFinal: HTMLCanvasElement | null = null
  private cortesDe: { readonly lineas: readonly LineaEscenario[]; readonly cortes: Cortes } | null = null
  /** La letra de la cinta (Corben, en cuanto se carga). */
  private familia = 'Georgia, serif'

  constructor() {
    this.lienzo = document.createElement('canvas')
    this.lienzoEscena = document.createElement('canvas')
    for (const lienzo of [this.lienzo, this.lienzoEscena]) {
      lienzo.width = 2
      lienzo.height = 2
    }
    const ctx = this.lienzo.getContext('2d')
    const ctxEscena = this.lienzoEscena.getContext('2d', { alpha: false })
    if (!ctx || !ctxEscena) throw new Error('Sin lienzo 2D para el escenario de la canción')
    this.ctx = ctx
    this.ctxEscena = ctxEscena
    this.pincel = new Pincel(ctx)
    this.pincelEscena = new Pincel(ctxEscena)
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

  /** Ajusta los lienzos a la pantalla (px); devuelve cuáles cambiaron de tamaño. */
  dimensionar(ancho: number, alto: number): { encima: boolean; escena: boolean } {
    const cambia = { encima: false, escena: false }
    if (this.lienzo.width !== ancho || this.lienzo.height !== alto) {
      this.lienzo.width = ancho
      this.lienzo.height = alto
      this.fondoDelFinal = null
      cambia.encima = true
    }
    const [we, he] = recuadro(ancho, alto).map(Math.round)
    if (this.lienzoEscena.width !== we || this.lienzoEscena.height !== he) {
      this.lienzoEscena.width = we
      this.lienzoEscena.height = he
      this.pincelEscena.u = Math.min(we, he) / 100
      this.capas.clear()
      cambia.escena = true
    }
    return cambia
  }

  /** Cuándo empieza el final (s, reloj de la canción). */
  inicioDelFinal(lineas: readonly LineaEscenario[]): number {
    return (lineas[lineas.length - 1]?.fin ?? 0) + TIEMPOS.final
  }

  /**
   * Cómo está el final `tau` s después de empezar, con la página en `vh` (y empezó en `vhFinal`) y
   * con el scroll suelto o no: se descubre desde el fondo del túnel y, al deslizar, se cierra hacia
   * él; el vórtice sigue mientras se recorre el resto del túnel (su boca de salida crece dentro).
   */
  estadoFinal(tau: number, vh: number, vhFinal: number, sueltoElScroll: boolean): EstadoFinal | null {
    const { entra, sale } = TIEMPOS.vorticeVh
    const viaje = suave((vh - entra[0]) / (entra[1] - entra[0])) * (1 - suave((vh - sale[0]) / (sale[1] - sale[0])))
    const porScroll = 1 - suave((Math.abs(vh - vhFinal) - 1.5) / 10)
    if (viaje <= 0.001 && porScroll <= 0.001) return null
    const abrir = 1 - Math.pow(1 - limitar(tau / TIEMPOS.aperturaFinal), 3)
    const pista = sueltoElScroll ? limitar((tau - 7) / 0.8) * limitar((porScroll - 0.75) / 0.25) : 0
    return { tau, apertura: Math.min(abrir, porScroll), pista, viaje }
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

  /** Pinta la escena (en su lienzo), la letra y el final (en el de encima) y dice cómo componerlos. */
  dibujar({ lineas, t, final }: Dibujo): Composicion {
    const W = this.lienzo.width
    const H = this.lienzo.height
    this.ctx.clearRect(0, 0, W, H)
    const mitad: readonly [number, number] = [this.lienzoEscena.width / 2 / H, this.lienzoEscena.height / 2 / H]
    let escena: Pick<Composicion, 'escena' | 'zoom' | 'opacidadEscena'> = { escena: false, zoom: 1, opacidadEscena: 0 }
    let viaje = 0
    if (lineas && t !== null) {
      escena = this.dibujarEscena(lineas, t)
      // El vórtice es el agujero de gusano de la canción: está desde que se abre el iris.
      viaje = t >= TIEMPOS.viajeDesde ? 1 : 0
    } else this.capas.clear()
    let revelado = 1
    if (final) {
      if (final.apertura > 0.001) this.dibujarElFinal(final)
      revelado = final.apertura
      if (!lineas || t === null) viaje = final.viaje
    }
    if (lineas && t !== null) {
      // La cinta va a 24 dibujos por segundo; la tinta hierve a 12.
      this.pincel.u = Math.min(W, H) / 100
      this.pincel.hervor = Math.floor(t * 12)
      this.ctx.save()
      dibujarLetrero(this.pincel, lineas, t, this.familia)
      this.ctx.restore()
    }
    return { ...escena, mitad, viaje, revelado }
  }

  private dibujarEscena(lineas: readonly LineaEscenario[], t: number): Pick<Composicion, 'escena' | 'zoom' | 'opacidadEscena'> {
    const nada = { escena: false, zoom: 1, opacidadEscena: 0 }
    const { secciones, fin } = this.cortes(lineas)
    if (secciones.length === 0) return nada
    const inicio = secciones[0].desde
    if (t < inicio) return nada
    if (t >= fin) {
      this.capas.clear()
      return nada
    }
    const ctx = this.ctxEscena
    const p = this.pincelEscena
    const W = this.lienzoEscena.width
    const H = this.lienzoEscena.height
    let k = 0
    for (let i = 0; i < secciones.length; i++) if (secciones[i].desde <= t) k = i
    const { escena, desde } = secciones[k]
    const hasta = k + 1 < secciones.length ? secciones[k + 1].desde : fin

    // Llegar desde el fondo del túnel y pasar de largo.
    const { aperturaPrimera, apertura, cierre, tunel } = TIEMPOS
    let zoom = 1
    let opacidad = 1
    const d = t - desde
    if (k === 0 && d < aperturaPrimera) {
      const x = d / aperturaPrimera
      zoom = 0.3 + 0.7 * rebote(x)
      opacidad = suave(x / 0.6)
    } else if (k > 0 && d < tunel / 2 + apertura) {
      const x = suave((d - tunel / 2) / apertura)
      zoom = 0.3 + 0.7 * x
      opacidad = x
    }
    const hueco = k + 1 < secciones.length ? tunel / 2 : 0
    const e = hasta - t
    if (e < hueco + cierre) {
      const x = 1 - suave((e - hueco) / cierre)
      zoom *= 1 + 1.3 * x * x
      opacidad *= 1 - x
    }

    if (opacidad > 0.004) {
      const u = p.u
      const tDibujo = Math.floor(t * 12) / 12
      const panEn = (instante: number): number => Math.min(PANEO.margen * W, Math.max(0, instante - desde) * PANEO.velocidad * u)
      const pan = panEn(tDibujo)
      const c: ContextoEscena = { p, W, H, u, t: tDibujo, linea: (i) => lineas[i], pan, panEn }
      p.hervor = Math.floor(t * 12)
      ctx.save()
      if (escena.cielo) escena.cielo(c)
      const lienzos = this.capasDe(escena)
      escena.capas.forEach((capa, i) => ctx.drawImage(lienzos[i], -Math.round(pan * capa.profundidad), 0))
      escena.animar(c)
      ctx.restore()
    }

    // La escena siguiente se pinta de antemano, una capa por dibujo, para que el corte no tarde; las
    // demás se sueltan.
    const siguiente = secciones[k + 1]
    if (siguiente && siguiente.desde - t < 4) this.capasDe(siguiente.escena, 1)
    for (const otra of this.capas.keys()) if (otra !== escena && otra !== siguiente?.escena) this.capas.delete(otra)
    return { escena: opacidad > 0.004, zoom, opacidadEscena: opacidad }
  }

  /** El final, entero (se descubre en círculo en el shader, según `apertura`). */
  private dibujarElFinal(final: EstadoFinal): void {
    const p = this.pincel
    const W = this.lienzo.width
    const H = this.lienzo.height
    p.u = Math.min(W, H) / 100
    p.hervor = Math.floor(final.tau * 12)
    this.fondoDelFinal ??= this.pintarFondoDelFinal()
    this.ctx.save()
    dibujarFinal(p, W, H, final.tau, final.pista, this.familia, this.fondoDelFinal)
    this.ctx.restore()
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

  /** Las capas de una escena (al tamaño de su recuadro); pinta las que falten (todas, o sólo `cuantas`). */
  private capasDe(escena: Escena, cuantas = Infinity): HTMLCanvasElement[] {
    let lienzos = this.capas.get(escena)
    if (!lienzos) {
      lienzos = escena.capas.map(() => null)
      this.capas.set(escena, lienzos)
    }
    const W = this.lienzoEscena.width
    const H = this.lienzoEscena.height
    for (let i = 0; i < lienzos.length && cuantas > 0; i++) {
      if (lienzos[i]) continue
      const capa = escena.capas[i]
      const lienzo = document.createElement('canvas')
      lienzo.width = W + Math.ceil(PANEO.margen * W * capa.profundidad) + 2
      lienzo.height = H
      const ctx = lienzo.getContext('2d')
      if (ctx) {
        const p = new Pincel(ctx)
        p.u = Math.min(W, H) / 100
        capa.pintar(p, lienzo.width, H, W)
      }
      lienzos[i] = lienzo
      cuantas--
    }
    return lienzos.filter((lienzo): lienzo is HTMLCanvasElement => lienzo !== null)
  }
}
