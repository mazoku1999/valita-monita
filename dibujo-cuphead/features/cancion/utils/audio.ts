/**
 * El sonido de la canción: un elemento <audio> (se carga mientras suena) que, si el navegador lo
 * deja, pasa por Web Audio para los fundidos (en iOS el volumen del elemento no se puede cambiar).
 *
 * Los navegadores sólo dejan sonar después de un gesto del usuario (un clic, una tecla o un toque;
 * la rueda y el scroll no cuentan). El primer gesto en cualquier parte lo desbloquea (un play en
 * silencio que se pausa enseguida); si al llegar al agujero aún no lo hubo, la escena pide un toque.
 */

type VentanaConWebkit = Window & { webkitAudioContext?: typeof AudioContext }

let elemento: HTMLAudioElement | null = null
let contexto: AudioContext | null = null
let ganancia: GainNode | null = null
let rampaVolumen = 0
let pausaPendiente = 0
/** Hay que sonar de verdad (no sólo desbloquear): el desbloqueo no debe pausarla. */
let pedidaDeVerdad = false

function obtenerElemento(url: string): HTMLAudioElement {
  if (!elemento) {
    elemento = new Audio()
    elemento.preload = 'metadata'
    elemento.src = url
  }
  return elemento
}

/** Empieza a cargar la canción (cuando se acerca el agujero). */
export function precargarCancion(url: string): void {
  const audio = obtenerElemento(url)
  if (audio.preload !== 'auto') {
    audio.preload = 'auto'
    audio.load()
  }
}

function fijarGanancia(valor: number): void {
  if (contexto && ganancia) {
    const ahora = contexto.currentTime
    ganancia.gain.cancelScheduledValues(ahora)
    ganancia.gain.setValueAtTime(valor, ahora)
  } else if (elemento) {
    window.clearInterval(rampaVolumen)
    elemento.volume = valor
  }
}

/** Lleva el volumen a `destino` en `segundos`. */
export function fundirCancion(destino: number, segundos: number): void {
  if (contexto && ganancia) {
    const ahora = contexto.currentTime
    ganancia.gain.cancelScheduledValues(ahora)
    ganancia.gain.setValueAtTime(ganancia.gain.value, ahora)
    ganancia.gain.linearRampToValueAtTime(destino, ahora + Math.max(0.01, segundos))
    return
  }
  const audio = elemento
  if (!audio) return
  window.clearInterval(rampaVolumen)
  const desde = audio.volume
  const inicio = performance.now()
  rampaVolumen = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - inicio) / (Math.max(0.01, segundos) * 1000))
    audio.volume = Math.min(1, Math.max(0, desde + (destino - desde) * t))
    if (t >= 1) window.clearInterval(rampaVolumen)
  }, 40)
}

/**
 * En un gesto del usuario: prepara Web Audio (para los fundidos) y desbloquea el elemento con un
 * play en silencio que se pausa enseguida (salvo que mientras tanto se haya pedido sonar).
 */
export function desbloquearCancion(url: string): void {
  const audio = obtenerElemento(url)
  if (!contexto) {
    const Constructor = window.AudioContext ?? (window as VentanaConWebkit).webkitAudioContext
    if (Constructor) {
      try {
        contexto = new Constructor()
        const fuente = contexto.createMediaElementSource(audio)
        ganancia = contexto.createGain()
        ganancia.gain.value = 0
        fuente.connect(ganancia).connect(contexto.destination)
      } catch {
        contexto = null
        ganancia = null
      }
    }
  }
  if (contexto && contexto.state !== 'running') void contexto.resume().catch(() => undefined)
  if (!audio.paused) return
  fijarGanancia(0)
  if (!ganancia) audio.muted = true
  void audio
    .play()
    .then(() => {
      if (!pedidaDeVerdad) audio.pause()
    })
    .catch(() => undefined)
    .finally(() => {
      audio.muted = false
    })
}

/**
 * Suena desde el segundo `t` con un fundido de entrada. Devuelve si el navegador la dejó sonar.
 * (El play va en la misma pila que el gesto, sin esperas antes: Safari lo exige.)
 */
export function sonarCancionDesde(url: string, t: number, fundido: number): Promise<boolean> {
  const audio = obtenerElemento(url)
  window.clearTimeout(pausaPendiente)
  pedidaDeVerdad = true
  audio.muted = false
  try {
    audio.currentTime = t
  } catch {
    // Sin metadatos aún: empieza desde el principio, que es lo que se pide casi siempre.
  }
  fijarGanancia(0)
  const intento = audio.play()
  if (contexto && contexto.state !== 'running') void contexto.resume().catch(() => undefined)
  return intento.then(
    () => {
      fundirCancion(1, fundido)
      return true
    },
    () => {
      pedidaDeVerdad = false
      return false
    },
  )
}

/** Apaga la canción con un fundido y la pausa al terminar. */
export function pararCancion(fundido: number): void {
  const audio = elemento
  if (!audio) return
  pedidaDeVerdad = false
  fundirCancion(0, fundido)
  window.clearTimeout(pausaPendiente)
  pausaPendiente = window.setTimeout(() => audio.pause(), fundido * 1000 + 60)
}

/** El segundo de la canción que suena (0 si aún no hay audio). */
export function tiempoCancion(): number {
  return elemento ? elemento.currentTime : 0
}

export function cancionSonando(): boolean {
  return elemento !== null && !elemento.paused && !elemento.ended
}

/** Para pruebas y desarrollo: salta a otro segundo. */
export function saltarCancionA(t: number): void {
  if (elemento) elemento.currentTime = Math.max(0, t)
}

export function alTerminarCancion(oyente: () => void): () => void {
  const audio = elemento
  if (!audio) return () => undefined
  audio.addEventListener('ended', oyente)
  return () => audio.removeEventListener('ended', oyente)
}
