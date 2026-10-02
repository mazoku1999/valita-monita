/**
 * El sonido ambiente donde no hay música (lo pidió el usuario: "algo romántico y tierno, sólo
 * sonidos"). Todo sintetizado con Web Audio, sin archivos, y siempre distinto. Capas:
 *
 * - `colchon`: un acorde cálido y muy bajito (re mayor con séptima y novena) que respira despacio.
 * - `estrellas`: campanitas de caja de música, sueltas y agudas, como estrellas que titilan.
 * - `viento`: un soplo suave (ruido filtrado) que va y viene.
 * - `pajaros`: pajaritos de la mañana (silbidos, trinos y gorjeos), que a veces se contestan.
 * - `campanitas`: campanitas de viento, más graves y de tarde en tarde.
 *
 * Las estrellas y las campanitas usan la pentatónica del acorde: siempre suenan bien juntas. Lo
 * mueve `AmbienteSonoro` según el punto del viaje; para escucharlo aparte, ver `renderizarAmbiente`.
 */

export interface Capas {
  colchon: number
  estrellas: number
  viento: number
  pajaros: number
  campanitas: number
}

export const SIN_CAPAS: Capas = { colchon: 0, estrellas: 0, viento: 0, pajaros: 0, campanitas: 0 }

/** Volumen de cada capa con su ganancia a 1: muy por debajo de la canción. */
const NIVEL = { colchon: 0.022, estrellas: 0.05, viento: 0.11, pajaros: 0.05, campanitas: 0.055 } as const

/** El acorde del colchón (Hz) y el peso de cada nota: re, la, fa#, do# y mi. */
const ACORDE: readonly (readonly [number, number])[] = [
  [146.83, 1],
  [220.0, 0.8],
  [369.99, 0.55],
  [554.37, 0.35],
  [659.25, 0.25],
]
/** Pentatónica de re (Hz, en la cuarta octava): re, mi, fa#, la, si. */
const PENTATONICA = [293.66, 329.63, 369.99, 440.0, 493.88] as const

const azar = (a: number, b: number): number => a + Math.random() * (b - a)
const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)]

type Clave = keyof Capas

export class PaisajeSonoro {
  private readonly ctx: BaseAudioContext
  private readonly total: GainNode
  private readonly capas: Record<Clave, GainNode>
  private readonly continuas: AudioScheduledSourceNode[] = []
  private readonly objetivos: Capas = { ...SIN_CAPAS }
  private readonly proxima = { estrella: 0, pajaro: 0, campanita: 0 }

  constructor(ctx: BaseAudioContext, destino: AudioNode) {
    this.ctx = ctx
    this.total = ctx.createGain()
    this.total.connect(destino)

    // Un eco suave (un retardo con realimentación filtrada) para que las campanitas y los pájaros
    // suenen en un sitio abierto.
    const eco = ctx.createGain()
    const retardo = ctx.createDelay(1)
    retardo.delayTime.value = 0.37
    const vuelta = ctx.createGain()
    vuelta.gain.value = 0.32
    const filtroEco = ctx.createBiquadFilter()
    filtroEco.type = 'lowpass'
    filtroEco.frequency.value = 2600
    const salidaEco = ctx.createGain()
    salidaEco.gain.value = 0.45
    eco.connect(retardo)
    retardo.connect(filtroEco)
    filtroEco.connect(vuelta)
    vuelta.connect(retardo)
    filtroEco.connect(salidaEco)
    salidaEco.connect(this.total)

    const capa = (envioEco: number): GainNode => {
      const ganancia = ctx.createGain()
      ganancia.gain.value = 0
      ganancia.connect(this.total)
      if (envioEco > 0) {
        const envio = ctx.createGain()
        envio.gain.value = envioEco
        ganancia.connect(envio)
        envio.connect(eco)
      }
      return ganancia
    }
    this.capas = { colchon: capa(0), estrellas: capa(0.55), viento: capa(0), pajaros: capa(0.25), campanitas: capa(0.6) }

    this.crearColchon()
    this.crearViento()
  }

