/**
 * El sonido de la canción: un elemento <audio> (se carga mientras suena) que, desde el primer
 * gesto, pasa por Web Audio para los fundidos (en iOS el volumen del elemento no se puede cambiar).
 *
 * Los navegadores sólo dejan sonar después de un gesto del usuario (un clic, una tecla o un toque;
 * la rueda y el scroll no cuentan). Por eso al inicio hay un botón para activar el sonido (y
 * cualquier gesto vale igual). La canción empieza siempre al entrar en el agujero, sin pedir nada:
 * con sonido si ya se activó; si no, en silencio (y la letra y el cruce siguen igual), y en cuanto
 * se activa el sonido se une donde va. Si ni siquiera en silencio la deja sonar el navegador, la
 * lleva un reloj propio hasta que se pueda.
 *
 * Estado del sonido: `pendiente` (aún no hubo gesto), `activo` o `silenciado` (lo apagó el usuario).
 */

export type EstadoSonido = 'pendiente' | 'activo' | 'silenciado'

type VentanaConWebkit = Window & { webkitAudioContext?: typeof AudioContext }

let elemento: HTMLAudioElement | null = null
let contexto: AudioContext | null = null
let ganancia: GainNode | null = null
let estadoSonido: EstadoSonido = 'pendiente'
/** La canción va (el cruce): aunque el audio no pueda sonar, su reloj corre. */
let enCurso = false
/** Reloj propio mientras el audio no suena: desde cuándo (ms de la página) y desde qué segundo. */
let relojPropio: { inicio: number; desde: number } | null = null
let rampaVolumen = 0
let pausaPendiente = 0

const oyentes = new Set<() => void>()
const avisar = (): void => {
  for (const oyente of oyentes) oyente()
}

