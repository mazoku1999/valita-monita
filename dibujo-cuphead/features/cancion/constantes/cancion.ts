/**
 * La canción del agujero negro (la pidió el usuario: "un lyrics de esta canción, cuando estamos
 * cruzando el agujero negro, así como en este video"): al llegar al agujero empieza la canción y
 * la cámara cruza sola, a su compás, con la letra en pantalla; al final se suelta el scroll ya en
 * el sistema solar, mientras suena lo que queda de la canción.
 *
 * El audio y la letra son archivos del usuario en `public/cancion/` (la letra es un .srt: se lee al
 * vuelo, no está escrita en el código; para cambiar de canción basta con cambiar los archivos y, si
 * hace falta, el recorrido).
 */
export const CANCION = {
  audio: '/cancion/cancion.mp3',
  letra: '/cancion/cancion.srt',
  /** Al llegar aquí bajando (vh del carril, ver `VIAJE`), empieza: es el comienzo de la caída. */
  puertaVh: 300,
  /** Si al llegar ya se había pasado el cruce (un salto con Fin o la barra), no empieza. */
  finCruceVh: 780,
  /** Volver por encima de esto (después de oírla o saltarla) la deja lista para otra vez. */
  rearmeVh: 250,
  /** Desde aquí se empieza a cargar el audio (y las letras de la letra). */
  precargaVh: 150,
  /**
   * El cruce al compás de la canción: [segundo de la canción, vh del carril].
   * - 0–13 s, la introducción: la caída hacia el horizonte.
   * - 13–15 s, el iris se cierra sobre la sombra; la primera línea llega en lo negro (15 s) y el
   *   iris se abre sobre el remolino (17–21 s).
   * - 21–81 s, la primera estrofa y el estribillo por el remolino del agujero de gusano: la boca del
   *   otro lado se abre durante el estribillo.
   * - 81–157 s, el interludio, la segunda estrofa y el último estribillo en el cielo del otro lado.
   * - 157–170 s, aparece nuestro sistema solar; a los 170 s se suelta el scroll (sigue el final).
   */
  recorrido: [
    [0, 300],
    [13, 430],
    [15, 446],
    [17, 484],
    [21, 510],
    [81, 640],
    [157, 770],
    [170, 830],
  ] as readonly (readonly [number, number])[],
  /** Cuándo se suelta el scroll (s de canción). */
  suelta: 170,
  /** La letra respecto del audio (s; positivo: la letra va más tarde). */
  desfaseLetra: 0,
  /** Fundidos del sonido (s): al empezar, al saltarla y al volver atrás. */
  fundidoEntrada: 1.2,
  fundidoSalida: 1.4,
} as const