  /** Un oscilador que dura todo el paisaje. */
  private continuo(frecuencia: number, tipo: OscillatorType = 'sine'): OscillatorNode {
    const osc = this.ctx.createOscillator()
    osc.type = tipo
    osc.frequency.value = frecuencia
    osc.start()
    this.continuas.push(osc)
    return osc
  }

  /** Una modulación lenta (de `profundidad`) sobre un parámetro. */
  private modular(parametro: AudioParam, frecuencia: number, profundidad: number): void {
    const lfo = this.continuo(frecuencia)
    const ganancia = this.ctx.createGain()
    ganancia.gain.value = profundidad
    lfo.connect(ganancia)
    ganancia.connect(parametro)
  }

  private crearColchon(): void {
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 1300
    filtro.Q.value = 0.3
    filtro.connect(this.capas.colchon)
    this.modular(filtro.frequency, 0.021, 450)
    ACORDE.forEach(([frecuencia, peso], i) => {
      const voz = this.ctx.createGain()
      const base = NIVEL.colchon * peso
      voz.gain.value = base * 0.7
      // Cada nota respira a su ritmo (entre 0,4 y 1 de su volumen).
      this.modular(voz.gain, 0.045 + i * 0.013, base * 0.3)
      // Dos osciladores apenas desafinados: un batido lento, cálido.
      for (const desafino of [-0.2, 0.2]) this.continuo(frecuencia + desafino).connect(voz)
      voz.connect(filtro)
    })
  }

  private crearViento(): void {
    const ctx = this.ctx
    const ruido = ctx.createBuffer(2, Math.round(ctx.sampleRate * 4), ctx.sampleRate)
    for (let canal = 0; canal < 2; canal += 1) {
      const datos = ruido.getChannelData(canal)
      for (let i = 0; i < datos.length; i += 1) datos[i] = Math.random() * 2 - 1
    }
    const fuente = ctx.createBufferSource()
    fuente.buffer = ruido
    fuente.loop = true
    const banda = ctx.createBiquadFilter()
    banda.type = 'bandpass'
    banda.frequency.value = 520
    banda.Q.value = 0.55
    this.modular(banda.frequency, 0.07, 220)
    const grave = ctx.createBiquadFilter()
    grave.type = 'lowpass'
    grave.frequency.value = 1400
    // Las ráfagas: el volumen va y viene con dos ritmos lentos que no coinciden.
    const rafaga = ctx.createGain()
    rafaga.gain.value = NIVEL.viento * 0.55
    this.modular(rafaga.gain, 0.11, NIVEL.viento * 0.22)
    this.modular(rafaga.gain, 0.043, NIVEL.viento * 0.2)
    fuente.connect(banda)
    banda.connect(grave)
    grave.connect(rafaga)
    rafaga.connect(this.capas.viento)
    fuente.start()
    this.continuas.push(fuente)
  }