export function suscribirSonido(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export const estadoDelSonido = (): EstadoSonido => estadoSonido

/** Suena de verdad (con sonido y sin pausa). */
export const cancionAudible = (): boolean =>
  elemento !== null && !elemento.paused && !elemento.ended && estadoSonido === 'activo'

function obtenerElemento(url: string): HTMLAudioElement {
  if (!elemento) {
    elemento = new Audio()
    elemento.preload = 'metadata'
    elemento.src = url
    for (const evento of ['play', 'pause', 'ended']) elemento.addEventListener(evento, avisar)
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
function fundir(destino: number, segundos: number): void {
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
 * Crea el Web Audio de la página antes del primer gesto, con la página ya cargada: crearlo detiene
 * la página un momento (en un móvil, más de una décima de segundo) y, hecho en el gesto, el primer
 * deslizamiento daba un tirón. Nace suspendido; el gesto sólo lo reanuda.
 */
export function prepararAudio(): void {
  if (contexto) return
  const Constructor = window.AudioContext ?? (window as VentanaConWebkit).webkitAudioContext
  try {
    contexto = Constructor ? new Constructor() : null
  } catch {
    contexto = null
  }
}

/** (En un gesto.) El Web Audio de la página: se crea una vez (si no se preparó) y se reanuda si se paró. */
function asegurarContexto(): AudioContext | null {
  prepararAudio()
  reanudarAudio()
  return contexto
}

/** Reanuda el Web Audio si se paró (el teléfono lo suspende al bloquearse, por ejemplo). */
export function reanudarAudio(): void {
  if (contexto && contexto.state !== 'running') void contexto.resume().catch(() => undefined)
}

/** (En un gesto.) Web Audio para los fundidos: el elemento de la canción pasa por él (una vez). */
function conectarWebAudio(audio: HTMLAudioElement): void {
  const ctx = asegurarContexto()
  if (!ctx || ganancia) return
  try {
    const propia = ctx.createGain()
    propia.gain.value = audio.paused || audio.muted ? 0 : 1
    ctx.createMediaElementSource(audio).connect(propia).connect(ctx.destination)
    ganancia = propia
  } catch {
    ganancia = null
  }
}

/**
 * (En un gesto.) Otro audio (la música de la carta) por el mismo Web Audio, con su propia ganancia,
 * que empieza en 0. Sin Web Audio, null: entonces manda el volumen del elemento.
 */
export function enlazarAudio(audio: HTMLAudioElement): GainNode | null {
  const ctx = asegurarContexto()
  if (!ctx) return null
  try {
    const propia = ctx.createGain()
    propia.gain.value = 0
    ctx.createMediaElementSource(audio).connect(propia).connect(ctx.destination)
    return propia
  } catch {
    return null
  }
}

/** El segundo de la canción por donde va (con el audio o con el reloj propio). */
export function tiempoCancion(): number {
  if (relojPropio) return relojPropio.desde + (performance.now() - relojPropio.inicio) / 1000
  return elemento ? elemento.currentTime : 0
}

/** Que el audio suene desde el segundo `t` (con o sin sonido) y deje de hacer falta el reloj propio. */
function arrancarAudio(audio: HTMLAudioElement, t: number, conSonido: boolean): Promise<boolean> {
  window.clearTimeout(pausaPendiente)
  try {
    audio.currentTime = t
  } catch {
    // Sin metadatos aún: el navegador lo toma como el punto de partida.
  }
  fijarGanancia(0)
  // Sin Web Audio no hay ganancia: en silencio, el elemento va mudo.
  audio.muted = !conSonido && !ganancia
  return audio.play().then(
    () => {
      if (!enCurso) {
        audio.pause()
        return false
      }
      relojPropio = null
      if (conSonido) fundir(1, 1.2)
      return true
    },
    () => false,
  )
}

/** (En un gesto.) Si la canción va, se une el sonido donde va. */
function unirSonido(): void {
  const audio = elemento
  if (!audio || !enCurso) return
  conectarWebAudio(audio)
  audio.muted = false
  if (audio.paused) void arrancarAudio(audio, tiempoCancion(), true)
  else fundir(1, 1.2)
}

/**
 * (En un gesto: el botón del inicio o cualquier clic, tecla o toque.) El sonido queda permitido y,
 * salvo que el usuario lo haya apagado, activo. Si la canción no va, el elemento se desbloquea con
 * un play sin volumen que se pausa enseguida (iOS sólo deja sonar más tarde lo que sonó en un gesto).
 */
export function permitirSonido(url: string): void {
  const audio = obtenerElemento(url)
  conectarWebAudio(audio)
  if (estadoSonido === 'pendiente') {
    estadoSonido = 'activo'
    avisar()
  }
  if (enCurso) {
    if (estadoSonido === 'activo') unirSonido()
    return
  }
  if (!audio.paused) return
  fijarGanancia(0)
  if (!ganancia) audio.muted = true
  void audio
    .play()
    .then(() => {
      if (!enCurso) audio.pause()
    })
    .catch(() => undefined)
    .finally(() => {
      if (!enCurso) audio.muted = false
    })
}

/** (En un gesto: el botón del sonido.) Activa o apaga el sonido. */
export function alternarSonido(url: string): void {
  if (estadoSonido === 'activo') {
    estadoSonido = 'silenciado'
    avisar()
    if (enCurso) fundir(0, 0.6)
    return
  }
  estadoSonido = 'activo'
  avisar()
  permitirSonido(url)
}

/**
 * Al entrar en el agujero (sin gesto): la canción empieza desde el principio, con sonido si está
 * activo; si no (o si el navegador aún no lo deja), en silencio; y si ni así, con el reloj propio.
 */
export function empezarCancion(url: string): void {
  const audio = obtenerElemento(url)
  enCurso = true
  relojPropio = { inicio: performance.now(), desde: 0 }
  const conSonido = estadoSonido === 'activo'
  void arrancarAudio(audio, 0, conSonido).then((sono) => {
    // Con sonido no la dejó (aún no hubo un gesto que valga): en silencio, por donde vaya.
    if (!sono && enCurso && conSonido) void arrancarAudio(audio, tiempoCancion(), false)
  })
}

/** Termina la canción (al saltarla o al volver atrás) con un fundido. */
export function terminarCancion(fundido: number): void {
  enCurso = false
  relojPropio = null
  const audio = elemento
  if (!audio) return
  fundir(0, fundido)
  window.clearTimeout(pausaPendiente)
  pausaPendiente = window.setTimeout(() => audio.pause(), fundido * 1000 + 60)
}

/** Se suelta el cruce: si suena, sigue sonando su final; si va en silencio, se apaga. */
export function soltarCancion(): void {
  if (estadoSonido === 'activo' && elemento && !elemento.paused) {
    enCurso = false
    relojPropio = null
    return
  }
  terminarCancion(0.3)
}

/** Para pruebas y desarrollo: salta a otro segundo. */
export function saltarCancionA(t: number): void {
  const segundo = Math.max(0, t)
  if (relojPropio) relojPropio = { inicio: performance.now(), desde: segundo }
  if (elemento) elemento.currentTime = segundo
}

export function alTerminarCancion(oyente: () => void): () => void {
  const audio = elemento
  if (!audio) return () => undefined
  audio.addEventListener('ended', oyente)
  return () => audio.removeEventListener('ended', oyente)
}
