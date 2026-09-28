import * as THREE from 'three'

/**
 * Estrellas del cuadro: direcciones fijas en la esfera celeste con un radio pintado (fracción de
 * la altura de la pantalla, el mismo a cualquier distancia: están en el infinito) y un brillo. La
 * mayoría pequeñas y unas pocas grandes, como en La noche estrellada (once estrellas y la luna en
 * un cielo que ocupa dos tercios del lienzo).
 */
export interface EstrellaPintada {
  readonly direccion: THREE.Vector3
  readonly radio: number
  readonly brillo: number
  readonly fase: number
}

export const ESTRELLAS_PINTADAS = {
  cantidad: 150,
  maximoVisibles: 16,
  radioMinimo: 0.022,
  radioMaximo: 0.07,
  /** Radio del mundo alrededor del agujero (unidades) donde no se pintan estrellas: disco y halo. */
  exclusionAgujero: 14,
} as const

const generador = (semilla: number) => {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const generarEstrellasPintadas = (semilla = 1889): EstrellaPintada[] => {
  const azar = generador(semilla)
  return Array.from({ length: ESTRELLAS_PINTADAS.cantidad }, () => {
    const z = 2 * azar() - 1
    const phi = 2 * Math.PI * azar()
    const r = Math.sqrt(1 - z * z)
    const tamano = Math.pow(azar(), 2.2)
    return {
      direccion: new THREE.Vector3(r * Math.cos(phi), z, r * Math.sin(phi)),
      radio: ESTRELLAS_PINTADAS.radioMinimo + (ESTRELLAS_PINTADAS.radioMaximo - ESTRELLAS_PINTADAS.radioMinimo) * tamano,
      brillo: 0.75 + 0.25 * azar(),
      fase: 2 * Math.PI * azar(),
    }
  })
}

const punto = new THREE.Vector3()
const haciaAgujero = new THREE.Vector3()
const adelante = new THREE.Vector3()

/**
 * Proyecta las estrellas con la cámara y rellena `destino` (vec4: uv, radio, brillo) con las
 * visibles, las más grandes primero. Devuelve cuántas hay. Las que caen sobre el agujero, su
 * disco o su halo se apagan (sólo con la cámara fuera del horizonte).
 */
export const proyectarEstrellas = (
  estrellas: readonly EstrellaPintada[],
  camara: THREE.Camera,
  tiempo: number,
  aspecto: number,
  destino: THREE.Vector4[],
): number => {
  camara.getWorldDirection(adelante)
  const distanciaAgujero = camara.position.length()
  haciaAgujero.copy(camara.position).multiplyScalar(-1 / Math.max(distanciaAgujero, 1e-6))
  const exclusion = distanciaAgujero > 1.2 ? Math.atan(ESTRELLAS_PINTADAS.exclusionAgujero / distanciaAgujero) : 0
  const candidatas: { x: number; y: number; radio: number; brillo: number }[] = []
  for (const e of estrellas) {
    if (e.direccion.dot(adelante) <= 0.05) continue
    if (exclusion > 0) {
      const angulo = Math.acos(Math.min(1, Math.max(-1, e.direccion.dot(haciaAgujero))))
      if (angulo < exclusion) continue
    }
    punto.copy(e.direccion).multiplyScalar(1000).add(camara.position).project(camara)
    const x = 0.5 + 0.5 * punto.x
    const y = 0.5 + 0.5 * punto.y
    const margen = e.radio * 1.4
    if (x < -margen / aspecto || x > 1 + margen / aspecto || y < -margen || y > 1 + margen) continue
    // Titileo lento: el halo respira un poco.
    const titileo = 1 + 0.05 * Math.sin(0.7 * tiempo + e.fase)
    candidatas.push({ x, y, radio: e.radio * titileo, brillo: e.brillo })
  }
  candidatas.sort((a, b) => b.radio - a.radio)
  const n = Math.min(candidatas.length, destino.length)
  for (let i = 0; i < n; i++) destino[i].set(candidatas[i].x, candidatas[i].y, candidatas[i].radio, candidatas[i].brillo)
  return n
}
