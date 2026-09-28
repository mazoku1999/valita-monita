interface VozDrone {
  readonly frecuencia: number
  readonly tipo: OscillatorType
  readonly ganancia: number
  readonly profundidadDetune: number
}

const VOCES_DRONE: readonly VozDrone[] = [
  { frecuencia: 41.2, tipo: 'sine', ganancia: 0.5, profundidadDetune: 4 },
  { frecuencia: 61.74, tipo: 'triangle', ganancia: 0.16, profundidadDetune: 7 },
  { frecuencia: 82.41, tipo: 'sine', ganancia: 0.26, profundidadDetune: 5 },
  { frecuencia: 123.47, tipo: 'sine', ganancia: 0.07, profundidadDetune: 9 },
]

const VOCES_LUZ: readonly number[] = [329.63, 493.88, 659.26]

type VentanaConWebkit = Window & { webkitAudioContext?: typeof AudioContext }

const obtenerConstructorAudio = (): typeof AudioContext | null => {
  if (typeof window === 'undefined') return null
  const ventana = window as VentanaConWebkit
  return window.AudioContext ?? ventana.webkitAudioContext ?? null
}

/**
 * Paisaje sonoro 100% procedural (sin assets): drone grave con detune lento,
 * coro agudo filtrado, viento de ruido con barrido de banda y reverberación
 * por convolución con un impulso sintetizado.
 */
export class MotorAudioService {
  private contexto: AudioContext | null = null
  private maestro: GainNode | null = null
  private filtroIntensidad: BiquadFilterNode | null = null
  private temporizadorSuspension: ReturnType<typeof setTimeout> | null = null
  private activo = false

  get estaActivo(): boolean {
    return this.activo
  }

  get disponible(): boolean {
    return obtenerConstructorAudio() !== null
  }

  async activar(): Promise<void> {
    if (!this.contexto) {
      this.construirGrafo()
    }
    if (!this.contexto || !this.maestro) return

    if (this.temporizadorSuspension) {
      clearTimeout(this.temporizadorSuspension)
      this.temporizadorSuspension = null
    }
    if (this.contexto.state === 'suspended') {
      await this.contexto.resume()
    }

    const ahora = this.contexto.currentTime
    this.maestro.gain.cancelScheduledValues(ahora)
    this.maestro.gain.setValueAtTime(this.maestro.gain.value, ahora)
    this.maestro.gain.linearRampToValueAtTime(0.85, ahora + 3.2)
    this.activo = true
  }

  desactivar(): void {
    if (!this.contexto || !this.maestro) return
    const contexto = this.contexto
    const ahora = contexto.currentTime
    this.maestro.gain.cancelScheduledValues(ahora)
    this.maestro.gain.setValueAtTime(this.maestro.gain.value, ahora)
    this.maestro.gain.linearRampToValueAtTime(0, ahora + 1.4)
    this.activo = false

    this.temporizadorSuspension = setTimeout(() => {
      if (!this.activo && contexto.state === 'running') {
        void contexto.suspend()
      }
    }, 1600)
  }

  establecerIntensidad(valor: number): void {
    if (!this.contexto || !this.filtroIntensidad) return
    const limitado = Math.min(1, Math.max(0, valor))
    const frecuencia = 260 + 1100 * limitado * limitado
    this.filtroIntensidad.frequency.setTargetAtTime(frecuencia, this.contexto.currentTime, 0.8)
  }

  destruir(): void {
    if (this.temporizadorSuspension) clearTimeout(this.temporizadorSuspension)
    if (this.contexto) void this.contexto.close()
    this.contexto = null
    this.maestro = null
    this.filtroIntensidad = null
    this.activo = false
  }

  private construirGrafo(): void {
    const Constructor = obtenerConstructorAudio()
    if (!Constructor) return

    const contexto = new Constructor()
    const maestro = contexto.createGain()
    maestro.gain.value = 0

    const compresor = contexto.createDynamicsCompressor()
    compresor.threshold.value = -18
    compresor.ratio.value = 4
    compresor.attack.value = 0.05
    compresor.release.value = 0.6

    const filtroIntensidad = contexto.createBiquadFilter()
    filtroIntensidad.type = 'lowpass'
    filtroIntensidad.frequency.value = 320
    filtroIntensidad.Q.value = 0.7

    const seco = contexto.createGain()
    seco.gain.value = 0.7
    const envioReverb = contexto.createGain()
    envioReverb.gain.value = 0.55
    const reverb = contexto.createConvolver()
    reverb.buffer = this.crearImpulso(contexto, 5.2)

    filtroIntensidad.connect(seco)
    filtroIntensidad.connect(envioReverb)
    envioReverb.connect(reverb)
    seco.connect(compresor)
    reverb.connect(compresor)
    compresor.connect(maestro)
    maestro.connect(contexto.destination)

    this.construirDrone(contexto, filtroIntensidad)
    this.construirCoroDeLuz(contexto, filtroIntensidad)
    this.construirViento(contexto, filtroIntensidad)

    this.contexto = contexto
    this.maestro = maestro
    this.filtroIntensidad = filtroIntensidad
  }

