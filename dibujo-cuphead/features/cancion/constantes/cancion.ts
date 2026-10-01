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
   * El cruce al compás de la canción: [segundo de la canción, vh del carril], con los tiempos del
   * .srt (la letra va de 0:15 a 2:58; el audio dura 3:20).
   * - 0–1.5 s: la canción empieza en lo negro, recién entrados en el agujero.
   * - 1.5–7 s: durante la introducción, el iris se abre sobre el remolino.
   * - 7–86 s: la primera estrofa (desde los 15 s) y el estribillo (50–86 s) por el remolino del
   *   agujero de gusano; la boca del otro lado se abre al llegar el estribillo.
   * - 86–178 s: el interludio (86–108 s), la segunda estrofa y el último estribillo (142–178 s) en
   *   el cielo del otro lado.
   * - 178–190 s: aparece nuestro sistema solar; a los 190 s se suelta el scroll (sigue el final).
   */
  recorrido: [
    [0, 446],
    [1.5, 484],
    [7, 510],
    [86, 640],
    [178, 770],
    [190, 830],
  ] as readonly (readonly [number, number])[],
  /** Cuándo se suelta el scroll (s de canción). */
  suelta: 190,
  /** La letra respecto del audio (s; positivo: la letra va más tarde). */
  desfaseLetra: 0,
  /** Fundido del sonido (s) al saltarla o al volver atrás. */
  fundidoSalida: 1.4,
} as const
