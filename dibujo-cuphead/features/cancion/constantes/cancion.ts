/**
 * La canción del agujero negro (la pidió el usuario: "un lyrics de esta canción, cuando estamos
 * cruzando el agujero negro, así como en este video"; y después: sin botón de play, que al inicio
 * haya algo para activar el sonido y que la canción suene recién al entrar en el agujero). Al entrar
 * en el agujero (el iris se cierra sobre la sombra) empieza la canción y la cámara cruza sola, a su
 * compás, con la letra en pantalla; al final se suelta el scroll ya en el sistema solar, mientras
 * suena lo que queda de la canción. El sonido se activa al inicio (ver `BotonSonido`).
 *
 * El audio y la letra son archivos del usuario en `public/cancion/` (la letra es un .srt: se lee al
 * vuelo, no está escrita en el código; para cambiar de canción basta con cambiar los archivos y, si
 * hace falta, el recorrido).
 */
export const CANCION = {
  audio: '/cancion/cancion.mp3',
  letra: '/cancion/cancion.srt',
  /** Al llegar aquí bajando (vh del carril, ver `VIAJE`), empieza: el iris ya se cerró sobre la sombra. */
  puertaVh: 446,
  /** Si al llegar ya se había pasado el cruce (un salto con Fin o la barra), no empieza. */
  finCruceVh: 780,
  /** Volver por encima de esto (fuera del agujero, después de oírla o saltarla) la deja lista otra vez. */
  rearmeVh: 400,
  /** Desde aquí se empieza a cargar el audio (y las letras de la letra). */
  precargaVh: 150,
  /**
   * El cruce al compás de la canción (vh del carril), con los tiempos de la letra (ver
   * `recorridoDeLaCancion`): la canción empieza en lo negro (`puertaVh`), el iris se abre sobre el
   * remolino durante la introducción (de `negro` a `iris`), el remolino del agujero de gusano dura
   * hasta que acaba el primer bloque de la letra (la boca del otro lado se abre en el estribillo), el
   * cielo del otro lado hasta la última línea y, después, aparece nuestro sistema solar: se suelta
   * el scroll `llegada` segundos más tarde (y sigue sonando lo que queda).
   */
  vh: { negro: 484, iris: 510, remolino: 640, cielo: 770, suelta: 830 },
  segundos: { negro: 1.5, iris: 7 },
  llegada: 12,
  /** Mientras se carga la letra: dónde acaban el primer bloque y la letra de la canción de ahora (s). */
  porDefecto: { primerBloque: 88.5, letra: 175.3 },
  /** La letra respecto del audio (s; positivo: la letra va más tarde). */
  desfaseLetra: 0,
  /** Fundido del sonido (s) al saltarla o al volver atrás. */
  fundidoSalida: 1.4,
} as const

/** El recorrido del cruce ([segundo, vh]) y el segundo de la suelta, según los tiempos de la letra. */
export function recorridoDeLaCancion(
  finPrimerBloque: number,
  finLetra: number,
): { puntos: (readonly [number, number])[]; suelta: number } {
  const { vh, segundos, llegada } = CANCION
  const fin = Math.max(finLetra, segundos.iris + 20)
  const remolino = Math.min(Math.max(finPrimerBloque, segundos.iris + 10), fin - 10)
  const suelta = fin + llegada
  return {
    puntos: [
      [0, CANCION.puertaVh],
      [segundos.negro, vh.negro],
      [segundos.iris, vh.iris],
      [remolino, vh.remolino],
      [fin, vh.cielo],
      [suelta, vh.suelta],
    ],
    suelta,
  }
}
