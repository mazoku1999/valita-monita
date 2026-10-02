import { enlazarAudio } from '@/features/cancion/utils/audio'

/**
 * La música de fondo donde no suena otra (lo pidió el usuario en lugar del sonido ambiente
 * sintetizado: "mejor esta música de fondo, solo en lugares donde no hay sonido y volumen
 * bajito"): una versión instrumental, en bucle y bajita, que pasa por el mismo Web Audio que la
 * canción (en iOS el volumen del elemento no se puede cambiar). Se calla con un fundido cuando
 * empieza la canción o se abre la carta y vuelve por donde iba (ver `components/MusicaDeFondo.tsx`):
 * nunca vuelve a empezar de cero. El archivo empieza en el segundo 10 de la pista (lo pidió el
 * usuario): así empieza la primera vez y cada vez que da la vuelta.
 */
export const MUSICA_FONDO = { audio: '/fondo/musica.mp3' } as const

/** Su volumen: la pista está a unos −18 dB; así queda a unos −32 dB, muy por debajo de la canción. */
export const NIVEL_FONDO = 0.2

/** Fundidos (s): al volver, despacio; al callarse (porque llega otra música), algo más rápido. */
const FUNDIDO = { entrada: 2.5, salida: 1.2 } as const

let musica: HTMLAudioElement | null = null
let ganancia: GainNode | null = null
let desbloqueada = false
let sonando = false
let pausaPendiente = 0
/** Por dónde iba al callarse (s): si al volver el navegador la reinició, se sigue desde aquí. */
let posicion = 0

function fundir(destino: number, segundos: number): void {
  if (ganancia) {
    const ahora = ganancia.context.currentTime
    ganancia.gain.cancelScheduledValues(ahora)
    ganancia.gain.setValueAtTime(ganancia.gain.value, ahora)
    ganancia.gain.linearRampToValueAtTime(destino, ahora + segundos)
  } else if (musica) {
    musica.volume = destino
  }
}

/**
 * (En un gesto: el diálogo del sonido.) La deja lista para sonar: en iOS un elemento sólo suena
 * más tarde si ya sonó en un gesto. Empieza a cargarse aquí.
 */
export function desbloquearMusicaDeFondo(): void {
  if (desbloqueada) return
  desbloqueada = true
  musica = new Audio()
  musica.loop = true
  musica.preload = 'auto'
  musica.src = MUSICA_FONDO.audio
  ganancia = enlazarAudio(musica)
  if (!ganancia) musica.volume = 0
  const audio = musica
  void audio
    .play()
    .then(() => {
      if (!sonando) audio.pause()
    })
    .catch(() => undefined)
}

/** Si tiene que sonar ahora: suena (con un fundido, por donde iba) o se calla (y se pausa). */
export function ajustarMusicaDeFondo(quiere: boolean): void {
  const audio = musica
  if (!audio || quiere === sonando) return
  sonando = quiere
  window.clearTimeout(pausaPendiente)
  if (quiere) {
    if (audio.paused) {
      if (Math.abs(audio.currentTime - posicion) > 1) audio.currentTime = posicion
      void audio.play().catch(() => undefined)
    }
    fundir(NIVEL_FONDO, FUNDIDO.entrada)
  } else {
    fundir(0, FUNDIDO.salida)
    pausaPendiente = window.setTimeout(() => {
      audio.pause()
      posicion = audio.currentTime
    }, FUNDIDO.salida * 1000 + 100)
  }
}

/** Para las pruebas: si suena y por qué segundo va. */
export const estadoMusicaDeFondo = (): { sonando: boolean; pausada: boolean; tiempo: number } | null =>
  musica ? { sonando, pausada: musica.paused, tiempo: musica.currentTime } : null
