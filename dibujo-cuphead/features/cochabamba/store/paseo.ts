import { distanciaCorazon } from '../utils/corazon'

/**
 * Pasear por el corazón de flores al final del viaje, con los mandos de un juego (lo pidió el
 * usuario: moverse sólo dentro del corazón, "con la lógica de control de los juegos" y, en el
 * móvil, con los controles a la vista):
 *
 * - Andar: la palanca de abajo a la izquierda (en el móvil sale donde se apoya el pulgar, en la
 *   mitad izquierda) o las teclas, siempre hacia donde se mira: W/S o ↑/↓ adelante y atrás, A/D de
 *   lado y ←/→ girando, como en los juegos clásicos; la palanca a fondo o las Mayúsculas, más
 *   deprisa. La velocidad acelera y frena con suavidad.
 * - Mirar: arrastrar en el resto de la pantalla, como en los juegos (a la derecha, se gira a la
 *   derecha; hacia arriba, se mira arriba), sin inercia.
 * - El corazón es el área de juego: contra su borde uno se desliza sin quedarse pegado (se quita la
 *   parte de la velocidad que empuja contra él).
 * - Al echar a andar la cámara se pone de pie (agachada entre las flores, cada paso las atravesaba);
 *   el botón de volver (o un doble clic) la lleva a donde se posó y la agacha; al subir con el scroll
 *   (o con el botón de subir) se vuelve al camino.
 *
 * Lo llenan `hooks/usePaseo.ts` (teclas y mirar) y `components/ControlesPaseo.tsx` (la palanca y los
 * botones); lo aplica `EscenaCochabamba`.
 */
export const PASEO = {
  /** Se puede pasear: la cámara está posada al final del viaje. */
  activo: false,
  /** Desplazamiento (m, x y z del valle) desde la pose final y velocidad (m/s). */
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  /** La cabeza, sobre la pose final: giro (rad, positivo a la izquierda) y cabeceo (rad, positivo arriba). */
  giro: 0,
  cabeceo: 0,
  /** De pie (0: agachada, como se posó; 1: de pie) y hacia dónde va. */
  dePie: 0,
  levantarse: false,
  /** La palanca: x a la derecha, y adelante (módulo ≤ 1). */
  palancaX: 0,
  palancaY: 0,
  /** Las teclas: adelante (+1) o atrás (−1), de lado a la derecha (+1) o a la izquierda (−1), girar (+1 a la derecha) y correr. */
  adelante: 0,
  lado: 0,
  girar: 0,
  correr: false,
  /** Ya se ha mirado alrededor alguna vez (se retira la pista de deslizar para mirar). */
  mirado: false,
  /** Vuelta a donde se posó (botón o doble clic). */
  volver: false,
}

export const RITMO_PASEO = {
  /** Velocidades (m/s) andando y corriendo; ritmos (1/s) con que se acelera y se frena. */
  andar: 1.4,
  correr: 2.9,
  acelerar: 8,
  frenar: 11,
  /** Zona muerta de la palanca y desde dónde (a fondo) corre. */
  zonaMuerta: 0.12,
  aFondo: 0.88,
  /** Cuánto se queda uno dentro del borde del corazón (m): en el ribete de gipsófila. */
  margen: 0.9,
  /** Giro con las teclas (rad/s). */
  girar: 1.7,
  /** Altura de los ojos de pie (m), ritmo (1/s) con que se levanta y cuánto baja la mirada de pie (rad). */
  altura: 1.15,
  levantarse: 2.6,
  bajarMirada: 0.2,
  /** Vuelta a donde se posó (1/s). */
  vuelta: 2.2,
} as const

const H = 0.05

/** Normal hacia fuera del borde del corazón en (x, z) (el gradiente de su distancia). */
const normalCorazon = (x: number, z: number): [number, number] => {
  const gx = distanciaCorazon(x + H, z) - distanciaCorazon(x - H, z)
  const gz = distanciaCorazon(x, z + H) - distanciaCorazon(x, z - H)
  const largo = Math.hypot(gx, gz) || 1
  return [gx / largo, gz / largo]
}

/** Mete (x, z) (m del valle) en el corazón, a `margen` de su borde, por el gradiente de la distancia. */
export const dentroDelCorazon = (x: number, z: number, margen: number = RITMO_PASEO.margen): [number, number] => {
  let px = x
  let pz = z
  for (let i = 0; i < 4; i += 1) {
    const fuera = distanciaCorazon(px, pz) + margen
    if (fuera <= 0) break
    const [nx, nz] = normalCorazon(px, pz)
    px -= nx * (fuera + 1e-3)
    pz -= nz * (fuera + 1e-3)
  }
  return [px, pz]
}

const oyentes = new Set<() => void>()