  /** Una campanita: fundamental y dos parciales suaves, ataque corto y una cola larga. */
  private campana(t: number, frecuencia: number, destino: AudioNode, pico: number, cola: number, pan: number): void {
    const ctx = this.ctx
    const envolvente = ctx.createGain()
    envolvente.gain.setValueAtTime(0, t)
    envolvente.gain.linearRampToValueAtTime(pico, t + 0.006)
    envolvente.gain.setTargetAtTime(0, t + 0.006, cola)
    const paneo = ctx.createStereoPanner()
    paneo.pan.value = pan
    envolvente.connect(paneo)
    paneo.connect(destino)
    const fin = t + 0.006 + cola * 7
    for (const [multiplo, amplitud] of [
      [1, 1],
      [2, 0.16],
      [3.01, 0.05],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.frequency.value = frecuencia * multiplo
      const ganancia = ctx.createGain()
      ganancia.gain.value = amplitud
      osc.connect(ganancia)
      ganancia.connect(envolvente)
      osc.start(t)
      osc.stop(fin)
    }
  }

  /** Estrellas: una nota aguda de caja de música y, a veces, otra justo encima. */
  private estrella(t: number): void {
    const octava = elegir([4, 4, 8])
    const indice = Math.floor(Math.random() * PENTATONICA.length)
    const pan = azar(-0.65, 0.65)
    this.campana(t, PENTATONICA[indice] * octava, this.capas.estrellas, NIVEL.estrellas, azar(0.45, 0.9), pan)
    if (Math.random() < 0.3) {
      const siguiente = indice + 1 < PENTATONICA.length ? PENTATONICA[indice + 1] * octava : PENTATONICA[0] * octava * 2
      this.campana(t + azar(0.16, 0.24), siguiente, this.capas.estrellas, NIVEL.estrellas * 0.8, azar(0.45, 0.8), pan + azar(-0.15, 0.15))
    }
  }

  /** Campanitas de viento: dos o tres notas más graves, en cascada, como si las moviera la brisa. */
  private campanitas(t: number): void {
    const notas = 2 + Math.floor(Math.random() * 2)
    let indice = Math.floor(Math.random() * PENTATONICA.length)
    let instante = t
    for (let k = 0; k < notas; k += 1) {
      this.campana(instante, PENTATONICA[indice] * 2, this.capas.campanitas, NIVEL.campanitas * azar(0.7, 1), azar(0.9, 1.6), azar(-0.5, 0.5))
      indice = (indice + 1 + Math.floor(Math.random() * 2)) % PENTATONICA.length
      instante += azar(0.11, 0.2)
    }
  }

  /** Una nota de pájaro: un seno que se desliza de `f0` a `f1`, con ataque y caída cortos. */
  private nota(t: number, f0: number, f1: number, duracion: number, pan: number, pico: number, vibrato = 0): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + duracion)
    if (vibrato > 0) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 26
      const profundidad = ctx.createGain()
      profundidad.gain.value = vibrato
      lfo.connect(profundidad)
      profundidad.connect(osc.frequency)
      lfo.start(t)
      lfo.stop(t + duracion + 0.02)
    }
    const envolvente = ctx.createGain()
    envolvente.gain.setValueAtTime(0, t)
    envolvente.gain.linearRampToValueAtTime(pico, t + Math.min(0.012, duracion * 0.3))
    envolvente.gain.setValueAtTime(pico, t + duracion * 0.7)
    envolvente.gain.linearRampToValueAtTime(0, t + duracion)
    const paneo = ctx.createStereoPanner()
    paneo.pan.value = pan
    osc.connect(envolvente)
    envolvente.connect(paneo)
    paneo.connect(this.capas.pajaros)
    osc.start(t)
    osc.stop(t + duracion + 0.02)
  }

  /** Un pajarito: silbido, trino o gorjeo. Devuelve cuándo acaba. */
  private pajaro(t: number, pan: number): number {
    const pico = NIVEL.pajaros * azar(0.6, 1)
    const tipo = Math.random()
    let instante = t
    if (tipo < 0.45) {
      // Silbido: dos o tres notas que suben.
      const base = azar(2600, 3300)
      const notas = 2 + Math.floor(Math.random() * 2)
      for (let k = 0; k < notas; k += 1) {
        const duracion = azar(0.09, 0.13)
        const ultima = k === notas - 1
        this.nota(instante, base, ultima && Math.random() < 0.5 ? base * 0.85 : base * 1.22, duracion, pan, pico)
        instante += duracion + azar(0.06, 0.1)
      }
    } else if (tipo < 0.75) {
      // Trino: muchas notas cortitas.
      const base = azar(4200, 5000)
      const notas = 6 + Math.floor(Math.random() * 5)
      for (let k = 0; k < notas; k += 1) {
        const f = k % 2 === 0 ? base : base * 1.06
        this.nota(instante, f, f * 0.97, 0.035, pan, pico * 0.8)
        instante += 0.055
      }
    } else {
      // Gorjeo: una nota larga que baja, con un temblor.
      const duracion = azar(0.24, 0.32)
      this.nota(instante, azar(4000, 4500), azar(2600, 2900), duracion, pan, pico, 140)
      instante += duracion
    }
    return instante
  }

  /** Las capas a las que se va (0–1), en unos `segundos` (constante de tiempo). */
  fijar(capas: Capas, segundos = 1.5): void {
    const ahora = this.ctx.currentTime
    for (const clave of Object.keys(capas) as Clave[]) {
      if (Math.abs(capas[clave] - this.objetivos[clave]) < 0.005) continue
      this.objetivos[clave] = capas[clave]
      this.capas[clave].gain.setTargetAtTime(capas[clave], ahora, segundos)
    }
  }

  /** Programa las campanitas y los pájaros que tocan hasta `hasta` (s del reloj del audio). */
  programar(hasta: number): void {
    const ahora = this.ctx.currentTime
    // Si se quedó atrás (la pestaña estuvo oculta), no se amontonan: se sigue desde ahora.
    if (this.proxima.estrella < ahora - 1) this.proxima.estrella = ahora + azar(0.3, 1.5)
    if (this.proxima.pajaro < ahora - 1) this.proxima.pajaro = ahora + azar(0.5, 2.5)
    if (this.proxima.campanita < ahora - 1) this.proxima.campanita = ahora + azar(1, 4)
    while (this.proxima.estrella < hasta) {
      if (this.objetivos.estrellas > 0.02) this.estrella(this.proxima.estrella)
      this.proxima.estrella += azar(1.6, 4.2)
    }
    while (this.proxima.pajaro < hasta) {
      let siguiente = this.proxima.pajaro + azar(2.5, 7)
      if (this.objetivos.pajaros > 0.02) {
        const pan = azar(-0.8, 0.8)
        const fin = this.pajaro(this.proxima.pajaro, pan)
        // A veces otro le contesta, desde el otro lado.
        if (Math.random() < 0.35) siguiente = Math.max(siguiente, this.pajaro(fin + azar(0.6, 1.3), -pan) + 1)
      }
      this.proxima.pajaro = siguiente
    }
    while (this.proxima.campanita < hasta) {
      if (this.objetivos.campanitas > 0.02) this.campanitas(this.proxima.campanita)
      this.proxima.campanita += azar(6, 12)
    }
  }

  /** Las capas a las que va ahora (para las pruebas). */
  capasActuales(): Capas {
    return { ...this.objetivos }
  }

  detener(): void {
    for (const fuente of this.continuas) fuente.stop()
    this.total.disconnect()
  }
}