  private construirDrone(contexto: AudioContext, destino: AudioNode): void {
    const submezcla = contexto.createGain()
    submezcla.gain.value = 0.55

    const respiracion = contexto.createOscillator()
    respiracion.frequency.value = 0.085
    const profundidadRespiracion = contexto.createGain()
    profundidadRespiracion.gain.value = 0.12
    respiracion.connect(profundidadRespiracion)
    profundidadRespiracion.connect(submezcla.gain)
    respiracion.start()

    const lfoDetune = contexto.createOscillator()
    lfoDetune.frequency.value = 0.07
    lfoDetune.start()

    VOCES_DRONE.forEach((voz, indice) => {
      const oscilador = contexto.createOscillator()
      oscilador.type = voz.tipo
      oscilador.frequency.value = voz.frecuencia
      oscilador.detune.value = indice % 2 === 0 ? -3 : 3

      const profundidad = contexto.createGain()
      profundidad.gain.value = voz.profundidadDetune
      lfoDetune.connect(profundidad)
      profundidad.connect(oscilador.detune)

      const ganancia = contexto.createGain()
      ganancia.gain.value = voz.ganancia
      oscilador.connect(ganancia)
      ganancia.connect(submezcla)
      oscilador.start()
    })

    submezcla.connect(destino)
  }

  private construirCoroDeLuz(contexto: AudioContext, destino: AudioNode): void {
    const submezcla = contexto.createGain()
    submezcla.gain.value = 0.028

    const filtro = contexto.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = 620
    filtro.Q.value = 1.6

    const lfoBarrido = contexto.createOscillator()
    lfoBarrido.frequency.value = 0.031
    const profundidadBarrido = contexto.createGain()
    profundidadBarrido.gain.value = 260
    lfoBarrido.connect(profundidadBarrido)
    profundidadBarrido.connect(filtro.frequency)
    lfoBarrido.start()

    VOCES_LUZ.forEach((frecuencia, indice) => {
      const oscilador = contexto.createOscillator()
      oscilador.type = 'sawtooth'
      oscilador.frequency.value = frecuencia
      oscilador.detune.value = (indice - 1) * 6
      const ganancia = contexto.createGain()
      ganancia.gain.value = 1 / VOCES_LUZ.length
      oscilador.connect(ganancia)
      ganancia.connect(filtro)
      oscilador.start()
    })

    filtro.connect(submezcla)
    submezcla.connect(destino)
  }

  private construirViento(contexto: AudioContext, destino: AudioNode): void {
    const fuente = contexto.createBufferSource()
    fuente.buffer = this.crearRuidoBlanco(contexto, 3)
    fuente.loop = true

    const filtro = contexto.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = 340
    filtro.Q.value = 1.1

    const lfo = contexto.createOscillator()
    lfo.frequency.value = 0.037
    const profundidad = contexto.createGain()
    profundidad.gain.value = 210
    lfo.connect(profundidad)
    profundidad.connect(filtro.frequency)
    lfo.start()

    const ganancia = contexto.createGain()
    ganancia.gain.value = 0.07

    fuente.connect(filtro)
    filtro.connect(ganancia)
    ganancia.connect(destino)
    fuente.start()
  }

  private crearRuidoBlanco(contexto: AudioContext, segundos: number): AudioBuffer {
    const longitud = Math.floor(contexto.sampleRate * segundos)
    const buffer = contexto.createBuffer(1, longitud, contexto.sampleRate)
    const datos = buffer.getChannelData(0)
    for (let i = 0; i < longitud; i += 1) {
      datos[i] = Math.random() * 2 - 1
    }
    return buffer
  }

  private crearImpulso(contexto: AudioContext, segundos: number): AudioBuffer {
    const longitud = Math.floor(contexto.sampleRate * segundos)
    const buffer = contexto.createBuffer(2, longitud, contexto.sampleRate)
    for (let canal = 0; canal < 2; canal += 1) {
      const datos = buffer.getChannelData(canal)
      for (let i = 0; i < longitud; i += 1) {
        const t = i / longitud
        datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2)
      }
    }
    return buffer
  }
}