/** Para la interfaz: aviso cuando se puede (o se deja de poder) pasear. */
export function suscribirPaseo(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export const paseoActivo = (): boolean => PASEO.activo
export const paseoMirado = (): boolean => PASEO.mirado

const avisar = (): void => {
  for (const oyente of oyentes) oyente()
}

const marcarActivo = (activo: boolean): void => {
  if (PASEO.activo === activo) return
  PASEO.activo = activo
  avisar()
}

/** Primera vez que se mira alrededor arrastrando: se retira la pista. */
export function marcarMirado(): void {
  if (PASEO.mirado) return
  PASEO.mirado = true
  avisar()
}

const suave = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * Un fotograma del paseo. `posado`: la cámara está en la pose final; `rumbo`: hacia dónde mira en
 * horizontal (rad, del eje +z hacia +x, con el giro de la cabeza); (`inicioX`, `inicioZ`): la pose
 * final. Mueve `PASEO` (dentro del corazón) y lo levanta o lo agacha.
 */
export function avanzarPaseo(paso: number, posado: boolean, rumbo: number, inicioX: number, inicioZ: number): void {
  const paseo = PASEO
  marcarActivo(posado)
  if (!posado || paseo.volver) {
    // De vuelta a donde se posó (y, sin posar, al camino): el desplazamiento, la cabeza (por el
    // camino más corto) y la altura vuelven a cero.
    const k = Math.exp(-paso * RITMO_PASEO.vuelta)
    paseo.giro = Math.atan2(Math.sin(paseo.giro), Math.cos(paseo.giro)) * k
    paseo.cabeceo *= k
    paseo.x *= k
    paseo.z *= k
    paseo.vx = 0
    paseo.vz = 0
    paseo.dePie *= k
    paseo.levantarse = false
    if (Math.hypot(paseo.x, paseo.z) + Math.abs(paseo.giro) + Math.abs(paseo.cabeceo) + paseo.dePie < 0.01) {
      Object.assign(paseo, { x: 0, z: 0, giro: 0, cabeceo: 0, dePie: 0, volver: false })
    }
    return
  }

  // Girar con las teclas (← →).
  paseo.giro -= paseo.girar * RITMO_PASEO.girar * paso

  // Lo que se pide: la palanca (analógica) si se usa; si no, las teclas.
  let entradaX = 0
  let entradaY = 0
  let rapidez = 0
  const palanca = Math.hypot(paseo.palancaX, paseo.palancaY)
  if (palanca > RITMO_PASEO.zonaMuerta) {
    const fuerza = Math.min(1, (palanca - RITMO_PASEO.zonaMuerta) / (RITMO_PASEO.aFondo - RITMO_PASEO.zonaMuerta))
    entradaX = paseo.palancaX / palanca
    entradaY = paseo.palancaY / palanca
    const aFondo = suave((palanca - RITMO_PASEO.aFondo) / (1 - RITMO_PASEO.aFondo))
    rapidez = RITMO_PASEO.andar * fuerza + (RITMO_PASEO.correr - RITMO_PASEO.andar) * aFondo
  } else if (paseo.adelante !== 0 || paseo.lado !== 0) {
    const largo = Math.hypot(paseo.adelante, paseo.lado)
    entradaX = paseo.lado / largo
    entradaY = paseo.adelante / largo
    rapidez = paseo.correr ? RITMO_PASEO.correr : RITMO_PASEO.andar
  }
  if (rapidez > 0 || paseo.girar !== 0) paseo.levantarse = true

  // Hacia donde se mira: adelante (sen, cos) del rumbo y, a la derecha, (−cos, sen).
  const adelanteX = Math.sin(rumbo)
  const adelanteZ = Math.cos(rumbo)
  const objetivoX = (adelanteX * entradaY - adelanteZ * entradaX) * rapidez
  const objetivoZ = (adelanteZ * entradaY + adelanteX * entradaX) * rapidez
  const k = 1 - Math.exp(-paso * (rapidez > 0 ? RITMO_PASEO.acelerar : RITMO_PASEO.frenar))
  paseo.vx += (objetivoX - paseo.vx) * k
  paseo.vz += (objetivoZ - paseo.vz) * k

  // El paso y el borde del corazón: se desliza por él sin quedarse pegado.
  let x = inicioX + paseo.x + paseo.vx * paso
  let z = inicioZ + paseo.z + paseo.vz * paso
  if (distanciaCorazon(x, z) + RITMO_PASEO.margen > 0) {
    ;[x, z] = dentroDelCorazon(x, z)
    const [nx, nz] = normalCorazon(x, z)
    const contra = paseo.vx * nx + paseo.vz * nz
    if (contra > 0) {
      paseo.vx -= nx * contra
      paseo.vz -= nz * contra
    }
  }
  paseo.x = x - inicioX
  paseo.z = z - inicioZ

  // De pie al echar a andar (y así se queda).
  const objetivo = paseo.levantarse ? 1 : 0
  paseo.dePie += (objetivo - paseo.dePie) * (1 - Math.exp(-paso * RITMO_PASEO.levantarse))
}

/** Cuánto está de pie, suavizado (0..1). */
export const alturaPaseo = (): number => suave(PASEO.dePie)

/** Sin valle a la vista: sin paseo ni mandos (las flechas vuelven a desplazar la página). */
export function reiniciarPaseo(): void {
  Object.assign(PASEO, { x: 0, z: 0, vx: 0, vz: 0, giro: 0, cabeceo: 0, dePie: 0, levantarse: false, palancaX: 0, palancaY: 0, volver: false })
  marcarActivo(false)
}
