import { distanciaCorazon } from '../utils/corazon'

/**
 * Pasear por el corazón de flores al final del viaje (lo pidió el usuario: moverse por dentro del
 * corazón y sólo por ahí). Con la cámara posada se anda con las flechas o WASD (con Mayúsculas, más
 * deprisa) o tocando el suelo (clic o toque) para ir hasta ahí; arrastrar gira la cabeza del todo.
 * Nunca se sale del corazón: si un paso lo sacaría, se desliza por su borde. Al alejarse de donde se
 * posó, la cámara se alza a la altura de paseo (agachada entre las flores, cada paso las atravesaba).
 * Vuelve a la pose final con un doble clic o al subir con el scroll. Lo llenan los manejadores de
 * `hooks/usePaseo.ts` y lo aplica `EscenaCochabamba`.
 */
export const PASEO = {
  /** Se puede pasear: la cámara está posada al final del viaje. */
  activo: false,
  /** Desplazamiento (m, x y z del valle) desde la pose final y velocidad (m/s). */
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  /** Lo que piden las teclas: adelante (+1) o atrás (−1), a la derecha (+1) o a la izquierda (−1), y correr. */
  adelante: 0,
  lado: 0,
  correr: false,
  /** Destino de un clic en el suelo (desplazamiento desde la pose final, m), si lo hay. */
  destino: null as { x: number; z: number } | null,
  /** Un clic o toque que aún no se ha convertido en destino (coordenadas normalizadas de pantalla). */
  clic: null as { x: number; y: number } | null,
  /** Doble clic: vuelta a la pose final. */
  volver: false,
}

export const RITMO_PASEO = {
  /** Velocidades (m/s) andando y corriendo y ritmo (1/s) con que se alcanzan. */
  andar: 1.6,
  correr: 4,
  aceleracion: 7,
  /** Hacia un destino: rapidez por metro que falta (1/s), con tope (m/s). */
  alDestino: 1.5,
  maximaAlDestino: 6,
  /** Cuánto se queda uno dentro del borde del corazón (m): en el ribete de gipsófila. */
  margen: 0.9,
  /**
   * Altura de los ojos paseando (m), a qué distancia de la pose final (m) se alcanza y cuánto baja
   * entonces la mirada (rad): de pie y mirando al frente, las flores eran una franja al pie del cielo.
   */
  altura: 1.05,
  subida: 1.5,
  bajarMirada: 0.24,
  /** Vuelta a la pose final (1/s). */
  vuelta: 2.5,
} as const

const H = 0.05

/** Mete (x, z) (m del valle) en el corazón, a `margen` de su borde: lo lleva por el gradiente de la distancia. */
export const dentroDelCorazon = (x: number, z: number, margen: number = RITMO_PASEO.margen): [number, number] => {
  let px = x
  let pz = z
  for (let i = 0; i < 4; i += 1) {
    const fuera = distanciaCorazon(px, pz) + margen
    if (fuera <= 0) break
    const gx = distanciaCorazon(px + H, pz) - distanciaCorazon(px - H, pz)
    const gz = distanciaCorazon(px, pz + H) - distanciaCorazon(px, pz - H)
    const largo = Math.hypot(gx, gz) || 1
    px -= (gx / largo) * (fuera + 1e-3)
    pz -= (gz / largo) * (fuera + 1e-3)
  }
  return [px, pz]
}

/**
 * Un fotograma del paseo. `posado`: la cámara está en la pose final; `rumbo`: hacia dónde mira en
 * horizontal (rad, del eje +z hacia +x); (`inicioX`, `inicioZ`): la pose final. Mueve el
 * desplazamiento de `PASEO` (dentro del corazón) y devuelve cuánto se alzan los ojos (0..1).
 */
export function avanzarPaseo(paso: number, posado: boolean, rumbo: number, inicioX: number, inicioZ: number): number {
  const paseo = PASEO
  paseo.activo = posado
  if (!posado || paseo.volver) {
    // De vuelta a la pose final (al subir con el scroll o tras un doble clic).
    const k = Math.exp(-paso * RITMO_PASEO.vuelta)
    paseo.x *= k
    paseo.z *= k
    paseo.vx = 0
    paseo.vz = 0
    paseo.destino = null
    paseo.clic = null
    if (Math.hypot(paseo.x, paseo.z) < 0.01) {
      paseo.x = 0
      paseo.z = 0
      paseo.volver = false
    }
  } else {
    let objetivoX = 0
    let objetivoZ = 0
    if (paseo.adelante !== 0 || paseo.lado !== 0) {
      // Las teclas mandan: adelante es hacia donde se mira.
      paseo.destino = null
      const adelanteX = Math.sin(rumbo)
      const adelanteZ = Math.cos(rumbo)
      let dx = adelanteX * paseo.adelante - adelanteZ * paseo.lado
      let dz = adelanteZ * paseo.adelante + adelanteX * paseo.lado
      const largo = Math.hypot(dx, dz)
      if (largo > 1) {
        dx /= largo
        dz /= largo
      }
      const rapidez = paseo.correr ? RITMO_PASEO.correr : RITMO_PASEO.andar
      objetivoX = dx * rapidez
      objetivoZ = dz * rapidez
    } else if (paseo.destino) {
      const ex = paseo.destino.x - paseo.x
      const ez = paseo.destino.z - paseo.z
      const falta = Math.hypot(ex, ez)
      if (falta < 0.02) {
        paseo.destino = null
      } else {
        const rapidez = Math.min(RITMO_PASEO.maximaAlDestino, falta * RITMO_PASEO.alDestino)
        objetivoX = (ex / falta) * rapidez
        objetivoZ = (ez / falta) * rapidez
      }
    }
    const k = 1 - Math.exp(-paso * RITMO_PASEO.aceleracion)
    paseo.vx += (objetivoX - paseo.vx) * k
    paseo.vz += (objetivoZ - paseo.vz) * k
    const [x, z] = dentroDelCorazon(inicioX + paseo.x + paseo.vx * paso, inicioZ + paseo.z + paseo.vz * paso)
    paseo.x = x - inicioX
    paseo.z = z - inicioZ
  }
  const lejos = Math.min(1, Math.hypot(paseo.x, paseo.z) / RITMO_PASEO.subida)
  return lejos * lejos * (3 - 2 * lejos)
}

/** Sin valle a la vista: fuera de la pose final, sin paseo ni mandos (las flechas vuelven a desplazar la página). */
export function reiniciarPaseo(): void {
  Object.assign(PASEO, { activo: false, x: 0, z: 0, vx: 0, vz: 0, destino: null, clic: null, volver: false })
}

/** Un clic en el suelo en (x, z) del valle: el destino, dentro del corazón. */
export function irA(x: number, z: number, inicioX: number, inicioZ: number): void {
  const [dx, dz] = dentroDelCorazon(x, z)
  PASEO.destino = { x: dx - inicioX, z: dz - inicioZ }
}