/**
 * Para escucharlo aparte (en desarrollo): `segundos` de una escena, ya mezclados, en un WAV (16 bits,
 * estéreo).
 */
export async function renderizarAmbiente(capas: Capas, segundos: number): Promise<Blob> {
  const frecuencia = 44100
  const ctx = new OfflineAudioContext(2, Math.round(frecuencia * segundos), frecuencia)
  const paisaje = new PaisajeSonoro(ctx, ctx.destination)
  paisaje.fijar(capas, 0.01)
  paisaje.programar(segundos)
  const audio = await ctx.startRendering()
  const muestras = audio.length
  const datos = new DataView(new ArrayBuffer(44 + muestras * 4))
  const texto = (posicion: number, cadena: string): void => {
    for (let i = 0; i < cadena.length; i += 1) datos.setUint8(posicion + i, cadena.charCodeAt(i))
  }
  texto(0, 'RIFF')
  datos.setUint32(4, 36 + muestras * 4, true)
  texto(8, 'WAVEfmt ')
  datos.setUint32(16, 16, true)
  datos.setUint16(20, 1, true)
  datos.setUint16(22, 2, true)
  datos.setUint32(24, frecuencia, true)
  datos.setUint32(28, frecuencia * 4, true)
  datos.setUint16(32, 4, true)
  datos.setUint16(34, 16, true)
  texto(36, 'data')
  datos.setUint32(40, muestras * 4, true)
  const izquierda = audio.getChannelData(0)
  const derecha = audio.getChannelData(1)
  for (let i = 0; i < muestras; i += 1) {
    datos.setInt16(44 + i * 4, Math.max(-1, Math.min(1, izquierda[i])) * 0x7fff, true)
    datos.setInt16(46 + i * 4, Math.max(-1, Math.min(1, derecha[i])) * 0x7fff, true)
  }
  return new Blob([datos.buffer], { type: 'audio/wav' })
}
