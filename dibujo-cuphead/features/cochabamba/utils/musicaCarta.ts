import { cancionAudible, enlazarAudio, estadoDelSonido, reanudarAudio, terminarCancion } from '@/features/cancion/utils/audio'
import { MUSICA_CARTA } from '../constantes/carta'

/**
 * La música de la carta, bajita y de fondo (ver `MUSICA_CARTA`): suena al abrir la cajita y se para al
 * salir. Pasa por el mismo Web Audio que la canción del agujero, con su propia ganancia (en iOS el
 * volumen del elemento no se puede cambiar). Si el sonido está apagado, no suena.
 *
 * Los navegadores sólo dejan sonar sin gesto lo que ya sonó en uno, y la cajita se abre en un
 * fotograma de la escena (el toque sólo se apunta): por eso los gestos del paseo la dejan lista antes,
 * con un play en silencio que se pausa enseguida (también el mismo toque que abre la cajita).
 */

let musica: HTMLAudioElement | null = null
let ganancia: GainNode | null = null
let enlazada = false
let desbloqueada = false
let sonando = false
let pausaPendiente = 0
let rampaVolumen = 0

function obtenerMusica(): HTMLAudioElement {
  if (!musica) {
    musica = new Audio()
    musica.loop = true
    musica.preload = 'auto'
    musica.src = MUSICA_CARTA.audio
  }
  return musica
}

/** Lleva el volumen a `destino` en `segundos`. */
function fundir(audio: HTMLAudioElement, destino: number, segundos: number): void {
  if (ganancia) {
    const ahora = ganancia.context.currentTime
    ganancia.gain.cancelScheduledValues(ahora)
    ganancia.gain.setValueAtTime(ganancia.gain.value, ahora)
    ganancia.gain.linearRampToValueAtTime(destino, ahora + Math.max(0.01, segundos))
    return
  }
  window.clearInterval(rampaVolumen)
  const desde = audio.volume
  const inicio = performance.now()
  rampaVolumen = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - inicio) / (Math.max(0.01, segundos) * 1000))
    audio.volume = Math.min(1, Math.max(0, desde + (destino - desde) * t))
    if (t >= 1) window.clearInterval(rampaVolumen)
  }, 40)
}

/** (En un gesto, paseando.) La deja lista para sonar sin gesto cuando se abra la cajita. */
export function desbloquearMusicaCarta(): void {
  const audio = obtenerMusica()
  if (!enlazada) {
    enlazada = true
    ganancia = enlazarAudio(audio)
    if (!ganancia) audio.volume = 0
  } else {
    reanudarAudio()
  }
  if (desbloqueada || sonando) return
  desbloqueada = true
  void audio.play().then(
    () => {
      if (!sonando) audio.pause()
    },
    () => {
      desbloqueada = false
    },
  )
}

/** Al abrir la cajita: desde el principio (o, si aún se apagaba, por donde iba), subiendo despacio. */
export function sonarMusicaCarta(): void {
  if (estadoDelSonido() === 'silenciado') return
  const audio = obtenerMusica()
  window.clearTimeout(pausaPendiente)
  reanudarAudio()
  // Si aún suena el final de la canción del agujero, se retira.
  if (cancionAudible()) terminarCancion(MUSICA_CARTA.entrada)
  if (audio.paused) {
    // Desde el silencio, también sin Web Audio (el elemento nuevo viene con volumen 1).
    if (ganancia) ganancia.gain.setValueAtTime(0, ganancia.context.currentTime)
    else audio.volume = 0
    try {
      audio.currentTime = 0
    } catch {
      // Sin metadatos aún: empieza desde el principio igual.
    }
    void audio.play().catch(() => undefined)
  }
  sonando = true
  fundir(audio, MUSICA_CARTA.volumen, MUSICA_CARTA.entrada)
}

/** Al salir de la carta: baja y se para. */
export function pararMusicaCarta(): void {
  const audio = musica
  if (!sonando || !audio) return
  sonando = false
  fundir(audio, 0, MUSICA_CARTA.salida)
  window.clearTimeout(pausaPendiente)
  pausaPendiente = window.setTimeout(() => {
    if (!sonando) audio.pause()
  }, MUSICA_CARTA.salida * 1000 + 80)
}

// En desarrollo: cómo va, desde la consola o las capturas.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as unknown as { __musicaCarta?: unknown }).__musicaCarta = () => ({
    sonando,
    desbloqueada,
    pausada: musica?.paused ?? true,
    segundo: musica?.currentTime ?? 0,
    volumen: ganancia ? ganancia.gain.value : (musica?.volume ?? 0),
    webAudio: ganancia !== null,
  })
}
