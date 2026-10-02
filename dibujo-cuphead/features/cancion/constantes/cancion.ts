/**
 * La canción del agujero negro (la pidió el usuario: "un lyrics de esta canción, cuando estamos
 * cruzando el agujero negro, así como en este video"; y después: sin botón de play, que al inicio
 * haya algo para activar el sonido y que la canción suene recién al entrar en el agujero). Al entrar
 * en el agujero (el iris se cierra sobre la sombra) empieza la canción y la cámara avanza sola por el
 * agujero de gusano, a su compás, con sus escenas en el fondo del túnel y la letra en pantalla; al
 * final, el mensaje para Valeria (`MENSAJE_FINAL`) y se suelta el scroll todavía en el túnel: el
 * resto del viaje (la salida y el sistema solar) se hace deslizando, mientras suena lo que queda de
 * la canción. El sonido se activa al inicio (ver `BotonSonido`).
 *
 * El audio es el archivo del usuario en `public/cancion/`; la letra, `cancion.vtt`: en español (el
 * texto del .srt en español que dio el usuario, tal cual), con la hora de cada palabra: cada una se
 * enciende cuando se canta la palabra inglesa que dice lo mismo (WebVTT de karaoke, ver
 * `utils/vtt.ts`; también vale un .srt, sólo por líneas). `cancion.en.vtt` es la letra original en
 * inglés, sincronizada igual. Se lee al vuelo, no está escrita en el código; para cambiar de canción
 * o de letra basta con cambiar los archivos.
 */
export const CANCION = {
  audio: '/cancion/cancion.mp3',
  letra: '/cancion/cancion.vtt',
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
   * remolino durante la introducción (de `negro` a `iris`), la cámara se mete en el túnel hasta
   * `portal` cuando se abre el portal de las escenas (antes de la primera línea) y desde ahí avanza
   * muy despacio hasta `finLetra` (la boca del otro lado sigue escondida tras el portal, también en
   * un móvil); el scroll se suelta en `suelta`, `llegada` segundos después de la última línea.
   */
  vh: { negro: 484, iris: 510, portal: 524, finLetra: 539, suelta: 540 },
  segundos: { negro: 1.5, iris: 7 },
  llegada: 12,
  /** Mientras se carga la letra: dónde empiezan y acaban las líneas de la canción de ahora (s). */
  porDefecto: { inicioLetra: 17.1, letra: 175.9 },
  /** La letra respecto del audio (s; positivo: la letra va más tarde). */
  desfaseLetra: 0,
  /** Fundido del sonido (s) al saltarla o al volver atrás. */
  fundidoSalida: 1.4,
} as const

/** El recorrido del cruce ([segundo, vh]) y el segundo de la suelta, según los tiempos de la letra. */
export function recorridoDeLaCancion(inicioLetra: number, finLetra: number): { puntos: (readonly [number, number])[]; suelta: number } {
  const { vh, segundos, llegada } = CANCION
  const fin = Math.max(finLetra, segundos.iris + 20)
  const portal = Math.min(Math.max(inicioLetra - 0.8, segundos.iris + 2), fin - 10)
  const suelta = fin + llegada
  return {
    puntos: [
      [0, CANCION.puertaVh],
      [segundos.negro, vh.negro],
      [segundos.iris, vh.iris],
      [portal, vh.portal],
      [fin, vh.finLetra],
      [suelta, vh.suelta],
    ],
    suelta,
  }
}

/**
 * El final de la canción (lo pidió el usuario: "al final que diga Valeria te amo con toda el alma y
 * siempre quiero estar contigo, con una escena y animación bonita, y que diga que siga deslizando"):
 * su nombre escrito con estrellas, como una constelación, y el resto en una cinta. Las frases
 * cortas son para pantallas estrechas (en cuatro renglones).
 */
export const MENSAJE_FINAL = {
  nombre: 'VALERIA',
  frases: ['te amo con toda el alma', 'y siempre quiero estar contigo'],
  frasesCortas: ['te amo con toda', 'el alma', 'y siempre quiero', 'estar contigo'],
  pista: 'Sigue deslizando',
} as const
